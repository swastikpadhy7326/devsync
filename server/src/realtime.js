
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const pool = require('./db');
const { isUuid } = require('./utils/uuid');
const { clientOrigins } = require('./config');
 
let io = null;
 
const room = (projectId) => `project:${projectId}`;
const userRoom = (userId) => `user:${userId}`;
 
// Asks Socket.IO who is in the room. Works across servers with the Redis adapter.
// A user with two tabs still counts once.
async function onlineUsers(projectId) {
  const sockets = await io.in(room(projectId)).fetchSockets();
  const seen = new Map();
  for (const s of sockets) {
    if (s.data && s.data.user) seen.set(s.data.user.id, s.data.user.name);
  }
  return [...seen.entries()].map(([id, name]) => ({ id, name }));
}
 
async function broadcastPresence(projectId) {
  try {
    const users = await onlineUsers(projectId);
    io.to(room(projectId)).emit('presence:update', { projectId, users });
  } catch (err) {
    console.error('Presence broadcast failed:', err.message);
  }
}
 
function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: clientOrigins.length ? clientOrigins : true },
  });
 
  // Runs once per connection: only logged-in users get in
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
 
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await pool.query('SELECT id, name FROM users WHERE id = $1', [payload.sub]);
      if (rows.length === 0) return next(new Error('User not found'));
 
      socket.user = rows[0];
      socket.data.user = rows[0];
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });
 
  io.on('connection', (socket) => {
    socket.joinedProjects = new Set();
 
    // Private room: personal notifications go only here
    socket.join(userRoom(socket.user.id));
 
    socket.on('project:join', async (projectId, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (!isUuid(projectId)) return reply({ ok: false, message: 'Invalid project id' });
 
        // Same rule as the REST API: you must belong to the project's team
        const { rowCount } = await pool.query(
          `SELECT 1 FROM projects p
           JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = $2
           WHERE p.id = $1`,
          [projectId, socket.user.id]
        );
        if (rowCount === 0) return reply({ ok: false, message: 'Project not found' });
 
        await socket.join(room(projectId));
        socket.joinedProjects.add(projectId);
        await broadcastPresence(projectId);
 
        reply({ ok: true, online: await onlineUsers(projectId) });
      } catch (err) {
        console.error(err);
        reply({ ok: false, message: 'Something went wrong' });
      }
    });
 
    socket.on('project:leave', async (projectId) => {
      if (!socket.joinedProjects.has(projectId)) return;
      await socket.leave(room(projectId));
      socket.joinedProjects.delete(projectId);
      await broadcastPresence(projectId);
    });
 
    // "disconnecting" (not "disconnect"): the socket is still in its rooms here,
    // so we exclude it ourselves when building the online list.
    socket.on('disconnecting', () => {
      for (const projectId of socket.joinedProjects) {
        io.in(room(projectId))
          .fetchSockets()
          .then((sockets) => {
            const seen = new Map();
            for (const s of sockets) {
              if (s.id !== socket.id && s.data && s.data.user) {
                seen.set(s.data.user.id, s.data.user.name);
              }
            }
            io.to(room(projectId)).emit('presence:update', {
              projectId,
              users: [...seen.entries()].map(([id, name]) => ({ id, name })),
            });
          })
          .catch((err) => console.error('Presence update failed:', err.message));
      }
    });
  });
 
  return io;
}
 
// Turns on the Redis adapter only when REDIS_URL is set.
// Without it, Socket.IO works in memory exactly as before.
async function attachRedisAdapter() {
  const url = process.env.REDIS_URL;
  if (!url || !io) return;
 
  const pubClient = createClient({ url });
  const subClient = pubClient.duplicate();
  pubClient.on('error', (err) => console.error('Redis pub error:', err.message));
  subClient.on('error', (err) => console.error('Redis sub error:', err.message));
 
  const connected = Promise.all([pubClient.connect(), subClient.connect()]);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Redis connection timed out')), 10000)
  );
 
  try {
    await Promise.race([connected, timeout]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Socket.IO Redis adapter enabled');
  } catch (err) {
    console.error('Redis adapter NOT enabled, using in-memory mode:', err.message);
  }
}
 
// Called from the REST controllers after a change is saved
function emitToProject(projectId, event, payload) {
  if (!io) return;
  io.to(room(projectId)).emit(event, payload);
}
 
// Sends an event only to one user's private room
function emitToUser(userId, event, payload) {
  if (!io) return;
  io.to(userRoom(userId)).emit(event, payload);
}
 
module.exports = { initRealtime, attachRedisAdapter, emitToProject, emitToUser };
 

