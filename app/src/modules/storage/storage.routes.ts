import { Router } from 'express';
import {
  getPresignedUpload,
  getPresignedDownload,
  registerDocument,
} from './storage.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';

export const storageRoutes = Router();

storageRoutes.use(authenticateToken);
storageRoutes.use(requireTenantContext);

storageRoutes.post('/presigned-upload', getPresignedUpload);
storageRoutes.get('/presigned-download', getPresignedDownload);
storageRoutes.post('/documents', registerDocument);
