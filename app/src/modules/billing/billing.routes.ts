import { Router } from 'express';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import {
  listClients,
  createClient,
  updateClient,
  getUnbilled,
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoiceStatus,
} from './billing.controller.js';

export const billingRoutes = Router();

billingRoutes.use(authenticateToken);
billingRoutes.use(requireTenantContext);

const writeRoles = requireRole(['super_admin', 'hr_manager']);
// Employees and faculty create billable tasks and need client names. Detail fields stay limited in listClients.
const clientListRoles = requireRole(['super_admin', 'hr_manager', 'manager', 'employee', 'faculty']);

billingRoutes.get('/clients', clientListRoles, listClients);
billingRoutes.post('/clients', writeRoles, createClient);
billingRoutes.patch('/clients/:id', writeRoles, updateClient);
billingRoutes.get('/unbilled', writeRoles, getUnbilled);
billingRoutes.get('/invoices', writeRoles, listInvoices);
billingRoutes.get('/invoices/:id', writeRoles, getInvoice);
billingRoutes.post('/invoices', writeRoles, createInvoice);
billingRoutes.patch('/invoices/:id', writeRoles, updateInvoiceStatus);
