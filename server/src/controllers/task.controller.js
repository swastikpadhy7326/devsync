const pool = require('../db');
const { logActivity } = require('../utils/activity');
const { emitToProject } = require('../realtime');
const { notifyTaskAssigned } = require('../utils/notify');

const TASK_SELECT = `
  SELECT t.id, t.project_id, t.title, t.description, t.status, t.priority, t.type, t.position,
         t.due_date, t.created_at, t.updated_at, t.assignee_id, u.name AS assignee_name,
         t.number, p.key_prefix || '-' || t.number AS key,
         t.sprint_id, s.name AS sprint_name
  FROM tasks t
  JOIN projects p ON p.id = t.project_id
  LEFT JOIN users u ON u.id = t.assignee_id
  LEFT JOIN sprints s ON s.id = t.sprint_id`;

async function fetchTask(id) {
  const { rows } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  return rows[0];
}

async function isTeamMember(teamId, userId) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2',
    [teamId, userId]
  );
  return rowCount > 0;
}

// A task can only join a planned or active sprint of its own project
async function checkSprint(projectId, sprintId) {
  const { rows } = await pool.query('SELECT status FROM sprints WHERE id = $1 AND project_id = $2', [sprintId, projectId]);
  if (rows.length === 0) return 'Sprint not found in this project';
  if (rows[0].status === 'completed') return 'A completed sprint cannot take new tasks';
  return null;
}

const archivedResponse = (res) => res.status(400).json({ message: 'This project is archived' });

exports.createTask = async (req, res) => {
  const { title, description, status, priority, type, assigneeId, dueDate } = req.body;

  if (req.project.is_archived) return archivedResponse(res);
  if (assigneeId && !(await isTeamMember(req.project.team_id, assigneeId))) {
    return res.status(400).json({ message: 'Assignee must be a member of the team' });
  }

  // New tasks go to the bottom of their column
  const next = await pool.query(
    'SELECT COALESCE(MAX(position) + 1, 0) AS next FROM tasks WHERE project_id = $1 AND status = $2',
    [req.project.id, status]
  );

  const { rows } = await pool.query(
    `INSERT INTO tasks (project_id, title, description, status, priority, type, assignee_id, created_by, due_date, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [req.project.id, title, description ?? null, status, priority, type, assigneeId ?? null,
     req.user.id, dueDate ?? null, next.rows[0].next]
  );

  await logActivity(pool, {
    projectId: req.project.id, userId: req.user.id, action: 'task_created',
    entityType: 'task', entityId: rows[0].id, metadata: { title },
  });

  const task = await fetchTask(rows[0].id);
  emitToProject(req.project.id, 'task:created', { task, by: req.user.id });
  await notifyTaskAssigned({ task, actorId: req.user.id });
  res.status(201).json({ task });
};

exports.listTasks = async (req, res) => {
  const { status, assignee, page, limit } = req.validatedQuery;

  const conditions = ['t.project_id = $1'];
  const values = [req.project.id];
  if (status) {
    values.push(status);
    conditions.push(`t.status = $${values.length}`);
  }
  if (assignee) {
    values.push(assignee === 'me' ? req.user.id : assignee);
    conditions.push(`t.assignee_id = $${values.length}`);
  }
  const where = conditions.join(' AND ');

  const total = await pool.query(`SELECT count(*)::int AS n FROM tasks t WHERE ${where}`, values);

  values.push(limit, (page - 1) * limit);
  const { rows } = await pool.query(
    `${TASK_SELECT} WHERE ${where}
     ORDER BY t.status, t.position
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );

  res.json({ tasks: rows, page, limit, total: total.rows[0].n });
};

// Tasks grouped into Kanban columns
exports.getBoard = async (req, res) => {
  const { rows } = await pool.query(`${TASK_SELECT} WHERE t.project_id = $1 ORDER BY t.position`, [
    req.project.id,
  ]);
  const board = { todo: [], in_progress: [], done: [] };
  for (const task of rows) board[task.status].push(task);
  res.json({ project: { id: req.project.id, name: req.project.name }, board });
};

exports.getTask = async (req, res) => {
  res.json({ task: await fetchTask(req.task.id), yourRole: req.teamRole });
};

const FIELD_MAP = {
  title: 'title',
  description: 'description',
  priority: 'priority',
  type: 'type',
  sprintId: 'sprint_id',
  assigneeId: 'assignee_id',
  dueDate: 'due_date',
};

exports.updateTask = async (req, res) => {
  if (req.task.is_archived) return archivedResponse(res);

  if (req.body.assigneeId && !(await isTeamMember(req.task.team_id, req.body.assigneeId))) {
    return res.status(400).json({ message: 'Assignee must be a member of the team' });
  }
  if (req.body.sprintId) {
    const problem = await checkSprint(req.task.project_id, req.body.sprintId);
    if (problem) return res.status(400).json({ message: problem });
  }
  
  
  // Remember who the task belonged to, so we only notify when the assignee really changes
  const before = await pool.query('SELECT assignee_id FROM tasks WHERE id = $1', [req.task.id]);

  // Column names come from the fixed map above, never from user input
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(FIELD_MAP)) {
    if (req.body[key] !== undefined) {
      values.push(req.body[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  values.push(req.task.id);
  await pool.query(
    `UPDATE tasks SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
    values
  );

  const task = await fetchTask(req.task.id);
  emitToProject(req.task.project_id, 'task:updated', { task, by: req.user.id });
  if (req.body.assigneeId !== undefined && task.assignee_id !== before.rows[0].assignee_id) {
    await notifyTaskAssigned({ task, actorId: req.user.id });
  }
  res.json({ task });
};

// Moves a task to a column and position, keeping positions 0,1,2... in both columns
exports.moveTask = async (req, res) => {
  const task = req.task;
  if (task.is_archived) return archivedResponse(res);

  const { status: newStatus, position } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Close the gap left in the old column
    await client.query(
      `UPDATE tasks SET position = position - 1
       WHERE project_id = $1 AND status = $2 AND position > $3 AND id <> $4`,
      [task.project_id, task.status, task.position, task.id]
    );

    // 2. Work out the new position (never beyond the end of the column)
    const count = await client.query(
      'SELECT count(*)::int AS n FROM tasks WHERE project_id = $1 AND status = $2 AND id <> $3',
      [task.project_id, newStatus, task.id]
    );
    const newPosition = position === undefined ? count.rows[0].n : Math.min(position, count.rows[0].n);

    // 3. Make room in the new column
    await client.query(
      `UPDATE tasks SET position = position + 1
       WHERE project_id = $1 AND status = $2 AND position >= $3 AND id <> $4`,
      [task.project_id, newStatus, newPosition, task.id]
    );

    // 4. Place the task
    await client.query(
      'UPDATE tasks SET status = $1, position = $2, updated_at = now() WHERE id = $3',
      [newStatus, newPosition, task.id]
    );

    if (newStatus !== task.status) {
      await logActivity(client, {
        projectId: task.project_id, userId: req.user.id, action: 'task_moved',
        entityType: 'task', entityId: task.id, metadata: { from: task.status, to: newStatus },
      });
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const moved = await fetchTask(task.id);
  // Other cards in both columns shift position too, so clients should reload the board
  emitToProject(task.project_id, 'task:moved', {
    task: moved, fromStatus: task.status, by: req.user.id,
  });
  res.json({ task: moved });
};

// Owner/admin can delete any task. A member can delete only tasks they created.
exports.deleteTask = async (req, res) => {
  const task = req.task;
  if (req.teamRole === 'member' && task.created_by !== req.user.id) {
    return res.status(403).json({ message: 'You can only delete tasks you created' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM tasks WHERE id = $1', [task.id]);
    await client.query(
      `UPDATE tasks SET position = position - 1
       WHERE project_id = $1 AND status = $2 AND position > $3`,
      [task.project_id, task.status, task.position]
    );
    await logActivity(client, {
      projectId: task.project_id, userId: req.user.id, action: 'task_deleted',
      entityType: 'task', entityId: task.id,
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  emitToProject(task.project_id, 'task:deleted', { taskId: task.id, by: req.user.id });
  res.json({ message: 'Task deleted' });
};