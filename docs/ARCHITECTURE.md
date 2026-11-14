# Architecture

## Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                     Docker Compose                            │
│  ┌────────────────┐     shared volumes      ┌──────────────┐ │
│  │  tpm (Node)    │──write──► vhosts/*.yml  │   Traefik    │ │
│  │  SQLite + UI   │──write──► traefik.yml   │    v3.x      │ │
│  │                │──write──► providers.env │  :80 / :443  │ │
│  └────────────────┘                         │  + streams   │ │
│         ▲ admin port                        └──────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- **Host / redirect / parked / middleware changes** write dynamic files under `configs/traefik/vhosts/`. Traefik reloads via the file provider watch.
- **DNS resolver and stream entryPoint changes** regenerate static Traefik config and provider env. Recreate the Traefik container so env is picked up.

## Control vs data plane

| Concern | Owner |
|---------|--------|
| HTTP/TCP routing, TLS termination, ACME renew | Traefik |
| Desired state, UI, auth, checkers, YAML render | TPM |
| Docker label discovery | Traefik Docker provider (TPM does not edit labels) |

## Config generation

1. Persist changes in SQLite.
2. Render YAML to a temporary file, then rename into `configs/traefik/vhosts/`.
3. Shared middlewares live in `_tpm_middlewares.yml`.
4. On startup, TPM re-renders hosts, redirects, parked hosts, streams, and shared middlewares so disk matches the database.

## SSL

| Mode | Mechanism |
|------|-----------|
| ACME | Traefik `certificatesResolvers` from named resolvers in the panel |
| Custom | PEM files on volume → `tls.certificates` |
| Checker | TPM background job: expiry and optional public TLS dial |

One DNS provider applies per challenge (Traefik/lego). Use separate resolvers or CNAME delegation for multi-account setups.

## Auth and secrets

- First boot creates a single administrator (bcrypt password hash).
- Session cookie `tpm_session` (HTTP-only, `SameSite=Lax`; `Secure` is set automatically when the request is HTTPS / `X-Forwarded-Proto: https`).
- Mutating API routes reject cross-site / foreign-origin browser requests.
- DNS API tokens and BasicAuth material are encrypted with `TPM_SECRETS_KEY`.

## Admin exposure

Publish the panel with `DC_TPM_HTTP_PORT` (recommended: `127.0.0.1:8080`). Optional exposure through Traefik is listed on the [roadmap](./ROADMAP.md).

## Frontend

React + Vite + Tailwind. Production assets are built to `web/dist` and served by the Fastify process.

## Observability

- `GET /health`, `GET /ready`, `GET /api/v1/status`
- Traefik JSON access log (panel **Access log** view)
- Audit log for successful mutating API calls

## Deployment

Primary path: Docker Compose (`traefik` + `tpm`) with image `node:26.13.1-bookworm-slim`.
