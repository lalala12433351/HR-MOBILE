import { z } from 'zod';

const uuid = z.string().uuid();

export const attachmentSchema = z.object({
  fileKey: z.string().min(1).max(1024),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(128).nullish(),
  sizeBytes: z.number().int().nonnegative().max(100 * 1024 * 1024).optional(),
});

export const listConversationsQuerySchema = z.object({
  type: z.enum(['team_channel', 'group', 'direct', 'hr_ticket']).optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const createConversationSchema = z.object({
  type: z.enum(['group', 'direct']),
  participantIds: z.array(uuid).min(1).max(200),
  name: z.string().trim().max(255).optional(),
  description: z.string().trim().max(2000).optional(),
});

export const updateConversationSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    isArchived: z.boolean().optional(),
    muted: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const addParticipantsSchema = z.object({
  employeeIds: z.array(uuid).min(1).max(200),
});

export const listMessagesQuerySchema = z.object({
  before: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const sendMessageSchema = z.object({
  body: z.string().max(10000).optional(),
  parentMessageId: uuid.nullish(),
  attachments: z.array(attachmentSchema).max(10).optional(),
  clientId: z.string().max(64).optional(),
});

export const editMessageSchema = z.object({
  body: z.string().trim().min(1).max(10000),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

export const peopleQuerySchema = z.object({
  search: z.string().max(100).optional(),
  hrOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const TICKET_CATEGORIES = [
  'General',
  'Leave & Attendance',
  'Payroll & Salary',
  'Benefits',
  'Documents & Letters',
  'Policy Question',
  'Workplace Concern',
  'IT & Access',
] as const;

const ticketPriority = z.enum(['low', 'medium', 'high', 'urgent']);
const ticketStatus = z.enum(['open', 'in_progress', 'resolved', 'closed']);

export const createHrTicketSchema = z.object({
  subject: z.string().trim().min(3).max(255),
  category: z.string().trim().min(1).max(64),
  priority: ticketPriority.optional(),
  body: z.string().trim().min(1).max(10000),
  attachments: z.array(attachmentSchema).max(10).optional(),
});

export const listHrTicketsQuerySchema = z.object({
  status: ticketStatus.optional(),
  assigned: z.enum(['me', 'unassigned', 'all']).optional(),
});

export const updateHrTicketSchema = z
  .object({
    status: ticketStatus.optional(),
    assignedHrId: uuid.nullable().optional(),
    priority: ticketPriority.optional(),
    category: z.string().trim().min(1).max(64).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
