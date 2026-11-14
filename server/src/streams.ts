import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb } from './db.js'
import { applyTraefikStatic } from './traefik/static.js'
import { renderStreamYaml, removeStreamYaml } from './traefik/render-stream.js'
import { assertCertResolver } from './traefik/rules.js'

const inputSchema = z.object({
  name: z.string().min(1).max(64),
  protocol: z.enum(['tcp', 'udp']),
  entry_port: z.number().int().min(1).max(65535),
  forward_host: z.string().min(1),
  forward_port: z.number().int().min(1).max(65535),
  sni_hosts: z.array(z.string().min(1)).optional().default([]),
  tls_mode: z.enum(['off', 'terminate', 'passthrough']).optional().default('off'),
  cert_resolver: z.string().optional().default(''),
  enabled: z.boolean().optional().default(true),
})

export type StreamInput = z.infer<typeof inputSchema>

export type Stream = {
  id: string
  name: string
  protocol: 'tcp' | 'udp'
  entry_port: number
  forward_host: string
  forward_port: number
  sni_hosts: string[]
  tls_mode: 'off' | 'terminate' | 'passthrough'
  cert_resolver: string
  enabled: boolean
  created_at: string
  updated_at: string
}

type Row = {
  id: string
  name: string
  protocol: string
  entry_port: number
  forward_host: string
  forward_port: number
  sni_hosts: string
  tls_mode: string
  cert_resolver: string
  enabled: number
  created_at: string
  updated_at: string
}

function mapRow(row: Row): Stream {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol as 'tcp' | 'udp',
    entry_port: row.entry_port,
    forward_host: row.forward_host,
    forward_port: row.forward_port,
    sni_hosts: JSON.parse(row.sni_hosts || '[]') as string[],
    tls_mode: (row.tls_mode || 'off') as Stream['tls_mode'],
    cert_resolver: row.cert_resolver || '',
    enabled: !!row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function syncYaml(stream: Stream): void {
  if (!stream.enabled) {
    removeStreamYaml(stream.id)
    return
  }
  renderStreamYaml(stream)
}

function afterStreamChange(): boolean {
  for (const s of listStreams()) syncYaml(s)
  return applyTraefikStatic()
}

const RESERVED_PORTS = new Set([80, 443, 8080])

export function parseStreamInput(body: unknown): StreamInput {
  const input = inputSchema.parse(body)
  if (input.protocol === 'udp' && input.tls_mode !== 'off') {
    throw new Error('UDP streams do not support TLS modes')
  }
  if (input.tls_mode === 'terminate' && input.sni_hosts.length === 0) {
    throw new Error('TLS terminate requires at least one SNI host')
  }
  if (input.tls_mode === 'off' && input.sni_hosts.length > 0) {
    // Non-TLS TCP cannot use specific HostSNI — force catch-all at render time
    input.sni_hosts = []
  }
  if (RESERVED_PORTS.has(input.entry_port)) {
    throw new Error(`entry_port ${input.entry_port} is reserved (80/443/8080)`)
  }
  if (input.cert_resolver) {
    assertCertResolver(input.cert_resolver)
  }
  return input
}

function assertUniquePort(protocol: string, entryPort: number, excludeId?: string): void {
  const row = getDb()
    .prepare(
      `SELECT id FROM streams WHERE protocol = ? AND entry_port = ? ${excludeId ? 'AND id != ?' : ''} LIMIT 1`,
    )
    .get(...(excludeId ? [protocol, entryPort, excludeId] : [protocol, entryPort])) as
    | { id: string }
    | undefined
  if (row) throw new Error(`stream port ${entryPort}/${protocol} already in use`)
}

export function listStreams(): Stream[] {
  return (getDb().prepare(`SELECT * FROM streams ORDER BY entry_port, name`).all() as Row[]).map(mapRow)
}

export function getStream(id: string): Stream | null {
  const row = getDb().prepare(`SELECT * FROM streams WHERE id = ?`).get(id) as Row | undefined
  return row ? mapRow(row) : null
}

export function createStream(input: StreamInput): { stream: Stream; restart_required: boolean } {
  assertUniquePort(input.protocol, input.entry_port)
  const id = randomUUID()
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO streams (
        id, name, protocol, entry_port, forward_host, forward_port, sni_hosts,
        tls_mode, cert_resolver, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.protocol,
      input.entry_port,
      input.forward_host,
      input.forward_port,
      JSON.stringify(input.sni_hosts || []),
      input.tls_mode || 'off',
      input.cert_resolver || '',
      input.enabled ? 1 : 0,
      now,
      now,
    )
  const stream = getStream(id)!
  const restart_required = afterStreamChange()
  return { stream, restart_required }
}

export function updateStream(
  id: string,
  input: StreamInput,
): { stream: Stream; restart_required: boolean } | null {
  if (!getStream(id)) return null
  assertUniquePort(input.protocol, input.entry_port, id)
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `UPDATE streams SET
        name=?, protocol=?, entry_port=?, forward_host=?, forward_port=?, sni_hosts=?,
        tls_mode=?, cert_resolver=?, enabled=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      input.name,
      input.protocol,
      input.entry_port,
      input.forward_host,
      input.forward_port,
      JSON.stringify(input.sni_hosts || []),
      input.tls_mode || 'off',
      input.cert_resolver || '',
      input.enabled ? 1 : 0,
      now,
      id,
    )
  const stream = getStream(id)!
  const restart_required = afterStreamChange()
  return { stream, restart_required }
}

export function deleteStream(id: string): { ok: boolean; restart_required: boolean } {
  if (!getStream(id)) return { ok: false, restart_required: false }
  getDb().prepare(`DELETE FROM streams WHERE id = ?`).run(id)
  removeStreamYaml(id)
  const restart_required = afterStreamChange()
  return { ok: true, restart_required }
}

export function reRenderAllStreams(): void {
  for (const s of listStreams()) syncYaml(s)
}
