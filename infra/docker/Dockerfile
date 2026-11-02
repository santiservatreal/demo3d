FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS build
RUN --mount=type=secret,id=build_ca,required=false if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm install -g pnpm@11.25.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY . .
RUN --mount=type=secret,id=build_ca,required=false if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; pnpm install --frozen-lockfile && pnpm run build

FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df AS server
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.local && chown node:node /app/.local
USER node
EXPOSE 3001
CMD ["node","--import","tsx","apps/api/src/server.ts"]

FROM caddy:2.10.2-alpine@sha256:4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d AS web
COPY --from=build --chown=1000:1000 /app/dist /srv
COPY --chown=1000:1000 infra/docker/Caddyfile /etc/caddy/Caddyfile
RUN setcap -r /usr/bin/caddy && chmod 755 /etc/caddy && chmod 644 /etc/caddy/Caddyfile && chmod -R a+rX /srv
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
USER 1000:1000
EXPOSE 8080
