const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const authMiddleware = require('../middleware/auth');
const superAdmin = require('../middleware/superAdmin');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// All user management routes require super_admin
router.use(authMiddleware, superAdmin);

// GET /users
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, is_active, last_login, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /users
router.post('/', async (req, res) => {
  const { name, email, password, role, is_active } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password required' });
  }
  
  const validRoles = ['admin', 'super_admin'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  
  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, role, is_active, created_at`,
      [name, email.toLowerCase().trim(), passwordHash, role || 'admin', is_active !== undefined ? is_active : true]
    );
    
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /users/:id
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, is_active } = req.body;
  
  try {
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = existing.rows[0];

    // Prevent self-deactivation via PUT
    if (parseInt(id) === req.user.id && is_active === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    // Protect super_admin deactivation via PUT — only if 2+ super admins exist
    if (user.role === 'super_admin' && is_active === false) {
      const superAdminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND is_active = true");
      if (parseInt(superAdminCount.rows[0].count) < 2) {
        return res.status(403).json({ error: 'Cannot deactivate the only Super Admin. Add another Super Admin first.' });
      }
    }

    // If changing email, check uniqueness
    if (email && email.toLowerCase().trim() !== user.email) {
      const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase().trim(), id]);
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ error: 'Email already in use' });
      }
    }
    
    const result = await pool.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        is_active = COALESCE($3, is_active),
        updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, email, role, is_active, created_at, updated_at`,
      [name || null, email ? email.toLowerCase().trim() : null, is_active !== undefined ? is_active : null, id]
    );
    
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /users/:id/deactivate
router.post('/:id/deactivate', async (req, res) => {
  const { id } = req.params;

  // Prevent deactivating own account
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  // Protect super_admin accounts — only allowed if 2+ super admins exist
  try {
    const target = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (target.rows[0].role === 'super_admin') {
      const superAdminCount = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND is_active = true");
      if (parseInt(superAdminCount.rows[0].count) < 2) {
        return res.status(403).json({ error: 'Cannot deactivate the only Super Admin. Add another Super Admin first.' });
      }
    }
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  
  try {
    const result = await pool.query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deactivated successfully' });
  } catch (err) {
    console.error('Deactivate user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /users/:id/reset-password
router.post('/:id/reset-password', async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  
  try {
    const user = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $2',
      [newHash, id]
    );
    
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /users/:id — hard delete single user
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const targetId = parseInt(id);

  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account.' });
  }

  try {
    const target = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    if (target.rows[0].role === 'super_admin') {
      const count = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'");
      if (parseInt(count.rows[0].count) < 2) {
        return res.status(403).json({ error: 'Cannot delete the only Super Admin.' });
      }
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /users/bulk — bulk delete
router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array required' });
  }

  // Cannot delete own account
  if (ids.includes(req.user.id)) {
    return res.status(400).json({ error: 'Cannot delete your own account.' });
  }

  try {
    // Protect sole super admin
    const targets = await pool.query('SELECT id, role FROM users WHERE id = ANY($1)', [ids]);
    const superAdminsToDelete = targets.rows.filter(u => u.role === 'super_admin').length;
    if (superAdminsToDelete > 0) {
      const totalSuperAdmins = await pool.query("SELECT COUNT(*) FROM users WHERE role = 'super_admin'");
      const remaining = parseInt(totalSuperAdmins.rows[0].count) - superAdminsToDelete;
      if (remaining < 1) {
        return res.status(403).json({ error: 'Cannot delete all Super Admins. At least one must remain.' });
      }
    }

    const result = await pool.query('DELETE FROM users WHERE id = ANY($1) RETURNING id', [ids]);
    res.json({ message: `${result.rowCount} user(s) deleted`, deleted: result.rows.map(r => r.id) });
  } catch (err) {
    console.error('Bulk delete users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
