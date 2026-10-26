const crypto = require('crypto');
const { request, app, registerUser, createTeam, addMember, createProject, closeDb } = require('./helpers');

jest.setTimeout(60000);
afterAll(closeDb);

const meeting = (user, projectId) => request(app).get(`/api/projects/${projectId}/meeting`).set(user.auth);
const roomOf = (url) => url.replace('https://meet.jit.si/', '');

async function setup() {
  const owner = await registerUser();
  const team = await createTeam(owner);
  const project = await createProject(owner, team);
  return { owner, team, project };
}

describe('GET /api/projects/:projectId/meeting', () => {
  test('requires a login', async () => {
    const { project } = await setup();
    const res = await request(app).get(`/api/projects/${project.id}/meeting`);

    expect(res.status).toBe(401);
  });

  test('people outside the team get 404 and no link', async () => {
    const { project } = await setup();
    const outsider = await registerUser();
    const res = await meeting(outsider, project.id);

    expect(res.status).toBe(404);
    expect(res.body.url).toBeUndefined();
  });

  test('rejects a project id that is not a valid id with 400', async () => {
    const { owner } = await setup();
    const res = await meeting(owner, 'not-a-real-id');

    expect(res.status).toBe(400);
  });

  test('a team member gets a Jitsi link with a 24-character room name', async () => {
    const { owner, project } = await setup();
    const res = await meeting(owner, project.id);

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/meet\.jit\.si\/devsync-[0-9a-f]{24}$/);
  });

  test('every member of a project gets the same room', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser();
    await addMember(team, owner, member);

    const a = await meeting(owner, project.id);
    const b = await meeting(member, project.id);
    const again = await meeting(owner, project.id);

    expect(a.status).toBe(200);
    expect(b.body.url).toBe(a.body.url);
    expect(again.body.url).toBe(a.body.url);
  });

  test('the room name comes from the server secret and does not reveal the project id', async () => {
    const { owner, project } = await setup();
    const res = await meeting(owner, project.id);

    const expected = crypto
      .createHmac('sha256', process.env.JWT_SECRET)
      .update(`meeting:${project.id}`)
      .digest('hex')
      .slice(0, 24);

    expect(roomOf(res.body.url)).toBe(`devsync-${expected}`);
    expect(res.body.url).not.toContain(project.id);
    expect(res.body.url).not.toContain(project.id.replace(/-/g, ''));
  });

  test('different projects get different rooms', async () => {
    const { owner, team, project } = await setup();
    const other = await createProject(owner, team, 'Other Project');

    const a = await meeting(owner, project.id);
    const b = await meeting(owner, other.id);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.url).not.toBe(a.body.url);
  });
});