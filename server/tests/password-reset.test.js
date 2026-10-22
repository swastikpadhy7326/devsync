const crypto = require('crypto');
const { request, app, registerUser, closeDb, PASSWORD } = require('./helpers');
const pool = require('../src/db');
const { hashToken } = require('../src/utils/tokens');

jest.setTimeout(60000);
afterAll(closeDb);

const SAME_MESSAGE = 'If that email has an account, we sent a reset link.';

// forgot-password answers first and does its work afterwards, so tests wait for the database
async function waitFor(check, { timeout = 20000, interval = 300 } = {}) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Timed out waiting for the database to change');
}

const resetRows = async (userId) =>
  (
    await pool.query('SELECT * FROM password_resets WHERE user_id = $1 ORDER BY created_at', [
      userId,
    ])
  ).rows;

// The real token only exists in the email, so tests insert a known one directly
async function createResetToken(userId, { expiresInMs = 60 * 60 * 1000 } = {}) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hashToken(token), new Date(Date.now() + expiresInMs)]
  );
  return token;
}

const forgot = (email) => request(app).post('/api/auth/forgot-password').send({ email });
const reset = (token, password) =>
  request(app).post('/api/auth/reset-password').send({ token, password });

describe('POST /api/auth/forgot-password', () => {
  test('gives the same answer for an unknown email and a real one', async () => {
    const user = await registerUser();
    const real = await forgot(user.email);
    const unknown = await forgot(`nobody${Date.now()}@example.com`);

    expect(real.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(real.body.message).toBe(SAME_MESSAGE);
    expect(unknown.body).toEqual(real.body);
  });

  test('rejects a malformed email with 400', async () => {
    const res = await forgot('not-an-email');
    expect(res.status).toBe(400);
  });

  test('stores a hashed, one-hour token for a real account', async () => {
    const user = await registerUser();
    await forgot(user.email);

    const rows = await waitFor(async () => {
      const found = await resetRows(user.user.id);
      return found.length > 0 ? found : null;
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].used_at).toBeNull();
    expect(typeof rows[0].token_hash).toBe('string');
    expect(rows[0].token_hash.length).toBeGreaterThanOrEqual(32);

    const minutesLeft = (new Date(rows[0].expires_at) - Date.now()) / 60000;
    expect(minutesLeft).toBeGreaterThan(55);
    expect(minutesLeft).toBeLessThanOrEqual(61);
  });

  test('creates only one reset per minute, so inboxes cannot be flooded', async () => {
    const user = await registerUser();
    await forgot(user.email);
    await waitFor(async () => (await resetRows(user.user.id)).length === 1);

    await forgot(user.email);
    // A short fixed wait: the second request should do nothing, so there is nothing to wait for
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(await resetRows(user.user.id)).toHaveLength(1);
  });

  test('a new request cancels the older unused link', async () => {
    const user = await registerUser();
    await forgot(user.email);
    const [first] = await waitFor(async () => {
      const found = await resetRows(user.user.id);
      return found.length === 1 ? found : null;
    });

    // Pretend the first request was made a few minutes ago, so the one-minute limit does not apply
    await pool.query("UPDATE password_resets SET created_at = now() - interval '5 minutes' WHERE id = $1", [
      first.id,
    ]);

    await forgot(user.email);
    const rows = await waitFor(async () => {
      const found = await resetRows(user.user.id);
      return found.length === 2 ? found : null;
    });

    expect(rows[0].used_at).not.toBeNull();
    expect(rows[1].used_at).toBeNull();
  });
});

describe('POST /api/auth/reset-password', () => {
  test('sets the new password and signs the person out everywhere', async () => {
    const user = await registerUser();
    const token = await createResetToken(user.user.id);
    const newPassword = 'BrandNewPass456';

    const res = await reset(token, newPassword);
    expect(res.status).toBe(200);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: newPassword });
    expect(newLogin.status).toBe(200);

    // The refresh token from before the reset must no longer work
    const refresh = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: user.refreshToken });
    expect(refresh.status).toBe(401);
  });

  test('a token works only once', async () => {
    const user = await registerUser();
    const token = await createResetToken(user.user.id);

    const first = await reset(token, 'FirstNewPass123');
    const second = await reset(token, 'SecondNewPass123');

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);

    // The password from the first reset is still the one that works
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: 'FirstNewPass123' });
    expect(login.status).toBe(200);
  });

  test('rejects a token that does not exist', async () => {
    const res = await reset(crypto.randomBytes(32).toString('hex'), 'WhateverPass123');
    expect(res.status).toBe(400);
  });

  test('rejects an expired token and keeps the old password', async () => {
    const user = await registerUser();
    const token = await createResetToken(user.user.id, { expiresInMs: -60 * 1000 });

    const res = await reset(token, 'ExpiredTry123');
    expect(res.status).toBe(400);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: PASSWORD });
    expect(login.status).toBe(200);
  });

  test('a too-short password is rejected without using up the token', async () => {
    const user = await registerUser();
    const token = await createResetToken(user.user.id);

    const weak = await reset(token, 'short');
    expect(weak.status).toBe(400);

    const strong = await reset(token, 'LongEnoughPass123');
    expect(strong.status).toBe(200);
  });
});