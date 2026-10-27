// Creates a fake demo team, project, tasks, comments and chat, for screenshots and demos.
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

// who = index in USERS (or null), due = days from today (or null), created/updated = days ago
const TASKS = [
  { title: 'Design onboarding checklist', status: 'todo', priority: 'medium', who: ISHA, due: 6, created: 3, updated: 3, desc: 'A short checklist that new team members see on their first login.' },
  { title: 'Write API documentation', status: 'todo', priority: 'high', who: MEERA, due: 2, created: 5, updated: 1, desc: 'Document every endpoint with an example request and response.' },
  { title: 'Prepare launch announcement', status: 'todo', priority: 'medium', who: AARAV, due: 4, created: 4, updated: 4, desc: null },
  { title: 'Set up error monitoring', status: 'todo', priority: 'medium', who: null, due: null, created: 2, updated: 2, desc: null },
  { title: 'Review pricing page copy', status: 'todo', priority: 'low', who: ROHAN, due: -2, created: 12, updated: 8, desc: null },
  { title: 'Build invitation emails', status: 'in_progress', priority: 'high', who: ROHAN, due: 1, created: 9, updated: 0, desc: 'Send a one-click invitation link by email.' },
  { title: 'Fix mobile board layout', status: 'in_progress', priority: 'high', who: ISHA, due: 4, created: 7, updated: 1, desc: 'The board columns overlap on narrow phones.' },
  { title: 'Add dark mode', status: 'in_progress', priority: 'low', who: MEERA, due: 14, created: 6, updated: 2, desc: null },
  { title: 'Set up CI pipeline', status: 'done', priority: 'medium', who: AARAV, due: -5, created: 20, updated: 2, desc: null },
  { title: 'Deploy staging environment', status: 'done', priority: 'high', who: AARAV, due: -3, created: 15, updated: 3, desc: null },
  { title: 'Create project logo', status: 'done', priority: 'low', who: ISHA, due: -10, created: 25, updated: 20, desc: null },
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
};

const CHAT = [
  [AARAV, 'Good morning team! Staging is live.', 240],
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
  console.log(`Removed ${teams.rowCount} demo team (with its projects, tasks, comments and chat) and ${users.rowCount} demo users.`);
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
    const r = await client.query(
      `INSERT INTO tasks (project_id, title, description, status, priority, assignee_id, created_by, due_date, position, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               CASE WHEN $8::int IS NULL THEN NULL ELSE CURRENT_DATE + $8::int END, $9,
               now() - make_interval(days => $10::int), now() - make_interval(days => $11::int))
       RETURNING id, created_at, updated_at`,
      [projectId, t.title, t.desc, t.status, t.priority, t.who === null ? null : ids[t.who], creator, t.due, position[t.status], t.created, t.updated]
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

  console.log(`Created: ${USERS.length} users, 1 team, 1 project, ${TASKS.length} tasks, ${commentCount} comments, ${CHAT.length} chat messages.`);
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