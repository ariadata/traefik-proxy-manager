import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { assertDomainsAvailable } from './domains.js'
import { getDb } from './db.js'
import { renderDeadYaml, removeDeadYaml } from './traefik/render-dead.js'
import { assertCertResolver, assertHostnames } from './traefik/rules.js'

const inputSchema = z.object({
  domain_names: z.array(z.string().min(1)).min(1),
  status_code: z.number().int().min(200).max(599).optional().default(404),
  body_html: z.string().optional().default(''),
  cert_resolver: z.string().optional().default(''),
  certificate_id: z.string().nullable().optional().default(null),
  ssl_forced: z.boolean().optional().default(false),
  enabled: z.boolean().optional().default(true),
  access_list_id: z.string().nullable().optional().default(null),
})

export type DeadHostInput = z.infer<typeof inputSchema>

export type DeadHost = {
  id: string
  domain_names: string[]
  status_code: number
  body_html: string
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
  status_code: number
  body_html: string
  cert_resolver: string
  certificate_id: string | null
  ssl_forced: number
  enabled: number
  access_list_id: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: Row): DeadHost {
  return {
    id: row.id,
    domain_names: JSON.parse(row.domain_names) as string[],
    status_code: Number(row.status_code || 404),
    body_html: row.body_html || '',
    cert_resolver: row.cert_resolver || '',
    certificate_id: row.certificate_id,
    ssl_forced: !!row.ssl_forced,
    enabled: !!row.enabled,
    access_list_id: row.access_list_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function parseDeadHostInput(body: unknown): DeadHostInput {
  const input = inputSchema.parse(body)
  input.domain_names = assertHostnames(input.domain_names)
  assertCertResolver(input.cert_resolver || '')
  return input
}

export function listDeadHosts(): DeadHost[] {
  return (getDb().prepare(`SELECT * FROM dead_hosts ORDER BY created_at DESC`).all() as Row[]).map(mapRow)
}

export function getDeadHost(id: string): DeadHost | null {
  const row = getDb().prepare(`SELECT * FROM dead_hosts WHERE id = ?`).get(id) as Row | undefined
  return row ? mapRow(row) : null
}

function syncYaml(host: DeadHost): void {
  if (!host.enabled) {
    removeDeadYaml(host.id)
    return
  }
  renderDeadYaml(host)
}

export function createDeadHost(input: DeadHostInput): DeadHost {
  assertDomainsAvailable(input.domain_names)
  const id = randomUUID()
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO dead_hosts (
        id, domain_names, status_code, body_html, cert_resolver, certificate_id,
        ssl_forced, enabled, access_list_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      JSON.stringify(input.domain_names),
      input.status_code ?? 404,
      input.body_html || '',
      input.cert_resolver || '',
      input.certificate_id || null,
      input.ssl_forced ? 1 : 0,
      input.enabled ? 1 : 0,
      input.access_list_id || null,
      now,
      now,
    )
  const host = getDeadHost(id)!
  syncYaml(host)
  return host
}

export function updateDeadHost(id: string, input: DeadHostInput): DeadHost | null {
  if (!getDeadHost(id)) return null
  assertDomainsAvailable(input.domain_names, { excludeTable: 'dead_hosts', excludeId: id })
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `UPDATE dead_hosts SET
        domain_names=?, status_code=?, body_html=?, cert_resolver=?, certificate_id=?,
        ssl_forced=?, enabled=?, access_list_id=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      JSON.stringify(input.domain_names),
      input.status_code ?? 404,
      input.body_html || '',
      input.cert_resolver || '',
      input.certificate_id || null,
      input.ssl_forced ? 1 : 0,
      input.enabled ? 1 : 0,
      input.access_list_id || null,
      now,
      id,
    )
  const host = getDeadHost(id)!
  syncYaml(host)
  return host
}

export function deleteDeadHost(id: string): boolean {
  if (!getDeadHost(id)) return false
  getDb().prepare(`DELETE FROM dead_hosts WHERE id = ?`).run(id)
  removeDeadYaml(id)
  return true
}

export function reRenderAllDeadHosts(): void {
  for (const host of listDeadHosts()) {
    syncYaml(host)
  }
}

export function defaultDeadHtml(statusCode: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${statusCode}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:ui-sans-serif,system-ui,sans-serif;background:#0b1220;color:#e8eefc}
  main{text-align:center;padding:2rem}
  h1{font-size:3rem;margin:0 0 .5rem;letter-spacing:-.03em}
  p{margin:0;opacity:.7}
</style>
</head>
<body><main><h1>${statusCode}</h1><p>This domain is parked.</p></main></body>
</html>`
}
