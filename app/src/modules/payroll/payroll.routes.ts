import { Router } from 'express';
import {
  setSalaryStructure,
  executePayrollRun,
  getPayslips,
} from './payroll.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';

export const payrollRoutes = Router();

payrollRoutes.use(authenticateToken);
payrollRoutes.use(requireTenantContext);

payrollRoutes.post('/salary-structures', requireRole(['super_admin', 'hr_manager']), setSalaryStructure);
payrollRoutes.post('/runs', requireRole(['super_admin', 'hr_manager']), executePayrollRun);
payrollRoutes.get('/payslips', getPayslips);
