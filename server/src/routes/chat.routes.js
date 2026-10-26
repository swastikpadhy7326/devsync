const express = require('express');
const chat = require('../controllers/chat.controller');
const validate = require('../middleware/validate');
const { validateQuery } = validate;
const { authenticate } = require('../middleware/auth');
const { requireProjectAccess } = require('../middleware/access');
const { sendMessageSchema, listMessagesQuerySchema } = require('../validators/chat.schemas');

const router = express.Router();

router.get(
  '/projects/:projectId/messages',
  authenticate,
  requireProjectAccess(),
  validateQuery(listMessagesQuerySchema),
  chat.listMessages
);
router.post(
  '/projects/:projectId/messages',
  authenticate,
  requireProjectAccess(),
  validate(sendMessageSchema),
  chat.sendMessage
);

module.exports = router;