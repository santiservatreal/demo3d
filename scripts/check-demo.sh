#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose ps --status running --format '{{.Service}}: {{.Health}}'
docker compose exec -T api node --input-type=module -e 'const r=await fetch("http://127.0.0.1:3001/health/ready");if(!r.ok)process.exit(1);const body=await r.json();if(!body.database||!body.queue.redis)process.exit(1);console.log("API, PostgreSQL and Redis ready.")'
docker compose exec -T worker node -e 'const fs=require("fs");if(Date.now()-fs.statSync(".local/worker-heartbeat").mtimeMs>120000)process.exit(1);console.log("Worker heartbeat current.")'
for attempt in $(seq 1 30); do
  if curl --noproxy '*' -fsS -o /dev/null http://127.0.0.1:8080/app/; then break; fi
  sleep 1
done
curl --noproxy '*' -fsS -o /dev/null http://127.0.0.1:8080/app/
printf '%s\n' 'Web /app/ responds.'
