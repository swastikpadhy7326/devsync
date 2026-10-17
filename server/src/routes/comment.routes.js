const express = require('express');
const comments = require('../controllers/comment.controller');
const validate = require('../middleware/validate');
const { validateQuery } = validate;
const { authenticate } = require('../middleware/auth');
const { requireTaskAccess } = require('../middleware/access');
const { createCommentSchema, listCommentsQuerySchema } = require('../validators/comment.schemas');

const router = express.Router();

router.post('/tasks/:taskId/comments', authenticate, requireTaskAccess(), validate(createCommentSchema), comments.createComment);
router.get('/tasks/:taskId/comments', authenticate, requireTaskAccess(), validateQuery(listCommentsQuerySchema), comments.listComments);
router.delete('/comments/:commentId', authenticate, comments.deleteComment);

module.exports = router;