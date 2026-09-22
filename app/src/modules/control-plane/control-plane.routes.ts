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
} from './control-plane.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';

export const controlPlaneRoutes = Router();

// All control-plane routes require a platform_admin operator
controlPlaneRoutes.use(authenticateToken);
controlPlaneRoutes.use(requireRole(['platform_admin']));

controlPlaneRoutes.post('/tenants', registerTenant);
controlPlaneRoutes.get('/tenants', listTenants);
controlPlaneRoutes.get('/tenants/:id', getTenantDetails);
controlPlaneRoutes.patch('/tenants/:id/status', toggleTenantStatus);
controlPlaneRoutes.patch('/tenants/:id/plan', updateTenantPlan);
controlPlaneRoutes.post('/tenants/:id/impersonate', startImpersonation);

controlPlaneRoutes.get('/database/schemas', listDatabaseSchemas);
controlPlaneRoutes.post('/database/backup', triggerClusterBackup);
controlPlaneRoutes.get('/telemetry/aws', getAWSTelemetry);

controlPlaneRoutes.get('/users/search', searchGlobalUsers);
controlPlaneRoutes.post('/users/map', mapGlobalUser);

controlPlaneRoutes.get('/audit-logs', listSystemAuditLogs);
