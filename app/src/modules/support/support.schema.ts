import { z } from 'zod';

const uuid = z.string().uuid();

export const supportPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);
export const supportStatusSchema = z.enum(['open', 'in_progress', 'resolved', 'closed']);

export const supportAttachmentInputSchema = z.object({
  fileKey: z.string().trim().min(1).max(512),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(128).optional().nullable(),
  sizeBytes: z.number().int().nonnegative().max(100_000_000).optional(),
});

export const createSupportThreadSchema = z
  .object({
    subject: z.string().trim().min(3).max(255),
    body: z.string().trim().max(10000).optional().default(''),
    category: z.string().trim().min(1).max(64).optional().default('General'),
    priority: supportPrioritySchema.optional().default('medium'),
    attachments: z.array(supportAttachmentInputSchema).max(10).optional(),
  })
  .refine((v) => (v.body && v.body.length > 0) || (v.attachments && v.attachments.length > 0), {
    message: 'Write a message or attach a file.',
  });

export const sendSupportMessageSchema = z
  .object({
    body: z.string().trim().max(10000).optional().default(''),
    attachments: z.array(supportAttachmentInputSchema).max(10).optional(),
  })
  .refine((v) => (v.body && v.body.length > 0) || (v.attachments && v.attachments.length > 0), {
    message: 'Write a message or attach a file.',
  });

export const supportUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(128).optional().default('application/octet-stream'),
  fileSizeBytes: z.number().int().nonnegative().max(100_000_000).optional(),
});

export const supportThreadIdParamsSchema = z.object({
  id: uuid,
});

export const supportAttachmentIdParamsSchema = z.object({
  id: uuid,
});

export const listSupportTicketsQuerySchema = z.object({
  status: supportStatusSchema.optional(),
});

export const updateSupportTicketSchema = z
  .object({
    status: supportStatusSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
