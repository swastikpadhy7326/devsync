const express = require('express');
const sprints = require('../controllers/sprint.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireProjectAccess } = require('../middleware/access');
const { requireSprintAccess } = require('../middleware/sprintAccess');
const { createSprintSchema, updateSprintSchema } = require('../validators/sprint.schemas');

const router = express.Router();

router.get('/projects/:projectId/sprints', authenticate, requireProjectAccess(), sprints.listSprints);
router.post('/projects/:projectId/sprints', authenticate, requireProjectAccess('owner', 'admin'), validate(createSprintSchema), sprints.createSprint);

router.patch('/sprints/:sprintId', authenticate, requireSprintAccess('owner', 'admin'), validate(updateSprintSchema), sprints.updateSprint);
router.post('/sprints/:sprintId/start', authenticate, requireSprintAccess('owner', 'admin'), sprints.startSprint);
router.post('/sprints/:sprintId/complete', authenticate, requireSprintAccess('owner', 'admin'), sprints.completeSprint);
router.delete('/sprints/:sprintId', authenticate, requireSprintAccess('owner', 'admin'), sprints.deleteSprint);

module.exports = router;