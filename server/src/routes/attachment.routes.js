const express = require('express');
const attachments = require('../controllers/attachment.controller');
const { authenticate } = require('../middleware/auth');
const { requireProjectAccess, requireTaskAccess } = require('../middleware/access');
const { requireAttachmentAccess } = require('../middleware/attachmentAccess');
const { ALLOWED_TYPES, MAX_PDF_BYTES } = require('../utils/files');

// The file arrives as the raw request body. Anything over 5 MB is refused before it is read in full.
const rawFile = express.raw({ type: ALLOWED_TYPES, limit: MAX_PDF_BYTES });

const router = express.Router();

router.post('/projects/:projectId/messages/file', authenticate, requireProjectAccess(), rawFile, attachments.sendFileMessage);

router.get('/tasks/:taskId/attachments', authenticate, requireTaskAccess(), attachments.listTaskAttachments);
router.post('/tasks/:taskId/attachments', authenticate, requireTaskAccess(), rawFile, attachments.addTaskAttachment);

router.get('/attachments/:attachmentId', authenticate, requireAttachmentAccess(), attachments.download);
router.delete('/attachments/:attachmentId', authenticate, requireAttachmentAccess(), attachments.remove);

module.exports = router;