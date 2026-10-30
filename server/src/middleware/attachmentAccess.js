const pool = require('../db');
const { isUuid } = require('../utils/uuid');

// Loads a file's details (never its bytes) and checks the user belongs to its project's team
const requireAttachmentAccess = () => async (req, res, next) => {
  const { attachmentId } = req.params;
  if (!isUuid(attachmentId)) return res.status(400).json({ message: 'Invalid file id' });

  const { rows } = await pool.query(
    `SELECT a.id, a.project_id, a.message_id, a.task_id, a.uploaded_by, a.filename,
            p.is_archived, tm.role
     FROM attachments a
     JOIN projects p ON p.id = a.project_id
     JOIN team_members tm ON tm.team_id = p.team_id AND tm.user_id = $2
     WHERE a.id = $1`,
    [attachmentId, req.user.id]
  );
  if (rows.length === 0) return res.status(404).json({ message: 'File not found' });

  req.attachment = rows[0];
  req.teamRole = rows[0].role;
  next();
};

module.exports = { requireAttachmentAccess };