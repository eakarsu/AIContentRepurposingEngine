/**
 * Governed content workflow routes.
 *
 * Wires `services/contentWorkflow.js` (rights basis, injection/fidelity checks,
 * transition state machine and publish gate) into real, tenant-scoped runtime
 * routes backed by the tables in migrations/001_governed_content_workflow.sql.
 *
 * Flow:
 *   POST /api/workflow/ingestions                -> register a rights-cleared source
 *   POST /api/workflow/workflows/:id/variants    -> add a draft variant (validated)
 *   POST /api/workflow/workflows/:id/variants/:variantId/decision -> independent review
 *   POST /api/workflow/workflows/:id/submit      -> move to in_review
 *   POST /api/workflow/workflows/:id/approvals   -> record a human approval
 *   POST /api/workflow/workflows/:id/transitions -> advance state; publishing requires
 *                                                   the recorded approvals + validated variants
 *
 * There is no publish shortcut: the generic content CRUD routes reject
 * workflow-managed statuses and point callers here.
 */
'use strict';
const express = require('express');
const crypto = require('crypto');
const authenticate = require('../middleware/auth');
const workflow = require('../services/contentWorkflow');
const { wordpressConfig, deliverWordPress } = require('../services/wordpressPublisher');
const { validatePerformance } = require('../services/performanceEvidence');
const { extractPdfTextLayer, verifiedPdfExtraction } = require('../services/pdfSourceText');
const { TextDecoder } = require('node:util');

const AUTHOR_ROLES = ['author', 'editor', 'publisher', 'admin'];
const REVIEW_ROLES = ['editor', 'publisher', 'admin'];
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

function inspectUploadedSource(bytes, mediaType) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_SOURCE_BYTES) throw Object.assign(new Error('source upload must contain 1 to 5 MiB of bytes'), { status: 422 });
  if (mediaType === 'text/plain' || mediaType === 'text/markdown') {
    if (bytes.length > 1024 * 1024) throw Object.assign(new Error('text source exceeds 1 MiB'), { status: 422 });
    let sourceText;
    try { sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { throw Object.assign(new Error('text source must be valid UTF-8'), { status: 422 }); }
    if (!sourceText.trim() || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(sourceText)) throw Object.assign(new Error('text source contains unsupported control characters'), { status: 422 });
    return sourceText;
  }
  const valid = mediaType === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
    : mediaType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : mediaType === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) : false;
  if (!valid) throw Object.assign(new Error('unsupported source type or invalid file signature'), { status: 415 });
  return null;
}

function storedTextMatches(snapshot) {
  if (!snapshot.media_type.startsWith('text/')) return snapshot.source_text === null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(snapshot.source_bytes) === snapshot.source_text; }
  catch (_) { return false; }
}

function createWorkflowRouter(pool) {
  const router = express.Router();

  function tenantOf(user) {
    return user.tenantId || user.tenant_id || `user:${user.id}`;
  }

  function actorContext(req, allowedRoles) {
    const tenantId = tenantOf(req.user);
    const requestedTenant = String(req.headers['x-tenant-id'] || tenantId);
    return workflow.context(
      { id: req.user.id, role: req.user.role || 'author', tenantId },
      requestedTenant,
      allowedRoles
    );
  }

  async function loadWorkflow(tenantId, id) {
    const result = await pool.query(
      'SELECT * FROM content_workflows WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return result.rows[0] || null;
  }

  async function verifiedSnapshot(queryable, wf) {
    const snapshot = (await queryable.query('SELECT * FROM content_source_snapshots WHERE workflow_id=$1 AND tenant_id=$2', [wf.id, wf.tenant_id])).rows[0];
    if (!snapshot) throw Object.assign(new Error('upload the source snapshot before drafting, review, or publication'), { status: 409 });
    const computed = workflow.digest(snapshot.source_bytes);
    if (computed !== String(wf.source_sha256).trim() || computed !== String(snapshot.source_sha256).trim()) {
      throw Object.assign(new Error('stored source checksum mismatch'), { status: 409 });
    }
    if (!storedTextMatches(snapshot)) {
      throw Object.assign(new Error('stored source text does not match uploaded bytes'), { status: 409 });
    }
    const extractionRow = (await queryable.query(
      'SELECT * FROM content_pdf_text_evidence WHERE workflow_id=$1 AND tenant_id=$2', [wf.id, wf.tenant_id]
    )).rows[0];
    const extraction = verifiedPdfExtraction(snapshot, extractionRow);
    return {
      ...snapshot,
      source_text: extraction ? extraction.text : snapshot.source_text,
      source_extraction: extraction ? { textSha256: extraction.textSha256, method: extraction.method, pages: extraction.pages } : null,
    };
  }

  function fail(res, error) {
    const status = error.code === 'NOT_FOUND' ? 404 : (error.status || 500);
    return res.status(status).json({ error: error.message });
  }

  // ---------------------------------------------------------------------
  // Ingestion — rights basis + source digest are mandatory and idempotent.
  // ---------------------------------------------------------------------
  router.post('/ingestions', authenticate, async (req, res) => {
    try {
      const { tenantId, actorId, role } = actorContext(req, AUTHOR_ROLES);
      const input = workflow.validateIngest(req.body || {});

      const existing = await pool.query(
        'SELECT * FROM content_workflows WHERE tenant_id = $1 AND idempotency_key = $2',
        [tenantId, input.idempotencyKey]
      );
      if (existing.rows[0]) {
        if (String(existing.rows[0].source_sha256).toLowerCase() !== String(input.sourceSha256).toLowerCase()) {
          return res.status(409).json({ error: 'idempotency key reused with a different source digest' });
        }
        return res.json({ workflow: existing.rows[0], replayed: true });
      }

      const id = crypto.randomUUID();
      const inserted = await pool.query(
        `INSERT INTO content_workflows
           (id, tenant_id, idempotency_key, source_uri, source_sha256, rights_basis, rights_reference, source_metadata, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
         RETURNING *`,
        [
          id,
          tenantId,
          input.idempotencyKey,
          input.sourceUri,
          String(input.sourceSha256).toLowerCase(),
          input.rightsBasis,
          input.rightsReference,
          JSON.stringify(input.sourceMetadata || {}),
          actorId,
        ]
      );
      await pool.query(
        `INSERT INTO content_audit_events (tenant_id, workflow_id, actor_id, action, from_state, to_state, evidence)
         VALUES ($1,$2,$3,'ingested',NULL,'ingested',$4::jsonb)`,
        [tenantId, id, actorId, JSON.stringify({ rightsBasis: input.rightsBasis })]
      );
      res.status(201).json({ workflow: inserted.rows[0], actor: { id: actorId, role } });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---------------------------------------------------------------------
  // Workflow detail (scoped).
  // ---------------------------------------------------------------------
  router.get('/workflows', authenticate, async (req, res) => {
    try {
      const { tenantId } = actorContext(req, AUTHOR_ROLES);
      const result = await pool.query(
        `SELECT id, source_uri, rights_basis, rights_reference, state, version, created_at, updated_at
         FROM content_workflows WHERE tenant_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 200`,
        [tenantId]
      );
      res.json({ items: result.rows });
    } catch (error) {
      fail(res, error);
    }
  });

  router.get('/workflows/:id', authenticate, async (req, res) => {
    try {
      const { tenantId } = actorContext(req, AUTHOR_ROLES);
      const wf = await loadWorkflow(tenantId, req.params.id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });

      const [variants, approvals, outbox, performance, sourceResult] = await Promise.all([
        pool.query('SELECT * FROM content_variants WHERE workflow_id = $1 AND tenant_id = $2 ORDER BY created_at', [wf.id, tenantId]),
        pool.query('SELECT * FROM content_approvals WHERE workflow_id = $1 AND tenant_id = $2 ORDER BY created_at', [wf.id, tenantId]),
        pool.query('SELECT id, variant_id, provider, status, attempts, last_error_code, provider_reference, scheduled_for, next_attempt_at FROM content_publication_outbox WHERE workflow_id = $1 AND tenant_id = $2 ORDER BY created_at', [wf.id, tenantId]),
        pool.query('SELECT * FROM content_performance_snapshots WHERE workflow_id = $1 AND tenant_id = $2 ORDER BY observed_at DESC LIMIT 100', [wf.id, tenantId]),
        pool.query('SELECT * FROM content_source_snapshots WHERE workflow_id=$1 AND tenant_id=$2', [wf.id, tenantId]),
      ]);
      const source = sourceResult.rows[0] ? await verifiedSnapshot(pool, wf) : null;
      res.json({ workflow: wf, source: source ? {
        source_sha256: String(source.source_sha256).trim(), media_type: source.media_type, filename: source.filename,
        byte_length: source.source_bytes.length, source_text: source.source_text,
        source_extraction: source.source_extraction,
        created_by: source.created_by, created_at: source.created_at,
      } : null, variants: variants.rows, approvals: approvals.rows, outbox: outbox.rows, performance: performance.rows });
    } catch (error) {
      fail(res, error);
    }
  });

  router.put('/workflows/:id/source', authenticate, express.raw({ type: 'application/octet-stream', limit: '5mb', inflate: false }), async (req, res) => {
    let client;
    try {
      const { tenantId, actorId } = actorContext(req, AUTHOR_ROLES);
      const mediaType = String(req.headers['x-source-media-type'] || '').toLowerCase();
      const bytes = req.body;
      const sourceText = inspectUploadedSource(bytes, mediaType);
      const computed = workflow.digest(bytes);
      const filename = String(req.headers['x-source-filename'] || 'source').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'source';
      client = await pool.pool.connect();
      await client.query('BEGIN');
      const wf = (await client.query('SELECT * FROM content_workflows WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [req.params.id, tenantId])).rows[0];
      if (!wf) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Workflow not found' }); }
      if (computed !== String(wf.source_sha256).trim()) { await client.query('ROLLBACK'); return res.status(422).json({ error: 'uploaded bytes do not match registered source SHA-256' }); }
      const existing = (await client.query('SELECT source_bytes FROM content_source_snapshots WHERE workflow_id=$1 AND tenant_id=$2', [wf.id, tenantId])).rows[0];
      if (existing) {
        await client.query('COMMIT');
        return existing.source_bytes.equals(bytes) ? res.json({ replayed: true, sourceSha256: computed }) : res.status(409).json({ error: 'source snapshot is immutable' });
      }
      await client.query(`INSERT INTO content_source_snapshots(workflow_id,tenant_id,source_sha256,media_type,filename,source_bytes,source_text,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [wf.id, tenantId, computed, mediaType, filename, bytes, sourceText, actorId]);
      await client.query(`INSERT INTO content_audit_events(tenant_id,workflow_id,actor_id,action,from_state,to_state,evidence)
        VALUES($1,$2,$3,'source_uploaded',$4,$4,$5::jsonb)`, [tenantId, wf.id, actorId, wf.state, JSON.stringify({ sourceSha256: computed, mediaType, byteLength: bytes.length })]);
      await client.query('COMMIT');
      return res.status(201).json({ sourceSha256: computed, mediaType, byteLength: bytes.length });
    } catch (error) { if (client) { try { await client.query('ROLLBACK'); } catch (_) {} } return fail(res, error); }
    finally { if (client) client.release(); }
  });

  router.post('/workflows/:id/source/pdf-text', authenticate, async (req, res) => {
    let client;
    try {
      const { tenantId, actorId } = actorContext(req, AUTHOR_ROLES);
      const wf = await loadWorkflow(tenantId, req.params.id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });
      const snapshot = await verifiedSnapshot(pool, wf);
      if (snapshot.media_type !== 'application/pdf') return res.status(422).json({ error: 'A stored PDF is required for PDF text extraction' });
      if (snapshot.source_extraction) return res.json({ replayed: true, extraction: snapshot.source_extraction });
      if (wf.state !== 'ingested') return res.status(409).json({ error: 'Extract PDF text before drafting or reviewing variants' });
      const derived = await extractPdfTextLayer(snapshot.source_bytes);
      client = await pool.pool.connect();
      await client.query('BEGIN');
      const current = (await client.query(
        'SELECT * FROM content_workflows WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [wf.id, tenantId]
      )).rows[0];
      if (!current) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Workflow not found' }); }
      if (current.state !== 'ingested') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Extract PDF text before drafting or reviewing variants' }); }
      const fresh = await verifiedSnapshot(client, current);
      if (fresh.source_extraction) {
        await client.query('COMMIT');
        return res.json({ replayed: true, extraction: fresh.source_extraction });
      }
      const variant = (await client.query(
        'SELECT 1 FROM content_variants WHERE workflow_id=$1 AND tenant_id=$2 LIMIT 1', [wf.id, tenantId]
      )).rows[0];
      if (variant) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'PDF text must be extracted before any variants are drafted' }); }
      await client.query(`INSERT INTO content_pdf_text_evidence
        (workflow_id,tenant_id,source_sha256,text_sha256,extraction_method,page_count,page_spans,extracted_text,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [wf.id, tenantId, String(fresh.source_sha256).trim(), derived.textSha256, derived.method,
        derived.pageCount, JSON.stringify(derived.pages), derived.text, actorId]);
      await client.query(`INSERT INTO content_audit_events(tenant_id,workflow_id,actor_id,action,from_state,to_state,evidence)
        VALUES($1,$2,$3,'pdf_text_extracted',$4,$4,$5::jsonb)`,
      [tenantId, wf.id, actorId, current.state, JSON.stringify({ sourceSha256: String(fresh.source_sha256).trim(), textSha256: derived.textSha256, pageCount: derived.pageCount, method: derived.method })]);
      await client.query('COMMIT');
      return res.status(201).json({ replayed: false, extraction: { textSha256: derived.textSha256, method: derived.method, pages: derived.pages } });
    } catch (error) { if (client) { try { await client.query('ROLLBACK'); } catch (_) {} } return fail(res, error); }
    finally { if (client) client.release(); }
  });

  router.get('/workflows/:id/source', authenticate, async (req, res) => {
    try {
      const { tenantId } = actorContext(req, AUTHOR_ROLES);
      const wf = await loadWorkflow(tenantId, req.params.id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });
      const snapshot = await verifiedSnapshot(pool, wf);
      return res.set({ 'Content-Type': snapshot.media_type, 'Content-Disposition': `attachment; filename="${snapshot.filename}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' }).send(snapshot.source_bytes);
    } catch (error) { return fail(res, error); }
  });

  router.get('/delivery-status', authenticate, (req, res) => {
    try {
      actorContext(req, AUTHOR_ROLES);
      const tenantId = tenantOf(req.user);
      res.json({ wordpressConfigured: wordpressConfig()?.tenantId === tenantId, supportedChannel: 'web' });
    } catch (error) { fail(res, error); }
  });

  router.get('/outbox/:id/receipt', authenticate, async (req, res) => {
    try {
      const { tenantId } = actorContext(req, AUTHOR_ROLES);
      const receipt = await pool.query('SELECT provider,provider_id,provider_url,published_status,replayed,delivered_at FROM content_delivery_receipts WHERE outbox_id=$1 AND tenant_id=$2', [req.params.id, tenantId]);
      if (!receipt.rows[0]) return res.status(404).json({ error: 'Provider receipt not found' });
      return res.json({ receipt: receipt.rows[0] });
    } catch (error) { return fail(res, error); }
  });

  router.post('/workflows/:id/performance', authenticate, async (req, res) => {
    let tenantId, actorId, input;
    try {
      ({ tenantId, actorId } = actorContext(req, ['publisher', 'admin']));
      input = validatePerformance(req.body || {});
    } catch (error) { return fail(res, Object.assign(error, { status: error.status || 400 })); }
    const client = await pool.pool.connect();
    try {
      await client.query('BEGIN');
      const wf = (await client.query('SELECT state FROM content_workflows WHERE id=$1 AND tenant_id=$2 FOR UPDATE', [req.params.id, tenantId])).rows[0];
      if (!wf) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Workflow not found' }); }
      if (wf.state !== 'published') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Published workflow required for performance evidence' }); }
      const receipt = (await client.query(`SELECT 1 FROM content_delivery_receipts r JOIN content_publication_outbox o ON o.id=r.outbox_id AND o.tenant_id=r.tenant_id
        WHERE o.workflow_id=$1 AND o.tenant_id=$2 AND o.status='delivered' AND r.provider='wordpress' LIMIT 1`, [req.params.id, tenantId])).rows[0];
      if (!receipt) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Provider delivery receipt required before importing performance' }); }
      const result = await client.query(`INSERT INTO content_performance_snapshots(workflow_id,tenant_id,provider,observed_at,metrics,source_uri,source_sha256,recorded_by,review_note)
        VALUES($1,$2,'wordpress',$3,$4::jsonb,$5,$6,$7,$8) RETURNING *`, [req.params.id, tenantId, input.observedAt, JSON.stringify(input.metrics), input.sourceUri, input.sourceSha256, actorId, input.reviewNote]);
      await client.query(`INSERT INTO content_audit_events(tenant_id,workflow_id,actor_id,action,from_state,to_state,evidence)
        VALUES($1,$2,$3,'performance_imported','published','published',$4::jsonb)`, [tenantId, req.params.id, actorId, JSON.stringify({ snapshotId: result.rows[0].id, sourceSha256: input.sourceSha256 })]);
      await client.query('COMMIT');
      return res.status(201).json({ snapshot: result.rows[0], note: 'Operator-imported analytics evidence; provider metric authenticity has not been independently verified.' });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      return res.status(error.code === '23505' ? 409 : 500).json({ error: error.code === '23505' ? 'Snapshot already recorded for this observation time' : 'Could not record performance evidence' });
    } finally { client.release(); }
  });

  router.post('/outbox/:id/deliver', authenticate, async (req, res) => {
    let tenantId;
    try {
      ({ tenantId } = actorContext(req, ['publisher', 'admin']));
      if (wordpressConfig()?.tenantId !== tenantId) return res.status(503).json({ error: 'WordPress delivery is not configured for this tenant' });
    } catch (error) { return fail(res, error); }

    const client = await pool.pool.connect();
    let claimed;
    try {
      await client.query('BEGIN');
      const selected = await client.query(`SELECT o.*,v.body,v.channel,v.status AS variant_status,w.state AS workflow_state
        FROM content_publication_outbox o JOIN content_variants v ON v.id=o.variant_id AND v.tenant_id=o.tenant_id
        JOIN content_workflows w ON w.id=o.workflow_id AND w.tenant_id=o.tenant_id
        WHERE o.id=$1 AND o.tenant_id=$2 FOR UPDATE OF o`, [req.params.id, tenantId]);
      const item = selected.rows[0];
      if (!item) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Outbox item not found' }); }
      if (item.status === 'delivered') {
        const receipt = await client.query('SELECT * FROM content_delivery_receipts WHERE outbox_id=$1 AND tenant_id=$2', [item.id, tenantId]);
        await client.query('COMMIT');
        return res.json({ replayed: true, receipt: receipt.rows[0] || null });
      }
      if (item.provider !== 'web' || item.channel !== 'web' || item.variant_status !== 'approved' || item.workflow_state !== 'published') {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'Only approved, queued web variants can be delivered' });
      }
      if (item.status === 'dead_letter' || Number(item.attempts) >= 5) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'Delivery attempt limit reached; operator review required' });
      }
      if (item.status === 'delivering' && item.next_attempt_at && new Date(item.next_attempt_at) > new Date()) {
        await client.query('ROLLBACK'); return res.status(409).json({ error: 'Delivery already in progress' });
      }
      if (item.status === 'failed' && item.next_attempt_at && new Date(item.next_attempt_at) > new Date()) {
        await client.query('ROLLBACK'); return res.status(429).json({ error: 'Delivery retry is not due yet' });
      }
      const wf = (await client.query('SELECT * FROM content_workflows WHERE id=$1 AND tenant_id=$2', [item.workflow_id, tenantId])).rows[0];
      const sourceSnapshot = await verifiedSnapshot(client, wf);
      const approvals = await client.query('SELECT * FROM content_approvals WHERE workflow_id=$1 AND tenant_id=$2', [wf.id, tenantId]);
      const variants = await client.query('SELECT * FROM content_variants WHERE workflow_id=$1 AND tenant_id=$2', [wf.id, tenantId]);
      workflow.canPublish({ state: wf.state, approvals: approvals.rows, variants: variants.rows, sourceUri: wf.source_uri, sourceSnapshot });
      const updated = await client.query(`UPDATE content_publication_outbox SET status='delivering',attempts=attempts+1,next_attempt_at=NOW()+INTERVAL '2 minutes',last_error_code=NULL WHERE id=$1 RETURNING attempts`, [item.id]);
      claimed = { id: item.id, workflowId: item.workflow_id, variant: { id: item.variant_id, body: item.body, channel: item.channel, status: item.variant_status }, attempts: Number(updated.rows[0].attempts) };
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* already rolled back */ }
      return fail(res, error);
    } finally { client.release(); }

    try {
      const delivery = await deliverWordPress(claimed.variant, { tenantId });
      const completed = await pool.pool.connect();
      try {
        await completed.query('BEGIN');
        const updated = await completed.query(`UPDATE content_publication_outbox SET status='delivered',provider_reference=$1,next_attempt_at=NULL,last_error_code=NULL
          WHERE id=$2 AND tenant_id=$3 AND status='delivering' AND attempts=$4 RETURNING id`, [delivery.providerId, claimed.id, tenantId, claimed.attempts]);
        if (!updated.rows[0]) throw new Error('Outbox state changed before receipt could be stored');
        const receipt = await completed.query(`INSERT INTO content_delivery_receipts(outbox_id,tenant_id,provider,provider_id,provider_url,published_status,replayed)
          VALUES($1,$2,'wordpress',$3,$4,$5,$6) ON CONFLICT(outbox_id) DO UPDATE SET provider_id=EXCLUDED.provider_id,provider_url=EXCLUDED.provider_url,published_status=EXCLUDED.published_status,replayed=EXCLUDED.replayed RETURNING *`,
          [claimed.id, tenantId, delivery.providerId, delivery.providerUrl, delivery.status, delivery.replayed]);
        await completed.query(`INSERT INTO content_audit_events(tenant_id,workflow_id,actor_id,action,from_state,to_state,evidence)
          VALUES($1,$2,$3,'wordpress_delivered','published','published',$4::jsonb)`,
          [tenantId, claimed.workflowId, String(req.user.id), JSON.stringify({ outboxId: claimed.id, providerId: delivery.providerId, replayed: delivery.replayed })]);
        await completed.query('COMMIT');
        return res.json({ receipt: receipt.rows[0] });
      } catch (error) { try { await completed.query('ROLLBACK'); } catch (_) {} throw error; }
      finally { completed.release(); }
    } catch (error) {
      const waitSeconds = Math.min(3600, 60 * (2 ** claimed.attempts));
      await pool.query(`UPDATE content_publication_outbox SET status=$1,last_error_code=$2,next_attempt_at=NOW()+($3::int * INTERVAL '1 second')
        WHERE id=$4 AND tenant_id=$5 AND status='delivering' AND attempts=$6`,
        [claimed.attempts >= 5 ? 'dead_letter' : 'failed', String(error.message || 'delivery failed').slice(0, 180), waitSeconds, claimed.id, tenantId, claimed.attempts]);
      return res.status(502).json({ error: 'WordPress delivery was not confirmed', detail: String(error.message || 'delivery failed').slice(0, 180), retryAfterSeconds: claimed.attempts >= 5 ? null : waitSeconds });
    }
  });

  // ---------------------------------------------------------------------
  // Variants — validated draft content only.
  // ---------------------------------------------------------------------
  router.post('/workflows/:id/variants', authenticate, async (req, res) => {
    try {
      const { tenantId, actorId } = actorContext(req, AUTHOR_ROLES);
      const wf = await loadWorkflow(tenantId, req.params.id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });

      const input = workflow.validateVariant(req.body || {});
      workflow.validateSourceCitations(wf.source_uri, input.sourceCitations);
      const sourceSnapshot = await verifiedSnapshot(pool, wf);
      const evidenceSpans = workflow.validateEvidenceSpans(input.body, sourceSnapshot.source_text, sourceSnapshot.source_sha256, input.evidenceSpans || [], sourceSnapshot.source_extraction);
      workflow.validatePdfPageCitations(wf.source_uri, input.sourceCitations, evidenceSpans, sourceSnapshot.source_extraction);
      const variant = await pool.query(
        `INSERT INTO content_variants
           (id, workflow_id, tenant_id, channel, body, source_citations, evidence_spans, source_evaluation, brand_evaluation, accessibility_evaluation, factual_fidelity, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,'draft',$12)
         RETURNING *`,
        [
          crypto.randomUUID(),
          wf.id,
          tenantId,
          input.channel,
          input.body,
          JSON.stringify(input.sourceCitations),
          JSON.stringify(evidenceSpans),
          JSON.stringify({ confirmed: false, sourceSha256: String(sourceSnapshot.source_sha256).trim() }),
          JSON.stringify({ passed: false, note: 'Independent review pending' }),
          JSON.stringify({ passed: false, note: 'Independent review pending' }),
          0,
          actorId,
        ]
      );

      if (wf.state === 'ingested' || wf.state === 'correction_required') {
        workflow.transition(wf.state, 'drafted');
        await pool.query('UPDATE content_workflows SET state = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3', ['drafted', wf.id, tenantId]);
      }
      await pool.query(
        `INSERT INTO content_audit_events (tenant_id, workflow_id, actor_id, action, from_state, to_state, evidence)
         VALUES ($1,$2,$3,'variant_drafted',$4,$5,$6::jsonb)`,
        [tenantId, wf.id, actorId, wf.state, wf.state === 'ingested' ? 'drafted' : wf.state, JSON.stringify({ variantId: variant.rows[0].id, channel: input.channel })]
      );
      res.status(201).json({ variant: variant.rows[0] });
    } catch (error) {
      fail(res, error);
    }
  });

  router.post('/workflows/:id/variants/:variantId/decision', authenticate, async (req, res) => {
    let client;
    try {
      const { tenantId, actorId, role } = actorContext(req, REVIEW_ROLES);
      const { decision, rationale } = req.body || {};
      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved or rejected' });
      }
      if (!String(rationale || '').trim()) {
        return res.status(400).json({ error: 'rationale is required' });
      }
      client = await pool.pool.connect();
      await client.query('BEGIN');
      const variant = await client.query(
        'SELECT * FROM content_variants WHERE id = $1 AND workflow_id = $2 AND tenant_id = $3 FOR UPDATE',
        [req.params.variantId, req.params.id, tenantId]
      );
      if (!variant.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Variant not found' }); }
      if (String(variant.rows[0].created_by) === String(actorId)) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'A variant cannot be reviewed by its own author' });
      }
      if (variant.rows[0].status !== 'draft') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Variant was already reviewed' }); }
      const assessment = workflow.validateReviewAssessment(req.body || {});
      const wf = (await client.query('SELECT * FROM content_workflows WHERE id=$1 AND tenant_id=$2', [req.params.id, tenantId])).rows[0];
      const sourceSnapshot = await verifiedSnapshot(client, wf);
      workflow.validateEvidenceSpans(variant.rows[0].body, sourceSnapshot.source_text, sourceSnapshot.source_sha256, variant.rows[0].evidence_spans, sourceSnapshot.source_extraction);
      workflow.validatePdfPageCitations(wf.source_uri, variant.rows[0].source_citations, variant.rows[0].evidence_spans, sourceSnapshot.source_extraction);

      const brandEvaluation = assessment ? { passed: true, reviewedBy: actorId, rationale: String(rationale).trim() } : variant.rows[0].brand_evaluation;
      const accessibilityEvaluation = assessment ? { passed: true, reviewedBy: actorId, rationale: String(rationale).trim() } : variant.rows[0].accessibility_evaluation;
      const sourceEvaluation = assessment ? { confirmed: true, reviewedBy: actorId, rationale: String(rationale).trim(), sourceSha256: String(sourceSnapshot.source_sha256).trim(), evidenceCount: variant.rows[0].evidence_spans.length } : variant.rows[0].source_evaluation;
      const updated = await client.query(
        'UPDATE content_variants SET status = $1,brand_evaluation=$2::jsonb,accessibility_evaluation=$3::jsonb,source_evaluation=$4::jsonb,factual_fidelity=$5 WHERE id = $6 AND tenant_id = $7 RETURNING *',
        [decision, JSON.stringify(brandEvaluation), JSON.stringify(accessibilityEvaluation), JSON.stringify(sourceEvaluation), assessment?.factualFidelity ?? variant.rows[0].factual_fidelity, variant.rows[0].id, tenantId]
      );
      await client.query(
        `INSERT INTO content_audit_events (tenant_id, workflow_id, actor_id, action, from_state, to_state, evidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [tenantId, req.params.id, actorId, `variant_${decision}`, variant.rows[0].status, decision, JSON.stringify({ variantId: variant.rows[0].id, role, rationale, assessment })]
      );
      await client.query('COMMIT');
      res.json({ variant: updated.rows[0] });
    } catch (error) {
      if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
      fail(res, error);
    } finally {
      if (client) client.release();
    }
  });

  // ---------------------------------------------------------------------
  // Submit for review.
  // ---------------------------------------------------------------------
  router.post('/workflows/:id/submit', authenticate, async (req, res) => {
    try {
      const { tenantId, actorId } = actorContext(req, AUTHOR_ROLES);
      const wf = await loadWorkflow(tenantId, req.params.id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });

      workflow.transition(wf.state, 'in_review');
      await pool.query('UPDATE content_workflows SET state = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3', ['in_review', wf.id, tenantId]);
      await pool.query(
        `INSERT INTO content_audit_events (tenant_id, workflow_id, actor_id, action, from_state, to_state, evidence)
         VALUES ($1,$2,$3,'submitted',$4,'in_review','{}'::jsonb)`,
        [tenantId, wf.id, actorId, wf.state]
      );
      res.json({ workflow: { ...wf, state: 'in_review' } });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---------------------------------------------------------------------
  // Approvals — identity always comes from the authenticated request.
  // ---------------------------------------------------------------------
  router.post('/workflows/:id/approvals', authenticate, async (req, res) => {
    try {
      const { tenantId, actorId, role } = actorContext(req, REVIEW_ROLES);
      const wf = await loadWorkflow(tenantId, req.params.id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });
      if (!['in_review', 'approved'].includes(wf.state)) {
        return res.status(409).json({ error: `Cannot record an approval while the workflow is "${wf.state}"` });
      }

      const { decision, rationale } = req.body || {};
      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved or rejected' });
      }
      if (!String(rationale || '').trim()) {
        return res.status(400).json({ error: 'rationale is required' });
      }

      const approval = await pool.query(
        `INSERT INTO content_approvals (workflow_id, tenant_id, decision, rationale, actor_id, actor_role)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [wf.id, tenantId, decision, String(rationale), actorId, role]
      );
      await pool.query(
        `INSERT INTO content_audit_events (tenant_id, workflow_id, actor_id, action, from_state, to_state, evidence)
         VALUES ($1,$2,$3,'approval_recorded',$4,$4,$5::jsonb)`,
        [tenantId, wf.id, actorId, wf.state, JSON.stringify({ decision, role })]
      );
      res.status(201).json({ approval: approval.rows[0] });
    } catch (error) {
      fail(res, error);
    }
  });

  // ---------------------------------------------------------------------
  // Transitions — publishing is gated by the service's canPublish() over the
  // recorded approvals and the approved, high-fidelity variants.
  // ---------------------------------------------------------------------
  router.post('/workflows/:id/transitions', authenticate, async (req, res) => {
    const client = await pool.pool.connect();
    try {
      const { tenantId, actorId } = actorContext(req, REVIEW_ROLES);
      const { to, reason } = req.body || {};
      const correlationId = String((req.body && req.body.correlationId) || crypto.randomUUID());
      if (!String(to || '').trim()) return res.status(400).json({ error: 'to is required' });
      if (!String(reason || '').trim()) return res.status(400).json({ error: 'reason is required' });

      const replayed = await client.query(
        'SELECT * FROM content_audit_events WHERE tenant_id = $1 AND workflow_id = $2 AND evidence->>$3 = $4 LIMIT 1',
        [tenantId, req.params.id, '_correlationId', correlationId]
      );
      if (replayed.rows[0]) {
        return res.json({ workflowId: req.params.id, replayed: true, to: replayed.rows[0].to_state });
      }

      await client.query('BEGIN');
      const wfResult = await client.query(
        'SELECT * FROM content_workflows WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [req.params.id, tenantId]
      );
      const wf = wfResult.rows[0];
      if (!wf) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Workflow not found' }); }

      workflow.transition(wf.state, to);

      if (to === 'approved') {
        const approvals = await client.query(
          "SELECT 1 FROM content_approvals WHERE workflow_id = $1 AND tenant_id = $2 AND decision = 'approved' LIMIT 1",
          [wf.id, tenantId]
        );
        if (!approvals.rows[0]) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'At least one recorded approval is required before the workflow can be approved' });
        }
      }

      let outboxRows = [];
      if (['scheduled', 'published'].includes(to)) {
        const approvals = await client.query('SELECT * FROM content_approvals WHERE workflow_id = $1 AND tenant_id = $2', [wf.id, tenantId]);
        const variants = await client.query('SELECT * FROM content_variants WHERE workflow_id = $1 AND tenant_id = $2', [wf.id, tenantId]);
        const sourceSnapshot = await verifiedSnapshot(client, wf);
        workflow.canPublish({ state: wf.state, approvals: approvals.rows, variants: variants.rows, sourceUri: wf.source_uri, sourceSnapshot });

        if (to === 'published') {
          for (const variant of variants.rows.filter((v) => v.status === 'approved')) {
            const queued = await client.query(
              `INSERT INTO content_publication_outbox
                 (id, workflow_id, variant_id, tenant_id, provider, idempotency_key, scheduled_for, status)
               VALUES ($1,$2,$3,$4,$5,$6,NOW(),'pending')
               ON CONFLICT (tenant_id, provider, idempotency_key) DO NOTHING
               RETURNING *`,
              [crypto.randomUUID(), wf.id, variant.id, tenantId, variant.channel, `${wf.id}:${correlationId}:${variant.id}`]
            );
            if (queued.rows[0]) outboxRows.push(queued.rows[0]);
          }
        }
      }

      await client.query(
        'UPDATE content_workflows SET state = $1, version = version + 1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
        [to, wf.id, tenantId]
      );
      await client.query(
        `INSERT INTO content_audit_events (tenant_id, workflow_id, actor_id, action, from_state, to_state, evidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [tenantId, wf.id, actorId, `transition_${to}`, wf.state, to, JSON.stringify({ reason, _correlationId: correlationId })]
      );
      await client.query('COMMIT');

      res.json({
        workflowId: wf.id,
        from: wf.state,
        to,
        outbox: outboxRows.length ? outboxRows : undefined,
        deliveryNote: to === 'published' && outboxRows.length
          ? 'Publication queued in the outbox. Delivery remains pending until an authorized publisher invokes a configured provider and a receipt is recorded.'
          : undefined,
      });
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* already rolled back */ }
      fail(res, error);
    } finally {
      client.release();
    }
  });

  return router;
}

module.exports = createWorkflowRouter;
