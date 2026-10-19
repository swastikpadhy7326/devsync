require('dotenv').config({ quiet: true });
const http = require('http');
const app = require('./app');
const { initRealtime } = require('./realtime');

const server = http.createServer(app);
initRealtime(server);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});