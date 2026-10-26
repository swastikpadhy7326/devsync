const pool = require('../db');
const { isAiEnabled, summarizeTask } = require('../utils/ai');

// A simple per-person limit: 10 requests per hour (kept in memory)
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const usage = new Map();

function allow(userId) {
  const now = Date.now();
  const recent = (usage.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    usage.set(userId, recent);
    return false;
  }
  recent.push(now);
  usage.set(userId, recent);
  return true;
}

exports.status = (req, res) => {
  res.json({ enabled: isAiEnabled() });
};

exports.summarizeTask = async (req, res) => {
  if (!isAiEnabled()) {
    return res.status(503).json({ message: 'AI features are not configured on this server' });
  }
  if (!allow(req.user.id)) {
    return res.status(429).json({ message: 'You have reached the limit of 10 summaries per hour' });
  }

  const taskResult = await pool.query(
    'SELECT title, description, status, priority FROM tasks WHERE id = $1',
    [req.task.id]
  );
  if (taskResult.rows.length === 0) {
    return res.status(404).json({ message: 'Task not found' });
  }

  // The 40 newest comments, then put back in time order
  const commentResult = await pool.query(
    `SELECT u.name, c.body
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1
     ORDER BY c.created_at DESC
     LIMIT 40`,
    [req.task.id]
  );

  try {
    const summary = await summarizeTask({
      task: taskResult.rows[0],
      comments: commentResult.rows.reverse(),
    });
    res.json({ summary });
  } catch (err) {
    console.error('AI summary failed:', err.message);
    res.status(502).json({ message: 'The AI service is not available right now. Try again later.' });
  }
};