// Creates a fake demo team, project, sprints, work items, comments and chat, for screenshots and demos.
// Usage:  node scripts/seed-demo.js .env          (shows what it would do, writes nothing)
//         node scripts/seed-demo.js .env --yes    (writes the demo data)
//         node scripts/seed-demo.js .env --remove --yes   (deletes the demo data again)
const path = require('path');
const bcrypt = require('bcryptjs');

const args = process.argv.slice(2);
const envFile = args.find((a) => !a.startsWith('--')) || '.env';
const confirmed = args.includes('--yes');
const removing = args.includes('--remove');

require('dotenv').config({ path: path.resolve(__dirname, '..', envFile), quiet: true });
const { Pool } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL was not found in', envFile);
  process.exit(1);
}

const DEMO_PASSWORD = 'DemoPass123';
const USERS = [
  { name: 'Aarav Sharma', email: 'aarav.demo@example.com', role: 'owner' },
  { name: 'Meera Iyer', email: 'meera.demo@example.com', role: 'admin' },
  { name: 'Rohan Das', email: 'rohan.demo@example.com', role: 'member' },
  { name: 'Isha Patel', email: 'isha.demo@example.com', role: 'member' },
];
const EMAILS = USERS.map((u) => u.email);
const [AARAV, MEERA, ROHAN, ISHA] = [0, 1, 2, 3];

// Dates are days from today. start/end of a sprint, started/finished = days ago.
const SPRINTS = [
  { name: 'Sprint 1', goal: 'Get the basics running: CI, staging and a logo', status: 'completed', start: -21, end: -8, startedAgo: 21, completedAgo: 8 },
  { name: 'Sprint 2', goal: 'Invitations, mobile layout and the API docs', status: 'active', start: -6, end: 7, startedAgo: 6 },
  { name: 'Sprint 3', goal: 'Onboarding and accessibility', status: 'planned', start: 8, end: 21 },
];

// who = index in USERS (or null), due = days from today (or null), created = days ago,
// updated = days ago (finished = days ago for done work), sprint = a sprint name or null
const TASKS = [
  { title: 'Set up CI pipeline', status: 'done', priority: 'medium', type: 'task', who: AARAV, due: -13, created: 25, finished: 12, sprint: 'Sprint 1', desc: null },
  { title: 'Deploy staging environment', status: 'done', priority: 'high', type: 'task', who: AARAV, due: -11, created: 24, finished: 10, sprint: 'Sprint 1', desc: null },
  { title: 'Create project logo', status: 'done', priority: 'low', type: 'task', who: ISHA, due: -10, created: 26, finished: 9, sprint: 'Sprint 1', desc: null },

  { title: 'Build invitation emails', status: 'in_progress', priority: 'high', type: 'story', who: ROHAN, due: 1, created: 7, updated: 0, sprint: 'Sprint 2', desc: 'Send a one-click invitation link by email.' },
  { title: 'Fix mobile board layout', status: 'in_progress', priority: 'high', type: 'bug', who: ISHA, due: 4, created: 6, updated: 1, sprint: 'Sprint 2', desc: 'The board columns overlap on narrow phones.' },
  { title: 'Add dark mode', status: 'in_progress', priority: 'low', type: 'story', who: MEERA, due: 5, created: 6, updated: 2, sprint: 'Sprint 2', desc: null },
  { title: 'Add login rate limiting', status: 'done', priority: 'medium', type: 'task', who: AARAV, due: -3, created: 6, finished: 4, sprint: 'Sprint 2', desc: null },
  { title: 'Fix password reset email', status: 'done', priority: 'high', type: 'bug', who: MEERA, due: -1, created: 6, finished: 2, sprint: 'Sprint 2', desc: 'The reset link opened the wrong page.' },
  { title: 'Write API documentation', status: 'todo', priority: 'high', type: 'task', who: MEERA, due: 2, created: 5, updated: 1, sprint: 'Sprint 2', desc: 'Document every endpoint with an example request and response.' },
  { title: 'Prepare launch announcement', status: 'todo', priority: 'medium', type: 'task', who: AARAV, due: 3, created: 4, updated: 4, sprint: 'Sprint 2', desc: null },

  { title: 'Design onboarding checklist', status: 'todo', priority: 'medium', type: 'story', who: ISHA, due: 10, created: 3, updated: 3, sprint: 'Sprint 3', desc: 'A short checklist that new team members see on their first login.' },
  { title: 'Accessibility review', status: 'todo', priority: 'medium', type: 'task', who: MEERA, due: 16, created: 2, updated: 2, sprint: 'Sprint 3', desc: null },

  { title: 'Set up error monitoring', status: 'todo', priority: 'medium', type: 'task', who: null, due: null, created: 2, updated: 2, sprint: null, desc: null },
  { title: 'Review pricing page copy', status: 'todo', priority: 'low', type: 'task', who: ROHAN, due: -2, created: 12, updated: 8, sprint: null, desc: null },
  { title: 'Add CSV export', status: 'todo', priority: 'low', type: 'story', who: null, due: null, created: 1, updated: 1, sprint: null, desc: null },
  { title: 'Fix calendar time zone bug', status: 'todo', priority: 'medium', type: 'bug', who: ISHA, due: 12, created: 1, updated: 1, sprint: null, desc: null },
];

// by task title: who wrote it, the text, and how many minutes ago
const COMMENTS = {
  'Build invitation emails': [
    [MEERA, 'Should the link expire after 7 days?', 300],
    [ROHAN, 'Yes, 7 days, and it works only once.', 280],
    [MEERA, 'Great, I will review the email wording tomorrow.', 120],
  ],
  'Write API documentation': [
    [AARAV, 'Please include the chat and summary endpoints.', 600],
    [MEERA, 'On it, a draft will be ready by Thursday.', 500],
  ],
  'Fix mobile board layout': [
    [ISHA, 'The columns overlap below 400px.', 200],
    [ROHAN, 'I can test on my phone once it is fixed.', 150],
  ],
  'Fix password reset email': [
    [MEERA, 'Fixed. The link now opens the reset page directly.', 2900],
    [AARAV, 'Confirmed on staging, thanks!', 2800],
  ],
};

const CHAT = [
  [AARAV, 'Good morning team! Sprint 2 is running.', 240],
  [MEERA, 'Nice. I am updating the API docs today.', 220],
  [ROHAN, 'Invitation emails are almost done, testing now.', 180],
  [ISHA, 'Mobile layout fix is in progress. Anyone free for a quick call at 4?', 120],
  [AARAV, 'Yes, I will start a meeting from the chat.', 100],
  [ROHAN, 'Joining in five minutes.', 90],
  [MEERA, 'Reminder: pricing page copy is overdue.', 30],
];

const ago = (minutes) => new Date(Date.now() - minutes * 60000);
const host = new URL(url).hostname;

async function removeDemo(client) {
  const owner = await client.query('SELECT id FROM users WHERE email = $1', [EMAILS[0]]);
  if (owner.rowCount === 0) {
    console.log('No demo data found. Nothing to remove.');
    return;
  }
  const teams = await client.query("DELETE FROM teams WHERE created_by = $1 AND name = 'Demo Team'", [owner.rows[0].id]);
  const users = await client.query('DELETE FROM users WHERE email = ANY($1::text[])', [EMAILS]);
  console.log(`Removed ${teams.rowCount} demo team (with its projects, sprints, tasks, comments and chat) and ${users.rowCount} demo users.`);
}

async function seedDemo(client) {
  const existing = await client.query('SELECT email FROM users WHERE email = ANY($1::text[])', [EMAILS]);
  if (existing.rowCount > 0) {
    console.log('Demo users already exist, so nothing was added:', existing.rows.map((r) => r.email).join(', '));
    console.log('To start over, run the script again with --remove --yes, then without --remove.');
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const ids = [];
  for (const u of USERS) {
    const r = await client.query('INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [u.name, u.email, passwordHash]);
    ids.push(r.rows[0].id);
  }

  const team = await client.query('INSERT INTO teams (name, created_by) VALUES ($1, $2) RETURNING id', ['Demo Team', ids[AARAV]]);
  const teamId = team.rows[0].id;
  for (let i = 0; i < USERS.length; i += 1) {
    await client.query('INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, $3)', [teamId, ids[i], USERS[i].role]);
  }

  const project = await client.query(
    'INSERT INTO projects (team_id, name, description, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [teamId, 'DevSync Launch', 'Everything needed to launch DevSync. Demo data with fake people.', ids[AARAV]]
  );
  const projectId = project.rows[0].id;

  const sprintIds = {};
  for (const s of SPRINTS) {
    const r = await client.query(
      `INSERT INTO sprints (project_id, name, goal, status, start_date, end_date, started_at, completed_at, created_by)
       VALUES ($1, $2, $3, $4, CURRENT_DATE + $5::int, CURRENT_DATE + $6::int,
               CASE WHEN $7::int IS NULL THEN NULL ELSE now() - make_interval(days => $7::int) END,
               CASE WHEN $8::int IS NULL THEN NULL ELSE now() - make_interval(days => $8::int) END, $9)
       RETURNING id`,
      [projectId, s.name, s.goal, s.status, s.start, s.end, s.startedAgo ?? null, s.completedAgo ?? null, ids[AARAV]]
    );
    sprintIds[s.name] = r.rows[0].id;
  }

  const log = (userId, action, entityType, entityId, metadata, createdAt) =>
    client.query(
      `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [projectId, userId, action, entityType, entityId, JSON.stringify(metadata), createdAt]
    );

  const position = { todo: 0, in_progress: 0, done: 0 };
  const taskIds = {};
  for (const t of TASKS) {
    const creator = ids[t.who === null ? AARAV : t.who];
    const updatedAgo = t.status === 'done' ? t.finished : t.updated;
    const r = await client.query(
      `INSERT INTO tasks (project_id, title, description, status, priority, type, assignee_id, created_by, due_date, position,
                          sprint_id, created_at, updated_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $9::int IS NULL THEN NULL ELSE CURRENT_DATE + $9::int END, $10, $11,
               now() - make_interval(days => $12::int), now() - make_interval(days => $13::int),
               CASE WHEN $14::int IS NULL THEN NULL ELSE now() - make_interval(days => $14::int) END)
       RETURNING id, created_at, updated_at`,
      [
        projectId, t.title, t.desc, t.status, t.priority, t.type, t.who === null ? null : ids[t.who], creator,
        t.due, position[t.status], t.sprint ? sprintIds[t.sprint] : null, t.created, updatedAgo,
        t.status === 'done' ? t.finished : null,
      ]
    );
    position[t.status] += 1;
    taskIds[t.title] = r.rows[0].id;

    await log(creator, 'task_created', 'task', r.rows[0].id, { title: t.title }, r.rows[0].created_at);
    if (t.status !== 'todo') {
      const from = t.status === 'done' ? 'in_progress' : 'todo';
      await log(creator, 'task_moved', 'task', r.rows[0].id, { from, to: t.status }, r.rows[0].updated_at);
    }
  }

  let commentCount = 0;
  for (const [title, list] of Object.entries(COMMENTS)) {
    for (const [who, body, minutes] of list) {
      const c = await client.query('INSERT INTO comments (task_id, user_id, body, created_at) VALUES ($1, $2, $3, $4) RETURNING id', [taskIds[title], ids[who], body, ago(minutes)]);
      await log(ids[who], 'comment_added', 'comment', c.rows[0].id, { taskId: taskIds[title] }, ago(minutes));
      commentCount += 1;
    }
  }

  for (const [who, body, minutes] of CHAT) {
    await client.query('INSERT INTO chat_messages (project_id, user_id, body, created_at) VALUES ($1, $2, $3, $4)', [projectId, ids[who], body, ago(minutes)]);
  }

  console.log(`Created: ${USERS.length} users, 1 team, 1 project, ${SPRINTS.length} sprints, ${TASKS.length} work items, ${commentCount} comments, ${CHAT.length} chat messages.`);
  console.log('');
  console.log('Log in with any of these fake accounts:');
  USERS.forEach((u) => console.log(`  ${u.email}  (${u.role})`));
  console.log(`Password for all of them: ${DEMO_PASSWORD}`);
}

(async () => {
  console.log('Target database host:', host);
  console.log('Action:', removing ? 'REMOVE the demo data' : 'ADD the demo data');
  if (!confirmed) {
    console.log('');
    console.log('Nothing was written. Check that the host above is the database you want, then add --yes to continue.');
    return;
  }

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (removing) await removeDemo(client);
    else await seedDemo(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed, nothing was changed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();