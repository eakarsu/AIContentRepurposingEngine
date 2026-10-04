BEGIN;

CREATE TABLE IF NOT EXISTS content_source_snapshots (
  workflow_id UUID PRIMARY KEY REFERENCES content_workflows(id),
  tenant_id TEXT NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('text/plain','text/markdown','application/pdf','image/png','image/jpeg')),
  filename TEXT NOT NULL,
  source_bytes BYTEA NOT NULL CHECK (octet_length(source_bytes) BETWEEN 1 AND 5242880),
  source_text TEXT,
  CHECK ((media_type IN ('text/plain','text/markdown')) = (source_text IS NOT NULL)),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_content_source_snapshots_tenant ON content_source_snapshots(tenant_id, workflow_id);

CREATE OR REPLACE FUNCTION content_reject_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'content source snapshots are immutable';
END;
$$;
DROP TRIGGER IF EXISTS content_source_snapshot_immutable ON content_source_snapshots;
CREATE TRIGGER content_source_snapshot_immutable BEFORE UPDATE OR DELETE ON content_source_snapshots
  FOR EACH ROW EXECUTE FUNCTION content_reject_snapshot_mutation();

ALTER TABLE content_variants ADD COLUMN IF NOT EXISTS evidence_spans JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE content_variants ADD COLUMN IF NOT EXISTS source_evaluation JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
