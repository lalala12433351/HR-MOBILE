import { z } from 'zod';

export const AttendanceStatusEnum = z.enum([
  'PRESENT',
  'ABSENT',
  'HALF_DAY',
  'ON_LEAVE',
  'LATE',
]);

const timeFormatRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?|([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?|(0?[1-9]|1[0-2]):[0-5][0-9](:[0-5][0-9])?\s*(AM|PM|am|pm))$/i;

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();

  // 1. Try ISO 8601 parsing
  if (trimmed.includes('T') || trimmed.endsWith('Z')) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.getHours() * 60 + d.getMinutes();
    }
  }

  // 2. Try 24h format "HH:mm" or "HH:mm:ss"
  const m24 = trimmed.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/);
  if (m24) {
    const hours = parseInt(m24[1], 10);
    const mins = parseInt(m24[2], 10);
    return hours * 60 + mins;
  }

  // 3. Try 12h format "HH:mm AM/PM" or "HH:mm:ss AM/PM"
  const m12 = trimmed.match(/^(0?[1-9]|1[0-2]):([0-5][0-9])(?::([0-5][0-9]))?\s*(AM|PM|am|pm)$/i);
  if (m12) {
    let hours = parseInt(m12[1], 10);
    const mins = parseInt(m12[2], 10);
    const period = m12[4].toUpperCase();
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
  }

  return null;
}

export function calculateLoggedHours(checkInStr: string, checkOutStr: string): number {
  const inM = parseTimeToMinutes(checkInStr);
  const outM = parseTimeToMinutes(checkOutStr);
  if (inM === null || outM === null) return 0;

  let diffM = outM - inM;
  // Overnight shift handling: add 24 hours (1440 mins) if checkout is next day
  if (diffM < 0) {
    diffM += 24 * 60;
  }

  const hours = diffM / 60;
  return parseFloat(Math.min(24, Math.max(0, hours)).toFixed(2));
}

export const recordPunchSchema = z
  .object({
    employeeId: z.string().min(1, 'Employee ID is required'),
    officeId: z.string().optional().nullable(),
    punchType: z
      .enum(['check_in', 'check_out', 'CHECK_IN', 'CHECK_OUT'])
      .transform((v) => v.toLowerCase()),
    latitude: z.union([z.number(), z.string().transform(Number)]).optional(),
    longitude: z.union([z.number(), z.string().transform(Number)]).optional(),
    deviceInfo: z.string().max(255).optional().nullable(),
    selfiePhoto: z.string().max(2_000_000).optional().nullable(),
    qrToken: z.string().max(4096).optional().nullable(),
    workFromHome: z.boolean().optional(),
    checkInTime: z
      .string()
      .regex(
        timeFormatRegex,
        'Invalid checkInTime format: must be ISO 8601, HH:mm, or HH:mm:ss AM/PM'
      )
      .optional(),
    checkOutTime: z
      .string()
      .regex(
        timeFormatRegex,
        'Invalid checkOutTime format: must be ISO 8601, HH:mm, or HH:mm:ss AM/PM'
      )
      .optional(),
    attendanceStatus: z
      .string()
      .transform((v) => v.toUpperCase())
      .pipe(AttendanceStatusEnum)
      .optional(),
  })
  .refine(
    (data) => {
      if (data.checkInTime && data.checkOutTime) {
        const inM = parseTimeToMinutes(data.checkInTime);
        const outM = parseTimeToMinutes(data.checkOutTime);
        return inM !== null && outM !== null;
      }
      return true;
    },
    {
      message: 'Malformed or unparseable checkInTime / checkOutTime format',
      path: ['checkOutTime'],
    }
  );

export const requestLeaveSchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  leaveType: z
    .string()
    .transform((v) => {
      const s = String(v || '').toLowerCase().trim();
      if (s.includes('sick')) return 'sick';
      if (s.includes('earned')) return 'earned';
      if (s.includes('unpaid') || s.includes('loss')) return 'unpaid';
      if (s === 'wfh' || s.includes('work from home') || s.includes('home')) return 'wfh';
      if (s === 'casual' || s.includes('casual')) return 'casual';
      return s;
    })
    .pipe(z.enum(['casual', 'sick', 'earned', 'unpaid', 'wfh'])),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format'),
  daysCount: z.number().or(z.string().transform(Number)).pipe(z.number().min(0.5).max(365)),
  reason: z.string().min(2, 'Reason must be at least 2 characters').max(1000),
  attachmentUrl: z.string().max(2_000_000).optional().nullable(),
});

export const holidayItemSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(255),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  year: z.number().int().min(2000).max(2100),
  dayOfWeek: z.string().max(32).optional().default(''),
  isApproved: z.boolean().optional().default(true),
});

export const saveHolidaysSchema = z.object({
  holidays: z.array(holidayItemSchema).max(500),
});

export const leaveStatusSchema = z.object({
  status: z
    .string()
    .transform((v) => v.toLowerCase().trim())
    .pipe(z.enum(['approved', 'rejected', 'pending', 'cancelled'])),
  approvedBy: z.string().optional(),
  decisionNotes: z.string().max(1000).optional(),
  leaveType: z
    .string()
    .transform((v) => String(v || '').toLowerCase().trim())
    .pipe(z.enum(['unpaid']))
    .optional(),
  approveAsLop: z.boolean().optional(),
});

export const bulkLeaveStatusSchema = z.object({
  leaveIds: z.array(z.string().min(1)).min(1).max(200),
  status: z
    .string()
    .transform((v) => v.toLowerCase().trim())
    .pipe(z.enum(['approved', 'rejected'])),
  approvedBy: z.string().optional(),
  decisionNotes: z.string().max(1000).optional(),
  leaveType: z
    .string()
    .transform((v) => String(v || '').toLowerCase().trim())
    .pipe(z.enum(['unpaid']))
    .optional(),
  approveAsLop: z.boolean().optional(),
});

export const leaveBalancesQuerySchema = z.object({
  employeeId: z.string().optional(),
  year: z
    .string()
    .or(z.number())
    .transform((v) => Number(v))
    .pipe(z.number().int().min(2000).max(2100))
    .optional(),
});

export const adjustLeaveBalanceSchema = z.object({
  employeeId: z.string().min(1),
  leaveType: z
    .string()
    .transform((v) => String(v || '').toLowerCase().trim())
    .pipe(z.enum(['casual', 'sick', 'earned', 'wfh'])),
  delta: z.number().or(z.string().transform(Number)).pipe(z.number().min(-365).max(365)),
  notes: z.string().max(1000).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
});

const optionalClockTime = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    const s = String(v || '').trim();
    return s.length ? s : undefined;
  });

export const requestRegularizationSchema = z.object({
  employeeId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requestedCheckIn: optionalClockTime,
  requestedCheckOut: optionalClockTime,
  reason: z.string().min(1).max(1000),
  remarks: z.string().max(1000).optional(),
  creditCompOff: z.boolean().optional(),
});

export const regularizationStatusSchema = z.object({
  status: z
    .string()
    .transform((v) => v.toLowerCase().trim())
    .pipe(z.enum(['approved', 'rejected'])),
  approvedBy: z.string().optional(),
});

export const updateAttendanceRecordSchema = z.object({
  employeeId: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional().nullable(),
  status: z.string().optional(),
  workingHours: z.number().or(z.string().transform(Number)).optional(),
  breakHours: z.number().or(z.string().transform(Number)).optional(),
  notes: z.string().optional(),
});

export const toggleBreakSchema = z.object({
  employeeId: z.string().min(1),
  isOnBreak: z.boolean(),
  breakType: z.string().max(32).optional(),
});

export const presencePingSchema = z.object({
  latitude: z.number().gte(-90).lte(90),
  longitude: z.number().gte(-180).lte(180),
  accuracy: z.number().gte(0).lte(100000).optional().nullable(),
});

export const missedCheckoutSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/),
});

export const workplaceLocationCheckSchema = z.object({
  latitude: z.union([z.number(), z.string().transform(Number)]).pipe(z.number().gte(-90).lte(90)),
  longitude: z
    .union([z.number(), z.string().transform(Number)])
    .pipe(z.number().gte(-180).lte(180)),
  accuracy: z
    .union([z.number(), z.string().transform(Number)])
    .pipe(z.number().min(0).max(5000))
    .optional(),
});
