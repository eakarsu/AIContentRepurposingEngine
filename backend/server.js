const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const authRoutes = require('./routes/auth');
const contentRoutes = require('./routes/content');
const aiRoutes = require('./routes/ai');
const aiNewRoutes = require('./routes/aiNew');
const scheduleRoutes = require('./routes/schedule');
const analyticsRoutes = require('./routes/analytics');
const exportRoutes = require('./routes/export');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/ai', aiRoutes);

// New AI endpoints (content-audit, tone-matcher, content-series, ab-test-variants)
app.use('/api/ai', aiNewRoutes);






app.use('/api/ai', require('./routes/multilingualAdapt'));
app.use('/api/ai', require('./routes/seoLoop'));
app.use('/api/ai', require('./routes/engagementPredict'));
app.use('/api/ai', require('./routes/trendDetection'));
app.use('/api/ai', require('./routes/contentExpansion'));
// Content scheduling
app.use('/api/schedule', scheduleRoutes);

// Analytics
app.use('/api/analytics', analyticsRoutes);

// Exports (CSV)
app.use('/api/export', exportRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-schedule-analytics-lack-ai-endpoints-for-optimal-posting-tim', require('./routes/gap_schedule_analytics_lack_ai_endpoints_for_optimal_posting_tim'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-missing-extract-key-points-generate-thumbnail-suggest-hashta', require('./routes/gap_missing_extract_key_points_generate_thumbnail_suggest_hashta'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-limited-multi-channel-publishing-integrations-no-twitter-lin', require('./routes/gap_limited_multi_channel_publishing_integrations_no_twitter_lin'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-content-approval-workflow', require('./routes/gap_no_content_approval_workflow'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-audience-segmentation-or-personalization', require('./routes/gap_no_audience_segmentation_or_personalization'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-a-b-testing-or-variant-management', require('./routes/gap_no_a_b_testing_or_variant_management'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-webhooks', require('./routes/gap_no_webhooks'));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

module.exports = app;
