const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePerformance } = require('../services/performanceEvidence');

test('performance snapshots require source references and measured whole counts', () => {
  const input = { observedAt: '2026-01-01T00:00:00Z', sourceUri: 'https://analytics.example.test/report/1', sourceSha256: 'a'.repeat(64), metrics: { views: 12, clicks: 3 }, reviewNote: 'Checked export' };
  assert.equal(validatePerformance(input).metrics.views, 12);
  assert.throws(() => validatePerformance({ ...input, metrics: { views: -1 } }), /non-negative/);
  assert.throws(() => validatePerformance({ ...input, sourceUri: 'http://analytics.example.test/report' }), /HTTPS/);
  assert.throws(() => validatePerformance({ ...input, observedAt: '2999-01-01T00:00:00Z' }), /Past/);
});
