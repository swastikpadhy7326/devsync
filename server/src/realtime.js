const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const pool = require('./db');
const { isUuid } = require('./utils/uuid');

let io = null;

// projectId -> Map(userId -> { name, sockets: Set of socket ids })
// A user with two browser tabs still counts as one person online.
const presence = new Map();

const room = (projectId) => `project:${projectId}`;

function onlineUsers(projectId) {
  const users = presence.get(projectId);
  if (!users) return [];
  return [...users.entries()].map(([id, u]) => ({ id, name: u.name }));
}

function addPresence(projectId, user, socketId) {
  if (!presence.has(projectId)) presence.set(projectId, new Map());
  const users = presence.get(projectId);
  if (!users.has(user.id)) users.set(user.id, { name: user.name, sockets: new Set() });
  users.get(user.id).sockets.add(socketId);
}

function removePresence(projectId, userId, socketId) {
  const users = presence.get(projectId);
  if (!users || !users.has(userId)) return;
  const entry = users.get(userId);
  entry.sockets.delete(socketId);
  if (entry.sockets.size === 0) users.delete(userId);
  if (users.size === 0) presence.delete(projectId);
}

function broadcastPresence(projectId) {
  io.to(room(projectId)).emit('presence:update', { projectId, users: onlineUsers(projectId) });
}

function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN || '*' },
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
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.joinedProjects = new Set();

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
        addPresence(projectId, socket.user, socket.id);
        broadcastPresence(projectId);

        reply({ ok: true, online: onlineUsers(projectId) });
      } catch (err) {
        console.error(err);
        reply({ ok: false, message: 'Something went wrong' });
      }
    });

    socket.on('project:leave', async (projectId) => {
      if (!socket.joinedProjects.has(projectId)) return;
      await socket.leave(room(projectId));
      socket.joinedProjects.delete(projectId);
      removePresence(projectId, socket.user.id, socket.id);
      broadcastPresence(projectId);
    });

    socket.on('disconnect', () => {
      for (const projectId of socket.joinedProjects) {
        removePresence(projectId, socket.user.id, socket.id);
        broadcastPresence(projectId);
      }
    });
  });

  return io;
}

// Called from the REST controllers after a change is saved
function emitToProject(projectId, event, payload) {
  if (!io) return;
  io.to(room(projectId)).emit(event, payload);
}

module.exports = { initRealtime, emitToProject };