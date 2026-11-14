# Operator guide

Install, day-2 operations, and security notes.

## Install

```bash
cp example.env .env
# TPM_SECRETS_KEY=$(openssl rand -hex 32)

make init
make install
make compose-up
```

Panel: `http://127.0.0.1:8080` when `DC_TPM_HTTP_PORT=127.0.0.1:8080`.

### Checklist

1. Set `TPM_SECRETS_KEY` before saving DNS resolvers or BasicAuth users
2. Keep the panel on loopback unless you intentionally expose it
3. Complete first-run admin setup
4. Confirm `data/traefik/acme.json` is mode `600`
5. Schedule backups

## Environment

| Variable | Purpose |
|----------|---------|
| `TPM_SECRETS_KEY` | Encrypts secrets stored in SQLite |
| `DC_TPM_HTTP_PORT` | Host publish for the panel |
| `TPM_INTERNAL_URL` | Traefik → TPM for parked pages (`http://tpm:8080` in Compose) |
| `TPM_ACCESS_LOG` | Path to Traefik JSON access log |
| `DC_TRAEFIK_STREAM_TCP` / `_UDP` | Published stream port range |

## When to recreate Traefik

| Change | Action |
|--------|--------|
| Proxy hosts, redirects, parked hosts, headers, WAF, ACL | None — file watch reloads |
| DNS resolvers | `docker compose up -d --force-recreate traefik` |
| Streams (entry ports) | Recreate Traefik; keep publish ranges aligned |

## Backup and restore

### Panel (recommended)

**Backups** creates a `.tar.gz` with SQLite, custom certificates, and `acme.json` when present.

Store `TPM_SECRETS_KEY` separately — encrypted fields cannot be decrypted without it.

### CLI (database only)

```bash
./scripts/backup-sqlite.sh
# → data/tpm/backups/tpm-YYYYMMDDTHHMMSSZ.db

docker compose stop tpm
./scripts/restore-sqlite.sh data/tpm/backups/tpm-….db
docker compose start tpm
```

Generated YAML under `configs/traefik/vhosts/` is rebuilt from the database on boot and after restore.

## Health endpoints

| Endpoint | Meaning |
|----------|---------|
| `GET /health` | Process is up |
| `GET /ready` | SQLite is reachable |
| `GET /api/v1/status` | Version and uptime |

## Security notes

| Asset | Guidance |
|-------|----------|
| Admin panel | Loopback bind; strong password |
| `TPM_SECRETS_KEY` | Long random value; never commit |
| Session cookie | HTTP-only; enable `Secure` on HTTPS |
| `acme.json` | Mode `600`; restricted volume permissions |
| Docker socket | Read-only mount on Traefik only — not on `tpm` |
| Generated vhosts | Restrict filesystem permissions; run TPM as non-root |

Do not publish the panel on `0.0.0.0` on a public host without additional controls, and do not store `TPM_SECRETS_KEY` in the database.
