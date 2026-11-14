import { getDb } from './db.js'

type DomainTable = 'proxy_hosts' | 'redirection_hosts' | 'dead_hosts'

function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/\.$/, '')
}

/** Reject domain names already claimed by any host type (proxy / redirect / parked). */
export function assertDomainsAvailable(
  domains: string[],
  opts?: { excludeTable?: DomainTable; excludeId?: string },
): void {
  const wanted = new Set(domains.map(normalizeDomain).filter(Boolean))
  if (!wanted.size) return

  const tables: DomainTable[] = ['proxy_hosts', 'redirection_hosts', 'dead_hosts']
  for (const table of tables) {
    const rows = getDb().prepare(`SELECT id, domain_names FROM ${table}`).all() as {
      id: string
      domain_names: string
    }[]
    for (const row of rows) {
      if (opts?.excludeTable === table && opts?.excludeId === row.id) continue
      let list: string[] = []
      try {
        list = JSON.parse(row.domain_names || '[]') as string[]
      } catch {
        continue
      }
      if (!Array.isArray(list)) continue
      for (const d of list) {
        const n = normalizeDomain(String(d))
        if (wanted.has(n)) {
          throw new Error(`domain already in use: ${n}`)
        }
      }
    }
  }
}
