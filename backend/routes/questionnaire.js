const express = require('express');
const router = express.Router({ mergeParams: true });
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { ensureProjectDir, validateProjectPath } = require('../services/storageService');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const VALID_FIELDS = [
  'project_type', 'industry', 'target_users', 'core_features',
  'tech_preferences', 'integrations', 'non_functional_requirements', 'timeline',
  'budget_range', 'special_requirements', 'existing_systems', 'deployment'
];

async function checkProjectAccess(req, res) {
  const rawId = req.params.projectId || req.params.id;
  const projectId = parseInt(rawId, 10);
  if (isNaN(projectId)) {
    res.status(400).json({ error: 'Invalid project ID' });
    return null;
  }
  const result = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
  
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Project not found' });
    return null;
  }
  
  const project = result.rows[0];
  if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
    res.status(403).json({ error: 'Access denied' });
    return null;
  }
  
  return project;
}

async function logActivity(userId, projectId, action, details = {}) {
  try {
    await pool.query(
      'INSERT INTO activity_log (user_id, project_id, action, details) VALUES ($1, $2, $3, $4)',
      [userId, projectId, action, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Log activity error:', err.message);
  }
}

// GET /projects/:projectId/questionnaire
router.get('/', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;
  
  try {
    let result = await pool.query(
      'SELECT * FROM questionnaires WHERE project_id = $1',
      [project.id]
    );
    
    // Create empty questionnaire if doesn't exist
    if (result.rows.length === 0) {
      const emptyAnswers = {};
      VALID_FIELDS.forEach(f => emptyAnswers[f] = '');
      
      result = await pool.query(
        'INSERT INTO questionnaires (project_id, answers) VALUES ($1, $2) RETURNING *',
        [project.id, JSON.stringify(emptyAnswers)]
      );
    }
    
    res.json({ questionnaire: result.rows[0] });
  } catch (err) {
    console.error('Get questionnaire error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /projects/:projectId/questionnaire
router.put('/', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;
  
  const { answers } = req.body;
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Answers object required' });
  }
  
  try {
    // Check if already submitted
    const existing = await pool.query(
      'SELECT * FROM questionnaires WHERE project_id = $1',
      [project.id]
    );
    
    if (existing.rows.length > 0 && existing.rows[0].status === 'submitted') {
      return res.status(400).json({ error: 'Questionnaire is locked after submission' });
    }
    
    // Sanitize answers to only valid fields
    const sanitizedAnswers = {};
    VALID_FIELDS.forEach(field => {
      sanitizedAnswers[field] = answers[field] || '';
    });
    
    let result;
    if (existing.rows.length === 0) {
      result = await pool.query(
        'INSERT INTO questionnaires (project_id, answers) VALUES ($1, $2) RETURNING *',
        [project.id, JSON.stringify(sanitizedAnswers)]
      );
    } else {
      result = await pool.query(
        'UPDATE questionnaires SET answers = $1, updated_at = NOW() WHERE project_id = $2 RETURNING *',
        [JSON.stringify(sanitizedAnswers), project.id]
      );
    }
    
    res.json({ questionnaire: result.rows[0] });
  } catch (err) {
    console.error('Update questionnaire error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /projects/:projectId/questionnaire/submit
router.post('/submit', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;
  
  try {
    const existing = await pool.query(
      'SELECT * FROM questionnaires WHERE project_id = $1',
      [project.id]
    );
    
    if (existing.rows.length === 0) {
      return res.status(400).json({ error: 'No questionnaire found for this project' });
    }
    
    const questionnaire = existing.rows[0];
    
    if (questionnaire.status === 'submitted') {
      return res.status(400).json({ error: 'Questionnaire already submitted' });
    }
    
    // Fix: if answers provided in body AND questionnaire is still draft, save them first
    if (req.body.answers && typeof req.body.answers === 'object' && questionnaire.status === 'draft') {
      const sanitizedAnswers = {};
      VALID_FIELDS.forEach(field => {
        sanitizedAnswers[field] = req.body.answers[field] || '';
      });
      await pool.query(
        'UPDATE questionnaires SET answers = $1, updated_at = NOW() WHERE project_id = $2',
        [JSON.stringify(sanitizedAnswers), project.id]
      );
      // Refresh questionnaire with saved answers
      const refreshed = await pool.query('SELECT * FROM questionnaires WHERE project_id = $1', [project.id]);
      questionnaire.answers = refreshed.rows[0].answers;
    }
    
    // Update questionnaire status
    await pool.query(
      'UPDATE questionnaires SET status = $1, submitted_at = NOW(), updated_at = NOW() WHERE project_id = $2',
      ['submitted', project.id]
    );
    
    // Save questionnaire.json to project directory
    const projectPath = await ensureProjectDir(project.id);
    const questionnaireFilePath = path.join(projectPath, 'questionnaire.json');
    await fs.writeFile(questionnaireFilePath, JSON.stringify(questionnaire.answers, null, 2), 'utf8');
    
    // Log activity
    await logActivity(req.user.id, project.id, 'Submitted questionnaire', {});
    
    // Set generation_status to generating
    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['generating', project.id]
    );
    
    // Trigger background SRS generation
    triggerSrsGeneration(project.id, questionnaire.answers, req.user.id);
    
    res.json({ message: 'Questionnaire submitted. SRS generation started.', generationStarted: true });
  } catch (err) {
    console.error('Submit questionnaire error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /projects/:projectId/questionnaire/unlock
router.post('/unlock', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  try {
    const existing = await pool.query(
      'SELECT * FROM questionnaires WHERE project_id = $1',
      [project.id]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'No questionnaire found for this project' });
    }

    await pool.query(
      'UPDATE questionnaires SET status = $1, submitted_at = NULL, updated_at = NOW() WHERE project_id = $2',
      ['draft', project.id]
    );

    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['idle', project.id]
    );

    await logActivity(req.user.id, project.id, 'Questionnaire unlocked for re-generation', {});

    res.json({ message: 'Questionnaire unlocked for re-generation' });
  } catch (err) {
    console.error('Unlock questionnaire error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function triggerSrsGeneration(projectId, answers, userId) {
  // Import here to avoid circular deps
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

module.exports = router;
