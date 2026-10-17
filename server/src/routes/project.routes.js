const express = require('express');
const projects = require('../controllers/project.controller');
const tasks = require('../controllers/task.controller');
const validate = require('../middleware/validate');
const { validateQuery } = validate;
const { authenticate } = require('../middleware/auth');
const { requireTeamRole } = require('../middleware/teamRole');
const { requireProjectAccess, requireTaskAccess } = require('../middleware/access');
const { createProjectSchema, updateProjectSchema } = require('../validators/project.schemas');
const {
  createTaskSchema, updateTaskSchema, moveTaskSchema, listTasksQuerySchema,
} = require('../validators/task.schemas');

const router = express.Router();

// Projects inside a team
router.post('/teams/:teamId/projects', authenticate, requireTeamRole('owner', 'admin'), validate(createProjectSchema), projects.createProject);
router.get('/teams/:teamId/projects', authenticate, requireTeamRole(), projects.listProjects);

// One project
router.get('/projects/:projectId', authenticate, requireProjectAccess(), projects.getProject);
router.patch('/projects/:projectId', authenticate, requireProjectAccess('owner', 'admin'), validate(updateProjectSchema), projects.updateProject);
router.get('/projects/:projectId/board', authenticate, requireProjectAccess(), tasks.getBoard);

// Tasks
router.post('/projects/:projectId/tasks', authenticate, requireProjectAccess(), validate(createTaskSchema), tasks.createTask);
router.get('/projects/:projectId/tasks', authenticate, requireProjectAccess(), validateQuery(listTasksQuerySchema), tasks.listTasks);
router.get('/tasks/:taskId', authenticate, requireTaskAccess(), tasks.getTask);
router.patch('/tasks/:taskId', authenticate, requireTaskAccess(), validate(updateTaskSchema), tasks.updateTask);
router.patch('/tasks/:taskId/move', authenticate, requireTaskAccess(), validate(moveTaskSchema), tasks.moveTask);
router.delete('/tasks/:taskId', authenticate, requireTaskAccess(), tasks.deleteTask);

module.exports = router;