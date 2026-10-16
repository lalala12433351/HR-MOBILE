import { z } from 'zod';

const uuid = z.string().uuid();

export const createSupportThreadSchema = z.object({
  subject: z.string().trim().min(3).max(255),
  body: z.string().trim().min(1).max(10000),
});

export const sendSupportMessageSchema = z.object({
  body: z.string().trim().min(1).max(10000),
});

export const supportThreadIdParamsSchema = z.object({
  id: uuid,
});

export const listSupportTicketsQuerySchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
});

export const updateSupportTicketSchema = z
  .object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
