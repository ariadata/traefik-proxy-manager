# Security Policy

## Supported versions

| Version | Supported |
| :--- | :--- |
| `1.x` (latest release / `main`) | Yes |
| Older tags / forks | No |

Security fixes ship on the latest `1.x` release line. Upgrade to the newest tagged release before reporting that a patched issue still reproduces.

## Reporting a vulnerability

Please **do not** open a public GitHub Issue for security findings.

Prefer one of these private channels:

1. **GitHub Security Advisories** (preferred):  
   [Report a vulnerability](https://github.com/ariadata/traefik-proxy-manager/security/advisories/new)
2. **Email:** `pcmehrdad@gmail.com` with subject `TPM security: <short title>`

Include as much of the following as you can:

- Affected version / image tag (`v1.0.0`, `ghcr.io/ariadata/traefik-proxy-manager:…`)
- Deployment shape (Compose, bind address, reverse proxy in front)
- Steps to reproduce
- Impact (auth bypass, secret exposure, RCE, SSRF, path traversal, etc.)
- Proof of concept (redacted if needed)

You should receive an acknowledgement within a few days. We will coordinate disclosure timing after a fix is available or the report is declined with rationale.

## Scope

In scope for this project:

- Admin authentication / session handling
- Authorization of control-plane API routes
- Encryption of secrets at rest (`TPM_SECRETS_KEY`)
- Handling of uploaded PEM material, backups, and Traefik-rendered YAML
- Unsafe handling of operator-supplied host/WAF/header configuration that leads to unexpected privilege or secret exposure **inside TPM**

Out of scope (unless TPM clearly worsens them):

- Misconfiguration of Traefik, DNS, or the host firewall
- Publishing the admin panel on `0.0.0.0` without additional access controls
- Weak admin passwords chosen by the operator
- Compromised `TPM_SECRETS_KEY`, `.env`, volume mounts, or backup archives
- Vulnerabilities solely in Traefik, Node.js, or base images (report upstream; we will bump dependencies when fixes land)

## Operator hardening (baseline)

- Keep `DC_TPM_HTTP_PORT` on loopback (or put the panel behind a trusted SSO / VPN).
- Set a long random `TPM_SECRETS_KEY` (`openssl rand -hex 32`) before storing DNS tokens or BasicAuth users; never commit it.
- Use a strong admin password; change it after first boot.
- Restrict filesystem permissions on `data/`, `logs/`, and backup archives.
- Prefer HTTPS to the panel when it is reachable beyond localhost (cookie `Secure` follows the request / `X-Forwarded-Proto`).

See [docs/OPERATOR.md](docs/OPERATOR.md) for day-2 security notes.
