const pool = require('../db');
const { emitToProject } = require('../realtime');

// A simple per-person limit: 30 messages per minute (kept in memory)
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;
const sent = new Map();

function allow(userId) {
  const now = Date.now();
  const recent = (sent.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    sent.set(userId, recent);
    return false;
  }
  recent.push(now);
  sent.set(userId, recent);
  return true;
}

// Newest messages first from the database, returned oldest first for display
exports.listMessages = async (req, res) => {
  const { limit, before } = req.validatedQuery;

  const params = [req.project.id, limit];
  let where = 'm.project_id = $1';
  if (before) {
    params.push(before);
    where += ' AND m.created_at < $3';
  }

  const { rows } = await pool.query(
    `SELECT m.id, m.project_id, m.user_id, u.name AS user_name, m.body, m.created_at
     FROM chat_messages m
     JOIN users u ON u.id = m.user_id
     WHERE ${where}
     ORDER BY m.created_at DESC
     LIMIT $2`,
    params
  );

  const hasMore = rows.length === limit;
  res.json({ messages: rows.reverse(), hasMore });
};

exports.sendMessage = async (req, res) => {
  if (req.project.is_archived) {
    return res.status(400).json({ message: 'This project is archived' });
  }
  if (!allow(req.user.id)) {
    return res.status(429).json({ message: 'You are sending messages too fast. Wait a moment.' });
  }

  const { rows } = await pool.query(
    `INSERT INTO chat_messages (project_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, project_id, user_id, body, created_at`,
    [req.project.id, req.user.id, req.body.body]
  );
  const user = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);

  const message = { ...rows[0], user_name: user.rows[0].name };
  emitToProject(req.project.id, 'chat:message', { message });
  res.status(201).json({ message });
};