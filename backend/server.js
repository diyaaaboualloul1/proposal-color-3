require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Global crash recovery handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

const app = express();
const PORT = process.env.PORT || 6001;

// Ensure required directories exist
const REQUIRED_DIRS = [
  process.env.STORAGE_ROOT || '/srs-platform/projects',
  process.env.UPLOAD_DIR || '/srs-platform/uploads',
];

for (const dir of REQUIRED_DIRS) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
}

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const { generalLimiter } = require('./middleware/rateLimit');
app.use('/api/', generalLimiter);

// Health check (no auth needed)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Queue status (no auth needed — public)
app.get('/api/queue/status', (req, res) => {
  const { getQueueStatus } = require('./services/generationQueue');
  res.json(getQueueStatus());
});

// Routes
const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const projectsRouter = require('./routes/projects');
const questionnaireRouter = require('./routes/questionnaire');
const srsRouter = require('./routes/srs');
const chatRouter = require('./routes/chat');
const activityRouter = require('./routes/activity');
const storageRouter = require('./routes/storage');
const convertRouter = require('./routes/convert');
const shareRoutes = require('./routes/share');
const proposalsRouter = require('./routes/proposals');
const commentRoutes = require('./routes/comments');
const settingsRouter = require('./routes/settings');

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/questionnaire', questionnaireRouter);
app.use('/api/projects/:projectId/srs', srsRouter);
app.use('/api/projects/:projectId/chat', chatRouter);
app.use('/api/activity', activityRouter);
app.use('/api/storage', storageRouter);
app.use('/api/convert', convertRouter);
app.use('/api/share', shareRoutes);
app.use('/api/proposals', proposalsRouter);
app.use('/api/projects/:projectId/comments', commentRoutes);
app.use('/api/admin/settings', settingsRouter);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`✅ SRS Platform Backend running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`   CORS: ${process.env.FRONTEND_URL}`);

  // Auto-recover any projects stuck in 'generating' state from a previous crash/restart
  try {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    const result = await pool.query(
      "UPDATE projects SET generation_status = 'failed', updated_at = NOW() WHERE generation_status = 'generating' RETURNING id, name"
    );
    if (result.rows.length > 0) {
      console.warn(`⚠️  Recovered ${result.rows.length} stuck project(s) from 'generating' → 'failed':`,
        result.rows.map(r => `#${r.id} ${r.name}`).join(', '));
    }
    await pool.end();
  } catch (err) {
    console.error('Startup recovery check failed:', err.message);
  }
});

module.exports = app;
