const { Pool } = require('pg');
require('dotenv').config();

async function fix() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash('Admin123!', 12);
  console.log('New hash:', hash);

  const result = await pool.query(
    "UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL, is_active = true WHERE email = $2 RETURNING email, role",
    [hash, 'diyaa@5ostudios.com']
  );
  console.log('Updated:', result.rows);
  await pool.end();
}

fix().catch(console.error);