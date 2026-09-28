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

const AUTHOR_ROLES = ['author', 'editor', 'publisher', 'admin'];
const REVIEW_ROLES = ['editor', 'publisher', 'admin'];

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
  router.get('/workflows/:id', authenticate, async (req, res) => {
    try {
      const { tenantId } = actorContext(req, AUTHOR_ROLES);
      const wf = await loadWorkflow(tenantId, req.params.id);
      if (!wf) return res.status(404).json({ error: 'Workflow not found' });

      const [variants, approvals, outbox] = await Promise.all([
        pool.query('SELECT * FROM content_variants WHERE workflow_id = $1 AND tenant_id = $2 ORDER BY created_at', [wf.id, tenantId]),
        pool.query('SELECT * FROM content_approvals WHERE workflow_id = $1 AND tenant_id = $2 ORDER BY created_at', [wf.id, tenantId]),
        pool.query('SELECT id, variant_id, provider, status, attempts, last_error_code, provider_reference, scheduled_for FROM content_publication_outbox WHERE workflow_id = $1 AND tenant_id = $2 ORDER BY created_at', [wf.id, tenantId]),
      ]);
      res.json({ workflow: wf, variants: variants.rows, approvals: approvals.rows, outbox: outbox.rows });
    } catch (error) {
      fail(res, error);
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
      const variant = await pool.query(
        `INSERT INTO content_variants
           (id, workflow_id, tenant_id, channel, body, source_citations, brand_evaluation, accessibility_evaluation, factual_fidelity, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9,'draft',$10)
         RETURNING *`,
        [
          crypto.randomUUID(),
          wf.id,
          tenantId,
          input.channel,
          input.body,
          JSON.stringify(input.sourceCitations),
          JSON.stringify(input.brandEvaluation),
          JSON.stringify(input.accessibilityEvaluation),
          Number(input.factualFidelity),
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
    try {
      const { tenantId, actorId, role } = actorContext(req, REVIEW_ROLES);
      const { decision, rationale } = req.body || {};
      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved or rejected' });
      }
      if (!String(rationale || '').trim()) {
        return res.status(400).json({ error: 'rationale is required' });
      }

      const variant = await pool.query(
        'SELECT * FROM content_variants WHERE id = $1 AND workflow_id = $2 AND tenant_id = $3',
        [req.params.variantId, req.params.id, tenantId]
      );
      if (!variant.rows[0]) return res.status(404).json({ error: 'Variant not found' });
      if (String(variant.rows[0].created_by) === String(actorId)) {
        return res.status(403).json({ error: 'A variant cannot be reviewed by its own author' });
      }

      const updated = await pool.query(
        'UPDATE content_variants SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
        [decision, variant.rows[0].id, tenantId]
      );
      await pool.query(
        `INSERT INTO content_audit_events (tenant_id, workflow_id, actor_id, action, from_state, to_state, evidence)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [tenantId, req.params.id, actorId, `variant_${decision}`, variant.rows[0].status, decision, JSON.stringify({ variantId: variant.rows[0].id, role, rationale })]
      );
      res.json({ variant: updated.rows[0] });
    } catch (error) {
      fail(res, error);
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
        workflow.canPublish({ state: wf.state, approvals: approvals.rows, variants: variants.rows });

        if (to === 'published') {
          for (const variant of variants.rows.filter((v) => v.status === 'approved')) {
            const queued = await client.query(
              `INSERT INTO content_publication_outbox
                 (id, workflow_id, variant_id, tenant_id, provider, idempotency_key, scheduled_for, status)
               VALUES ($1,$2,$3,$4,$5,$6,NOW(),'pending')
               ON CONFLICT (tenant_id, provider, idempotency_key) DO NOTHING
               RETURNING *`,
              [crypto.randomUUID(), wf.id, variant.id, tenantId, variant.channel, correlationId]
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
          ? 'Publication queued in the outbox. No provider connector is configured, so deliveries remain pending until one is.'
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
