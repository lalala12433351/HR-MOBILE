import { AttendanceRecord, AttendanceSession } from '@/types';

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

export function toLocalDateKey(d: Date = new Date()): string {
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

export function parseClockToDate(timeStr: string | undefined, refDate: Date = new Date()): Date | null {
  if (!timeStr || timeStr === '—' || timeStr.includes('--:--')) return null;
  const cleanStr = timeStr.replace(/\s*\(GMT[^\)]*\)/gi, '').trim();
  const match = cleanStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = match[3] ? parseInt(match[3], 10) : 0;
  const meridian = match[4]?.toUpperCase();

  if (meridian === 'PM' && hours < 12) hours += 12;
  else if (meridian === 'AM' && hours === 12) hours = 0;

  const d = new Date(refDate);
  d.setHours(hours, minutes, seconds, 0);
  return d;
}

export function sessionsFromRecord(record?: AttendanceRecord | null): AttendanceSession[] {
  if (!record?.checkIn) return [];
  if (Array.isArray(record.sessions) && record.sessions.length > 0) {
    return record.sessions.map((s) => ({ ...s }));
  }
  return [
    {
      checkIn: record.checkIn,
      checkOut: record.checkOut,
      locationName: record.locationName,
      workingHours: record.workingHours || 0,
    },
  ];
}

export function hasOpenAttendanceSession(record?: AttendanceRecord | null): boolean {
  if (!record?.checkIn) return false;
  const sessions = sessionsFromRecord(record);
  if (sessions.length === 0) return false;
  return sessions.some((s) => !s.checkOut);
}

function looksRemotePlace(value?: string | null): boolean {
  const text = String(value || '').toLowerCase();
  return text.includes('wfh') || text.includes('work from home') || text.includes('remote');
}

export function isRemoteAttendanceRecord(record?: AttendanceRecord | null): boolean {
  if (!record) return false;
  if (looksRemotePlace(record.locationName) || looksRemotePlace(record.status) || looksRemotePlace(record.device)) {
    return true;
  }
  const open = sessionsFromRecord(record).find((session) => !session.checkOut);
  return looksRemotePlace(open?.locationName);
}

export function openSessionCheckInDate(record?: AttendanceRecord | null, now: Date = new Date()): Date | null {
  if (!record?.checkIn) return null;
  const sessions = sessionsFromRecord(record);
  const open = [...sessions].reverse().find((session) => !session.checkOut);
  return parseClockToDate(open?.checkIn || record.checkIn, now);
}

export function attendanceElapsedSeconds(record: AttendanceRecord | undefined, now: Date = new Date()): number {
  if (!record?.checkIn) return 0;
  const sessions = sessionsFromRecord(record);
  let secs = 0;
  for (const session of sessions) {
    const inDate = parseClockToDate(session.checkIn, now);
    if (!inDate) continue;
    if (session.checkOut) {
      const outDate = parseClockToDate(session.checkOut, now);
      if (outDate) {
        let diff = outDate.getTime() - inDate.getTime();
        if (diff < 0) diff += 24 * 3600 * 1000;
        secs += Math.max(0, Math.floor(diff / 1000));
      } else {
        secs += Math.max(0, Math.round((session.workingHours || 0) * 3600));
      }
    } else {
      secs += Math.max(0, Math.floor((now.getTime() - inDate.getTime()) / 1000));
    }
  }
  return secs;
}

export function applyPunchToDailyRecord(
  existing: AttendanceRecord | undefined,
  punch: {
    type: 'check_in' | 'check_out';
    time: string;
    date: string;
    employeeId: string;
    employeeName: string;
    avatar?: string;
    locationName?: string;
    latitude?: number;
    longitude?: number;
    isWithinGeofence?: boolean;
    ipAddress?: string;
    device?: string;
    status?: AttendanceRecord['status'];
    id?: string;
    selfiePhoto?: string | null;
  }
): AttendanceRecord {
  const sessions = sessionsFromRecord(existing);
  const loc = punch.locationName || existing?.locationName || 'Office';

  if (punch.type === 'check_in') {
    if (!sessions.some((s) => !s.checkOut)) {
      sessions.push({
        checkIn: punch.time,
        locationName: loc,
        workingHours: 0,
      });
    }
  } else {
    const openIdx = sessions.findIndex((s) => !s.checkOut);
    if (openIdx >= 0) {
      const hours = calculateLoggedHours(sessions[openIdx].checkIn, punch.time);
      sessions[openIdx] = {
        ...sessions[openIdx],
        checkOut: punch.time,
        workingHours: hours,
        locationName: loc || sessions[openIdx].locationName,
      };
    }
  }

  const completedHours = sessions
    .filter((s) => s.checkOut)
    .reduce((sum, s) => sum + (s.workingHours || calculateLoggedHours(s.checkIn, s.checkOut!)), 0);
  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const open = sessions.some((s) => !s.checkOut);

  return {
    id: existing?.id || punch.id || `att_${punch.employeeId}_${punch.date}`,
    employeeId: punch.employeeId,
    employeeName: punch.employeeName,
    avatar: punch.avatar || existing?.avatar || '',
    date: punch.date,
    checkIn: first?.checkIn || punch.time,
    checkOut: open ? undefined : last?.checkOut,
    sessions,
    status: punch.status || existing?.status || 'Present',
    locationName: last?.locationName || loc,
    latitude: punch.latitude ?? existing?.latitude ?? 0,
    longitude: punch.longitude ?? existing?.longitude ?? 0,
    isWithinGeofence: punch.isWithinGeofence ?? existing?.isWithinGeofence ?? true,
    ipAddress: punch.ipAddress || existing?.ipAddress || '',
    device: punch.device || existing?.device || 'Web',
    workingHours: Number(completedHours.toFixed(2)),
    breakHours: existing?.breakHours || 0,
    ...(punch.selfiePhoto
      ? punch.type === 'check_in'
        ? { selfiePhoto: punch.selfiePhoto, checkInPhoto: punch.selfiePhoto }
        : { checkOutPhoto: punch.selfiePhoto }
      : {}),
  };
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

type TimedPunch = {
  type: 'check_in' | 'check_out';
  at: Date;
  punch: RawAttendancePunch;
};

function pairDaySessions(events: TimedPunch[]): { checkIn: Date; checkOut: Date | null; inPunch: RawAttendancePunch; outPunch: RawAttendancePunch | null }[] {
  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());
  const sessions: { checkIn: Date; checkOut: Date | null; inPunch: RawAttendancePunch; outPunch: RawAttendancePunch | null }[] = [];
  let open: TimedPunch | null = null;

  for (const event of ordered) {
    if (event.type === 'check_in') {
      if (open) continue;
      open = event;
      continue;
    }
    if (!open) continue;
    sessions.push({
      checkIn: open.at,
      checkOut: event.at,
      inPunch: open.punch,
      outPunch: event.punch,
    });
    open = null;
  }

  if (open) {
    sessions.push({
      checkIn: open.at,
      checkOut: null,
      inPunch: open.punch,
      outPunch: null,
    });
  }

  return sessions;
}

/**
 * Collapse raw punch rows into one AttendanceRecord per employee per local calendar day.
 * Multiple check-in/out pairs become sessions; an unpaired check-in stays open so the clock keeps running.
 */
export function aggregatePunchesToDaily(
  punches: RawAttendancePunch[],
  options: AggregatePunchOptions = {}
): AttendanceRecord[] {
  if (!Array.isArray(punches) || punches.length === 0) return [];

  type DayBucket = {
    employeeId: string;
    date: string;
    events: TimedPunch[];
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
      bucket = { employeeId: punch.employee_id, date, events: [] };
      buckets.set(key, bucket);
    }
    bucket.events.push({ type, at: ts, punch });
  }

  const records: AttendanceRecord[] = [];

  for (const bucket of buckets.values()) {
    const paired = pairDaySessions(bucket.events);
    if (paired.length === 0) continue;

    const sessions: AttendanceSession[] = paired.map((s) => {
      const checkInStr = formatTime12h(s.checkIn);
      const checkOutStr = s.checkOut ? formatTime12h(s.checkOut) : undefined;
      return {
        checkIn: checkInStr,
        checkOut: checkOutStr,
        locationName: (s.outPunch || s.inPunch).office_name || 'Office',
        workingHours: checkOutStr ? calculateLoggedHours(checkInStr, checkOutStr) : 0,
      };
    });

    const earliestIn = paired[0].checkIn;
    const last = paired[paired.length - 1];
    const hasOpen = !last.checkOut;
    const workingHours = Number(
      sessions.filter((s) => s.checkOut).reduce((sum, s) => sum + s.workingHours, 0).toFixed(2)
    );
    const metaPunch = last.inPunch || last.outPunch;
    const lookup = options.employeeLookup?.[bucket.employeeId];
    const lat = Number(metaPunch?.latitude);
    const lng = Number(metaPunch?.longitude);

    records.push({
      id: paired[0].inPunch.id || `day_${bucket.employeeId}_${bucket.date}`,
      employeeId: bucket.employeeId,
      employeeName: lookup?.name || metaPunch?.employee_name || '',
      avatar: lookup?.avatar || '',
      date: bucket.date,
      checkIn: sessions[0].checkIn,
      checkOut: hasOpen ? undefined : last.checkOut ? formatTime12h(last.checkOut) : undefined,
      sessions,
      status: deriveStatus(earliestIn, workingHours, !hasOpen, options),
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
