const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'srs_platform_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const authMiddleware = require('../middleware/auth');
const { callSrsAgentWithRetry } = require('../services/srsAgent');
const { generatePdfFromMarkdown } = require('../services/pdfGenerator');
const fs = require('fs').promises;
const path = require('path');

// Helper to ensure proposal belongs to user
async function checkProposalAccess(req, res) {
  const proposal = await pool.query(
    'SELECT * FROM proposals WHERE id = $1',
    [req.params.id]
  );
  if (proposal.rows.length === 0) {
    res.status(404).json({ error: 'Proposal not found' });
    return null;
  }
  return proposal.rows[0];
}

// Helper: build proposal prompt
function buildProposalPrompt(data) {
  const timeline = data.timeline_type === 'phase'
    ? data.timeline_data.map((t, i) => `${i + 1}. ${t.name} — ${t.duration}`).join('\n')
    : data.timeline_data.map((t, i) => `Week ${i + 1}: ${t.duration}`).join('\n');

  const paymentTerms = data.payment_terms.map(p =>
    `${p.percentage}% upon ${p.label} (${((data.discounted_price * p.percentage) / 100).toFixed(2)} KWD)`
  ).join('\n');

  const scopeSection = data.scope_summary
    ? `## Scope of Work\n${data.scope_summary}\n\nUser additions:\n${data.exclusions || '(none)'}`
    : `## Scope of Work\n${data.exclusions || 'As per project requirements.'}`;

  return `You are a Fifty Studios proposal writer. Generate a professional proposal document in the exact format below.

Replace everything in [brackets] with the actual values.

=== PROPOSAL FORMAT ===

[Fifty Studios Header]
Address: Khalid Bin Al Waleed St. Oula Tower, Capital, Sharq
Phone: +965 9879 9919 | Email: info@5ostudios.com | Website: www.5ostudios.com

Price Quotation Proposal
Project: ${data.projectName} | Client: ${data.clientName} | Date: ${new Date().toLocaleDateString('en-GB')} | Prepared by: Fifty Studios Holding

## Project Overview
${data.projectOverview || `${data.projectName} is a web platform for ${data.clientName || 'their business needs'}. This proposal covers the development, hosting, and maintenance of the platform as described below.`}

${scopeSection}

## Project Timeline
${timeline}

${data.ai_timeline_edit ? '[NOTE TO AI: Review the timeline above. If any phase/week durations seem unrealistic for the scope described, adjust them to reasonable estimates. Keep the structure but fix the timing.]' : ''}

## Financial Proposal
| Description | Amount (KWD) |
|---|---|
| Original Project Cost | ${(data.original_price || 0).toFixed(2)} |
| Discounted Price | ${(data.discounted_price || 0).toFixed(2)} |

**Payment Terms:**
${paymentTerms}

## Maintenance & Hosting
First Year: Included in total cost (${(data.discounted_price || 0).toFixed(2)} KWD)
Second Year Renewal: ${(data.maintenance_second_year || 600).toFixed(2)} KWD (includes hosting, maintenance, and technical support)

## Notes & Conditions
1. The client shall provide all branding materials (logo, color palette, and content).
2. Hosting and maintenance include standard uptime, monitoring, and technical support.
3. Any data loss, downtime, or force majeure incidents are outside the service scope.
4. Any additional feature requests beyond this scope will be quoted separately.
5. Delays caused by third parties (e.g., payment provider, content submission) are not part of the project timeline.
6. Source code will be delivered upon receipt of final payment.

${data.notes ? `## Additional Notes\n${data.notes}` : ''}

=== END FORMAT ===

IMPORTANT: Return ONLY the raw proposal text starting from the [Fifty Studios Header] line. No preamble, no explanation.`;
}

// ============================================
// GET /api/proposals — list proposals
// ============================================
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { project_id, standalone } = req.query;
    let query = `SELECT id, name, client_name, project_id, srs_version, status, created_at, updated_at FROM proposals WHERE 1=1`;
    const params = [];

    if (standalone === 'true') {
      query += ` AND project_id IS NULL`;
    } else if (project_id) {
      query += ` AND project_id = $${params.length + 1}`;
      params.push(project_id);
    }

    query += ` ORDER BY updated_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[Proposals] List error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET /api/proposals/:id — get single proposal
// ============================================
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const proposal = await pool.query('SELECT * FROM proposals WHERE id = $1', [req.params.id]);
    if (proposal.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.json(proposal.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /api/proposals — create standalone proposal
// ============================================
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      name, client_name, project_id, srs_version,
      timeline_type, timeline_data,
      original_price, discounted_price, payment_terms,
      maintenance_second_year, exclusions, notes, ai_timeline_edit,
      scope_summary, project_overview
    } = req.body;

    const result = await pool.query(`
      INSERT INTO proposals (
        name, client_name, project_id, srs_version,
        timeline_type, timeline_data,
        original_price, discounted_price, payment_terms,
        maintenance_second_year, exclusions, notes, ai_timeline_edit,
        content, status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'draft',$15)
      RETURNING *
    `, [
      name, client_name || '', project_id || null, srs_version || null,
      timeline_type || 'phase',
      JSON.stringify(timeline_data || []),
      original_price || 0, discounted_price || 0,
      JSON.stringify(payment_terms || [{label:'upon contract signing',percentage:50},{label:'final delivery',percentage:50}]),
      maintenance_second_year || 600,
      exclusions || '', notes || '', ai_timeline_edit || false,
      JSON.stringify({scope_summary: scope_summary || '', project_overview: project_overview || ''}),
      req.user.id
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Proposals] Create error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PUT /api/proposals/:id — update proposal (draft stage)
// ============================================
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const {
      name, client_name, srs_version,
      timeline_type, timeline_data,
      original_price, discounted_price, payment_terms,
      maintenance_second_year, exclusions, notes, ai_timeline_edit,
      scope_summary, project_overview
    } = req.body;

    const result = await pool.query(`
      UPDATE proposals SET
        name = COALESCE($1, name),
        client_name = COALESCE($2, client_name),
        srs_version = COALESCE($3, srs_version),
        timeline_type = COALESCE($4, timeline_type),
        timeline_data = COALESCE($5, timeline_data),
        original_price = COALESCE($6, original_price),
        discounted_price = COALESCE($7, discounted_price),
        payment_terms = COALESCE($8, payment_terms),
        maintenance_second_year = COALESCE($9, maintenance_second_year),
        exclusions = COALESCE($10, exclusions),
        notes = COALESCE($11, notes),
        ai_timeline_edit = COALESCE($12, ai_timeline_edit),
        content = COALESCE($13, content),
        updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `, [
      name, client_name, srs_version, timeline_type,
      timeline_data ? JSON.stringify(timeline_data) : null,
      original_price, discounted_price,
      payment_terms ? JSON.stringify(payment_terms) : null,
      maintenance_second_year, exclusions, notes, ai_timeline_edit,
      JSON.stringify({scope_summary: scope_summary || '', project_overview: project_overview || ''}),
      req.params.id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// DELETE /api/proposals/:id
// ============================================
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM proposals WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /api/proposals/:id/generate — generate proposal content
// ============================================
router.post('/:id/generate', authMiddleware, async (req, res) => {
  try {
    const proposal = await pool.query('SELECT * FROM proposals WHERE id = $1', [req.params.id]);
    if (proposal.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    const p = proposal.rows[0];

    // Auto-fill SRS content if srs_version is set
    let scope_summary = '';
    let project_overview = '';
    if (p.srs_version && p.project_id) {
      try {
        const srsPath = path.join(__dirname, '../../projects', String(p.project_id), `srs-v${p.srs_version}.md`);
        const srsContent = await fs.readFile(srsPath, 'utf8');
        // Extract project overview (section 1.1 or first paragraph)
        const overviewMatch = srsContent.match(/# .+?\n[^#]+/);
        project_overview = overviewMatch ? overviewMatch[0].replace(/#+\s/g, '').trim().substring(0, 500) : '';
        // Extract scope items from section 1.2
        const scopeMatch = srsContent.match(/#{1,2}\s+Scope[\s\S]+?(?=#{1,2}\s+[A-Z])/);
        if (scopeMatch) {
          scope_summary = scopeMatch[0].replace(/#+\s/g, '').substring(0, 2000);
        }
      } catch (e) {
        console.warn('[Proposals] Could not read SRS for auto-fill:', e.message);
      }
    }

    const data = {
      projectName: p.name,
      clientName: p.client_name,
      projectOverview: project_overview || p.content ? JSON.parse(p.content || '{}').project_overview : '',
      scope_summary: scope_summary,
      exclusions: p.exclusions,
      timeline_type: p.timeline_type,
      timeline_data: typeof p.timeline_data === 'string' ? JSON.parse(p.timeline_data) : p.timeline_data,
      original_price: p.original_price,
      discounted_price: p.discounted_price,
      payment_terms: typeof p.payment_terms === 'string' ? JSON.parse(p.payment_terms) : p.payment_terms,
      maintenance_second_year: p.maintenance_second_year,
      notes: p.notes,
      ai_timeline_edit: p.ai_timeline_edit
    };

    const prompt = buildProposalPrompt(data);
    const generated = await callSrsAgentWithRetry(prompt, 6000);

    // Update proposal with generated content
    const updated = await pool.query(`
      UPDATE proposals SET
        content = $1,
        status = 'generated',
        updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [generated, req.params.id]);

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[Proposals] Generate error:', err);
    res.status(500).json({ error: `Generation failed: ${err.message}` });
  }
});

// ============================================
// POST /api/proposals/:id/accept — accept proposal
// ============================================
router.post('/:id/accept', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      UPDATE proposals SET status = 'accepted', updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// GET /api/proposals/:id/pdf — download proposal PDF
// ============================================
router.get('/:id/pdf', authMiddleware, async (req, res) => {
  try {
    const proposal = await pool.query('SELECT pdf_path FROM proposals WHERE id = $1', [req.params.id]);
    if (proposal.rows.length === 0 || !proposal.rows[0].pdf_path) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    res.sendFile(proposal.rows[0].pdf_path);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /api/proposals/:id/generate-pdf — generate PDF for proposal
// ============================================
router.post('/:id/generate-pdf', authMiddleware, async (req, res) => {
  try {
    const proposal = await pool.query('SELECT * FROM proposals WHERE id = $1', [req.params.id]);
    if (proposal.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    const p = proposal.rows[0];
    if (!p.content) {
      return res.status(400).json({ error: 'Proposal has no content. Generate first.' });
    }

    const proposalsDir = path.join(__dirname, '../../proposals', String(p.id));
    await fs.mkdir(proposalsDir, { recursive: true });

    const pdfPath = path.join(proposalsDir, `proposal-${p.id}.pdf`);
    await generatePdfFromMarkdown(
      p.content,
      pdfPath,
      p.name,
      `v${p.id}`,
      new Date().toISOString().split('T')[0],
      'Proposal'
    );

    const updated = await pool.query(`
      UPDATE proposals SET pdf_path = $1, updated_at = NOW() WHERE id = $2 RETURNING *
    `, [pdfPath, req.params.id]);

    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[Proposals] PDF generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// POST /api/projects/:projectId/proposals — create proposal linked to project
// ============================================
router.post('/project/:projectId', authMiddleware, async (req, res) => {
  try {
    const { name, srs_version } = req.body;
    const result = await pool.query(`
      INSERT INTO proposals (name, project_id, srs_version, status, created_by)
      VALUES ($1, $2, $3, 'draft', $4) RETURNING *
    `, [name || 'New Proposal', req.params.projectId, srs_version, req.user.id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;