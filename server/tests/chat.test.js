// The realtime layer is replaced, so tests can check that a broadcast was requested
jest.mock('../src/realtime', () => ({
  initRealtime: jest.fn(),
  attachRedisAdapter: jest.fn(),
  emitToProject: jest.fn(),
  emitToUser: jest.fn(),
}));

const { request, app, registerUser, createTeam, addMember, createProject, closeDb } = require('./helpers');
const pool = require('../src/db');
const realtime = require('../src/realtime');

jest.setTimeout(120000);
afterAll(closeDb);
beforeEach(() => realtime.emitToProject.mockClear());

async function setup() {
  const owner = await registerUser();
  const team = await createTeam(owner);
  const project = await createProject(owner, team);
  return { owner, team, project };
}

const send = (user, projectId, body) =>
  request(app).post(`/api/projects/${projectId}/messages`).set(user.auth).send({ body });
const list = (user, projectId, query = '') =>
  request(app).get(`/api/projects/${projectId}/messages${query}`).set(user.auth);
const chatBroadcasts = () => realtime.emitToProject.mock.calls.filter((c) => c[1] === 'chat:message');

describe('access', () => {
  test('listing messages requires a login', async () => {
    const { project } = await setup();
    const res = await request(app).get(`/api/projects/${project.id}/messages`);
    expect(res.status).toBe(401);
  });

  test('sending a message requires a login', async () => {
    const { project } = await setup();
    const res = await request(app).post(`/api/projects/${project.id}/messages`).send({ body: 'hi' });
    expect(res.status).toBe(401);
  });

  test('people outside the team get 404 and cannot read, send or trigger a broadcast', async () => {
    const { owner, project } = await setup();
    await send(owner, project.id, 'private team talk');
    realtime.emitToProject.mockClear();

    const outsider = await registerUser();
    const read = await list(outsider, project.id);
    const write = await send(outsider, project.id, 'let me in');

    expect(read.status).toBe(404);
    expect(write.status).toBe(404);
    expect(chatBroadcasts()).toHaveLength(0);
  });
});

describe('POST /api/projects/:projectId/messages', () => {
  test('a team member can send, and the owner sees the message', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser('Chat Member');
    await addMember(team, owner, member);

    const res = await send(member, project.id, 'hello team');
    expect(res.status).toBe(201);
    expect(res.body.message.body).toBe('hello team');
    expect(res.body.message.user_id).toBe(member.user.id);
    expect(res.body.message.user_name).toBe('Chat Member');

    const seen = await list(owner, project.id);
    expect(seen.status).toBe(200);
    expect(seen.body.messages.map((m) => m.body)).toEqual(['hello team']);
  });

  test('trims spaces around the message', async () => {
    const { owner, project } = await setup();
    const res = await send(owner, project.id, '   padded message   ');

    expect(res.status).toBe(201);
    expect(res.body.message.body).toBe('padded message');
  });

  test('rejects empty and whitespace-only messages with 400', async () => {
    const { owner, project } = await setup();
    const empty = await send(owner, project.id, '');
    const spaces = await send(owner, project.id, '     ');

    expect(empty.status).toBe(400);
    expect(spaces.status).toBe(400);
    expect((await list(owner, project.id)).body.messages).toHaveLength(0);
  });

  test('accepts 2000 characters and rejects 2001', async () => {
    const { owner, project } = await setup();
    const ok = await send(owner, project.id, 'a'.repeat(2000));
    const tooLong = await send(owner, project.id, 'a'.repeat(2001));

    expect(ok.status).toBe(201);
    expect(tooLong.status).toBe(400);
  });

  test('asks the realtime layer to broadcast the saved message to the project room', async () => {
    const { owner, project } = await setup();
    const res = await send(owner, project.id, 'live message');
    const calls = chatBroadcasts();

    expect(res.status).toBe(201);
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe(project.id);
    expect(calls[0][2].message.id).toBe(res.body.message.id);
    expect(calls[0][2].message.body).toBe('live message');
  });

  test('a message sent to one project never shows up in another', async () => {
    const { owner, team, project } = await setup();
    const other = await createProject(owner, team, 'Other Project');
    await send(owner, project.id, 'only in the first project');

    const inOther = await list(owner, other.id);
    expect(inOther.status).toBe(200);
    expect(inOther.body.messages).toHaveLength(0);
  });

  test('archived projects are read-only: no new messages, history still readable', async () => {
    const { owner, project } = await setup();
    await send(owner, project.id, 'before archiving');
    await pool.query('UPDATE projects SET is_archived = true WHERE id = $1', [project.id]);
    realtime.emitToProject.mockClear();

    const blocked = await send(owner, project.id, 'too late');
    const history = await list(owner, project.id);

    expect(blocked.status).toBe(400);
    expect(chatBroadcasts()).toHaveLength(0);
    expect(history.status).toBe(200);
    expect(history.body.messages.map((m) => m.body)).toEqual(['before archiving']);
  });

  test('allows 30 messages per minute and blocks the 31st without broadcasting it', async () => {
    const { owner, project } = await setup();

    for (let i = 0; i < 30; i += 1) {
      const ok = await send(owner, project.id, `message ${i}`);
      expect(ok.status).toBe(201);
    }
    const blocked = await send(owner, project.id, 'one too many');

    expect(blocked.status).toBe(429);
    expect(chatBroadcasts()).toHaveLength(30);
    const saved = await pool.query('SELECT count(*)::int AS n FROM chat_messages WHERE project_id = $1', [project.id]);
    expect(saved.rows[0].n).toBe(30);
  });
});

describe('GET /api/projects/:projectId/messages', () => {
  test('returns messages oldest first', async () => {
    const { owner, project } = await setup();
    await send(owner, project.id, 'first');
    await send(owner, project.id, 'second');
    await send(owner, project.id, 'third');

    const res = await list(owner, project.id);
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m) => m.body)).toEqual(['first', 'second', 'third']);
    expect(res.body.hasMore).toBe(false);
  });

  test('pages backwards with limit and before', async () => {
    const { owner, project } = await setup();
    // Messages saved directly, one minute apart, so the order is exact
    const base = Date.now() - 60 * 60 * 1000;
    for (let i = 1; i <= 5; i += 1) {
      await pool.query(
        'INSERT INTO chat_messages (project_id, user_id, body, created_at) VALUES ($1, $2, $3, $4)',
        [project.id, owner.user.id, `m${i}`, new Date(base + i * 60000)]
      );
    }

    const page1 = await list(owner, project.id, '?limit=2');
    expect(page1.body.messages.map((m) => m.body)).toEqual(['m4', 'm5']);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await list(owner, project.id, `?limit=2&before=${encodeURIComponent(page1.body.messages[0].created_at)}`);
    expect(page2.body.messages.map((m) => m.body)).toEqual(['m2', 'm3']);
    expect(page2.body.hasMore).toBe(true);

    const page3 = await list(owner, project.id, `?limit=2&before=${encodeURIComponent(page2.body.messages[0].created_at)}`);
    expect(page3.body.messages.map((m) => m.body)).toEqual(['m1']);
    expect(page3.body.hasMore).toBe(false);
  });

  test('rejects a bad limit or a bad date with 400', async () => {
    const { owner, project } = await setup();

    expect((await list(owner, project.id, '?limit=0')).status).toBe(400);
    expect((await list(owner, project.id, '?limit=101')).status).toBe(400);
    expect((await list(owner, project.id, '?before=yesterday')).status).toBe(400);
  });
});