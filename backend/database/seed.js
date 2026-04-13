require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function seed() {
  const client = await pool.connect();
  try {
    // Check if super admin already exists
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      ['diyaa@5ostudios.com']
    );
    
    if (existing.rows.length > 0) {
      console.log('Super admin already exists. Skipping seed.');
      return;
    }
    
    const passwordHash = await bcrypt.hash('Admin2026!', 12);
    
    await client.query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5)`,
      ['Diyaa', 'diyaa@5ostudios.com', passwordHash, 'super_admin', true]
    );
    
    console.log('✅ Super admin created: diyaa@5ostudios.com / Admin2026!');
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
