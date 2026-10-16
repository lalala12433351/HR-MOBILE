import { Router } from 'express';
import {
  setupOffice,
  setupWorkplaceMode,
  setupDepartments,
  setupRoles,
  setupTeam,
  getSettings,
  saveEmploymentTypes,
  saveOnboardingFields,
  saveGeneralSettings,
  savePayrollSettings,
  saveAttendanceSettings,
  saveIdCardTemplates,
} from './setup.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { resyncTeamChannelsOnWrite } from '../chat/chat.sync.middleware.js';

export const setupRoutes = Router();

setupRoutes.use(authenticateToken);
setupRoutes.use(requireTenantContext);
setupRoutes.use(resyncTeamChannelsOnWrite);

setupRoutes.get('/settings', requireRole(['super_admin', 'hr_manager', 'employee', 'manager']), getSettings);
setupRoutes.post('/id-card-templates', requireRole(['super_admin', 'hr_manager']), saveIdCardTemplates);

setupRoutes.use(requireRole(['super_admin']));

setupRoutes.post('/office', setupOffice);
setupRoutes.post('/workplace-mode', setupWorkplaceMode);
setupRoutes.post('/departments', setupDepartments);
setupRoutes.post('/roles', setupRoles);
setupRoutes.post('/team', setupTeam);

setupRoutes.post('/employment-types', saveEmploymentTypes);
setupRoutes.post('/onboarding-fields', saveOnboardingFields);
setupRoutes.post('/general', saveGeneralSettings);
setupRoutes.post('/payroll', savePayrollSettings);
setupRoutes.post('/attendance', saveAttendanceSettings);
