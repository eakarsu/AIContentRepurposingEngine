BEGIN;

-- Tenant scoping for the approval / A/B variant / audience segment routes.
-- Legacy deployments created these tables at runtime without user_id, so the
-- additive ALTERs plus the unique-index replacement below cover them too.

CREATE TABLE IF NOT EXISTS content_approval_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  content_id INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  author_email TEXT,
  approver_email TEXT,
  decision_note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP
);
CREATE TABLE IF NOT EXISTS content_ab_variants (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  content_id INTEGER NOT NULL,
  experiment_key TEXT NOT NULL,
  variant_label TEXT NOT NULL,
  body TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS content_segments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  attribute TEXT NOT NULL,
  operator TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_approval_requests') THEN
    ALTER TABLE content_approval_requests ADD COLUMN IF NOT EXISTS user_id INTEGER;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_ab_variants') THEN
    ALTER TABLE content_ab_variants ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE content_ab_variants DROP CONSTRAINT IF EXISTS content_ab_variants_content_id_experiment_key_variant_label_key;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_segments') THEN
    ALTER TABLE content_segments ADD COLUMN IF NOT EXISTS user_id INTEGER;
    ALTER TABLE content_segments DROP CONSTRAINT IF EXISTS content_segments_name_attribute_operator_value_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_content_ab_variant_user
  ON content_ab_variants(user_id, content_id, experiment_key, variant_label);
CREATE UNIQUE INDEX IF NOT EXISTS uq_content_segments_user
  ON content_segments(user_id, name, attribute, operator, value);

COMMIT;
