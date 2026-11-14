import { createReadStream, existsSync } from 'node:fs'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { tailAccessLog } from './access-log.js'
import {
  backupPath,
  createBackup,
  deleteBackup,
  listBackups,
  restoreBackup,
  saveUploadedBackup,
} from './backup.js'
import {
  adminFromSession,
  changePassword,
  checkLoginRateLimit,
  clearLoginRateLimit,
  recordLoginFailure,
  clearSessionCookie,
  countAdmins,
  createAdmin,
  createSession,
  SESSION_TTL_DEFAULT_MS,
  SESSION_TTL_REMEMBER_MS,
  deleteSession,
  pruneExpiredSessions,
  readSessionId,
  requireAuth,
  setSessionCookie,
  verifyLogin,
} from './auth.js'
import { cfg } from './config.js'
import { getDb } from './db.js'
import {
  createCustomCertificate,
  deleteCertificate,
  listCertificates,
  parseCertInput,
} from './certs.js'
import {
  createAccessList,
  deleteAccessList,
  getAccessList,
  listAccessLists,
  parseAccessListInput,
  updateAccessList,
} from './access-lists.js'
import { listAudit, recordAudit } from './audit.js'
import {
  createDeadHost,
  defaultDeadHtml,
  deleteDeadHost,
  getDeadHost,
  listDeadHosts,
  parseDeadHostInput,
  updateDeadHost,
} from './dead-hosts.js'
import {
  createStream,
  deleteStream,
  getStream,
  listStreams,
  parseStreamInput,
  updateStream,
} from './streams.js'
import {
  createHeaderRule,
  deleteHeaderRule,
  listHeaderRules,
  parseHeaderInput,
  updateHeaderRule,
} from './headers.js'
import { createHost, deleteHost, getHost, listHosts, parseHostInput, updateHost } from './hosts.js'
import { PROVIDERS } from './providers.js'
import {
  createRedirection,
  deleteRedirection,
  getRedirection,
  listRedirections,
  parseRedirectionInput,
  updateRedirection,
} from './redirections.js'
import {
  createResolver,
  deleteResolver,
  listResolvers,
  parseResolverInput,
  updateResolver,
} from './resolvers.js'
import { secretsConfigured } from './secrets.js'
import { listSslChecks, runSslChecks } from './ssl/checker.js'
import {
  createWafProfile,
  deleteWafProfile,
  listWafProfiles,
  parseWafInput,
  updateWafProfile,
} from './waf.js'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const startedAt = Date.now()

  app.addContentTypeParser(
    ['application/gzip', 'application/x-gzip', 'application/octet-stream'],
    { parseAs: 'buffer' },
    (_req, body, done) => {
      done(null, body)
    },
  )

  // CSRF: reject cross-origin mutating API calls (cookie session).
  app.addHook('preHandler', async (req, reply) => {
    const method = req.method.toUpperCase()
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return
    const pathOnly = (req.url || '').split('?')[0]
    if (!pathOnly.startsWith('/api/v1/')) return
    if (
      pathOnly === '/api/v1/login' ||
      pathOnly === '/api/v1/logout' ||
      pathOnly === '/api/v1/setup'
    ) {
      return
    }

    const site = String(req.headers['sec-fetch-site'] || '')
    if (site === 'cross-site') {
      return reply.code(403).send({ error: 'cross-site request blocked' })
    }

    const origin = req.headers.origin
    if (!origin) return
    let originHost: string
    let originHostname: string
    try {
      const u = new URL(origin)
      originHost = u.host
      originHostname = u.hostname
    } catch {
      return reply.code(403).send({ error: 'invalid origin' })
    }
    const reqHost = req.headers.host || ''
    const reqHostname = reqHost.split(':')[0]
    if (originHost !== reqHost && originHostname !== reqHostname) {
      return reply.code(403).send({ error: 'cross-origin request blocked' })
    }
  })

  // Panel security headers (CSP on HTML).
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('X-Frame-Options', 'DENY')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    const ct = String(reply.getHeader('content-type') || '')
    const pathOnly = (req.url || '').split('?')[0]
    if (ct.includes('text/html') || pathOnly === '/' || pathOnly.endsWith('.html')) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      )
    }
    return payload
  })

  app.addHook('onResponse', (req, reply, done) => {
    try {
      const method = req.method
      if (method !== 'POST' && method !== 'PUT' && method !== 'DELETE' && method !== 'PATCH') {
        done()
        return
      }
      if (reply.statusCode >= 400) {
        done()
        return
      }
      const pathOnly = (req.url || '').split('?')[0]
      if (!pathOnly.startsWith('/api/v1/')) {
        done()
        return
      }
      if (
        pathOnly === '/api/v1/login' ||
        pathOnly === '/api/v1/logout' ||
        pathOnly === '/api/v1/setup' ||
        pathOnly.endsWith('/run')
      ) {
        done()
        return
      }
      const parts = pathOnly.split('/').filter(Boolean)
      const entity = parts[2] || 'api'
      const entityId = parts[3] || ''
      const admin = adminFromSession(readSessionId(req))
      recordAudit({
        actor: admin?.username || 'anonymous',
        action: method === 'POST' ? 'create' : method === 'PUT' || method === 'PATCH' ? 'update' : 'delete',
        entity,
        entity_id: entityId,
        summary: `${method} ${pathOnly}`,
      })
    } catch {
      // never fail the response for audit
    }
    done()
  })

  app.get('/health', async () => ({ status: 'ok', app: cfg.appName }))

  app.get('/ready', async (_req, reply) => {
    try {
      getDb().prepare('SELECT 1').get()
      return { status: 'ready' }
    } catch {
      return reply.code(503).send({ status: 'not_ready', error: 'sqlite unavailable' })
    }
  })

  app.get('/api/v1/health', async () => ({ status: 'ok', app: cfg.appName }))
  app.get('/api/v1/ready', async (_req, reply) => {
    try {
      getDb().prepare('SELECT 1').get()
      return { status: 'ready' }
    } catch {
      return reply.code(503).send({ status: 'not_ready' })
    }
  })

  app.get('/api/v1/status', async (req) => {
    const admin = adminFromSession(readSessionId(req))
    return {
      app: cfg.appName,
      version: cfg.version,
      runtime: `node ${process.version}`,
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      setup_required: countAdmins() === 0,
      authenticated: !!admin,
      username: admin?.username ?? null,
      secrets_configured: secretsConfigured(),
      paths: {
        sqlite: cfg.sqlitePath,
        vhosts: cfg.vhostsDir,
        web: cfg.webDir,
        web_exists: existsSync(cfg.webDir),
        acme: cfg.traefikAcme,
        static: cfg.traefikStatic,
        access_log: cfg.accessLogPath,
        backups: cfg.backupsDir,
      },
    }
  })

  app.post('/api/v1/setup', async (req, reply) => {
    if (countAdmins() > 0) {
      return reply.code(409).send({ error: 'setup already completed' })
    }
    const body = req.body as { username?: string; password?: string; remember?: boolean }
    if (!body?.username || !body?.password || body.password.length < 8) {
      return reply.code(400).send({ error: 'username and password (min 8) required' })
    }
    const remember = body.remember === true
    const ttlMs = remember ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_DEFAULT_MS
    const admin = await createAdmin(body.username, body.password)
    const sid = createSession(admin.id, ttlMs)
    setSessionCookie(reply, req, sid, remember ? Math.floor(ttlMs / 1000) : undefined)
    recordAudit({
      actor: admin.username,
      action: 'create',
      entity: 'setup',
      entity_id: String(admin.id),
      summary: 'initial admin setup',
    })
    return { ok: true, username: admin.username }
  })

  app.post('/api/v1/login', async (req, reply) => {
    const ip = req.ip || 'unknown'
    if (!checkLoginRateLimit(ip)) {
      recordAudit({
        actor: 'anonymous',
        action: 'login_rate_limited',
        entity: 'auth',
        summary: `rate limited from ${ip}`,
      })
      return reply.code(429).send({ error: 'too many login attempts' })
    }
    const body = req.body as { username?: string; password?: string; remember?: boolean }
    if (!body?.username || !body?.password) {
      return reply.code(400).send({ error: 'username and password required' })
    }
    const admin = await verifyLogin(body.username, body.password)
    if (!admin) {
      recordLoginFailure(ip)
      recordAudit({
        actor: body.username,
        action: 'login_failed',
        entity: 'auth',
        summary: `failed login from ${ip}`,
      })
      return reply.code(401).send({ error: 'invalid credentials' })
    }
    clearLoginRateLimit(ip)
    pruneExpiredSessions()
    const remember = body.remember === true
    const ttlMs = remember ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_DEFAULT_MS
    const sid = createSession(admin.id, ttlMs)
    setSessionCookie(reply, req, sid, remember ? Math.floor(ttlMs / 1000) : undefined)
    recordAudit({
      actor: admin.username,
      action: 'login',
      entity: 'auth',
      entity_id: String(admin.id),
      summary: `login from ${ip}`,
    })
    return { ok: true, username: admin.username }
  })

  app.post('/api/v1/logout', async (req, reply) => {
    const sid = readSessionId(req)
    const admin = adminFromSession(sid)
    if (sid) deleteSession(sid)
    clearSessionCookie(reply)
    recordAudit({
      actor: admin?.username || 'anonymous',
      action: 'logout',
      entity: 'auth',
      summary: 'logout',
    })
    return { ok: true }
  })

  app.get('/api/v1/me', async (req, reply) => {
    const admin = await requireAuth(req, reply)
    if (!admin) return
    return { id: admin.id, username: admin.username }
  })

  app.post('/api/v1/me/password', async (req, reply) => {
    const admin = await requireAuth(req, reply)
    if (!admin) return
    const body = req.body as { current_password?: string; new_password?: string }
    if (!body?.current_password || !body?.new_password) {
      return reply.code(400).send({ error: 'current_password and new_password required' })
    }
    try {
      await changePassword(admin.id, body.current_password, body.new_password)
      clearSessionCookie(reply)
      recordAudit({
        actor: admin.username,
        action: 'update',
        entity: 'password',
        entity_id: String(admin.id),
        summary: 'password changed; sessions revoked',
      })
      return { ok: true, reauth: true }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  // Public page served for dead hosts (Traefik upstream) — no auth
  app.get('/__tpm/dead/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const host = getDeadHost(id)
    if (!host || !host.enabled) return reply.code(404).type('text/plain').send('not found')
    const html = host.body_html.trim() || defaultDeadHtml(host.status_code)
    return reply.code(host.status_code).type('text/html; charset=utf-8').send(html)
  })

  app.get('/api/v1/hosts', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listHosts() }
  })

  app.get('/api/v1/hosts/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    const host = getHost(id)
    if (!host) return reply.code(404).send({ error: 'not found' })
    return host
  })

  app.post('/api/v1/hosts', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const input = parseHostInput(req.body)
      const host = createHost(input)
      return reply.code(201).send(host)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.put('/api/v1/hosts/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    try {
      const input = parseHostInput(req.body)
      const host = updateHost(id, input)
      if (!host) return reply.code(404).send({ error: 'not found' })
      return host
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/hosts/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    if (!deleteHost(id)) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  app.get('/api/v1/providers', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: PROVIDERS }
  })

  app.get('/api/v1/resolvers', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listResolvers(), secrets_configured: secretsConfigured() }
  })

  app.post('/api/v1/resolvers', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const input = parseResolverInput(req.body)
      const result = createResolver(input)
      return reply.code(201).send(result)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.put('/api/v1/resolvers/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    try {
      const input = parseResolverInput(req.body)
      const result = updateResolver(id, input)
      if (!result) return reply.code(404).send({ error: 'not found' })
      return result
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/resolvers/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    const result = deleteResolver(id)
    if (!result.ok) return reply.code(404).send({ error: 'not found' })
    return result
  })

  app.get('/api/v1/ssl/checks', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listSslChecks() }
  })

  app.post('/api/v1/ssl/checks/run', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const items = await runSslChecks()
    return { items }
  })

  app.get('/api/v1/certificates', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listCertificates() }
  })

  app.post('/api/v1/certificates', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const input = parseCertInput(req.body)
      const cert = createCustomCertificate(input)
      return reply.code(201).send(cert)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/certificates/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    if (!deleteCertificate(id)) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  app.get('/api/v1/headers', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listHeaderRules() }
  })

  app.post('/api/v1/headers', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const rule = createHeaderRule(parseHeaderInput(req.body))
      return reply.code(201).send(rule)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.put('/api/v1/headers/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    try {
      const rule = updateHeaderRule(id, parseHeaderInput(req.body))
      if (!rule) return reply.code(404).send({ error: 'not found' })
      return rule
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/headers/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    if (!deleteHeaderRule(id)) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  app.get('/api/v1/waf', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listWafProfiles() }
  })

  app.post('/api/v1/waf', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const profile = createWafProfile(parseWafInput(req.body))
      return reply.code(201).send(profile)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.put('/api/v1/waf/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    try {
      const profile = updateWafProfile(id, parseWafInput(req.body))
      if (!profile) return reply.code(404).send({ error: 'not found' })
      return profile
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/waf/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    if (!deleteWafProfile(id)) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  app.get('/api/v1/access-lists', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listAccessLists() }
  })

  app.get('/api/v1/access-lists/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    const item = getAccessList(id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    return item
  })

  app.post('/api/v1/access-lists', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const item = createAccessList(parseAccessListInput(req.body))
      return reply.code(201).send(item)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.put('/api/v1/access-lists/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    try {
      const item = updateAccessList(id, parseAccessListInput(req.body))
      if (!item) return reply.code(404).send({ error: 'not found' })
      return item
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/access-lists/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    if (!deleteAccessList(id)) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  app.get('/api/v1/redirections', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listRedirections() }
  })

  app.get('/api/v1/redirections/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    const item = getRedirection(id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    return item
  })

  app.post('/api/v1/redirections', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const item = createRedirection(parseRedirectionInput(req.body))
      return reply.code(201).send(item)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.put('/api/v1/redirections/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    try {
      const item = updateRedirection(id, parseRedirectionInput(req.body))
      if (!item) return reply.code(404).send({ error: 'not found' })
      return item
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/redirections/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    if (!deleteRedirection(id)) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  app.get('/api/v1/dead-hosts', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listDeadHosts() }
  })

  app.get('/api/v1/dead-hosts/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    const item = getDeadHost(id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    return item
  })

  app.post('/api/v1/dead-hosts', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const item = createDeadHost(parseDeadHostInput(req.body))
      return reply.code(201).send(item)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.put('/api/v1/dead-hosts/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    try {
      const item = updateDeadHost(id, parseDeadHostInput(req.body))
      if (!item) return reply.code(404).send({ error: 'not found' })
      return item
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/dead-hosts/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    if (!deleteDeadHost(id)) return reply.code(404).send({ error: 'not found' })
    return reply.code(204).send()
  })

  app.get('/api/v1/streams', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listStreams() }
  })

  app.get('/api/v1/streams/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    const item = getStream(id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    return item
  })

  app.post('/api/v1/streams', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const result = createStream(parseStreamInput(req.body))
      return reply.code(201).send(result)
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.put('/api/v1/streams/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    try {
      const result = updateStream(id, parseStreamInput(req.body))
      if (!result) return reply.code(404).send({ error: 'not found' })
      return result
    } catch (err) {
      if (err instanceof ZodError) {
        return reply.code(400).send({ error: 'validation failed', details: err.flatten() })
      }
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/streams/:id', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { id } = req.params as { id: string }
    const result = deleteStream(id)
    if (!result.ok) return reply.code(404).send({ error: 'not found' })
    return result
  })

  app.get('/api/v1/audit', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const q = req.query as { limit?: string }
    const limit = q.limit ? Number(q.limit) : 200
    return { items: listAudit(Number.isFinite(limit) ? limit : 200) }
  })

  app.get('/api/v1/access-log', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const q = req.query as { lines?: string }
    const lines = q.lines ? Number(q.lines) : 200
    return tailAccessLog(Number.isFinite(lines) ? lines : 200)
  })

  app.get('/api/v1/backups', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    return { items: listBackups() }
  })

  app.post('/api/v1/backups', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    try {
      const item = await createBackup()
      return reply.code(201).send(item)
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message })
    }
  })

  app.get('/api/v1/backups/:name', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { name } = req.params as { name: string }
    try {
      const p = backupPath(name)
      if (!existsSync(p)) return reply.code(404).send({ error: 'not found' })
      reply.header('Content-Type', 'application/gzip')
      reply.header('Content-Disposition', `attachment; filename="${path.basename(p)}"`)
      return reply.send(createReadStream(p))
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post('/api/v1/backups/upload', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const q = req.query as { name?: string }
    const name = q.name || `tpm-upload-${Date.now()}.tar.gz`
    const body = req.body
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return reply.code(400).send({ error: 'gzip body required' })
    }
    try {
      const item = saveUploadedBackup(name, body)
      return reply.code(201).send(item)
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.post('/api/v1/backups/restore', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const body = req.body as { name?: string }
    if (!body?.name) return reply.code(400).send({ error: 'name required' })
    try {
      const result = await restoreBackup(body.name)
      return { ok: true, ...result }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })

  app.delete('/api/v1/backups/:name', async (req, reply) => {
    if (!(await requireAuth(req, reply))) return
    const { name } = req.params as { name: string }
    try {
      if (!deleteBackup(name)) return reply.code(404).send({ error: 'not found' })
      return { ok: true }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message })
    }
  })
}
