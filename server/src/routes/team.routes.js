const express = require('express');
const controller = require('../controllers/team.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireTeamRole } = require('../middleware/teamRole');
const { createTeamSchema, inviteSchema, updateRoleSchema } = require('../validators/team.schemas');

const router = express.Router();

router.use(authenticate);

router.post('/', validate(createTeamSchema), controller.createTeam);
router.get('/', controller.listMyTeams);
router.get('/:teamId', requireTeamRole(), controller.getTeam);

router.post(
  '/:teamId/invitations',
  requireTeamRole('owner', 'admin'),
  validate(inviteSchema),
  controller.inviteMember
);
router.patch(
  '/:teamId/members/:userId',
  requireTeamRole('owner'),
  validate(updateRoleSchema),
  controller.updateMemberRole
);
router.delete('/:teamId/members/:userId', requireTeamRole(), controller.removeMember);

module.exports = router;