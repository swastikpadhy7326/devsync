const path = require('path');
const dotenv = require('dotenv');

// Loads server/.env.test. Variables that are already set (for example by
// GitHub Actions) are NOT overwritten, so CI settings always win.
module.exports = function loadEnv() {
  process.env.NODE_ENV = 'test';
  dotenv.config({ path: path.join(__dirname, '..', '.env.test'), quiet: true });
};
