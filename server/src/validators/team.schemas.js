const { z } = require('zod');

const createTeamSchema = z.object({
  name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(100),
});

const inviteSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  role: z.enum(['admin', 'member']).default('member'),
});

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

const acceptSchema = z.object({
  token: z.string().min(1, 'token is required'),
});

module.exports = { createTeamSchema, inviteSchema, updateRoleSchema, acceptSchema };