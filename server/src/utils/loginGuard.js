const WINDOW_MINUTES = 15;
// Failures inside the window that block the next attempt
const LIMITS = { pair: 5, ip: 20, email: 30 };

const clean = ({ email, ip }) => ({
  email: String(email).slice(0, 255),
  ip: String(ip || 'unknown').slice(0, 64),
});

// Is this email from this address blocked right now? If so, for how many seconds.
async function checkLocked(db, who) {
  const { email, ip } = clean(who);
  const { rows } = await db.query(
    `SELECT
       count(*) FILTER (WHERE email = $1 AND ip = $2)::int AS pair_n,
       count(*) FILTER (WHERE ip = $2)::int AS ip_n,
       count(*) FILTER (WHERE email = $1)::int AS email_n,
       EXTRACT(EPOCH FROM (min(created_at) FILTER (WHERE email = $1 AND ip = $2) + make_interval(mins => $3) - now()))::int AS pair_wait,
       EXTRACT(EPOCH FROM (min(created_at) FILTER (WHERE ip = $2) + make_interval(mins => $3) - now()))::int AS ip_wait,
       EXTRACT(EPOCH FROM (min(created_at) FILTER (WHERE email = $1) + make_interval(mins => $3) - now()))::int AS email_wait
     FROM login_attempts
     WHERE created_at > now() - make_interval(mins => $3) AND (email = $1 OR ip = $2)`,
    [email, ip, WINDOW_MINUTES]
  );
  const r = rows[0];

  const waits = [];
  if (r.pair_n >= LIMITS.pair) waits.push(r.pair_wait);
  if (r.ip_n >= LIMITS.ip) waits.push(r.ip_wait);
  if (r.email_n >= LIMITS.email) waits.push(r.email_wait);
  if (waits.length === 0) return { locked: false, retryAfter: 0 };

  // The block lifts when every counter that is over its limit has dropped below it
  return { locked: true, retryAfter: Math.max(1, ...waits.map((w) => Number(w) || 0)) };
}

async function recordFailure(db, who) {
  const { email, ip } = clean(who);
  await db.query('INSERT INTO login_attempts (email, ip) VALUES ($1, $2)', [email, ip]);
  // Keeps the table small: nothing older than a day is ever needed
  await db.query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'");
}

async function clearFailures(db, who) {
  const { email, ip } = clean(who);
  await db.query('DELETE FROM login_attempts WHERE email = $1 AND ip = $2', [email, ip]);
}

module.exports = { LIMITS, WINDOW_MINUTES, checkLocked, recordFailure, clearFailures };