'use strict';

function validatePerformance(input) {
  const observedAt = new Date(input.observedAt);
  if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > Date.now()) throw new Error('Past observation time required');
  let source;
  try { source = new URL(input.sourceUri); } catch { throw new Error('Valid HTTPS analytics source URL required'); }
  if (source.protocol !== 'https:' || source.username || source.password || source.hash) throw new Error('HTTPS analytics source without credentials required');
  const sha = String(input.sourceSha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error('Analytics source SHA-256 required');
  const allowed = ['views', 'clicks', 'engagements', 'conversions'];
  const metrics = input.metrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics) || !Object.keys(metrics).length || Object.keys(metrics).some(key => !allowed.includes(key))) throw new Error('At least one supported metric required');
  for (const value of Object.values(metrics)) if (!Number.isSafeInteger(value) || value < 0) throw new Error('Metrics must be non-negative whole numbers');
  if (!String(input.reviewNote || '').trim()) throw new Error('Operator review note required');
  return { observedAt: observedAt.toISOString(), sourceUri: source.toString(), sourceSha256: sha, metrics, reviewNote: String(input.reviewNote).trim() };
}

module.exports = { validatePerformance };
