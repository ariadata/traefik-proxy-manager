# Features

Single-admin Traefik control plane. Feature set of the current release.

## Proxy hosts

- One or more domain names → one or more upstreams (`scheme://host:port`, optional weight)
- Traefik weighted round-robin (`wrr`) across upstreams; unhealthy targets dropped when health check is on
- Optional active health check (path / interval / timeout) via Traefik `loadBalancer.healthCheck`
- Force HTTPS
- Attach an ACME certificate resolver **or** a custom certificate
- Attach header rules, WAF profiles, and an access list
- Per-host rate limit (average / burst / period)
- Path rewrites (`replacePathRegex`)
- Optional advanced YAML deep-merged into the generated host file
- Enable / disable
- Domain names must be unique across proxy, redirection, and parked hosts

## SSL / certificates

- Named ACME resolvers (HTTP-01 and DNS-01 via Traefik/lego providers)
- Credentials encrypted at rest (`TPM_SECRETS_KEY`)
- Custom PEM upload with certificate/key validation
- Background checker for expiry and optional public TLS probe

## Access lists

- Reusable IP allow/deny CIDRs and BasicAuth users
- Attach one list to a proxy host, redirection, or parked host
- `satisfy=all` when both IP and auth rules are present

## Redirection hosts

- Source domain(s) → target scheme / host / path
- HTTP 301 or 302, optional path preservation
- Optional certificate resolver, force HTTPS, and access list
- Target host must be a hostname or IP (no URL schemes)

## Parked hosts

- Reserve domain(s) with a default or custom HTML page
- Served by TPM at `/__tpm/dead/:id`; Traefik reaches TPM via `TPM_INTERNAL_URL`
- Optional certificate resolver, force HTTPS, and access list

## Header rules

- Add or remove request / response headers
- Strict header-name validation
- Attach per proxy host

## Lean WAF profiles

| Kind | Behavior |
|------|----------|
| Rate limit | Configured per proxy host |
| IP allow / deny | Traefik IP filters and deny routers |
| Security headers | HSTS, frame deny, nosniff, referrer policy, and related options |
| Bot UA / path | User-Agent regex and path denies; sensitive paths such as `/.env` denied by default on proxy hosts |

## TCP / UDP streams

- Named streams: entry port → upstream host:port
- TCP TLS modes: off, terminate, passthrough
- Entry ports `80`, `443`, and `8080` are reserved
- Stream changes update Traefik static entryPoints (Traefik recreate required)

## Panel & operations

- First-run admin setup, login, and password change
- Dashboard counts and SSL status
- Access log viewer (Traefik JSON access log)
- Audit log for mutating authenticated API calls
- Backup / restore UI (SQLite, custom certificates, `acme.json`)
- Panel bind via `DC_TPM_HTTP_PORT` (loopback recommended)
- Cross-origin protection on mutating API calls; CSP and related headers on HTML responses

## Out of scope (see roadmap)

- CrowdSec integration
- Editing Docker labels from the panel
- Multi-user / RBAC
- Serving the panel through a Traefik hostname (optional later)
