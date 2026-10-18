const { z } = require('zod');

const listNotificationsQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { listNotificationsQuerySchema };