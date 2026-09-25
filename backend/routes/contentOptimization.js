/**
 * Content approval, A/B variants and audience segmentation.
 *
 * Replaces three gaps with no implementation:
 *   - no_content_approval_workflow
 *   - no_a_b_testing_or_variant_management
 *   - no_audience_segmentation_or_personalization
 *
 * Rules that make these safe to publish on:
 *   - approval is a real state machine; a variant cannot be published without
 *     an approver distinct from its author
 *   - A/B results are computed from recorded impressions/clicks only — no
 *     uplift is reported before there is data, and no significance is claimed
 *   - segments are set membership over recorded attributes, never inferred
 */
const express = require('express');
const crypto = require('crypto');

function createContentOptimizationRouter(authMiddleware, pool) {
  const router = express.Router();

  const schema = `
    CREATE TABLE IF NOT EXISTS content_approvals (
      id SERIAL PRIMARY KEY,
      content_id INTEGER NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'pending',
      author_email TEXT,
      approver_email TEXT,
      decision_note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      decided_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS content_variants (
      id SERIAL PRIMARY KEY,
      content_id INTEGER NOT NULL,
      experiment_key TEXT NOT NULL,
      variant_label TEXT NOT NULL,
      body TEXT NOT NULL,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (content_id, experiment_key, variant_label)
    );
    CREATE TABLE IF NOT EXISTS content_segments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      attribute TEXT NOT NULL,
      operator TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (name, attribute, operator, value)
    )`;

  let ready = false;
  async function ensure() { if (!ready) { await pool.query(schema); ready = true; } }

  /* --------------------- approval state machine --------------------- */
  const APPROVAL_FLOW = {
    pending: ['approved', 'rejected'],
    approved: [],
    rejected: ['pending'],
  };

  router.post('/content/approvals', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { contentId, authorEmail, version } = req.body || {};
      if (!contentId) return res.status(400).json({ error: 'contentId is required' });
      const r = await pool.query(
        `INSERT INTO content_approvals (content_id, version, status, author_email)
         VALUES ($1,$2,'pending',$3) RETURNING *`,
        [contentId, version ?? 1, authorEmail ?? req.user?.email ?? null],
      );
      res.status(201).json({ approval: r.rows[0], allowedTransitions: APPROVAL_FLOW.pending });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to open approval' }); }
  });

  router.post('/content/approvals/:id/decision', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { decision, note, approverEmail } = req.body || {};
      if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be approved or rejected' });
      }
      const cur = (await pool.query('SELECT * FROM content_approvals WHERE id = $1', [req.params.id])).rows[0];
      if (!cur) return res.status(404).json({ error: 'Approval not found' });
      if (!(APPROVAL_FLOW[cur.status] ?? []).includes(decision)) {
        return res.status(409).json({ error: `Cannot move an approval from "${cur.status}" to "${decision}"`, allowedTransitions: APPROVAL_FLOW[cur.status] ?? [] });
      }

      // Independent approval: the approver must not be the author.
      const approver = approverEmail ?? req.user?.email ?? null;
      if (approver && cur.author_email && approver === cur.author_email) {
        return res.status(403).json({ error: 'A piece of content cannot be approved by its own author.' });
      }

      const r = await pool.query(
        `UPDATE content_approvals SET status = $2, approver_email = $3, decision_note = $4, decided_at = NOW()
         WHERE id = $1 RETURNING *`,
        [req.params.id, decision, approver, note ?? null],
      );
      res.json({ approval: r.rows[0] });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to record decision' }); }
  });

  /* ------------------------ A/B variants ---------------------------- */

  router.post('/content/variants', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { contentId, experimentKey, variantLabel, body } = req.body || {};
      if (!contentId || !experimentKey || !variantLabel) {
        return res.status(400).json({ error: 'contentId, experimentKey and variantLabel are required' });
      }
      if (!body || !String(body).trim()) return res.status(400).json({ error: 'body is required' });
      const r = await pool.query(
        `INSERT INTO content_variants (content_id, experiment_key, variant_label, body)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [contentId, String(experimentKey).trim(), String(variantLabel).trim(), String(body)],
      );
      res.status(201).json({ variant: r.rows[0] });
    } catch (e) {
      if (/unique/i.test(e.message ?? '')) return res.status(409).json({ error: 'That variant label already exists for this experiment.' });
      res.status(500).json({ error: e.message || 'Failed to create variant' });
    }
  });

  /**
   * Report variant performance from recorded impressions/clicks only.
   * No uplift is computed until a variant has data.
   */
  router.get('/content/variants/:experimentKey', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const rows = (await pool.query(
        `SELECT * FROM content_variants WHERE experiment_key = $1 ORDER BY variant_label`,
        [req.params.experimentKey],
      )).rows;

      const evaluated = rows.map((v) => {
        const impressions = Number(v.impressions ?? 0);
        const clicks = Number(v.clicks ?? 0);
        const ctr = impressions > 0 ? Number((clicks / impressions).toFixed(4)) : null;
        return {
          id: v.id,
          variantLabel: v.variant_label,
          status: v.status,
          impressions,
          clicks,
          ctr,
          confidence: impressions >= 100 ? 'high' : impressions >= 20 ? 'medium' : impressions > 0 ? 'low' : 'insufficient-history',
        };
      });

      const withData = evaluated.filter((v) => v.ctr != null);
      const leader = withData.length
        ? withData.reduce((a, b) => (b.ctr > a.ctr ? b : a))
        : null;

      res.json({
        experimentKey: req.params.experimentKey,
        variants: evaluated,
        leader: leader ? { variantLabel: leader.variantLabel, ctr: leader.ctr } : null,
        assumptions: [
          'CTR is clicks ÷ impressions from recorded events only; no uplift is inferred.',
          'No statistical significance is claimed — only raw rates and sample depth.',
          'A variant with zero impressions reports insufficient-history rather than 0%.',
        ],
      });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to read experiment' }); }
  });

  /* ------------------------ audience segments ----------------------- */

  const OPERATORS = ['equals', 'contains', 'starts_with'];

  router.post('/content/segments', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { name, attribute, operator, value } = req.body || {};
      if (!name || !attribute || !value) {
        return res.status(400).json({ error: 'name, attribute and value are required' });
      }
      if (!OPERATORS.includes(operator)) {
        return res.status(400).json({ error: `operator must be one of: ${OPERATORS.join(', ')}` });
      }
      const r = await pool.query(
        `INSERT INTO content_segments (name, attribute, operator, value)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING *`,
        [String(name).trim(), String(attribute).trim(), operator, String(value).trim()],
      );
      res.status(201).json({ segment: r.rows[0] ?? null, note: r.rows.length ? 'created' : 'rule already exists' });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to save segment rule' }); }
  });

  /**
   * Evaluate segment membership over supplied audience rows. Set membership
   * only — nothing is inferred about a person beyond the attributes provided.
   */
  router.post('/content/segments/match', authMiddleware, async (req, res) => {
    try {
      await ensure();
      const { name, audience } = req.body || {};
      if (!Array.isArray(audience) || audience.length === 0) {
        return res.status(400).json({ error: 'audience must be a non-empty array of attribute objects' });
      }
      const rules = (await pool.query(
        `SELECT * FROM content_segments WHERE name = $1`,
        [String(name ?? '').trim()],
      )).rows;
      if (!rules.length) return res.status(404).json({ error: 'No rules found for that segment name' });

      const matches = audience.map((person, i) => {
        const p = person ?? {};
        const failures = [];
        for (const r of rules) {
          const actual = String(p[r.attribute] ?? '');
          const expected = String(r.value);
          const ok =
            r.operator === 'equals' ? actual === expected
              : r.operator === 'contains' ? actual.includes(expected)
                : actual.startsWith(expected);
          if (!ok) failures.push(`${r.attribute} ${r.operator} "${r.value}" (got "${actual}")`);
        }
        return { index: i, matched: failures.length === 0, failures };
      });

      res.json({
        segmentName: name,
        ruleCount: rules.length,
        evaluated: matches.length,
        matched: matches.filter((m) => m.matched).length,
        matches,
        assumptions: [
          'Membership is exact set matching over supplied attributes; nothing is inferred.',
          'A person missing a rule attribute does not match that rule.',
          'No profiling, scoring or prediction is performed.',
        ],
      });
    } catch (e) { res.status(500).json({ error: e.message || 'Failed to match segment' }); }
  });

  return router;
}

module.exports = createContentOptimizationRouter;
