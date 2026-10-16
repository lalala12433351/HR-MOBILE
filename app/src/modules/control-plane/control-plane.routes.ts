import { Router } from 'express';
import {
  registerTenant,
  listTenants,
  getTenantDetails,
  toggleTenantStatus,
  updateTenantPlan,
  listDatabaseSchemas,
  triggerClusterBackup,
  getAWSTelemetry,
  searchGlobalUsers,
  mapGlobalUser,
  startImpersonation,
  listSystemAuditLogs,
  deleteTenant,
  deleteGlobalUser,
  listLicensePlans,
  createLicensePlan,
  updateLicensePlan,
  deactivateLicensePlan,
} from './control-plane.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import {
  listSupportTicketsQuerySchema,
  sendSupportMessageSchema,
  supportThreadIdParamsSchema,
  updateSupportTicketSchema,
} from '../support/support.schema.js';
import {
  getPlatformSupportTicket,
  listPlatformSupportTickets,
  patchPlatformSupportTicket,
  postPlatformSupportReply,
} from '../support/support.controller.js';

export const controlPlaneRoutes = Router();

// All control-plane routes require a platform_admin operator
controlPlaneRoutes.use(authenticateToken);
controlPlaneRoutes.use(requireRole(['platform_admin']));

controlPlaneRoutes.get('/license-plans', listLicensePlans);
controlPlaneRoutes.post('/license-plans', createLicensePlan);
controlPlaneRoutes.patch('/license-plans/:id', updateLicensePlan);
controlPlaneRoutes.delete('/license-plans/:id', deactivateLicensePlan);

controlPlaneRoutes.post('/tenants', registerTenant);
controlPlaneRoutes.get('/tenants', listTenants);
controlPlaneRoutes.get('/tenants/:id', getTenantDetails);
controlPlaneRoutes.patch('/tenants/:id/status', toggleTenantStatus);
controlPlaneRoutes.patch('/tenants/:id/plan', updateTenantPlan);
controlPlaneRoutes.delete('/tenants/:id', deleteTenant);
controlPlaneRoutes.post('/tenants/:id/impersonate', startImpersonation);

controlPlaneRoutes.get('/database/schemas', listDatabaseSchemas);
controlPlaneRoutes.post('/database/backup', triggerClusterBackup);
controlPlaneRoutes.get('/telemetry/aws', getAWSTelemetry);

controlPlaneRoutes.get('/users/search', searchGlobalUsers);
controlPlaneRoutes.post('/users/map', mapGlobalUser);
controlPlaneRoutes.delete('/users/:id', deleteGlobalUser);

controlPlaneRoutes.get('/audit-logs', listSystemAuditLogs);

controlPlaneRoutes.get(
  '/support-tickets',
  validateRequest({ query: listSupportTicketsQuerySchema }),
  listPlatformSupportTickets
);
controlPlaneRoutes.get(
  '/support-tickets/:id',
  validateRequest({ params: supportThreadIdParamsSchema }),
  getPlatformSupportTicket
);
controlPlaneRoutes.post(
  '/support-tickets/:id/messages',
  validateRequest({ params: supportThreadIdParamsSchema, body: sendSupportMessageSchema }),
  postPlatformSupportReply
);
controlPlaneRoutes.patch(
  '/support-tickets/:id',
  validateRequest({ params: supportThreadIdParamsSchema, body: updateSupportTicketSchema }),
  patchPlatformSupportTicket
);
