BEGIN;

ALTER TABLE content_performance_snapshots ADD COLUMN IF NOT EXISTS source_uri TEXT;
ALTER TABLE content_performance_snapshots ADD COLUMN IF NOT EXISTS source_sha256 CHAR(64);
ALTER TABLE content_performance_snapshots ADD COLUMN IF NOT EXISTS recorded_by TEXT;
ALTER TABLE content_performance_snapshots ADD COLUMN IF NOT EXISTS review_note TEXT;

COMMIT;
