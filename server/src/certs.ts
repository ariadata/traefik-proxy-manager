import { X509Certificate, createPrivateKey, createPublicKey, randomUUID } from 'node:crypto'
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { cfg } from './config.js'
import { getDb } from './db.js'
import { renderTlsCertsYaml } from './traefik/tls.js'

/** Reject garbage / encrypted / mismatched PEM pairs before writing to disk. */
function assertPemPair(certPem: string, keyPem: string): void {
  if (!certPem.includes('BEGIN CERTIFICATE')) {
    throw new Error('cert_pem must be a PEM certificate')
  }
  if (!keyPem.includes('BEGIN') || !keyPem.includes('PRIVATE KEY')) {
    throw new Error('key_pem must be a PEM private key')
  }
  if (/ENCRYPTED/i.test(keyPem)) {
    throw new Error('encrypted private keys are not supported')
  }
  let cert: X509Certificate
  try {
    cert = new X509Certificate(certPem)
  } catch {
    throw new Error('invalid certificate PEM')
  }
  let key
  try {
    key = createPrivateKey(keyPem)
  } catch {
    throw new Error('invalid private key PEM')
  }
  const fromCert = createPublicKey(cert.publicKey).export({ type: 'spki', format: 'der' }) as Buffer
  const fromKey = createPublicKey(key).export({ type: 'spki', format: 'der' }) as Buffer
  if (!fromCert.equals(fromKey)) {
    throw new Error('certificate and private key do not match')
  }
}

const inputSchema = z.object({
  domain_names: z.array(z.string().min(1)).min(1),
  cert_pem: z.string().min(20),
  key_pem: z.string().min(20),
})

export type CertInput = z.infer<typeof inputSchema>

export type Certificate = {
  id: string
  kind: string
  domain_names: string[]
  cert_path: string | null
  key_path: string | null
  status: string
  expires_at: string | null
  created_at: string
  updated_at: string
}

type Row = {
  id: string
  kind: string
  domain_names: string
  cert_path: string | null
  key_path: string | null
  status: string
  expires_at: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: Row): Certificate {
  return {
    id: row.id,
    kind: row.kind,
    domain_names: JSON.parse(row.domain_names) as string[],
    cert_path: row.cert_path,
    key_path: row.key_path,
    status: row.status,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function parseCertInput(body: unknown): CertInput {
  return inputSchema.parse(body)
}

export function listCertificates(): Certificate[] {
  const rows = getDb()
    .prepare(`SELECT id, kind, domain_names, cert_path, key_path, status, expires_at, created_at, updated_at FROM certificates ORDER BY created_at DESC`)
    .all() as Row[]
  return rows.map(mapRow)
}

export function getCertificate(id: string): Certificate | null {
  const row = getDb()
    .prepare(`SELECT id, kind, domain_names, cert_path, key_path, status, expires_at, created_at, updated_at FROM certificates WHERE id = ?`)
    .get(id) as Row | undefined
  return row ? mapRow(row) : null
}

function containerCertPath(id: string, ext: 'crt' | 'key'): string {
  return `/certs/custom/${id}.${ext}`
}

function hostCertPath(id: string, ext: 'crt' | 'key'): string {
  return path.join(cfg.customCertsDir, `${id}.${ext}`)
}

export function createCustomCertificate(input: CertInput): Certificate {
  assertPemPair(input.cert_pem, input.key_pem)

  mkdirSync(cfg.customCertsDir, { recursive: true })
  const id = randomUUID()
  const now = new Date().toISOString()
  const certHost = hostCertPath(id, 'crt')
  const keyHost = hostCertPath(id, 'key')
  writeFileSync(certHost, input.cert_pem, { mode: 0o644 })
  writeFileSync(keyHost, input.key_pem, { mode: 0o600 })

  getDb()
    .prepare(
      `INSERT INTO certificates (
        id, kind, domain_names, resolver_id, cert_path, key_path,
        status, expires_at, last_checked_at, fingerprint, created_at, updated_at
      ) VALUES (?, 'custom', ?, NULL, ?, ?, 'valid', NULL, NULL, NULL, ?, ?)`,
    )
    .run(id, JSON.stringify(input.domain_names), containerCertPath(id, 'crt'), containerCertPath(id, 'key'), now, now)

  renderTlsCertsYaml()
  return getCertificate(id)!
}

export function deleteCertificate(id: string): boolean {
  const cert = getCertificate(id)
  if (!cert) return false
  getDb().prepare(`UPDATE proxy_hosts SET certificate_id = NULL WHERE certificate_id = ?`).run(id)
  getDb().prepare(`DELETE FROM certificates WHERE id = ?`).run(id)
  try {
    unlinkSync(hostCertPath(id, 'crt'))
  } catch {
    /* ignore */
  }
  try {
    unlinkSync(hostCertPath(id, 'key'))
  } catch {
    /* ignore */
  }
  renderTlsCertsYaml()
  return true
}
