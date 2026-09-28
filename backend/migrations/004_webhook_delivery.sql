BEGIN;

-- Webhook delivery support: per-user endpoints, an encrypted signing secret
-- (AES-256-GCM, keyed by WEBHOOK_ENCRYPTION_KEY or JWT_SECRET) and retry
-- bookkeeping. `secret_hash` is retained for reference only.

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  secret_encrypted TEXT,
  event_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  endpoint_id INTEGER NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMP,
  UNIQUE (endpoint_id, idempotency_key)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_endpoints') THEN
    ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS secret_encrypted TEXT;
    ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 5;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'webhook_deliveries') THEN
    ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMP;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user
  ON webhook_endpoints(user_id, event_type, is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry
  ON webhook_deliveries(user_id, status, next_attempt_at);

COMMIT;
