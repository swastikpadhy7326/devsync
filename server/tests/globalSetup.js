// Runs once before all tests: checks that we are NOT pointing at the real
// database, then rebuilds the tables from db/schema.sql.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const loadEnv = require('./loadEnv');

function sameDatabase(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.hostname === y.hostname && x.pathname === y.pathname;
  } catch {
    return false;
  }
}

module.exports = async () => {
  loadEnv();
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create server/.env.test with your TEST database (see server/README.md).'
    );
  }
  if (process.env.ALLOW_TEST_DB_RESET !== 'yes') {
    throw new Error(
      'Refusing to run: add the line ALLOW_TEST_DB_RESET=yes to server/.env.test. ' +
        'This confirms that DATABASE_URL points at a TEST database, because the tests wipe it.'
    );
  }

  // Safety check: never wipe the database from server/.env
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const real = dotenv.parse(fs.readFileSync(envPath)).DATABASE_URL;
    if (real && sameDatabase(real, url)) {
      throw new Error(
        'Refusing to run: DATABASE_URL in .env.test is the same database as in .env. ' +
          'Use your Neon "test" branch in .env.test.'
      );
    }
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
    await client.query(schema);
  } finally {
    await client.end();
  }
};
