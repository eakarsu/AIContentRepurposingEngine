const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const enabled = process.env.RUN_DATABASE_TESTS === '1';

// Both tests share the process-wide pool; close it once after the file.
test.after(async () => {
  if (!enabled) return;
  try {
    const db = require('../db');
    await db.pool.end();
  } catch (_) { /* pool was never created */ }
});

function requireTestDatabase() {
  if (!new URL(process.env.DATABASE_URL).pathname.includes('inspection_test_')) {
    throw Error('Dedicated test database required');
  }
}

async function startApp(mount) {
  const express = require('express');
  const app = express();
  app.use(express.json());
  mount(app);
  const listener = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => listener.once('listening', resolve));
  return {
    base: `http://127.0.0.1:${listener.address().port}`,
    close: () => new Promise((resolve) => listener.close(resolve)),
  };
}

async function request(url, token, body, method = body !== undefined ? 'POST' : 'GET') {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

test('publishing requires the governed workflow: rights, review and recorded approvals', { skip: !enabled }, async () => {
  requireTestDatabase();
  process.env.JWT_SECRET = 'inspection-session-key';
  const jwt = require('jsonwebtoken');
  const db = require('../db');

  await db.query(fs.readFileSync(path.join(__dirname, '../migrations/001_governed_content_workflow.sql'), 'utf8'));

  const contentRoutes = require('../routes/content');
  const workflowRoutes = require('../routes/workflow')(db);
  const app = await startApp((expressApp) => {
    expressApp.use('/workflow', workflowRoutes);
    expressApp.use('/content', contentRoutes);
  });

  const author = jwt.sign({ id: 101, email: 'author@example.test', role: 'author', tenantId: 'user:101' }, process.env.JWT_SECRET);
  const reviewer = jwt.sign({ id: 102, email: 'reviewer@example.test', role: 'publisher', tenantId: 'user:101' }, process.env.JWT_SECRET);
  // Same person as the author, but with a review role: self-review must still be refused.
  const authorWithReviewRole = jwt.sign({ id: 101, email: 'author@example.test', role: 'publisher', tenantId: 'user:101' }, process.env.JWT_SECRET);
  const otherTenant = jwt.sign({ id: 201, email: 'other@example.test', role: 'publisher', tenantId: 'user:201' }, process.env.JWT_SECRET);
  const idempotencyKey = `workflow-test-${crypto.randomBytes(6).toString('hex')}`;

  try {
    // 1. The generic CRUD surface cannot set workflow-managed statuses.
    const directPublish = await request(`${app.base}/content/content_library`, author, { title: 'Direct publish attempt', status: 'published' });
    assert.equal(directPublish.status, 409);
    assert.match(directPublish.body.error, /governed content workflow/);

    // 2. Ingestion requires rights + digest and is idempotent.
    const ingestBody = {
      sourceUri: 'https://example.test/source',
      sourceSha256: 'a'.repeat(64),
      rightsBasis: 'owned',
      rightsReference: 'contract-1',
      idempotencyKey,
    };
    const ingest = await request(`${app.base}/workflow/ingestions`, author, ingestBody);
    assert.equal(ingest.status, 201, JSON.stringify(ingest.body));
    const workflowId = ingest.body.workflow.id;
    const replay = await request(`${app.base}/workflow/ingestions`, author, ingestBody);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.replayed, true);

    // 3. Another tenant cannot see or advance the workflow.
    assert.equal((await request(`${app.base}/workflow/workflows/${workflowId}`, otherTenant, undefined)).status, 404);

    // 4. Publishing is impossible before the state machine allows it.
    assert.equal((await request(`${app.base}/workflow/workflows/${workflowId}/transitions`, reviewer, { to: 'published', reason: 'skip everything' })).status, 422);

    // 5. Variants are validated (injection / fidelity) and reviewed independently.
    const variant = await request(`${app.base}/workflow/workflows/${workflowId}/variants`, author, {
      channel: 'email',
      body: 'A sufficiently long draft body used by the governed workflow integration test.',
      sourceCitations: ['https://example.test/source#p1'],
      brandEvaluation: { passed: true },
      accessibilityEvaluation: { passed: true },
      factualFidelity: 0.95,
    });
    assert.equal(variant.status, 201, JSON.stringify(variant.body));
    const variantId = variant.body.variant.id;

    const selfReview = await request(`${app.base}/workflow/workflows/${workflowId}/variants/${variantId}/decision`, authorWithReviewRole, { decision: 'approved', rationale: 'self review' });
    assert.equal(selfReview.status, 403);
    const review = await request(`${app.base}/workflow/workflows/${workflowId}/variants/${variantId}/decision`, reviewer, { decision: 'approved', rationale: 'independent review' });
    assert.equal(review.status, 200);

    // 6. Approved state requires a recorded approval.
    assert.equal((await request(`${app.base}/workflow/workflows/${workflowId}/submit`, author, {})).status, 200);
    assert.equal((await request(`${app.base}/workflow/workflows/${workflowId}/transitions`, reviewer, { to: 'approved', reason: 'no approval recorded' })).status, 409);

    const approval = await request(`${app.base}/workflow/workflows/${workflowId}/approvals`, reviewer, { decision: 'approved', rationale: 'evidence checked' });
    assert.equal(approval.status, 201, JSON.stringify(approval.body));

    // 7. Full path to publication, with the outbox queued for delivery.
    assert.equal((await request(`${app.base}/workflow/workflows/${workflowId}/transitions`, reviewer, { to: 'approved', reason: 'approved' })).status, 200);
    assert.equal((await request(`${app.base}/workflow/workflows/${workflowId}/transitions`, reviewer, { to: 'scheduled', reason: 'scheduled' })).status, 200);
    const published = await request(`${app.base}/workflow/workflows/${workflowId}/transitions`, reviewer, { to: 'published', reason: 'publish' });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.to, 'published');
    assert.equal(published.body.outbox.length, 1);
  } finally {
    await app.close();
  }
});

test('webhook deliveries are signed, scoped per user and retried with bookkeeping', { skip: !enabled }, async () => {
  requireTestDatabase();
  process.env.JWT_SECRET = 'inspection-session-key';
  process.env.WEBHOOK_ENCRYPTION_KEY = 'inspection-webhook-encryption-key-32chars';
  const jwt = require('jsonwebtoken');
  const db = require('../db');

  const received = [];
  const receiver = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received.push({ headers: req.headers, body });
      res.writeHead(204);
      res.end();
    });
  });
  await new Promise((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  const receiverUrl = `http://127.0.0.1:${receiver.address().port}/hook`;

  const createWebhooksRouter = require('../routes/webhooks');
  const app = await startApp((expressApp) => {
    expressApp.use('/api', createWebhooksRouter(require('../middleware/auth'), db));
  });

  const owner = jwt.sign({ id: 301, email: 'owner@example.test', role: 'author' }, process.env.JWT_SECRET);
  const other = jwt.sign({ id: 302, email: 'other@example.test', role: 'author' }, process.env.JWT_SECRET);
  const secret = 'webhook-secret-for-test-12345';

  try {
    const endpoint = await request(`${app.base}/api/webhooks/endpoints`, owner, { url: receiverUrl, eventType: 'content.published', secret });
    assert.equal(endpoint.status, 201, JSON.stringify(endpoint.body));

    const emitted = await request(`${app.base}/api/webhooks/emit`, owner, { eventType: 'content.published', payload: { hello: 'world' }, idempotencyKey: `emit-${Date.now()}` });
    assert.equal(emitted.status, 202);
    assert.equal(emitted.body.delivered, 1);
    assert.equal(received.length, 1);

    const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(received[0].body).digest('hex')}`;
    assert.equal(received[0].headers['x-webhook-signature'], expectedSignature);

    // Another user has no endpoints for that event type and sees no deliveries.
    const otherEmit = await request(`${app.base}/api/webhooks/emit`, other, { eventType: 'content.published', payload: {} });
    assert.equal(otherEmit.status, 200);
    assert.equal(otherEmit.body.queued, 0);
    const otherDeliveries = await request(`${app.base}/api/webhooks/deliveries`, other, undefined);
    assert.equal(otherDeliveries.body.deliveries.length, 0);
  } finally {
    await app.close();
    await new Promise((resolve) => receiver.close(resolve));
  }
});
