const express = require('express');
const router = express.Router({ mergeParams: true });
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const authMiddleware = require('../middleware/auth');
const { callSrsAgentWithRetry, callSrsAgentStream, buildChatEditPrompt, buildDiffPrompt, postProcessSrs } = require('../services/srsAgent');
const { enqueue } = require('../services/generationQueue');
const { generatePdfFromMarkdown } = require('../services/pdfGenerator');
const { ensureProjectDir } = require('../services/storageService');

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

// GET /projects/:projectId/chat
router.get('/', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;
  
  try {
    const result = await pool.query(
      'SELECT * FROM chat_messages WHERE project_id = $1 ORDER BY created_at ASC',
      [project.id]
    );
    
    res.json({ messages: result.rows });
  } catch (err) {
    console.error('Get chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /projects/:projectId/chat
router.post('/', authMiddleware, async (req, res) => {
  const project = await checkProjectAccess(req, res);
  if (!project) return;
  
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message required' });
  }
  
  try {
    // Get current SRS version (technical only — never edit a client summary)
    const srsResult = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND type = \'technical\' ORDER BY created_at DESC LIMIT 1',
      [project.id]
    );
    
    if (srsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No SRS document found. Generate an SRS first.' });
    }
    
    const currentSrsVersion = srsResult.rows[0];
    
    // Read current SRS content
    const currentSrsMarkdown = await fs.readFile(currentSrsVersion.file_path, 'utf8');
    
    // Save user message
    const userMsgResult = await pool.query(
      'INSERT INTO chat_messages (project_id, role, content, srs_version) VALUES ($1, $2, $3, $4) RETURNING *',
      [project.id, 'user', message.trim(), currentSrsVersion.version]
    );
    const userMessage = userMsgResult.rows[0];
    
    // Get last 10 messages for context (excluding the one just saved)
    const historyResult = await pool.query(
      `SELECT role, content FROM chat_messages
       WHERE project_id = $1 AND id != $2
       ORDER BY created_at DESC LIMIT 10`,
      [project.id, userMessage.id]
    );
    const chatHistory = historyResult.rows.reverse(); // oldest first

    // Route through generation queue to serialize concurrent edits
    let updatedMarkdown;
    try {
      const prompt = buildChatEditPrompt(currentSrsMarkdown, message.trim(), chatHistory);
      updatedMarkdown = await enqueue(() => callSrsAgentWithRetry(prompt), { projectId: project.id, projectName: project.name, type: 'editing' });
    } catch (err) {
      console.error('Srs agent call failed:', err.message);
      // Keep user message in DB — don't delete it, so it shows as "waiting" on refresh
      return res.status(503).json({ error: 'SRS generation is temporarily unavailable. Please try again in a few minutes.' });
    }
    
    // Post-process to enforce format rules
    updatedMarkdown = postProcessSrs(updatedMarkdown);

    // Validate: if AI returned a question or tiny response instead of a real SRS, reject it
    if (updatedMarkdown.length < 500 || !updatedMarkdown.includes('#')) {
      await pool.query('DELETE FROM chat_messages WHERE id = $1', [userMessage.id]);
      return res.status(400).json({ error: 'The AI could not process your request. Please be more specific and try again.' });
    }

    // Calculate next version (minor increment)
    const versionParts = currentSrsVersion.version.split('.');
    const major = parseInt(versionParts[0]);
    const minor = parseInt(versionParts[1]) + 1;
    const newVersion = `${major}.${minor}`;
    
    // Save new SRS version
    const projectPath = await ensureProjectDir(project.id);
    const mdFilename = `srs-v${newVersion}.md`;
    const mdPath = path.join(projectPath, mdFilename);
    await fs.writeFile(mdPath, updatedMarkdown, 'utf8');
    
    // Generate PDF
    let pdfPath = null;
    try {
      const pdfFilename = `srs-v${newVersion}.pdf`;
      pdfPath = path.join(projectPath, pdfFilename);
      await generatePdfFromMarkdown(updatedMarkdown, pdfPath, null, newVersion, new Date().toISOString().split('T')[0], 'Draft');
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr.message);
      pdfPath = null;
    }
    
    // Save version to DB
    const newVersionResult = await pool.query(
      `INSERT INTO srs_versions (project_id, version, file_path, pdf_path, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [project.id, newVersion, mdPath, pdfPath, req.user.id]
    );
    
    // Save AI response message
    const aiMsgResult = await pool.query(
      'INSERT INTO chat_messages (project_id, role, content, srs_version) VALUES ($1, $2, $3, $4) RETURNING *',
      [project.id, 'assistant', `Done. Updated SRS to version ${newVersion}.`, newVersion]
    );
    
    res.json({
      userMessage,
      aiMessage: aiMsgResult.rows[0],
      newVersion: newVersionResult.rows[0]
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /projects/:projectId/chat/stream?message=... (SSE streaming chat)
router.get('/stream', authMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      // Broken pipe — client disconnected, ignore
    }
  };

  const message = req.query.message;
  if (!message || !message.trim()) {
    send({ type: 'error', message: 'Message query param required' });
    return res.end();
  }

  const project = await checkProjectAccess(req, res);
  if (!project) return;

  try {
    // Get current SRS version (technical only — never edit a client summary)
    const srsResult = await pool.query(
      'SELECT * FROM srs_versions WHERE project_id = $1 AND type = \'technical\' ORDER BY created_at DESC LIMIT 1',
      [project.id]
    );

    if (srsResult.rows.length === 0) {
      send({ type: 'error', message: 'No SRS document found. Generate an SRS first.' });
      return res.end();
    }

    const currentSrsVersion = srsResult.rows[0];
    const currentSrsMarkdown = await fs.readFile(currentSrsVersion.file_path, 'utf8');

    // Save user message to DB immediately
    const userMsgResult = await pool.query(
      'INSERT INTO chat_messages (project_id, role, content, srs_version) VALUES ($1, $2, $3, $4) RETURNING *',
      [project.id, 'user', message.trim(), currentSrsVersion.version]
    );
    const userMessage = userMsgResult.rows[0];

    // Get chat history
    const historyResult = await pool.query(
      `SELECT role, content FROM chat_messages
       WHERE project_id = $1 AND id != $2
       ORDER BY created_at DESC LIMIT 10`,
      [project.id, userMessage.id]
    );
    const chatHistory = historyResult.rows.reverse();

    // Check if user is cancelling a pending confirm — handle instantly without AI
    const isCancel = /^(no|nope|cancel|stop|abort|nevermind|never mind)$/i.test(message.trim());
    const lastAiMsg = chatHistory.filter(m => m.role === 'assistant').pop();
    const isPendingConfirm = lastAiMsg?.content?.includes('CONFIRM_EDIT:') || lastAiMsg?.content?.includes('Reply **yes**');

    if (isCancel && isPendingConfirm) {
      send({ type: 'queued', message: 'Cancelling...', userMessageId: userMessage.id, userMessageCreatedAt: userMessage.created_at });
      res.end();
      await pool.query(
        'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
        [project.id, 'assistant', '❌ Cancelled. No changes were made. Let me know if you want to try a different edit.', currentSrsVersion.version, 'info', userMessage.id]
      );
      return;
    }

    // Handle /diff command directly — compare last 2 SRS versions from DB (no AI needed for this)
    if (message.trim() === '/diff') {
      send({ type: 'queued', message: 'Generating diff...', userMessageId: userMessage.id, userMessageCreatedAt: userMessage.created_at });
      res.end();
      setImmediate(async () => {
        try {
          const versionsResult = await pool.query(
            'SELECT * FROM srs_versions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 2',
            [project.id]
          );
          if (versionsResult.rows.length < 2) {
            await pool.query(
              'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
              [project.id, 'assistant', 'ℹ️ Only one version exists — no diff available yet.', currentSrsVersion.version, 'info', userMessage.id]
            );
            return;
          }
          const [newV, oldV] = versionsResult.rows;
          const oldMarkdown = await fs.readFile(oldV.file_path, 'utf8');
          const newMarkdown = await fs.readFile(newV.file_path, 'utf8');
          const diffPrompt = buildDiffPrompt(oldMarkdown, newMarkdown);
          const diffResponse = await callSrsAgentWithRetry(diffPrompt, 1000, 1, 0);
          const diffContent = diffResponse.replace(/^DIFF_SUMMARY:\s*/i, '').trim();

          // Find the original edit request via single SQL query
          // success msg → reply_to(yes) → find earliest clarify/confirm before yes (scoped after prev success)
          // → that AI msg's reply_to = original user request
          const editTitleResult = await pool.query(`
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
          `, [project.id, newV.version]);
          const editTitle = editTitleResult.rows[0]?.content || null;
          if (editTitle) console.log(`[Chat] /diff edit title found: "${editTitle}"`);
          else console.log(`[Chat] /diff no edit title found for v${newV.version}`);
          const titleLine = editTitle ? `**Edit:** "${editTitle}"\n\n` : '';
          const content = `📋 **Diff: v${oldV.version} → v${newV.version}**\n\n${titleLine}${diffContent}`;
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', content, currentSrsVersion.version, 'info', userMessage.id]
          );
        } catch (err) {
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', `⚠️ Diff failed: ${err.message}`, currentSrsVersion.version, 'error', userMessage.id]
          );
        }
      });
      return;
    }

    // Handle /client command — redirect to client generation endpoint via SSE
    if (message.trim() === '/client') {
      send({ type: 'queued', message: 'Generating client summary...', userMessageId: userMessage.id, userMessageCreatedAt: userMessage.created_at });
      res.end();
      setImmediate(async () => {
        try {
          const latestResult = await pool.query(
            `SELECT * FROM srs_versions WHERE project_id = $1 AND type = 'technical' ORDER BY created_at DESC LIMIT 1`,
            [project.id]
          );
          if (latestResult.rows.length === 0) {
            await pool.query(
              'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
              [project.id, 'assistant', '⚠️ No technical SRS found. Please generate an SRS first.', currentSrsVersion.version, 'error', userMessage.id]
            );
            return;
          }
          const parentVersion = latestResult.rows[0].version;
          const clientVersionsResult = await pool.query(
            `SELECT version FROM srs_versions WHERE project_id = $1 AND type = 'client' AND parent_version = $2 ORDER BY created_at DESC LIMIT 1`,
            [project.id, parentVersion]
          );
          let nextClientVersion = clientVersionsResult.rows.length === 0 ? '1.0' : (() => {
            // Handle both 'client-v1.0' and 'client-v1.0-of-v1.1' formats
            const stored = clientVersionsResult.rows[0].version.replace('client-', '').replace(/^v/, '').split('-of-')[0];
            const [maj, min] = stored.split('.').map(Number);
            return `${maj}.${min + 1}`;
          })();
          const clientVersionName = `client-v${nextClientVersion}-of-${parentVersion}`;
          const srsMarkdown = await fs.readFile(latestResult.rows[0].file_path, 'utf8');
          const { buildClientPrompt, callSrsAgentWithRetry } = require('../services/srsAgent');
          const clientPrompt = buildClientPrompt(srsMarkdown, project.name, parentVersion);
          const clientMarkdown = await callSrsAgentWithRetry(clientPrompt, 8000);
          const projectPath = path.join(__dirname, '../../projects', String(project.id));
          await fs.mkdir(projectPath, { recursive: true });
          const mdPath = path.join(projectPath, `${clientVersionName}.md`);
          await fs.writeFile(mdPath, clientMarkdown);
          const pdfPath = mdPath.replace('.md', '.pdf');
          const { generatePdfFromMarkdown } = require('../services/pdfGenerator');
          await generatePdfFromMarkdown(clientMarkdown, pdfPath, null, clientVersionName, new Date().toISOString().split('T')[0], 'Client Summary');
          await pool.query(
            `INSERT INTO srs_versions (project_id, version, file_path, pdf_path, type, parent_version, created_by) VALUES ($1, $2, $3, $4, 'client', $5, $6)`,
            [project.id, clientVersionName, mdPath, pdfPath, parentVersion, req.user.id]
          );
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', `✅ Client Summary ${clientVersionName} generated from v${parentVersion}! Check the History tab to download it.`, clientVersionName, 'success', userMessage.id]
          );
        } catch (err) {
          console.error('[Chat] /client error:', err);
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', `⚠️ Client generation failed: ${err.message}`, currentSrsVersion.version, 'error', userMessage.id]
          );
        }
      });
      return;
    }

    // Acknowledge immediately — frontend polls for result
    send({ type: 'queued', message: 'Your request is being processed. This may take up to 2 minutes...', userMessageId: userMessage.id, userMessageCreatedAt: userMessage.created_at });
    res.end();

    // Process AI job in background (after SSE is closed)
    // Note: setImmediate() is NOT a Promise — errors must be caught INSIDE the callback
    console.log(`[Chat] Scheduling background job for project ${project.id}, message:`, message.substring(0, 30));
    setImmediate(async () => {
      console.log(`[Chat] Background job starting for project ${project.id}`);
      try {
        const prompt = buildChatEditPrompt(currentSrsMarkdown, message.trim(), chatHistory);
        let aiResponse = await enqueue(
          () => callSrsAgentWithRetry(prompt),
          { projectId: project.id, projectName: project.name, type: 'editing' }
        );
        // ── Parse AI response type by prefix ──────────────────────────────
        const trimmed = aiResponse.trim();

        // CLARIFY: AI asks questions before editing
        if (trimmed.startsWith('CLARIFY:')) {
          const content = trimmed.replace(/^CLARIFY:\s*/i, '').trim();
          console.log(`[Chat] AI is clarifying for project ${project.id}`);
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', content, currentSrsVersion.version, 'clarify', userMessage.id]
          );
          return;
        }

        // CONFIRM_EDIT: AI shows plan, waits for user yes/no
        if (trimmed.startsWith('CONFIRM_EDIT:')) {
          const content = trimmed.replace(/^CONFIRM_EDIT:\s*/i, '').trim();
          console.log(`[Chat] AI showing edit plan for project ${project.id}`);
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', content, currentSrsVersion.version, 'confirm', userMessage.id]
          );
          return;
        }

        // User cancelled a pending edit
        if (trimmed.toLowerCase().startsWith('cancelled') || trimmed.toLowerCase().includes('let me know if you want')) {
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', trimmed, currentSrsVersion.version, 'info', userMessage.id]
          );
          return;
        }

        // COMMAND responses: /status, /undo, /diff, /scope
        const commandPrefixes = ['STATUS:', 'DIFF:', 'SCOPE:'];
        for (const prefix of commandPrefixes) {
          if (trimmed.startsWith(prefix)) {
            const content = trimmed.replace(new RegExp(`^${prefix}\\s*`, 'i'), '').trim();
            await pool.query(
              'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
              [project.id, 'assistant', content, currentSrsVersion.version, 'info', userMessage.id]
            );
            return;
          }
        }

        // UNDO command
        if (trimmed.startsWith('UNDO:')) {
          // Find previous version and restore it
          const versionsResult = await pool.query(
            'SELECT * FROM srs_versions WHERE project_id = $1 ORDER BY created_at DESC LIMIT 2',
            [project.id]
          );
          if (versionsResult.rows.length < 2) {
            await pool.query(
              'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
              [project.id, 'assistant', '⚠️ No previous version to undo to.', currentSrsVersion.version, 'error', userMessage.id]
            );
            return;
          }
          const prevVersion = versionsResult.rows[1];
          // Delete latest version file + DB row
          const latestV = versionsResult.rows[0];
          try { await fs.unlink(latestV.file_path); } catch {}
          try { if (latestV.pdf_path) await fs.unlink(latestV.pdf_path); } catch {}
          await pool.query('DELETE FROM srs_versions WHERE id = $1', [latestV.id]);
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', `↩️ Rolled back to version ${prevVersion.version} successfully.`, prevVersion.version, 'info', userMessage.id]
          );
          console.log(`[Chat] Undo for project ${project.id} — rolled back to ${prevVersion.version}`);
          return;
        }

        // GENERATE: AI is executing the edit
        let updatedMarkdown = trimmed.startsWith('GENERATE:')
          ? trimmed.replace(/^GENERATE:\s*/i, '').trim()
          : trimmed;

        updatedMarkdown = postProcessSrs(updatedMarkdown);

        // If response is short but looks like a valid conversational reply (not a full SRS), save it as info
        if (updatedMarkdown.length < 500 || !updatedMarkdown.includes('#')) {
          // Check if it's a meaningful conversational reply (not just garbage)
          const isGarbage = updatedMarkdown.length < 10 || /^[^a-zA-Z\u0600-\u06FF]{5,}$/.test(updatedMarkdown.trim());
          console.log(`[Chat] Short reply (not garbage, not diff) for project ${project.id}: ${updatedMarkdown.substring(0, 60)}`);
          if (isGarbage) {
            // Garbage — save as error
            console.error(`[Chat] Invalid AI response for project ${project.id}: length=${updatedMarkdown.length}`);
            await pool.query(
              'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
              [project.id, 'assistant', '⚠️ Could not process your request — the AI response was invalid. Please try again with more detail.', currentSrsVersion.version, 'error', userMessage.id]
            );
            return;
          }

          // SAFETY CHECK: if AI returned DIFF SUMMARY after a user confirmation,
          // skip saving it as info and trigger background generation instead
          const trimmedLower = updatedMarkdown.toLowerCase();
          const userMsgLower = (userMessage?.content || '').toLowerCase().trim();
          const looksLikeDiffSummary = trimmedLower.includes('diff summary') || trimmedLower.includes('**diff');
          const userWasConfirming = /^yes|yea|yep|ok|okay|confirm|proceed|go ahead|do it|start|make|add|insert|change|update|remove|delete/i.test(userMsgLower);

          if (looksLikeDiffSummary && userWasConfirming) {
            // User confirmed but AI gave diff summary instead of GENERATE: — force generation
            console.log(`[Chat] AI returned diff summary after confirmation for project ${project.id} — forcing background generation`);
            await pool.query(
              'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
              [project.id, 'assistant', updatedMarkdown.trim(), currentSrsVersion.version, 'info', userMessage.id]
            );
            const { enqueue } = require('../services/generationQueue');
            enqueue({ projectId: project.id, userId: user.id, userMessageId: userMessage.id, action: 'edit', editMessageId: userMessage.id });
            return;
          }

          // Valid short reply (cancellation, question, info) — save as-is
          console.log(`[Chat] Short conversational reply for project ${project.id}: ${updatedMarkdown.substring(0, 80)}`);
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', updatedMarkdown.trim(), currentSrsVersion.version, 'info', userMessage.id]
          );
        }

        // Calculate next version — fetch LATEST TECHNICAL to avoid NaN from client-x.y version strings
        const latestVersionResult = await pool.query(
          'SELECT * FROM srs_versions WHERE project_id = $1 AND type = \'technical\' ORDER BY created_at DESC LIMIT 1',
          [project.id]
        );
        const latestVersionRow = latestVersionResult.rows[0];
        const latestVersion = latestVersionRow?.version || '1.0';
        const versionParts = latestVersion.split('.');
        const major = parseInt(versionParts[0]);
        const minor = parseInt(versionParts[1]) + 1;
        const newVersion = `${major}.${minor}`;

        // Save SRS file
        const projectPath = await ensureProjectDir(project.id);
        const mdFilename = `srs-v${newVersion}.md`;
        const mdPath = path.join(projectPath, mdFilename);
        await fs.writeFile(mdPath, updatedMarkdown, 'utf8');

        // Generate PDF
        let pdfPath = null;
        try {
          const pdfFilename = `srs-v${newVersion}.pdf`;
          pdfPath = path.join(projectPath, pdfFilename);
          await generatePdfFromMarkdown(updatedMarkdown, pdfPath, null, newVersion, new Date().toISOString().split('T')[0], 'Draft');
        } catch (pdfErr) {
          console.error('PDF generation failed during background chat:', pdfErr.message);
        }

        // Save version to DB
        await pool.query(
          `INSERT INTO srs_versions (project_id, version, file_path, pdf_path, created_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [project.id, newVersion, mdPath, pdfPath, req.user.id]
        );

        // Generate diff summary between old and new version
        let diffContent = '';
        if (latestVersionRow?.file_path) {
          try {
            const oldMarkdown = await fs.readFile(latestVersionRow.file_path, 'utf8');
            const diffPrompt = buildDiffPrompt(oldMarkdown, updatedMarkdown);
            const diffResponse = await callSrsAgentWithRetry(diffPrompt, 1000, 1, 0);
            if (diffResponse.includes('DIFF_SUMMARY:')) {
              diffContent = diffResponse.replace(/^DIFF_SUMMARY:\s*/i, '').trim();
            }
          } catch (diffErr) {
            console.error('[Chat] Diff generation failed:', diffErr.message);
          }
        }

        // Save AI response with version and diff
        const successContent = diffContent
          ? `✅ Version ${newVersion} created\n\n${diffContent}`
          : `✅ Version ${newVersion} created`;

        await pool.query(
          'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
          [project.id, 'assistant', successContent, newVersion, 'success', userMessage.id]
        );

        console.log(`[Chat] Background job complete for project ${project.id} — new version ${newVersion}`);
      } catch (err) {
        console.error('[Chat] Background job failed for project', project.id, ':', err.message);
        try {
          await pool.query(
            'INSERT INTO chat_messages (project_id, role, content, srs_version, msg_type, reply_to) VALUES ($1, $2, $3, $4, $5, $6)',
            [project.id, 'assistant', `⚠️ Generation failed: ${err.message}. Please try again.`, currentSrsVersion.version, 'error', userMessage.id]
          );
        } catch {}
      }
    });

  } catch (err) {
    console.error('Stream chat error:', err);
    send({ type: 'error', message: err.message });
    res.end();
  }
});

module.exports = router;
