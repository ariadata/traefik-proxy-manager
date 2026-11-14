import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb } from './db.js'
import { reRenderAllHosts } from './hosts.js'
import { renderSharedMiddlewares } from './traefik/middlewares.js'

const inputSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['rate_limit', 'ip_allow', 'ip_deny', 'security_headers', 'bot_ua_path']),
  enabled: z.boolean().optional().default(true),
  config: z.record(z.string(), z.unknown()).optional().default({}),
})

export type WafInput = z.infer<typeof inputSchema>

export type WafProfile = {
  id: string
  name: string
  kind: string
  enabled: boolean
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

type Row = {
  id: string
  name: string
  kind: string
  enabled: number
  config_json: string
  created_at: string
  updated_at: string
}

function mapRow(row: Row): WafProfile {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    enabled: !!row.enabled,
    config: JSON.parse(row.config_json || '{}') as Record<string, unknown>,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function parseWafInput(body: unknown): WafInput {
  return inputSchema.parse(body)
}

export function listWafProfiles(): WafProfile[] {
  return (getDb().prepare(`SELECT * FROM waf_profiles ORDER BY name`).all() as Row[]).map(mapRow)
}

export function getWafProfile(id: string): WafProfile | null {
  const row = getDb().prepare(`SELECT * FROM waf_profiles WHERE id = ?`).get(id) as Row | undefined
  return row ? mapRow(row) : null
}

export function createWafProfile(input: WafInput): WafProfile {
  const id = randomUUID()
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `INSERT INTO waf_profiles (id, name, kind, enabled, config_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.name, input.kind, input.enabled ? 1 : 0, JSON.stringify(input.config || {}), now, now)
  renderSharedMiddlewares()
  reRenderAllHosts()
  return getWafProfile(id)!
}

export function updateWafProfile(id: string, input: WafInput): WafProfile | null {
  if (!getWafProfile(id)) return null
  const now = new Date().toISOString()
  getDb()
    .prepare(`UPDATE waf_profiles SET name=?, kind=?, enabled=?, config_json=?, updated_at=? WHERE id=?`)
    .run(input.name, input.kind, input.enabled ? 1 : 0, JSON.stringify(input.config || {}), now, id)
  renderSharedMiddlewares()
  reRenderAllHosts()
  return getWafProfile(id)
}

export function deleteWafProfile(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM waf_profiles WHERE id = ?`).run(id)
  if (!info.changes) return false
  const hosts = getDb().prepare(`SELECT id, waf_profile_ids FROM proxy_hosts`).all() as {
    id: string
    waf_profile_ids: string
  }[]
  for (const h of hosts) {
    const ids = (JSON.parse(h.waf_profile_ids || '[]') as string[]).filter((x) => x !== id)
    getDb().prepare(`UPDATE proxy_hosts SET waf_profile_ids = ? WHERE id = ?`).run(JSON.stringify(ids), h.id)
  }
  renderSharedMiddlewares()
  reRenderAllHosts()
  return true
}

/** Seed lean 5-pack once if empty. */
export function seedDefaultWafProfiles(): void {
  const n = (getDb().prepare(`SELECT COUNT(*) AS n FROM waf_profiles`).get() as { n: number }).n
  if (n > 0) return
  const now = new Date().toISOString()
  // Rate limit is configured per proxy host (not a shared WAF profile).
  const defaults: Array<{ name: string; kind: string; config: Record<string, unknown> }> = [
    { name: 'IP allow list', kind: 'ip_allow', config: { source_range: ['10.0.0.0/8', '192.168.0.0/16'] } },
    { name: 'IP deny list', kind: 'ip_deny', config: { blocked: ['0.0.0.0/32'] } },
    {
      name: 'Security headers',
      kind: 'security_headers',
      config: {
        stsSeconds: 31536000,
        browserXssFilter: true,
        contentTypeNosniff: true,
        frameDeny: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
      },
    },
    {
      name: 'Bot UA / path shield',
      kind: 'bot_ua_path',
      config: {
        ua_regex: '(?i)(sqlmap|nikto|nmap|masscan|curl/|python-requests)',
        path_prefixes: ['/.env', '/.git', '/.aws', '/wp-admin', '/wp-login.php'],
      },
    },
  ]
  const ins = getDb().prepare(
    `INSERT INTO waf_profiles (id, name, kind, enabled, config_json, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)`,
  )
  for (const d of defaults) {
    ins.run(randomUUID(), d.name, d.kind, JSON.stringify(d.config), now, now)
  }
  renderSharedMiddlewares()
}
