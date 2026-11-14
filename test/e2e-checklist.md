# E2E checklist

Manual verification against a running Compose stack. Keep secrets out of git (use a local env file).

Automated suite: `test/run-deep-matrix.py`  
Configure with `test/lab.env` (from `lab.env.example`).

## Infrastructure

- [ ] `tpm` and `traefik` containers healthy
- [ ] Ports `80` / `443` and the stream range published; panel on the configured bind
- [ ] Upstream services reachable from Traefik
- [ ] DNS for test hostnames points at the edge

## Panel / auth

- [ ] First-run setup and login
- [ ] Login rate limiting
- [ ] Unauthenticated API returns 401/403
- [ ] HTML and `/assets/*` MIME types correct
- [ ] Security headers / CSP present on the panel

## Certificates

- [ ] HTTP-01 host obtains a certificate
- [ ] DNS-01 host obtains a certificate
- [ ] Invalid / mismatched custom PEM rejected
- [ ] SSL checker updates status

## Routing & middleware

- [ ] Proxy host returns 200; force HTTPS redirects
- [ ] Access list returns 401; rate limit returns 429 when exceeded
- [ ] Redirect and parked hosts behave as configured (no admin SPA leak)
- [ ] Sensitive paths such as `/.env` denied
- [ ] Invalid header names and duplicate domains rejected
- [ ] Unknown certificate resolver rejected

## Streams & forwarding

- [ ] TCP (and UDP if used) on stream ports
- [ ] Reserved ports `80` / `443` / `8080` rejected
- [ ] Forwarded client IP headers correct for your trusted-proxy setup

## Operations

- [ ] Access log shows client address fields
- [ ] Backup create/download works; corrupt upload rejected
- [ ] Audit log records mutating API calls
- [ ] Existing routes keep working if TPM is temporarily stopped
