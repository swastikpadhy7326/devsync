const pool = require('../db');
const { emitToUser } = require('../realtime');

async function userName(id) {
  const { rows } = await pool.query('SELECT name FROM users WHERE id = $1', [id]);
  return rows[0] ? rows[0].name : 'Someone';
}

async function createNotification({ userId, type, taskId, projectId, message }) {
  const { rows } = await pool.query(
    `INSERT INTO notifications (user_id, type, task_id, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id, type, message, is_read, created_at, task_id`,
    [userId, type, taskId, message]
  );
  const notification = { ...rows[0], project_id: projectId };
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

async function notifyCommentAdded({ taskId, actorId }) {
  try {
    const { rows } = await pool.query(
      'SELECT id, project_id, title, assignee_id, created_by FROM tasks WHERE id = $1',
      [taskId]
    );
    const task = rows[0];
    if (!task) return;

    const recipients = new Set([task.assignee_id, task.created_by].filter(Boolean));
    recipients.delete(actorId);
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

module.exports = { notifyTaskAssigned, notifyCommentAdded };