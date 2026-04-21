/**
 * Share Routes — PUBLIC endpoints for shareable project links
 * Mounted at: /api/share
 * 
 * Public endpoints (no auth):
 *   GET  /api/share/:token
 *   GET  /api/share/:token/srs/:version/download
 * 
 * Project-scoped share management (auth required) — handled in projects.js:
 *   POST   /api/projects/:id/share
 *   DELETE /api/projects/:id/share
 *   GET    /api/projects/:id/share
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { createReadStream } = require('fs');
const fs = require('fs').promises;
const { generatePdfFromMarkdown } = require('../services/pdfGenerator');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// GET /api/share/:token — PUBLIC endpoint, no auth
router.get('/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const tokenResult = await pool.query(
      'SELECT * FROM share_tokens WHERE token = $1',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    const shareToken = tokenResult.rows[0];

    if (shareToken.status === 'revoked') {
      return res.status(404).json({ error: 'Link has been revoked' });
    }
    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    const projectId = shareToken.project_id;
    const tokenSrsType = shareToken.srs_type;
    const tokenSrsVersion = shareToken.srs_version;

    const projectResult = await pool.query(
      'SELECT name, client_name, created_at FROM projects WHERE id = $1',
      [projectId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const versionsResult = await pool.query(
      'SELECT version, type, created_at, drive_share_url FROM srs_versions WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );

    // Serve the version specified in the token, or latest technical if none specified
    let targetVersion = null;
    let targetType = tokenSrsType || 'technical';
    if (tokenSrsVersion) {
      targetVersion = tokenSrsVersion;
    } else {
      // Fall back to latest of targetType
      const latestOfType = versionsResult.rows.find(r => r.type === targetType);
      targetVersion = latestOfType ? latestOfType.version : (versionsResult.rows[0] ? versionsResult.rows[0].version : null);
    }

    let srs = null;
    if (targetVersion) {
      const srsResult = await pool.query(
        'SELECT version, type, file_path, created_at, drive_share_url FROM srs_versions WHERE project_id = $1 AND version = $2 AND type = $3',
        [projectId, targetVersion, targetType]
      );

      if (srsResult.rows.length > 0) {
        const srsRow = srsResult.rows[0];
        let content = '';
        try {
          content = await fs.readFile(srsRow.file_path, 'utf8');
        } catch (e) {
          content = '';
        }
        srs = {
          version: srsRow.version,
          type: srsRow.type,
          content,
          created_at: srsRow.created_at,
          drive_share_url: srsRow.drive_share_url || null,
        };
      }
    }

    res.json({
      project: projectResult.rows[0],
      srs,
      versions: versionsResult.rows,
    });
  } catch (err) {
    console.error('Get share data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/share/:token/srs/:version — public markdown content for a specific version
router.get('/:token/srs/:version', async (req, res) => {
  const { token, version } = req.params;

  try {
    const tokenResult = await pool.query(
      'SELECT * FROM share_tokens WHERE token = $1',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    const shareToken = tokenResult.rows[0];
    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }
    if (shareToken.status === 'revoked') {
      return res.status(404).json({ error: 'Link has been revoked' });
    }

    const projectId = shareToken.project_id;

    // Determine type from token or infer from version string
    const srsType = shareToken.srs_type || (version.startsWith('client-') ? 'client' : 'technical');

    const srsResult = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2 AND type = $3',
      [projectId, version, srsType]
    );

    if (srsResult.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }

    const srsRow = srsResult.rows[0];
    const content = await fs.readFile(srsRow.file_path, 'utf8');

    res.json({ content, version: srsRow.version, type: srsRow.type });
  } catch (err) {
    console.error('Public SRS version error:', err);
    res.status(500).json({ error: 'Failed to load SRS version' });
  }
});

// GET /api/share/:token/srs/:version/download — public PDF download
router.get('/:token/srs/:version/download', async (req, res) => {
  const { token, version } = req.params;

  try {
    const tokenResult = await pool.query(
      'SELECT * FROM share_tokens WHERE token = $1',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    const shareToken = tokenResult.rows[0];
    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
    if (shareToken.status === 'revoked') {
      return res.status(404).json({ error: 'Link has been revoked' });
    }
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    const projectId = shareToken.project_id;

    const srsResult = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2',
      [projectId, version]
    );

    if (srsResult.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }

    const srsRow = srsResult.rows[0];

    if (srsRow.pdf_path) {
      try {
        await fs.access(srsRow.pdf_path);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="srs-v${version}.pdf"`);
        createReadStream(srsRow.pdf_path).pipe(res);
        return;
      } catch (e) {
        // fall through to regenerate
      }
    }

    const markdownContent = await fs.readFile(srsRow.file_path, 'utf8');
    const pdfPath = srsRow.file_path.replace('.md', '.pdf');
    await generatePdfFromMarkdown(markdownContent, pdfPath);
    await pool.query('UPDATE srs_versions SET pdf_path = $1 WHERE id = $2', [pdfPath, srsRow.id]);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="srs-v${version}.pdf"`);
    createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('Public PDF download error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// GET /api/share/:token/comments — PUBLIC endpoint, no auth
router.get('/:token/comments', async (req, res) => {
  const { token } = req.params;

  try {
    const tokenResult = await pool.query(
      'SELECT * FROM share_tokens WHERE token = $1',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    const shareToken = tokenResult.rows[0];
    if (shareToken.status === 'revoked') {
      return res.status(404).json({ error: 'Link has been revoked' });
    }
    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    const projectId = shareToken.project_id;

    const commentsResult = await pool.query(
      'SELECT id, content, author_name, section_ref, created_at FROM srs_comments WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId]
    );

    res.json({ comments: commentsResult.rows });
  } catch (err) {
    console.error('Get public comments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/share/:token/comments — PUBLIC endpoint, no auth
router.post('/:token/comments', async (req, res) => {
  const { token } = req.params;
  const { content, author_name, section_ref } = req.body;

  // Validate
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return res.status(400).json({ error: 'content is required' });
  }
  if (content.length > 1000) {
    return res.status(400).json({ error: 'content must be 1000 characters or less' });
  }
  if (!author_name || typeof author_name !== 'string' || author_name.trim().length === 0) {
    return res.status(400).json({ error: 'author_name is required' });
  }
  if (author_name.length > 100) {
    return res.status(400).json({ error: 'author_name must be 100 characters or less' });
  }

  try {
    const tokenResult = await pool.query(
      'SELECT * FROM share_tokens WHERE token = $1',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    const shareToken = tokenResult.rows[0];
    if (shareToken.status === 'revoked') {
      return res.status(404).json({ error: 'Link has been revoked' });
    }
    if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Link not found or expired' });
    }

    const projectId = shareToken.project_id;

    // Get latest SRS version for this project
    const latestVersion = await pool.query(
      'SELECT version FROM srs_versions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
      [projectId]
    );
    const srsVersion = latestVersion.rows.length > 0 ? latestVersion.rows[0].version : 'public';

    const insertResult = await pool.query(
      `INSERT INTO srs_comments (project_id, srs_version, user_id, content, author_name, section_ref)
       VALUES ($1, $2, NULL, $3, $4, $5)
       RETURNING id, content, author_name, section_ref, created_at, srs_version`,
      [projectId, srsVersion, content.trim(), author_name.trim(), section_ref || null]
    );

    res.status(201).json({ comment: insertResult.rows[0] });
  } catch (err) {
    console.error('Post public comment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
