import { getDb } from './db.js'

export type AuditEntry = {
  id: number
  at: string
  actor: string
  action: string
  entity: string
  entity_id: string
  summary: string
  detail: Record<string, unknown>
}

type Row = {
  id: number
  at: string
  actor: string
  action: string
  entity: string
  entity_id: string
  summary: string
  detail_json: string
}

export function recordAudit(input: {
  actor: string
  action: string
  entity: string
  entity_id?: string
  summary?: string
  detail?: Record<string, unknown>
}): void {
  const at = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO audit_log (at, actor, action, entity, entity_id, summary, detail_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      at,
      input.actor || 'system',
      input.action,
      input.entity,
      input.entity_id || '',
      input.summary || '',
      JSON.stringify(input.detail || {}),
    )
}

export function listAudit(limit = 200): AuditEntry[] {
  const rows = getDb()
    .prepare(`SELECT * FROM audit_log ORDER BY id DESC LIMIT ?`)
    .all(Math.min(Math.max(limit, 1), 1000)) as Row[]
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    action: r.action,
    entity: r.entity,
    entity_id: r.entity_id,
    summary: r.summary,
    detail: JSON.parse(r.detail_json || '{}') as Record<string, unknown>,
  }))
}
