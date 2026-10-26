const { z } = require('zod');

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
});

// "before" is the timestamp of the oldest message already on screen, for loading older ones
const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.iso.datetime().optional(),
});

module.exports = { sendMessageSchema, listMessagesQuerySchema };