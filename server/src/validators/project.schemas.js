const { z } = require('zod');

const createProjectSchema = z.object({
  name: z.string().trim().min(2, 'Project name must be at least 2 characters').max(150),
  description: z.string().trim().max(2000).optional(),
});

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' });

module.exports = { createProjectSchema, updateProjectSchema };