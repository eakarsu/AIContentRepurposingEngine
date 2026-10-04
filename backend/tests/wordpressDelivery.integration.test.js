'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('tenant-bound WordPress delivery records a receipt and replays safely', { skip: !process.env.CONTENT_WORKFLOW_TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.CONTENT_WORKFLOW_TEST_DATABASE_URL;
  process.env.JWT_SECRET = 'codex-disposable-content-workflow-secret-2026';
  process.env.WORDPRESS_TENANT_ID = 'user:101';
  process.env.WORDPRESS_SITE_URL = 'https://cms.example.test';
  process.env.WORDPRESS_USERNAME = 'publisher';
  process.env.WORDPRESS_APPLICATION_PASSWORD = 'test application password';
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const db = require('../db');
  const createRouter = require('../routes/workflow');
  const app = express(); app.use(express.json()); app.use('/api/workflow', createRouter(db));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const workflowId = crypto.randomUUID(), variantId = crypto.randomUUID(), outboxId = crypto.randomUUID();
  const body = 'Approved headline\nVerified source-backed article.';
  const sourceText = 'Verified source-backed article supports the approved headline.';
  const sourceBytes = Buffer.from(sourceText);
  const sourceSha256 = crypto.createHash('sha256').update(sourceBytes).digest('hex');
  const sourceQuote = 'Verified source-backed article';
  const evidenceSpans = [{ claimStart: 0, claimEnd: 17, claimText: body.slice(0, 17), sourceStart: 0, sourceEnd: sourceQuote.length, sourceQuote, sourceSha256 }];
  const providerId = crypto.randomInt(100000, 999999);
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    if (options.method === 'POST') return { ok: true, json: async () => ({ id: providerId, slug: `repurposed-${variantId}`, status: 'publish', link: `https://cms.example.test/article-${providerId}` }) };
    return { ok: true, json: async () => [] };
  };
  const actor = tenant => jwt.sign({ id: tenant === 'user:101' ? 101 : 202, role: 'publisher', tenantId: tenant }, process.env.JWT_SECRET);
  async function call(path, tenant, method = 'GET', body = {}) {
    const response = await originalFetch(`${base}/api/workflow${path}`, { method, headers: { Authorization: `Bearer ${actor(tenant)}`, 'Content-Type': 'application/json' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
    return { status: response.status, data: await response.json() };
  }
  try {
    await db.query(`INSERT INTO content_workflows(id,tenant_id,idempotency_key,source_uri,source_sha256,rights_basis,rights_reference,created_by,state)
      VALUES($1,'user:101',$2,'https://source.example.test/article',$3,'owned','rights-1','101','published')`, [workflowId, workflowId, sourceSha256]);
    await db.query(`INSERT INTO content_source_snapshots(workflow_id,tenant_id,source_sha256,media_type,filename,source_bytes,source_text,created_by)
      VALUES($1,'user:101',$2,'text/plain','source.txt',$3,$4,'101')`, [workflowId, sourceSha256, sourceBytes, sourceText]);
    await db.query(`INSERT INTO content_variants(id,workflow_id,tenant_id,channel,body,source_citations,evidence_spans,source_evaluation,brand_evaluation,accessibility_evaluation,factual_fidelity,status,created_by)
      VALUES($1,$2,'user:101','web',$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,0.99,'approved','101')`,
    [variantId, workflowId, body, JSON.stringify(['https://source.example.test/article#p1']), JSON.stringify(evidenceSpans), JSON.stringify({ confirmed: true, reviewedBy: '102', sourceSha256 }), JSON.stringify({ passed: true, reviewedBy: '102' }), JSON.stringify({ passed: true, reviewedBy: '102' })]);
    await db.query(`INSERT INTO content_approvals(workflow_id,tenant_id,decision,rationale,actor_id,actor_role)
      VALUES($1,'user:101','approved','Reviewed stored source','102','publisher')`, [workflowId]);
    await db.query(`INSERT INTO content_publication_outbox(id,workflow_id,variant_id,tenant_id,provider,idempotency_key,scheduled_for,status)
      VALUES($1,$2,$3,'user:101','web',$4,NOW(),'pending')`, [outboxId, workflowId, variantId, `publish:${variantId}`]);
    await db.query(`UPDATE content_variants SET source_evaluation='{}'::jsonb WHERE id=$1`, [variantId]);
    assert.equal((await call(`/outbox/${outboxId}/deliver`, 'user:101', 'POST')).status, 422);
    await db.query(`UPDATE content_variants SET source_evaluation=$1::jsonb WHERE id=$2`, [JSON.stringify({ confirmed: true, reviewedBy: '102', sourceSha256 }), variantId]);
    const metricsInput = { observedAt: '2026-01-01T00:00:00Z', sourceUri: 'https://analytics.example.test/export/91', sourceSha256: 'b'.repeat(64), metrics: { views: 25, clicks: 3 }, reviewNote: 'Checked report export' };
    assert.equal((await call(`/workflows/${workflowId}/performance`, 'user:101', 'POST', metricsInput)).status, 409);
    assert.equal((await call(`/outbox/${outboxId}/deliver`, 'user:202', 'POST')).status, 503);
    const delivered = await call(`/outbox/${outboxId}/deliver`, 'user:101', 'POST');
    assert.equal(delivered.status, 200, JSON.stringify(delivered.data));
    assert.equal(delivered.data.receipt.provider_id, String(providerId));
    assert.equal((await call(`/outbox/${outboxId}/receipt`, 'user:101')).data.receipt.provider_url, `https://cms.example.test/article-${providerId}`);
    assert.equal((await call(`/outbox/${outboxId}/receipt`, 'user:202')).status, 404);
    const performance = await call(`/workflows/${workflowId}/performance`, 'user:101', 'POST', metricsInput);
    assert.equal(performance.status, 201, JSON.stringify(performance.data));
    assert.equal((await call(`/workflows/${workflowId}/performance`, 'user:202', 'POST', metricsInput)).status, 404);
    assert.equal((await call(`/workflows/${workflowId}`, 'user:101')).data.performance[0].metrics.views, 25);
    const replay = await call(`/outbox/${outboxId}/deliver`, 'user:101', 'POST');
    assert.equal(replay.status, 200);
    assert.equal(replay.data.replayed, true);
    assert.equal(calls.length, 2);
  } finally { global.fetch = originalFetch; await new Promise(resolve => server.close(resolve)); await db.pool.end(); }
});
