const pool = require('../db');

const STATUS_LABEL = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };

// Turns one activity row into a readable sentence
function sentence(row) {
  const who = row.user_name || 'Someone';
  const meta = row.metadata || {};
  const title = row.task_title || meta.title || null;
  const quoted = title ? `"${title}"` : 'a task';

  switch (row.action) {
    case 'task_created':
      return `${who} created ${quoted}`;
    case 'task_moved':
      if (meta.from && meta.to) {
        return `${who} moved ${quoted} from ${STATUS_LABEL[meta.from] || meta.from} to ${STATUS_LABEL[meta.to] || meta.to}`;
      }
      return `${who} moved ${quoted}`;
    case 'task_deleted':
      return `${who} deleted ${quoted}`;
    case 'comment_added':
      return `${who} commented on ${quoted}`;
    case 'comment_deleted':
      return `${who} deleted a comment`;
    default:
      return `${who} made a change`;
  }
}

// Numbers for the project's Summary tab. The cards, status and priority can be narrowed to one
// assignee with ?assignee=<userId>. The workload list and the activity feed always cover the whole project.
exports.getSummary = async (req, res) => {
  const projectId = req.project.id;
  const { assignee } = req.validatedQuery;

  const params = [projectId];
  let filter = '';
  if (assignee) {
    params.push(assignee);
    filter = 'AND assignee_id = $2';
  }

  const [counts, workload, unassigned, activity] = await Promise.all([
    pool.query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE status = 'done' AND updated_at > now() - interval '7 days')::int AS completed,
         count(*) FILTER (WHERE updated_at > now() - interval '7 days')::int AS updated,
         count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS created,
         count(*) FILTER (WHERE status <> 'done' AND due_date IS NOT NULL
                          AND due_date >= CURRENT_DATE AND due_date <= CURRENT_DATE + 7)::int AS due_soon,
         count(*) FILTER (WHERE status = 'todo')::int AS todo,
         count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
         count(*) FILTER (WHERE status = 'done')::int AS done,
         count(*) FILTER (WHERE priority = 'low')::int AS low,
         count(*) FILTER (WHERE priority = 'medium')::int AS medium,
                 count(*) FILTER (WHERE priority = 'high')::int AS high,
         count(*) FILTER (WHERE type = 'task')::int AS type_task,
         count(*) FILTER (WHERE type = 'bug')::int AS type_bug,
         count(*) FILTER (WHERE type = 'story')::int AS type_story 
       FROM tasks
       WHERE project_id = $1 ${filter}`,
      params
    ),
    pool.query(
      `SELECT u.id AS user_id, u.name, count(*)::int AS total,
              count(*) FILTER (WHERE t.status = 'done')::int AS done
       FROM tasks t
       JOIN users u ON u.id = t.assignee_id
       WHERE t.project_id = $1
       GROUP BY u.id, u.name
       ORDER BY total DESC, u.name`,
      [projectId]
    ),
    pool.query('SELECT count(*)::int AS n FROM tasks WHERE project_id = $1 AND assignee_id IS NULL', [projectId]),
    pool.query(
      `SELECT a.id, a.action, a.metadata, a.created_at, u.name AS user_name,
              COALESCE(t.title, t2.title) AS task_title
       FROM activity_logs a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN tasks t ON a.entity_type = 'task' AND t.id = a.entity_id
       LEFT JOIN tasks t2 ON a.entity_type = 'comment' AND t2.id::text = a.metadata->>'taskId'
       WHERE a.project_id = $1
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 15`,
      [projectId]
    ),
  ]);

  const c = counts.rows[0];
  res.json({
    total: c.total,
    cards: { completed: c.completed, updated: c.updated, created: c.created, dueSoon: c.due_soon },
    status: { todo: c.todo, in_progress: c.in_progress, done: c.done },
      priority: { low: c.low, medium: c.medium, high: c.high },
    types: { task: c.type_task, bug: c.type_bug, story: c.type_story },
    workload: workload.rows,
    unassigned: unassigned.rows[0].n,
    activity: activity.rows.map((r) => ({
      id: String(r.id),
      text: sentence(r),
      created_at: r.created_at,
    })),
  });
};