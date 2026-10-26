const express = require('express');
const ai = require('../controllers/ai.controller');
const { authenticate } = require('../middleware/auth');
const { requireTaskAccess } = require('../middleware/access');

const router = express.Router();

router.get('/ai/status', authenticate, ai.status);
router.post('/tasks/:taskId/summary', authenticate, requireTaskAccess(), ai.summarizeTask);

module.exports = router;