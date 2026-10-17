const pool = require('../db');

exports.createProject = async (req, res) => {
  const { name, description } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO projects (team_id, name, description, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id, team_id, name, description, is_archived, created_at`,
    [req.params.teamId, name, description ?? null, req.user.id]
  );
  res.status(201).json({ project: rows[0] });
};

exports.listProjects = async (req, res) => {
  const archived = req.query.archived === 'true';
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.description, p.is_archived, p.created_at,
            (SELECT count(*)::int FROM tasks WHERE project_id = p.id) AS task_count,
            (SELECT count(*)::int FROM tasks WHERE project_id = p.id AND status = 'done') AS done_count
     FROM projects p
     WHERE p.team_id = $1 AND p.is_archived = $2
     ORDER BY p.created_at DESC`,
    [req.params.teamId, archived]
  );
  res.json({ projects: rows });
};

exports.getProject = async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, team_id, name, description, is_archived, created_at FROM projects WHERE id = $1',
    [req.project.id]
  );
  res.json({ project: rows[0], yourRole: req.teamRole });
};

exports.updateProject = async (req, res) => {
  const { name, description, isArchived } = req.body;
  const { rows } = await pool.query(
    `UPDATE projects SET
       name = COALESCE($1, name),
       description = CASE WHEN $2::boolean THEN $3::text ELSE description END,
       is_archived = COALESCE($4, is_archived)
     WHERE id = $5
     RETURNING id, team_id, name, description, is_archived, created_at`,
    [name ?? null, description !== undefined, description ?? null, isArchived ?? null, req.project.id]
  );
  res.json({ project: rows[0] });
};