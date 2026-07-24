#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$root"

if [[ ! -f .env ]]; then
  echo "Missing .env; copy .env.example and supply real secrets." >&2
  exit 1
fi
if [[ ! -d backend/node_modules || ! -d frontend/node_modules ]]; then
  echo "Dependencies are missing; run ./scripts/bootstrap.sh first." >&2
  exit 1
fi

set -a
source .env
set +a

backend_port="${BACKEND_PORT:-3301}"
frontend_port="${FRONTEND_PORT:-3000}"
if lsof -nP -iTCP:"$backend_port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Backend port $backend_port is already in use." >&2
  exit 1
fi
if lsof -nP -iTCP:"$frontend_port" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Frontend port $frontend_port is already in use." >&2
  exit 1
fi

if [[ "${MIGRATE_ON_START:-false}" == "true" ]]; then
  [[ "${ALLOW_SCHEMA_MIGRATION:-}" == "1" || "${ALLOW_SCHEMA_MIGRATION:-}" == "true" ]] || {
    echo "MIGRATE_ON_START requires ALLOW_SCHEMA_MIGRATION=1." >&2
    exit 1
  }
  bash "$root/scripts/migrate.sh"
  node "$root/backend/scripts/create-admin.js"
fi

(cd backend && npm start) & backend_pid=$!
(cd frontend && BROWSER=none PORT="$frontend_port" BACKEND_PORT="$backend_port" ./node_modules/.bin/react-scripts start) & frontend_pid=$!
cleanup() { kill "$backend_pid" "$frontend_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
wait "$backend_pid" "$frontend_pid"
