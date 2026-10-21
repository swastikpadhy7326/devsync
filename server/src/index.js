require('dotenv').config({ quiet: true });
const http = require('http');
const app = require('./app');
const { initRealtime, attachRedisAdapter } = require('./realtime');

const server = http.createServer(app);

async function start() {
  initRealtime(server);
  await attachRedisAdapter();

  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();