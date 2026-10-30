const { request, app, registerUser, createTeam, addMember, createProject, createTask, getBoard, closeDb } = require('./helpers');
const pool = require('../src/db');

jest.setTimeout(240000);
afterAll(closeDb);

async function setup() {
  const owner = await registerUser('Sprint Owner');
  const team = await createTeam(owner);
  const project = await createProject(owner, team);
  return { owner, team, project };
}

const create = (user, projectId, body = { name: 'Sprint 1' }) =>
  request(app).post(`/api/projects/${projectId}/sprints`).set(user.auth).send(body);
const list = (user, projectId) => request(app).get(`/api/projects/${projectId}/sprints`).set(user.auth);
const act = (user, id, action) => request(app).post(`/api/sprints/${id}/${action}`).set(user.auth);
const patchSprint = (user, id, body) => request(app).patch(`/api/sprints/${id}`).set(user.auth).send(body);
const removeSprint = (user, id) => request(app).delete(`/api/sprints/${id}`).set(user.auth);
const assign = (user, taskId, sprintId) => request(app).patch(`/api/tasks/${taskId}`).set(user.auth).send({ sprintId });
const getTask = async (user, id) => (await request(app).get(`/api/tasks/${id}`).set(user.auth)).body.task;
const newSprint = async (user, projectId, name) => (await create(user, projectId, { name })).body.sprint;

describe('access', () => {
  test('listing requires a login', async () => {
    const { project } = await setup();
    const res = await request(app).get(`/api/projects/${project.id}/sprints`);
    expect(res.status).toBe(401);
  });

  test('people outside the team get 404 on every sprint route', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Private');
    const outsider = await registerUser();

    expect((await list(outsider, project.id)).status).toBe(404);
    expect((await create(outsider, project.id)).status).toBe(404);
    expect((await patchSprint(outsider, sprint.id, { name: 'Hacked' })).status).toBe(404);
    expect((await act(outsider, sprint.id, 'start')).status).toBe(404);
    expect((await act(outsider, sprint.id, 'complete')).status).toBe(404);
    expect((await removeSprint(outsider, sprint.id)).status).toBe(404);
  });

  test('a member can read sprints but not create or change them', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser('Plain Member');
    await addMember(team, owner, member);
    const sprint = await newSprint(owner, project.id, 'Sprint 1');

    expect((await list(member, project.id)).status).toBe(200);
    expect((await create(member, project.id)).status).toBe(403);
    expect((await patchSprint(member, sprint.id, { name: 'Renamed' })).status).toBe(403);
    expect((await act(member, sprint.id, 'start')).status).toBe(403);
    expect((await act(member, sprint.id, 'complete')).status).toBe(403);
    expect((await removeSprint(member, sprint.id)).status).toBe(403);
  });

  test('an admin can manage sprints', async () => {
    const { owner, team, project } = await setup();
    const admin = await registerUser('Team Admin');
    await addMember(team, owner, admin, 'admin');

    const made = await create(admin, project.id, { name: 'Admin sprint' });
    expect(made.status).toBe(201);
    expect((await act(admin, made.body.sprint.id, 'start')).status).toBe(200);
    expect((await act(admin, made.body.sprint.id, 'complete')).status).toBe(200);
  });
});

describe('creating and editing', () => {
  test('creates a planned sprint with its details', async () => {
    const { owner, project } = await setup();
    const res = await create(owner, project.id, {
      name: '  Sprint 1  ',
      goal: 'Ship the login',
      startDate: '2026-11-02',
      endDate: '2026-11-15',
    });

    expect(res.status).toBe(201);
    expect(res.body.sprint).toMatchObject({
      project_id: project.id,
      name: 'Sprint 1',
      goal: 'Ship the login',
      status: 'planned',
      start_date: '2026-11-02',
      end_date: '2026-11-15',
    });
  });

  test('rejects an empty name and an end date before the start date', async () => {
    const { owner, project } = await setup();

    expect((await create(owner, project.id, { name: '' })).status).toBe(400);
    expect((await create(owner, project.id, { name: 'Bad dates', startDate: '2026-11-15', endDate: '2026-11-02' })).status).toBe(400);
    expect((await list(owner, project.id)).body.sprints).toHaveLength(0);
  });

  test('archived projects cannot get new sprints', async () => {
    const { owner, project } = await setup();
    await pool.query('UPDATE projects SET is_archived = true WHERE id = $1', [project.id]);

    expect((await create(owner, project.id)).status).toBe(400);
  });

  test('edits the name, goal and end date of a planned sprint', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');

    const res = await patchSprint(owner, sprint.id, { name: 'Renamed', goal: 'New goal', endDate: '2026-12-01' });
    expect(res.status).toBe(200);
    expect(res.body.sprint).toMatchObject({ name: 'Renamed', goal: 'New goal', end_date: '2026-12-01' });
  });

  test('rejects a change that would put the end before the start', async () => {
    const { owner, project } = await setup();
    const made = await create(owner, project.id, { name: 'Dated', startDate: '2026-11-02', endDate: '2026-11-15' });

    const res = await patchSprint(owner, made.body.sprint.id, { endDate: '2026-11-01' });
    expect(res.status).toBe(400);
    expect((await list(owner, project.id)).body.sprints[0].end_date).toBe('2026-11-15');
  });
});

describe('lifecycle', () => {
  test('starting a sprint makes it active and fills in a start date', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');

    const res = await act(owner, sprint.id, 'start');
    expect(res.status).toBe(200);
    expect(res.body.sprint.status).toBe('active');
    expect(res.body.sprint.started_at).toBeTruthy();
    expect(res.body.sprint.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('only one sprint can be active at a time', async () => {
    const { owner, project } = await setup();
    const a = await newSprint(owner, project.id, 'A');
    const b = await newSprint(owner, project.id, 'B');

    expect((await act(owner, a.id, 'start')).status).toBe(200);
    expect((await act(owner, b.id, 'start')).status).toBe(409);

    const statuses = (await list(owner, project.id)).body.sprints.map((s) => [s.name, s.status]);
    expect(statuses).toEqual([['A', 'active'], ['B', 'planned']]);
  });

  test('two sprints started at the same moment: exactly one wins', async () => {
    const { owner, project } = await setup();
    const a = await newSprint(owner, project.id, 'A');
    const b = await newSprint(owner, project.id, 'B');

    const results = await Promise.all([act(owner, a.id, 'start'), act(owner, b.id, 'start')]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  test('a sprint that is active or completed cannot be started again', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');
    await act(owner, sprint.id, 'start');

    expect((await act(owner, sprint.id, 'start')).status).toBe(400);
    await act(owner, sprint.id, 'complete');
    expect((await act(owner, sprint.id, 'start')).status).toBe(400);
  });

  test('completing keeps finished work in the sprint and sends the rest back to the backlog', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');
    const done = await createTask(owner, project, { title: 'Finished', status: 'done' });
    const open = await createTask(owner, project, { title: 'Unfinished', status: 'in_progress' });
    const todo = await createTask(owner, project, { title: 'Not started' });
    for (const t of [done, open, todo]) await assign(owner, t.id, sprint.id);
    await act(owner, sprint.id, 'start');

    const res = await act(owner, sprint.id, 'complete');
    expect(res.status).toBe(200);
    expect(res.body.sprint.status).toBe('completed');
    expect(res.body.sprint.completed_at).toBeTruthy();
    expect(res.body.movedToBacklog).toBe(2);

    expect((await getTask(owner, done.id)).sprint_id).toBe(sprint.id);
    expect((await getTask(owner, open.id)).sprint_id).toBeNull();
    expect((await getTask(owner, todo.id)).sprint_id).toBeNull();
  });

  test('a planned sprint cannot be completed', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');

    expect((await act(owner, sprint.id, 'complete')).status).toBe(400);
    expect((await list(owner, project.id)).body.sprints[0].status).toBe('planned');
  });

  test('after one sprint is completed, the next one can start', async () => {
    const { owner, project } = await setup();
    const a = await newSprint(owner, project.id, 'A');
    const b = await newSprint(owner, project.id, 'B');

    await act(owner, a.id, 'start');
    await act(owner, a.id, 'complete');
    expect((await act(owner, b.id, 'start')).status).toBe(200);
  });

  test('a completed sprint cannot be edited', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');
    await act(owner, sprint.id, 'start');
    await act(owner, sprint.id, 'complete');

    expect((await patchSprint(owner, sprint.id, { name: 'Too late' })).status).toBe(400);
  });

  test('deleting a planned sprint returns its tasks to the backlog', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');
    const task = await createTask(owner, project, { title: 'Planned work' });
    await assign(owner, task.id, sprint.id);

    expect((await removeSprint(owner, sprint.id)).status).toBe(200);
    expect((await getTask(owner, task.id)).sprint_id).toBeNull();
    expect((await list(owner, project.id)).body.sprints).toHaveLength(0);
  });

  test('active and completed sprints cannot be deleted', async () => {
    const { owner, project } = await setup();
    const a = await newSprint(owner, project.id, 'A');
    const b = await newSprint(owner, project.id, 'B');
    await act(owner, a.id, 'start');

    expect((await removeSprint(owner, a.id)).status).toBe(400);
    await act(owner, a.id, 'complete');
    expect((await removeSprint(owner, a.id)).status).toBe(400);
    expect((await removeSprint(owner, b.id)).status).toBe(200);
  });

  test('lists sprints with their counts, active first', async () => {
    const { owner, project } = await setup();
    const old = await newSprint(owner, project.id, 'Old');
    await newSprint(owner, project.id, 'Planned');
    const current = await newSprint(owner, project.id, 'Current');
    await act(owner, old.id, 'start');
    await act(owner, old.id, 'complete');
    await act(owner, current.id, 'start');

    const open = await createTask(owner, project, { title: 'A' });
    const finished = await createTask(owner, project, { title: 'B', status: 'done' });
    await assign(owner, open.id, current.id);
    await assign(owner, finished.id, current.id);

    const sprints = (await list(owner, project.id)).body.sprints;
    expect(sprints.map((s) => s.name)).toEqual(['Current', 'Planned', 'Old']);
    expect(sprints[0].total).toBe(2);
    expect(sprints[0].done).toBe(1);
    expect(sprints[1].total).toBe(0);
  });
});

describe('tasks and sprints', () => {
  test('new tasks start in the backlog', async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner, project, { title: 'Fresh' });

    expect(task.sprint_id).toBeNull();
  });

  test('a task can be moved into a sprint and back to the backlog', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');
    const task = await createTask(owner, project, { title: 'Plan me' });

    const into = await assign(owner, task.id, sprint.id);
    expect(into.status).toBe(200);
    expect(into.body.task.sprint_id).toBe(sprint.id);
    expect(into.body.task.sprint_name).toBe('Sprint 1');

    const board = await getBoard(owner, project);
    expect(board.todo[0].sprint_name).toBe('Sprint 1');

    const out = await assign(owner, task.id, null);
    expect(out.status).toBe(200);
    expect(out.body.task.sprint_id).toBeNull();
    expect(out.body.task.sprint_name).toBeNull();
  });

  test('any member can move a task between sprints', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser('Plain Member');
    await addMember(team, owner, member);
    const sprint = await newSprint(owner, project.id, 'Sprint 1');
    const task = await createTask(owner, project, { title: 'Member plans' });

    expect((await assign(member, task.id, sprint.id)).status).toBe(200);
    expect((await getTask(owner, task.id)).sprint_id).toBe(sprint.id);
  });

  test('a task cannot join a sprint of another project', async () => {
    const { owner, team, project } = await setup();
    const other = await createProject(owner, team, 'Other Project');
    const foreign = await newSprint(owner, other.id, 'Foreign sprint');
    const task = await createTask(owner, project, { title: 'Stays put' });

    expect((await assign(owner, task.id, foreign.id)).status).toBe(400);
    expect((await getTask(owner, task.id)).sprint_id).toBeNull();
  });

  test('a task cannot join a completed sprint', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');
    await act(owner, sprint.id, 'start');
    await act(owner, sprint.id, 'complete');
    const task = await createTask(owner, project, { title: 'Too late' });

    expect((await assign(owner, task.id, sprint.id)).status).toBe(400);
    expect((await getTask(owner, task.id)).sprint_id).toBeNull();
  });
});

describe('role in the list', () => {
  test('the list tells the caller their role', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser('Plain Member');
    await addMember(team, owner, member);

    expect((await list(owner, project.id)).body.yourRole).toBe('owner');
    expect((await list(member, project.id)).body.yourRole).toBe('member');
  });
});

describe('sprint status on tasks', () => {
  test('a task carries the status of its sprint, and null in the backlog', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');
    const task = await createTask(owner, project, { title: 'Tracked' });

    expect((await getTask(owner, task.id)).sprint_status).toBeNull();

    await assign(owner, task.id, sprint.id);
    expect((await getTask(owner, task.id)).sprint_status).toBe('planned');

    await act(owner, sprint.id, 'start');
    expect((await getTask(owner, task.id)).sprint_status).toBe('active');
    expect((await getBoard(owner, project)).todo[0].sprint_status).toBe('active');
  });
});