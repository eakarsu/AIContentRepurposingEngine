/**
 * Custom Views routes for AIContentRepurposingEngine
 *
 * All data shown here is either recorded by this application or explicitly
 * reported as unavailable — nothing is synthesized.
 *
 *   GET    /api/custom-views/format-performance     (recorded provider snapshots)
 *   GET    /api/custom-views/channel-heatmap        (recorded provider x topic snapshots)
 *   GET    /api/custom-views/content-plan-pdf       (rules + recorded snapshot summary)
 *   GET    /api/custom-views/repurposing-rules      (persisted, per user)
 *   POST   /api/custom-views/repurposing-rules
 *   PUT    /api/custom-views/repurposing-rules/:id
 *   DELETE /api/custom-views/repurposing-rules/:id
 */
const express = require('express');
const PDFDocument = require('pdfkit');
const auth = require('../middleware/auth');
const db = require('../db');

const router = express.Router();

const FORMAT_COLORS = ['#6c63ff', '#00d2ff', '#ff6b6b', '#ffd166', '#06d6a0', '#c77dff', '#f72585', '#4cc9f0'];

function tenantOf(user) {
  return user.tenantId || user.tenant_id || `user:${user.id}`;
}

// ---------------------------------------------------------------------------
// Repurposing rules — persisted per user.
// ---------------------------------------------------------------------------

let rulesTableReady = false;
async function ensureRulesTable() {
  if (rulesTableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS repurposing_rules (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 5,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await db.query('CREATE INDEX IF NOT EXISTS idx_repurposing_rules_user ON repurposing_rules(user_id, priority)');
  rulesTableReady = true;
}

async function listRules(userId) {
  const result = await db.query(
    'SELECT id, source, target, priority, enabled, notes, created_at FROM repurposing_rules WHERE user_id = $1 ORDER BY priority, id',
    [userId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// Recorded performance. Reads content_performance_snapshots joined to the
// caller's workflows. Returns empty data (with a note) when nothing is recorded.
// ---------------------------------------------------------------------------

async function performanceByProvider(user) {
  try {
    const result = await db.query(
      `SELECT s.provider,
              COUNT(*)::int AS snapshots,
              COALESCE(SUM(CASE WHEN jsonb_typeof(s.metrics->'views') = 'number'
                                THEN (s.metrics->>'views')::numeric ELSE 0 END), 0)::float AS views,
              COALESCE(AVG(CASE WHEN jsonb_typeof(s.metrics->'engagement') = 'number'
                                THEN (s.metrics->>'engagement')::numeric END), 0)::float AS engagement,
              COALESCE(SUM(CASE WHEN jsonb_typeof(s.metrics->'conversions') = 'number'
                                THEN (s.metrics->>'conversions')::numeric ELSE 0 END), 0)::float AS conversions
       FROM content_performance_snapshots s
       JOIN content_workflows w ON w.id = s.workflow_id
       WHERE w.tenant_id = $1
       GROUP BY s.provider
       ORDER BY s.provider`,
      [tenantOf(user)]
    );
    return result.rows;
  } catch (error) {
    // Migration 001 creates the snapshot tables; without it there is simply no
    // recorded data yet (report that instead of failing the chart).
    if (error.code === '42P01') return [];
    throw error;
  }
}

// ---------------------------------------------------------------------------
// VIZ 1 - Format performance bar chart
// ---------------------------------------------------------------------------
router.get('/format-performance', auth, async (req, res) => {
  try {
    const rows = await performanceByProvider(req.user);
    const data = rows.map((row, i) => ({
      format: row.provider,
      views: Math.round(Number(row.views)),
      engagement: Math.round(Number(row.engagement) * 100) / 100,
      conversions: Math.round(Number(row.conversions)),
      snapshots: row.snapshots,
      color: FORMAT_COLORS[i % FORMAT_COLORS.length],
    }));

    res.json({
      ok: true,
      type: 'bar_chart',
      title: 'Format Performance (recorded snapshots)',
      x_axis: 'format',
      series: [
        { key: 'views',       label: 'Views',        color: '#6c63ff' },
        { key: 'engagement',  label: 'Engagement',   color: '#00d2ff' },
        { key: 'conversions', label: 'Conversions',  color: '#ff6b6b' },
      ],
      data,
      totals: {
        formats: data.length,
        total_views: data.reduce((s, f) => s + f.views, 0),
        total_conversions: data.reduce((s, f) => s + f.conversions, 0),
      },
      note: data.length
        ? 'Computed from content_performance_snapshots recorded for this account.'
        : 'No provider performance snapshots have been recorded yet. Connect a provider and record snapshots to populate this chart.',
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[custom-views] format-performance error', err);
    res.status(500).json({ error: 'Failed to load format performance' });
  }
});

// ---------------------------------------------------------------------------
// VIZ 2 - Channel x Topic engagement heatmap (recorded snapshots only)
// ---------------------------------------------------------------------------
router.get('/channel-heatmap', auth, async (req, res) => {
  try {
    let rows = [];
    try {
      const result = await db.query(
        `SELECT s.provider,
                COALESCE(NULLIF(s.metrics->>'topic', ''), 'unclassified') AS topic,
                COUNT(*)::int AS snapshots,
                AVG(CASE WHEN jsonb_typeof(s.metrics->'engagement') = 'number'
                         THEN (s.metrics->>'engagement')::numeric END)::float AS avg_engagement
         FROM content_performance_snapshots s
         JOIN content_workflows w ON w.id = s.workflow_id
         WHERE w.tenant_id = $1
         GROUP BY s.provider, topic
         ORDER BY s.provider, topic`,
        [tenantOf(req.user)]
      );
      rows = result.rows;
    } catch (error) {
      if (error.code === '42P01') rows = [];
      else throw error;
    }

    const y_labels = [...new Set(rows.map((r) => r.provider))];
    const x_labels = [...new Set(rows.map((r) => r.topic))];
    const matrix = y_labels.map((channel) => x_labels.map((topic) => {
      const row = rows.find((r) => r.provider === channel && r.topic === topic);
      if (!row) return 0;
      return row.avg_engagement != null
        ? Math.round(Number(row.avg_engagement) * 100) / 100
        : Number(row.snapshots);
    }));
    const flat = matrix.flat();

    res.json({
      ok: true,
      type: 'heatmap',
      title: 'Channel x Topic Engagement (recorded snapshots)',
      x_labels,
      y_labels,
      matrix,
      min: flat.length ? Math.min(...flat) : null,
      max: flat.length ? Math.max(...flat) : null,
      note: flat.length
        ? 'Values are the average recorded engagement per provider/topic snapshot; snapshot count when engagement is absent.'
        : 'No provider performance snapshots have been recorded yet.',
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[custom-views] channel-heatmap error', err);
    res.status(500).json({ error: 'Failed to load channel heatmap' });
  }
});

// ---------------------------------------------------------------------------
// NON-VIZ 1 - Content Plan PDF (persisted rules + recorded snapshots only)
// ---------------------------------------------------------------------------
router.get('/content-plan-pdf', auth, async (req, res) => {
  try {
    await ensureRulesTable();
    const rules = await listRules(req.user.id);
    const performance = await performanceByProvider(req.user);

    const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="content_plan.pdf"');
    doc.pipe(res);

    doc.fontSize(22).fillColor('#6c63ff').text('Content Repurposing Plan', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(11).fillColor('#444').text(
      `Generated ${new Date().toISOString().slice(0, 10)} for ${req.user?.email || 'user'}`,
      { align: 'center' }
    );
    doc.moveDown(1.2);

    doc.fontSize(14).fillColor('#000').text('1. Repurposing Rules', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#222');
    if (rules.length === 0) {
      doc.fillColor('#666').text('No repurposing rules are saved for this account.').fillColor('#222');
    } else {
      rules.forEach((r) => {
        const flag = r.enabled ? '[ON]' : '[off]';
        doc.text(`${flag} P${r.priority}  ${r.source}  ->  ${r.target}`);
        if (r.notes) doc.fillColor('#666').text(`     ${r.notes}`).fillColor('#222');
      });
    }

    doc.moveDown(1);
    doc.fontSize(14).fillColor('#000').text('2. Recorded Performance Snapshots', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#222');
    if (performance.length === 0) {
      doc.fillColor('#666').text('No provider performance snapshots have been recorded for this account.').fillColor('#222');
    } else {
      performance.forEach((row) => {
        doc.text(
          `${String(row.provider).padEnd(14)} snapshots=${String(row.snapshots).padStart(4)}  ` +
          `views=${Math.round(Number(row.views))}  engagement=${Math.round(Number(row.engagement) * 100) / 100}  ` +
          `conversions=${Math.round(Number(row.conversions))}`
        );
      });
    }

    doc.moveDown(1);
    doc.fontSize(14).fillColor('#000').text('3. Weekly Production Cadence', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#222');
    [
      'Mon  -  Publish flagship blog post (anchor content)',
      'Tue  -  Atomize blog -> 1 twitter thread + 1 LinkedIn article',
      'Wed  -  Record video version, schedule for YouTube',
      'Thu  -  Cut 3 shorts/reels from the video',
      'Fri  -  Newsletter recap + podcast snippet',
      'Sat  -  Repost top performers on TikTok',
      'Sun  -  Review analytics, update rules',
    ].forEach((line) => doc.text(line));

    doc.end();
  } catch (err) {
    console.error('[custom-views] pdf error', err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// NON-VIZ 2 - Repurposing Rules CRUD (source -> target mappings, per user)
// ---------------------------------------------------------------------------
router.get('/repurposing-rules', auth, async (req, res) => {
  try {
    await ensureRulesTable();
    const rules = await listRules(req.user.id);
    res.json({
      ok: true,
      total: rules.length,
      rules: rules.slice().sort((a, b) => a.priority - b.priority),
      sources: Array.from(new Set(rules.map((r) => r.source))),
      targets: Array.from(new Set(rules.map((r) => r.target))),
    });
  } catch (err) {
    console.error('[custom-views] rules list error', err);
    res.status(500).json({ error: 'Failed to load repurposing rules' });
  }
});

router.post('/repurposing-rules', auth, async (req, res) => {
  try {
    await ensureRulesTable();
    const { source, target, priority, enabled, notes } = req.body || {};
    if (!source || !target) {
      return res.status(400).json({ error: 'source and target are required' });
    }
    const parsedPriority = Number.isFinite(+priority) ? Math.trunc(+priority) : 5;
    const result = await db.query(
      `INSERT INTO repurposing_rules (user_id, source, target, priority, enabled, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, source, target, priority, enabled, notes, created_at`,
      [req.user.id, String(source), String(target), parsedPriority, enabled === undefined ? true : !!enabled, notes ? String(notes) : '']
    );
    res.status(201).json({ ok: true, rule: result.rows[0] });
  } catch (err) {
    console.error('[custom-views] rule create error', err);
    res.status(500).json({ error: 'Failed to create repurposing rule' });
  }
});

router.put('/repurposing-rules/:id', auth, async (req, res) => {
  try {
    await ensureRulesTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'invalid rule id' });

    const allowed = ['source', 'target', 'priority', 'enabled', 'notes'];
    const fields = [];
    const params = [id, req.user.id];
    for (const key of allowed) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
        fields.push(`${key} = $${params.length + 1}`);
        params.push(key === 'priority' ? Math.trunc(Number(req.body[key]) || 5) : req.body[key]);
      }
    }
    if (fields.length === 0) return res.status(400).json({ error: 'no supported fields supplied' });
    fields.push('updated_at = NOW()');

    const result = await db.query(
      `UPDATE repurposing_rules SET ${fields.join(', ')} WHERE id = $1 AND user_id = $2
       RETURNING id, source, target, priority, enabled, notes, created_at`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'rule not found' });
    res.json({ ok: true, rule: result.rows[0] });
  } catch (err) {
    console.error('[custom-views] rule update error', err);
    res.status(500).json({ error: 'Failed to update repurposing rule' });
  }
});

router.delete('/repurposing-rules/:id', auth, async (req, res) => {
  try {
    await ensureRulesTable();
    const id = parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'invalid rule id' });
    const result = await db.query(
      'DELETE FROM repurposing_rules WHERE id = $1 AND user_id = $2 RETURNING id, source, target, priority, enabled, notes, created_at',
      [id, req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'rule not found' });
    res.json({ ok: true, removed: result.rows[0] });
  } catch (err) {
    console.error('[custom-views] rule delete error', err);
    res.status(500).json({ error: 'Failed to delete repurposing rule' });
  }
});

module.exports = router;
