const pool = require('../db');
const { isUuid } = require('../utils/uuid');

// Usage: requireTeamRole()                  -> any member
//        requireTeamRole('owner', 'admin')  -> only these roles
const requireTeamRole = (...allowed) => async (req, res, next) => {
  const { teamId } = req.params;
  if (!isUuid(teamId)) {
    return res.status(400).json({ message: 'Invalid team id' });
  }

  const { rows } = await pool.query(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, req.user.id]
  );

  // Not a member: pretend the team doesn't exist
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Team not found' });
  }
  if (allowed.length > 0 && !allowed.includes(rows[0].role)) {
    return res.status(403).json({ message: 'You do not have permission to do this' });
  }

  req.teamRole = rows[0].role;
  next();
};

module.exports = { requireTeamRole };