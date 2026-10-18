require('dotenv').config({ quiet: true });
const { Pool, types } = require('pg');

// Keep DATE columns as plain 'YYYY-MM-DD' strings (no timezone shifting)
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 15000,
});

// Prevents a dropped idle connection from crashing the server
pool.on('error', (err) => {
  console.error('Idle database client error:', err.message);
});

module.exports = pool;