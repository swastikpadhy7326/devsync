// Adds work item types and issue keys to an existing database.
// Usage:  node scripts/add-task-types-and-keys.js .env          (shows the target, changes nothing)
//         node scripts/add-task-types-and-keys.js .env --yes    (runs the migration)
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const envFile = args.find((a) => !a.startsWith('--')) || '.env';
require('dotenv').config({ path: path.resolve(__dirname, '..', envFile), quiet: true });
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL was not found in', envFile);
  process.exit(1);
}

const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'task-types-and-keys.sql'), 'utf8');

(async () => {
  console.log('Target host:', new URL(url).hostname);
  if (!args.includes('--yes')) {
    console.log('Nothing was changed. Check the host above, then add --yes to run the migration.');
    return;
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');

    const counts = await client.query('SELECT count(*)::int AS tasks, count(number)::int AS numbered FROM tasks');
    console.log(`Done. ${counts.rows[0].numbered} of ${counts.rows[0].tasks} tasks have a number.`);
    const sample = await client.query(
      `SELECT p.key_prefix || '-' || t.number AS key, t.type, t.title
       FROM tasks t JOIN projects p ON p.id = t.project_id
       ORDER BY p.created_at, t.number LIMIT 5`
    );
    sample.rows.forEach((r) => console.log(' ', r.key, `[${r.type}]`, r.title));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed, nothing was changed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();