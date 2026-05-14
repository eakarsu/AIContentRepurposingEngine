const express = require('express');
const router = express.Router();
const db = require('../db');
const authenticate = require('../middleware/auth');

/**
 * GET /api/analytics/repurpose-stats
 * Most popular features, average generation time, usage trends.
 */
router.get('/repurpose-stats', authenticate, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const daysNum = Math.min(365, Math.max(1, parseInt(days) || 30));

    // The feature tables are named exactly as the feature keys
    const featureTables = [
      'blog_to_social',
      'video_scripts',
      'podcast_notes',
      'email_newsletters',
      'seo_optimizer',
      'tweet_threads',
      'linkedin_posts',
      'instagram_captions',
      'youtube_descriptions',
      'content_summaries',
      'headlines',
      'content_translator',
      'ad_copy',
      'press_releases'
    ];

    const featureStats = [];
    for (const table of featureTables) {
      try {
        const result = await db.query(
          `SELECT
            COUNT(*) AS total_uses,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
            COUNT(CASE WHEN created_at >= NOW() - INTERVAL '${daysNum} days' THEN 1 END) AS recent_uses
           FROM ${table}
           WHERE user_id = $1`,
          [req.user.id]
        );
        featureStats.push({
          feature: table,
          total_uses: parseInt(result.rows[0]?.total_uses) || 0,
          completed: parseInt(result.rows[0]?.completed) || 0,
          recent_uses: parseInt(result.rows[0]?.recent_uses) || 0
        });
      } catch (tableErr) {
        // Table may not exist yet
        featureStats.push({
          feature: table,
          total_uses: 0,
          completed: 0,
          recent_uses: 0
        });
      }
    }

    // Sort by total_uses descending
    featureStats.sort((a, b) => b.total_uses - a.total_uses);

    const totalGenerations = featureStats.reduce((sum, f) => sum + f.total_uses, 0);
    const totalRecent = featureStats.reduce((sum, f) => sum + f.recent_uses, 0);

    // Content library stats
    let contentLibraryStats = { total: 0, recent: 0 };
    try {
      const clResult = await db.query(
        `SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '${daysNum} days' THEN 1 END) AS recent
         FROM content_library
         WHERE user_id = $1`,
        [req.user.id]
      );
      contentLibraryStats = {
        total: parseInt(clResult.rows[0]?.total) || 0,
        recent: parseInt(clResult.rows[0]?.recent) || 0
      };
    } catch (e) {
      // table may not exist
    }

    res.json({
      period_days: daysNum,
      summary: {
        total_generations: totalGenerations,
        recent_generations: totalRecent,
        content_library_items: contentLibraryStats.total,
        recent_content_library_items: contentLibraryStats.recent,
        most_popular_feature: featureStats[0]?.feature || 'N/A',
        unique_features_used: featureStats.filter(f => f.total_uses > 0).length
      },
      features_ranked: featureStats,
      note: 'avg_generation_time is not tracked at DB level; instrument via application-level metrics for precise timing'
    });
  } catch (err) {
    console.error('repurpose-stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
