import { execFile } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { promisify } from 'node:util'
import { cfg } from './config.js'
import { closeDb, getDb, openDb } from './db.js'
import { reRenderAllDeadHosts } from './dead-hosts.js'
import { reRenderAllHosts } from './hosts.js'
import { reRenderAllRedirects } from './redirections.js'
import { reRenderAllStreams } from './streams.js'
import { renderSharedMiddlewares } from './traefik/middlewares.js'
import { applyTraefikStatic } from './traefik/static.js'

const execFileAsync = promisify(execFile)

export type BackupInfo = {
  name: string
  size: number
  created_at: string
}

function safeName(name: string): string {
  const base = path.basename(name)
  if (!/^tpm-[\w.-]+\.tar\.gz$/.test(base)) {
    throw new Error('invalid backup name')
  }
  return base
}

export function listBackups(): BackupInfo[] {
  mkdirSync(cfg.backupsDir, { recursive: true })
  return readdirSync(cfg.backupsDir)
    .filter((n) => n.endsWith('.tar.gz') && n.startsWith('tpm-'))
    .map((name) => {
      const st = statSync(path.join(cfg.backupsDir, name))
      return {
        name,
        size: st.size,
        created_at: st.mtime.toISOString(),
      }
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function backupPath(name: string): string {
  return path.join(cfg.backupsDir, safeName(name))
}

/** Walk staging tree; reject symlinks and path escape. */
function assertSafeTree(root: string): void {
  const absRoot = path.resolve(root)
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = lstatSync(full)
      if (!path.resolve(full).startsWith(absRoot + path.sep) && path.resolve(full) !== absRoot) {
        throw new Error(`archive path escape: ${name}`)
      }
      if (st.isSymbolicLink()) {
        throw new Error(`archive contains symlink: ${path.relative(absRoot, full)}`)
      }
      if (st.isDirectory()) walk(full)
    }
  }
  walk(absRoot)
}

function assertSqliteFile(filePath: string): void {
  const hdr = readFileSync(filePath).subarray(0, 16).toString('utf8')
  if (!hdr.startsWith('SQLite format 3')) {
    throw new Error('archive tpm.db is not a SQLite database')
  }
  const tmp = new DatabaseSync(filePath, { readOnly: true })
  try {
    const row = tmp.prepare('PRAGMA integrity_check').get() as Record<string, string> | undefined
    const result = row ? String(Object.values(row)[0] ?? '') : ''
    if (result !== 'ok') throw new Error('sqlite integrity_check failed')
  } finally {
    tmp.close()
  }
}

/** Create tar.gz with SQLite snapshot + custom-certs + acme.json when present. */
export async function createBackup(): Promise<BackupInfo> {
  mkdirSync(cfg.backupsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  const name = `tpm-${stamp}.tar.gz`
  const staging = path.join(cfg.backupsDir, `.staging-${stamp}`)
  const out = path.join(cfg.backupsDir, name)

  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  try {
    const db = getDb() as { serialize?: () => Buffer; exec: (sql: string) => void }
    const snapPath = path.join(staging, 'tpm.db')
    if (typeof db.serialize === 'function') {
      writeFileSync(snapPath, db.serialize())
    } else {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      copyFileSync(cfg.sqlitePath, snapPath)
    }
    chmodSync(snapPath, 0o600)

    if (existsSync(cfg.customCertsDir)) {
      cpSync(cfg.customCertsDir, path.join(staging, 'custom-certs'), { recursive: true })
    }

    if (existsSync(cfg.traefikAcme)) {
      mkdirSync(path.join(staging, 'traefik'), { recursive: true })
      copyFileSync(cfg.traefikAcme, path.join(staging, 'traefik', 'acme.json'))
      chmodSync(path.join(staging, 'traefik', 'acme.json'), 0o600)
    }

    writeFileSync(
      path.join(staging, 'manifest.json'),
      JSON.stringify(
        {
          created_at: new Date().toISOString(),
          app: cfg.appName,
          version: cfg.version,
          includes: {
            sqlite: true,
            custom_certs: existsSync(path.join(staging, 'custom-certs')),
            acme: existsSync(path.join(staging, 'traefik', 'acme.json')),
          },
        },
        null,
        2,
      ),
    )

    await execFileAsync('tar', ['-czf', out, '-C', staging, '.'], { shell: false })
    chmodSync(out, 0o600)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }

  const st = statSync(out)
  return { name, size: st.size, created_at: st.mtime.toISOString() }
}

export function saveUploadedBackup(name: string, data: Buffer): BackupInfo {
  mkdirSync(cfg.backupsDir, { recursive: true })
  const safe = safeName(name)
  const dest = path.join(cfg.backupsDir, safe)
  const tmp = `${dest}.tmp`
  writeFileSync(tmp, data)
  chmodSync(tmp, 0o600)
  renameSync(tmp, dest)
  const st = statSync(dest)
  return { name: safe, size: st.size, created_at: st.mtime.toISOString() }
}

export function deleteBackup(name: string): boolean {
  const p = backupPath(name)
  if (!existsSync(p)) return false
  rmSync(p)
  return true
}

/**
 * Restore SQLite (+ optional certs/acme) from a named backup archive.
 * Closes and reopens the DB; re-renders Traefik YAML afterward.
 */
export async function restoreBackup(name: string): Promise<{ restored: string[] }> {
  const archive = backupPath(name)
  if (!existsSync(archive)) throw new Error('backup not found')

  const staging = path.join(cfg.backupsDir, `.restore-${Date.now()}`)
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })

  const restored: string[] = []
  let dbClosed = false

  try {
    await execFileAsync(
      'tar',
      ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', staging],
      { shell: false },
    )
    assertSafeTree(staging)

    const dbSrc = path.join(staging, 'tpm.db')
    if (!existsSync(dbSrc) || lstatSync(dbSrc).isSymbolicLink()) {
      throw new Error('archive missing tpm.db')
    }
    assertSqliteFile(dbSrc)

    const bakPath = `${cfg.sqlitePath}.pre-restore`
    if (existsSync(cfg.sqlitePath)) {
      copyFileSync(cfg.sqlitePath, bakPath)
      chmodSync(bakPath, 0o600)
    }

    closeDb()
    dbClosed = true

    mkdirSync(path.dirname(cfg.sqlitePath), { recursive: true })
    for (const suffix of ['-wal', '-shm']) {
      const p = `${cfg.sqlitePath}${suffix}`
      if (existsSync(p)) rmSync(p)
    }
    copyFileSync(dbSrc, cfg.sqlitePath)
    chmodSync(cfg.sqlitePath, 0o600)
    restored.push('sqlite')

    const certsSrc = path.join(staging, 'custom-certs')
    if (existsSync(certsSrc)) {
      if (lstatSync(certsSrc).isSymbolicLink()) throw new Error('custom-certs symlink rejected')
      mkdirSync(cfg.customCertsDir, { recursive: true })
      for (const ent of readdirSync(cfg.customCertsDir)) {
        rmSync(path.join(cfg.customCertsDir, ent), { recursive: true, force: true })
      }
      cpSync(certsSrc, cfg.customCertsDir, { recursive: true })
      restored.push('custom-certs')
    }

    const acmeSrc = path.join(staging, 'traefik', 'acme.json')
    if (existsSync(acmeSrc)) {
      if (lstatSync(acmeSrc).isSymbolicLink()) throw new Error('acme.json symlink rejected')
      mkdirSync(path.dirname(cfg.traefikAcme), { recursive: true })
      copyFileSync(acmeSrc, cfg.traefikAcme)
      chmodSync(cfg.traefikAcme, 0o600)
      restored.push('acme.json')
    }

    openDb()
    dbClosed = false

    renderSharedMiddlewares()
    reRenderAllHosts()
    reRenderAllRedirects()
    reRenderAllDeadHosts()
    reRenderAllStreams()
    applyTraefikStatic()
  } catch (err) {
    if (dbClosed) {
      try {
        openDb()
      } catch {
        // leave crash visible if DB truly broken
      }
    }
    throw err
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }

  return { restored }
}
