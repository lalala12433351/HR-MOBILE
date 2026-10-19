import { Router } from 'express';
import {
  recordPunch,
  getPunches,
  getOfficeQrToken,
  verifyWorkplaceLocation,
  requestLeave,
  getLeaves,
  decideLeave,
  updateLeaveStatus,
  bulkUpdateLeaveStatus,
  deleteLeave,
  getLeaveBalances,
  postAdjustLeaveBalance,
  getHolidays,
  saveHolidays,
  getRegularizations,
  requestRegularization,
  updateRegularizationStatus,
  updateAttendanceRecord,
  toggleBreak,
} from './attendance.controller.js';
import {
  recordPunchSchema,
  requestLeaveSchema,
  saveHolidaysSchema,
  leaveStatusSchema,
  bulkLeaveStatusSchema,
  adjustLeaveBalanceSchema,
  requestRegularizationSchema,
  regularizationStatusSchema,
  updateAttendanceRecordSchema,
  toggleBreakSchema,
  workplaceLocationCheckSchema,
} from './attendance.schema.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';

export const attendanceRoutes = Router();

attendanceRoutes.use(authenticateToken);
attendanceRoutes.use(requireTenantContext);

attendanceRoutes.post('/punches', validateRequest({ body: recordPunchSchema }), recordPunch);
attendanceRoutes.get('/punches', getPunches);
attendanceRoutes.post(
  '/location-check',
  validateRequest({ body: workplaceLocationCheckSchema }),
  verifyWorkplaceLocation
);
attendanceRoutes.get(
  '/qr-token',
  requireRole(['super_admin', 'hr_manager', 'manager', 'faculty']),
  getOfficeQrToken
);

attendanceRoutes.get('/leaves', getLeaves);
attendanceRoutes.post('/leaves', validateRequest({ body: requestLeaveSchema }), requestLeave);
attendanceRoutes.put(
  '/leaves/bulk-status',
  requireRole(['super_admin', 'hr_manager', 'manager']),
  validateRequest({ body: bulkLeaveStatusSchema }),
  bulkUpdateLeaveStatus
);
attendanceRoutes.put(
  '/leaves/:id/status',
  requireRole(['super_admin', 'hr_manager', 'manager']),
  validateRequest({ body: leaveStatusSchema }),
  updateLeaveStatus
);
attendanceRoutes.put(
  '/leaves/:id/decision',
  requireRole(['super_admin', 'hr_manager', 'manager']),
  decideLeave
);
attendanceRoutes.delete('/leaves/:id', deleteLeave);

attendanceRoutes.get('/leave-balances', getLeaveBalances);
attendanceRoutes.post(
  '/leave-balances/adjust',
  requireRole(['super_admin', 'hr_manager']),
  validateRequest({ body: adjustLeaveBalanceSchema }),
  postAdjustLeaveBalance
);

attendanceRoutes.get('/regularizations', getRegularizations);
attendanceRoutes.post(
  '/regularizations',
  validateRequest({ body: requestRegularizationSchema }),
  requestRegularization
);
attendanceRoutes.put(
  '/regularizations/:id/status',
  validateRequest({ body: regularizationStatusSchema }),
  updateRegularizationStatus
);

attendanceRoutes.put(
  '/records/:id',
  requireRole(['super_admin', 'hr_manager', 'manager']),
  validateRequest({ body: updateAttendanceRecordSchema }),
  updateAttendanceRecord
);

attendanceRoutes.post('/break', validateRequest({ body: toggleBreakSchema }), toggleBreak);

attendanceRoutes.get('/holidays', getHolidays);
attendanceRoutes.put(
  '/holidays',
  requireRole(['super_admin', 'hr_manager']),
  validateRequest({ body: saveHolidaysSchema }),
  saveHolidays
);
