const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('./config/runtime').validateRuntime();

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
const corsOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
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

// === Custom Views (format performance, channel heatmap, content plan PDF, repurposing rules) ===
app.use('/api/custom-views', require('./routes/customViews'));
app.use('/api/channel-fatigue', require('./routes/channelFatigue'));

// 404 handler - MUST be last route handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
});

module.exports = app;
