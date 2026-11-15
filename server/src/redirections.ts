import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb, withImmediateTransaction } from './db.js'
import { assertDomainsAvailable } from './domains.js'
import { renderRedirectYaml, removeRedirectYaml } from './traefik/render-redirect.js'
import { assertCertResolver, assertHostnames } from './traefik/rules.js'

/** Hostname/IP only — reject schemes like javascript: / data: / URLs. */
function assertForwardHost(host: string): string {
  const h = host.trim()
  if (!h || /[\s/\\]/.test(h) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(h) || h.includes('`')) {
    throw new Error('forward_host must be a hostname or IP without scheme')
  }
  return h
}

const inputSchema = z.object({
  domain_names: z.array(z.string().min(1)).min(1),
  forward_scheme: z.enum(['http', 'https']).optional().default('https'),
  forward_host: z.string().min(1),
  forward_path: z.string().optional().default('/'),
  preserve_path: z.boolean().optional().default(true),
  status_code: z.union([z.literal(301), z.literal(302)]).optional().default(301),
  cert_resolver: z.string().optional().default(''),
  certificate_id: z.string().nullable().optional().default(null),
  ssl_forced: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
  access_list_id: z.string().nullable().optional().default(null),
})

export type RedirectionInput = z.infer<typeof inputSchema>

export type RedirectionHost = {
  id: string
  domain_names: string[]
  forward_scheme: string
  forward_host: string
  forward_path: string
  preserve_path: boolean
  status_code: number
  cert_resolver: string
  certificate_id: string | null
  ssl_forced: boolean
  enabled: boolean
  access_list_id: string | null
  created_at: string
  updated_at: string
}

type Row = {
  id: string
  domain_names: string
  forward_scheme: string
  forward_host: string
  forward_path: string
  preserve_path: number
  status_code: number
  cert_resolver: string
  certificate_id: string | null
  ssl_forced: number
  enabled: number
  access_list_id: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: Row): RedirectionHost {
  return {
    id: row.id,
    domain_names: JSON.parse(row.domain_names) as string[],
    forward_scheme: row.forward_scheme,
    forward_host: row.forward_host,
    forward_path: row.forward_path || '/',
    preserve_path: !!row.preserve_path,
    status_code: Number(row.status_code || 301),
    cert_resolver: row.cert_resolver || '',
    certificate_id: row.certificate_id,
    ssl_forced: !!row.ssl_forced,
    enabled: !!row.enabled,
    access_list_id: row.access_list_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function parseRedirectionInput(body: unknown): RedirectionInput {
  const input = inputSchema.parse(body)
  input.domain_names = assertHostnames(input.domain_names)
  input.forward_host = assertForwardHost(input.forward_host)
  assertCertResolver(input.cert_resolver || '')
  return input
}

export function listRedirections(): RedirectionHost[] {
  return (getDb().prepare(`SELECT * FROM redirection_hosts ORDER BY created_at DESC`).all() as Row[]).map(
    mapRow,
  )
}

export function getRedirection(id: string): RedirectionHost | null {
  const row = getDb().prepare(`SELECT * FROM redirection_hosts WHERE id = ?`).get(id) as Row | undefined
  return row ? mapRow(row) : null
}

function syncYaml(host: RedirectionHost): void {
  if (!host.enabled) {
    removeRedirectYaml(host.id)
    return
  }
  renderRedirectYaml(host)
}

export function createRedirection(input: RedirectionInput): RedirectionHost {
  const id = randomUUID()
  const now = new Date().toISOString()
  withImmediateTransaction(() => {
    assertDomainsAvailable(input.domain_names)
    getDb()
      .prepare(
        `INSERT INTO redirection_hosts (
        id, domain_names, forward_scheme, forward_host, forward_path, preserve_path,
        status_code, cert_resolver, certificate_id, ssl_forced, enabled, access_list_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        JSON.stringify(input.domain_names),
        input.forward_scheme,
        input.forward_host,
        input.forward_path || '/',
        input.preserve_path ? 1 : 0,
        input.status_code ?? 301,
        input.cert_resolver || '',
        input.certificate_id || null,
        input.ssl_forced ? 1 : 0,
        input.enabled ? 1 : 0,
        input.access_list_id || null,
        now,
        now,
      )
  })
  const host = getRedirection(id)!
  syncYaml(host)
  return host
}

export function updateRedirection(id: string, input: RedirectionInput): RedirectionHost | null {
  if (!getRedirection(id)) return null
  const now = new Date().toISOString()
  withImmediateTransaction(() => {
    assertDomainsAvailable(input.domain_names, { excludeTable: 'redirection_hosts', excludeId: id })
    getDb()
      .prepare(
        `UPDATE redirection_hosts SET
        domain_names=?, forward_scheme=?, forward_host=?, forward_path=?, preserve_path=?,
        status_code=?, cert_resolver=?, certificate_id=?, ssl_forced=?, enabled=?, access_list_id=?,
        updated_at=?
       WHERE id=?`,
      )
      .run(
        JSON.stringify(input.domain_names),
        input.forward_scheme,
        input.forward_host,
        input.forward_path || '/',
        input.preserve_path ? 1 : 0,
        input.status_code ?? 301,
        input.cert_resolver || '',
        input.certificate_id || null,
        input.ssl_forced ? 1 : 0,
        input.enabled ? 1 : 0,
        input.access_list_id || null,
        now,
        id,
      )
  })
  const host = getRedirection(id)!
  syncYaml(host)
  return host
}

export function deleteRedirection(id: string): boolean {
  if (!getRedirection(id)) return false
  getDb().prepare(`DELETE FROM redirection_hosts WHERE id = ?`).run(id)
  removeRedirectYaml(id)
  return true
}

export function reRenderAllRedirects(): void {
  for (const host of listRedirections()) {
    syncYaml(host)
  }
}
