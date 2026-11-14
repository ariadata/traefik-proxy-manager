<div align="center">
  <img src="images/logo.svg" alt="Traefik Proxy Manager" width="88" height="88" />
  <h1>Traefik Proxy Manager</h1>
  <p><strong>production</strong> deploy tree — Compose + env + data dirs. Image: <code>ghcr.io/ariadata/traefik-proxy-manager:latest</code></p>
</div>

```bash
cp example.env .env
# set TPM_SECRETS_KEY=$(openssl rand -hex 32)
./init.sh
docker compose pull
docker compose up -d
```

Panel: `http://127.0.0.1:8080`

Source / docs: [`main`](https://github.com/ariadata/traefik-proxy-manager/tree/main) branch.
