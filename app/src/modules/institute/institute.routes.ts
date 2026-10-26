import { Router } from 'express';
import {
  getBatches,
  createBatch,
  updateBatch,
  deleteBatch,
  bulkSyncBatches,
  getStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  bulkSyncStudents,
  getTimetableSlots,
  createTimetableSlot,
  updateTimetableSlot,
  deleteTimetableSlot,
  bulkSyncTimetableSlots,
  getStudentAttendance,
  recordStudentAttendance,
  alertGuardians,
} from './institute.controller.js';
import { authenticateToken } from '../../middleware/auth.middleware.js';
import { requireTenantContext } from '../../middleware/tenant.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';

export const instituteRoutes = Router();

instituteRoutes.use(authenticateToken);
instituteRoutes.use(requireTenantContext);

const ADMIN_FACULTY_ROLES = ['super_admin', 'hr_manager', 'faculty'] as const;
const ALL_INSTITUTE_ROLES = ['super_admin', 'hr_manager', 'manager', 'faculty', 'student'] as const;

// Academic Batches
instituteRoutes.get('/batches', requireRole([...ALL_INSTITUTE_ROLES]), getBatches);
instituteRoutes.post('/batches', requireRole([...ADMIN_FACULTY_ROLES]), createBatch);
instituteRoutes.post('/batches/bulk', requireRole([...ADMIN_FACULTY_ROLES]), bulkSyncBatches);
instituteRoutes.patch('/batches/:id', requireRole([...ADMIN_FACULTY_ROLES]), updateBatch);
instituteRoutes.delete('/batches/:id', requireRole([...ADMIN_FACULTY_ROLES]), deleteBatch);

// Students
instituteRoutes.get('/students', requireRole([...ALL_INSTITUTE_ROLES]), getStudents);
instituteRoutes.post('/students', requireRole([...ADMIN_FACULTY_ROLES]), createStudent);
instituteRoutes.post('/students/bulk', requireRole([...ADMIN_FACULTY_ROLES]), bulkSyncStudents);
instituteRoutes.patch('/students/:id', requireRole([...ADMIN_FACULTY_ROLES]), updateStudent);
instituteRoutes.delete('/students/:id', requireRole([...ADMIN_FACULTY_ROLES]), deleteStudent);

// Timetable Slots
instituteRoutes.get('/timetable-slots', requireRole([...ALL_INSTITUTE_ROLES]), getTimetableSlots);
instituteRoutes.post('/timetable-slots', requireRole([...ADMIN_FACULTY_ROLES]), createTimetableSlot);
instituteRoutes.post('/timetable-slots/bulk', requireRole([...ADMIN_FACULTY_ROLES]), bulkSyncTimetableSlots);
instituteRoutes.patch('/timetable-slots/:id', requireRole([...ADMIN_FACULTY_ROLES]), updateTimetableSlot);
instituteRoutes.delete('/timetable-slots/:id', requireRole([...ADMIN_FACULTY_ROLES]), deleteTimetableSlot);

// Student Attendance
instituteRoutes.get('/attendance', requireRole([...ALL_INSTITUTE_ROLES]), getStudentAttendance);
instituteRoutes.post('/attendance', requireRole([...ALL_INSTITUTE_ROLES]), recordStudentAttendance);
instituteRoutes.post('/guardian-alerts', requireRole([...ADMIN_FACULTY_ROLES]), alertGuardians);

