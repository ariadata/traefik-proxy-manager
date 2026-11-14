import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb } from './db.js'
import { decryptJson, encryptJson, secretsConfigured } from './secrets.js'
import { isCidrOrIp } from './traefik/rules.js'

const clientSchema = z.object({
  address: z
    .string()
    .min(1)
    .refine(isCidrOrIp, 'address must be an IP or CIDR'),
  directive: z.enum(['allow', 'deny']),
})

const authUserInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().optional(),
})

const inputSchema = z.object({
  name: z.string().min(1),
  satisfy: z.enum(['all']).optional().default('all'),
  pass_auth: z.boolean().optional().default(false),
  clients: z.array(clientSchema).optional().default([]),
  auth_users: z.array(authUserInputSchema).optional().default([]),
  enabled: z.boolean().optional().default(true),
})

export type AccessListInput = z.infer<typeof inputSchema>

export type AccessListClient = z.infer<typeof clientSchema>

export type AccessList = {
  id: string
  name: string
  satisfy: string
  pass_auth: boolean
  clients: AccessListClient[]
  auth_users: { username: string }[]
  enabled: boolean
  created_at: string
  updated_at: string
}

type StoredAuthUser = { username: string; password_hash: string }

type Row = {
  id: string
  name: string
  satisfy: string
  pass_auth: number
  clients_json: string
  auth_users_enc: Buffer | Uint8Array | null
  enabled: number
  created_at: string
  updated_at: string
}

export type AccessListRender = {
  id: string
  enabled: boolean
  allow: string[]
  deny: string[]
  basicUsers: string[]
  passAuth: boolean
  hasIpAllow: boolean
  hasAuth: boolean
}

function readStoredAuth(blob: Buffer | Uint8Array | null): StoredAuthUser[] {
  if (!blob || blob.length === 0) return []
  try {
    return decryptJson<StoredAuthUser[]>(blob) || []
  } catch {
    return []
  }
}

function mapRow(row: Row): AccessList {
  const stored = readStoredAuth(row.auth_users_enc ? Buffer.from(row.auth_users_enc) : null)
  return {
    id: row.id,
    name: row.name,
    satisfy: row.satisfy || 'all',
    pass_auth: !!row.pass_auth,
    clients: JSON.parse(row.clients_json || '[]') as AccessListClient[],
    auth_users: stored.map((u) => ({ username: u.username })),
    enabled: !!row.enabled,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function buildAuthBlob(
  users: { username: string; password?: string }[],
  previous: StoredAuthUser[],
): Buffer | null {
  if (users.length === 0) return null
  const prevByName = new Map(previous.map((u) => [u.username, u]))
  const out: StoredAuthUser[] = []
  for (const u of users) {
    const prev = prevByName.get(u.username)
    if (u.password && u.password.length > 0) {
      out.push({ username: u.username, password_hash: bcrypt.hashSync(u.password, 10) })
    } else if (prev) {
      out.push(prev)
    } else {
      throw new Error(`password required for new auth user "${u.username}"`)
    }
  }
  if (!secretsConfigured()) {
    throw new Error('TPM_SECRETS_KEY is required to store BasicAuth users')
  }
  return encryptJson(out)
}

function afterAccessListChange(): void {
  // dynamic imports avoid cycles (middlewares/hosts/render ↔ access-lists)
  void import('./traefik/middlewares.js').then((m) => {
    m.renderSharedMiddlewares()
    void import('./hosts.js').then((h) => h.reRenderAllHosts())
    void import('./redirections.js').then((r) => r.reRenderAllRedirects())
    void import('./dead-hosts.js').then((d) => d.reRenderAllDeadHosts())
  })
}

export function parseAccessListInput(body: unknown): AccessListInput {
  return inputSchema.parse(body)
}

export function listAccessLists(): AccessList[] {
  return (getDb().prepare(`SELECT * FROM access_lists ORDER BY name`).all() as Row[]).map(mapRow)
}

export function getAccessList(id: string): AccessList | null {
  const row = getDb().prepare(`SELECT * FROM access_lists WHERE id = ?`).get(id) as Row | undefined
  return row ? mapRow(row) : null
}

export function getAccessListForRender(id: string): AccessListRender | null {
  const row = getDb().prepare(`SELECT * FROM access_lists WHERE id = ?`).get(id) as Row | undefined
  if (!row) return null
  return toRender(row)
}

export function listAccessListsForRender(): AccessListRender[] {
  return (getDb().prepare(`SELECT * FROM access_lists WHERE enabled = 1`).all() as Row[]).map(toRender)
}

function toRender(row: Row): AccessListRender {
  const clients = JSON.parse(row.clients_json || '[]') as AccessListClient[]
  const allow = clients.filter((c) => c.directive === 'allow').map((c) => c.address)
  const deny = clients.filter((c) => c.directive === 'deny').map((c) => c.address)
  const stored = readStoredAuth(row.auth_users_enc ? Buffer.from(row.auth_users_enc) : null)
  return {
    id: row.id,
    enabled: !!row.enabled,
    allow,
    deny,
    basicUsers: stored.map((u) => `${u.username}:${u.password_hash}`),
    passAuth: !!row.pass_auth,
    hasIpAllow: allow.length > 0,
    hasAuth: stored.length > 0,
  }
}

export function createAccessList(input: AccessListInput): AccessList {
  const id = randomUUID()
  const now = new Date().toISOString()
  const blob = buildAuthBlob(input.auth_users || [], [])
  getDb()
    .prepare(
      `INSERT INTO access_lists (
        id, name, satisfy, pass_auth, clients_json, auth_users_enc, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.satisfy || 'all',
      input.pass_auth ? 1 : 0,
      JSON.stringify(input.clients || []),
      blob,
      input.enabled ? 1 : 0,
      now,
      now,
    )
  afterAccessListChange()
  return getAccessList(id)!
}

export function updateAccessList(id: string, input: AccessListInput): AccessList | null {
  const existing = getDb().prepare(`SELECT * FROM access_lists WHERE id = ?`).get(id) as Row | undefined
  if (!existing) return null
  const prev = readStoredAuth(existing.auth_users_enc ? Buffer.from(existing.auth_users_enc) : null)
  const blob = buildAuthBlob(input.auth_users || [], prev)
  const now = new Date().toISOString()
  getDb()
    .prepare(
      `UPDATE access_lists SET
        name=?, satisfy=?, pass_auth=?, clients_json=?, auth_users_enc=?, enabled=?, updated_at=?
       WHERE id=?`,
    )
    .run(
      input.name,
      input.satisfy || 'all',
      input.pass_auth ? 1 : 0,
      JSON.stringify(input.clients || []),
      blob,
      input.enabled ? 1 : 0,
      now,
      id,
    )
  afterAccessListChange()
  return getAccessList(id)
}

export function deleteAccessList(id: string): boolean {
  const info = getDb().prepare(`DELETE FROM access_lists WHERE id = ?`).run(id)
  if (!info.changes) return false
  getDb().prepare(`UPDATE proxy_hosts SET access_list_id = NULL WHERE access_list_id = ?`).run(id)
  getDb().prepare(`UPDATE redirection_hosts SET access_list_id = NULL WHERE access_list_id = ?`).run(id)
  getDb().prepare(`UPDATE dead_hosts SET access_list_id = NULL WHERE access_list_id = ?`).run(id)
  afterAccessListChange()
  return true
}

export function mwAccessIpName(id: string): string {
  return `tpm-acl-${id.replace(/[^a-zA-Z0-9]/g, '')}-ip`
}

export function mwAccessAuthName(id: string): string {
  return `tpm-acl-${id.replace(/[^a-zA-Z0-9]/g, '')}-auth`
}
