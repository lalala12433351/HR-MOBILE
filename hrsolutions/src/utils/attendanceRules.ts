import type { AttendanceRecord, AttendanceSession } from '@/types';

export type HoursMethod = 'every_punch' | 'first_last' | 'strict_shift';
export type AlternateSaturdayPolicy = 'none' | '1st_3rd_off' | '2nd_4th_off' | 'alternate';
export type RosterCycle = 'weekly' | 'biweekly' | 'monthly' | 'custom';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ROSTER_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseTimeToMinutes(value?: string | null): number | null {
  const clean = String(value || '').trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;
  let hours = Number(match[1]);
  const mins = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

function hoursBetween(checkIn?: string, checkOut?: string): number {
  const inM = parseTimeToMinutes(checkIn);
  const outM = parseTimeToMinutes(checkOut);
  if (inM === null || outM === null) return 0;
  let diff = outM - inM;
  if (diff < 0) diff += 24 * 60;
  return Math.min(24, Math.max(0, diff / 60));
}

export function workedHoursFromSessions(
  sessions: Pick<AttendanceSession, 'checkIn' | 'checkOut' | 'workingHours'>[],
  method: HoursMethod = 'every_punch',
  shiftHours = 8,
  fallback = 0
): number {
  const closed = (sessions || []).filter((session) => session.checkOut);
  const summed = closed.reduce(
    (total, session) => total + (Number(session.workingHours) || hoursBetween(session.checkIn, session.checkOut)),
    0
  );
  if (method === 'first_last') {
    const first = sessions[0]?.checkIn;
    const last = closed[closed.length - 1]?.checkOut;
    if (!first || !last) return Number((summed || fallback).toFixed(2));
    return Number(hoursBetween(first, last).toFixed(2));
  }
  if (method === 'strict_shift') {
    const base = summed || fallback;
    return Number(Math.min(base, Math.max(1, shiftHours)).toFixed(2));
  }
  return Number((summed || fallback).toFixed(2));
}

export function applyHoursMethod<T extends AttendanceRecord>(
  records: T[],
  settings?: { hoursCalculationMethod?: HoursMethod; fullDayMinimumHours?: number } | null
): T[] {
  const method = settings?.hoursCalculationMethod || 'every_punch';
  if (method === 'every_punch') return records;
  const shiftHours = Number(settings?.fullDayMinimumHours) || 8;
  return records.map((row) => {
    const sessions = row.sessions || [];
    if (method === 'first_last' && sessions.length === 0) return row;
    const workingHours = workedHoursFromSessions(sessions, method, shiftHours, Number(row.workingHours) || 0);
    return { ...row, workingHours };
  });
}

export function dateKey(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Sunday–Saturday window that contains `anchor`, in the local calendar. */
export function calendarWeekRange(anchor: Date = new Date()): { start: string; end: string } {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start: dateKey(start), end: dateKey(end) };
}

export function parseDateKey(value?: string | null): Date | null {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function saturdayIndexInMonth(date: Date): number {
  return Math.floor((date.getDate() - 1) / 7) + 1;
}

export function isAlternateOffDay(
  dateStr: string,
  settings?: {
    enableAlternateSaturdays?: boolean;
    alternateSaturdaysPolicy?: string;
  } | null
): boolean {
  if (!settings?.enableAlternateSaturdays) return false;
  const date = parseDateKey(dateStr);
  if (!date || date.getDay() !== 6) return false;
  const index = saturdayIndexInMonth(date);
  const policy = (settings.alternateSaturdaysPolicy || '2nd_4th_off') as AlternateSaturdayPolicy;
  if (policy === '1st_3rd_off') return index === 1 || index === 3;
  if (policy === 'alternate') return index % 2 === 0;
  if (policy === 'none') return false;
  return index === 2 || index === 4;
}

export function isScheduledWorkingDay(
  dateStr: string,
  workingDays?: string[] | null,
  settings?: { enableAlternateSaturdays?: boolean; alternateSaturdaysPolicy?: string } | null
): boolean {
  const date = parseDateKey(dateStr);
  if (!date) return false;
  const name = WEEKDAY_NAMES[date.getDay()].toLowerCase();
  const names = (workingDays && workingDays.length > 0
    ? workingDays
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  ).map((day) => day.trim().toLowerCase());
  if (!names.includes(name)) return false;
  return !isAlternateOffDay(dateStr, settings);
}

export function onOrAfterStart(dateStr: string, startDate?: string | null): boolean {
  const start = String(startDate || '').slice(0, 10);
  const day = String(dateStr || '').slice(0, 10);
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return true;
  return Boolean(day) && day >= start;
}

export function employeeInLocationScope(
  employee: { officeName?: string; location?: string; offices?: { name?: string }[] } | null | undefined,
  scope?: string | null
): boolean {
  const office = String(scope || '').trim();
  if (!office || office === 'All Offices') return true;
  const names = [
    employee?.officeName,
    employee?.location,
    ...(employee?.offices || []).map((item) => item.name),
  ]
    .map((name) => String(name || '').trim().toLowerCase())
    .filter(Boolean);
  return names.includes(office.toLowerCase());
}

export function repeatOnDay(value?: string | null): number {
  const match = String(value || '').match(/(\d{1,2})/);
  const day = match ? Number(match[1]) : 1;
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, day));
}

export function reconciliationBounds(
  settings: {
    attendanceCycle?: 'monthly' | 'yearly';
    approvalCycle?: 'Monthly' | 'Bi-Weekly' | 'Weekly';
    repeatOn?: string;
  } | null | undefined,
  selectedMonth: string
): { start: string; end: string } {
  const [yearText, monthText] = String(selectedMonth || '').split('-');
  const year = Number(yearText) || new Date().getFullYear();
  const month = Number(monthText) || new Date().getMonth() + 1;
  const last = new Date(year, month, 0).getDate();
  if (settings?.attendanceCycle === 'yearly') {
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  const anchor = Math.min(repeatOnDay(settings?.repeatOn), last);
  const anchorDate = new Date(year, month - 1, anchor);
  if (settings?.approvalCycle === 'Weekly') {
    const start = new Date(anchorDate);
    start.setDate(anchorDate.getDate() - anchorDate.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: dateKey(start), end: dateKey(end) };
  }
  if (settings?.approvalCycle === 'Bi-Weekly') {
    const end = new Date(anchorDate);
    end.setDate(anchorDate.getDate() + 13);
    return { start: dateKey(anchorDate), end: dateKey(end) };
  }
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  };
}

export function dateInRange(dateStr: string, start: string, end: string): boolean {
  const day = String(dateStr || '').slice(0, 10);
  return Boolean(day) && day >= start && day <= end;
}

function rotationSteps(date: Date, cycle: RosterCycle | string | undefined): number {
  if (!cycle || cycle === 'weekly' || cycle === 'custom') return 0;
  if (cycle === 'monthly') return (date.getFullYear() - 2020) * 12 + date.getMonth();
  const anchor = new Date(2020, 0, 6);
  const weeks = Math.floor((date.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(0, Math.floor(weeks / 2));
}

export function rosterShiftIdForDate(
  schedule: Record<string, string> | undefined,
  dateStr: string,
  cycle: RosterCycle | string | undefined,
  shiftIds: string[]
): string | undefined {
  if (!schedule) return undefined;
  const date = parseDateKey(dateStr);
  if (!date) return undefined;
  const key = ROSTER_KEYS[date.getDay()];
  const base = schedule[key];
  if (!base || base === 'OFF' || shiftIds.length === 0) return base;
  const index = shiftIds.indexOf(base);
  if (index < 0) return base;
  const steps = rotationSteps(date, cycle);
  return shiftIds[(index + steps) % shiftIds.length];
}

export function rotateRosterSchedule(
  schedule: Record<string, string>,
  shiftIds: string[]
): Record<string, string> {
  const next: Record<string, string> = {};
  Object.entries(schedule).forEach(([day, shiftId]) => {
    if (shiftId === 'OFF' || shiftIds.length === 0) {
      next[day] = shiftId;
      return;
    }
    const index = shiftIds.indexOf(shiftId);
    next[day] = index < 0 ? shiftId : shiftIds[(index + 1) % shiftIds.length];
  });
  return next;
}

export function countScheduledWorkingDays(
  start: string,
  end: string,
  workingDays?: string[] | null,
  settings?: { enableAlternateSaturdays?: boolean; alternateSaturdaysPolicy?: string } | null
): number {
  const from = parseDateKey(start);
  const to = parseDateKey(end);
  if (!from || !to || from > to) return 0;
  let count = 0;
  const cursor = new Date(from);
  while (cursor <= to) {
    if (isScheduledWorkingDay(dateKey(cursor), workingDays, settings)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}
