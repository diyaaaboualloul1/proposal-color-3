const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { deleteProjectFiles, ensureProjectDir } = require('../services/storageService');

const VALID_FIELDS = [
  'project_type', 'industry', 'target_users', 'core_features',
  'tech_preferences', 'integrations', 'non_functional_requirements', 'timeline',
  'budget_range', 'special_requirements', 'existing_systems', 'deployment'
];

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const SHARE_BASE_URL = process.env.SHARE_BASE_URL || 'http://142.132.189.59:6060';

router.use(authMiddleware);

// GET /projects
router.get('/', async (req, res) => {
  try {
    let result;
    const versionSubquery = `(SELECT MAX(version) FROM srs_versions WHERE project_id = p.id) AS latest_version`;
    if (req.user.role === 'super_admin') {
      result = await pool.query(
        `SELECT p.*, u.name as creator_name, ${versionSubquery}
         FROM projects p
         LEFT JOIN users u ON p.created_by = u.id
         ORDER BY p.created_at DESC`
      );
    } else {
      result = await pool.query(
        `SELECT p.*, u.name as creator_name, ${versionSubquery}
         FROM projects p
         LEFT JOIN users u ON p.created_by = u.id
         WHERE p.created_by = $1
         ORDER BY p.created_at DESC`,
        [req.user.id]
      );
    }
    res.json({ projects: result.rows });
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /projects/bulk-delete
router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body;

  // Validate ids is a non-empty array of integers
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  const parsedIds = ids.map(id => parseInt(id, 10));
  if (parsedIds.some(id => isNaN(id))) {
    return res.status(400).json({ error: 'All ids must be integers' });
  }

  const deleted = [];
  const skipped = [];

  for (const id of parsedIds) {
    try {
      const existing = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        skipped.push(id);
        continue;
      }

      const project = existing.rows[0];

      // Access control: super_admin can delete any; admin can only delete their own
      if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
        skipped.push(id);
        continue;
      }

      // Delete files
      await deleteProjectFiles(id);

      // Delete from DB (cascades)
      await pool.query('DELETE FROM projects WHERE id = $1', [id]);

      deleted.push(id);
    } catch (err) {
      console.error(`Bulk delete error for project ${id}:`, err);
      skipped.push(id);
    }
  }

  const message = `${deleted.length} project${deleted.length !== 1 ? 's' : ''} deleted, ${skipped.length} skipped (not found or no access)`;
  res.json({ deleted, skipped, message });
});

// POST /projects/import — create project + questionnaire + trigger SRS generation
router.post('/import', async (req, res) => {
  const { name, client_name, client_contact, description, answers } = req.body;

  if (!name || !client_name) {
    return res.status(400).json({ error: 'Project name and client name required' });
  }

  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'answers object required' });
  }

  try {
    // 1. Create project
    const projectResult = await pool.query(
      `INSERT INTO projects (name, client_name, client_contact, description, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, client_name, client_contact || null, description || null, req.user.id]
    );
    const project = projectResult.rows[0];

    // 2. Normalize field names (handle legacy field names)
    if (answers.non_functional && !answers.non_functional_requirements) {
      answers.non_functional_requirements = answers.non_functional;
      delete answers.non_functional;
    }

    // 3. Sanitize answers to valid fields
    const sanitizedAnswers = {};
    VALID_FIELDS.forEach(field => {
      sanitizedAnswers[field] = answers[field] || '';
    });

    // 3. INSERT questionnaire as draft
    await pool.query(
      'INSERT INTO questionnaires (project_id, answers, status) VALUES ($1, $2, $3)',
      [project.id, JSON.stringify(sanitizedAnswers), 'draft']
    );

    // 4. UPDATE to submitted
    await pool.query(
      'UPDATE questionnaires SET status = $1, submitted_at = NOW(), updated_at = NOW() WHERE project_id = $2',
      ['submitted', project.id]
    );

    // 5. Save questionnaire.json to project storage dir
    const projectPath = await ensureProjectDir(project.id);
    const questionnaireFilePath = path.join(projectPath, 'questionnaire.json');
    await fs.writeFile(questionnaireFilePath, JSON.stringify(sanitizedAnswers, null, 2), 'utf8');

    // 6. Set generation_status to generating
    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['generating', project.id]
    );

    // 7. Log activity
    await logActivity(pool, req.user.id, project.id, 'Imported project', { name, client_name });

    // 8. Trigger SRS generation in background
    triggerSrsGeneration(project.id, sanitizedAnswers, req.user.id);

    // 9. Return
    const updatedProject = await pool.query('SELECT * FROM projects WHERE id = $1', [project.id]);
    res.status(201).json({
      project: updatedProject.rows[0],
      message: 'Project imported and SRS generation started'
    });
  } catch (err) {
    console.error('Import project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function triggerSrsGeneration(projectId, answers, userId) {
  const { generateSrsDocument } = require('./srs');
  setImmediate(async () => {
    try {
      await generateSrsDocument(projectId, answers, userId);
    } catch (err) {
      console.error(`Background SRS generation failed for project ${projectId}:`, err.message);
      await pool.query(
        'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', projectId]
      );
    }
  });
}

// GET /projects/stats
router.get('/stats', async (req, res) => {
  try {
    let totalProjects, projectIds;

    if (req.user.role === 'super_admin') {
      const result = await pool.query('SELECT COUNT(*) FROM projects');
      totalProjects = parseInt(result.rows[0].count, 10);

      const idResult = await pool.query('SELECT id FROM projects');
      projectIds = idResult.rows.map(r => r.id);
    } else {
      const result = await pool.query('SELECT COUNT(*) FROM projects WHERE created_by = $1', [req.user.id]);
      totalProjects = parseInt(result.rows[0].count, 10);

      const idResult = await pool.query('SELECT id FROM projects WHERE created_by = $1', [req.user.id]);
      projectIds = idResult.rows.map(r => r.id);
    }

    let totalSrsVersions = 0;
    let totalChatMessages = 0;
    let totalSharedLinks = 0;

    if (projectIds.length > 0) {
      const placeholders = projectIds.map((_, i) => `$${i + 1}`).join(', ');

      const srsResult = await pool.query(
        `SELECT COUNT(*) FROM srs_versions WHERE project_id IN (${placeholders})`,
        projectIds
      );
      totalSrsVersions = parseInt(srsResult.rows[0].count, 10);

      const chatResult = await pool.query(
        `SELECT COUNT(*) FROM chat_messages WHERE project_id IN (${placeholders})`,
        projectIds
      );
      totalChatMessages = parseInt(chatResult.rows[0].count, 10);

      const shareResult = await pool.query(
        `SELECT COUNT(*) FROM share_tokens WHERE project_id IN (${placeholders})`,
        projectIds
      );
      totalSharedLinks = parseInt(shareResult.rows[0].count, 10);
    }

    res.json({
      total_projects: totalProjects,
      total_srs_versions: totalSrsVersions,
      total_chat_messages: totalChatMessages,
      total_shared_links: totalSharedLinks,
    });
  } catch (err) {
    console.error('Get projects stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/search
router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || !q.trim()) return res.json({ projects: [] });
  try {
    let result;
    if (req.user.role === 'super_admin') {
      result = await pool.query(
        `SELECT p.*, u.name as creator_name FROM projects p LEFT JOIN users u ON p.created_by = u.id
         WHERE p.name ILIKE $1 OR p.client_name ILIKE $1 ORDER BY p.created_at DESC LIMIT 20`,
        [`%${q.trim()}%`]
      );
    } else {
      result = await pool.query(
        `SELECT p.*, u.name as creator_name FROM projects p LEFT JOIN users u ON p.created_by = u.id
         WHERE (p.name ILIKE $1 OR p.client_name ILIKE $1) AND p.created_by = $2 ORDER BY p.created_at DESC LIMIT 20`,
        [`%${q.trim()}%`, req.user.id]
      );
    }
    res.json({ projects: result.rows });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/:id
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID' });
  try {
    const result = await pool.query(
      `SELECT p.*, u.name as creator_name 
       FROM projects p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = result.rows[0];
    
    // Access control: owner or super_admin
    if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({ project });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/:id/summary
router.get('/:id/summary', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = projectResult.rows[0];

    // Access control: owner or super_admin
    if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const versionsResult = await pool.query(
      'SELECT COUNT(*) AS total_versions, MAX(version) AS latest_version FROM srs_versions WHERE project_id = $1',
      [id]
    );
    const chatResult = await pool.query(
      'SELECT COUNT(*) AS total_chat_messages FROM chat_messages WHERE project_id = $1',
      [id]
    );
    const shareResult = await pool.query(
      'SELECT COUNT(*) AS share_count FROM share_tokens WHERE project_id = $1',
      [id]
    );

    const { total_versions, latest_version } = versionsResult.rows[0];
    const { total_chat_messages } = chatResult.rows[0];
    const { share_count } = shareResult.rows[0];

    res.json({
      id: project.id,
      name: project.name,
      client_name: project.client_name,
      status: project.status,
      generation_status: project.generation_status,
      total_versions: parseInt(total_versions, 10),
      latest_version: latest_version || null,
      total_chat_messages: parseInt(total_chat_messages, 10),
      has_share_link: parseInt(share_count, 10) > 0,
    });
  } catch (err) {
    console.error('Get project summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /projects
router.post('/', async (req, res) => {
  const { name, client_name, client_contact, description } = req.body;
  
  if (!name || !client_name) {
    return res.status(400).json({ error: 'Project name and client name required' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO projects (name, client_name, client_contact, description, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, client_name, client_contact || null, description || null, req.user.id]
    );
    
    const project = result.rows[0];
    
    // Auto-create questionnaire record in draft state
    await pool.query(
      'INSERT INTO questionnaires (project_id, answers, status) VALUES ($1, $2, $3)',
      [project.id, '{}', 'draft']
    );
    
    // Create project directory
    await ensureProjectDir(project.id);
    
    // Log activity
    await logActivity(pool, req.user.id, project.id, 'Created project', { name, client_name });
    
    res.status(201).json({ project });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /projects/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID' });
  const { name, client_name, description, status } = req.body;
  
  try {
    const existing = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = existing.rows[0];
    if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const result = await pool.query(
      `UPDATE projects SET
        name = COALESCE($1, name),
        client_name = COALESCE($2, client_name),
        description = COALESCE($3, description),
        status = COALESCE($4, status),
        updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name || null, client_name || null, description || null, status || null, id]
    );
    
    await logActivity(pool, req.user.id, parseInt(id), 'Updated project', { name, client_name, status });
    
    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /projects/:id
router.delete('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID' });
  
  try {
    const existing = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const project = existing.rows[0];
    if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete files first
    await deleteProjectFiles(id);
    
    // Delete from DB (cascades to questionnaires, srs_versions, chat_messages, activity_log)
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /projects/:id/share — generate share token
router.post('/:id/share', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = projectResult.rows[0];
    if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Revoke any existing token first
    await pool.query('DELETE FROM share_tokens WHERE project_id = $1', [projectId]);

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      'INSERT INTO share_tokens (project_id, token, created_by) VALUES ($1, $2, $3)',
      [projectId, token, req.user.id]
    );

    const shareUrl = `${SHARE_BASE_URL}/share/${token}`;
    res.json({ token, shareUrl });
  } catch (err) {
    console.error('Create share token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /projects/:id/share — revoke share token
router.delete('/:id/share', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = projectResult.rows[0];
    if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM share_tokens WHERE project_id = $1', [projectId]);
    res.json({ message: 'Share link revoked' });
  } catch (err) {
    console.error('Revoke share token error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/:id/share — get share status
router.get('/:id/share', async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  try {
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = projectResult.rows[0];
    if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tokenResult = await pool.query(
      'SELECT token FROM share_tokens WHERE project_id = $1',
      [projectId]
    );

    if (tokenResult.rows.length === 0) {
      return res.json({ hasShare: false });
    }

    const shareToken = tokenResult.rows[0].token;
    const shareUrl = `${SHARE_BASE_URL}/share/${shareToken}`;
    res.json({ hasShare: true, token: shareToken, shareUrl });
  } catch (err) {
    console.error('Get share status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function logActivity(pool, userId, projectId, action, details = {}) {
  try {
    await pool.query(
      'INSERT INTO activity_log (user_id, project_id, action, details) VALUES ($1, $2, $3, $4)',
      [userId, projectId, action, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Log activity error:', err.message);
  }
}

module.exports = router;
module.exports.logActivity = logActivity;
