const { request, app, registerUser, createTeam, addMember, createProject, createTask, closeDb } = require('./helpers');
const pool = require('../src/db');
const { buildBurndown } = require('../src/utils/burndown');

jest.setTimeout(240000);
afterAll(closeDb);

describe('buildBurndown (the calculation)', () => {
  const remaining = (list) => list.map((d) => d.remaining);

  test('with nothing finished, the line stays flat at the total', () => {
    const r = buildBurndown({ start: '2026-11-02', end: '2026-11-06', today: '2026-11-04', total: 5, completedDays: [] });
    expect(remaining(r.days)).toEqual([5, 5, 5]);
  });

  test('each completion lowers the line from the day it happened', () => {
    const r = buildBurndown({
      start: '2026-11-02', end: '2026-11-06', today: '2026-11-05', total: 4,
      completedDays: ['2026-11-03', '2026-11-03', '2026-11-05'],
    });
    expect(r.days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);
    expect(remaining(r.days)).toEqual([4, 2, 2, 1]);
  });

  test('work finished before the sprint started counts from the first day', () => {
    const r = buildBurndown({ start: '2026-11-02', end: '2026-11-06', today: '2026-11-02', total: 3, completedDays: ['2026-10-30'] });
    expect(remaining(r.days)).toEqual([2]);
  });

  test('the ideal line runs straight from the total to zero across the whole sprint', () => {
    const r = buildBurndown({ start: '2026-11-02', end: '2026-11-06', today: '2026-11-03', total: 10, completedDays: [] });
    expect(remaining(r.ideal)).toEqual([10, 7.5, 5, 2.5, 0]);
    expect(r.ideal[0].date).toBe('2026-11-02');
    expect(r.ideal[4].date).toBe('2026-11-06');
  });

  test('the actual line stops at today while the sprint is running', () => {
    const r = buildBurndown({ start: '2026-11-02', end: '2026-11-10', today: '2026-11-04', total: 3, completedDays: [] });
    expect(r.days).toHaveLength(3);
    expect(r.ideal).toHaveLength(9);
  });

  test('the actual line stops at the end date once it has passed', () => {
    const r = buildBurndown({ start: '2026-11-02', end: '2026-11-04', today: '2026-11-20', total: 3, completedDays: [] });
    expect(r.days.map((d) => d.date)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
  });

  test('without an end date there is no ideal line, and the days run until today', () => {
    const r = buildBurndown({ start: '2026-11-02', end: null, today: '2026-11-04', total: 2, completedDays: [] });
    expect(r.ideal).toBeNull();
    expect(r.days).toHaveLength(3);
  });

  test('a sprint that starts in the future has no days yet but still has an ideal line', () => {
    const r = buildBurndown({ start: '2026-12-01', end: '2026-12-03', today: '2026-11-04', total: 6, completedDays: [] });
    expect(r.days).toEqual([]);
    expect(remaining(r.ideal)).toEqual([6, 3, 0]);
  });

  test('a one-day sprint has an ideal of zero', () => {
    const r = buildBurndown({ start: '2026-11-02', end: '2026-11-02', today: '2026-11-02', total: 4, completedDays: [] });
    expect(remaining(r.ideal)).toEqual([0]);
    expect(remaining(r.days)).toEqual([4]);
  });

  test('an empty sprint, and never below zero', () => {
    expect(remaining(buildBurndown({ start: '2026-11-02', end: '2026-11-03', today: '2026-11-03', total: 0 }).days)).toEqual([0, 0]);
    const odd = buildBurndown({ start: '2026-11-02', end: null, today: '2026-11-02', total: 1, completedDays: ['2026-11-01', '2026-11-01'] });
    expect(remaining(odd.days)).toEqual([0]);
  });
});

async function setup() {
  const owner = await registerUser('Burn Owner');
  const team = await createTeam(owner);
  const project = await createProject(owner, team);
  return { owner, team, project };
}

const newSprint = async (user, projectId, name = 'Sprint 1') =>
  (await request(app).post(`/api/projects/${projectId}/sprints`).set(user.auth).send({ name })).body.sprint;
const startSprint = (user, id) => request(app).post(`/api/sprints/${id}/start`).set(user.auth);
const completeSprint = (user, id) => request(app).post(`/api/sprints/${id}/complete`).set(user.auth);
const assign = (user, taskId, sprintId) => request(app).patch(`/api/tasks/${taskId}`).set(user.auth).send({ sprintId });
const move = (user, taskId, status) => request(app).patch(`/api/tasks/${taskId}/move`).set(user.auth).send({ status });
const burndown = (user, id) => request(app).get(`/api/sprints/${id}/burndown`).set(user.auth);
const setDates = (id, startOffset, endOffset) =>
  pool.query(
    `UPDATE sprints
     SET start_date = (now() AT TIME ZONE 'UTC')::date + $2::int,
         end_date = CASE WHEN $3::int IS NULL THEN NULL ELSE (now() AT TIME ZONE 'UTC')::date + $3::int END
     WHERE id = $1`,
    [id, startOffset, endOffset]
  );

describe('GET /api/sprints/:sprintId/burndown', () => {
  test('requires a login, and outsiders get 404', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id);
    await startSprint(owner, sprint.id);

    expect((await request(app).get(`/api/sprints/${sprint.id}/burndown`)).status).toBe(401);
    expect((await burndown(await registerUser(), sprint.id)).status).toBe(404);
  });

  test('a plain member can read it', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser('Plain Member');
    await addMember(team, owner, member);
    const sprint = await newSprint(owner, project.id);
    await startSprint(owner, sprint.id);

    expect((await burndown(member, sprint.id)).status).toBe(200);
  });

  test('a planned or a completed sprint has no burndown', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id);

    expect((await burndown(owner, sprint.id)).status).toBe(400);
    await startSprint(owner, sprint.id);
    await completeSprint(owner, sprint.id);
    expect((await burndown(owner, sprint.id)).status).toBe(400);
  });

  test('counts only the work in this sprint and follows the completion dates', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id, 'Sprint 1');
    const other = await newSprint(owner, project.id, 'Sprint 2');
    const a = await createTask(owner, project, { title: 'A' });
    const b = await createTask(owner, project, { title: 'B' });
    const c = await createTask(owner, project, { title: 'C' });
    const elsewhere = await createTask(owner, project, { title: 'In another sprint' });
    await createTask(owner, project, { title: 'In the backlog' });
    for (const t of [a, b, c]) await assign(owner, t.id, sprint.id);
    await assign(owner, elsewhere.id, other.id);

    await startSprint(owner, sprint.id);
    await setDates(sprint.id, -3, 3);
    await move(owner, a.id, 'done');
    await pool.query("UPDATE tasks SET completed_at = now() - interval '2 days' WHERE id = $1", [a.id]);

    const res = await burndown(owner, sprint.id);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.days.map((d) => d.remaining)).toEqual([3, 2, 2, 2]);
    expect(res.body.ideal).toHaveLength(7);
    expect(res.body.ideal[0].remaining).toBe(3);
    expect(res.body.ideal[6].remaining).toBe(0);
    expect(res.body.days[3].date).toBe(res.body.today);
  });

  test('moving a finished item out of Done raises the line again', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id);
    const a = await createTask(owner, project, { title: 'A' });
    await assign(owner, a.id, sprint.id);
    await startSprint(owner, sprint.id);
    await setDates(sprint.id, 0, 2);

    await move(owner, a.id, 'done');
    expect((await burndown(owner, sprint.id)).body.days.map((d) => d.remaining)).toEqual([0]);

    await move(owner, a.id, 'in_progress');
    expect((await burndown(owner, sprint.id)).body.days.map((d) => d.remaining)).toEqual([1]);
  });

  test('without an end date there is no ideal line', async () => {
    const { owner, project } = await setup();
    const sprint = await newSprint(owner, project.id);
    const a = await createTask(owner, project, { title: 'A' });
    await assign(owner, a.id, sprint.id);
    await startSprint(owner, sprint.id);

    const res = await burndown(owner, sprint.id);
    expect(res.status).toBe(200);
    expect(res.body.ideal).toBeNull();
    expect(res.body.endDate).toBeNull();
    expect(res.body.days).toHaveLength(1);
    expect(res.body.days[0].remaining).toBe(1);
  });
});