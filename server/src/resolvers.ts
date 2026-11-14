import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getDb } from './db.js'
import { getProvider } from './providers.js'
import { decryptJson, encryptJson, secretsConfigured } from './secrets.js'
import { applyTraefikStatic } from './traefik/static.js'

const inputSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'resolver name must be alphanumeric'),
  provider: z.string().min(1),
  acme_email: z.string().email(),
  challenge: z.enum(['dns01', 'http01', 'tlsalpn01']).optional(),
  credentials: z.record(z.string(), z.string()).optional().default({}),
  is_default: z.boolean().optional().default(false),
})

export type ResolverInput = z.infer<typeof inputSchema>

export type DnsResolver = {
  id: string
  name: string
  provider: string
  acme_email: string
  challenge: string
  is_default: boolean
  credential_keys: string[]
  created_at: string
  updated_at: string
}

type Row = {
  id: string
  name: string
  provider: string
  acme_email: string
  challenge: string
  credentials_enc: Buffer | null
  is_default: number
  created_at: string
  updated_at: string
}

function mapRow(row: Row): DnsResolver {
  let keys: string[] = []
  if (row.credentials_enc && row.credentials_enc.length) {
    try {
      const creds = decryptJson<Record<string, string>>(row.credentials_enc)
      keys = creds ? Object.keys(creds) : []
    } catch {
      keys = ['(encrypted)']
    }
  }
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    acme_email: row.acme_email,
    challenge: row.challenge,
    is_default: !!row.is_default,
    credential_keys: keys,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function parseResolverInput(body: unknown): ResolverInput {
  const input = inputSchema.parse(body)
  const provider = getProvider(input.provider)
  if (!provider) throw new Error(`unknown provider: ${input.provider}`)
  const allowed = new Set(provider.fields.map((f) => f.key))
  const cleaned: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.credentials || {})) {
    if (!k || v === undefined || v === '') continue
    if (!/^[A-Z0-9_]{1,64}$/.test(k)) {
      throw new Error(`invalid credential key: ${k}`)
    }
    if (allowed.size > 0 && !allowed.has(k)) {
      throw new Error(`credential key not allowed for ${provider.id}: ${k}`)
    }
    cleaned[k] = String(v).replace(/[\r\n]/g, '')
  }
  input.credentials = cleaned
  return input
}

export function listResolvers(): DnsResolver[] {
  const rows = getDb()
    .prepare(`SELECT * FROM dns_resolvers ORDER BY is_default DESC, name ASC`)
    .all() as Row[]
  return rows.map(mapRow)
}

export function getResolver(id: string): DnsResolver | null {
  const row = getDb().prepare(`SELECT * FROM dns_resolvers WHERE id = ?`).get(id) as Row | undefined
  return row ? mapRow(row) : null
}

function clearDefault(): void {
  getDb().prepare(`UPDATE dns_resolvers SET is_default = 0`).run()
}

export function createResolver(input: ResolverInput): { resolver: DnsResolver; restart_required: boolean } {
  const def = getProvider(input.provider)
  if (!def) throw new Error(`unknown provider: ${input.provider}`)
  const challenge = input.challenge || def.challenge
  if (challenge === 'dns01' && Object.keys(input.credentials || {}).length === 0) {
    throw new Error('credentials required for DNS-01 provider')
  }
  if (Object.keys(input.credentials || {}).length > 0 && !secretsConfigured()) {
    throw new Error('set TPM_SECRETS_KEY before storing DNS credentials')
  }

  const id = randomUUID()
  const now = new Date().toISOString()
  if (input.is_default) clearDefault()

  const enc =
    Object.keys(input.credentials || {}).length > 0 ? encryptJson(input.credentials) : null

  getDb()
    .prepare(
      `INSERT INTO dns_resolvers (
        id, name, provider, acme_email, challenge, credentials_enc, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.provider,
      input.acme_email,
      challenge,
      enc,
      input.is_default ? 1 : 0,
      now,
      now,
    )

  const restart_required = applyTraefikStatic()
  return { resolver: getResolver(id)!, restart_required }
}

export function updateResolver(
  id: string,
  input: ResolverInput,
): { resolver: DnsResolver; restart_required: boolean } | null {
  const existing = getResolver(id)
  if (!existing) return null
  const def = getProvider(input.provider)
  if (!def) throw new Error(`unknown provider: ${input.provider}`)
  const challenge = input.challenge || def.challenge
  const now = new Date().toISOString()
  if (input.is_default) clearDefault()

  let enc: Buffer | null = null
  if (Object.keys(input.credentials || {}).length > 0) {
    if (!secretsConfigured()) throw new Error('set TPM_SECRETS_KEY before storing DNS credentials')
    enc = encryptJson(input.credentials)
  } else {
    const row = getDb().prepare(`SELECT credentials_enc FROM dns_resolvers WHERE id = ?`).get(id) as {
      credentials_enc: Buffer | null
    }
    enc = row.credentials_enc
  }

  getDb()
    .prepare(
      `UPDATE dns_resolvers SET
        name = ?, provider = ?, acme_email = ?, challenge = ?,
        credentials_enc = ?, is_default = ?, updated_at = ?
      WHERE id = ?`,
    )
    .run(
      input.name,
      input.provider,
      input.acme_email,
      challenge,
      enc,
      input.is_default ? 1 : 0,
      now,
      id,
    )

  const restart_required = applyTraefikStatic()
  return { resolver: getResolver(id)!, restart_required }
}

export function deleteResolver(id: string): { ok: boolean; restart_required: boolean } {
  const info = getDb().prepare(`DELETE FROM dns_resolvers WHERE id = ?`).run(id)
  if (!info.changes) return { ok: false, restart_required: false }
  const restart_required = applyTraefikStatic()
  return { ok: true, restart_required }
}

