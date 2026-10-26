const { request, app, registerUser, createTeam, createProject, createTask, closeDb } = require('./helpers');

jest.setTimeout(60000);
afterAll(closeDb);

const realFetch = global.fetch;

// What Gemini's API returns, in the parts our code reads
const geminiOk = (text) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  text: async () => '',
});
const geminiFail = (status) => ({
  ok: false,
  status,
  json: async () => ({}),
  text: async () => 'provider says: busy, secret-detail',
});

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key-123';
  process.env.AI_MODEL = 'model-a';
  process.env.AI_FALLBACK_MODEL = 'model-b';
  delete process.env.ANTHROPIC_API_KEY;
  global.fetch = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

afterAll(() => {
  delete process.env.GEMINI_API_KEY;
  delete process.env.AI_MODEL;
  delete process.env.AI_FALLBACK_MODEL;
});

// A team with one task and one comment, so there is something to summarize
async function setup() {
  const owner = await registerUser();
  const team = await createTeam(owner);
  const project = await createProject(owner, team);
  const task = await createTask(owner, project, { title: 'Fix login bug' });
  const comment = await request(app)
    .post(`/api/tasks/${task.id}/comments`)
    .set(owner.auth)
    .send({ body: 'Mobile users cannot sign in' });
  if (comment.status !== 201) throw new Error(`comment failed: ${comment.status}`);
  return { owner, task };
}

const summarize = (user, taskId) => request(app).post(`/api/tasks/${taskId}/summary`).set(user.auth);

describe('GET /api/ai/status', () => {
  test('requires a login', async () => {
    const res = await request(app).get('/api/ai/status');
    expect(res.status).toBe(401);
  });

  test('says the feature is off when no key is set', async () => {
    delete process.env.GEMINI_API_KEY;
    const user = await registerUser();
    const res = await request(app).get('/api/ai/status').set(user.auth);

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  test('says the feature is on when a key is set', async () => {
    const user = await registerUser();
    const res = await request(app).get('/api/ai/status').set(user.auth);

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });
});

describe('POST /api/tasks/:taskId/summary', () => {
  test('requires a login', async () => {
    const { task } = await setup();
    const res = await request(app).post(`/api/tasks/${task.id}/summary`);

    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('answers 503 when AI is not configured, without calling any provider', async () => {
    delete process.env.GEMINI_API_KEY;
    const { owner, task } = await setup();
    const res = await summarize(owner, task.id);

    expect(res.status).toBe(503);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('hides the task from people outside the team and never calls the provider', async () => {
    const { task } = await setup();
    const outsider = await registerUser();
    const res = await summarize(outsider, task.id);

    expect(res.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns a summary, sends the task and comment text, and keeps the key in a header only', async () => {
    global.fetch.mockResolvedValueOnce(geminiOk('Summary: login is broken on mobile.'));
    const { owner, task } = await setup();
    const res = await summarize(owner, task.id);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('Summary: login is broken on mobile.');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('models/model-a:generateContent');
    expect(options.headers['x-goog-api-key']).toBe('test-key-123');
    expect(options.body).toContain('Fix login bug');
    expect(options.body).toContain('Mobile users cannot sign in');
    expect(options.body).not.toContain('test-key-123');
    expect(JSON.stringify(res.body)).not.toContain('test-key-123');
  });

  test('tries the backup model when the main one is busy', async () => {
    global.fetch
      .mockResolvedValueOnce(geminiFail(503))
      .mockResolvedValueOnce(geminiOk('Summary: from the backup model.'));
    const { owner, task } = await setup();
    const res = await summarize(owner, task.id);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('Summary: from the backup model.');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toContain('models/model-a:');
    expect(global.fetch.mock.calls[1][0]).toContain('models/model-b:');
  });

  test('gives a short generic error, without provider details, when both models fail', async () => {
    global.fetch.mockResolvedValue(geminiFail(503));
    const { owner, task } = await setup();
    const res = await summarize(owner, task.id);

    expect(res.status).toBe(502);
    expect(res.body.message).toBe('The AI service is not available right now. Try again later.');
    expect(JSON.stringify(res.body)).not.toContain('secret-detail');
  });

  test('limits each person to 10 summaries per hour', async () => {
    global.fetch.mockResolvedValue(geminiOk('Summary: ok.'));
    const { owner, task } = await setup();

    for (let i = 0; i < 10; i += 1) {
      const ok = await summarize(owner, task.id);
      expect(ok.status).toBe(200);
    }
    const blocked = await summarize(owner, task.id);

    expect(blocked.status).toBe(429);
    expect(global.fetch).toHaveBeenCalledTimes(10);
  });
});