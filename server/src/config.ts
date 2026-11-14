import { config as loadEnv } from 'dotenv'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

loadEnv()

function env(key: string, fallback = ''): string {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v.trim().replace(/^['"]|['"]$/g, '')
}

const dataDir = env('TPM_DATA_DIR', './data/tpm')

export const cfg = {
  appName: 'Traefik Proxy Manager',
  port: Number(env('APP_PORT', '8080')),
  host: env('APP_HOST', '0.0.0.0'),
  dataDir,
  sqlitePath: env('TPM_SQLITE_PATH', path.join(dataDir, 'tpm.db')),
  vhostsDir: env('TPM_VHOSTS_DIR', './configs/traefik/vhosts'),
  traefikStatic: env('TPM_TRAEFIK_STATIC', './configs/traefik/traefik.yml'),
  traefikAcme: env('TPM_TRAEFIK_ACME', './data/traefik/acme.json'),
  customCertsDir: env('TPM_CUSTOM_CERTS_DIR', path.join(dataDir, 'custom-certs')),
  webDir: env('TPM_WEB_DIR', './web/dist'),
  secretsKey: env('TPM_SECRETS_KEY', ''),
  /** How Traefik reaches TPM for dead-host pages (Compose: http://tpm:8080). */
  internalUrl: env('TPM_INTERNAL_URL', `http://127.0.0.1:${env('APP_PORT', '8080')}`),
  /** Host path to Traefik access log (Compose mounts logs/traefik). */
  accessLogPath: env('TPM_ACCESS_LOG', './logs/traefik/access.log'),
  backupsDir: env('TPM_BACKUP_DIR', path.join(dataDir, 'backups')),
  version: '1.0.0',
}

export function ensureDirs(): void {
  for (const dir of [
    cfg.dataDir,
    cfg.customCertsDir,
    cfg.vhostsDir,
    cfg.backupsDir,
    path.dirname(cfg.sqlitePath),
    path.dirname(cfg.traefikAcme),
    path.dirname(cfg.accessLogPath),
  ]) {
    mkdirSync(dir, { recursive: true })
  }
}
