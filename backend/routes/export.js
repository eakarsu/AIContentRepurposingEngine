const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

/**
 * GET /api/export/content-library
 * Exports the user's content library as a CSV file.
 */
router.get('/content-library', authenticate, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, title, category, status, created_at, updated_at
       FROM content_library
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    const rows = result.rows;

    // Build CSV manually (no extra dependency needed)
    const csvHeaders = ['id', 'title', 'category', 'status', 'created_at', 'updated_at'];

    function escapeCSV(value) {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // Escape double quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const csvLines = [
      csvHeaders.join(','),
      ...rows.map(row =>
        csvHeaders.map(h => escapeCSV(row[h])).join(',')
      )
    ];

    const csv = csvLines.join('\n');
    const filename = `content-library-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error('export content-library error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
