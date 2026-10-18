const express = require('express');
const controller = require('../controllers/notification.controller');
const { validateQuery } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { listNotificationsQuerySchema } = require('../validators/notification.schemas');

const router = express.Router();

router.use(authenticate);

router.get('/', validateQuery(listNotificationsQuerySchema), controller.listNotifications);
router.post('/read-all', controller.markAllRead);
router.patch('/:notificationId/read', controller.markRead);

module.exports = router;