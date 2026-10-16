import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  createSupportThreadSchema,
  sendSupportMessageSchema,
  supportThreadIdParamsSchema,
} from './support.schema.js';
import {
  getMySupportThreads,
  getSupportThreadMessages,
  postSupportThread,
  postSupportThreadMessage,
} from './support.controller.js';

export const supportRoutes = Router();

supportRoutes.use(authenticateToken);
supportRoutes.use(requireTenantContext);

supportRoutes.get('/threads', getMySupportThreads);
supportRoutes.post('/threads', validateRequest({ body: createSupportThreadSchema }), postSupportThread);
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
