const { request, app, registerUser, closeDb, PASSWORD } = require('./helpers');

afterAll(closeDb);

describe('POST /api/auth/register', () => {
  test('creates a user and returns tokens, never the password hash', async () => {
    const email = `new${Date.now()}@example.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New User', email, password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.password_hash).toBeUndefined();
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  test('stores the email in lowercase', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Mixed Case', email: `Mixed${Date.now()}@Example.COM`, password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(res.body.user.email.toLowerCase());
  });

  test('rejects a duplicate email with 409', async () => {
    const existing = await registerUser();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Copy Cat', email: existing.email, password: PASSWORD });

    expect(res.status).toBe(409);
  });

  test('rejects a short password with 400 and a list of errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Weak Pass', email: `weak${Date.now()}@example.com`, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('password');
  });

  test('rejects an invalid email with 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Bad Email', email: 'not-an-email', password: PASSWORD });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('logs in with the right password', async () => {
    const user = await registerUser();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.user.id);
    expect(res.body.accessToken).toBeDefined();
  });

  test('gives the same 401 for a wrong password and an unknown email', async () => {
    const user = await registerUser();
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'WrongPassword1' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: `nobody${Date.now()}@example.com`, password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });
});

describe('GET /api/auth/me', () => {
  test('returns the logged-in user', async () => {
    const user = await registerUser('Me Myself');
    const res = await request(app).get('/api/auth/me').set(user.auth);

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Me Myself');
  });

  test('rejects a request without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('rejects a tampered token', async () => {
    const user = await registerUser();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}x`);

    expect(res.status).toBe(401);
  });
});

describe('refresh tokens', () => {
  test('rotate: a refresh token works once, then it is revoked', async () => {
    const user = await registerUser();

    const first = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(user.refreshToken);

    const reuse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(reuse.status).toBe(401);

    // The new refresh token keeps working
    const second = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: first.body.refreshToken });
    expect(second.status).toBe(200);
  });

  test('a refresh token that was never issued is rejected', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'a'.repeat(80) });

    expect(res.status).toBe(401);
  });

  test('logout revokes the refresh token', async () => {
    const user = await registerUser();

    const out = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: user.refreshToken });
    expect(out.status).toBe(200);

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(res.status).toBe(401);
  });
});
