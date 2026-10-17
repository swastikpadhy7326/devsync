const bcrypt = require('bcryptjs');
const pool = require('../db');
const { signAccessToken, generateRefreshToken, hashToken } = require('../utils/tokens');

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