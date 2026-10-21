const nodemailer = require('nodemailer');

let transporter = null;

// Email is optional. Without SMTP_HOST nothing is sent and the app works as before.
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Never throws: returns true if sent, false if skipped or failed.
async function sendInvitationEmail({ to, teamName, inviterName, role, token }) {
  const t = getTransporter();
  if (!t) {
    console.log('Invitation email skipped: SMTP_HOST is not set');
    return false;
  }

  const appUrl = process.env.APP_URL || 'http://localhost:5173';
  const from = process.env.MAIL_FROM || 'DevSync <no-reply@devsync.local>';
  const team = teamName || 'a team';
  const who = inviterName || 'A teammate';

  const text = [
    `${who} invited you to join ${team} on DevSync as ${role}.`,
    '',
    `1. Open ${appUrl} and log in with this email address (${to}).`,
    '2. Paste this invitation token into the accept-invitation box:',
    '',
    token,
    '',
    'The token expires in 7 days and can be used once.',
  ].join('\n');

  const html = `
    <p><strong>${escapeHtml(who)}</strong> invited you to join <strong>${escapeHtml(team)}</strong> on DevSync as <strong>${escapeHtml(role)}</strong>.</p>
    <ol>
      <li>Open <a href="${escapeHtml(appUrl)}">${escapeHtml(appUrl)}</a> and log in with this email address (${escapeHtml(to)}).</li>
      <li>Paste this invitation token into the accept-invitation box:</li>
    </ol>
    <p><code>${escapeHtml(token)}</code></p>
    <p>The token expires in 7 days and can be used once.</p>`;

  try {
    await t.sendMail({ from, to, subject: `You are invited to ${team} on DevSync`, text, html });
    return true;
  } catch (err) {
    console.error('Invitation email failed:', err.message);
    return false;
  }
}

module.exports = { sendInvitationEmail };