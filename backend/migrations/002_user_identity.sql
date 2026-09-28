BEGIN;

-- Identity used by the governed content workflow (services/contentWorkflow.js).
-- Each account is its own tenant; approvals record the authenticated role.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'author';
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Backfill a stable tenant id for existing accounts. The application also
-- derives `user:<id>` when the column is NULL, so this is safe to skip.
UPDATE users SET tenant_id = 'user:' || id WHERE tenant_id IS NULL;

COMMIT;
