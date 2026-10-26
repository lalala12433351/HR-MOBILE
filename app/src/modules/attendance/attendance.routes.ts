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
  getAttendanceSession,
  postPresence,
  postMissedCheckout,
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
  presencePingSchema,
  missedCheckoutSchema,
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
attendanceRoutes.get('/session', getAttendanceSession);
attendanceRoutes.post('/presence', validateRequest({ body: presencePingSchema }), postPresence);
attendanceRoutes.post('/missed-checkout', validateRequest({ body: missedCheckoutSchema }), postMissedCheckout);
attendanceRoutes.get(
  '/qr-token',
  requireRole(['super_admin', 'hr_manager', 'manager', 'faculty']),
  getOfficeQrToken
);

attendanceRoutes.get('/leaves', getLeaves);
attendanceRoutes.post('/leaves', validateRequest({ body: requestLeaveSchema }), requestLeave);
// Controller checks reporting manager / department lead. Auth role can still be
// "employee" for someone who has direct reports, so the route cannot block them.
const leaveDecisionRoles = requireRole(['super_admin', 'hr_manager', 'manager', 'employee', 'faculty']);

attendanceRoutes.put(
  '/leaves/bulk-status',
  leaveDecisionRoles,
  validateRequest({ body: bulkLeaveStatusSchema }),
  bulkUpdateLeaveStatus
);
attendanceRoutes.put(
  '/leaves/:id/status',
  leaveDecisionRoles,
  validateRequest({ body: leaveStatusSchema }),
  updateLeaveStatus
);
attendanceRoutes.put(
  '/leaves/:id/decision',
  leaveDecisionRoles,
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
