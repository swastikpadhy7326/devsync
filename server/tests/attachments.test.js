// The realtime layer is replaced, so tests can check what would be broadcast
jest.mock('../src/realtime', () => ({
  initRealtime: jest.fn(),
  attachRedisAdapter: jest.fn(),
  emitToProject: jest.fn(),
  emitToUser: jest.fn(),
}));

const { request, app, registerUser, createTeam, addMember, createProject, createTask, closeDb } = require('./helpers');
const pool = require('../src/db');
const realtime = require('../src/realtime');

jest.setTimeout(300000);
afterAll(closeDb);
beforeEach(() => {
  realtime.emitToProject.mockClear();
  delete process.env.ATTACHMENT_PROJECT_LIMIT_BYTES;
});
afterAll(() => {
  delete process.env.ATTACHMENT_PROJECT_LIMIT_BYTES;
});

// Just the first bytes of real files, which is all the type check looks at
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const EXE = Buffer.from('MZ\x90\x00 this is a program, not a picture');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const TYPES = [
  ['image/png', PNG],
  ['image/jpeg', JPEG],
  ['image/webp', WEBP],
  ['image/gif', GIF],
  ['application/pdf', PDF],
];
const filled = (head, total) => Buffer.concat([head, Buffer.alloc(total - head.length, 7)]);

const header = (r, name, value) => (value ? r.set(name, encodeURIComponent(value)) : r);
const sendFile = (user, projectId, { body = PNG, type = 'image/png', name = 'photo.png', caption } = {}) => {
  const r = request(app).post(`/api/projects/${projectId}/messages/file`).set(user.auth).set('Content-Type', type);
  return header(header(r, 'X-Filename', name), 'X-Caption', caption).send(body);
};
const attach = (user, taskId, { body = PNG, type = 'image/png', name = 'photo.png' } = {}) => {
  const r = request(app).post(`/api/tasks/${taskId}/attachments`).set(user.auth).set('Content-Type', type);
  return header(r, 'X-Filename', name).send(body);
};
const listFiles = (user, taskId) => request(app).get(`/api/tasks/${taskId}/attachments`).set(user.auth);
const listMessages = (user, projectId) => request(app).get(`/api/projects/${projectId}/messages`).set(user.auth);
const remove = (user, id) => request(app).delete(`/api/attachments/${id}`).set(user.auth);
const binary = (res, done) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};
const download = (user, id) => request(app).get(`/api/attachments/${id}`).set(user.auth).buffer(true).parse(binary);

async function setup() {
  const owner = await registerUser('File Owner');
  const team = await createTeam(owner);
  const project = await createProject(owner, team);
  const task = await createTask(owner, project, { title: 'With files' });
  return { owner, team, project, task };
}

describe('login and access', () => {
  test('every file route requires a login', async () => {
    const { project, task } = await setup();
    const id = '00000000-0000-4000-8000-000000000000';

    expect((await request(app).post(`/api/projects/${project.id}/messages/file`).set('Content-Type', 'image/png').send(PNG)).status).toBe(401);
    expect((await request(app).post(`/api/tasks/${task.id}/attachments`).set('Content-Type', 'image/png').send(PNG)).status).toBe(401);
    expect((await request(app).get(`/api/tasks/${task.id}/attachments`)).status).toBe(401);
    expect((await request(app).get(`/api/attachments/${id}`)).status).toBe(401);
    expect((await request(app).delete(`/api/attachments/${id}`)).status).toBe(401);
  });

  test('people outside the team get 404 on every file route and cannot trigger a broadcast', async () => {
    const { owner, project, task } = await setup();
    const uploaded = await attach(owner, task.id);
    const outsider = await registerUser();
    realtime.emitToProject.mockClear();

    expect((await sendFile(outsider, project.id)).status).toBe(404);
    expect((await attach(outsider, task.id)).status).toBe(404);
    expect((await listFiles(outsider, task.id)).status).toBe(404);
    expect((await download(outsider, uploaded.body.attachment.id)).status).toBe(404);
    expect((await remove(outsider, uploaded.body.attachment.id)).status).toBe(404);
    expect(realtime.emitToProject).not.toHaveBeenCalled();
  });
});

describe('sending files in the chat', () => {
  test('a member sends a photo with a caption, everyone is told, and it shows in the history', async () => {
    const { owner, team, project } = await setup();
    const member = await registerUser('Chat Member');
    await addMember(team, owner, member);

    const res = await sendFile(member, project.id, { caption: 'Look at this' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatchObject({
      project_id: project.id,
      user_id: member.user.id,
      user_name: 'Chat Member',
      body: 'Look at this',
      attachment_name: 'photo.png',
      attachment_type: 'image/png',
      attachment_size: PNG.length,
    });
    expect(typeof res.body.message.attachment_id).toBe('string');

    const broadcasts = realtime.emitToProject.mock.calls.filter((c) => c[1] === 'chat:message');
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0][0]).toBe(project.id);
    expect(broadcasts[0][2].message.attachment_id).toBe(res.body.message.attachment_id);

    const history = await listMessages(owner, project.id);
    expect(history.body.messages[0]).toMatchObject({ body: 'Look at this', attachment_name: 'photo.png', attachment_size: PNG.length });
  });

  test('a photo can be sent without a caption', async () => {
    const { owner, project } = await setup();
    const res = await sendFile(owner, project.id, {});

    expect(res.status).toBe(201);
    expect(res.body.message.body).toBe('');
    expect((await listMessages(owner, project.id)).body.messages).toHaveLength(1);
  });

  test('plain text messages still work and carry no file', async () => {
    const { owner, project } = await setup();
    const res = await request(app).post(`/api/projects/${project.id}/messages`).set(owner.auth).send({ body: 'just text' });

    expect(res.status).toBe(201);
    const history = await listMessages(owner, project.id);
    expect(history.body.messages[0].body).toBe('just text');
    expect(history.body.messages[0].attachment_id).toBeNull();
    expect(history.body.messages[0].attachment_name).toBeNull();
  });

  test('an empty text message is still rejected', async () => {
    const { owner, project } = await setup();
    const res = await request(app).post(`/api/projects/${project.id}/messages`).set(owner.auth).send({ body: '' });

    expect(res.status).toBe(400);
  });
});

describe('file names', () => {
  test('strips folders and unsafe characters from file names', async () => {
    const { owner, task } = await setup();
    const cases = [
      ['../../etc/passwd', 'passwd'],
      ['C:\\Users\\me\\photo.png', 'photo.png'],
      ['bad\u0000name.png', 'badname.png'],
      ['.hidden.png', 'hidden.png'],
      ['a:b?c.png', 'a_b_c.png'],
      ['', 'file'],
    ];
    for (const [given, expected] of cases) {
      const res = await attach(owner, task.id, { name: given });
      expect(res.status).toBe(201);
      expect(res.body.attachment.filename).toBe(expected);
    }
    const long = await attach(owner, task.id, { name: `${'a'.repeat(300)}.png` });
    expect(long.body.attachment.filename).toHaveLength(150);
  });

  test('keeps non-English names and captions intact', async () => {
    const { owner, project } = await setup();
    const res = await sendFile(owner, project.id, {
      body: PDF,
      type: 'application/pdf',
      name: 'résumé 简历.pdf',
      caption: '你好 👋 see the file',
    });

    expect(res.status).toBe(201);
    expect(res.body.message.attachment_name).toBe('résumé 简历.pdf');
    expect(res.body.message.body).toBe('你好 👋 see the file');
    const history = await listMessages(owner, project.id);
    expect(history.body.messages[0].attachment_name).toBe('résumé 简历.pdf');
  });
});

describe('file types', () => {
  test('accepts PNG, JPEG, WebP, GIF and PDF', async () => {
    const { owner, task } = await setup();
    for (const [type, body] of TYPES) {
      const res = await attach(owner, task.id, { body, type, name: `file.${type.split('/')[1]}` });
      expect(res.status).toBe(201);
      expect(res.body.attachment.content_type).toBe(type);
      expect(res.body.attachment.size_bytes).toBe(body.length);
    }
  });

  test('rejects SVG and other types that are not allowed', async () => {
    const { owner, project, task } = await setup();
    for (const type of ['image/svg+xml', 'text/html', 'application/zip']) {
      expect((await attach(owner, task.id, { body: SVG, type, name: 'x' })).status).toBe(415);
      expect((await sendFile(owner, project.id, { body: SVG, type, name: 'x' })).status).toBe(415);
    }
    expect((await listFiles(owner, task.id)).body.attachments).toHaveLength(0);
  });

  test('rejects files whose bytes do not match the type they claim', async () => {
    const { owner, task } = await setup();
    const bad = [
      [EXE, 'image/png'],
      [PNG, 'application/pdf'],
      [JPEG, 'image/png'],
      [PDF, 'image/jpeg'],
    ];
    for (const [body, type] of bad) {
      expect((await attach(owner, task.id, { body, type })).status).toBe(400);
    }
    expect((await listFiles(owner, task.id)).body.attachments).toHaveLength(0);
  });

  test('rejects an empty file', async () => {
    const { owner, task } = await setup();
    const res = await attach(owner, task.id, { body: Buffer.alloc(0) });

    expect(res.status).toBe(415);
  });
});

describe('size limits', () => {
  test('images: 2 MB is allowed and one byte more is refused', async () => {
    const { owner, task } = await setup();
    const ok = await attach(owner, task.id, { body: filled(PNG, 2 * 1024 * 1024) });
    const tooBig = await attach(owner, task.id, { body: filled(PNG, 2 * 1024 * 1024 + 1) });

    expect(ok.status).toBe(201);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.message).toMatch(/2 MB/);
  });

  test('a PDF over 5 MB is refused with a clear error, not a server error', async () => {
    const { owner, task } = await setup();
    const res = await attach(owner, task.id, { body: filled(PDF, 5 * 1024 * 1024 + 1), type: 'application/pdf', name: 'big.pdf' });

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/too large/i);
  });
});

describe('project storage', () => {
  test('stops uploads at the project limit, and deleting a file frees space', async () => {
    const { owner, task } = await setup();
    process.env.ATTACHMENT_PROJECT_LIMIT_BYTES = String(PNG.length * 2 + 1);

    const a = await attach(owner, task.id);
    const b = await attach(owner, task.id);
    const c = await attach(owner, task.id);
    expect([a.status, b.status, c.status]).toEqual([201, 201, 413]);
    expect(c.body.message).toMatch(/storage/i);

    expect((await remove(owner, a.body.attachment.id)).status).toBe(200);
    expect((await attach(owner, task.id)).status).toBe(201);
  });

  test('two uploads at the same moment cannot both squeeze past the limit', async () => {
    const { owner, task } = await setup();
    process.env.ATTACHMENT_PROJECT_LIMIT_BYTES = String(Math.floor(PNG.length * 1.5));

    const results = await Promise.all([attach(owner, task.id), attach(owner, task.id)]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 413]);
    expect((await listFiles(owner, task.id)).body.attachments).toHaveLength(1);
  });

  test('chat and task files share the project limit', async () => {
    const { owner, project, task } = await setup();
    process.env.ATTACHMENT_PROJECT_LIMIT_BYTES = String(PNG.length + 1);

    expect((await sendFile(owner, project.id)).status).toBe(201);
    expect((await attach(owner, task.id)).status).toBe(413);
  });

  test('limits each person to 10 uploads per minute', async () => {
    const { owner, task } = await setup();
    for (let i = 0; i < 10; i += 1) {
      expect((await attach(owner, task.id)).status).toBe(201);
    }

    expect((await attach(owner, task.id)).status).toBe(429);
  });
});

describe('downloading', () => {
  test('serves PDFs as downloads, with the exact bytes and strict headers', async () => {
    const { owner, task } = await setup();
    const up = await attach(owner, task.id, { body: PDF, type: 'application/pdf', name: 'Report 2026.pdf' });
    const res = await download(owner, up.body.attachment.id);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain('sandbox');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="Report 2026\.pdf"/);
    expect(Buffer.compare(res.body, PDF)).toBe(0);
  });

  test('serves photos inline and keeps non-English file names in the header', async () => {
    const { owner, task } = await setup();
    const up = await attach(owner, task.id, { name: 'résumé.png' });
    const res = await download(owner, up.body.attachment.id);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-disposition']).toMatch(/^inline;/);
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9.png");
    expect(Buffer.compare(res.body, PNG)).toBe(0);
  });

  test('rejects a file id that is not valid', async () => {
    const { owner } = await setup();

    expect((await download(owner, 'not-an-id')).status).toBe(400);
  });
});

describe('task attachments', () => {
  test('lists the files of one task, oldest first, with who uploaded them', async () => {
    const { owner, team, project, task } = await setup();
    const member = await registerUser('File Member');
    await addMember(team, owner, member);
    const other = await createTask(owner, project, { title: 'A different task' });

    await attach(owner, task.id, { name: 'first.png' });
    await attach(member, task.id, { body: PDF, type: 'application/pdf', name: 'second.pdf' });
    await attach(owner, other.id, { name: 'elsewhere.png' });

    const res = await listFiles(member, task.id);
    expect(res.status).toBe(200);
    expect(res.body.attachments.map((a) => [a.filename, a.uploader_name])).toEqual([
      ['first.png', 'File Owner'],
      ['second.pdf', 'File Member'],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('"data"');
  });

  test('the uploader can delete their own file', async () => {
    const { owner, team, task } = await setup();
    const member = await registerUser('Plain Member');
    await addMember(team, owner, member);

    const mine = await attach(member, task.id);
    expect((await remove(member, mine.body.attachment.id)).status).toBe(200);
  });

  test('admins and owners can delete anyone\'s file, plain members cannot', async () => {
    const { owner, team, task } = await setup();
    const member = await registerUser('Plain Member');
    const admin = await registerUser('Team Admin');
    await addMember(team, owner, member);
    await addMember(team, owner, admin, 'admin');

    const byOwner = await attach(owner, task.id, { name: 'owner.png' });
    expect((await remove(member, byOwner.body.attachment.id)).status).toBe(403);

    const byMember = await attach(member, task.id, { name: 'member.png' });
    expect((await remove(admin, byMember.body.attachment.id)).status).toBe(200);
    expect((await remove(admin, byOwner.body.attachment.id)).status).toBe(200);

    const again = await attach(member, task.id);
    expect((await remove(owner, again.body.attachment.id)).status).toBe(200);
  });

  test('deleting a file removes it everywhere and tells the project room', async () => {
    const { owner, project, task } = await setup();
    const up = await attach(owner, task.id);
    expect(realtime.emitToProject).toHaveBeenCalledWith(project.id, 'attachment:changed', { taskId: task.id });
    realtime.emitToProject.mockClear();

    expect((await remove(owner, up.body.attachment.id)).status).toBe(200);
    expect(realtime.emitToProject).toHaveBeenCalledWith(project.id, 'attachment:changed', { taskId: task.id });
    expect((await download(owner, up.body.attachment.id)).status).toBe(404);
    expect((await listFiles(owner, task.id)).body.attachments).toHaveLength(0);
  });

  test('files sent in the chat cannot be deleted', async () => {
    const { owner, project } = await setup();
    const sent = await sendFile(owner, project.id);

    expect((await remove(owner, sent.body.message.attachment_id)).status).toBe(400);
    expect((await download(owner, sent.body.message.attachment_id)).status).toBe(200);
  });

  test('deleting a task deletes its files', async () => {
    const { owner, project, task } = await setup();
    await attach(owner, task.id);
    await attach(owner, task.id);

    const del = await request(app).delete(`/api/tasks/${task.id}`).set(owner.auth);
    expect(del.status).toBeLessThan(300);

    const left = await pool.query('SELECT count(*)::int AS n FROM attachments WHERE project_id = $1', [project.id]);
    expect(left.rows[0].n).toBe(0);
  });
});

describe('archived projects', () => {
  test('are read-only for files, but existing files can still be downloaded', async () => {
    const { owner, project, task } = await setup();
    const file = await attach(owner, task.id);
    await pool.query('UPDATE projects SET is_archived = true WHERE id = $1', [project.id]);

    expect((await attach(owner, task.id)).status).toBe(400);
    expect((await sendFile(owner, project.id)).status).toBe(400);
    expect((await remove(owner, file.body.attachment.id)).status).toBe(400);
    expect((await download(owner, file.body.attachment.id)).status).toBe(200);
  });
});

describe('error handling', () => {
  test('a request with broken JSON gets 400, not a server error', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"email": ');

    expect(res.status).toBe(400);
    expect(res.body.message).toBeTruthy();
  });
});