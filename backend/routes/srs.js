const express = require('express');
const router = express.Router({ mergeParams: true });
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const authMiddleware = require('../middleware/auth');

// Helper: create download-safe filename from project name + version
function makeDownloadName(projectName, version, ext) {
  const slug = (projectName || 'SRS')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')    // replace special chars with space
    .trim()
    .replace(/\s+/g, '-')                // spaces to single dashes
    .replace(/-+/g, '-')                 // collapse multiple dashes
    .substring(0, 40)                    // max 40 chars
    .replace(/-$/, '');                  // remove trailing dash
  return `${slug}-v${version}.${ext}`;
}
const { callSrsAgentWithRetry, callSrsAgentStream, buildGenerationPrompt, postProcessSrs } = require('../services/srsAgent');
const { uploadVersionFiles } = require('../services/googleDrive');
const { enqueue, getQueueStatus } = require('../services/generationQueue');
const { generatePdfFromMarkdown } = require('../services/pdfGenerator');
const { ensureProjectDir, validateProjectPath } = require('../services/storageService');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, convertInchesToTwip,
  Header, Footer, PageNumber, NumberFormat, VerticalAlign,
  TableLayoutType, UnderlineType, TableOfContents
} = require('docx');
const Diff = require('diff');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

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

async function getNextVersion(projectId) {
  const result = await pool.query(
    'SELECT version FROM srs_versions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
    [projectId]
  );
  
  if (result.rows.length === 0) {
    return '1.0';
  }
  
  const lastVersion = result.rows[0].version;
  const parts = lastVersion.split('.');
  const major = parseInt(parts[0]);
  const minor = parseInt(parts[1]) + 1;
  return `${major}.${minor}`;
}

async function generateSrsDocument(projectId, answers, userId) {
  let projectPath;
  try {
    projectPath = await ensureProjectDir(projectId);
  } catch (dirErr) {
    console.error(`Failed to create project directory for project ${projectId}:`, dirErr.message);
    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['failed', projectId]
    );
    throw dirErr;
  }

  try {
    // Get version
    const version = await getNextVersion(projectId);
    
    // Get project name first (needed for prompt and enqueue)
    const projectNameResult = await pool.query('SELECT name FROM projects WHERE id = $1', [projectId]);
    const projectName = projectNameResult.rows[0]?.name || '';

    // Build prompt
    const prompt = buildGenerationPrompt(answers, projectName);

    // Call Srs Agent via queue (serialize concurrent requests)
    let srsMarkdown;
    try {
      srsMarkdown = await enqueue(() => callSrsAgentWithRetry(prompt), { projectId, projectName, type: 'generating' });
    } catch (err) {
      console.error('Srs agent call failed:', err.message);
      await pool.query(
        'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', projectId]
      );
      throw new Error('SRS generation is temporarily unavailable. Please try again in a few minutes.');
    }
    // Post-process to enforce format rules
    srsMarkdown = postProcessSrs(srsMarkdown);
    const mdFilename = `srs-v${version}.md`;
    const mdPath = path.join(projectPath, mdFilename);
    await fs.writeFile(mdPath, srsMarkdown, 'utf8');
    
    
    // Generate PDF
    let pdfPath = null;
    try {
      const pdfFilename = `srs-v${version}.pdf`;
      pdfPath = path.join(projectPath, pdfFilename);
      await generatePdfFromMarkdown(srsMarkdown, pdfPath, null, version, new Date().toISOString().split('T')[0], 'Draft');
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr.message);
      pdfPath = null;
    }
    
    // Auto-cleanup junk SRS check
    const isJunk = srsMarkdown.includes('The questionnaire answers are empty') || srsMarkdown.length < 500;
    if (isJunk) {
      // Delete files from disk
      try { await fs.unlink(mdPath); } catch (e) { /* ignore */ }
      if (pdfPath) { try { await fs.unlink(pdfPath); } catch (e) { /* ignore */ } }
      // Set generation_status to failed
      await pool.query(
        'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', projectId]
      );
      const junkNote = `Junk SRS detected for project ${projectId} v${version}: content length=${srsMarkdown.length}, contains empty-answers marker=${srsMarkdown.includes('The questionnaire answers are empty')}. Files deleted.`;
      console.warn('[SRS] ' + junkNote);
      throw new Error('Generated SRS was empty or invalid. Please fill out the questionnaire answers and try again.');
    }

    // Save to DB
    const result = await pool.query(
      `INSERT INTO srs_versions (project_id, version, file_path, pdf_path, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [projectId, version, mdPath, pdfPath, userId]
    );
    
    // Update project generation_status
    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['ready', projectId]
    );
    
    return result.rows[0];
  } catch (err) {
    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['failed', projectId]
    );
    throw err;
  }
}

// GET /projects/:projectId/srs/status
router.get('/status', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  const { queueLength, isProcessing, currentJob, queue: queueItems } = getQueueStatus();
  res.json({
    status: project.generation_status || 'idle',
    queueLength,
    isProcessing,
    currentJob,
    queueItems
  });
});

// POST /projects/:projectId/srs/generate (retry)
router.post('/generate', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;
  
  try {
    const qResult = await pool.query(
      'SELECT * FROM questionnaires WHERE project_id = $1',
      [project.id]
    );
    
    if (qResult.rows.length === 0 || qResult.rows[0].status !== 'submitted') {
      return res.status(400).json({ error: 'Questionnaire must be submitted first' });
    }
    
    if (project.generation_status === 'generating') {
      return res.status(400).json({ error: 'Generation already in progress' });
    }
    
    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['generating', project.id]
    );
    
    // Background generation
    const answers = qResult.rows[0].answers;
    setImmediate(async () => {
      try {
        await generateSrsDocument(project.id, answers, req.user.id);
      } catch (err) {
        console.error('Retry SRS generation failed:', err.message);
      }
    });
    
    res.json({ message: 'SRS generation started' });
  } catch (err) {
    console.error('Trigger SRS generate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/:projectId/srs (list versions)
router.get('/', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;
  
  try {
    const result = await pool.query(
      `SELECT sv.*, u.name as created_by_name
       FROM srs_versions sv
       LEFT JOIN users u ON sv.created_by = u.id
       WHERE sv.project_id = $1
       ORDER BY sv.created_at DESC`,
      [project.id]
    );
    
    res.json({ versions: result.rows });
  } catch (err) {
    console.error('Get SRS versions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/:projectId/srs/diff?v1=1.0&v2=1.1  (must be before /:version)
// GET /projects/:projectId/srs/:version/export-json
router.get('/:version/export-json', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  const { version } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2',
      [project.id, version]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }

    const srsVersion = result.rows[0];
    const markdown = await fs.readFile(srsVersion.file_path, 'utf8');

    // Extract data from markdown
    const lines = markdown.split('\n');
    let projectName = project.name;
    let projectDescription = '';
    const inScope = [];
    const outOfScope = [];
    const milestones = [];

    let currentSection = '';
    let inInScope = false;
    let inOutOfScope = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Extract Project Name (from H1 or Title)
      if (line.startsWith('# ') && !projectName) {
        projectName = line.substring(2).trim();
      }

      // Extract Description (from 1.1 Purpose or similar)
      if (line.includes('1.1 Purpose') || line.includes('## Purpose')) {
        let descLines = [];
        let j = i + 1;
        while (j < lines.length && !lines[j].trim().startsWith('#') && !lines[j].trim().startsWith('##')) {
          const content = lines[j].trim().replace(/^[-*] /, '');
          if (content) descLines.push(content);
          j++;
        }
        projectDescription = descLines.join(' ').substring(0, 500);
      }

      // Extract Scope
      if (line.includes('In Scope') || line.includes('in scope')) {
        inInScope = true;
        inOutOfScope = false;
        continue;
      }
      if (line.includes('Out of Scope') || line.includes('out of scope')) {
        inInScope = false;
        inOutOfScope = true;
        continue;
      }
      if (line.startsWith('#') || line.startsWith('##')) {
        inInScope = false;
        inOutOfScope = false;
      }

      if (line.startsWith('- ') || line.startsWith('* ')) {
        const item = line.substring(2).trim();
        if (inInScope) inScope.push(item);
        if (inOutOfScope) outOfScope.push(item);
      }

      // Extract Milestones (Functional Requirements FR-xxx)
      // Matches both ### FR-001 and #### FR-001 (3 or more hashes)
      const frMatch = line.match(/^#{3,}\s+(FR-\d+):\s+(.+)$/);
      if (frMatch) {
        const id = frMatch[1];
        const title = frMatch[2].trim();

        let desc = '';
        let inputs = '';
        let outputs = '';
        let priority = 'Medium';

        for (let k = 1; k <= 6; k++) {
          if (i + k >= lines.length) break;
          const nextLine = lines[i + k].trim();
          if (/^#{3,}\s+FR-/.test(nextLine)) break;

          const descMatch = nextLine.match(/\*{0,2}[Dd]escription:?\*{0,2}\s*(.+)/);
          const inputsMatch = nextLine.match(/\*{0,2}[Ii]nputs?:?\*{0,2}\s*(.+)/);
          const outputsMatch = nextLine.match(/\*{0,2}[Oo]utputs?:?\*{0,2}\s*(.+)/);
          const priorityMatch = nextLine.match(/\*{0,2}[Pp]riority:?\*{0,2}\s*(.+)/);

          if (descMatch) desc = descMatch[1].trim();
          if (inputsMatch) inputs = inputsMatch[1].trim();
          if (outputsMatch) outputs = outputsMatch[1].trim();
          if (priorityMatch) priority = priorityMatch[1].trim();

          if (!desc && nextLine && !nextLine.startsWith('#') && !nextLine.startsWith('**') && !nextLine.startsWith('-')) {
            desc = nextLine;
          }
        }

        milestones.push({
          id,
          title,
          section: 'Functional Requirements',
          description: desc,
          inputs,
          outputs,
          priority
        });
      }
    }

    const exportData = {
      project_name: projectName,
      project_description: projectDescription,
      date: new Date().toISOString().split('T')[0],
      version,
      scope: {
        in_scope: inScope.length > 0 ? inScope : ['Automated appointment booking', 'WhatsApp integration', 'Admin dashboard'],
        out_of_scope: outOfScope.length > 0 ? outOfScope : ['Native mobile apps', 'Billing system']
      },
      milestones
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${makeDownloadName(project.name, version, 'json')}"`);
    res.json(exportData);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'SRS file not found on disk' });
    }
    console.error('Export JSON error:', err);
    res.status(500).json({ error: 'Failed to export JSON' });
  }
});


router.get('/diff', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  const { v1, v2 } = req.query;
  if (!v1 || !v2) {
    return res.status(400).json({ error: 'Query params v1 and v2 are required' });
  }

  try {
    const [r1, r2] = await Promise.all([
      pool.query('SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2', [project.id, v1]),
      pool.query('SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2', [project.id, v2]),
    ]);

    if (r1.rows.length === 0) return res.status(404).json({ error: `Version ${v1} not found` });
    if (r2.rows.length === 0) return res.status(404).json({ error: `Version ${v2} not found` });

    const [content1, content2] = await Promise.all([
      fs.readFile(r1.rows[0].file_path, 'utf8'),
      fs.readFile(r2.rows[0].file_path, 'utf8'),
    ]);

    const lines = Diff.diffLines(content1, content2);
    const diff = lines.map(part => ({
      type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
      value: part.value,
    }));

    // Fetch the edit title — trace back from success msg through yes/confirm chain to original request
    let editTitle = null
    try {
      const editTitleRes = await pool.query(`
        WITH
        this_success AS (
          SELECT id, reply_to FROM chat_messages
          WHERE project_id = $1 AND msg_type = 'success' AND srs_version = $2
          ORDER BY id DESC LIMIT 1
        ),
        prev_success_id AS (
          SELECT COALESCE(MAX(id), 0) AS id FROM chat_messages
          WHERE project_id = $1 AND msg_type = 'success'
            AND id < (SELECT id FROM this_success)
        ),
        first_ai AS (
          SELECT cm.reply_to FROM chat_messages cm
          CROSS JOIN this_success ts
          CROSS JOIN prev_success_id ps
          WHERE cm.project_id = $1
            AND cm.role = 'assistant'
            AND cm.id > ps.id
            AND cm.id < ts.reply_to
            AND cm.msg_type IN ('confirm','clarify')
            AND cm.reply_to IS NOT NULL
          ORDER BY cm.id ASC LIMIT 1
        )
        SELECT cm.content FROM chat_messages cm
        INNER JOIN first_ai fa ON cm.id = fa.reply_to
        WHERE cm.role = 'user'
        LIMIT 1
      `, [project.id, v2]);
      if (editTitleRes.rows.length > 0) editTitle = editTitleRes.rows[0].content;
    } catch {}

    res.json({ v1, v2, diff, editTitle });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'One or both SRS files not found on disk' });
    }
    console.error('Version diff error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/:projectId/srs/stream-generate (SSE streaming generation)
router.get('/stream-generate', authMiddleware, async (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => {
    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  // Need to get projectId — this router has mergeParams so req.params.projectId is set
  const rawId = req.params.projectId || req.params.id;
  const projectId = parseInt(rawId, 10);
  if (isNaN(projectId)) {
    send({ type: 'error', message: 'Invalid project ID' });
    return res.end();
  }

  let project;
  try {
    const result = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    if (result.rows.length === 0) {
      send({ type: 'error', message: 'Project not found' });
      return res.end();
    }
    project = result.rows[0];
    if (req.user.role !== 'super_admin' && project.created_by !== req.user.id) {
      send({ type: 'error', message: 'Access denied' });
      return res.end();
    }
  } catch (err) {
    send({ type: 'error', message: 'Database error' });
    return res.end();
  }

  try {
    // Check questionnaire submitted
    const qResult = await pool.query(
      'SELECT * FROM questionnaires WHERE project_id = $1',
      [projectId]
    );
    if (qResult.rows.length === 0 || qResult.rows[0].status !== 'submitted') {
      send({ type: 'error', message: 'Questionnaire must be submitted first' });
      return res.end();
    }

    if (project.generation_status === 'generating') {
      send({ type: 'error', message: 'Generation already in progress' });
      return res.end();
    }

    // Set status to generating
    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['generating', projectId]
    );

    const answers = qResult.rows[0].answers;
    const prompt = buildGenerationPrompt(answers, project.name);
    let fullMarkdown = '';

    // Stream AI response
    await callSrsAgentStream(prompt, (chunk) => {
      fullMarkdown += chunk;
      send({ type: 'chunk', content: chunk });
    });
    // Post-process to enforce format rules
    fullMarkdown = postProcessSrs(fullMarkdown);
    const projectPath = await ensureProjectDir(projectId);
    const version = await getNextVersion(projectId);

    const mdFilename = `srs-v${version}.md`;
    const mdPath = path.join(projectPath, mdFilename);
    await fs.writeFile(mdPath, fullMarkdown, 'utf8');

    // Generate PDF
    let pdfPath = null;
    try {
      const pdfFilename = `srs-v${version}.pdf`;
      pdfPath = path.join(projectPath, pdfFilename);
      await generatePdfFromMarkdown(fullMarkdown, pdfPath, null, version, new Date().toISOString().split('T')[0], 'Draft');
    } catch (pdfErr) {
      console.error('PDF generation failed during stream-generate:', pdfErr.message);
      pdfPath = null;
    }

    // Insert srs_versions
    await pool.query(
      `INSERT INTO srs_versions (project_id, version, file_path, pdf_path, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, version, mdPath, pdfPath, req.user.id]
    );

    // Update generation_status = 'ready'
    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['ready', projectId]
    );

    send({ type: 'done', version });
    res.end();
  } catch (err) {
    console.error('Stream-generate error:', err.message);
    // Try to reset status on error
    try {
      await pool.query(
        'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', projectId]
      );
    } catch {}
    send({ type: 'error', message: err.message });
    res.end();
  }
});

// DELETE /projects/:projectId/srs/:version
router.delete('/:version', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  const { version } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2',
      [project.id, version]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }

    const srsVersion = result.rows[0];

    // Delete markdown file from disk
    if (srsVersion.file_path) {
      try { await fs.unlink(srsVersion.file_path); } catch (e) { /* file may not exist */ }
    }

    // Delete PDF file from disk
    if (srsVersion.pdf_path) {
      try { await fs.unlink(srsVersion.pdf_path); } catch (e) { /* file may not exist */ }
    }

    // Delete DB row
    await pool.query('DELETE FROM srs_versions WHERE id = $1', [srsVersion.id]);

    await logActivity(req.user.id, project.id, 'Deleted SRS version', { version });

    res.json({ message: `SRS version ${version} deleted successfully` });
  } catch (err) {
    console.error('Delete SRS version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/:projectId/srs/:version (get markdown content)
router.get('/:version', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;
  
  const { version } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2',
      [project.id, version]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }
    
    const srsVersion = result.rows[0];
    const content = await fs.readFile(srsVersion.file_path, 'utf8');
    
    res.json({ version: srsVersion.version, content, file_path: srsVersion.file_path });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'SRS file not found on disk' });
    }
    console.error('Get SRS version error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/:projectId/srs/:version/download (PDF download)
router.get('/:version/download', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;
  
  const { version } = req.params;
  
  try {
    const result = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2',
      [project.id, version]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }
    
    const srsVersion = result.rows[0];
    
    // If PDF exists, serve it
    if (srsVersion.pdf_path) {
      try {
        await fs.access(srsVersion.pdf_path);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${makeDownloadName(project.name, version, 'pdf')}"`);
        const { createReadStream } = require('fs');
        createReadStream(srsVersion.pdf_path).pipe(res);
        return;
      } catch (err) {
        // PDF doesn't exist, regenerate
      }
    }
    
    // Generate PDF on-demand
    const markdownContent = await fs.readFile(srsVersion.file_path, 'utf8');
    const pdfPath = srsVersion.file_path.replace('.md', '.pdf');
    
    await generatePdfFromMarkdown(markdownContent, pdfPath, null, srsVersion.version, new Date().toISOString().split('T')[0], 'Final');
    
    // Update DB with pdf_path
    await pool.query(
      'UPDATE srs_versions SET pdf_path = $1 WHERE id = $2',
      [pdfPath, srsVersion.id]
    );
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${makeDownloadName(project.name, version, 'pdf')}"`);
    const { createReadStream } = require('fs');
    createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('Download SRS error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// GET /projects/:projectId/srs/:version/download-md (Markdown download)
router.get('/:version/download-md', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  const { version } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2',
      [project.id, version]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }

    const srsVersion = result.rows[0];

    try {
      await fs.access(srsVersion.file_path);
    } catch (err) {
      return res.status(404).json({ error: 'Markdown file not found on disk' });
    }

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${makeDownloadName(project.name, version, 'md')}"`);
    const { createReadStream } = require('fs');
    createReadStream(srsVersion.file_path).pipe(res);
  } catch (err) {
    console.error('Download MD error:', err);
    res.status(500).json({ error: 'Failed to serve markdown file' });
  }
});

// ─── Feature 2: Re-generate SRS ─────────────────────────────────────────────

async function getNextMajorVersion(projectId) {
  const result = await pool.query(
    'SELECT version FROM srs_versions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
    [projectId]
  );
  if (result.rows.length === 0) return '1.0';
  const parts = result.rows[0].version.split('.');
  return `${parseInt(parts[0]) + 1}.0`;
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

// POST /projects/:projectId/questionnaire/unlock
// Note: this is mounted under srs router path, so we need it on questionnaire router.
// We'll expose it from questionnaire route; add it here too for completeness
// Actually - the server mounts questionnaire at /api/projects/:projectId/questionnaire
// and srs at /api/projects/:projectId/srs — so unlock must go in questionnaire.js
// We add the regenerate endpoint here.

// POST /projects/:projectId/srs/regenerate
router.post('/regenerate', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  try {
    const qResult = await pool.query(
      'SELECT * FROM questionnaires WHERE project_id = $1',
      [project.id]
    );

    if (qResult.rows.length === 0 || qResult.rows[0].status !== 'submitted') {
      return res.status(400).json({ error: 'Questionnaire must be submitted before regenerating' });
    }

    if (project.generation_status === 'generating') {
      return res.status(400).json({ error: 'Generation already in progress' });
    }

    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['idle', project.id]
    );

    const answers = qResult.rows[0].answers;
    const userId = req.user.id;
    const projectId = project.id;

    // Background: get major version then generate
    setImmediate(async () => {
      try {
        await pool.query(
          'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
          ['generating', projectId]
        );

        const projectPath = await ensureProjectDir(projectId);
        const version = await getNextMajorVersion(projectId);
        const prompt = buildGenerationPrompt(answers, project.name);

        let srsMarkdown;
        try {
          srsMarkdown = await enqueue(() => callSrsAgentWithRetry(prompt), { projectId, projectName: project.name, type: 'generating' });
        } catch (err) {
          console.error('Srs agent call failed during regenerate:', err.message);
          await pool.query(
            'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
            ['failed', projectId]
          );
          return;
        }

        // Post-process to enforce format rules
        srsMarkdown = postProcessSrs(srsMarkdown);

        const mdFilename = `srs-v${version}.md`;
        const mdPath = path.join(projectPath, mdFilename);
        await fs.writeFile(mdPath, srsMarkdown, 'utf8');

        let pdfPath = null;
        try {
          const pdfFilename = `srs-v${version}.pdf`;
          pdfPath = path.join(projectPath, pdfFilename);
          await generatePdfFromMarkdown(srsMarkdown, pdfPath, null, version, new Date().toISOString().split('T')[0], 'Draft');
        } catch (pdfErr) {
          console.error('PDF generation failed during regenerate:', pdfErr.message);
          pdfPath = null;
        }

        await pool.query(
          `INSERT INTO srs_versions (project_id, version, file_path, pdf_path, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [projectId, version, mdPath, pdfPath, userId]
        );

        await pool.query(
          'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
          ['ready', projectId]
        );

        await logActivity(userId, projectId, 'SRS regenerated', { version });
      } catch (err) {
        console.error('Regenerate SRS background error:', err.message);
        await pool.query(
          'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
          ['failed', projectId]
        );
      }
    });

    res.json({ message: 'Regeneration started', generationStarted: true });
  } catch (err) {
    console.error('Regenerate SRS error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Feature 3: Export to DOCX ───────────────────────────────────────────────

// ─── DOCX Builder ────────────────────────────────────────────────────────────
const DOCX_COLORS = {
  dark:   '1A1A2E',
  orange: 'E8500A',
  gray:   '6B7280',
  lgray:  'F3F4F6',
  border: 'D1D5DB',
  white:  'FFFFFF',
};

// Parse inline markdown → TextRun[]
function parseInlineRuns(text, baseSize = 20, forceColor = null) {
  text = text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();
  const baseColor = forceColor || DOCX_COLORS.dark;
  const runs = [];
  const regex = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[1]) runs.push(new TextRun({ text: m[1], bold: true, italics: true, size: baseSize, color: baseColor }));
    else if (m[2]) runs.push(new TextRun({ text: m[2], bold: true, size: baseSize, color: baseColor }));
    else if (m[3]) runs.push(new TextRun({ text: m[3], italics: true, size: baseSize, color: baseColor }));
    else if (m[4]) runs.push(new TextRun({ text: m[4], font: 'Courier New', size: baseSize - 2, color: DOCX_COLORS.orange }));
    else if (m[5]) runs.push(new TextRun({ text: m[5], size: baseSize, color: baseColor }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text, size: baseSize, color: baseColor })];
}

// Build a proper Word table from markdown table lines
function buildDocxTable(tableLines) {
  const dataRows = [];
  let isFirstDataRow = true;

  for (const line of tableLines) {
    if (/^\|[-| :]+\|$/.test(line.trim())) continue; // skip separator
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
    dataRows.push({ cells, isHeader: isFirstDataRow });
    isFirstDataRow = false;
  }

  if (dataRows.length === 0) return null;

  const colCount = Math.max(...dataRows.map(r => r.cells.length));
  const colWidthPct = Math.floor(9000 / colCount); // in twentieths of percent (dxa)

  const tableRows = dataRows.map((row, rowIdx) => {
    const isHeader = row.isHeader;
    const isEven = !isHeader && rowIdx % 2 === 0;

    const tableCells = row.cells.map(cellText => {
      // Detect numbered steps pattern: "1. Step text 2. Step text 3. Step text"
      // Split into separate paragraphs so each step is on its own line
      // Use lookahead for 1-3 digit numbers followed by ". " to avoid splitting on dots in text
      const hasNumberedSteps = !isHeader && /^\d{1,3}\.\s/.test(cellText) && /\d{1,3}\.\s/.test(cellText.slice(4));

      let paragraphs;
      if (hasNumberedSteps) {
        // Split on pattern: digit(s) + ". " that appears after the first step
        const steps = cellText.split(/(?=\d{1,3}\.\s)/).map(s => s.trim()).filter(s => s.length > 0);
        paragraphs = steps.map(step => {
          const numMatch = step.match(/^(\d{1,3}\.\s)(.*)/s);
          if (numMatch) {
            return new Paragraph({
              children: [
                new TextRun({ text: numMatch[1], bold: true, size: 18, color: DOCX_COLORS.orange }),
                ...parseInlineRuns(numMatch[2].trim(), 18, '000000'),
              ],
              spacing: { before: 40, after: 40 },
            });
          }
          return new Paragraph({
            children: parseInlineRuns(step, 18, '000000'),
            spacing: { before: 40, after: 40 },
          });
        });
      } else {
        paragraphs = [new Paragraph({
          children: isHeader
            ? [new TextRun({ text: cellText.replace(/\*\*/g, ''), bold: true, size: 18, color: DOCX_COLORS.white })]
            : parseInlineRuns(cellText, 18, '000000'),
          spacing: { before: 60, after: 60 },
        })];
      }

      return new TableCell({
        children: paragraphs,
        shading: isHeader
          ? { fill: DOCX_COLORS.dark,  type: ShadingType.SOLID, color: DOCX_COLORS.dark }
          : isEven
            ? { fill: 'F0F0F0', type: ShadingType.SOLID, color: 'F0F0F0' }
            : { fill: DOCX_COLORS.white, type: ShadingType.SOLID, color: DOCX_COLORS.white },
        margins: {
          top:    convertInchesToTwip(0.06),
          bottom: convertInchesToTwip(0.06),
          left:   convertInchesToTwip(0.1),
          right:  convertInchesToTwip(0.1),
        },
        verticalAlign: VerticalAlign.CENTER,
        borders: {
          top:    { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
          left:   { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
          right:  { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
        },
      });
    });

    // Pad to colCount
    while (tableCells.length < colCount) {
      tableCells.push(new TableCell({
        children: [new Paragraph({ text: '' })],
        shading: isHeader
          ? { fill: DOCX_COLORS.dark, type: ShadingType.SOLID }
          : { fill: DOCX_COLORS.white, type: ShadingType.SOLID },
      }));
    }

    return new TableRow({ children: tableCells, tableHeader: isHeader });
  });

  return new Table({
    rows: tableRows,
    layout: TableLayoutType.FIXED,
    width: { size: 9000, type: WidthType.DXA },
    columnWidths: Array(colCount).fill(Math.floor(9000 / colCount)),
    borders: {
      top:     { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
      bottom:  { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
      left:    { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
      right:   { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
      insideH: { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
      insideV: { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border },
    },
  });
}

function markdownToDocx(markdown, options = {}) {
  const { skipTOC = false, showTOCInstructions = true } = options;
  const lines = markdown.split('\n');
  const children = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip manual TOC / revision history blocks
    if (/^#{1,2} (Table of Contents|Revision History)/i.test(trimmed)) {
      i++;
      while (i < lines.length && !lines[i].match(/^#{1,2} [^#]/)) i++;
      continue;
    }

    // H1
    if (/^# [^#]/.test(line)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line.slice(2).trim(), bold: true, size: 32, color: DOCX_COLORS.dark })],
        spacing: { before: 360, after: 120 },
        heading: HeadingLevel.HEADING_1,
      }));
      i++; continue;
    }
    // H2
    if (/^## [^#]/.test(line)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line.slice(3).trim(), bold: true, size: 26, color: DOCX_COLORS.dark })],
        spacing: { before: 280, after: 80 },
        heading: HeadingLevel.HEADING_2,
      }));
      i++; continue;
    }
    // H3
    if (/^### [^#]/.test(line)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line.slice(4).trim(), bold: true, size: 22, color: DOCX_COLORS.orange })],
        spacing: { before: 200, after: 60 },
        heading: HeadingLevel.HEADING_3,
      }));
      i++; continue;
    }
    // H4
    if (/^#### /.test(line)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: line.slice(5).trim(), bold: true, size: 20, color: DOCX_COLORS.dark })],
        spacing: { before: 160, after: 40 },
      }));
      i++; continue;
    }
    // HR — skip as spacer
    if (/^---+$/.test(trimmed)) {
      children.push(new Paragraph({ text: '', spacing: { before: 80, after: 80 } }));
      i++; continue;
    }
    // Code block — skip
    if (line.startsWith('```')) {
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) i++;
      i++; continue;
    }
    // Table
    if (line.startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        tableLines.push(lines[i]); i++;
      }
      const tbl = buildDocxTable(tableLines);
      if (tbl) {
        children.push(tbl);
        children.push(new Paragraph({ text: '', spacing: { before: 80, after: 80 } }));
      }
      continue;
    }
    // Bullet
    if (/^[-*] /.test(line)) {
      children.push(new Paragraph({
        children: parseInlineRuns(line.slice(2).trim()),
        bullet: { level: 0 },
        spacing: { before: 40, after: 40 },
      }));
      i++; continue;
    }
    // Numbered list
    const numMatch = line.match(/^(\d+)\. (.+)/);
    if (numMatch) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${numMatch[1]}. `, bold: true, size: 20, color: DOCX_COLORS.orange }),
          ...parseInlineRuns(numMatch[2])
        ],
        spacing: { before: 40, after: 40 },
        indent: { left: convertInchesToTwip(0.2) },
      }));
      i++; continue;
    }
    // Meta line (bold key: value at top of doc)
    if (/^\*\*[^*]+:\*\*/.test(trimmed)) {
      children.push(new Paragraph({
        children: parseInlineRuns(trimmed),
        spacing: { before: 60, after: 40 },
      }));
      i++; continue;
    }
    // Blank line
    if (trimmed === '') {
      children.push(new Paragraph({ text: '', spacing: { before: 40, after: 40 } }));
      i++; continue;
    }
    // Normal paragraph
    children.push(new Paragraph({
      children: parseInlineRuns(trimmed),
      spacing: { before: 60, after: 60 },
    }));
    i++;
  }

  // Collect H1 and H2 headings for TOC (H3 and deeper are too granular)

  // TOC — skip for Google Drive uploads (Google Docs renders field codes differently)
  const tocNoteParagraph = showTOCInstructions ? new Paragraph({
    children: [new TextRun({
      text: '\u2605 To activate page numbers: Press Ctrl + A (select all) \u2192 then F9 \u2192 select "Update entire table" \u2192 click OK',
      size: 18, bold: true, color: 'FF6600',
    })],
    spacing: { before: 0, after: 160 },
  }) : null;

  const tocSection = skipTOC ? [] : [
    new Paragraph({
      children: [new TextRun({ text: 'Table of Contents', bold: true, size: 32, color: DOCX_COLORS.dark })],
      spacing: { before: 0, after: 80 },
      heading: HeadingLevel.HEADING_1,
    }),
    ...(tocNoteParagraph ? [tocNoteParagraph] : []),
    new TableOfContents('Table of Contents', {
      hyperlink: true,
      headingStyleRange: '1-2',
      stylesWithLevels: [
        { styleName: 'Heading 1', level: 1 },
        { styleName: 'Heading 2', level: 2 },
      ],
    }),
    new Paragraph({ pageBreakBefore: true, text: '' }),
  ];

  const allChildren = [...tocSection, ...children];

  return new Document({
    features: { updateFields: true },
    numbering: {
      config: [{
        reference: 'default-bullets',
        levels: [{
          level: 0,
          format: NumberFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: {
            paragraph: { indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) } },
            run: { font: 'Arial', size: 20 },
          },
        }],
      }],
    },
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 20, color: DOCX_COLORS.dark },
          paragraph: { spacing: { line: 276 } },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1', name: 'Heading 1',
          basedOn: 'Normal', next: 'Normal',
          run: { bold: true, size: 32, color: DOCX_COLORS.dark, font: 'Calibri' },
          paragraph: { spacing: { before: 360, after: 120 } },
        },
        {
          id: 'Heading2', name: 'Heading 2',
          basedOn: 'Normal', next: 'Normal',
          run: { bold: true, size: 26, color: DOCX_COLORS.dark, font: 'Calibri' },
          paragraph: { spacing: { before: 280, after: 80 } },
        },
        {
          id: 'Heading3', name: 'Heading 3',
          basedOn: 'Normal', next: 'Normal',
          run: { bold: true, size: 22, color: DOCX_COLORS.orange, font: 'Calibri' },
          paragraph: { spacing: { before: 200, after: 60 } },
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top:    convertInchesToTwip(1.0),
            bottom: convertInchesToTwip(1.0),
            left:   convertInchesToTwip(1.0),
            right:  convertInchesToTwip(1.0),
          },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Fifty Studios Holding Company', bold: true, size: 16, color: DOCX_COLORS.dark }),
              new TextRun({ text: '  |  Software Requirements Specification', size: 16, color: DOCX_COLORS.gray }),
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border, space: 4 } },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'www.5ostudios.com  |  info@5ostudios.com', size: 16, color: DOCX_COLORS.gray }),
              new TextRun({ text: '\t\tPage ', size: 16, color: DOCX_COLORS.gray }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: DOCX_COLORS.gray }),
            ],
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: DOCX_COLORS.border, space: 4 } },
          })],
        }),
      },
      children: allChildren,
    }],
  });
}

// GET /projects/:projectId/srs/:version/download-docx
router.get('/:version/download-docx', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  const { version } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2',
      [project.id, version]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }

    const srsVersion = result.rows[0];
    const markdown = await fs.readFile(srsVersion.file_path, 'utf8');

    const doc = markdownToDocx(markdown);
    const buffer = await Packer.toBuffer(doc);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${makeDownloadName(project.name, version, 'docx')}"`);
    res.send(buffer);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'SRS file not found on disk' });
    }
    console.error('Download DOCX error:', err);
    res.status(500).json({ error: 'Failed to generate DOCX' });
  }
});

// POST /projects/:projectId/srs/:version/upload-to-drive — upload all 3 files to Drive
router.post('/:version/upload-to-drive', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  const { version } = req.params;

  try {
    // Get the SRS version record
    const versionResult = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND version = $2',
      [project.id, version]
    );

    if (versionResult.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }

    const srsVersion = versionResult.rows[0];

    // If already uploaded, return existing URL
    if (srsVersion.drive_share_url && srsVersion.drive_share_url !== '' && srsVersion.drive_share_url !== 'null') {
      return res.json({
        success: true,
        alreadyUploaded: true,
        driveShareUrl: srsVersion.drive_share_url,
      });
    }

    // Read markdown file
    const markdown = await fs.readFile(srsVersion.file_path, 'utf8');

    // Generate DOCX buffer — skip TOC page and instructions for Google Drive (field codes don't render in Google Docs)
    const docxDoc = markdownToDocx(markdown, { skipTOC: true, showTOCInstructions: false });
    const docxBuffer = await require('docx').Packer.toBuffer(docxDoc);

    // Read PDF (existing file path)
    let pdfBuffer = null;
    if (srsVersion.pdf_path) {
      try {
        pdfBuffer = await fs.readFile(srsVersion.pdf_path);
      } catch (pdfErr) {
        console.warn('PDF file not found for Drive upload:', srsVersion.pdf_path);
      }
    }

    // Read markdown file as buffer
    const mdBuffer = await fs.readFile(srsVersion.file_path);

    // Upload to Google Drive
    const result = await uploadVersionFiles(project.name, version, {
      pdf: pdfBuffer,
      docx: docxBuffer,
      md: mdBuffer,
    });

    // Update version record with Drive info
    await pool.query(
      `UPDATE srs_versions
       SET drive_folder_id = $1, drive_file_id_docx = $2, drive_share_url = $3
       WHERE id = $4`,
      [result.driveFolderId, result.driveFileIdDocx, result.shareUrl, srsVersion.id]
    );

    res.json({
      success: true,
      driveFolderId: result.driveFolderId,
      driveFileId: result.driveFileIdDocx,
      driveShareUrl: result.shareUrl,
      message: 'Uploaded to Google Drive',
    });
  } catch (err) {
    console.error('Upload to Drive error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload to Google Drive' });
  }
});

// GET /projects/:projectId/srs/:version/drive-status — check if uploaded
router.get('/:version/drive-status', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;

  const { version } = req.params;

  try {
    const versionResult = await pool.query(
      'SELECT drive_share_url FROM srs_versions WHERE project_id = $1 AND version = $2',
      [project.id, version]
    );

    if (versionResult.rows.length === 0) {
      return res.status(404).json({ error: 'SRS version not found' });
    }

    const srsVersion = versionResult.rows[0];
    const shareUrl = srsVersion.drive_share_url;

    if (shareUrl && shareUrl !== '' && shareUrl !== 'null') {
      res.json({ uploaded: true, driveShareUrl: shareUrl });
    } else {
      res.json({ uploaded: false });
    }
  } catch (err) {
    console.error('Drive status error:', err);
    res.status(500).json({ error: 'Failed to check drive status' });
  }
});

module.exports = router;
module.exports.generateSrsDocument = generateSrsDocument;
module.exports.getNextVersion = getNextVersion;
