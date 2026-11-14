# Roadmap

Planned improvements. Order may change.

## Security

| Item | Notes |
|------|--------|
| CrowdSec | Optional Traefik bouncer + CrowdSec agent sidecar |

## Operations & scale

| Item | Notes |
|------|--------|
| Panel via Traefik hostname | HTTPS route to the admin UI; keep host port for emergency access |
| Metrics | Import Traefik Prometheus metrics into the dashboard |
| Kubernetes | Optional manifests (Compose remains the primary deploy path) |
| Docker discovery (read-only) | List routers from the Docker provider without editing labels |
