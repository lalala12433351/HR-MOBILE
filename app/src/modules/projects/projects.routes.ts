import { Router } from 'express';
import {
  getProjects,
  createProject,
  updateProject,
  getTasks,
  createTask,
  bulkCreateTasks,
  updateTask,
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
projectRoutes.post('/projects', requireRole(['super_admin', 'manager']), createProject);
projectRoutes.patch('/projects/:id', requireRole(['super_admin', 'manager', 'hr_manager']), updateProject);

projectRoutes.get('/tasks', getTasks);
projectRoutes.post('/tasks', createTask);
projectRoutes.post('/tasks/bulk', bulkCreateTasks);
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
