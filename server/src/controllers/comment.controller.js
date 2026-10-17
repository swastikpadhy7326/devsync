const pool = require('../db');
const { logActivity } = require('../utils/activity');
const { isUuid } = require('../utils/uuid');
const { emitToProject } = require('../realtime');

exports.createComment = async (req, res) => {
  if (req.task.is_archived) {
    return res.status(400).json({ message: 'This project is archived' });
  }

  const { rows } = await pool.query(
    `INSERT INTO comments (task_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, task_id, user_id, body, created_at`,
    [req.task.id, req.user.id, req.body.body]
  );
  const user = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);

  await logActivity(pool, {
    projectId: req.task.project_id, userId: req.user.id, action: 'comment_added',
    entityType: 'comment', entityId: rows[0].id, metadata: { taskId: req.task.id },
  });

  const comment = { ...rows[0], user_name: user.rows[0].name };
  emitToProject(req.task.project_id, 'comment:added', { comment, by: req.user.id });
  res.status(201).json({ comment });
};

exports.listComments = async (req, res) => {
  const { page, limit } = req.validatedQuery;

  const total = await pool.query('SELECT count(*)::int AS n FROM comments WHERE task_id = $1', [
    req.task.id,
  ]);
  const { rows } = await pool.query(
    `SELECT c.id, c.task_id, c.user_id, u.name AS user_name, c.body, c.created_at
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.task_id = $1
     ORDER BY c.created_at ASC
     LIMIT $2 OFFSET $3`,
    [req.task.id, limit, (page - 1) * limit]
  );

  res.json({ comments: rows, page, limit, total: total.rows[0].n });
};

// The author can delete their own comment. Owners and admins can delete any comment.
exports.deleteComment = async (req, res) => {
  const { commentId } = req.params;
  if (!isUuid(commentId)) return res.status(400).json({ message: 'Invalid comment id' });

  const { rows } = await pool.query(
    `SELECT c.id, c.user_id, c.task_id, p.id AS project_id, tm.role
     FROM comments c
     JOIN tasks t ON t.id = c.task_id
     JOIN projects p ON p.id = t.project_id
     JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = $2
     WHERE c.id = $1`,
    [commentId, req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ message: 'Comment not found' });

  const comment = rows[0];
  if (comment.user_id !== req.user.id && comment.role === 'member') {
    return res.status(403).json({ message: 'You can only delete your own comments' });
  }

  await pool.query('DELETE FROM comments WHERE id = $1', [comment.id]);
  await logActivity(pool, {
    projectId: comment.project_id, userId: req.user.id, action: 'comment_deleted',
    entityType: 'comment', entityId: comment.id, metadata: { taskId: comment.task_id },
  });

  emitToProject(comment.project_id, 'comment:deleted', {
    commentId: comment.id, taskId: comment.task_id, by: req.user.id,
  });
  res.json({ message: 'Comment deleted' });
};