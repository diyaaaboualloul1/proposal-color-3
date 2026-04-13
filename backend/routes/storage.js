const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const authMiddleware = require('../middleware/auth');
const superAdmin = require('../middleware/superAdmin');
const { getStorageUsage, STORAGE_ROOT } = require('../services/storageService');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

router.use(authMiddleware, superAdmin);

// GET /storage/usage
router.get('/usage', async (req, res) => {
  try {
    const projectsResult = await pool.query('SELECT id, name FROM projects ORDER BY id');
    const usage = await getStorageUsage(projectsResult.rows);
    res.json(usage);
  } catch (err) {
    console.error('Storage usage error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getCleanupPreview(keepVersions = 5, logDays = 30) {
  const filesToDelete = [];
  let bytesToFree = 0;
  
  // Find old SRS versions per project
  const projectsResult = await pool.query('SELECT id FROM projects');
  
  for (const project of projectsResult.rows) {
    const versionsResult = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 ORDER BY created_at DESC',
      [project.id]
    );
    
    const allVersions = versionsResult.rows;
    const toDelete = allVersions.slice(keepVersions); // Keep the N newest
    
    for (const version of toDelete) {
      // Add markdown file
      try {
        const stat = await fs.stat(version.file_path);
        filesToDelete.push({ type: 'srs_md', path: version.file_path, size: stat.size });
        bytesToFree += stat.size;
      } catch (err) {}
      
      // Add PDF file
      if (version.pdf_path) {
        try {
          const stat = await fs.stat(version.pdf_path);
          filesToDelete.push({ type: 'srs_pdf', path: version.pdf_path, size: stat.size });
          bytesToFree += stat.size;
        } catch (err) {}
      }
    }
  }
  
  // Find old activity log entries
  const cutoffDate = new Date(Date.now() - logDays * 24 * 60 * 60 * 1000);
  const oldLogsResult = await pool.query(
    'SELECT COUNT(*) as count FROM activity_log WHERE created_at < $1',
    [cutoffDate.toISOString()]
  );
  
  const oldLogCount = parseInt(oldLogsResult.rows[0].count);
  if (oldLogCount > 0) {
    filesToDelete.push({ type: 'activity_logs', count: oldLogCount, size: 0 });
  }
  
  return {
    files_to_delete: filesToDelete,
    mb_to_free: Math.round(bytesToFree / (1024 * 1024) * 100) / 100
  };
}

// POST /storage/cleanup/preview
router.post('/cleanup/preview', async (req, res) => {
  const { keep_versions = 5, log_days = 30 } = req.body;
  
  try {
    const preview = await getCleanupPreview(parseInt(keep_versions), parseInt(log_days));
    res.json(preview);
  } catch (err) {
    console.error('Cleanup preview error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /storage/cleanup/run
router.post('/cleanup/run', async (req, res) => {
  const { keep_versions = 5, log_days = 30 } = req.body;
  
  try {
    const kv = parseInt(keep_versions);
    const ld = parseInt(log_days);
    
    let deleted = 0;
    let freedBytes = 0;
    
    // Delete old SRS versions per project
    const projectsResult = await pool.query('SELECT id FROM projects');
    
    for (const project of projectsResult.rows) {
      const versionsResult = await pool.query(
        'SELECT * FROM srs_versions WHERE project_id = $1 ORDER BY created_at DESC',
        [project.id]
      );
      
      const toDelete = versionsResult.rows.slice(kv);
      
      for (const version of toDelete) {
        // Delete files
        for (const filePath of [version.file_path, version.pdf_path]) {
          if (!filePath) continue;
          try {
            const stat = await fs.stat(filePath);
            await fs.unlink(filePath);
            freedBytes += stat.size;
            deleted++;
          } catch (err) {}
        }
        
        // Delete from DB
        await pool.query('DELETE FROM srs_versions WHERE id = $1', [version.id]);
      }
    }
    
    // Delete old activity logs
    const cutoffDate = new Date(Date.now() - ld * 24 * 60 * 60 * 1000);
    const deleteLogsResult = await pool.query(
      'DELETE FROM activity_log WHERE created_at < $1 RETURNING id',
      [cutoffDate.toISOString()]
    );
    deleted += deleteLogsResult.rows.length;
    
    // Update last_run in cleanup_schedule
    await pool.query(
      'UPDATE cleanup_schedule SET last_run = NOW(), updated_at = NOW() WHERE id = 1'
    );
    
    res.json({
      deleted,
      freed_mb: Math.round(freedBytes / (1024 * 1024) * 100) / 100
    });
  } catch (err) {
    console.error('Cleanup run error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /storage/cleanup/schedule
router.put('/cleanup/schedule', async (req, res) => {
  const { frequency, keep_versions, log_days } = req.body;
  
  const validFrequencies = ['daily', 'weekly', 'monthly'];
  if (frequency && !validFrequencies.includes(frequency)) {
    return res.status(400).json({ error: 'Invalid frequency. Use: daily, weekly, monthly' });
  }
  
  try {
    const existing = await pool.query('SELECT * FROM cleanup_schedule LIMIT 1');
    
    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO cleanup_schedule (frequency, keep_versions, log_days, enabled)
         VALUES ($1, $2, $3, true)
         RETURNING *`,
        [frequency || 'weekly', keep_versions || 5, log_days || 30]
      );
    } else {
      result = await pool.query(
        `UPDATE cleanup_schedule SET
          frequency = COALESCE($1, frequency),
          keep_versions = COALESCE($2, keep_versions),
          log_days = COALESCE($3, log_days),
          enabled = true,
          updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [frequency || null, keep_versions ? parseInt(keep_versions) : null, log_days ? parseInt(log_days) : null, existing.rows[0].id]
      );
    }
    
    res.json({ schedule: result.rows[0] });
  } catch (err) {
    console.error('Update cleanup schedule error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
