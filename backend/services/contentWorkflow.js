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
  if (user.tenantId || user.tenant_id) assert((user.tenantId || user.tenant_id) === tenantId, 'tenant mismatch');
  const role = user.role || 'author'; assert(allowedRoles.includes(role), 'role not authorized');
  return { tenantId, actorId: String(user.id), role };
}
function validateIngest(input) {
  assert(input && input.sourceUri && /^https?:\/\/|^s3:\/\/|^gs:\/\//.test(input.sourceUri), 'sourceUri must be an authoritative HTTPS or object-storage URI');
  assert(/^[a-f0-9]{64}$/i.test(input.sourceSha256 || ''), 'sourceSha256 must be a SHA-256 digest');
  assert(RIGHTS.has(input.rightsBasis), 'rightsBasis is invalid'); assert(String(input.rightsReference || '').trim().length >= 3, 'rightsReference is required');
  assert(/^[A-Za-z0-9._:-]{3,128}$/.test(input.idempotencyKey || ''), 'idempotencyKey is invalid');
  return input;
}
function validateVariant(input) {
  assert(CHANNELS.has(input.channel), 'unsupported channel'); assert(String(input.body || '').trim().length >= 20, 'draft body is too short');
  assert(Array.isArray(input.sourceCitations) && input.sourceCitations.length > 0, 'at least one source citation is required');
  assert(!INJECTION.some((pattern) => pattern.test(input.body)), 'draft contains instruction-injection indicators');
  assert(input.accessibilityEvaluation && typeof input.accessibilityEvaluation.passed === 'boolean', 'accessibility evaluation is required');
  assert(input.brandEvaluation && typeof input.brandEvaluation.passed === 'boolean', 'brand evaluation is required');
  const fidelity = Number(input.factualFidelity); assert(Number.isFinite(fidelity) && fidelity >= 0 && fidelity <= 1, 'factualFidelity must be between 0 and 1');
  return input;
}
function transition(from, to) { assert(STATES[from] && STATES[from].includes(to), `invalid transition ${from} -> ${to}`); return to; }
function canPublish({ state, approvals, variants }) {
  assert(['approved','scheduled'].includes(state), 'workflow is not approved');
  assert(approvals.some((a) => a.decision === 'approved' && ['publisher','admin'].includes(a.actor_role || a.role)), 'publisher approval is required');
  assert(variants.length > 0 && variants.every((v) => v.status === 'approved' && v.factual_fidelity >= 0.9), 'all variants must be approved with sufficient fidelity');
  return true;
}
function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
module.exports = { STATES, context, validateIngest, validateVariant, transition, canPublish, digest };
