const express = require('express');
const controller = require('../controllers/team.controller');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { acceptSchema } = require('../validators/team.schemas');

const router = express.Router();

router.use(authenticate);
router.post('/accept', validate(acceptSchema), controller.acceptInvitation);

module.exports = router;