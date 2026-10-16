import { Router } from 'express';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  updateBankDetails,
} from './identity.controller.js';
import { resendInvite } from './resendInvite.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { resyncTeamChannelsOnWrite } from '../chat/chat.sync.middleware.js';

export const identityRoutes = Router();

identityRoutes.use(authenticateToken);
identityRoutes.use(requireTenantContext);
identityRoutes.use(resyncTeamChannelsOnWrite);

identityRoutes.get('/employees', getEmployees);
identityRoutes.get('/employees/:id', getEmployeeById);
identityRoutes.post('/employees', requireRole(['super_admin', 'hr_manager']), createEmployee);
identityRoutes.post('/employees/:id/resend-invite', requireRole(['super_admin', 'hr_manager']), resendInvite);
identityRoutes.put('/employees/:id', requireRole(['super_admin', 'hr_manager', 'manager', 'employee']), updateEmployee);
identityRoutes.patch('/employees/:id', requireRole(['super_admin', 'hr_manager', 'manager', 'employee']), updateEmployee);
identityRoutes.put('/employees/:id/bank-details', requireRole(['super_admin', 'hr_manager', 'manager', 'employee']), updateBankDetails);
