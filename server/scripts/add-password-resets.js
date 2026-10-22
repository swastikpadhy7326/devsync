const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '..', process.argv[2] || '.env'),
  quiet: true,
});
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL was not found in that env file');
  process.exit(1);
}

const pool = new Pool({ connectionString: url });

(async () => {
  console.log('Target host:', new URL(url).hostname);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)'
  );
  const { rows } = await pool.query("SELECT to_regclass('public.password_resets') AS t");
  console.log('Table check:', rows[0].t);
})()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());