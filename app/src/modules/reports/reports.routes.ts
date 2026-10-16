import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { exportReportCsv, getReportSummary } from './reports.controller.js';

export const reportsRoutes = Router();

reportsRoutes.use(authenticateToken);
reportsRoutes.use(requireTenantContext);
reportsRoutes.use(requireRole(['super_admin', 'hr_manager']));
reportsRoutes.get('/summary', getReportSummary);
reportsRoutes.get('/attendance.csv', exportReportCsv);
