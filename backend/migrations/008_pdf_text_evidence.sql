BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS content_workflows_id_tenant_key
  ON content_workflows(id, tenant_id);

CREATE TABLE IF NOT EXISTS content_pdf_text_evidence (
  workflow_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_sha256 CHAR(64) NOT NULL,
  text_sha256 CHAR(64) NOT NULL,
  extraction_method TEXT NOT NULL CHECK (extraction_method = 'pdftotext_utf8_v1'),
  page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 5),
  page_spans JSONB NOT NULL,
  extracted_text TEXT NOT NULL CHECK (length(extracted_text) BETWEEN 1 AND 300000),
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (workflow_id, tenant_id) REFERENCES content_workflows(id, tenant_id)
);
CREATE INDEX IF NOT EXISTS content_pdf_text_evidence_tenant_idx
  ON content_pdf_text_evidence(tenant_id, workflow_id);

CREATE OR REPLACE FUNCTION content_reject_pdf_text_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'content PDF text evidence is immutable';
END;
$$;
DROP TRIGGER IF EXISTS content_pdf_text_immutable ON content_pdf_text_evidence;
CREATE TRIGGER content_pdf_text_immutable BEFORE UPDATE OR DELETE ON content_pdf_text_evidence
  FOR EACH ROW EXECUTE FUNCTION content_reject_pdf_text_mutation();

COMMIT;
