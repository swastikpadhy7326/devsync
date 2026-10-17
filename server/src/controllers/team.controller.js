const crypto = require('crypto');
const pool = require('../db');
const { hashToken } = require('../utils/tokens');
const { isUuid } = require('../utils/uuid');

// Creates the team and makes the creator its owner, in one transaction
exports.createTeam = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO teams (name, created_by) VALUES ($1, $2) RETURNING id, name, created_at',
      [req.body.name, req.user.id]
    );
    const team = rows[0];
    await client.query(
      "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')",
      [team.id, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ team: { ...team, role: 'owner' } });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.listMyTeams = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT t.id, t.name, t.created_at, tm.role,
            (SELECT count(*)::int FROM team_members WHERE team_id = t.id) AS member_count
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     WHERE tm.user_id = $1
     ORDER BY t.created_at DESC`,
    [req.user.id]
  );
  res.json({ teams: rows });
};

exports.getTeam = async (req, res) => {
  const { teamId } = req.params;

  const team = await pool.query('SELECT id, name, created_at FROM teams WHERE id = $1', [teamId]);
  const members = await pool.query(
    `SELECT u.id, u.name, u.email, tm.role, tm.joined_at
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.joined_at`,
    [teamId]
  );

  res.json({ team: team.rows[0], yourRole: req.teamRole, members: members.rows });
};

exports.inviteMember = async (req, res) => {
  const { teamId } = req.params;
  const { email, role } = req.body;

  if (role === 'admin' && req.teamRole !== 'owner') {
    return res.status(403).json({ message: 'Only the owner can invite admins' });
  }

  const already = await pool.query(
    `SELECT 1 FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1 AND u.email = $2`,
    [teamId, email]
  );
  if (already.rowCount > 0) {
    return res.status(409).json({ message: 'This person is already in the team' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO invitations (team_id, email, role, token_hash, invited_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, role, expires_at`,
    [teamId, email, role, hashToken(token), req.user.id, expiresAt]
  );

  // For now the token is returned so you can test. Later you would email it instead.
  res.status(201).json({ invitation: rows[0], inviteToken: token });
};

exports.acceptInvitation = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, team_id, role FROM invitations
       WHERE token_hash = $1 AND email = $2
         AND accepted_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [hashToken(req.body.token), req.user.email]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invitation is invalid, expired, or already used' });
    }

    const invite = rows[0];
    await client.query(
      `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [invite.team_id, req.user.id, invite.role]
    );
    await client.query('UPDATE invitations SET accepted_at = now() WHERE id = $1', [invite.id]);

    await client.query('COMMIT');
    res.json({ message: 'You joined the team', teamId: invite.team_id, role: invite.role });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Owner only
exports.updateMemberRole = async (req, res) => {
  const { teamId, userId } = req.params;
  if (!isUuid(userId)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  const { rows } = await pool.query(
    `UPDATE team_members SET role = $1
     WHERE team_id = $2 AND user_id = $3 AND role <> 'owner'
     RETURNING user_id, role`,
    [req.body.role, teamId, userId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: 'Member not found (the owner role cannot be changed)' });
  }
  res.json({ member: rows[0] });
};

// Owner/admin can remove people below them. Any non-owner member can remove themselves.
exports.removeMember = async (req, res) => {
  const { teamId, userId } = req.params;
  if (!isUuid(userId)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  const target = await pool.query(
    'SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  if (target.rows.length === 0) {
    return res.status(404).json({ message: 'Member not found' });
  }

  const targetRole = target.rows[0].role;
  const isSelf = userId === req.user.id;

  if (targetRole === 'owner') {
    return res.status(400).json({ message: 'The owner cannot be removed' });
  }

  if (!isSelf) {
    const myRole = req.teamRole;
    const allowed = myRole === 'owner' || (myRole === 'admin' && targetRole === 'member');
    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to remove this member' });
    }
  }

  await pool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
  res.json({ message: isSelf ? 'You left the team' : 'Member removed' });
};