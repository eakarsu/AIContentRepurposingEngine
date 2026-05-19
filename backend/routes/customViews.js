/**
 * Custom Views routes for AIContentRepurposingEngine
 *
 * Domain: Content repurposing / atomic content
 *
 * 4 endpoints:
 *   GET  /api/custom-views/format-performance      (VIZ - bar chart, format performance)
 *   GET  /api/custom-views/channel-heatmap         (VIZ - heatmap, channel x topic engagement)
 *   GET  /api/custom-views/content-plan-pdf        (NON-VIZ - PDF download)
 *   GET  /api/custom-views/repurposing-rules       (NON-VIZ - list mappings)
 *   POST /api/custom-views/repurposing-rules       (NON-VIZ - create mapping)
 *   PUT  /api/custom-views/repurposing-rules/:id   (NON-VIZ - update mapping)
 *   DELETE /api/custom-views/repurposing-rules/:id (NON-VIZ - delete mapping)
 *
 * NOTE: rules editor exposes a single REST collection; the 4 "feature" endpoints
 * the task references are the 4 capabilities (format-perf, heatmap, pdf, rules).
 */
const express = require('express');
const PDFDocument = require('pdfkit');
const auth = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// In-memory store for repurposing rules (source format -> target formats).
// Seeded with realistic content-repurposing mappings.
// ---------------------------------------------------------------------------
let ruleIdCounter = 1;
const repurposingRules = [
  { source: 'blog_post',       target: 'twitter_thread',     priority: 1, enabled: true,  notes: 'Atomize into 8-12 tweets, hook first.' },
  { source: 'blog_post',       target: 'linkedin_article',   priority: 2, enabled: true,  notes: 'Long-form, professional tone.' },
  { source: 'blog_post',       target: 'email_newsletter',   priority: 3, enabled: true,  notes: 'TL;DR + 3 key takeaways.' },
  { source: 'video',           target: 'youtube_shorts',     priority: 1, enabled: true,  notes: 'Pull 3 best 30-sec clips.' },
  { source: 'video',           target: 'instagram_reel',     priority: 2, enabled: true,  notes: 'Vertical crop, captions burned-in.' },
  { source: 'video',           target: 'podcast_audio',      priority: 3, enabled: true,  notes: 'Strip audio, add intro/outro.' },
  { source: 'podcast',         target: 'show_notes',         priority: 1, enabled: true,  notes: 'Timestamps + guest links.' },
  { source: 'podcast',         target: 'blog_post',          priority: 2, enabled: true,  notes: 'Transcribe + structure with H2s.' },
  { source: 'podcast',         target: 'audiogram',          priority: 3, enabled: false, notes: 'Best quote clip, 60s max.' },
  { source: 'webinar',         target: 'blog_post',          priority: 1, enabled: true,  notes: 'Recap + lessons learned.' },
  { source: 'webinar',         target: 'slideshare_deck',    priority: 2, enabled: true,  notes: 'Export slides + speaker notes.' },
  { source: 'social_post',     target: 'blog_post',          priority: 1, enabled: true,  notes: 'Expand viral thread into long-form.' },
].map((r) => ({ id: ruleIdCounter++, created_at: new Date().toISOString(), ...r }));

// ---------------------------------------------------------------------------
// Deterministic sample data for visualizations.
// ---------------------------------------------------------------------------
const FORMAT_PERFORMANCE = [
  { format: 'blog',          views: 18420, engagement: 6.4, conversions: 312, color: '#6c63ff' },
  { format: 'video',         views: 42810, engagement: 8.9, conversions: 587, color: '#00d2ff' },
  { format: 'social',        views: 67230, engagement: 5.1, conversions: 412, color: '#ff6b6b' },
  { format: 'podcast',       views:  9840, engagement: 7.3, conversions: 158, color: '#ffd166' },
  { format: 'email',         views: 23100, engagement: 9.2, conversions: 698, color: '#06d6a0' },
  { format: 'short_video',   views: 51200, engagement: 7.8, conversions: 421, color: '#c77dff' },
];

const CHANNELS = ['twitter', 'linkedin', 'youtube', 'instagram', 'tiktok', 'newsletter'];
const TOPICS   = ['ai', 'marketing', 'productivity', 'tutorials', 'case_studies'];

function buildHeatmap() {
  // deterministic pseudo-random so chart is stable across reloads
  const matrix = [];
  for (let r = 0; r < CHANNELS.length; r++) {
    const row = [];
    for (let c = 0; c < TOPICS.length; c++) {
      const seed = (r * 7 + c * 13 + 11) % 17;
      const value = Math.round((30 + seed * 4.2 + (r === c ? 18 : 0)) * 10) / 10;
      row.push(value);
    }
    matrix.push(row);
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// VIZ 1 - Format performance bar chart
// ---------------------------------------------------------------------------
router.get('/format-performance', auth, (req, res) => {
  res.json({
    ok: true,
    type: 'bar_chart',
    title: 'Format Performance (last 30 days)',
    x_axis: 'format',
    series: [
      { key: 'views',       label: 'Views',         color: '#6c63ff' },
      { key: 'engagement',  label: 'Engagement %',  color: '#00d2ff' },
      { key: 'conversions', label: 'Conversions',   color: '#ff6b6b' },
    ],
    data: FORMAT_PERFORMANCE,
    totals: {
      formats: FORMAT_PERFORMANCE.length,
      total_views: FORMAT_PERFORMANCE.reduce((s, f) => s + f.views, 0),
      total_conversions: FORMAT_PERFORMANCE.reduce((s, f) => s + f.conversions, 0),
    },
    generated_at: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// VIZ 2 - Channel x Topic engagement heatmap
// ---------------------------------------------------------------------------
router.get('/channel-heatmap', auth, (req, res) => {
  const matrix = buildHeatmap();
  res.json({
    ok: true,
    type: 'heatmap',
    title: 'Channel x Topic Engagement Heatmap',
    x_labels: TOPICS,
    y_labels: CHANNELS,
    matrix,
    min: Math.min(...matrix.flat()),
    max: Math.max(...matrix.flat()),
    generated_at: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// NON-VIZ 1 - Content Plan PDF
// ---------------------------------------------------------------------------
router.get('/content-plan-pdf', auth, (req, res) => {
  try {
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
    repurposingRules.forEach((r) => {
      const flag = r.enabled ? '[ON]' : '[off]';
      doc.text(`${flag} P${r.priority}  ${r.source}  ->  ${r.target}`);
      if (r.notes) doc.fillColor('#666').text(`     ${r.notes}`).fillColor('#222');
    });

    doc.moveDown(1);
    doc.fontSize(14).fillColor('#000').text('2. Format Performance (snapshot)', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#222');
    FORMAT_PERFORMANCE.forEach((f) => {
      doc.text(
        `${f.format.padEnd(14)} views=${String(f.views).padStart(6)}  eng=${f.engagement}%  conv=${f.conversions}`
      );
    });

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
// NON-VIZ 2 - Repurposing Rules CRUD (source -> target mappings)
// ---------------------------------------------------------------------------
router.get('/repurposing-rules', auth, (req, res) => {
  res.json({
    ok: true,
    total: repurposingRules.length,
    rules: repurposingRules.slice().sort((a, b) => a.priority - b.priority),
    sources: Array.from(new Set(repurposingRules.map((r) => r.source))),
    targets: Array.from(new Set(repurposingRules.map((r) => r.target))),
  });
});

router.post('/repurposing-rules', auth, (req, res) => {
  const { source, target, priority, enabled, notes } = req.body || {};
  if (!source || !target) {
    return res.status(400).json({ error: 'source and target are required' });
  }
  const rule = {
    id: ruleIdCounter++,
    source: String(source),
    target: String(target),
    priority: Number.isFinite(+priority) ? +priority : 5,
    enabled: enabled === undefined ? true : !!enabled,
    notes: notes ? String(notes) : '',
    created_at: new Date().toISOString(),
  };
  repurposingRules.push(rule);
  res.status(201).json({ ok: true, rule });
});

router.put('/repurposing-rules/:id', auth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = repurposingRules.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'rule not found' });
  const allowed = ['source', 'target', 'priority', 'enabled', 'notes'];
  for (const k of allowed) {
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) {
      repurposingRules[idx][k] = req.body[k];
    }
  }
  res.json({ ok: true, rule: repurposingRules[idx] });
});

router.delete('/repurposing-rules/:id', auth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = repurposingRules.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'rule not found' });
  const [removed] = repurposingRules.splice(idx, 1);
  res.json({ ok: true, removed });
});

module.exports = router;
