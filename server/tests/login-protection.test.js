// Behind a proxy the app reads the client address from X-Forwarded-For, so these tests can pretend to be different people
process.env.TRUST_PROXY = '1';

const { request, app, registerUser, closeDb, PASSWORD } = require('./helpers');
const pool = require('../src/db');

// What the app itself decided about proxies, before these tests change it
const configuredTrust = app.get('trust proxy');
// These tests pretend to be different people through X-Forwarded-For, so they always trust one proxy hop
app.set('trust proxy', 1);

jest.setTimeout(600000);
afterAll(closeDb);

let counter = 0;
const newIp = () => {
  counter += 1;
  return `10.${Math.floor(counter / 65536) % 256}.${Math.floor(counter / 256) % 256}.${counter % 256}`;
};

const login = (email, password, ip) =>
  request(app).post('/api/auth/login').set('X-Forwarded-For', ip).send({ email, password });

const fail = async (email, ip, times) => {
  const statuses = [];
  for (let i = 0; i < times; i += 1) statuses.push((await login(email, 'wrong-password', ip)).status);
  return statuses;
};

const rows = async (email) => (await pool.query('SELECT count(*)::int AS n FROM login_attempts WHERE email = $1', [email])).rows[0].n;

describe('login attempts from one address for one email', () => {
  test('five wrong passwords get 401, and the sixth attempt is blocked with 429 and a wait time', async () => {
    const user = await registerUser();
    const ip = newIp();

    expect(await fail(user.email, ip, 5)).toEqual([401, 401, 401, 401, 401]);

    const blocked = await login(user.email, 'wrong-password', ip);
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/Too many failed login attempts/);
    const wait = Number(blocked.headers['retry-after']);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(900);
  });

  test('while blocked, even the right password is refused', async () => {
    const user = await registerUser();
    const ip = newIp();
    await fail(user.email, ip, 5);

    expect((await login(user.email, PASSWORD, ip)).status).toBe(429);
  });

  test('the owner can still log in from another address while a stranger is blocked', async () => {
    const user = await registerUser();
    const attacker = newIp();
    await fail(user.email, attacker, 5);

    const owner = await login(user.email, PASSWORD, newIp());
    expect(owner.status).toBe(200);
    expect(owner.body.accessToken).toBeTruthy();
  });

  test('a wrong password without any earlier failures is an ordinary 401', async () => {
    const user = await registerUser();
    const res = await login(user.email, 'wrong-password', newIp());

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
    expect(res.headers['retry-after']).toBeUndefined();
  });

  test('a successful login clears the failures of that email and address', async () => {
    const user = await registerUser();
    const ip = newIp();
    await fail(user.email, ip, 4);

    expect((await login(user.email, PASSWORD, ip)).status).toBe(200);
    expect(await rows(user.email)).toBe(0);
    expect(await fail(user.email, ip, 4)).toEqual([401, 401, 401, 401]);
    expect((await login(user.email, PASSWORD, ip)).status).toBe(200);
  });

  test('blocked attempts are not counted again', async () => {
    const user = await registerUser();
    const ip = newIp();
    await fail(user.email, ip, 5);

    for (let i = 0; i < 3; i += 1) expect((await login(user.email, 'wrong-password', ip)).status).toBe(429);
    expect(await rows(user.email)).toBe(5);
  });

  test('upper and lower case versions of an email count together', async () => {
    const user = await registerUser();
    const ip = newIp();

    for (let i = 0; i < 3; i += 1) await login(user.email.toUpperCase(), 'wrong-password', ip);
    for (let i = 0; i < 2; i += 1) await login(user.email, 'wrong-password', ip);

    expect((await login(user.email, 'wrong-password', ip)).status).toBe(429);
  });
});

describe('unknown emails', () => {
  test('are limited too, and the blocked answer has the same shape as for a real account', async () => {
    const real = await registerUser();
    const ghost = `ghost${Date.now()}@example.com`;
    const ip = newIp();
    const ip2 = newIp();

    expect(await fail(ghost, ip, 5)).toEqual([401, 401, 401, 401, 401]);
    await fail(real.email, ip2, 5);

    const ghostBlocked = await login(ghost, 'wrong-password', ip);
    const realBlocked = await login(real.email, 'wrong-password', ip2);

    expect(ghostBlocked.status).toBe(429);
    expect(realBlocked.status).toBe(429);
    expect(Object.keys(ghostBlocked.body)).toEqual(Object.keys(realBlocked.body));
    expect(ghostBlocked.body.message).toMatch(/Too many failed login attempts/);
    expect(ghostBlocked.headers['retry-after']).toBeDefined();
    expect(realBlocked.headers['retry-after']).toBeDefined();
  });
});

describe('the other two limits', () => {
  test('20 failures from one address across many emails block that address', async () => {
    const user = await registerUser();
    const ip = newIp();

    for (let i = 0; i < 20; i += 1) {
      expect((await login(`spray${Date.now()}-${i}@example.com`, 'wrong-password', ip)).status).toBe(401);
    }

    expect((await login(user.email, PASSWORD, ip)).status).toBe(429);
    expect((await login(user.email, PASSWORD, newIp())).status).toBe(200);
  });

  test('30 failures for one email from different addresses slow that account down for everyone', async () => {
    const user = await registerUser();

    for (let i = 0; i < 30; i += 1) {
      expect((await login(user.email, 'wrong-password', newIp())).status).toBe(401);
    }

    const fresh = await login(user.email, PASSWORD, newIp());
    expect(fresh.status).toBe(429);
    expect(fresh.headers['retry-after']).toBeDefined();
  });
});

describe('the time window', () => {
  test('the block lifts once the failures are older than 15 minutes', async () => {
    const user = await registerUser();
    const ip = newIp();
    await fail(user.email, ip, 5);
    expect((await login(user.email, PASSWORD, ip)).status).toBe(429);

    await pool.query("UPDATE login_attempts SET created_at = now() - interval '16 minutes' WHERE email = $1", [user.email]);

    expect((await login(user.email, PASSWORD, ip)).status).toBe(200);
  });

  test('the wait shrinks as the failures get older', async () => {
    const user = await registerUser();
    const ip = newIp();
    await fail(user.email, ip, 5);

    await pool.query("UPDATE login_attempts SET created_at = now() - interval '14 minutes' WHERE email = $1", [user.email]);

    const res = await login(user.email, 'wrong-password', ip);
    expect(res.status).toBe(429);
    const wait = Number(res.headers['retry-after']);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(61);
  });

  test('failures older than a day are cleaned up', async () => {
    const user = await registerUser();
    const ip = newIp();
    await pool.query("INSERT INTO login_attempts (email, ip, created_at) VALUES ('stale@example.com', $1, now() - interval '2 days')", [ip]);

    await login(user.email, 'wrong-password', ip);

    const stale = await pool.query("SELECT count(*)::int AS n FROM login_attempts WHERE email = 'stale@example.com' AND ip = $1", [ip]);
    expect(stale.rows[0].n).toBe(0);
  });
});

describe('proxy setting', () => {
  test('the app trusts one proxy hop when TRUST_PROXY is 1, so it sees the real client address', () => {
    expect(configuredTrust).toBe(1);
  });
});