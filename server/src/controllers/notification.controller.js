const pool = require('../db');
const { isUuid } = require('../utils/uuid');

exports.listNotifications = async (req, res) => {
  const { unread, page, limit } = req.validatedQuery;

  const where = unread ? 'n.user_id = $1 AND n.is_read = FALSE' : 'n.user_id = $1';

  const { rows } = await pool.query(
    `SELECT n.id, n.type, n.message, n.is_read, n.created_at, n.task_id, t.project_id
     FROM notifications n
     LEFT JOIN tasks t ON t.id = n.task_id
     WHERE ${where}
     ORDER BY n.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.user.id, limit, (page - 1) * limit]
  );

  const count = await pool.query(
    'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND is_read = FALSE',
    [req.user.id]
  );

  res.json({ notifications: rows, unreadCount: count.rows[0].n, page, limit });
};

exports.markRead = async (req, res) => {
  const { notificationId } = req.params;
  if (!isUuid(notificationId)) return res.status(400).json({ message: 'Invalid notification id' });

  const { rowCount } = await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
    [notificationId, req.user.id]
  );
  if (rowCount === 0) return res.status(404).json({ message: 'Notification not found' });

  res.json({ message: 'Marked as read' });
};

exports.markAllRead = async (req, res) => {
  const { rowCount } = await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
    [req.user.id]
  );
  res.json({ message: 'All notifications marked as read', updated: rowCount });
};