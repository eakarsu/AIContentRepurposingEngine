BEGIN;

CREATE TABLE IF NOT EXISTS content_workflows (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  rights_basis TEXT NOT NULL CHECK (rights_basis IN ('owned','licensed','public_domain','permission')),
  rights_reference TEXT NOT NULL,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL DEFAULT 'ingested' CHECK (state IN ('ingested','drafted','in_review','approved','scheduled','published','correction_required','archived')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS content_variants (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES content_workflows(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web','email','linkedin','instagram','youtube','podcast','short_video')),
  body TEXT NOT NULL,
  source_citations JSONB NOT NULL,
  brand_evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
  accessibility_evaluation JSONB NOT NULL DEFAULT '{}'::jsonb,
  factual_fidelity NUMERIC(5,4),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','rejected','approved','scheduled','published')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_approvals (
  id BIGSERIAL PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES content_workflows(id),
  tenant_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  rationale TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS content_publication_outbox (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES content_workflows(id),
  variant_id UUID NOT NULL REFERENCES content_variants(id),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivering','delivered','failed','dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  provider_reference TEXT,
  next_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, idempotency_key)
);

CREATE TABLE IF NOT EXISTS content_performance_snapshots (
  id BIGSERIAL PRIMARY KEY,
  workflow_id UUID NOT NULL REFERENCES content_workflows(id),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  metrics JSONB NOT NULL,
  UNIQUE (workflow_id, provider, observed_at)
);

CREATE TABLE IF NOT EXISTS content_audit_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workflow_id UUID NOT NULL REFERENCES content_workflows(id),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_content_workflows_tenant_state ON content_workflows(tenant_id, state);
CREATE INDEX IF NOT EXISTS idx_content_outbox_retry ON content_publication_outbox(status, next_attempt_at);
COMMIT;
