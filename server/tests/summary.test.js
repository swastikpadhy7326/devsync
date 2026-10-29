const { request, app, registerUser, createTeam, addMember, createProject, createTask, closeDb } = require('./helpers');
const pool = require('../src/db');

jest.setTimeout(180000);
afterAll(closeDb);

const getSummary = (user, projectId, query = '') =>
  request(app).get(`/api/projects/${projectId}/summary${query}`).set(user.auth);

async function setup() {
  const owner = await registerUser('Ada Owner');
  const team = await createTeam(owner);
  const project = await createProject(owner, team);
  return { owner, team, project };
}

// Creates a task through the API, then sets the fields we want to count directly in the database
async function addTask(owner, project, title, o = {}) {
  const {
    status = 'todo',
    priority = 'medium',
    assigneeId = null,
    dueInDays = null,
    createdDaysAgo = 0,
    updatedDaysAgo = 0,
  } = o;
  const task = await createTask(owner, project, { title });
  await pool.query(
    `UPDATE tasks
     SET status = $2, priority = $3, assignee_id = $4,
         due_date = CASE WHEN $5::int IS NULL THEN NULL ELSE CURRENT_DATE + $5::int END,
         created_at = now() - make_interval(days => $6::int),
         updated_at = now() - make_interval(days => $7::int)
     WHERE id = $1`,
    [task.id, status, priority, assigneeId, dueInDays, createdDaysAgo, updatedDaysAgo]
  );
  return task;
}

describe('access and input', () => {
  test('requires a login', async () => {
    const { project } = await setup();
    const res = await request(app).get(`/api/projects/${project.id}/summary`);
    expect(res.status).toBe(401);
  });

  test('people outside the team get 404', async () => {
    const { project } = await setup();
    const outsider = await registerUser();
    const res = await getSummary(outsider, project.id);
    expect(res.status).toBe(404);
  });

  test('rejects an assignee that is not a valid id with 400', async () => {
    const { owner, project } = await setup();
    const res = await getSummary(owner, project.id, '?assignee=not-an-id');
    expect(res.status).toBe(400);
  });
});

describe('counts', () => {
  test('an empty project returns zeros and empty lists', async () => {
    const { owner, project } = await setup();
    const res = await getSummary(owner, project.id);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.cards).toEqual({ completed: 0, updated: 0, created: 0, dueSoon: 0 });
    expect(res.body.status).toEqual({ todo: 0, in_progress: 0, done: 0 });
    expect(res.body.priority).toEqual({ low: 0, medium: 0, high: 0 });
    expect(res.body.workload).toEqual([]);
    expect(res.body.unassigned).toBe(0);
  });

  test('counts tasks by status and by priority', async () => {
    const { owner, project } = await setup();
    await addTask(owner, project, 'A', { status: 'todo', priority: 'high' });
    await addTask(owner, project, 'B', { status: 'todo', priority: 'low' });
    await addTask(owner, project, 'C', { status: 'in_progress', priority: 'medium' });
    await addTask(owner, project, 'D', { status: 'done', priority: 'high' });

    const res = await getSummary(owner, project.id);
    expect(res.body.total).toBe(4);
    expect(res.body.status).toEqual({ todo: 2, in_progress: 1, done: 1 });
    expect(res.body.priority).toEqual({ low: 1, medium: 1, high: 2 });
  });

  test('the four cards only count what happened in the right time window', async () => {
    const { owner, project } = await setup();
    // completed and updated in the last 7 days
    await addTask(owner, project, 'recent done', { status: 'done', createdDaysAgo: 20, updatedDaysAgo: 1 });
    // old and finished: counts nowhere
    await addTask(owner, project, 'old done', { status: 'done', createdDaysAgo: 40, updatedDaysAgo: 30 });
    // created and updated 2 days ago
    await addTask(owner, project, 'new todo', { status: 'todo', createdDaysAgo: 2, updatedDaysAgo: 2 });
    // due soon: in 3 days and today
    await addTask(owner, project, 'due soon', { dueInDays: 3, createdDaysAgo: 30, updatedDaysAgo: 30 });
    await addTask(owner, project, 'due today', { dueInDays: 0, createdDaysAgo: 30, updatedDaysAgo: 30 });
    // not due soon: already done, far away, or overdue
    await addTask(owner, project, 'done but due', { status: 'done', dueInDays: 3, createdDaysAgo: 30, updatedDaysAgo: 30 });
    await addTask(owner, project, 'far away', { dueInDays: 30, createdDaysAgo: 30, updatedDaysAgo: 30 });
    await addTask(owner, project, 'overdue', { dueInDays: -2, createdDaysAgo: 30, updatedDaysAgo: 30 });

    const res = await getSummary(owner, project.id);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(8);
    expect(res.body.cards).toEqual({ completed: 1, updated: 2, created: 1, dueSoon: 2 });
  });
});

describe('assignee filter and workload', () => {
  test('the filter narrows the counts, but workload still shows everyone', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser('Member Person');
    await addMember(team, owner, member);

    await addTask(owner, project, 'member todo', { status: 'todo', assigneeId: member.user.id });
    await addTask(owner, project, 'member done', { status: 'done', assigneeId: member.user.id });
    await addTask(owner, project, 'owner todo', { status: 'todo', priority: 'high', assigneeId: owner.user.id });
    await addTask(owner, project, 'nobody', { status: 'in_progress' });

    const all = await getSummary(owner, project.id);
    expect(all.body.total).toBe(4);
    expect(all.body.unassigned).toBe(1);

    const filtered = await getSummary(owner, project.id, `?assignee=${member.user.id}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.total).toBe(2);
    expect(filtered.body.status).toEqual({ todo: 1, in_progress: 0, done: 1 });
    expect(filtered.body.priority.high).toBe(0);
    // Workload and unassigned always cover the whole project
    expect(filtered.body.workload.map((w) => [w.name, w.total, w.done])).toEqual([
      ['Member Person', 2, 1],
      ['Ada Owner', 1, 0],
    ]);
    expect(filtered.body.unassigned).toBe(1);
  });

  test('filtering by someone with no tasks returns zeros, not an error', async () => {
    const { owner, project } = await setup();
    await addTask(owner, project, 'solo');
    const stranger = await registerUser();

    const res = await getSummary(owner, project.id, `?assignee=${stranger.user.id}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });
});

describe('activity feed', () => {
  test('describes creating a task and commenting in readable sentences', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser('Member Person');
    await addMember(team, owner, member);

    const task = await createTask(owner, project, { title: 'Fix login' });
    const comment = await request(app).post(`/api/tasks/${task.id}/comments`).set(member.auth).send({ body: 'On it' });
    expect(comment.status).toBe(201);

    const res = await getSummary(owner, project.id);
    const texts = res.body.activity.map((a) => a.text);

    expect(texts).toContain('Ada Owner created "Fix login"');
    expect(texts).toContain('Member Person commented on "Fix login"');
  });

  test('shows only the 15 newest entries, newest first', async () => {
    const { owner, project } = await setup();
    for (let i = 1; i <= 17; i += 1) {
      await pool.query(
        `INSERT INTO activity_logs (project_id, user_id, action, entity_type, entity_id, metadata, created_at)
         VALUES ($1, $2, 'task_created', 'task', NULL, $3::jsonb, $4)`,
        [project.id, owner.user.id, JSON.stringify({ title: `Bulk ${i}` }), new Date(Date.now() + i * 1000)]
      );
    }

    const res = await getSummary(owner, project.id);
    expect(res.body.activity).toHaveLength(15);
    expect(res.body.activity[0].text).toBe('Ada Owner created "Bulk 17"');
    expect(res.body.activity[14].text).toBe('Ada Owner created "Bulk 3"');
  });
});

describe('work item types', () => {
  test('an empty project has zero of every type', async () => {
    const { owner, project } = await setup();
    const res = await getSummary(owner, project.id);

    expect(res.status).toBe(200);
    expect(res.body.types).toEqual({ task: 0, bug: 0, story: 0 });
  });

  test('counts work items by type', async () => {
    const { owner, project } = await setup();
    await createTask(owner, project, { title: 'Plain one' });
    await createTask(owner, project, { title: 'Plain two', type: 'task' });
    await createTask(owner, project, { title: 'A bug', type: 'bug' });
    await createTask(owner, project, { title: 'Story 1', type: 'story' });
    await createTask(owner, project, { title: 'Story 2', type: 'story' });
    await createTask(owner, project, { title: 'Story 3', type: 'story' });

    const res = await getSummary(owner, project.id);
    expect(res.body.total).toBe(6);
    expect(res.body.types).toEqual({ task: 2, bug: 1, story: 3 });
  });

  test('the assignee filter narrows the type counts too', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser('Member Person');
    await addMember(team, owner, member);

    await createTask(owner, project, { title: 'Owner task', type: 'task' });
    await createTask(owner, project, { title: 'Member bug', type: 'bug', assigneeId: member.user.id });
    await createTask(owner, project, { title: 'Member story', type: 'story', assigneeId: member.user.id });

    const everyone = await getSummary(owner, project.id);
    expect(everyone.body.types).toEqual({ task: 1, bug: 1, story: 1 });

    const filtered = await getSummary(owner, project.id, `?assignee=${member.user.id}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.types).toEqual({ task: 0, bug: 1, story: 1 });
  });
});