# Governed content workflow runbook

`start.sh` is intentionally non-destructive: it never installs packages, kills a port owner, migrates, or seeds. Use `scripts/bootstrap.sh` once, review `.env`, apply `scripts/migrate.sh`, and only then run `start.sh`. Demo records require `CONFIRM_DEMO_SEED=yes scripts/seed-demo.sh` and are blocked in production.

The governed migration stores rights evidence, immutable source digests, channel drafts with citations and accessibility/brand/fidelity evaluations, human approvals, publication outbox attempts, performance snapshots, and audit events. Generated `gap_*` endpoints are retained only as historical source and are no longer mounted. Provider delivery requires separately configured CMS/social/email/storage/analytics adapters; credentials and delivery receipts must never be written into model prompts or audit evidence.

Before production: run backend tests and frontend build, migrate against a backup-tested staging database, exercise idempotent provider retries/dead letters, evaluate fidelity and accessibility against a rights-cleared corpus, and obtain content-owner publishing approval.
