# Control plane — Node LTS pin (.nvmrc) — no native addons
FROM node:26.13.1-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
COPY web/package.json web/package-lock.json* ./web/
RUN npm install && npm install --prefix web

COPY server ./server
COPY web ./web

RUN npm run build && npm prune --omit=dev

FROM node:26.13.1-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    APP_PORT=8080 \
    APP_HOST=0.0.0.0 \
    TPM_WEB_DIR=/app/web/dist

COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/web/dist ./web/dist

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8080/health || exit 1

CMD ["node", "server/dist/index.js"]
