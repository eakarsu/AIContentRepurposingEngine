BEGIN;

-- Persisted, per-user repurposing rules (previously process memory only).
CREATE TABLE IF NOT EXISTS repurposing_rules (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 5,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_repurposing_rules_user ON repurposing_rules(user_id, priority);

COMMIT;
