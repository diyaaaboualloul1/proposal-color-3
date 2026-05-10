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
  const origPrice = Number(data.original_price || 0);
  const discPrice = Number(data.discounted_price || 0);
  const effectivePrice = discPrice > 0 ? discPrice : origPrice;
  const maintPrice = Number(data.maintenance_second_year || 600);

  const timeline = data.timeline_type === 'phase'
    ? data.timeline_data.map((t, i) => `${i + 1}. ${t.name} — ${t.duration}`).join('\n')
    : data.timeline_data.map((t, i) => `Week ${i + 1}: ${t.duration}`).join('\n');

  // Clean payment terms — label already contains the full description (e.g. "50% upon contract signing")
  const paymentTerms = (data.payment_terms || []).map(p =>
    `${p.label} (${((effectivePrice * p.percentage) / 100).toFixed(2)} KWD)`
  ).join('\n');

  // Build scope section — parse In/Out cleanly
  // Supports two formats:
  // 1. SRS format: "**In Scope:**\n  - item1\n  - item2\n**Out of Scope:**\n  - item3"
  // 2. Manual format: "In: item1, item2\nOut: item3"
  let scopeText = '';
  if (data.scope_summary && data.scope_summary.trim()) {
    scopeText = data.scope_summary.trim();
  } else if (data.projectOverview && data.projectOverview.trim()) {
    scopeText = data.projectOverview.trim();
  }

  let scopeSection = '## Scope of Work\n';
  if (scopeText) {
    let inText = '';
    let outText = '';

    // Try SRS-style markers first ("**In Scope:**" / "**Out of Scope:**")
    const srsInMarker = '**In Scope:**';
    const srsOutMarker = '**Out of Scope:**';
    const srsInIdx = scopeText.indexOf(srsInMarker);
    const srsOutIdx = scopeText.indexOf(srsOutMarker);

    if (srsInIdx >= 0 && srsOutIdx >= 0 && srsOutIdx > srsInIdx) {
      inText = scopeText.substring(srsInIdx + srsInMarker.length, srsOutIdx).trim();
      outText = scopeText.substring(srsOutIdx + srsOutMarker.length).trim();
    } else if (srsInIdx >= 0) {
      inText = scopeText.substring(srsInIdx + srsInMarker.length).trim();
    } else if (srsOutIdx >= 0) {
      outText = scopeText.substring(srsOutIdx + srsOutMarker.length).trim();
    } else {
      // Fall back to manual format: "In:" and "Out:" on separate lines
      const inMatch = scopeText.match(/(?:^|\n)In:\s*([\s\S]*?)(?=Out:\s*|$)/i);
      const outMatch = scopeText.match(/(?:^|\n)Out:\s*([\s\S]*?)(?=$|\nIn:)/i);
      inText = inMatch ? inMatch[1].trim() : '';
      outText = outMatch ? outMatch[1].trim() : '';
    }

    if (inText || outText) {
      if (inText) {
        // Split by newline OR ' - ' separator (AI often concatenates items this way)
        const inItems = inText.split(/\n/).reduce((acc, line) => {
          const cleaned = line.replace(/^\s*[-*]+\s*/, '').trim();
          if (!cleaned) return acc;
          // If line contains ' - ' separators, split them too
          if (cleaned.includes(' - ') && !cleaned.startsWith('-')) {
            return acc.concat(cleaned.split(/\s+-\s+/));
          }
          return acc.concat(cleaned);
        }, []).filter(Boolean);
        scopeSection += '**In:**\n' + inItems.map(s => `- ${s}`).join('\n') + '\n';
      }
      if (outText) {
        const outItems = outText.split(/\n/).reduce((acc, line) => {
          const cleaned = line.replace(/^\s*[-*]+\s*/, '').trim();
          if (!cleaned) return acc;
          if (cleaned.includes(' - ') && !cleaned.startsWith('-')) {
            return acc.concat(cleaned.split(/\s+-\s+/));
          }
          return acc.concat(cleaned);
        }, []).filter(Boolean);
        scopeSection += '**Out:**\n' + outItems.map(s => `- ${s}`).join('\n') + '\n';
      }
    } else {
      scopeSection += scopeText + '\n';
    }
  } else {
    scopeSection += 'As per project requirements defined in the attached SRS document.\n';
  }

  const projectOverview = (data.projectOverview || '').trim()
    || `${data.projectName} is a web platform for ${data.clientName || 'their business needs'}. This proposal covers the development, hosting, and maintenance of the platform as described below.`;

  return `You are a Fifty Studios proposal writer. Generate a professional proposal document in the exact format below.

=== PROPOSAL FORMAT ===

[Fifty Studios Header]
Address: Khalid Bin Al Waleed St. Oula Tower, Capital, Sharq
Phone: +965 9879 9919 | Email: info@5ostudios.com | Website: www.5ostudios.com

Price Quotation Proposal
Project: ${data.projectName} | Client: ${data.clientName || 'Client'} | Date: ${new Date().toLocaleDateString('en-GB')} | Prepared by: Fifty Studios Holding

## Project Overview
${projectOverview}

${scopeSection}

## Project Timeline
${timeline}
${data.ai_timeline_edit ? '\nNote: Timeline durations above are estimates. AI may adjust if unrealistic for the scope described.\n' : ''}

## Financial Proposal
| Description | Amount (KWD) |
|---|---|
| Original Project Cost | ${origPrice.toFixed(2)} |
| Discounted Price | ${discPrice.toFixed(2)} |

**Payment Terms:**
${paymentTerms}

## Maintenance & Hosting
First Year: Included in total cost (${effectivePrice.toFixed(2)} KWD)
Second Year Renewal: ${maintPrice.toFixed(2)} KWD (includes hosting, maintenance, and technical support)

## Notes & Conditions
1. The client shall provide all branding materials (logo, color palette, and content).
2. Hosting and maintenance include standard uptime, monitoring, and technical support.
3. Any data loss, downtime, or force majeure incidents are outside the service scope.
4. Any additional feature requests beyond this scope will be quoted separately.
5. Delays caused by third parties (e.g., payment provider, content submission) are not part of the project timeline.
6. Source code will be delivered upon receipt of final payment.
${data.notes ? `\n## Additional Notes\n${data.notes}` : ''}

=== END FORMAT ===

IMPORTANT:
- Output must start with the [Fifty Studios Header] line
- Do NOT include these instructions in your output
- The Financial Proposal table must have exactly 2 rows: "Original Project Cost" and "Discounted Price" — do NOT add extra rows
- Do NOT add preamble or explanation
- Each scope item (In and Out) MUST be on its own separate line starting with "- ". Do NOT combine multiple items onto one line.
- Payment Terms must NOT repeat "50% upon" — use the label exactly as provided
`;
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
        inputs_data, status, created_by
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
    const allowed = [
      'name', 'client_name', 'srs_version',
      'timeline_type', 'timeline_data',
      'original_price', 'discounted_price', 'payment_terms',
      'maintenance_second_year', 'exclusions', 'notes', 'ai_timeline_edit',
      'scope_summary', 'project_overview', 'content'
    ];
    const updates = [];
    const params = [];
    let idx = 1;

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        let val = req.body[field];
        // JSON-serialize only these JSON fields
        if (field === 'timeline_data' || field === 'payment_terms') {
          val = val === null ? null : JSON.stringify(val);
        } else if (field === 'scope_summary' || field === 'project_overview') {
          // These are stored inside inputs_data JSONB
          // handled separately below — skip here
          continue;
        }
        updates.push(`${field} = $${idx}`);
        params.push(val);
        idx++;
      }
    }

    // Handle inputs_data specially: merge scope_summary/project_overview into existing inputs_data
    if (req.body.scope_summary !== undefined || req.body.project_overview !== undefined) {
      updates.push(`inputs_data = $${idx}`);
      params.push(JSON.stringify({
        scope_summary: req.body.scope_summary || '',
        project_overview: req.body.project_overview || ''
      }));
      idx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE proposals SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[Proposals] PUT error:', err.message);
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
    // First try reading from inputs_data (JSONB column)
    try {
      const inputs = typeof p.inputs_data === 'string' ? JSON.parse(p.inputs_data) : (p.inputs_data || {});
      scope_summary = inputs.scope_summary || '';
      project_overview = inputs.project_overview || '';
    } catch(e) {}
    // If still empty and srs_version is set, extract from SRS file
    if ((!scope_summary || !project_overview) && p.srs_version && p.project_id) {
      try {
        const srsPath = path.join(__dirname, '../../projects', String(p.project_id), `srs-v${p.srs_version}.md`);
        const srsContent = await fs.readFile(srsPath, 'utf8');
        // Extract project overview — first paragraph after title
        const lines = srsContent.split('\n');
        let capturing = false;
        let paraLines = [];
        for (const line of lines) {
          if (line.startsWith('# ') && !capturing) { capturing = true; continue; }
          if (capturing) {
            if (line.startsWith('## ') || line.startsWith('### ')) break;
            if (line.trim()) paraLines.push(line.trim());
            else if (paraLines.length > 0) break;
          }
        }
        if (!project_overview) project_overview = paraLines.join(' ').replace(/\s+/g, ' ').substring(0, 500);
        // Fallback: use DB description if SRS paragraph is too generic/long
        if (!project_overview || project_overview.length > 300) {
          project_overview = (p.description || '').trim() || project_overview;
        }
        // Extract scope — look for Scope section
        if (!scope_summary) {
          const scopeMatch = srsContent.match(/#{1,3}\s+[\d.]+\s*Scope[\s\S]*?(?=#{1,3}\s+[\d.]+\s+[A-Z]|={3,}|---|$)/i);
          if (scopeMatch) {
            scope_summary = scopeMatch[0]
              .replace(/#{1,3}\s*[\d.]+\s*Scope\s*/gi, '')
              .replace(/#{2,3}\s+/g, '\n')
              .replace(/\n\s*/g, '\n')
              .trim().substring(0, 3000);
          }
        }
      } catch (e) {
        console.warn('[Proposals] Could not read SRS:', e.message);
      }
    }

    const data = {
      projectName: p.name,
      clientName: p.client_name,
      projectOverview: project_overview,
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

    // Update proposal with generated content — preserve 'accepted' status if already set
    const newStatus = p.status === 'accepted' ? 'accepted' : 'generated';
    const updated = await pool.query(`
      UPDATE proposals SET
        content = $1,
        status = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [generated, newStatus, req.params.id]);

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

    // Strip the [Fifty Studios Header] block from content — it belongs on the cover page only,
    // not as body content that spills onto page 2+ as duplicate header text
    // The header block in generated content looks like:
    // [Fifty Studios Header]
    // Address: ... | Email: ... | Website: ...
    // Price Quotation Proposal
    // Project: ... | Client: ... | Date: ... | Prepared by: ...
    let pdfContent = p.content || '';
    pdfContent = pdfContent
      .replace(/^\[Fifty Studios Header\][\s\S]*?(?=\n## )/m, '')          // remove header block before first ## section
      .replace(/^Address:[^\n]*\n/, '')                                    // Address: line
      .replace(/^Phone:[^\n]*\n/, '')                                       // Phone: line
      .replace(/^Price Quotation Proposal[^\n]*\n/, '')                    // Price Quotation Proposal line
      .replace(/^Project:[^\n]*\n/, '')                                     // Project: full line (contains Client/Date/Prepared too)
      .replace(/^Prepared by:[^\n]*\n/, '');                                // Prepared by: line

    await generatePdfFromMarkdown(
      pdfContent,
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