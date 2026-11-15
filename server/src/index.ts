import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { cfg, ensureDirs } from './config.js'
import { closeDb, openDb } from './db.js'
import { registerRoutes } from './routes.js'
import { startSslChecker } from './ssl/checker.js'
import { repairDuplicateDomains } from './domains.js'
import { reRenderAllDeadHosts } from './dead-hosts.js'
import { reRenderAllHosts } from './hosts.js'
import { reRenderAllRedirects } from './redirections.js'
import { reRenderAllStreams } from './streams.js'
import { applyTraefikStatic } from './traefik/static.js'
import { renderSharedMiddlewares } from './traefik/middlewares.js'
import { seedDefaultWafProfiles } from './waf.js'

async function main() {
  ensureDirs()
  openDb()
  seedDefaultWafProfiles()
  const repaired = repairDuplicateDomains()
  renderSharedMiddlewares()
  reRenderAllHosts()
  reRenderAllRedirects()
  reRenderAllDeadHosts()
  reRenderAllStreams()
  applyTraefikStatic()
  startSslChecker()

  const app = Fastify({
    logger: true,
    ignoreTrailingSlash: true,
    // Honor X-Forwarded-Proto / X-Forwarded-For from Traefik (Secure cookie auto-detect).
    trustProxy: true,
  })
  if (repaired.disabled.length) {
    app.log.warn({ repaired: repaired.disabled }, 'disabled duplicate domain host rows')
  }

  await app.register(cookie)
  await registerRoutes(app)

  if (existsSync(path.join(cfg.webDir, 'index.html'))) {
    const webRoot = path.resolve(cfg.webDir)
    const assetsRoot = path.join(webRoot, 'assets')
    // Dedicated assets mount so Vite hash renames work without restarting Node.
    if (existsSync(assetsRoot)) {
      await app.register(fastifyStatic, {
        root: assetsRoot,
        prefix: '/assets/',
        decorateReply: false,
      })
    }
    await app.register(fastifyStatic, {
      root: webRoot,
      prefix: '/',
      wildcard: false,
      // index.html + favicon etc. at web root
    })
    app.setNotFoundHandler((req, reply) => {
      const url = (req.url || '').split('?')[0]
      // Never serve the admin SPA for parked-page / API / health / asset paths.
      if (
        url.startsWith('/api/') ||
        url.startsWith('/__tpm/') ||
        url.startsWith('/assets/') ||
        url === '/health' ||
        url === '/ready'
      ) {
        return reply.code(404).send({ error: 'not found' })
      }
      return reply.sendFile('index.html')
    })
  }

  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    app.log.info({ signal }, 'shutting down')
    try {
      await app.close()
    } catch (err) {
      app.log.error({ err }, 'error during http shutdown')
    }
    try {
      closeDb()
    } catch (err) {
      app.log.error({ err }, 'error closing sqlite')
    }
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  await app.listen({ port: cfg.port, host: cfg.host })
  app.log.info(`${cfg.appName} listening on ${cfg.host}:${cfg.port}`)
}

main().catch((err) => {
  console.error(err)
  try {
    closeDb()
  } catch {
    // ignore
  }
  process.exit(1)
})
