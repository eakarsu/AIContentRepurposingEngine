#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "${CONFIRM_DEMO_SEED:-}" == "yes" ]] || { echo "Set CONFIRM_DEMO_SEED=yes to load non-production demo data." >&2; exit 1; }
[[ "${NODE_ENV:-development}" != "production" ]] || { echo "Demo seed is disabled in production." >&2; exit 1; }
set -a; source "$root/.env"; set +a
psql "${DATABASE_URL:?DATABASE_URL is required}" -v ON_ERROR_STOP=1 -f "$root/backend/db/seed.sql"
