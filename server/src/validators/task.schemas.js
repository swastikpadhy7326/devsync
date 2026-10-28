const { z } = require('zod');

const status = z.enum(['todo', 'in_progress', 'done']);
const priority = z.enum(['low', 'medium', 'high']);
const taskType = z.enum(['task', 'bug', 'story']);

const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().max(5000).optional(),
  status: status.default('todo'),
  priority: priority.default('medium'),
    type: taskType.default('task'),
  assigneeId: z.uuid().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
});

const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    priority: priority.optional(),
     type: taskType.optional(),
    assigneeId: z.uuid().nullable().optional(),
    dueDate: z.iso.date().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' });

const moveTaskSchema = z.object({
  status,
  position: z.number().int().min(0).optional(), // omitted = bottom of the column
});

const listTasksQuerySchema = z.object({
  status: status.optional(),
  assignee: z.union([z.uuid(), z.literal('me')]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

module.exports = { createTaskSchema, updateTaskSchema, moveTaskSchema, listTasksQuerySchema };