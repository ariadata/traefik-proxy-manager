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

type Claim = {
  table: DomainTable
  id: string
  created_at: string
  enabled: boolean
  domains: string[]
}

/**
 * Disable newer rows that share a domain with an older claim.
 * Keeps the oldest `created_at` winner so Traefik never loads two Host() routers
 * for the same name (which caused intermittent 502s in the lab).
 */
export function repairDuplicateDomains(): { disabled: Array<{ table: DomainTable; id: string; domain: string }> } {
  const tables: DomainTable[] = ['proxy_hosts', 'redirection_hosts', 'dead_hosts']
  const claims: Claim[] = []

  for (const table of tables) {
    const rows = getDb()
      .prepare(`SELECT id, domain_names, enabled, created_at FROM ${table}`)
      .all() as { id: string; domain_names: string; enabled: number; created_at: string }[]
    for (const row of rows) {
      let list: string[] = []
      try {
        list = JSON.parse(row.domain_names || '[]') as string[]
      } catch {
        continue
      }
      if (!Array.isArray(list) || !list.length) continue
      claims.push({
        table,
        id: row.id,
        created_at: row.created_at || '',
        enabled: !!row.enabled,
        domains: list.map((d) => normalizeDomain(String(d))).filter(Boolean),
      })
    }
  }

  // Oldest created_at wins; tie-break by table order then id for stability.
  const tableRank: Record<DomainTable, number> = {
    proxy_hosts: 0,
    redirection_hosts: 1,
    dead_hosts: 2,
  }
  claims.sort((a, b) => {
    const c = a.created_at.localeCompare(b.created_at)
    if (c !== 0) return c
    const t = tableRank[a.table] - tableRank[b.table]
    if (t !== 0) return t
    return a.id.localeCompare(b.id)
  })

  const owner = new Map<string, Claim>()
  const disabled: Array<{ table: DomainTable; id: string; domain: string }> = []
  const disableIds = new Map<DomainTable, Set<string>>()

  for (const claim of claims) {
    let conflict: string | null = null
    for (const d of claim.domains) {
      const existing = owner.get(d)
      if (existing && !(existing.table === claim.table && existing.id === claim.id)) {
        conflict = d
        break
      }
    }
    if (conflict) {
      if (claim.enabled) {
        if (!disableIds.has(claim.table)) disableIds.set(claim.table, new Set())
        disableIds.get(claim.table)!.add(claim.id)
        disabled.push({ table: claim.table, id: claim.id, domain: conflict })
      }
      continue
    }
    for (const d of claim.domains) owner.set(d, claim)
  }

  const now = new Date().toISOString()
  for (const [table, ids] of disableIds) {
    const stmt = getDb().prepare(`UPDATE ${table} SET enabled = 0, updated_at = ? WHERE id = ? AND enabled != 0`)
    for (const id of ids) stmt.run(now, id)
  }

  return { disabled }
}
