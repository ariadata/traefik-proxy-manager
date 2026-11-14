import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb } from './db.js'
import { renderSharedMiddlewares } from './traefik/middlewares.js'
import { reRenderAllHosts } from './hosts.js'

const inputSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['request_add', 'request_remove', 'response_add', 'response_remove']),
  header_name: z.string().min(1),
  header_value: z.string().optional().default(''),
  enabled: z.boolean().optional().default(true),
})

export type HeaderInput = z.infer<typeof inputSchema>

export type HeaderRule = {
  id: string
  name: string
  type: string
  header_name: string
  header_value: string
  enabled: boolean
  created_at: string
  updated_at: string
}

type Row = {
  id: string
  name: string
  type: string
  header_name: string
  header_value: string
  enabled: number
  created_at: string
  updated_at: string
}

function mapRow(row: Row): HeaderRule {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    header_name: row.header_name,
    header_value: row.header_value,
    enabled: !!row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** RFC 7230 token — no spaces / CRLF injection. */
const HEADER_NAME_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const FORBIDDEN_HEADERS = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
  'te',
  'trailer',
  'keep-alive',
  'proxy-connection',
])

function assertHeaderName(name: string): string {
  const n = name.trim()
  if (!n || !HEADER_NAME_RE.test(n)) {
    throw new Error(`invalid header name: ${name}`)
  }
  if (FORBIDDEN_HEADERS.has(n.toLowerCase())) {
    throw new Error(`header name not allowed: ${name}`)
  }
  return n
}

function assertHeaderValue(value: string): string {
  if (/[\r\n\0]/.test(value)) {
    throw new Error('header value must not contain CR/LF/NUL')
  }
  return value
}

export function parseHeaderInput(body: unknown): HeaderInput {
  const input = inputSchema.parse(body)
  input.header_name = assertHeaderName(input.header_name)
  input.header_value = assertHeaderValue(input.header_value || '')
  return input
}

export function listHeaderRules(): HeaderRule[] {
  return (getDb().prepare(`SELECT * FROM header_rules ORDER BY name`).all() as Row[]).map(mapRow)
}

export function getHeaderRule(id: string): HeaderRule | null {
  const row = getDb().prepare(`SELECT * FROM header_rules WHERE id = ?`).get(id) as Row | undefined
  return row ? mapRow(row) : null
}

export function createHeaderRule(input: HeaderInput): HeaderRule {
  const id = randomUUID()
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO header_rules (id, name, type, header_name, header_value, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.name, input.type, input.header_name, input.header_value || '', input.enabled ? 1 : 0, now, now)
  renderSharedMiddlewares()
  reRenderAllHosts()
  return getHeaderRule(id)!
}

export function updateHeaderRule(id: string, input: HeaderInput): HeaderRule | null {
  if (!getHeaderRule(id)) return null
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `UPDATE header_rules SET name=?, type=?, header_name=?, header_value=?, enabled=?, updated_at=? WHERE id=?`,
    )
    .run(input.name, input.type, input.header_name, input.header_value || '', input.enabled ? 1 : 0, now, id)
  renderSharedMiddlewares()
  reRenderAllHosts()
  return getHeaderRule(id)
}

export function deleteHeaderRule(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM header_rules WHERE id = ?`).run(id)
  if (!info.changes) return false
  // strip from hosts
  const hosts = getDb().prepare(`SELECT id, header_rule_ids FROM proxy_hosts`).all() as {
    id: string
    header_rule_ids: string
  }[]
  for (const h of hosts) {
    const ids = (JSON.parse(h.header_rule_ids || '[]') as string[]).filter((x) => x !== id)
    getDb().prepare(`UPDATE proxy_hosts SET header_rule_ids = ? WHERE id = ?`).run(JSON.stringify(ids), h.id)
  }
  renderSharedMiddlewares()
  reRenderAllHosts()
  return true
}
