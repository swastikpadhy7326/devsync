const pool = require('../db');
const { isUuid } = require('../utils/uuid');

// Loads the sprint and checks the user belongs to its project's team
const requireSprintAccess = (...allowed) => async (req, res, next) => {
  const { sprintId } = req.params;
  if (!isUuid(sprintId)) return res.status(400).json({ message: 'Invalid sprint id' });

  const { rows } = await pool.query(
    `SELECT s.id, s.project_id, s.name, s.status, p.team_id, p.is_archived, tm.role
     FROM sprints s
     JOIN projects p ON p.id = s.project_id
     JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = $2
     WHERE s.id = $1`,
    [sprintId, req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ message: 'Sprint not found' });
  if (allowed.length > 0 && !allowed.includes(rows[0].role)) {
    return res.status(403).json({ message: 'You do not have permission to do this' });
  }

  req.sprint = rows[0];
  req.teamRole = rows[0].role;
  next();
};

module.exports = { requireSprintAccess };