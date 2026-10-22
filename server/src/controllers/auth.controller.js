const bcrypt = require('bcryptjs');
const pool = require('../db');
const { signAccessToken, generateRefreshToken, hashToken } = require('../utils/tokens');
const crypto = require('crypto');
const { sendPasswordResetEmail } = require('../utils/mailer');

// "Forgot password": always gives the same answer, so nobody can find out who has an account.
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  const answer = { message: 'If that email has an account, we sent a reset link.' };

  // Answer first, then work in the background, so the response time does not reveal anything
  res.json(answer);

  try {
    const { rows } = await pool.query('SELECT id, name, email FROM users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) return;

    // At most one reset email per minute per person (stops inbox flooding)
    const recent = await pool.query(
      `SELECT 1 FROM password_resets
       WHERE user_id = $1 AND created_at > now() - interval '60 seconds'`,
      [user.id]
    );
    if (recent.rowCount > 0) return;

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // A new request cancels older unused links
    await pool.query(
      'UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [user.id]
    );
    await pool.query(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashToken(token), expiresAt]
    );

    await sendPasswordResetEmail({ to: user.email, name: user.name, token });
  } catch (err) {
    console.error('Forgot password failed:', err.message);
  }
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, user_id FROM password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [hashToken(token)]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This reset link is invalid or has expired' });
    }

    const reset = rows[0];
    await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
      passwordHash,
      reset.user_id,
    ]);
    await client.query('UPDATE password_resets SET used_at = now() WHERE id = $1', [reset.id]);
    // Sign the person out everywhere, in case someone else had the old password
    await client.query(
      'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [reset.user_id]
    );

    await client.query('COMMIT');
    res.json({ message: 'Password updated. You can log in now.' });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

async function issueTokens(user) {
  const accessToken = signAccessToken(user);
  const { token, tokenHash, expiresAt } = generateRefreshToken();
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [user.id, tokenHash, expiresAt]
  );
  return { accessToken, refreshToken: token };
}

exports.register = async (req, res) => {
  const { name, email, password } = req.body;

  const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    return res.status(409).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, created_at`,
    [name, email, passwordHash]
  );

  const user = rows[0];
  const tokens = await issueTokens(user);
  res.status(201).json({ user, ...tokens });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await pool.query(
    'SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1',
    [email]
  );
  const user = rows[0];

  const passwordOk = user && (await bcrypt.compare(password, user.password_hash));
  if (!passwordOk) {
    // Same message for "no such email" and "wrong password" so attackers learn nothing
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const { password_hash, ...safeUser } = user;
  const tokens = await issueTokens(safeUser);
  res.json({ user: safeUser, ...tokens });
};

exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;

  const { rows } = await pool.query(
    `SELECT rt.id, u.id AS user_id, u.email
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
    [hashToken(refreshToken)]
  );

  if (rows.length === 0) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }

  const row = rows[0];
  // Rotation: the old refresh token can only be used once
  await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
  const tokens = await issueTokens({ id: row.user_id, email: row.email });
  res.json(tokens);
};

exports.logout = async (req, res) => {
  const { refreshToken } = req.body;
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(refreshToken)]
  );
  res.json({ message: 'Logged out' });
};

exports.me = async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json({ user: rows[0] });
};