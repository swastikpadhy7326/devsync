const express = require('express');
const projects = require('../controllers/project.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireTeamRole } = require('../middleware/teamRole');
const { requireProjectAccess } = require('../middleware/access');
const { createProjectSchema, updateProjectSchema } = require('../validators/project.schemas');

const router = express.Router();

// Projects inside a team
router.post('/teams/:teamId/projects', authenticate, requireTeamRole('owner', 'admin'), validate(createProjectSchema), projects.createProject);
router.get('/teams/:teamId/projects', authenticate, requireTeamRole(), projects.listProjects);

// One project
router.get('/projects/:projectId', authenticate, requireProjectAccess(), projects.getProject);
router.patch('/projects/:projectId', authenticate, requireProjectAccess('owner', 'admin'), validate(updateProjectSchema), projects.updateProject);

module.exports = router;