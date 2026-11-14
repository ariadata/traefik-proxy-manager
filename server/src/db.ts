import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { cfg } from './config.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dns_resolvers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  acme_email TEXT NOT NULL DEFAULT '',
  challenge TEXT NOT NULL DEFAULT 'dns01',
  credentials_enc BLOB,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  domain_names TEXT NOT NULL,
  resolver_id TEXT REFERENCES dns_resolvers(id) ON DELETE SET NULL,
  cert_path TEXT,
  key_path TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  expires_at TEXT,
  last_checked_at TEXT,
  fingerprint TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proxy_hosts (
  id TEXT PRIMARY KEY,
  domain_names TEXT NOT NULL,
  forward_scheme TEXT NOT NULL,
  forward_host TEXT NOT NULL,
  forward_port INTEGER NOT NULL,
  upstreams TEXT NOT NULL DEFAULT '[]',
  health_check_enabled INTEGER NOT NULL DEFAULT 0,
  health_check_path TEXT NOT NULL DEFAULT '/',
  health_check_interval TEXT NOT NULL DEFAULT '30s',
  health_check_timeout TEXT NOT NULL DEFAULT '5s',
  certificate_id TEXT REFERENCES certificates(id) ON DELETE SET NULL,
  cert_resolver TEXT NOT NULL DEFAULT '',
  ssl_forced INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  waf_profile_ids TEXT NOT NULL DEFAULT '[]',
  header_rule_ids TEXT NOT NULL DEFAULT '[]',
  rate_limit_enabled INTEGER NOT NULL DEFAULT 0,
  rate_limit_average INTEGER NOT NULL DEFAULT 100,
  rate_limit_burst INTEGER NOT NULL DEFAULT 50,
  rate_limit_period TEXT NOT NULL DEFAULT '1m',
  path_rewrites TEXT NOT NULL DEFAULT '[]',
  extra_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proxy_hosts_enabled ON proxy_hosts(enabled);

CREATE TABLE IF NOT EXISTS header_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  header_name TEXT NOT NULL,
  header_value TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS waf_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  satisfy TEXT NOT NULL DEFAULT 'all',
  pass_auth INTEGER NOT NULL DEFAULT 0,
  clients_json TEXT NOT NULL DEFAULT '[]',
  auth_users_enc BLOB,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS redirection_hosts (
  id TEXT PRIMARY KEY,
  domain_names TEXT NOT NULL,
  forward_scheme TEXT NOT NULL DEFAULT 'https',
  forward_host TEXT NOT NULL,
  forward_path TEXT NOT NULL DEFAULT '/',
  preserve_path INTEGER NOT NULL DEFAULT 1,
  status_code INTEGER NOT NULL DEFAULT 301,
  cert_resolver TEXT NOT NULL DEFAULT '',
  certificate_id TEXT REFERENCES certificates(id) ON DELETE SET NULL,
  ssl_forced INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  access_list_id TEXT REFERENCES access_lists(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_redirection_hosts_enabled ON redirection_hosts(enabled);

CREATE TABLE IF NOT EXISTS dead_hosts (
  id TEXT PRIMARY KEY,
  domain_names TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 404,
  body_html TEXT NOT NULL DEFAULT '',
  cert_resolver TEXT NOT NULL DEFAULT '',
  certificate_id TEXT REFERENCES certificates(id) ON DELETE SET NULL,
  ssl_forced INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  access_list_id TEXT REFERENCES access_lists(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dead_hosts_enabled ON dead_hosts(enabled);

CREATE TABLE IF NOT EXISTS streams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  protocol TEXT NOT NULL,
  entry_port INTEGER NOT NULL,
  forward_host TEXT NOT NULL,
  forward_port INTEGER NOT NULL,
  sni_hosts TEXT NOT NULL DEFAULT '[]',
  tls_mode TEXT NOT NULL DEFAULT 'off',
  cert_resolver TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_streams_enabled ON streams(enabled);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_log_at ON audit_log(at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_certificates_status_expires ON certificates(status, expires_at);
`

let db: DatabaseSync | null = null

export function openDb(): DatabaseSync {
  mkdirSync(path.dirname(cfg.sqlitePath), { recursive: true })
  db = new DatabaseSync(cfg.sqlitePath)
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')
  db.exec('PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)

  const cols = db.prepare(`PRAGMA table_info(proxy_hosts)`).all() as { name: string }[]
  const colNames = new Set(cols.map((c) => c.name))
  if (!colNames.has('cert_resolver')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN cert_resolver TEXT NOT NULL DEFAULT ''`)
  }
  if (!colNames.has('rate_limit_enabled')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN rate_limit_enabled INTEGER NOT NULL DEFAULT 0`)
  }
  if (!colNames.has('rate_limit_average')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN rate_limit_average INTEGER NOT NULL DEFAULT 100`)
  }
  if (!colNames.has('rate_limit_burst')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN rate_limit_burst INTEGER NOT NULL DEFAULT 50`)
  }
  if (!colNames.has('rate_limit_period')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN rate_limit_period TEXT NOT NULL DEFAULT '1m'`)
  }
  if (!colNames.has('access_list_id')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN access_list_id TEXT`)
  }
  if (!colNames.has('advanced_yaml')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN advanced_yaml TEXT NOT NULL DEFAULT ''`)
  }
  if (!colNames.has('path_rewrites')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN path_rewrites TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!colNames.has('upstreams')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN upstreams TEXT NOT NULL DEFAULT '[]'`)
  }
  if (!colNames.has('health_check_enabled')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN health_check_enabled INTEGER NOT NULL DEFAULT 0`)
  }
  if (!colNames.has('health_check_path')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN health_check_path TEXT NOT NULL DEFAULT '/'`)
  }
  if (!colNames.has('health_check_interval')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN health_check_interval TEXT NOT NULL DEFAULT '30s'`)
  }
  if (!colNames.has('health_check_timeout')) {
    db.exec(`ALTER TABLE proxy_hosts ADD COLUMN health_check_timeout TEXT NOT NULL DEFAULT '5s'`)
  }
  // Seed upstreams JSON from legacy single forward_* columns when empty.
  const seedRows = db
    .prepare(
      `SELECT id, forward_scheme, forward_host, forward_port, upstreams
       FROM proxy_hosts
       WHERE upstreams IS NULL OR upstreams = '' OR upstreams = '[]'`,
    )
    .all() as {
    id: string
    forward_scheme: string
    forward_host: string
    forward_port: number
    upstreams: string
  }[]
  const seedStmt = db.prepare(`UPDATE proxy_hosts SET upstreams = ? WHERE id = ?`)
  for (const row of seedRows) {
    seedStmt.run(
      JSON.stringify([
        {
          scheme: row.forward_scheme === 'https' ? 'https' : 'http',
          host: row.forward_host,
          port: Number(row.forward_port) || 80,
          weight: 1,
        },
      ]),
      row.id,
    )
  }

  // Drop any leftover columns not in the current schema (SQLite 3.35+).
  const proxyHostCols = new Set([
    'id',
    'domain_names',
    'forward_scheme',
    'forward_host',
    'forward_port',
    'upstreams',
    'health_check_enabled',
    'health_check_path',
    'health_check_interval',
    'health_check_timeout',
    'certificate_id',
    'cert_resolver',
    'ssl_forced',
    'enabled',
    'waf_profile_ids',
    'header_rule_ids',
    'rate_limit_enabled',
    'rate_limit_average',
    'rate_limit_burst',
    'rate_limit_period',
    'path_rewrites',
    'extra_json',
    'created_at',
    'updated_at',
    'access_list_id',
    'advanced_yaml',
  ])
  const latestCols = db.prepare(`PRAGMA table_info(proxy_hosts)`).all() as { name: string }[]
  for (const { name } of latestCols) {
    if (!proxyHostCols.has(name)) {
      db.exec(`ALTER TABLE proxy_hosts DROP COLUMN "${name.replace(/"/g, '""')}"`)
    }
  }
  return db
}

export function getDb(): DatabaseSync {
  if (!db) throw new Error('database not open')
  return db
}

export function closeDb(): void {
  if (!db) return
  try {
    db.close()
  } finally {
    db = null
  }
}
