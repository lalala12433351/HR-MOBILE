import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  createSupportThreadSchema,
  sendSupportMessageSchema,
  supportAttachmentIdParamsSchema,
  supportThreadIdParamsSchema,
  supportUploadSchema,
} from './support.schema.js';
import {
  getMySupportThreads,
  getSupportAttachmentUrl,
  getSupportThreadMessages,
  postSupportThread,
  postSupportThreadMessage,
  postSupportUpload,
} from './support.controller.js';

export const supportRoutes = Router();

supportRoutes.use(authenticateToken);
supportRoutes.use(requireTenantContext);

supportRoutes.get('/threads', getMySupportThreads);
supportRoutes.post('/threads', validateRequest({ body: createSupportThreadSchema }), postSupportThread);
supportRoutes.post('/uploads', validateRequest({ body: supportUploadSchema }), postSupportUpload);
supportRoutes.get(
  '/attachments/:id/url',
  validateRequest({ params: supportAttachmentIdParamsSchema }),
  getSupportAttachmentUrl
);
supportRoutes.get(
  '/threads/:id/messages',
  validateRequest({ params: supportThreadIdParamsSchema }),
  getSupportThreadMessages
);
supportRoutes.post(
  '/threads/:id/messages',
  validateRequest({ params: supportThreadIdParamsSchema, body: sendSupportMessageSchema }),
  postSupportThreadMessage
);
