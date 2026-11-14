import { connect } from 'node:tls'
import { getDb } from '../db.js'
import { listHosts } from '../hosts.js'

export type SslCheckRow = {
  domain: string
  status: 'valid' | 'expiring_soon' | 'expired' | 'error' | 'unknown'
  expires_at: string | null
  checked_at: string
  error: string | null
}

function ensureTable(): void {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS ssl_checks (
      domain TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      expires_at TEXT,
      checked_at TEXT NOT NULL,
      error TEXT
    );
  `)
}

function upsert(row: SslCheckRow): void {
  getDb()
    .prepare(
      `INSERT INTO ssl_checks (domain, status, expires_at, checked_at, error)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(domain) DO UPDATE SET
         status = excluded.status,
         expires_at = excluded.expires_at,
         checked_at = excluded.checked_at,
         error = excluded.error`,
    )
    .run(row.domain, row.status, row.expires_at, row.checked_at, row.error)
}

function checkDomain(domain: string): Promise<SslCheckRow> {
  const checked_at = new Date().toISOString()
  return new Promise((resolve) => {
    const socket = connect(
      { host: domain, port: 443, servername: domain, rejectUnauthorized: false, timeout: 8000 },
      () => {
        const cert = socket.getPeerCertificate()
        socket.end()
        if (!cert || !cert.valid_to) {
          resolve({
            domain,
            status: 'unknown',
            expires_at: null,
            checked_at,
            error: 'no certificate',
          })
          return
        }
        const expires = new Date(cert.valid_to)
        const msLeft = expires.getTime() - Date.now()
        let status: SslCheckRow['status'] = 'valid'
        if (msLeft < 0) status = 'expired'
        else if (msLeft < 15 * 24 * 3600 * 1000) status = 'expiring_soon'
        resolve({
          domain,
          status,
          expires_at: expires.toISOString(),
          checked_at,
          error: null,
        })
      },
    )
    socket.on('error', (err) => {
      resolve({
        domain,
        status: 'error',
        expires_at: null,
        checked_at,
        error: err.message,
      })
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve({
        domain,
        status: 'error',
        expires_at: null,
        checked_at,
        error: 'timeout',
      })
    })
  })
}

export async function runSslChecks(): Promise<SslCheckRow[]> {
  ensureTable()
  const domains = new Set<string>()
  for (const h of listHosts()) {
    if (!h.enabled) continue
    for (const d of h.domain_names) domains.add(d)
  }
  const results: SslCheckRow[] = []
  for (const domain of domains) {
    const row = await checkDomain(domain)
    upsert(row)
    results.push(row)
  }
  return results
}

export function listSslChecks(): SslCheckRow[] {
  ensureTable()
  return getDb()
    .prepare(`SELECT domain, status, expires_at, checked_at, error FROM ssl_checks ORDER BY domain`)
    .all() as SslCheckRow[]
}

export function startSslChecker(intervalMs = 6 * 60 * 60 * 1000): void {
  ensureTable()
  const tick = () => {
    runSslChecks().catch((err) => {
      console.error('ssl checker failed', err)
    })
  }
  setTimeout(tick, 15_000)
  setInterval(tick, intervalMs)
}
