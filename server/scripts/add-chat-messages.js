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
    CREATE TABLE IF NOT EXISTS chat_messages (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id    UUID NOT NULL REFERENCES users(id),
      body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id, created_at DESC)'
  );
  const { rows } = await pool.query("SELECT to_regclass('public.chat_messages') AS t");
  console.log('Table check:', rows[0].t);
})()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());