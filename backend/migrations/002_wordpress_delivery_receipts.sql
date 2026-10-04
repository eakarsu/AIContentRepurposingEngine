BEGIN;

CREATE TABLE IF NOT EXISTS content_delivery_receipts (
  outbox_id UUID PRIMARY KEY REFERENCES content_publication_outbox(id),
  tenant_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_url TEXT,
  published_status TEXT NOT NULL,
  replayed BOOLEAN NOT NULL DEFAULT FALSE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, provider_id)
);

COMMIT;
