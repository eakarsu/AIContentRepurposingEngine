# Completeness Review: AIContentRepurposingEngine

- **Review date:** 2026-07-18
- **Assessment basis:** Static source and configuration inspection only. Dependencies were not installed, and no build, database migration, external integration, or runtime workflow was executed.

## Classification

**Prototype-demo**

## Verdict

The repository presents a broad content repurposing surface (56 source files and 21 route modules), but static evidence is characteristic of a generated prototype. Pages and endpoints demonstrate concepts; they do not establish a verified execution path to move rights-cleared source material through channel-specific drafts, review, scheduling, publishing, and performance feedback.

## Why it is not complete

- 14 files are explicitly named as gap/gap-feature implementations; route/page count therefore overstates completed product capability.
- The route/page inventory includes `ai`, `ai new`, `analytics`, `channel fatigue`; these surfaces show breadth but not durable execution against authoritative systems.
- 15 files reference model-provider or chat-completion behavior; generic LLM calls are not a substitute for deterministic domain execution, grounding, or evaluation.
- 21 files contain mock, sample, placeholder, or random-data signals, leaving important outcomes disconnected from authoritative systems.
- Only 2 recognizable test files were found, insufficient to prove the full workflow and failure modes.
- No CI workflow was found to continuously verify builds, tests, migrations, or security checks.
- No environment example/template was found, so required configuration and secret boundaries are undocumented.

## Needed features

- 1. Implement a workflow to move rights-cleared source material through channel-specific drafts, review, scheduling, publishing, and performance feedback.
- 2. Connect CMS/DAM, social/video/email platforms, transcription, asset storage, and analytics; replace seed/demo records with durable synchronized data and explicit failure handling.
- 3. Evaluate factual fidelity, attribution, brand rules, formatting, accessibility, and channel performance.
- 4. Track rights and provenance, defend against injected source content, and require publishing approval.
- 5. Add contract, integration, authorization, migration, and end-to-end tests in CI, plus a documented non-destructive deployment/run path.

## Risks or launch blockers

- The root launcher can terminate unrelated processes occupying configured ports.
- The root launcher seeds, creates, migrates, or otherwise mutates database state during startup.
- The root launcher installs dependencies at run time, reducing reproducibility and expanding supply-chain risk.
- Ungrounded or malformed model output can become a domain action unless schemas, evidence, evaluations, and approval gates are added.

## Evidence inspected

- `backend/package.json` — declared scripts, runtime dependencies, and application boundaries.
- `frontend/package.json` — declared scripts, runtime dependencies, and application boundaries.
- `package.json` — declared scripts, runtime dependencies, and application boundaries.
- `backend/db/index.js` — service composition, middleware, and registered routes.
- `backend/server.js` — service composition, middleware, and registered routes.
- `frontend/src/index.js` — service composition, middleware, and registered routes.

## Recommended next action

Treat this as a prototype: use ai and ai new to select one narrow content repurposing outcome, quarantine generated gap routes, and implement that outcome end to end with real data, deterministic rules, and tests before adding features.

## Implementation progress

- Needed feature 1: added a typed rights-cleared lifecycle in `backend/migrations/001_governed_content_workflow.sql` and deterministic ingest, draft, transition, approval, fidelity, accessibility, and publish-gate rules in `backend/services/contentWorkflow.js`.
- Needed feature 2: added durable provider outbox attempts, explicit failure/dead-letter states, performance snapshots, and documented CMS/social/email/storage/analytics configuration boundaries. Live synchronization remains blocked until real provider credentials, contracts, and callback fixtures are supplied.
- Needed features 3–4: source digests, rights references, citations, instruction-injection rejection, brand/accessibility evaluations, publisher approval, tenant-role checks, and append-only audit evidence are now modeled and tested. This is workflow enforcement, not a claim of rights or brand review.
- Needed feature 5 and launch risks: generated gap endpoints are no longer mounted; runtime rejects missing database/weak JWT configuration; `.env.example`, non-destructive `start.sh`, separate bootstrap/migrate/guarded-seed scripts, `RUNBOOK.md`, and PostgreSQL-backed CI were added.
- Validation: 4 dependency-free policy/config tests passed; changed shell scripts passed `bash -n`; repository diff passed `git diff --check`. No service, database, provider, or licensed-content evaluation was run locally.
