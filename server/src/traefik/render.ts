import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parse as parseYaml, stringify } from 'yaml'
import { getAccessListForRender, mwAccessAuthName, mwAccessIpName } from '../access-lists.js'
import { cfg } from '../config.js'
import { getDb } from '../db.js'
import type { ProxyHost } from '../hosts.js'
import { mwHeaderName, mwWafName } from './middlewares.js'
import {
  addDenyRouters,
  certResolverName,
  deepMergeSafe,
  escapeRuleLiteral,
  hostRule,
} from './rules.js'

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '')
}

/** Case-insensitive PathRegexp for file-like paths; PathPrefix for directory prefixes. */
function pathDenyRule(domains: string[], pathSpec: string): string {
  const p = escapeRuleLiteral(String(pathSpec || '').trim())
  if (!p) return hostRule(domains)
  const host = hostRule(domains)
  if (p.includes('.') && !p.endsWith('/')) {
    const re = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return `(${host}) && PathRegexp(\`(?i)^${re}(/.*)?$\`)`
  }
  return `(${host}) && PathPrefix(\`${p}\`)`
}

export function renderHostYaml(host: ProxyHost): string {
  mkdirSync(cfg.vhostsDir, { recursive: true })
  const sid = safeId(host.id)
  const serviceName = `svc-${sid}`
  const routerHttps = `rt-${sid}`
  const routerHttp = `rt-${sid}-http`
  const mwRedirect = `mw-${sid}-https`

  const chain: string[] = []
  for (const id of host.header_rule_ids) chain.push(mwHeaderName(id))
  for (const id of host.waf_profile_ids) {
    const row = getDb().prepare(`SELECT kind, enabled FROM waf_profiles WHERE id = ?`).get(id) as
      | { kind: string; enabled: number }
      | undefined
    if (!row || !row.enabled) continue
    // rate_limit is configured per-host below; skip shared rate_limit profiles
    if (row.kind === 'bot_ua_path' || row.kind === 'ip_deny' || row.kind === 'rate_limit') continue
    chain.push(mwWafName(id))
  }

  const routers: Record<string, unknown> = {}
  const middlewares: Record<string, unknown> = {}

  if (host.rate_limit_enabled) {
    const mwRate = `mw-${sid}-ratelimit`
    middlewares[mwRate] = {
      rateLimit: {
        average: host.rate_limit_average,
        burst: host.rate_limit_burst,
        period: host.rate_limit_period,
      },
    }
    chain.unshift(mwRate)
  }

  if (host.access_list_id) {
    const acl = getAccessListForRender(host.access_list_id)
    if (acl?.enabled) {
      const aclChain: string[] = []
      if (acl.hasIpAllow) aclChain.push(mwAccessIpName(acl.id))
      if (acl.hasAuth) aclChain.push(mwAccessAuthName(acl.id))
      chain.unshift(...aclChain)
    }
  }

  // Path rewrites (Traefik replacePathRegex) — applied in listed order before upstream.
  const rewriteNames: string[] = []
  for (const [i, rule] of (host.path_rewrites || []).entries()) {
    const mwName = `mw-${sid}-pathrewrite-${i}`
    middlewares[mwName] = {
      replacePathRegex: {
        regex: rule.regex,
        replacement: rule.replacement,
      },
    }
    rewriteNames.push(mwName)
  }
  if (rewriteNames.length) {
    chain.push(...rewriteNames)
  }

  if (host.ssl_forced) {
    middlewares[mwRedirect] = {
      redirectScheme: { scheme: 'https', permanent: true },
    }
    routers[routerHttp] = {
      rule: hostRule(host.domain_names),
      entryPoints: ['web'],
      middlewares: [mwRedirect],
      service: serviceName,
      priority: 1,
    }
  } else {
    routers[routerHttp] = {
      rule: hostRule(host.domain_names),
      entryPoints: ['web'],
      middlewares: chain.length ? chain : undefined,
      service: serviceName,
      priority: 1,
    }
  }

  const httpsRouter: Record<string, unknown> = {
    rule: hostRule(host.domain_names),
    entryPoints: ['websecure'],
    service: serviceName,
    priority: 10,
    tls: {},
    middlewares: chain.length ? chain : undefined,
  }
  const cr = certResolverName(host.cert_resolver)
  if (cr) {
    httpsRouter.tls = {
      certResolver: cr,
      domains: [{ main: host.domain_names[0], sans: host.domain_names.slice(1) }],
    }
  }
  routers[routerHttps] = httpsRouter

  // Bot UA / path / IP deny routers — dual HTTP+HTTPS (TLS routers never match plain HTTP)
  let prio = 100

  // Baseline sensitive-path denies on every proxy host (plugin-free).
  const BASELINE_SENSITIVE_PATHS = ['/.env', '/.git', '/.aws', '/wp-login.php']
  BASELINE_SENSITIVE_PATHS.forEach((p, i) => {
    addDenyRouters(routers, {
      sid,
      suffix: `basepath-${i}`,
      rule: pathDenyRule(host.domain_names, p),
      service: serviceName,
      priority: prio++,
    })
  })

  for (const id of host.waf_profile_ids) {
    const row = getDb().prepare(`SELECT kind, config_json, enabled FROM waf_profiles WHERE id = ?`).get(id) as
      | { kind: string; config_json: string; enabled: number }
      | undefined
    if (!row || !row.enabled) continue
    const conf = JSON.parse(row.config_json || '{}') as Record<string, unknown>
    if (row.kind === 'bot_ua_path') {
      const ua = escapeRuleLiteral(String(conf.ua_regex || ''))
      if (ua) {
        addDenyRouters(routers, {
          sid,
          suffix: 'botua',
          rule: `(${hostRule(host.domain_names)}) && HeaderRegexp(\`User-Agent\`, \`${ua}\`)`,
          service: serviceName,
          priority: prio++,
        })
      }
      const prefixes = (conf.path_prefixes as string[]) || []
      prefixes.forEach((p, i) => {
        addDenyRouters(routers, {
          sid,
          suffix: `path-${i}`,
          rule: pathDenyRule(host.domain_names, p),
          service: serviceName,
          priority: prio++,
        })
      })
    }
    if (row.kind === 'ip_deny') {
      const blocked = (conf.blocked as string[]) || []
      blocked.forEach((ip, i) => {
        addDenyRouters(routers, {
          sid,
          suffix: `denyip-${i}`,
          rule: `(${hostRule(host.domain_names)}) && ClientIP(\`${escapeRuleLiteral(ip)}\`)`,
          service: serviceName,
          priority: prio++,
        })
      })
    }
  }

  if (host.access_list_id) {
    const acl = getAccessListForRender(host.access_list_id)
    if (acl?.enabled) {
      acl.deny.forEach((ip, i) => {
        addDenyRouters(routers, {
          sid,
          suffix: `acl-denyip-${i}`,
          rule: `(${hostRule(host.domain_names)}) && ClientIP(\`${escapeRuleLiteral(ip)}\`)`,
          service: serviceName,
          priority: prio++,
        })
      })
    }
  }

  const doc: Record<string, unknown> = {
    http: {
      routers,
      middlewares: Object.keys(middlewares).length ? middlewares : undefined,
      services: {
        [serviceName]: {
          loadBalancer: {
            servers: [
              {
                url: `${host.forward_scheme}://${host.forward_host}:${host.forward_port}`,
              },
            ],
            passHostHeader: true,
          },
        },
      },
    },
  }

  const snip = (host.advanced_yaml || '').trim()
  if (snip) {
    const extra = parseYaml(snip) as Record<string, unknown>
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      deepMergeSafe(doc, extra)
    }
  }

  const yaml = `# generated by tpm — do not edit\n${stringify(doc)}`
  const finalPath = path.join(cfg.vhostsDir, `${sid}.yml`)
  const tmpPath = `${finalPath}.tmp`
  writeFileSync(tmpPath, yaml, 'utf8')
  renameSync(tmpPath, finalPath)
  return finalPath
}

export function removeHostYaml(id: string): void {
  const finalPath = path.join(cfg.vhostsDir, `${safeId(id)}.yml`)
  try {
    unlinkSync(finalPath)
  } catch {
    // ignore missing
  }
}
