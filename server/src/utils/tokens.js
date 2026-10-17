const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;

function signAccessToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TTL,
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateRefreshToken() {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  return { token, tokenHash: hashToken(token), expiresAt };
}

module.exports = { signAccessToken, hashToken, generateRefreshToken };