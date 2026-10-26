import { Router } from 'express';
import {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getUnbilledWork,
  listProjectInvoices,
  createProjectInvoice,
  updateInvoice,
  getTasks,
  createTask,
  bulkCreateTasks,
  updateTask,
  reorderTasks,
  deleteTask,
  verifyTaskTracking,
  logTimesheet,
  getTimesheets,
  updateTimesheet,
  bulkUpdateTimesheets,
  deleteTimesheet,
} from './projects.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';

export const projectRoutes = Router();

projectRoutes.use(authenticateToken);
projectRoutes.use(requireTenantContext);

projectRoutes.get('/projects', getProjects);
projectRoutes.post('/projects', createProject);
projectRoutes.get('/projects/:id/unbilled', requireRole(['super_admin', 'manager', 'hr_manager']), getUnbilledWork);
projectRoutes.get('/projects/:id/invoices', requireRole(['super_admin', 'manager', 'hr_manager']), listProjectInvoices);
projectRoutes.post('/projects/:id/invoices', requireRole(['super_admin', 'manager', 'hr_manager']), createProjectInvoice);
projectRoutes.patch('/invoices/:id', requireRole(['super_admin', 'manager', 'hr_manager']), updateInvoice);
projectRoutes.patch('/projects/:id', requireRole(['super_admin', 'manager', 'hr_manager']), updateProject);
projectRoutes.delete('/projects/:id', requireRole(['super_admin', 'manager', 'hr_manager']), deleteProject);

projectRoutes.get('/tasks', getTasks);
projectRoutes.post('/tasks', createTask);
projectRoutes.post('/tasks/bulk', bulkCreateTasks);
projectRoutes.post('/tasks/reorder', reorderTasks);
projectRoutes.patch('/tasks/:id', updateTask);
projectRoutes.delete('/tasks/:id', deleteTask);
projectRoutes.post('/tasks/:id/verify-tracking', verifyTaskTracking);
projectRoutes.get('/tasks/:id/verify-tracking', verifyTaskTracking);

projectRoutes.post('/timesheets', logTimesheet);
projectRoutes.get('/timesheets', getTimesheets);
projectRoutes.patch(
  '/timesheets/bulk',
  requireRole(['super_admin', 'hr_manager', 'manager']),
  bulkUpdateTimesheets
);
projectRoutes.patch('/timesheets/:id', updateTimesheet);
projectRoutes.delete('/timesheets/:id', deleteTimesheet);
