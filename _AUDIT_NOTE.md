# Audit Note — AIContentRepurposingEngine

Source: `_AUDIT/reports/batch_02.md`

## Maturity: PARTIAL-BUILD (7 routes, 4 AI endpoints, deps installed)

## Original audit recommendations

### Gaps — missing AI counterparts
- `schedule.js`, `analytics.js` lack AI endpoints for optimal posting time and performance prediction.
- Missing `/extract-key-points`, `/generate-thumbnail`, `/suggest-hashtags`, `/detect-trending-topics`.

### Gaps — missing non-AI features
- No multi-channel publishing integrations (Twitter, LinkedIn, Instagram, Medium, Substack APIs).
- No content approval/workflow management.
- No audience segmentation.
- No A/B testing or variant generation (already implemented as `/ab-test-variants` in aiNew.js).

### Custom Feature Suggestions
- Agentic content expansion.
- Real-time trend detection & content suggestion.
- Engagement prediction.
- SEO optimization loop.
- Multi-lingual content adaptation.

## Categorization
- **MECHANICAL:** add 3 audit-listed AI endpoints to existing aiNew.js (`/extract-key-points`, `/suggest-hashtags`, `/generate-thumbnail-concepts`). They follow the exact pattern.
- **NEEDS-CREDS:** Twitter/LinkedIn/Instagram/Medium/Substack publishing connectors.
- **NEEDS-PRODUCT-DECISION:** trend detection, engagement prediction loops.

## Implementations applied
1. **`backend/routes/aiNew.js`** — added three audit-specified AI endpoints:
   - `POST /api/ai/extract-key-points` — extract bullet-style insights from content.
   - `POST /api/ai/suggest-hashtags` — platform-aware hashtag suggestions.
   - `POST /api/ai/generate-thumbnail-concepts` — text-only thumbnail concept generator.

   Pattern matches existing endpoints: OpenRouter wrapper, content-size validation, rate-limit middleware.

Syntax-checked with `node --check`.

## Backlog (prioritized)

### High priority
- **`POST /api/ai/detect-trending-topics`** — needs a trend-source decision (Twitter/X API, Google Trends, news API).
- **`POST /api/ai/predict-performance`** — engagement prediction using historical analytics.

### Medium priority
- **Multi-channel publishing connectors** (NEEDS-CREDS).
- **Content approval workflow** (CRUD for review states).

### Low priority
- Multi-lingual adaptation pipeline.
- Agentic full-cycle content expansion (one seed → coordinated multi-format set).

## Apply pass 3 (frontend)

LEFT-AS-IS. FE already complete: `frontend/src/pages/AdvancedTools.js` wires all AI endpoints — `/api/ai/extract-key-points`, `/api/ai/suggest-hashtags`, `/api/ai/generate-thumbnail-concepts`, plus the prior `/api/ai/ab-test-variants`, `/api/ai/content-series`, `/api/ai/tone-matcher` — using JWT Bearer auth from `localStorage.getItem('token')`. Route mounted in `App.js` at `/advanced` behind `PrivateRoute`. No changes needed (idempotence rule).

## Apply pass 4 (mechanical backlog)

Mechanical backlog items only — skipped NEEDS-CREDS (publishing connectors) and NEEDS-PRODUCT-DECISION (trend detection sources, content approval workflow CRUD).

BE additions in `backend/routes/aiNew.js` (existing OpenRouter helper, 503-on-no-key, JWT auth, aiRateLimiter):
- `POST /api/ai/multi-language-adapt` — culturally-aware multi-language adaptation (LLM-only).
- `POST /api/ai/predict-performance` — heuristic engagement/CTR band predictor (no analytics integration).
- `POST /api/ai/expand-content` — agentic full-cycle content expansion: one seed -> coordinated multi-format set with shared narrative spine.
- `POST /api/ai/audience-segment` — audience segmentation analysis with per-segment angles, hook examples, objections/rebuttals.

FE additions in `frontend/src/pages/AdvancedTools.js`:
- New cards in `NEW_FEATURES` for `multi-language-adapt`, `predict-performance`, `expand-content`, `audience-segment`.
- Form rendering branches in `renderPanelInputs` for all four.
- `handleRun` branches that POST with JWT Bearer header and surface 503 explicitly.

Total: 4 mechanical features. `node --check` clean for backend. JSX wired to existing `AIOutput` display and `feature-page` styles.

Backlog still mechanical-but-out-of-scope-for-this-pass: content approval workflow (CRUD-only, non-AI), additional language-detection-router. NEEDS-CREDS items unchanged.
