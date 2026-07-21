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

(cd backend && npm start) & backend_pid=$!
(cd frontend && BROWSER=none PORT="${FRONTEND_PORT:-3000}" npm start) & frontend_pid=$!
cleanup() { kill "$backend_pid" "$frontend_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
wait "$backend_pid" "$frontend_pid"
