// Usage: node scripts/socket-test.js <email> <password> <projectId>
const { io } = require('socket.io-client');

const BASE = 'http://localhost:5000';
const [email, password, projectId] = process.argv.slice(2);

if (!email || !password || !projectId) {
  console.log('Usage: node scripts/socket-test.js <email> <password> <projectId>');
  process.exit(1);
}

async function main() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.log('Login failed:', data.message);
    process.exit(1);
  }

  const socket = io(BASE, { auth: { token: data.accessToken } });

  socket.on('connect', () => {
    console.log(`Connected as ${email}`);
    socket.emit('project:join', projectId, (reply) => console.log('Join result:', reply));
  });

  socket.on('connect_error', (err) => console.log('Connection error:', err.message));

  const events = [
    'presence:update', 'task:created', 'task:updated', 'task:moved',
    'task:deleted', 'comment:added', 'comment:deleted',
  ];
  for (const event of events) {
    socket.on(event, (payload) => console.log(`[${event}]`, JSON.stringify(payload)));
  }
}

main();