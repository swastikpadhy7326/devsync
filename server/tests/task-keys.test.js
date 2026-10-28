const { request, app, registerUser, createTeam, createProject, createTask, getBoard, closeDb } = require('./helpers');
const pool = require('../src/db');

jest.setTimeout(120000);
afterAll(closeDb);

async function setup(projectName) {
  const owner = await registerUser();
  const team = await createTeam(owner);
  const project = await createProject(owner, team, projectName);
  return { owner, project };
}

const getTask = (user, id) => request(app).get(`/api/tasks/${id}`).set(user.auth);
const createRaw = (user, projectId, body) => request(app).post(`/api/projects/${projectId}/tasks`).set(user.auth).send(body);

describe('issue keys', () => {
  test('numbers tasks 1, 2, 3 and builds the prefix from the project name', async () => {
    const { owner, project } = await setup('Website Redesign');
    const a = await createTask(owner, project, { title: 'A' });
    const b = await createTask(owner, project, { title: 'B' });
    const c = await createTask(owner, project, { title: 'C' });

    expect([a.key, b.key, c.key]).toEqual(['WEB-1', 'WEB-2', 'WEB-3']);
    expect([a.number, b.number, c.number]).toEqual([1, 2, 3]);
  });

  test('each project counts on its own', async () => {
    const { owner, project } = await setup('Alpha Project');
    const other = await createProject(owner, await createTeam(owner), 'Beta Project');

    await createTask(owner, project, { title: 'one' });
    await createTask(owner, project, { title: 'two' });
    const first = await createTask(owner, other, { title: 'first in beta' });

    expect(first.key).toBe('BET-1');
  });

  test('uses only the letters of the name, and PRJ when there are none', async () => {
    const owner = await registerUser();
    const team = await createTeam(owner);
    const withDigits = await createProject(owner, team, 'Q4 Plan');
    const noLetters = await createProject(owner, team, '123 456');

    expect((await createTask(owner, withDigits, { title: 'x' })).key).toBe('QPL-1');
    expect((await createTask(owner, noLetters, { title: 'x' })).key).toBe('PRJ-1');
  });

  test('keeps the prefix after the project is renamed', async () => {
    const { owner, project } = await setup('Website Redesign');
    const first = await createTask(owner, project, { title: 'before rename' });
    await pool.query("UPDATE projects SET name = 'Totally Different' WHERE id = $1", [project.id]);
    const second = await createTask(owner, project, { title: 'after rename' });

    expect(first.key).toBe('WEB-1');
    expect(second.key).toBe('WEB-2');
  });

  test('never reuses the number of a deleted task', async () => {
    const { owner, project } = await setup('Website Redesign');
    await createTask(owner, project, { title: 'one' });
    const two = await createTask(owner, project, { title: 'two' });
    await createTask(owner, project, { title: 'three' });

    const del = await request(app).delete(`/api/tasks/${two.id}`).set(owner.auth);
    expect(del.status).toBeLessThan(300);

    const next = await createTask(owner, project, { title: 'four' });
    expect(next.key).toBe('WEB-4');
  });

  test('gives unique numbers to tasks created at the same moment', async () => {
    const { owner, project } = await setup('Website Redesign');
    const tasks = await Promise.all(
      Array.from({ length: 8 }, (_, i) => createTask(owner, project, { title: `Parallel ${i}` }))
    );

    const numbers = tasks.map((t) => t.number).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test('numbers tasks that are inserted directly in SQL too', async () => {
    const { owner, project } = await setup('Website Redesign');
    const direct = await pool.query(
      "INSERT INTO tasks (project_id, title, created_by) VALUES ($1, 'Direct insert', $2) RETURNING number",
      [project.id, owner.user.id]
    );
    const viaApi = await createTask(owner, project, { title: 'Through the API' });

    expect(direct.rows[0].number).toBe(1);
    expect(viaApi.key).toBe('WEB-2');
  });

  test('shows the key and the type on the board', async () => {
    const { owner, project } = await setup('Website Redesign');
    await createTask(owner, project, { title: 'On the board', type: 'bug' });
    const board = await getBoard(owner, project);

    expect(board.todo[0].key).toBe('WEB-1');
    expect(board.todo[0].type).toBe('bug');
  });
});

describe('work item types', () => {
  test('a new task is a task by default', async () => {
    const { owner, project } = await setup('Website Redesign');
    const task = await createTask(owner, project, { title: 'Plain' });

    expect(task.type).toBe('task');
  });

  test('accepts bug and story', async () => {
    const { owner, project } = await setup('Website Redesign');
    const bug = await createTask(owner, project, { title: 'Crash on login', type: 'bug' });
    const story = await createTask(owner, project, { title: 'As a user I can reset my password', type: 'story' });

    expect(bug.type).toBe('bug');
    expect(story.type).toBe('story');
  });

  test('rejects an unknown type with 400 and does not use up a number', async () => {
    const { owner, project } = await setup('Website Redesign');
    const bad = await createRaw(owner, project.id, { title: 'Bad', type: 'epic' });
    const good = await createTask(owner, project, { title: 'Good' });

    expect(bad.status).toBe(400);
    expect(good.key).toBe('WEB-1');
  });

  test('can change the type later, and rejects a bad value', async () => {
    const { owner, project } = await setup('Website Redesign');
    const task = await createTask(owner, project, { title: 'Change me' });

    const ok = await request(app).patch(`/api/tasks/${task.id}`).set(owner.auth).send({ type: 'story' });
    expect(ok.status).toBeLessThan(300);
    expect((await getTask(owner, task.id)).body.task.type).toBe('story');

    const bad = await request(app).patch(`/api/tasks/${task.id}`).set(owner.auth).send({ type: 'epic' });
    expect(bad.status).toBe(400);
    expect((await getTask(owner, task.id)).body.task.type).toBe('story');
  });
});