# SQLite schema

WAL mode. Applied on boot from `server/src/db.ts`.

## Core

### `admins`

| Column | Type | Notes |
|--------|------|--------|
| id | INTEGER PK | Single administrator |
| username | TEXT UNIQUE | |
| password_hash | TEXT | bcrypt |
| created_at / updated_at | TEXT | RFC3339 |

### `sessions`

| Column | Type | Notes |
|--------|------|--------|
| id | TEXT PK | Opaque session id |
| admin_id | INTEGER FK → admins | ON DELETE CASCADE |
| expires_at / created_at | TEXT | |

### `settings`

| Column | Type | Notes |
|--------|------|--------|
| key | TEXT PK | |
| value | TEXT | |

## SSL

### `dns_resolvers`

| Column | Type | Notes |
|--------|------|--------|
| id | TEXT PK | |
| name | TEXT UNIQUE | Traefik resolver name |
| provider | TEXT | lego provider id |
| acme_email | TEXT | |
| challenge | TEXT | `dns01` / `http01` / `tlsalpn01` |
| credentials_enc | BLOB | Encrypted JSON map |
| is_default | INTEGER | |
| created_at / updated_at | TEXT | |

### `certificates`

| Column | Type | Notes |
|--------|------|--------|
| id | TEXT PK | |
| kind | TEXT | e.g. `custom` |
| domain_names | TEXT | JSON array |
| resolver_id | TEXT NULL | FK dns_resolvers |
| cert_path / key_path | TEXT NULL | Custom PEM paths |
| status | TEXT | Checker status |
| expires_at / last_checked_at / fingerprint | TEXT NULL | |
| created_at / updated_at | TEXT | |

## Routing

### `proxy_hosts`

| Column | Type | Notes |
|--------|------|--------|
| id | TEXT PK | YAML filename |
| domain_names | TEXT | JSON array |
| forward_scheme / host / port | | Upstream |
| certificate_id | TEXT NULL | FK certificates |
| cert_resolver | TEXT | Traefik resolver name or id |
| ssl_forced / enabled | INTEGER | |
| waf_profile_ids / header_rule_ids | TEXT | JSON id arrays |
| access_list_id | TEXT NULL | FK access_lists |
| rate_limit_* | | enabled / average / burst / period |
| path_rewrites | TEXT | JSON `[{regex, replacement}]` |
| advanced_yaml | TEXT | Deep-merged into host YAML |
| extra_json | TEXT | Reserved |
| created_at / updated_at | TEXT | |

### `redirection_hosts`

Source domains → target scheme/host/path; status 301/302; optional cert, ACL, force HTTPS.

### `dead_hosts`

Parked domains → static page (`status_code`, `body_html`); optional cert, ACL, force HTTPS.

### `streams`

| Column | Type | Notes |
|--------|------|--------|
| id | TEXT PK | |
| name | TEXT UNIQUE | |
| protocol | TEXT | `tcp` / `udp` |
| entry_port | INTEGER | Traefik listen port |
| forward_host / forward_port | | Upstream |
| sni_hosts | TEXT | JSON (TCP) |
| tls_mode | TEXT | `off` / `terminate` / `passthrough` |
| cert_resolver | TEXT | Terminate mode |
| enabled | INTEGER | |
| created_at / updated_at | TEXT | |

## Middleware

### `access_lists`

| Column | Type | Notes |
|--------|------|--------|
| id | TEXT PK | |
| name | TEXT UNIQUE | |
| satisfy | TEXT | `all` |
| pass_auth | INTEGER | Forward Authorization upstream |
| clients_json | TEXT | `[{address, directive}]` |
| auth_users_enc | BLOB | Encrypted BasicAuth users |
| enabled | INTEGER | |

### `header_rules`

Types: `request_add`, `request_remove`, `response_add`, `response_remove`.

### `waf_profiles`

Kinds: `rate_limit`, `ip_allow`, `ip_deny`, `security_headers`, `bot_ua_path` (plus `config_json`).

## Audit

### `audit_log`

| Column | Type | Notes |
|--------|------|--------|
| id | INTEGER PK | |
| at | TEXT | RFC3339 |
| actor / action / entity / entity_id | TEXT | |
| summary / detail_json | TEXT | |

## Files outside SQLite

| Path | Role |
|------|------|
| `data/tpm/tpm.db` | Database |
| `data/tpm/custom-certs/` | Uploaded PEM |
| `data/tpm/traefik-providers.env` | Generated provider env for Traefik |
| `data/traefik/acme.json` | Traefik ACME storage (`600`) |
| `configs/traefik/traefik.yml` | Generated static config |
| `configs/traefik/vhosts/*.yml` | Generated dynamic routers |
| `logs/traefik/access.log` | Traefik JSON access log |
