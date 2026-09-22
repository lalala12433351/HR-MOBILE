import { AttendanceRecord } from '@/types';

/** Raw punch row shape returned by GET /attendance/punches */
export interface RawAttendancePunch {
  id: string;
  employee_id: string;
  employee_name?: string;
  punch_type?: string;
  punch_time?: string;
  punch_timestamp?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  is_within_geofence?: boolean;
  device_info?: string | null;
  ip_address?: string | null;
  office_name?: string | null;
  office_id?: string | null;
}

export interface AggregatePunchOptions {
  /** Shift start "HH:mm" used for Late detection. Defaults to 09:30. */
  shiftStart?: string;
  /** Grace period in minutes after shift start. Defaults to 15. */
  gracePeriodMinutes?: number;
  /** Hours below which a completed day is Half Day. Defaults to 7.5. */
  halfDayThresholdHours?: number;
  /** Hours below which a completed day is Absent. Defaults to 3.5. */
  absentThresholdHours?: number;
  /** Optional name/avatar lookup keyed by employee id. */
  employeeLookup?: Record<string, { name?: string; avatar?: string }>;
}

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatTime12h(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();

  if (trimmed.includes('T') || trimmed.endsWith('Z')) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
  }

  const m24 = trimmed.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/);
  if (m24) return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);

  const m12 = trimmed.match(
    /^(0?[1-9]|1[0-2]):([0-5][0-9])(?::([0-5][0-9]))?\s*(AM|PM|am|pm)$/i
  );
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

/** Mirror of backend calculateLoggedHours — overnight-safe. */
export function calculateLoggedHours(checkInStr: string, checkOutStr: string): number {
  const inM = parseTimeToMinutes(checkInStr);
  const outM = parseTimeToMinutes(checkOutStr);
  if (inM === null || outM === null) return 0;

  let diffM = outM - inM;
  if (diffM < 0) diffM += 24 * 60;

  return parseFloat(Math.min(24, Math.max(0, diffM / 60)).toFixed(2));
}

function punchTimestamp(p: RawAttendancePunch): Date | null {
  const raw = p.punch_time || p.punch_timestamp;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function normalizePunchType(p: RawAttendancePunch): 'check_in' | 'check_out' | null {
  const t = String(p.punch_type || '').toLowerCase().trim();
  if (t === 'check_in' || t === 'check-in' || t === 'in') return 'check_in';
  if (t === 'check_out' || t === 'check-out' || t === 'out') return 'check_out';
  return null;
}

function deriveStatus(
  checkIn: Date,
  workingHours: number,
  hasCheckOut: boolean,
  opts: AggregatePunchOptions
): AttendanceRecord['status'] {
  const halfDay = opts.halfDayThresholdHours ?? 7.5;
  const absent = opts.absentThresholdHours ?? 3.5;
  const grace = opts.gracePeriodMinutes ?? 15;
  const shiftStart = opts.shiftStart ?? '09:30';

  if (hasCheckOut) {
    if (workingHours > 0 && workingHours < absent) return 'Absent';
    if (workingHours > 0 && workingHours < halfDay) return 'Half Day';
  }

  const shiftMins = parseTimeToMinutes(shiftStart);
  if (shiftMins !== null) {
    const checkInMins = checkIn.getHours() * 60 + checkIn.getMinutes();
    if (checkInMins > shiftMins + grace) return 'Late';
  }

  return 'Present';
}

/**
 * Collapse raw punch rows into one AttendanceRecord per employee per local calendar day.
 * Earliest check_in → checkIn; latest check_out → checkOut.
 */
export function aggregatePunchesToDaily(
  punches: RawAttendancePunch[],
  options: AggregatePunchOptions = {}
): AttendanceRecord[] {
  if (!Array.isArray(punches) || punches.length === 0) return [];

  type DayBucket = {
    employeeId: string;
    date: string;
    checkIns: Date[];
    checkOuts: Date[];
    firstCheckInPunch: RawAttendancePunch | null;
    lastCheckOutPunch: RawAttendancePunch | null;
  };

  const buckets = new Map<string, DayBucket>();

  for (const punch of punches) {
    const ts = punchTimestamp(punch);
    if (!ts || !punch.employee_id) continue;

    const type = normalizePunchType(punch);
    if (!type) continue;

    const date = toLocalDateKey(ts);
    const key = `${punch.employee_id}|${date}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        employeeId: punch.employee_id,
        date,
        checkIns: [],
        checkOuts: [],
        firstCheckInPunch: null,
        lastCheckOutPunch: null,
      };
      buckets.set(key, bucket);
    }

    if (type === 'check_in') {
      bucket.checkIns.push(ts);
      if (
        !bucket.firstCheckInPunch ||
        ts < (punchTimestamp(bucket.firstCheckInPunch) as Date)
      ) {
        bucket.firstCheckInPunch = punch;
      }
    } else {
      bucket.checkOuts.push(ts);
      if (
        !bucket.lastCheckOutPunch ||
        ts > (punchTimestamp(bucket.lastCheckOutPunch) as Date)
      ) {
        bucket.lastCheckOutPunch = punch;
      }
    }
  }

  const records: AttendanceRecord[] = [];

  for (const bucket of buckets.values()) {
    if (bucket.checkIns.length === 0) continue;

    const earliestIn = new Date(Math.min(...bucket.checkIns.map((d) => d.getTime())));
    const latestOut =
      bucket.checkOuts.length > 0
        ? new Date(Math.max(...bucket.checkOuts.map((d) => d.getTime())))
        : null;

    const checkInStr = formatTime12h(earliestIn);
    const checkOutStr = latestOut ? formatTime12h(latestOut) : undefined;
    const workingHours =
      checkOutStr != null ? calculateLoggedHours(checkInStr, checkOutStr) : 0;

    const metaPunch = bucket.firstCheckInPunch || bucket.lastCheckOutPunch;
    const lookup = options.employeeLookup?.[bucket.employeeId];
    const lat = Number(metaPunch?.latitude);
    const lng = Number(metaPunch?.longitude);

    records.push({
      id: metaPunch?.id || `day_${bucket.employeeId}_${bucket.date}`,
      employeeId: bucket.employeeId,
      employeeName: lookup?.name || metaPunch?.employee_name || '',
      avatar: lookup?.avatar || '',
      date: bucket.date,
      checkIn: checkInStr,
      checkOut: checkOutStr,
      status: deriveStatus(earliestIn, workingHours, !!latestOut, options),
      locationName: metaPunch?.office_name || 'Office',
      latitude: Number.isFinite(lat) ? lat : 0,
      longitude: Number.isFinite(lng) ? lng : 0,
      isWithinGeofence: metaPunch?.is_within_geofence !== false,
      ipAddress: metaPunch?.ip_address || '',
      device: metaPunch?.device_info || 'Web',
      workingHours,
      breakHours: 0,
    });
  }

  records.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return a.employeeName.localeCompare(b.employeeName);
  });

  return records;
}

/** Map institute student_attendance rows into AttendanceRecord (employeeId = student id). */
export function mapStudentAttendanceToRecords(
  rows: any[],
  studentLookup: Record<string, { name?: string; avatar?: string }> = {}
): AttendanceRecord[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  return rows.map((r) => {
    const studentId = r.student_id || r.studentId;
    const lookup = studentLookup[studentId];
    const name =
      lookup?.name ||
      `${r.first_name || ''} ${r.last_name || ''}`.trim() ||
      r.student_code ||
      '';
    const date = String(r.attendance_date || r.date || '').slice(0, 10);
    const statusRaw = String(r.status || 'Present');
    const status = (
      ['Present', 'Late', 'Half Day', 'Absent', 'On Leave', 'Work From Home'].includes(statusRaw)
        ? statusRaw
        : statusRaw === 'Excused'
          ? 'On Leave'
          : 'Present'
    ) as AttendanceRecord['status'];

    const checkIn = r.check_in_time || r.checkInTime || '';
    const checkOut = r.check_out_time || r.checkOutTime || undefined;
    const workingHours =
      checkIn && checkOut ? calculateLoggedHours(String(checkIn), String(checkOut)) : 0;

    return {
      id: r.id || `stu_att_${studentId}_${date}`,
      employeeId: studentId,
      employeeName: name,
      avatar: lookup?.avatar || '',
      date,
      checkIn: String(checkIn),
      checkOut: checkOut ? String(checkOut) : undefined,
      status,
      locationName: 'Campus',
      latitude: 0,
      longitude: 0,
      isWithinGeofence: true,
      ipAddress: '',
      device: 'Student Attendance',
      workingHours,
      breakHours: 0,
    };
  });
}
