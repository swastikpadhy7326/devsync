// Runs a SQL file against a database, in one transaction.
// Usage:  node scripts/apply-sql.js db/<file>.sql [.env]          (shows the target, changes nothing)
//         node scripts/apply-sql.js db/<file>.sql [.env] --yes    (runs it)
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith('--'));
const sqlFile = positional[0];
const envFile = positional[1] || '.env';

if (!sqlFile) {
  console.error('Usage: node scripts/apply-sql.js db/<file>.sql [.env] [--yes]');
  process.exit(1);
}

require('dotenv').config({ path: path.resolve(__dirname, '..', envFile), quiet: true });
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL was not found in', envFile);
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(__dirname, '..', sqlFile), 'utf8');

(async () => {
  console.log('Target host:', new URL(url).hostname);
  console.log('SQL file:', sqlFile);
  if (!args.includes('--yes')) {
    console.log('Nothing was changed. Check the host above, then add --yes to run it.');
    return;
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Done.');

    const check = await client.query(
      "SELECT count(*) FILTER (WHERE status = 'done')::int AS done, count(completed_at)::int AS stamped FROM tasks"
    );
    console.log(`Finished tasks: ${check.rows[0].done}, with a completion time: ${check.rows[0].stamped}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed, nothing was changed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();