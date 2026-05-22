const express = require('express');
const router = express.Router();

router.post('/score', (req, res) => {
  const channels = Array.isArray(req.body?.channels) ? req.body.channels : [
    { name: 'LinkedIn', posts_7d: 9, engagement_delta: -0.18, duplicate_theme_rate: 0.42 },
    { name: 'Newsletter', posts_7d: 2, engagement_delta: 0.04, duplicate_theme_rate: 0.12 },
  ];
  const rows = channels.map((channel) => {
    const score = Math.min(100, Math.round(Number(channel.posts_7d || 0) * 5 + Math.max(0, -Number(channel.engagement_delta || 0)) * 120 + Number(channel.duplicate_theme_rate || 0) * 45));
    return { name: channel.name, score, tier: score >= 65 ? 'fatigued' : score >= 40 ? 'watch' : 'healthy', action: score >= 65 ? 'Reduce posting frequency and rotate format/theme mix.' : 'Keep current cadence.' };
  });
  res.json({ fatiguedCount: rows.filter((row) => row.tier === 'fatigued').length, channels: rows });
});

module.exports = router;
