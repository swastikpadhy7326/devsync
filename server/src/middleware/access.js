const pool = require('../db');
const { isUuid } = require('../utils/uuid');

// Loads the project and checks the user belongs to its team
const requireProjectAccess = (...allowed) => async (req, res, next) => {
  const { projectId } = req.params;
  if (!isUuid(projectId)) return res.status(400).json({ message: 'Invalid project id' });

  const { rows } = await pool.query(
    `SELECT p.id, p.team_id, p.name, p.is_archived, tm.role
     FROM projects p
     JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = $2
     WHERE p.id = $1`,
    [projectId, req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ message: 'Project not found' });
  if (allowed.length > 0 && !allowed.includes(rows[0].role)) {
    return res.status(403).json({ message: 'You do not have permission to do this' });
  }

  req.project = rows[0];
  req.teamRole = rows[0].role;
  next();
};

// Loads the task and checks the user belongs to its project's team
const requireTaskAccess = () => async (req, res, next) => {
  const { taskId } = req.params;
  if (!isUuid(taskId)) return res.status(400).json({ message: 'Invalid task id' });

  const { rows } = await pool.query(
    `SELECT t.id, t.project_id, t.status, t.position, t.created_by,
            p.team_id, p.is_archived, tm.role
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = $2
     WHERE t.id = $1`,
    [taskId, req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ message: 'Task not found' });

  req.task = rows[0];
  req.teamRole = rows[0].role;
  next();
};

module.exports = { requireProjectAccess, requireTaskAccess };