// Worker thread: handles CPU-heavy post-processing, PDF generation, and DB insert
// Runs off the main Node.js event loop — API requests stay responsive during generation
const { parentPort, workerData } = require('worker_threads');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Import the post-process function (sync CPU work)
const { postProcessSrs } = require('./srsAgent');
const { generatePdfFromMarkdown } = require('./pdfGenerator');
const { ensureProjectDir } = require('./storageService');

async function run() {
  const { markdown, projectId, projectName, projectPath, version, userId, dbConfig } = workerData;

  // Create our own DB pool inside the worker (don't share main thread's pool)
  const pool = new Pool({
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    password: dbConfig.password,
    max: 2,
    idleTimeoutMillis: 30000,
  });

  let pdfPath = null;
  let processedMarkdown = markdown;

  try {
    // Step 1: Post-process (CPU-heavy regex on large markdown string)
    processedMarkdown = postProcessSrs(markdown);

    // Step 2: Write markdown file to disk
    const mdFilename = `srs-v${version}.md`;
    const mdPath = path.join(projectPath, mdFilename);
    await fs.promises.writeFile(mdPath, processedMarkdown, 'utf8');

    // Step 3: Generate PDF (CPU-heavy, calls Python script)
    try {
      const pdfFilename = `srs-v${version}.pdf`;
      pdfPath = path.join(projectPath, pdfFilename);
      await generatePdfFromMarkdown(
        processedMarkdown,
        pdfPath,
        projectName,
        version,
        new Date().toISOString().split('T')[0],
        'Draft'
      );
    } catch (pdfErr) {
      console.error('PDF generation failed in worker:', pdfErr.message);
      pdfPath = null;
    }

    // Step 4: Insert DB record
    await pool.query(
      `INSERT INTO srs_versions (project_id, version, file_path, pdf_path, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, version, mdPath, pdfPath, userId]
    );

    // Step 5: Update project status
    await pool.query(
      'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
      ['ready', projectId]
    );

    parentPort.postMessage({ success: true, pdfPath, version });
  } catch (err) {
    console.error('pdfWorker error:', err.message);
    // Try to mark project as failed
    try {
      await pool.query(
        'UPDATE projects SET generation_status = $1, updated_at = NOW() WHERE id = $2',
        ['failed', projectId]
      );
    } catch {}
    parentPort.postMessage({ success: false, error: err.message });
  } finally {
    await pool.end();
  }
}

run();
