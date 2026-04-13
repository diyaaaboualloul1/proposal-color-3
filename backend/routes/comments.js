const express = require('express');
const router = express.Router({ mergeParams: true });
const { Pool } = require('pg');
const authMiddleware = require('../middleware/auth');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// All comment routes require auth
router.use(authMiddleware);

// Helper: check project access
async function checkProjectAccess(pool, projectId, user) {
  const result = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (result.rows.length === 0) return { error: 'Project not found', status: 404 };

  const project = result.rows[0];
  if (user.role !== 'super_admin' && project.created_by !== user.id) {
    return { error: 'Access denied', status: 403 };
  }
  return { project };
}

// GET /api/projects/:projectId/comments?version=1.1
router.get('/', async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  const { version } = req.query;

  try {
    const access = await checkProjectAccess(pool, projectId, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    let query = `
      SELECT c.id, c.srs_version, COALESCE(u.name, c.author_name) as user_name, c.author_name, c.content, c.section_ref, c.created_at,
             CASE WHEN c.user_id IS NULL AND c.author_name IS NOT NULL THEN true ELSE false END as is_client
      FROM srs_comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.project_id = $1
    `;
    const params = [projectId];

    if (version) {
      query += ' AND c.srs_version = $2';
      params.push(version);
    }

    query += ' ORDER BY c.created_at ASC';

    const result = await pool.query(query, params);
    res.json({ comments: result.rows });
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/comments
router.post('/', async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

  const { content, srs_version, section_ref } = req.body;
  if (!content || !srs_version) {
    return res.status(400).json({ error: 'content and srs_version are required' });
  }

  try {
    const access = await checkProjectAccess(pool, projectId, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const result = await pool.query(
      `INSERT INTO srs_comments (project_id, srs_version, user_id, content, section_ref)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [projectId, srs_version, req.user.id, content, section_ref || null]
    );

    // Join user name
    const commentRow = result.rows[0];
    const comment = {
      id: commentRow.id,
      srs_version: commentRow.srs_version,
      user_name: req.user.name,
      content: commentRow.content,
      section_ref: commentRow.section_ref,
      created_at: commentRow.created_at,
    };

    res.status(201).json({ comment });
  } catch (err) {
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:projectId/comments/:commentId
router.delete('/:commentId', async (req, res) => {
  const projectId = parseInt(req.params.projectId, 10);
  const commentId = parseInt(req.params.commentId, 10);
  if (isNaN(projectId) || isNaN(commentId)) {
    return res.status(400).json({ error: 'Invalid project or comment ID' });
  }

  try {
    const commentResult = await pool.query(
      'SELECT * FROM srs_comments WHERE id = $1 AND project_id = $2',
      [commentId, projectId]
    );

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const comment = commentResult.rows[0];

    // Only comment owner or super_admin
    if (req.user.role !== 'super_admin' && comment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM srs_comments WHERE id = $1', [commentId]);
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
