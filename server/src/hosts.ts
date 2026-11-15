import { randomUUID } from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { assertDomainsAvailable } from './domains.js'
import { getDb, withImmediateTransaction } from './db.js'
import { renderHostYaml, removeHostYaml } from './traefik/render.js'
import {
  assertCertResolver,
  assertHostnames,
  assertUpstreamHost,
  isGoDuration,
} from './traefik/rules.js'

const pathRewriteRule = z
  .object({
    regex: z.string().min(1).max(512),
    replacement: z.string().min(1).max(512),
  })
  .superRefine((rule, ctx) => {
    if (rule.regex.includes('`') || rule.replacement.includes('`')) {
      ctx.addIssue({ code: 'custom', message: 'path rewrite must not contain backticks', path: ['regex'] })
      return
    }
    try {
      // Sanity-check; Traefik uses Go RE2 — reject only clearly broken patterns.
      new RegExp(rule.regex)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'invalid path rewrite regex', path: ['regex'] })
    }
  })

export type PathRewriteRule = z.infer<typeof pathRewriteRule>

const upstreamSchema = z.object({
  scheme: z.enum(['http', 'https']).default('http'),
  host: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  weight: z.number().int().min(1).max(1000).optional().default(1),
})

export type UpstreamTarget = z.infer<typeof upstreamSchema>

const hostInput = z
  .object({
    domain_names: z.array(z.string().min(1)).min(1),
    // Preferred: one or more upstreams (weighted round-robin in Traefik).
    upstreams: z.array(upstreamSchema).max(16).optional(),
    // Legacy single-upstream fields (still accepted; converted to upstreams[0]).
    forward_scheme: z.enum(['http', 'https']).optional(),
    forward_host: z.string().min(1).optional(),
    forward_port: z.number().int().min(1).max(65535).optional(),
    health_check_enabled: z.boolean().optional().default(false),
    health_check_path: z.string().min(1).max(512).optional().default('/'),
    health_check_interval: z
      .string()
      .min(1)
      .max(16)
      .refine(isGoDuration, 'health_check_interval must be a Go duration (e.g. 10s, 30s, 1m)')
      .optional()
      .default('30s'),
    health_check_timeout: z
      .string()
      .min(1)
      .max(16)
      .refine(isGoDuration, 'health_check_timeout must be a Go duration (e.g. 3s, 5s)')
      .optional()
      .default('5s'),
    cert_resolver: z.string().optional().default(''),
    certificate_id: z.string().nullable().optional().default(null),
    ssl_forced: z.boolean().optional().default(true),
    enabled: z.boolean().optional().default(true),
    waf_profile_ids: z.array(z.string()).optional().default([]),
    header_rule_ids: z.array(z.string()).optional().default([]),
    access_list_id: z.string().nullable().optional().default(null),
    rate_limit_enabled: z.boolean().optional().default(false),
    rate_limit_average: z.number().int().min(1).max(1_000_000).optional().default(100),
    rate_limit_burst: z.number().int().min(1).max(1_000_000).optional().default(50),
    rate_limit_period: z
      .string()
      .min(1)
      .max(16)
      .refine(isGoDuration, 'rate_limit_period must be a Go duration (e.g. 1s, 1m, 1h)')
      .optional()
      .default('1m'),
    path_rewrites: z.array(pathRewriteRule).max(32).optional().default([]),
    advanced_yaml: z.string().optional().default(''),
  })
  .superRefine((input, ctx) => {
    const hasList = Array.isArray(input.upstreams) && input.upstreams.length > 0
    const hasLegacy = !!(input.forward_host && input.forward_port)
    if (!hasList && !hasLegacy) {
      ctx.addIssue({
        code: 'custom',
        message: 'at least one upstream is required (upstreams[] or forward_host/port)',
        path: ['upstreams'],
      })
    }
  })

export type HostInput = z.infer<typeof hostInput> & {
  upstreams: UpstreamTarget[]
  forward_scheme: 'http' | 'https'
  forward_host: string
  forward_port: number
}

export type ProxyHost = {
  id: string
  domain_names: string[]
  forward_scheme: string
  forward_host: string
  forward_port: number
  upstreams: UpstreamTarget[]
  health_check_enabled: boolean
  health_check_path: string
  health_check_interval: string
  health_check_timeout: string
  certificate_id: string | null
  cert_resolver: string
  ssl_forced: boolean
  enabled: boolean
  waf_profile_ids: string[]
  header_rule_ids: string[]
  access_list_id: string | null
  rate_limit_enabled: boolean
  rate_limit_average: number
  rate_limit_burst: number
  rate_limit_period: string
  path_rewrites: PathRewriteRule[]
  advanced_yaml: string
  extra_json: string
  created_at: string
  updated_at: string
}

type HostRow = {
  id: string
  domain_names: string
  forward_scheme: string
  forward_host: string
  forward_port: number
  upstreams: string
  health_check_enabled: number
  health_check_path: string
  health_check_interval: string
  health_check_timeout: string
  certificate_id: string | null
  cert_resolver: string
  ssl_forced: number
  enabled: number
  waf_profile_ids: string
  header_rule_ids: string
  access_list_id: string | null
  rate_limit_enabled: number
  rate_limit_average: number
  rate_limit_burst: number
  rate_limit_period: string
  path_rewrites: string
  advanced_yaml: string
  extra_json: string
  created_at: string
  updated_at: string
}

function parsePathRewrites(raw: string | undefined): PathRewriteRule[] {
  try {
    const parsed = JSON.parse(raw || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => {
        const r = pathRewriteRule.safeParse(item)
        return r.success ? r.data : null
      })
      .filter((x): x is PathRewriteRule => x !== null)
  } catch {
    return []
  }
}

function parseUpstreams(raw: string | undefined, fallback?: UpstreamTarget): UpstreamTarget[] {
  try {
    const parsed = JSON.parse(raw || '[]') as unknown
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .map((item) => {
          const r = upstreamSchema.safeParse(item)
          return r.success ? r.data : null
        })
        .filter((x): x is UpstreamTarget => x !== null)
    }
  } catch {
    /* fall through */
  }
  return fallback ? [fallback] : []
}

function normalizeUpstreams(input: z.infer<typeof hostInput>): UpstreamTarget[] {
  let list: UpstreamTarget[] =
    Array.isArray(input.upstreams) && input.upstreams.length > 0
      ? input.upstreams.map((u) => upstreamSchema.parse(u))
      : [
          upstreamSchema.parse({
            scheme: input.forward_scheme || 'http',
            host: input.forward_host!,
            port: input.forward_port!,
            weight: 1,
          }),
        ]

  list = list.map((u) => ({
    ...u,
    host: assertUpstreamHost(u.host),
    weight: u.weight ?? 1,
  }))

  if (list.length === 0) throw new Error('at least one upstream is required')
  if (list.length > 16) throw new Error('at most 16 upstreams per host')
  return list
}

function mapRow(row: HostRow): ProxyHost {
  const fallback: UpstreamTarget = {
    scheme: row.forward_scheme === 'https' ? 'https' : 'http',
    host: row.forward_host,
    port: Number(row.forward_port) || 80,
    weight: 1,
  }
  const upstreams = parseUpstreams(row.upstreams, fallback)
  const primary = upstreams[0] || fallback
  return {
    id: row.id,
    domain_names: JSON.parse(row.domain_names) as string[],
    forward_scheme: primary.scheme,
    forward_host: primary.host,
    forward_port: primary.port,
    upstreams,
    health_check_enabled: !!row.health_check_enabled,
    health_check_path: row.health_check_path || '/',
    health_check_interval: row.health_check_interval || '30s',
    health_check_timeout: row.health_check_timeout || '5s',
    certificate_id: row.certificate_id,
    cert_resolver: row.cert_resolver || '',
    ssl_forced: !!row.ssl_forced,
    enabled: !!row.enabled,
    waf_profile_ids: JSON.parse(row.waf_profile_ids || '[]') as string[],
    header_rule_ids: JSON.parse(row.header_rule_ids || '[]') as string[],
    access_list_id: row.access_list_id ?? null,
    rate_limit_enabled: !!row.rate_limit_enabled,
    rate_limit_average: Number(row.rate_limit_average ?? 100),
    rate_limit_burst: Number(row.rate_limit_burst ?? 50),
    rate_limit_period: row.rate_limit_period || '1m',
    path_rewrites: parsePathRewrites(row.path_rewrites),
    advanced_yaml: row.advanced_yaml || '',
    extra_json: row.extra_json || '{}',
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function parseHostInput(body: unknown): HostInput {
  const raw = hostInput.parse(body)
  raw.domain_names = assertHostnames(raw.domain_names)
  assertCertResolver(raw.cert_resolver || '')
  const upstreams = normalizeUpstreams(raw)
  const primary = upstreams[0]!

  const path = (raw.health_check_path || '/').trim() || '/'
  if (!path.startsWith('/') || path.includes('`') || path.includes('\n')) {
    throw new Error('health_check_path must be an absolute path (e.g. / or /health)')
  }

  const snip = (raw.advanced_yaml || '').trim()
  if (snip) {
    try {
      const parsed = parseYaml(snip)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('advanced_yaml must be a YAML mapping')
      }
      assertAdvancedYamlShape(parsed as Record<string, unknown>)
    } catch (err) {
      throw new Error(`invalid advanced_yaml: ${(err as Error).message}`)
    }
  }

  return {
    ...raw,
    upstreams,
    forward_scheme: primary.scheme,
    forward_host: primary.host,
    forward_port: primary.port,
    health_check_path: path,
  }
}

export function listHosts(): ProxyHost[] {
  const rows = getDb()
    .prepare(`SELECT * FROM proxy_hosts ORDER BY created_at DESC`)
    .all() as HostRow[]
  return rows.map(mapRow)
}

export function getHost(id: string): ProxyHost | null {
  const row = getDb().prepare(`SELECT * FROM proxy_hosts WHERE id = ?`).get(id) as HostRow | undefined
  return row ? mapRow(row) : null
}

function assertAdvancedYamlShape(parsed: Record<string, unknown>): void {
  const http = parsed.http
  if (!http || typeof http !== 'object' || Array.isArray(http)) return
  const routers = (http as Record<string, unknown>).routers
  if (!routers || typeof routers !== 'object' || Array.isArray(routers)) return
  for (const [name, router] of Object.entries(routers as Record<string, unknown>)) {
    if (!router || typeof router !== 'object' || Array.isArray(router)) {
      throw new Error(`router ${name} must be a mapping`)
    }
    const rule = (router as Record<string, unknown>).rule
    if (rule !== undefined && typeof rule !== 'string') {
      throw new Error(`router ${name}.rule must be a string`)
    }
  }
}

export function createHost(input: HostInput): ProxyHost {
  const id = randomUUID()
  const now = new Date().toISOString()
  withImmediateTransaction(() => {
    assertDomainsAvailable(input.domain_names)
    getDb()
      .prepare(
        `INSERT INTO proxy_hosts (
        id, domain_names, forward_scheme, forward_host, forward_port,
        upstreams, health_check_enabled, health_check_path, health_check_interval, health_check_timeout,
        certificate_id, cert_resolver, ssl_forced, enabled,
        waf_profile_ids, header_rule_ids, access_list_id,
        rate_limit_enabled, rate_limit_average, rate_limit_burst, rate_limit_period,
        path_rewrites, advanced_yaml, extra_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
      )
      .run(
        id,
        JSON.stringify(input.domain_names),
        input.forward_scheme,
        input.forward_host,
        input.forward_port,
        JSON.stringify(input.upstreams),
        input.health_check_enabled ? 1 : 0,
        input.health_check_path || '/',
        input.health_check_interval || '30s',
        input.health_check_timeout || '5s',
        input.certificate_id || null,
        input.cert_resolver || '',
        input.ssl_forced ? 1 : 0,
        input.enabled ? 1 : 0,
        JSON.stringify(input.waf_profile_ids || []),
        JSON.stringify(input.header_rule_ids || []),
        input.access_list_id || null,
        input.rate_limit_enabled ? 1 : 0,
        input.rate_limit_average ?? 100,
        input.rate_limit_burst ?? 50,
        input.rate_limit_period || '1m',
        JSON.stringify(input.path_rewrites || []),
        input.advanced_yaml || '',
        now,
        now,
      )
  })
  const host = getHost(id)!
  syncHostYaml(host)
  return host
}

export function updateHost(id: string, input: HostInput): ProxyHost | null {
  if (!getHost(id)) return null
  const now = new Date().toISOString()
  withImmediateTransaction(() => {
    assertDomainsAvailable(input.domain_names, { excludeTable: 'proxy_hosts', excludeId: id })
    getDb()
      .prepare(
        `UPDATE proxy_hosts SET
        domain_names = ?, forward_scheme = ?, forward_host = ?, forward_port = ?,
        upstreams = ?, health_check_enabled = ?, health_check_path = ?,
        health_check_interval = ?, health_check_timeout = ?,
        certificate_id = ?, cert_resolver = ?, ssl_forced = ?, enabled = ?,
        waf_profile_ids = ?, header_rule_ids = ?, access_list_id = ?,
        rate_limit_enabled = ?, rate_limit_average = ?, rate_limit_burst = ?, rate_limit_period = ?,
        path_rewrites = ?, advanced_yaml = ?, updated_at = ?
      WHERE id = ?`,
      )
      .run(
        JSON.stringify(input.domain_names),
        input.forward_scheme,
        input.forward_host,
        input.forward_port,
        JSON.stringify(input.upstreams),
        input.health_check_enabled ? 1 : 0,
        input.health_check_path || '/',
        input.health_check_interval || '30s',
        input.health_check_timeout || '5s',
        input.certificate_id || null,
        input.cert_resolver || '',
        input.ssl_forced ? 1 : 0,
        input.enabled ? 1 : 0,
        JSON.stringify(input.waf_profile_ids || []),
        JSON.stringify(input.header_rule_ids || []),
        input.access_list_id || null,
        input.rate_limit_enabled ? 1 : 0,
        input.rate_limit_average ?? 100,
        input.rate_limit_burst ?? 50,
        input.rate_limit_period || '1m',
        JSON.stringify(input.path_rewrites || []),
        input.advanced_yaml || '',
        now,
        id,
      )
  })
  const host = getHost(id)!
  syncHostYaml(host)
  return host
}

export function deleteHost(id: string): boolean {
  if (!getHost(id)) return false
  getDb().prepare(`DELETE FROM proxy_hosts WHERE id = ?`).run(id)
  removeHostYaml(id)
  return true
}

export function reRenderAllHosts(): void {
  for (const host of listHosts()) {
    syncHostYaml(host)
  }
}

function syncHostYaml(host: ProxyHost): void {
  if (!host.enabled) {
    removeHostYaml(host.id)
    return
  }
  renderHostYaml(host)
}
