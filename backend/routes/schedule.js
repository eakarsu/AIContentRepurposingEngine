const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

const VALID_PLATFORMS = ['twitter', 'linkedin', 'instagram', 'facebook', 'youtube', 'tiktok', 'email', 'blog', 'other'];
const VALID_STATUSES = ['scheduled', 'published', 'cancelled'];

/**
 * Ensure the scheduled_posts table exists (graceful init).
 * In production this would be in a migration file.
 */
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      content_id INTEGER,
      platform VARCHAR(50) NOT NULL,
      publish_at TIMESTAMPTZ NOT NULL,
      title VARCHAR(500),
      notes TEXT,
      status VARCHAR(20) DEFAULT 'scheduled',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
ensureTable().catch(e => console.error('[schedule] table init error:', e.message));

/**
 * POST /api/schedule
 * Schedule content for publication.
 * Body: { platform, publish_at, content_id?, title?, notes? }
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { platform, publish_at, content_id, title, notes } = req.body;

    if (!platform || typeof platform !== 'string') {
      return res.status(400).json({ error: 'platform is required' });
    }
    if (!VALID_PLATFORMS.includes(platform.toLowerCase())) {
      return res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` });
    }
    if (!publish_at) {
      return res.status(400).json({ error: 'publish_at is required (ISO 8601 datetime)' });
    }

    const publishDate = new Date(publish_at);
    if (isNaN(publishDate.getTime())) {
      return res.status(400).json({ error: 'publish_at must be a valid ISO 8601 datetime' });
    }
    if (publishDate <= new Date()) {
      return res.status(400).json({ error: 'publish_at must be in the future' });
    }

    const result = await db.query(
      `INSERT INTO scheduled_posts (user_id, content_id, platform, publish_at, title, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled') RETURNING *`,
      [req.user.id, content_id || null, platform.toLowerCase(), publishDate, title || null, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('schedule POST error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schedule/upcoming
 * Returns scheduled posts for the next 7 days.
 */
router.get('/upcoming', authenticate, async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const daysNum = Math.min(30, Math.max(1, parseInt(days) || 7));

    const result = await db.query(
      `SELECT * FROM scheduled_posts
       WHERE user_id = $1
         AND status = 'scheduled'
         AND publish_at >= NOW()
         AND publish_at <= NOW() + INTERVAL '${daysNum} days'
       ORDER BY publish_at ASC`,
      [req.user.id]
    );

    res.json({
      upcoming: result.rows,
      count: result.rows.length,
      period_days: daysNum
    });
  } catch (err) {
    console.error('schedule GET upcoming error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/schedule
 * Returns all scheduled posts for the current user (with pagination).
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT * FROM scheduled_posts WHERE user_id = $1 ORDER BY publish_at ASC LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset]
      ),
      db.query('SELECT COUNT(*) AS total FROM scheduled_posts WHERE user_id = $1', [req.user.id])
    ]);

    const total = parseInt(countResult.rows[0].total);
    res.json({
      data: dataResult.rows,
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('schedule GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/schedule/:id
 * Update a scheduled post's time or other fields.
 */
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { publish_at, platform, title, notes, status } = req.body;

    // Verify ownership
    const existing = await db.query(
      'SELECT * FROM scheduled_posts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Scheduled post not found' });
    }

    const current = existing.rows[0];

    let newPublishAt = current.publish_at;
    if (publish_at) {
      newPublishAt = new Date(publish_at);
      if (isNaN(newPublishAt.getTime())) {
        return res.status(400).json({ error: 'publish_at must be a valid ISO 8601 datetime' });
      }
    }

    let newPlatform = current.platform;
    if (platform) {
      if (!VALID_PLATFORMS.includes(platform.toLowerCase())) {
        return res.status(400).json({ error: `platform must be one of: ${VALID_PLATFORMS.join(', ')}` });
      }
      newPlatform = platform.toLowerCase();
    }

    let newStatus = current.status;
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      newStatus = status;
    }

    const result = await db.query(
      `UPDATE scheduled_posts
       SET platform = $1, publish_at = $2, title = $3, notes = $4, status = $5, updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        newPlatform,
        newPublishAt,
        title !== undefined ? title : current.title,
        notes !== undefined ? notes : current.notes,
        newStatus,
        req.params.id,
        req.user.id
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('schedule PUT error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/schedule/:id
 */
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      'DELETE FROM scheduled_posts WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
