import { z } from 'zod';

export const PriorityLevelEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const AnnouncementCategoryEnum = z.enum([
  'GENERAL',
  'HR_POLICY',
  'EVENT',
  'ACADEMIC',
  'IT_ALERT',
]);

export const AllowedMimeTypesEnum = z.enum([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

export const attachmentSchema = z.object({
  fileName: z.string().min(1, 'File name is required').max(255),
  fileUrl: z.string().url('File URL must be a valid URL'),
  fileSize: z
    .number()
    .min(1, 'File size must be positive')
    .max(25 * 1024 * 1024, 'File size cannot exceed 25MB'),
  mimeType: AllowedMimeTypesEnum,
});

export const createAnnouncementSchema = z.object({
  title: z.string().min(2, 'Title must be at least 2 characters').max(255),
  content: z.string().min(5, 'Content must be at least 5 characters'),
  authorEmployeeId: z.string().optional().nullable(),
  targetDepartmentId: z.string().optional().nullable(),
  priority: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(PriorityLevelEnum)
    .default('NORMAL'),
  category: z
    .string()
    .transform((v) => v.toUpperCase())
    .pipe(AnnouncementCategoryEnum)
    .default('GENERAL'),
  pinToHeaderBanner: z.boolean().default(false),
  tags: z
    .union([
      z.array(z.string()),
      z.string().transform((str) => str.split(',')),
    ])
    .transform((arr) => {
      const cleaned = arr
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 32);
      return Array.from(new Set(cleaned)).slice(0, 10);
    })
    .default([]),
  attachment: attachmentSchema.optional().nullable(),
});
