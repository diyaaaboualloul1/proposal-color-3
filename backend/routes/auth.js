const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const authMiddleware = require('../middleware/auth');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Check if account is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Account deactivated' });
    }
    
    // Check lockout
    if (user.failed_attempts >= 5 && user.locked_until && new Date(user.locked_until) > new Date()) {
      const remaining = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        error: `Account locked. Try again in ${remaining} minute(s)`,
        locked_until: user.locked_until
      });
    }
    
    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    
    if (!valid) {
      // Increment failed attempts
      let newAttempts = user.failed_attempts + 1;
      let lockQuery = 'UPDATE users SET failed_attempts = $1, updated_at = NOW() WHERE id = $2';
      let lockParams = [newAttempts, user.id];
      
      if (newAttempts >= 5) {
        const lockUntil = new Date(Date.now() + (parseInt(process.env.LOGIN_LOCKOUT_MINUTES) || 15) * 60000);
        lockQuery = 'UPDATE users SET failed_attempts = $1, locked_until = $2, updated_at = NOW() WHERE id = $3';
        lockParams = [newAttempts, lockUntil.toISOString(), user.id];
      }
      
      await pool.query(lockQuery, lockParams);
      
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Success — reset failed attempts, update last_login
    await pool.query(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = NOW(), updated_at = NOW() WHERE id = $1',
      [user.id]
    );
    
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h', algorithm: 'HS256' }
    );
    
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /auth/verify
router.get('/verify', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// PUT /auth/password
router.put('/password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password required' });
  }
  
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const user = result.rows[0];
    
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newHash, req.user.id]
    );
    
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /auth/logout
router.post('/logout', authMiddleware, (req, res) => {
  // JWT is stateless; client should discard token
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
