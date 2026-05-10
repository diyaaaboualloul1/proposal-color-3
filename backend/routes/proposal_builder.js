const express = require("express");
const router = express.Router();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || "srs_platform_db",
  user: process.env.PGUSER || "srs_user",
  password: process.env.PGPASSWORD || "SrsPlatform2026!",
});

const authMiddleware = require("../middleware/auth");

// GET /api/proposal-builder/templates
router.get("/templates", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM builder_proposal_templates ORDER BY is_system DESC, name ASC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proposal-builder/proposals — list all (MUST come before /:id to avoid shadowing)
router.get("/proposals", authMiddleware, async (req, res) => {
  try {
    const { project_id, srs_version } = req.query;
    let query = "SELECT * FROM builder_proposals WHERE 1=1";
    const params = [];
    if (project_id) { params.push(project_id); query += ` AND project_id=$${params.length}`; }
    if (srs_version) { params.push(srs_version); query += ` AND srs_version=$${params.length}`; }
    query += " ORDER BY updated_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proposal-builder/proposals — create
router.post("/proposals", authMiddleware, async (req, res) => {
  try {
    const { name, project_id, srs_version, template_id, blocks } = req.body;
    const result = await pool.query(
      `INSERT INTO builder_proposals (name, project_id, srs_version, template_id, blocks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name||"New Proposal", project_id, srs_version, template_id, JSON.stringify(blocks||[]), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proposal-builder/proposals/:id — get one (MUST come before /:id)
router.get("/proposals/:id", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM builder_proposals WHERE id=$1", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/proposal-builder/proposals/:id — update (MUST come before /:id)
router.put("/proposals/:id", authMiddleware, async (req, res) => {
  try {
    const { name, blocks, status, template_id, project_id, srs_version } = req.body;
    const result = await pool.query(
      `UPDATE builder_proposals SET name=$1, blocks=$2, status=$3, template_id=$4, project_id=$5, srs_version=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, JSON.stringify(blocks||[]), status, template_id, project_id || null, srs_version || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/proposal-builder/proposals/:id — delete (MUST come before /:id)
router.delete("/proposals/:id", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM builder_proposals WHERE id=$1 RETURNING id", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Proposal not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proposal-builder/proposals/:id/save-version (MUST come before /:id)
router.post("/proposals/:id/save-version", authMiddleware, async (req, res) => {
  try {
    const proposal = await pool.query("SELECT blocks FROM builder_proposals WHERE id=$1", [req.params.id]);
    if (!proposal.rows[0]) return res.status(404).json({ error: "Proposal not found" });
    const result = await pool.query(
      `INSERT INTO builder_proposal_versions (proposal_id, blocks, created_by) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, JSON.stringify(proposal.rows[0].blocks), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proposal-builder/proposals/:id/versions (MUST come before /:id)
router.get("/proposals/:id/versions", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, created_at, created_by, blocks FROM builder_proposal_versions WHERE proposal_id=$1 ORDER BY created_at DESC",
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proposal-builder/proposals/:id/restore/:versionId (MUST come before /:id)
router.post("/proposals/:id/restore/:versionId", authMiddleware, async (req, res) => {
  try {
    const version = await pool.query("SELECT blocks FROM builder_proposal_versions WHERE id=$1 AND proposal_id=$2", [req.params.versionId, req.params.id]);
    if (!version.rows[0]) return res.status(404).json({ error: "Version not found" });
    const result = await pool.query(
      "UPDATE builder_proposals SET blocks=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [JSON.stringify(version.rows[0].blocks), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proposal-builder/ — list all (shorthand)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { project_id, srs_version } = req.query;
    let query = "SELECT * FROM builder_proposals WHERE 1=1";
    const params = [];
    if (project_id) { params.push(project_id); query += ` AND project_id=$${params.length}`; }
    if (srs_version) { params.push(srs_version); query += ` AND srs_version=$${params.length}`; }
    query += " ORDER BY updated_at DESC";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proposal-builder/ — create (shorthand)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { name, project_id, srs_version, template_id, blocks } = req.body;
    const result = await pool.query(
      `INSERT INTO builder_proposals (name, project_id, srs_version, template_id, blocks, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name||"New Proposal", project_id, srs_version, template_id, JSON.stringify(blocks||[]), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proposal-builder/:id — get one by ID
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM builder_proposals WHERE id=$1", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/proposal-builder/:id — update by ID
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { name, blocks, status, template_id, project_id, srs_version } = req.body;
    const result = await pool.query(
      `UPDATE builder_proposals SET name=$1, blocks=$2, status=$3, template_id=$4, project_id=$5, srs_version=$6, updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name, JSON.stringify(blocks||[]), status, template_id, project_id || null, srs_version || null, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/proposal-builder/:id — delete by ID
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM builder_proposals WHERE id=$1 RETURNING id", [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Proposal not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proposal-builder/:id/save-version
router.post("/:id/save-version", authMiddleware, async (req, res) => {
  try {
    const proposal = await pool.query("SELECT blocks FROM builder_proposals WHERE id=$1", [req.params.id]);
    if (!proposal.rows[0]) return res.status(404).json({ error: "Proposal not found" });
    const result = await pool.query(
      `INSERT INTO builder_proposal_versions (proposal_id, blocks, created_by) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, JSON.stringify(proposal.rows[0].blocks), req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/proposal-builder/:id/versions
router.get("/:id/versions", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, created_at, created_by, blocks FROM builder_proposal_versions WHERE proposal_id=$1 ORDER BY created_at DESC",
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/proposal-builder/:id/restore/:versionId
router.post("/:id/restore/:versionId", authMiddleware, async (req, res) => {
  try {
    const version = await pool.query("SELECT blocks FROM builder_proposal_versions WHERE id=$1 AND proposal_id=$2", [req.params.versionId, req.params.id]);
    if (!version.rows[0]) return res.status(404).json({ error: "Version not found" });
    const result = await pool.query(
      "UPDATE builder_proposals SET blocks=$1, updated_at=NOW() WHERE id=$2 RETURNING *",
      [JSON.stringify(version.rows[0].blocks), req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
