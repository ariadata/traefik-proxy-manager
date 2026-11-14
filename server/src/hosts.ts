import { randomUUID } from 'node:crypto'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { assertDomainsAvailable } from './domains.js'
import { getDb } from './db.js'
import { renderHostYaml, removeHostYaml } from './traefik/render.js'
import { assertCertResolver, assertHostnames, isGoDuration } from './traefik/rules.js'

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

const hostInput = z.object({
  domain_names: z.array(z.string().min(1)).min(1),
  forward_scheme: z.enum(['http', 'https']).default('http'),
  forward_host: z.string().min(1),
  forward_port: z.number().int().min(1).max(65535),
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

export type HostInput = z.infer<typeof hostInput>

export type ProxyHost = {
  id: string
  domain_names: string[]
  forward_scheme: string
  forward_host: string
  forward_port: number
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

function mapRow(row: HostRow): ProxyHost {
  return {
    id: row.id,
    domain_names: JSON.parse(row.domain_names) as string[],
    forward_scheme: row.forward_scheme,
    forward_host: row.forward_host,
    forward_port: row.forward_port,
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
  const input = hostInput.parse(body)
  input.domain_names = assertHostnames(input.domain_names)
  assertCertResolver(input.cert_resolver || '')
  const snip = (input.advanced_yaml || '').trim()
  if (snip) {
    try {
      const parsed = parseYaml(snip)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('advanced_yaml must be a YAML mapping')
      }
    } catch (err) {
      throw new Error(`invalid advanced_yaml: ${(err as Error).message}`)
    }
  }
  return input
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

export function createHost(input: HostInput): ProxyHost {
  assertDomainsAvailable(input.domain_names)
  const id = randomUUID()
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO proxy_hosts (
        id, domain_names, forward_scheme, forward_host, forward_port,
        certificate_id, cert_resolver, ssl_forced, enabled,
        waf_profile_ids, header_rule_ids, access_list_id,
        rate_limit_enabled, rate_limit_average, rate_limit_burst, rate_limit_period,
        path_rewrites, advanced_yaml, extra_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)`,
    )
    .run(
      id,
      JSON.stringify(input.domain_names),
      input.forward_scheme,
      input.forward_host,
      input.forward_port,
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
  const host = getHost(id)!
  syncHostYaml(host)
  return host
}

export function updateHost(id: string, input: HostInput): ProxyHost | null {
  if (!getHost(id)) return null
  assertDomainsAvailable(input.domain_names, { excludeTable: 'proxy_hosts', excludeId: id })
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `UPDATE proxy_hosts SET
        domain_names = ?, forward_scheme = ?, forward_host = ?, forward_port = ?,
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
