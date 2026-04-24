const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

// Feature-to-table mapping
const FEATURE_TABLE_MAP = {
  'content_library': 'content_library',
  'blog_to_social': 'blog_to_social',
  'video_scripts': 'video_scripts',
  'podcast_notes': 'podcast_notes',
  'email_newsletters': 'email_newsletters',
  'seo_optimizer': 'seo_optimizer',
  'tweet_threads': 'tweet_threads',
  'linkedin_posts': 'linkedin_posts',
  'instagram_captions': 'instagram_captions',
  'youtube_descriptions': 'youtube_descriptions',
  'content_summaries': 'content_summaries',
  'headlines': 'headlines',
  'content_translator': 'content_translator',
  'ad_copy': 'ad_copy',
  'press_releases': 'press_releases'
};

const getTable = (feature) => {
  const table = FEATURE_TABLE_MAP[feature];
  if (!table) return null;
  return table;
};

// Middleware to validate feature parameter
const validateFeature = (req, res, next) => {
  const { feature } = req.params;
  if (!getTable(feature)) {
    return res.status(400).json({
      error: `Invalid feature: ${feature}`,
      validFeatures: Object.keys(FEATURE_TABLE_MAP)
    });
  }
  next();
};

// Apply auth to all routes
router.use(authenticate);

// GET /api/content/:feature - List all items for a feature
router.get('/:feature', validateFeature, async (req, res) => {
  try {
    const table = getTable(req.params.feature);
    const { status, search, limit = 50, offset = 0 } = req.query;

    let query = `SELECT * FROM ${table} WHERE user_id = $1`;
    const params = [req.user.id];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (title ILIKE $${paramIndex} OR content ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM ${table} WHERE user_id = $1`;
    const countParams = [req.user.id];
    if (status) {
      countQuery += ` AND status = $2`;
      countParams.push(status);
    }
    const countResult = await db.query(countQuery, countParams);

    res.json({
      items: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error(`Error listing ${req.params.feature}:`, err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET /api/content/:feature/:id - Get single item
router.get('/:feature/:id', validateFeature, async (req, res) => {
  try {
    const table = getTable(req.params.feature);
    const result = await db.query(
      `SELECT * FROM ${table} WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error(`Error getting ${req.params.feature}:`, err);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// POST /api/content/:feature - Create item
router.post('/:feature', validateFeature, async (req, res) => {
  try {
    const table = getTable(req.params.feature);
    const { title, content, ai_output, status = 'draft' } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    let query, params;

    if (req.params.feature === 'content_library') {
      const { category } = req.body;
      query = `INSERT INTO ${table} (title, content, ai_output, status, category, user_id)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *`;
      params = [title, content || '', ai_output || null, status, category || null, req.user.id];
    } else {
      query = `INSERT INTO ${table} (title, content, ai_output, status, user_id)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING *`;
      params = [title, content || '', ai_output || null, status, req.user.id];
    }

    const result = await db.query(query, params);
    res.status(201).json({ item: result.rows[0] });
  } catch (err) {
    console.error(`Error creating ${req.params.feature}:`, err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /api/content/:feature/:id - Update item
router.put('/:feature/:id', validateFeature, async (req, res) => {
  try {
    const table = getTable(req.params.feature);
    const { title, content, ai_output, status } = req.body;

    // Check ownership
    const existing = await db.query(
      `SELECT id FROM ${table} WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const fields = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (content !== undefined) {
      fields.push(`content = $${paramIndex++}`);
      params.push(content);
    }
    if (ai_output !== undefined) {
      fields.push(`ai_output = $${paramIndex++}`);
      params.push(ai_output);
    }
    if (status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (req.params.feature === 'content_library' && req.body.category !== undefined) {
      fields.push(`category = $${paramIndex++}`);
      params.push(req.body.category);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    params.push(req.params.id, req.user.id);

    const query = `UPDATE ${table} SET ${fields.join(', ')}
                   WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
                   RETURNING *`;

    const result = await db.query(query, params);
    res.json({ item: result.rows[0] });
  } catch (err) {
    console.error(`Error updating ${req.params.feature}:`, err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/content/:feature/:id - Delete item
router.delete('/:feature/:id', validateFeature, async (req, res) => {
  try {
    const table = getTable(req.params.feature);
    const result = await db.query(
      `DELETE FROM ${table} WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item deleted successfully', id: result.rows[0].id });
  } catch (err) {
    console.error(`Error deleting ${req.params.feature}:`, err);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
