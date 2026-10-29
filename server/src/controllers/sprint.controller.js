const pool = require('../db');
const { emitToProject } = require('../realtime');

const SPRINT_COLUMNS = 'id, project_id, name, goal, status, start_date, end_date, started_at, completed_at, created_at';

const archived = (res) => res.status(400).json({ message: 'This project is archived' });
const changed = (projectId, sprintId) => emitToProject(projectId, 'sprint:changed', { sprintId });

// Active sprint first, then planned ones, then finished ones, each in creation order
exports.listSprints = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.project_id, s.name, s.goal, s.status, s.start_date, s.end_date,
            s.started_at, s.completed_at, s.created_at,
            count(t.id)::int AS total,
            count(t.id) FILTER (WHERE t.status = 'done')::int AS done
     FROM sprints s
     LEFT JOIN tasks t ON t.sprint_id = s.id
     WHERE s.project_id = $1
     GROUP BY s.id
     ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END, s.created_at`,
    [req.project.id]
  );
    res.json({ sprints: rows, yourRole: req.project.role });
};

exports.createSprint = async (req, res) => {
  if (req.project.is_archived) return archived(res);
  const { name, goal, startDate, endDate } = req.body;

  const { rows } = await pool.query(
    `INSERT INTO sprints (project_id, name, goal, start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${SPRINT_COLUMNS}`,
    [req.project.id, name, goal ?? null, startDate ?? null, endDate ?? null, req.user.id]
  );

  changed(req.project.id, rows[0].id);
  res.status(201).json({ sprint: rows[0] });
};

// Column names come from this fixed map, never from user input
const FIELD_MAP = { name: 'name', goal: 'goal', startDate: 'start_date', endDate: 'end_date' };

exports.updateSprint = async (req, res) => {
  const s = req.sprint;
  if (s.is_archived) return archived(res);
  if (s.status === 'completed') {
    return res.status(400).json({ message: 'A completed sprint cannot be edited' });
  }

  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(FIELD_MAP)) {
    if (req.body[key] !== undefined) {
      values.push(req.body[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  values.push(s.id);

  try {
    const { rows } = await pool.query(
      `UPDATE sprints SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${SPRINT_COLUMNS}`,
      values
    );
    changed(s.project_id, s.id);
    res.json({ sprint: rows[0] });
  } catch (err) {
    // 23514 = the database check "end date is not before the start date"
    if (err.code === '23514') {
      return res.status(400).json({ message: 'End date must be on or after the start date' });
    }
    throw err;
  }
};

exports.startSprint = async (req, res) => {
  const s = req.sprint;
  if (s.is_archived) return archived(res);

  try {
    const { rows } = await pool.query(
      `UPDATE sprints
       SET status = 'active', started_at = now(), start_date = COALESCE(start_date, CURRENT_DATE)
       WHERE id = $1 AND status = 'planned'
       RETURNING ${SPRINT_COLUMNS}`,
      [s.id]
    );
    if (rows.length === 0) {
      return res.status(400).json({ message: 'Only a planned sprint can be started' });
    }
    changed(s.project_id, s.id);
    res.json({ sprint: rows[0] });
  } catch (err) {
    // 23505 = the one-active-sprint index, 23514 = the start date would fall after the end date
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Another sprint is already active. Complete it first.' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ message: 'The end date is before today. Edit the dates first.' });
    }
    throw err;
  }
};

// Finished work stays in the sprint as history, everything else goes back to the backlog
exports.completeSprint = async (req, res) => {
  const s = req.sprint;
  if (s.is_archived) return archived(res);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sprint = await client.query(
      `UPDATE sprints SET status = 'completed', completed_at = now()
       WHERE id = $1 AND status = 'active'
       RETURNING ${SPRINT_COLUMNS}`,
      [s.id]
    );
    if (sprint.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only an active sprint can be completed' });
    }

    const moved = await client.query("UPDATE tasks SET sprint_id = NULL WHERE sprint_id = $1 AND status <> 'done'", [s.id]);

    await client.query('COMMIT');
    changed(s.project_id, s.id);
    res.json({ sprint: sprint.rows[0], movedToBacklog: moved.rowCount });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// The tasks of a deleted sprint go back to the backlog (the database does that by itself)
exports.deleteSprint = async (req, res) => {
  const s = req.sprint;
  if (s.is_archived) return archived(res);
  if (s.status !== 'planned') {
    return res.status(400).json({ message: 'Only a planned sprint can be deleted' });
  }

  await pool.query('DELETE FROM sprints WHERE id = $1', [s.id]);
  changed(s.project_id, s.id);
  res.json({ message: 'Sprint deleted' });
};