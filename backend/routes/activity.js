const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const authMiddleware = require('../middleware/auth');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// GET /activity
router.get('/', authMiddleware, async (req, res) => {
  const { user_id, action, from, to } = req.query;
  
  try {
    let baseQuery = `
      SELECT al.*, u.name as user_name, p.name as project_name
      FROM activity_log al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN projects p ON al.project_id = p.id
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;
    
    // Admin can only see their own activity
    if (req.user.role !== 'super_admin') {
      baseQuery += ` AND al.user_id = $${paramIdx++}`;
      params.push(req.user.id);
    } else if (user_id) {
      baseQuery += ` AND al.user_id = $${paramIdx++}`;
      params.push(parseInt(user_id));
    }
    
    if (action) {
      baseQuery += ` AND al.action ILIKE $${paramIdx++}`;
      params.push(`%${action}%`);
    }
    
    if (from) {
      baseQuery += ` AND al.created_at >= $${paramIdx++}`;
      params.push(new Date(from).toISOString());
    }
    
    if (to) {
      baseQuery += ` AND al.created_at <= $${paramIdx++}`;
      params.push(new Date(to).toISOString());
    }
    
    baseQuery += ' ORDER BY al.created_at DESC LIMIT 500';
    
    const result = await pool.query(baseQuery, params);
    res.json({ logs: result.rows });
  } catch (err) {
    console.error('Get activity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /activity/clear — super_admin only, clears logs with optional filters
router.delete('/clear', authMiddleware, async (req, res) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin only.' });
  }

  const { user_id, action, from, to } = req.query;

  try {
    let query = 'DELETE FROM activity_log WHERE 1=1';
    const params = [];
    let idx = 1;

    if (user_id) { query += ` AND user_id = $${idx++}`; params.push(parseInt(user_id)); }
    if (action && action !== 'all') { query += ` AND action ILIKE $${idx++}`; params.push(`%${action}%`); }
    if (from) { query += ` AND created_at >= $${idx++}`; params.push(new Date(from).toISOString()); }
    if (to) { query += ` AND created_at <= $${idx++}`; params.push(new Date(to).toISOString()); }

    query += ' RETURNING id';
    const result = await pool.query(query, params);
    res.json({ message: `${result.rowCount} log(s) cleared`, count: result.rowCount });
  } catch (err) {
    console.error('Clear activity error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
