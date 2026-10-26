const express = require('express');
const { z } = require('zod');
const summary = require('../controllers/summary.controller');
const validate = require('../middleware/validate');
const { validateQuery } = validate;
const { authenticate } = require('../middleware/auth');
const { requireProjectAccess } = require('../middleware/access');

const summaryQuerySchema = z.object({ assignee: z.uuid().optional() });

const router = express.Router();

router.get(
  '/projects/:projectId/summary',
  authenticate,
  requireProjectAccess(),
  validateQuery(summaryQuerySchema),
  summary.getSummary
);

module.exports = router;