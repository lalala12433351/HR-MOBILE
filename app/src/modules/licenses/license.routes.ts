import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { getCurrentLicense, getCurrentLicenseEvents, listPublicLicensePlans } from './license.controller.js';

export const licenseRoutes = Router();

licenseRoutes.get('/', listPublicLicensePlans);

export const tenantLicenseRoutes = Router();
tenantLicenseRoutes.use(authenticateToken);
tenantLicenseRoutes.use(requireTenantContext);
tenantLicenseRoutes.use(requireRole(['super_admin']));
tenantLicenseRoutes.get('/', getCurrentLicense);
tenantLicenseRoutes.get('/events', getCurrentLicenseEvents);
