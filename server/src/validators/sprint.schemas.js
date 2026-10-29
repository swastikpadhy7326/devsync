const { z } = require('zod');

const name = z.string().trim().min(1, 'Name is required').max(100);
const goal = z.string().trim().max(1000);
const date = z.iso.date();

const datesInOrder = (d) => !d.startDate || !d.endDate || d.endDate >= d.startDate;
const datesMessage = { message: 'End date must be on or after the start date', path: ['endDate'] };

const createSprintSchema = z
  .object({
    name,
    goal: goal.optional(),
    startDate: date.nullable().optional(),
    endDate: date.nullable().optional(),
  })
  .refine(datesInOrder, datesMessage);

const updateSprintSchema = z
  .object({
    name: name.optional(),
    goal: goal.nullable().optional(),
    startDate: date.nullable().optional(),
    endDate: date.nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Provide at least one field to update' })
  .refine(datesInOrder, datesMessage);

module.exports = { createSprintSchema, updateSprintSchema };