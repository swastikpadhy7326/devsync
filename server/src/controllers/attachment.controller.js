const pool = require('../db');
const { emitToProject } = require('../realtime');
const {
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  projectLimitBytes,
  detectType,
  cleanName,
  contentDisposition,
} = require('../utils/files');

// A simple per-person limit: 10 uploads per minute (kept in memory)
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 10;
const uploads = new Map();

function allowUpload(userId) {
  const now = Date.now();
  const recent = (uploads.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    uploads.set(userId, recent);
    return false;
  }
  recent.push(now);
  uploads.set(userId, recent);
  return true;
}

// Checks the upload. Sends the error and returns null if something is wrong.
function checkUpload(req, res, archived) {
  if (archived) {
    res.status(400).json({ message: 'This project is archived' });
    return null;
  }
  if (!allowUpload(req.user.id)) {
    res.status(429).json({ message: 'You are uploading too fast. Wait a moment.' });
    return null;
  }

  const file = req.body;
  if (!Buffer.isBuffer(file) || file.length === 0) {
    res.status(415).json({ message: 'Send a PNG, JPEG, WebP, GIF or PDF file' });
    return null;
  }

  const type = detectType(file);
  const declared = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!type || type !== declared) {
    res.status(400).json({ message: 'The file content does not match a supported type (PNG, JPEG, WebP, GIF or PDF)' });
    return null;
  }
  if (type === 'application/pdf' && file.length > MAX_PDF_BYTES) {
    res.status(413).json({ message: 'PDF files can be up to 5 MB' });
    return null;
  }
  if (type !== 'application/pdf' && file.length > MAX_IMAGE_BYTES) {
    res.status(413).json({ message: 'Images can be up to 2 MB' });
    return null;
  }

  return { file, type, name: cleanName(req.headers['x-filename']) };
}

// Called inside a transaction, after taking the project's lock, so two uploads cannot both squeeze past the limit
async function withinQuota(client, projectId, size) {
  const { rows } = await client.query(
    'SELECT COALESCE(SUM(size_bytes), 0)::bigint AS used FROM attachments WHERE project_id = $1',
    [projectId]
  );
  return Number(rows[0].used) + size <= projectLimitBytes();
}

const lock = (client, projectId) => client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [projectId]);
const QUOTA_MESSAGE = 'This project has used up its file storage';

// A chat message that carries a file, with an optional caption in the X-Caption header
exports.sendFileMessage = async (req, res) => {
  const upload = checkUpload(req, res, req.project.is_archived);
  if (!upload) return;

  let caption = '';
  try {
    caption = decodeURIComponent(String(req.headers['x-caption'] || '')).trim();
  } catch {
    caption = '';
  }
  if (caption.length > 2000) return res.status(400).json({ message: 'The caption is too long' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lock(client, req.project.id);
    if (!(await withinQuota(client, req.project.id, upload.file.length))) {
      await client.query('ROLLBACK');
      return res.status(413).json({ message: QUOTA_MESSAGE });
    }

    const msg = await client.query(
      `INSERT INTO chat_messages (project_id, user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, project_id, user_id, body, created_at`,
      [req.project.id, req.user.id, caption]
    );
    const att = await client.query(
      `INSERT INTO attachments (project_id, message_id, uploaded_by, filename, content_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, filename, content_type, size_bytes`,
      [req.project.id, msg.rows[0].id, req.user.id, upload.name, upload.type, upload.file.length, upload.file]
    );
    await client.query('COMMIT');

    const user = await pool.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    const message = {
      ...msg.rows[0],
      user_name: user.rows[0].name,
      attachment_id: att.rows[0].id,
      attachment_name: att.rows[0].filename,
      attachment_type: att.rows[0].content_type,
      attachment_size: att.rows[0].size_bytes,
    };
    emitToProject(req.project.id, 'chat:message', { message });
    res.status(201).json({ message });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.addTaskAttachment = async (req, res) => {
  const upload = checkUpload(req, res, req.task.is_archived);
  if (!upload) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lock(client, req.task.project_id);
    if (!(await withinQuota(client, req.task.project_id, upload.file.length))) {
      await client.query('ROLLBACK');
      return res.status(413).json({ message: QUOTA_MESSAGE });
    }

    const { rows } = await client.query(
      `INSERT INTO attachments (project_id, task_id, uploaded_by, filename, content_type, size_bytes, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, filename, content_type, size_bytes, created_at, uploaded_by`,
      [req.task.project_id, req.task.id, req.user.id, upload.name, upload.type, upload.file.length, upload.file]
    );
    await client.query('COMMIT');

    emitToProject(req.task.project_id, 'attachment:changed', { taskId: req.task.id });
    res.status(201).json({ attachment: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Details only, never the bytes
exports.listTaskAttachments = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT a.id, a.filename, a.content_type, a.size_bytes, a.created_at, a.uploaded_by, u.name AS uploader_name
     FROM attachments a
     LEFT JOIN users u ON u.id = a.uploaded_by
     WHERE a.task_id = $1
     ORDER BY a.created_at, a.id`,
    [req.task.id]
  );
  res.json({ attachments: rows });
};

// Photos may be shown in the page, PDFs are always downloaded. Strict headers either way.
exports.download = async (req, res) => {
  const { rows } = await pool.query('SELECT data, filename, content_type FROM attachments WHERE id = $1', [
    req.attachment.id,
  ]);
  if (rows.length === 0) return res.status(404).json({ message: 'File not found' });

  const file = rows[0];
  const kind = file.content_type === 'application/pdf' ? 'attachment' : 'inline';
  res.set({
    'Content-Type': file.content_type,
    'Content-Length': String(file.data.length),
    'Content-Disposition': contentDisposition(kind, file.filename),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cache-Control': 'private, max-age=3600',
  });
  res.send(file.data);
};

// Only files on tasks can be deleted, like chat messages cannot be deleted
exports.remove = async (req, res) => {
  const a = req.attachment;
  if (a.is_archived) return res.status(400).json({ message: 'This project is archived' });
  if (!a.task_id) return res.status(400).json({ message: 'Files sent in the chat cannot be deleted' });
  if (a.uploaded_by !== req.user.id && !['owner', 'admin'].includes(a.role)) {
    return res.status(403).json({ message: 'You do not have permission to do this' });
  }

  await pool.query('DELETE FROM attachments WHERE id = $1', [a.id]);
  emitToProject(a.project_id, 'attachment:changed', { taskId: a.task_id });
  res.json({ message: 'File deleted' });
};