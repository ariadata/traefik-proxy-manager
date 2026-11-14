/** Shared Traefik rule helpers — escape backticks / validate hostnames. */

import { getDb } from '../db.js'

const HOSTNAME_RE =
  /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.?$/

const ENV_KEY_RE = /^[A-Z0-9_]{1,64}$/
const GO_DURATION_RE = /^\d+(ns|us|µs|ms|s|m|h)$/

export function escapeRuleLiteral(value: string): string {
  return String(value).replace(/`/g, '')
}

export function assertHostname(domain: string): string {
  const d = domain.trim().toLowerCase()
  if (!d || d.length > 253 || !HOSTNAME_RE.test(d) || d.includes('`')) {
    throw new Error(`invalid hostname: ${domain}`)
  }
  return d
}

export function assertHostnames(domains: string[]): string[] {
  return domains.map(assertHostname)
}

/** Upstream target: hostname, IPv4, or IPv6 (optional brackets). */
export function assertUpstreamHost(host: string): string {
  let h = String(host || '').trim()
  if (!h || h.length > 253 || h.includes('`') || /\s/.test(h) || h.includes('/')) {
    throw new Error(`invalid upstream host: ${host}`)
  }
  if (h.startsWith('[') && h.endsWith(']')) {
    h = h.slice(1, -1)
  }
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(h)) {
    const octets = h.split('.').map(Number)
    if (octets.some((n) => Number.isNaN(n) || n > 255)) {
      throw new Error(`invalid upstream host: ${host}`)
    }
    return h
  }
  if (h.includes(':')) {
    if (!isCidrOrIp(h) || h.includes('/')) {
      throw new Error(`invalid upstream host: ${host}`)
    }
    return h.toLowerCase()
  }
  return assertHostname(h)
}

/** Build Traefik server URL; bracket IPv6 literals. */
export function upstreamServerUrl(scheme: string, host: string, port: number): string {
  const h = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host
  return `${scheme}://${h}:${port}`
}

export function hostRule(domains: string[]): string {
  return domains.map((d) => `Host(\`${escapeRuleLiteral(d)}\`)`).join(' || ')
}

/**
 * Traefik certificatesResolvers are keyed by resolver *name*.
 * Hosts may store either the UUID id (API) or the name (UI). Resolve to name.
 * Unknown keys return '' so Traefik YAML never gets a bogus certResolver.
 */
export function certResolverName(idOrName: string): string {
  const key = String(idOrName || '').trim()
  if (!key) return ''
  const byId = getDb()
    .prepare(`SELECT name FROM dns_resolvers WHERE id = ? LIMIT 1`)
    .get(key) as { name: string } | undefined
  if (byId?.name) return byId.name
  const byName = getDb()
    .prepare(`SELECT name FROM dns_resolvers WHERE name = ? LIMIT 1`)
    .get(key) as { name: string } | undefined
  if (byName?.name) return byName.name
  return ''
}

/** API write-path: reject undefined resolvers instead of silently ignoring. */
export function assertCertResolver(idOrName: string): string {
  const key = String(idOrName || '').trim()
  if (!key) return ''
  const name = certResolverName(key)
  if (!name) throw new Error(`unknown cert resolver: ${key}`)
  return name
}

export function hostSniRule(hosts: string[]): string {
  return hosts.map((h) => `HostSNI(\`${escapeRuleLiteral(h)}\`)`).join(' || ')
}

export function isSafeEnvKey(key: string): boolean {
  return ENV_KEY_RE.test(key)
}

export function isGoDuration(value: string): boolean {
  return GO_DURATION_RE.test(value)
}

export function isCidrOrIp(value: string): boolean {
  const v = value.trim()
  if (!v || v.includes('`') || /\s/.test(v)) return false
  // IPv4 or IPv4/CIDR
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?:\/(?:3[0-2]|[12]?\d))?$/.test(v)) {
    const [ip, prefix] = v.split('/')
    const octets = ip.split('.').map(Number)
    if (octets.some((n) => n > 255)) return false
    if (prefix !== undefined && Number(prefix) > 32) return false
    return true
  }
  // Basic IPv6 / IPv6 CIDR (reject backticks; Traefik does final parse)
  if (v.includes(':') && /^[0-9a-fA-F:./]+$/.test(v) && !v.includes('..')) return true
  return false
}

export function mwDenyName(): string {
  return 'tpm-deny-all'
}

/** Emit HTTP + HTTPS deny routers (TLS routers never match plain HTTP). */
export function addDenyRouters(
  routers: Record<string, unknown>,
  opts: {
    sid: string
    suffix: string
    rule: string
    service: string
    priority: number
  },
): void {
  const { sid, suffix, rule, service, priority } = opts
  routers[`rt-${sid}-${suffix}-http`] = {
    rule,
    entryPoints: ['web'],
    middlewares: [mwDenyName()],
    service,
    priority,
  }
  routers[`rt-${sid}-${suffix}-https`] = {
    rule,
    entryPoints: ['websecure'],
    middlewares: [mwDenyName()],
    service,
    priority,
    tls: {},
  }
}

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

/** Deep-merge without prototype pollution. */
export function deepMergeSafe(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (DANGEROUS_KEYS.has(key)) continue
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key]) &&
      !DANGEROUS_KEYS.has(key)
    ) {
      deepMergeSafe(target[key] as Record<string, unknown>, value as Record<string, unknown>)
    } else if (!DANGEROUS_KEYS.has(key)) {
      target[key] = value
    }
  }
}
