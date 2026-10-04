'use strict';
const crypto = require('crypto');
const STATES = {
  ingested: ['drafted', 'archived'], drafted: ['in_review', 'archived'], in_review: ['drafted', 'approved'],
  approved: ['scheduled', 'correction_required'], scheduled: ['published', 'correction_required'],
  published: ['correction_required', 'archived'], correction_required: ['drafted', 'archived'], archived: [],
};
const CHANNELS = new Set(['web','email','linkedin','instagram','youtube','podcast','short_video']);
const RIGHTS = new Set(['owned','licensed','public_domain','permission']);
const INJECTION = [/ignore (all|previous) instructions/i, /system prompt/i, /developer message/i, /execute (this )?(command|code)/i];
function assert(condition, message) { if (!condition) { const error = new Error(message); error.status = 422; throw error; } }
function context(user, tenantId, allowedRoles) {
  assert(user && user.id, 'authenticated actor required'); assert(tenantId, 'x-tenant-id is required');
  assert(user.tenantId || user.tenant_id, 'authenticated tenant membership required');
  assert(String(user.tenantId || user.tenant_id) === String(tenantId), 'tenant mismatch');
  const role = user.role || 'author'; assert(allowedRoles.includes(role), 'role not authorized');
  return { tenantId, actorId: String(user.id), role };
}
function validateIngest(input) {
  let uri; try { uri = new URL(input?.sourceUri); } catch { throw Object.assign(new Error('valid sourceUri required'), {status:422}); }
  assert(['https:','s3:','gs:'].includes(uri.protocol) && uri.hostname && !uri.username && !uri.password, 'sourceUri must be an authoritative HTTPS or object-storage URI');
  assert(/^[a-f0-9]{64}$/i.test(input.sourceSha256 || ''), 'sourceSha256 must be a SHA-256 digest');
  assert(RIGHTS.has(input.rightsBasis), 'rightsBasis is invalid'); assert(String(input.rightsReference || '').trim().length >= 3, 'rightsReference is required');
  assert(/^[A-Za-z0-9._:-]{3,128}$/.test(input.idempotencyKey || ''), 'idempotencyKey is invalid');
  return input;
}
function validateVariant(input) {
  assert(CHANNELS.has(input.channel), 'unsupported channel'); assert(String(input.body || '').trim().length >= 20, 'draft body is too short');
  assert(Array.isArray(input.sourceCitations) && input.sourceCitations.length > 0 && input.sourceCitations.every(c => typeof c === 'string' && c.trim()), 'at least one nonempty source citation is required');
  assert(!INJECTION.some((pattern) => pattern.test(input.body)), 'draft contains instruction-injection indicators');
  return input;
}
function validateSourceCitations(sourceUri, citations) {
  assert(Array.isArray(citations) && citations.length > 0, 'source citations are required');
  const registered = new URL(sourceUri);
  registered.hash = '';
  for (const value of citations) {
    let cited;
    try { cited = new URL(value); } catch { assert(false, 'citation must be the registered source URI with an optional section fragment'); }
    cited.hash = '';
    assert(cited.href === registered.href, 'citation must reference the registered source URI');
  }
  return true;
}
function validatePdfPageCitations(sourceUri, citations, spans, extraction) {
  if (!extraction) return true;
  assert(Array.isArray(extraction.pages) && extraction.pages.length > 0, 'verified PDF pages are required');
  const citedPages = new Set();
  for (const value of citations) {
    const hash = new URL(value).hash;
    const match = /^#page=(\d+)$/.exec(hash);
    assert(match && Number(match[1]) >= 1 && Number(match[1]) <= extraction.pages.length,
      'PDF citations must use a stored #page=N fragment');
    citedPages.add(Number(match[1]));
  }
  for (const span of spans) assert(citedPages.has(span.sourcePage), 'each PDF evidence span needs its exact page citation');
  return true;
}
function validateReviewAssessment(input) {
  if (input.decision !== 'approved') return null;
  assert(input.brandPassed === true, 'reviewer must confirm approved brand rules');
  assert(input.accessibilityPassed === true, 'reviewer must confirm accessibility review');
  assert(typeof input.factualFidelity === 'number' && Number.isFinite(input.factualFidelity) && input.factualFidelity >= 0.9 && input.factualFidelity <= 1,
    'reviewer fidelity score must be between 0.9 and 1');
  assert(input.sourceReviewConfirmed === true, 'reviewer must confirm the stored source and cited evidence');
  return { brandPassed: true, accessibilityPassed: true, factualFidelity: input.factualFidelity, sourceReviewConfirmed: true };
}
function validateEvidenceSpans(body, sourceText, sourceSha256, spans, extraction = null) {
  assert(Array.isArray(spans) && spans.length <= 20, 'evidence spans must be an array of at most 20 items');
  if (sourceText !== null) assert(spans.length > 0, 'text variants need at least one exact source evidence span');
  else assert(spans.length === 0, 'binary sources cannot have text evidence spans');
  return spans.map((span) => {
    const { claimStart, claimEnd, sourceStart, sourceEnd } = span || {};
    assert([claimStart, claimEnd, sourceStart, sourceEnd].every(Number.isInteger), 'evidence offsets must be integers');
    assert(claimStart >= 0 && claimEnd > claimStart && claimEnd <= body.length && claimEnd - claimStart <= 1000,
      'claim span is outside the variant body');
    assert(sourceStart >= 0 && sourceEnd > sourceStart && sourceEnd <= sourceText.length && sourceEnd - sourceStart <= 1000,
      'source span is outside the stored text');
    const claimText = body.slice(claimStart, claimEnd);
    const sourceQuote = sourceText.slice(sourceStart, sourceEnd);
    assert(claimText.trim() && sourceQuote.trim(), 'evidence spans cannot be blank');
    assert(span.claimText === claimText && span.sourceQuote === sourceQuote, 'evidence text must exactly match the stored source and draft offsets');
    assert(String(span.sourceSha256 || '').toLowerCase() === String(sourceSha256).trim().toLowerCase(), 'evidence source digest mismatch');
    if (extraction) {
      const page = extraction.pages.find(item => item.page === span.sourcePage);
      assert(page && sourceStart >= page.start && sourceEnd <= page.end,
        'PDF evidence quote must lie within its cited page');
      assert(String(span.sourceTextSha256 || '').toLowerCase() === extraction.textSha256,
        'PDF evidence text digest mismatch');
    } else assert(span.sourcePage === undefined && span.sourceTextSha256 === undefined,
      'page evidence is available only for a verified PDF text layer');
    return {
      claimStart, claimEnd, claimText, sourceStart, sourceEnd, sourceQuote,
      sourceSha256: String(sourceSha256).trim().toLowerCase(),
      ...(extraction ? { sourcePage: span.sourcePage, sourceTextSha256: extraction.textSha256 } : {}),
    };
  });
}
function transition(from, to) { assert(STATES[from] && STATES[from].includes(to), `invalid transition ${from} -> ${to}`); return to; }
function canPublish({ state, approvals, variants, sourceUri, sourceSnapshot }) {
  assert(['approved','scheduled','published'].includes(state), 'workflow is not approved');
  assert(sourceSnapshot && sourceSnapshot.source_sha256, 'verified source snapshot is required');
  assert(approvals.some((a) => a.decision === 'approved' && ['publisher','admin'].includes(a.actor_role || a.role)), 'publisher approval is required');
  assert(variants.length > 0 && variants.every((v) => v.status === 'approved' && Number.isFinite(Number(v.factual_fidelity)) && Number(v.factual_fidelity) >= 0.9 && Number(v.factual_fidelity) <= 1 &&
    v.brand_evaluation?.passed === true && v.accessibility_evaluation?.passed === true &&
    v.brand_evaluation?.reviewedBy && v.accessibility_evaluation?.reviewedBy &&
    String(v.brand_evaluation.reviewedBy) !== String(v.created_by) && String(v.accessibility_evaluation.reviewedBy) !== String(v.created_by) &&
    Array.isArray(v.source_citations) && v.source_citations.length > 0 &&
    v.source_evaluation?.confirmed === true && v.source_evaluation?.reviewedBy &&
    String(v.source_evaluation.reviewedBy) !== String(v.created_by) &&
    v.source_evaluation?.sourceSha256 === String(sourceSnapshot.source_sha256).trim() &&
    Array.isArray(v.evidence_spans)),
  'all variants need independent brand, accessibility, source evidence, citation, and fidelity review');
  if (sourceSnapshot.source_text !== null) variants.forEach(v => validateEvidenceSpans(v.body, sourceSnapshot.source_text, sourceSnapshot.source_sha256, v.evidence_spans, sourceSnapshot.source_extraction));
  if (sourceUri) variants.forEach(variant => {
    validateSourceCitations(sourceUri, variant.source_citations);
    validatePdfPageCitations(sourceUri, variant.source_citations, variant.evidence_spans, sourceSnapshot.source_extraction);
  });
  return true;
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
module.exports = { STATES, context, validateIngest, validateVariant, validateSourceCitations, validatePdfPageCitations, validateReviewAssessment, validateEvidenceSpans, transition, canPublish, digest };
