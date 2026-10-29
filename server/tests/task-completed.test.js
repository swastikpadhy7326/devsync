const { request, app, registerUser, createTeam, createProject, createTask, closeDb } = require('./helpers');
const pool = require('../src/db');

jest.setTimeout(120000);
afterAll(closeDb);

async function setup() {
  const owner = await registerUser();
  const team = await createTeam(owner);
  const project = await createProject(owner, team);
  return { owner, project };
}

const row = async (id) => (await pool.query('SELECT completed_at FROM tasks WHERE id = $1', [id])).rows[0];
// The database compares against its own clock, so these checks do not depend on this computer's time
const isRecent = async (id) =>
  (await pool.query("SELECT completed_at > now() - interval '5 minutes' AS ok FROM tasks WHERE id = $1", [id])).rows[0].ok;
const isOlderThan = async (id, days) =>
  (await pool.query('SELECT completed_at < now() - make_interval(days => $2::int) AS ok FROM tasks WHERE id = $1', [id, days])).rows[0].ok;
const setCompletedDaysAgo = (id, days) =>
  pool.query('UPDATE tasks SET completed_at = now() - make_interval(days => $2::int) WHERE id = $1', [id, days]);

const move = (user, id, status) => request(app).patch(`/api/tasks/${id}/move`).set(user.auth).send({ status });
const summary = (user, projectId) => request(app).get(`/api/projects/${projectId}/summary`).set(user.auth);

describe('completed_at', () => {
  test('a new unfinished task has no completion time', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project, { title: 'Open work' });

    expect((await row(task.id)).completed_at).toBeNull();
  });

  test('a task created as done is stamped right away', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project, { title: 'Already done', status: 'done' });

    expect(await isRecent(task.id)).toBe(true);
  });

  test('moving a task into Done stamps it, and moving it out clears it', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project, { title: 'Finish me' });

    expect((await move(owner, task.id, 'done')).status).toBeLessThan(300);
    expect(await isRecent(task.id)).toBe(true);

    expect((await move(owner, task.id, 'in_progress')).status).toBeLessThan(300);
    expect((await row(task.id)).completed_at).toBeNull();
  });

  test('moving between To Do and In Progress never stamps a task', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project, { title: 'Not finished' });

    await move(owner, task.id, 'in_progress');
    await move(owner, task.id, 'todo');

    expect((await row(task.id)).completed_at).toBeNull();
  });

  test('dropping a finished task inside the Done column keeps its original time', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project, { title: 'Finished long ago', status: 'done' });
    await setCompletedDaysAgo(task.id, 10);

    expect((await move(owner, task.id, 'done')).status).toBeLessThan(300);
    expect(await isOlderThan(task.id, 9)).toBe(true);
  });

  test('finishing a task again later stamps a new time', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project, { title: 'Reopened', status: 'done' });
    await setCompletedDaysAgo(task.id, 10);

    await move(owner, task.id, 'todo');
    await move(owner, task.id, 'done');

    expect(await isRecent(task.id)).toBe(true);
  });

  test('the Summary counts completions by completion time, so editing an old finished task changes nothing', async () => {
    const { owner, project } = await setup();
    const old = await createTask(owner, project, { title: 'Finished a month ago', status: 'done' });
    await setCompletedDaysAgo(old.id, 30);

    const edit = await request(app).patch(`/api/tasks/${old.id}`).set(owner.auth).send({ title: 'Finished a month ago (edited)' });
    expect(edit.status).toBeLessThan(300);

    const before = await summary(owner, project.id);
    expect(before.body.cards.completed).toBe(0);

    const fresh = await createTask(owner, project, { title: 'Finished today' });
    await move(owner, fresh.id, 'done');

    const after = await summary(owner, project.id);
    expect(after.body.cards.completed).toBe(1);
    expect(after.body.status.done).toBe(2);
  });
});