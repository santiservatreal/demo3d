#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v node > /dev/null; then
  node scripts/init-local-env.mjs
else
  docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/app" -w /app node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df node scripts/init-local-env.mjs
fi
docker compose up -d --wait db redis
if [ -n "${BIRDVIEW_BUILD_CA_FILE:-}" ]; then
  docker compose -f compose.yml -f infra/docker/compose.build-ca.yml build
else
  docker compose build
fi
docker compose run --rm migrate
docker compose run --rm --no-deps migrate node --import tsx packages/fixtures/src/seed.ts
printf '%s\n' 'Demo initialized. Run docker compose up -d and open /app/ on port 8080. Use Explorar la demo; no password or external key is required.'
