const {
  request, app, registerUser, createTeam, addMember, createProject, createTask, getBoard, closeDb,
} = require('./helpers');
const pool = require('../src/db');

afterAll(closeDb);

// An owner, a member, an outsider and a fresh project for each test
async function setup() {
  const owner = await registerUser('Owner');
  const member = await registerUser('Member');
  const outsider = await registerUser('Outsider');
  const team = await createTeam(owner);
  await addMember(team, owner, member);
  const project = await createProject(owner, team);
  return { owner, member, outsider, team, project };
}

const move = (user, task, body) =>
  request(app).patch(`/api/tasks/${task.id}/move`).set(user.auth).send(body);

const titles = (column) => column.map((t) => t.title);
const positions = (column) => column.map((t) => t.position);

describe('creating tasks', () => {
  test('new tasks get sensible defaults and go to the bottom of the column', async () => {
    const { owner, project } = await setup();
    const first = await createTask(owner, project, { title: 'First' });
    const second = await createTask(owner, project, { title: 'Second' });

    expect(first.status).toBe('todo');
    expect(first.priority).toBe('medium');
    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
  });

  test('a title is required', async () => {
    const { owner, project } = await setup();
    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(owner.auth)
      .send({ title: '   ' });

    expect(res.status).toBe(400);
  });

  test('the assignee must be a member of the team', async () => {
    const { owner, outsider, project } = await setup();
    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(owner.auth)
      .send({ title: 'Bad assignee', assigneeId: outsider.user.id });

    expect(res.status).toBe(400);
  });

  test('an outsider gets 404 for the project', async () => {
    const { outsider, project } = await setup();
    const res = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(outsider.auth)
      .send({ title: 'Sneaky' });

    expect(res.status).toBe(404);
  });

  test('a due date comes back as a plain YYYY-MM-DD string', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project, { title: 'Dated', dueDate: '2026-12-31' });

    expect(task.due_date).toBe('2026-12-31');
  });
});

describe('moving tasks on the Kanban board', () => {
  async function threeTasks() {
    const ctx = await setup();
    const a = await createTask(ctx.owner, ctx.project, { title: 'A' });
    const b = await createTask(ctx.owner, ctx.project, { title: 'B' });
    const c = await createTask(ctx.owner, ctx.project, { title: 'C' });
    return { ...ctx, a, b, c };
  }

  test('moving to another column closes the gap in the old one', async () => {
    const { owner, project, a } = await threeTasks();
    const res = await move(owner, a, { status: 'in_progress', position: 0 });
    expect(res.status).toBe(200);

    const board = await getBoard(owner, project);
    expect(titles(board.todo)).toEqual(['B', 'C']);
    expect(positions(board.todo)).toEqual([0, 1]);
    expect(titles(board.in_progress)).toEqual(['A']);
  });

  test('moving down inside a column reorders it', async () => {
    const { owner, project, a } = await threeTasks();
    await move(owner, a, { status: 'todo', position: 2 });

    const board = await getBoard(owner, project);
    expect(titles(board.todo)).toEqual(['B', 'C', 'A']);
    expect(positions(board.todo)).toEqual([0, 1, 2]);
  });

  test('moving up inside a column reorders it', async () => {
    const { owner, project, c } = await threeTasks();
    await move(owner, c, { status: 'todo', position: 0 });

    const board = await getBoard(owner, project);
    expect(titles(board.todo)).toEqual(['C', 'A', 'B']);
    expect(positions(board.todo)).toEqual([0, 1, 2]);
  });

  test('without a position the task goes to the bottom of the new column', async () => {
    const { owner, project, a, b } = await threeTasks();
    await move(owner, a, { status: 'in_progress' });
    await move(owner, b, { status: 'in_progress' });

    const board = await getBoard(owner, project);
    expect(titles(board.in_progress)).toEqual(['A', 'B']);
    expect(positions(board.in_progress)).toEqual([0, 1]);
  });

  test('a position beyond the end is clamped to the end', async () => {
    const { owner, project, a } = await threeTasks();
    await move(owner, a, { status: 'done', position: 99 });

    const board = await getBoard(owner, project);
    expect(board.done[0].position).toBe(0);
    expect(titles(board.done)).toEqual(['A']);
  });

  test('an unknown status is rejected', async () => {
    const { owner, a } = await threeTasks();
    const res = await move(owner, a, { status: 'finished' });

    expect(res.status).toBe(400);
  });

  test('moving to another column writes an activity log entry', async () => {
    const { owner, a } = await threeTasks();
    await move(owner, a, { status: 'done' });

    const { rows } = await pool.query(
      "SELECT metadata FROM activity_logs WHERE entity_id = $1 AND action = 'task_moved'",
      [a.id]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata).toEqual({ from: 'todo', to: 'done' });
  });

  test('an outsider cannot move a task', async () => {
    const { outsider, a } = await threeTasks();
    const res = await move(outsider, a, { status: 'done' });

    expect(res.status).toBe(404);
  });
});

describe('listing and filtering tasks', () => {
  test('filters by status and by assignee, and paginates', async () => {
    const { owner, member, project } = await setup();
    await createTask(owner, project, { title: 'Mine', assigneeId: member.user.id });
    await createTask(owner, project, { title: 'Unassigned' });
    const done = await createTask(owner, project, { title: 'Finished' });
    await move(owner, done, { status: 'done' });

    const base = `/api/projects/${project.id}/tasks`;

    const mine = await request(app).get(`${base}?assignee=me`).set(member.auth);
    expect(titles(mine.body.tasks)).toEqual(['Mine']);

    const byStatus = await request(app).get(`${base}?status=done`).set(owner.auth);
    expect(titles(byStatus.body.tasks)).toEqual(['Finished']);

    const page = await request(app).get(`${base}?page=1&limit=2`).set(owner.auth);
    expect(page.body.tasks).toHaveLength(2);
    expect(page.body.total).toBe(3);
  });

  test('an invalid filter is rejected with 400', async () => {
    const { owner, project } = await setup();
    const res = await request(app)
      .get(`/api/projects/${project.id}/tasks?status=nope`)
      .set(owner.auth);

    expect(res.status).toBe(400);
  });
});

describe('deleting tasks', () => {
  test('a member can delete only their own tasks', async () => {
    const { owner, member, project } = await setup();
    const ownersTask = await createTask(owner, project, { title: 'Owner task' });
    const membersTask = await createTask(member, project, { title: 'Member task' });

    const denied = await request(app).delete(`/api/tasks/${ownersTask.id}`).set(member.auth);
    expect(denied.status).toBe(403);

    const allowed = await request(app).delete(`/api/tasks/${membersTask.id}`).set(member.auth);
    expect(allowed.status).toBe(200);
  });

  test('an owner can delete any task, and the column closes the gap', async () => {
    const { owner, member, project } = await setup();
    await createTask(owner, project, { title: 'A' });
    const b = await createTask(member, project, { title: 'B' });
    await createTask(owner, project, { title: 'C' });

    const res = await request(app).delete(`/api/tasks/${b.id}`).set(owner.auth);
    expect(res.status).toBe(200);

    const board = await getBoard(owner, project);
    expect(titles(board.todo)).toEqual(['A', 'C']);
    expect(positions(board.todo)).toEqual([0, 1]);
  });
});

describe('projects', () => {
  test('only owners and admins can create or edit projects', async () => {
    const { member, team, project } = await setup();

    const create = await request(app)
      .post(`/api/teams/${team.id}/projects`)
      .set(member.auth)
      .send({ name: 'Members project' });
    expect(create.status).toBe(403);

    const edit = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set(member.auth)
      .send({ name: 'Renamed' });
    expect(edit.status).toBe(403);
  });

  test('an archived project is read-only', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project, { title: 'Before archive' });

    const archive = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set(owner.auth)
      .send({ isArchived: true });
    expect(archive.status).toBe(200);

    const create = await request(app)
      .post(`/api/projects/${project.id}/tasks`)
      .set(owner.auth)
      .send({ title: 'After archive' });
    expect(create.status).toBe(400);

    const moved = await move(owner, task, { status: 'done' });
    expect(moved.status).toBe(400);

    // Reading still works
    const board = await request(app).get(`/api/projects/${project.id}/board`).set(owner.auth);
    expect(board.status).toBe(200);
  });
});
