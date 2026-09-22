import { Router } from 'express';
import {
  getOffices,
  createOffice,
  updateOffice,
  deleteOffice,
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  getJobRoles,
  createJobRole,
  updateJobRole,
  deleteJobRole,
} from './org.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';

export const orgRoutes = Router();

orgRoutes.use(authenticateToken);
orgRoutes.use(requireTenantContext);

const write = requireRole(['super_admin', 'hr_manager']);

orgRoutes.get('/offices', getOffices);
orgRoutes.post('/offices', write, createOffice);
orgRoutes.patch('/offices/:id', write, updateOffice);
orgRoutes.delete('/offices/:id', write, deleteOffice);

orgRoutes.get('/departments', getDepartments);
orgRoutes.post('/departments', write, createDepartment);
orgRoutes.patch('/departments/:id', write, updateDepartment);
orgRoutes.delete('/departments/:id', write, deleteDepartment);

orgRoutes.get('/teams', getTeams);
orgRoutes.post('/teams', write, createTeam);
orgRoutes.patch('/teams/:id', write, updateTeam);
orgRoutes.delete('/teams/:id', write, deleteTeam);

orgRoutes.get('/job-roles', getJobRoles);
orgRoutes.post('/job-roles', write, createJobRole);
orgRoutes.patch('/job-roles/:id', write, updateJobRole);
orgRoutes.delete('/job-roles/:id', write, deleteJobRole);
