const pool = require('../db');
const { emitToUser } = require('../realtime');
const { findMentionedUserIds } = require('./mentions');
async function userName(id) {
  const { rows } = await pool.query('SELECT name FROM users WHERE id = $1', [id]);
  return rows[0] ? rows[0].name : 'Someone';
}

async function createNotification({ userId, type, taskId = null, projectId, message }) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, task_id, project_id, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, type, message, is_read, created_at, task_id, project_id`,
    [userId, type, taskId, projectId, message]
  );
  const notification = rows[0];
  emitToUser(userId, 'notification:new', { notification });
  return notification;
}

// A failed notification must never break the request that triggered it
async function notifyTaskAssigned({ task, actorId }) {
  try {
    if (!task.assignee_id || task.assignee_id === actorId) return;
    const actor = await userName(actorId);
    await createNotification({
      userId: task.assignee_id,
      type: 'task_assigned',
      taskId: task.id,
      projectId: task.project_id,
      message: `${actor} assigned you "${task.title}"`,
    });
  } catch (err) {
    console.error('Notification error:', err.message);
  }
}

async function notifyCommentAdded({ taskId, actorId, excludeUserIds = [] }) {
  try {
    const { rows } = await pool.query(
      'SELECT id, project_id, title, assignee_id, created_by FROM tasks WHERE id = $1',
      [taskId]
    );
    const task = rows[0];
    if (!task) return;

    const recipients = new Set([task.assignee_id, task.created_by].filter(Boolean));
    recipients.delete(actorId);
    for (const id of excludeUserIds) recipients.delete(id);
    if (recipients.size === 0) return;

    const actor = await userName(actorId);
    for (const userId of recipients) {
      await createNotification({
        userId,
        type: 'comment_added',
        taskId: task.id,
        projectId: task.project_id,
        message: `${actor} commented on "${task.title}"`,
      });
    }
  } catch (err) {
    console.error('Notification error:', err.message);
  }
}

// Notifies team members named with @ in a comment (taskId given) or a chat message (no taskId).
// Returns the ids it notified, so a comment does not also send the usual "commented" alert.
async function notifyMentions({ text, authorId, projectId, taskId = null }) {
  try {
    if (!text || !text.includes('@')) return [];

    const { rows: members } = await pool.query(
      `SELECT u.id, u.name
       FROM projects p
       JOIN team_members tm ON tm.team_id = p.team_id
       JOIN users u ON u.id = tm.user_id
       WHERE p.id = $1`,
      [projectId]
    );

    const mentioned = findMentionedUserIds(text, members, authorId);
        
    if (mentioned.length === 0) return [];

    const actor = await userName(authorId);
    let message = `${actor} mentioned you in the project chat`;
    if (taskId) {
      const t = await pool.query('SELECT title FROM tasks WHERE id = $1', [taskId]);
      message = `${actor} mentioned you in a comment on "${t.rows[0] ? t.rows[0].title : 'a task'}"`;
    }

    for (const userId of mentioned) {
      await createNotification({ userId, type: 'mentioned', taskId, projectId, message });
    }
    return mentioned;
  } catch (err) {
    console.error('Notification error:', err.message);
    return [];
  }
}
module.exports = { notifyTaskAssigned, notifyCommentAdded, notifyMentions };