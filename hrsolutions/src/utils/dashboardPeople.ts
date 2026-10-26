import type { AttendanceRecord, Employee, Holiday, LeaveRequest } from '@/types';
import { formatDateShort } from '@/utils/dates';
import { leaveBelongsToEmployee } from '@/utils/mapLeaveRow';

export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateKey(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export function isLeaveActiveOn(
  leave: Pick<LeaveRequest, 'status' | 'startDate' | 'endDate'>,
  day: string
) {
  if (leave.status !== 'Approved') return false;
  const start = dateKey(leave.startDate);
  const end = dateKey(leave.endDate) || start;
  const on = dateKey(day);
  return Boolean(start && on && start <= on && end >= on);
}

export function isWfhLeaveType(leaveType?: string | null) {
  const raw = String(leaveType || '').trim().toLowerCase();
  return raw === 'wfh' || raw === 'home' || raw.includes('work from home');
}

/** Approved absence covering this calendar day. Work-from-home is not time off. */
export function approvedAbsenceOnDay(
  leaves: LeaveRequest[] | null | undefined,
  person: Parameters<typeof leaveBelongsToEmployee>[1],
  day: string
) {
  return (leaves || []).find(
    (leave) =>
      leaveBelongsToEmployee(leave, person) &&
      isLeaveActiveOn(leave, day) &&
      !isWfhLeaveType(leave.leaveType)
  );
}

export function eachDateKey(start?: string | null, end?: string | null): string[] {
  const from = dateKey(start);
  const to = dateKey(end) || from;
  if (!from || !to || from > to) return [];
  const dates: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const last = new Date(`${to}T00:00:00`);
  while (cursor <= last) {
    dates.push(localDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

/** Approved absence days inside a period, skipping days the person also worked. */
export function absenceDaysInPeriod(
  leaves: LeaveRequest[] | null | undefined,
  person: Parameters<typeof leaveBelongsToEmployee>[1],
  periodStart: string,
  periodEnd: string,
  workedDates?: Set<string>
) {
  const days = new Set<string>();
  const start = dateKey(periodStart);
  const end = dateKey(periodEnd);
  if (!start || !end) return days;
  for (const leave of leaves || []) {
    if (leave.status !== 'Approved' || isWfhLeaveType(leave.leaveType)) continue;
    if (!leaveBelongsToEmployee(leave, person)) continue;
    for (const day of eachDateKey(leave.startDate, leave.endDate)) {
      if (day < start || day > end || workedDates?.has(day)) continue;
      days.add(day);
    }
  }
  return days;
}

function inactiveEmployee(emp?: Employee | null) {
  if (!emp) return false;
  const status = String(emp.accountStatus || emp.status || '').toLowerCase();
  return (
    emp.isDeactivated === true ||
    status === 'terminated' ||
    status === 'deactivated' ||
    status === 'suspended'
  );
}

function employeeMatchesLeave(emp: Employee, leave: LeaveRequest) {
  if (leave.employeeId && (leave.employeeId === emp.id || leave.employeeId === emp.employeeId)) {
    return true;
  }
  const leaveName = leave.employeeName?.trim().toLowerCase();
  if (!leaveName) return false;
  return emp.name?.trim().toLowerCase() === leaveName || emp.fullName?.trim().toLowerCase() === leaveName;
}

export type OnLeavePerson = {
  id: string;
  employeeId: string;
  name: string;
  avatar?: string;
  department?: string;
  leaveType: string;
  endDate: string;
};

export function peopleOnLeaveToday(opts: {
  leaves: LeaveRequest[];
  employees: Employee[];
  day?: string;
  excludeIds?: string[];
  department?: string;
}): OnLeavePerson[] {
  const day = opts.day || localDateKey();
  const exclude = new Set((opts.excludeIds || []).filter(Boolean));
  const dept = opts.department?.trim().toLowerCase();
  const activeLeaves = (opts.leaves || []).filter((leave) => isLeaveActiveOn(leave, day));

  const seen = new Set<string>();
  const people: OnLeavePerson[] = [];

  for (const leave of activeLeaves) {
    const emp = (opts.employees || []).find((e) => employeeMatchesLeave(e, leave));
    if (emp && inactiveEmployee(emp)) continue;
    const id = emp?.id || leave.employeeId || leave.id;
    if (!id || seen.has(id) || exclude.has(id) || (emp?.employeeId && exclude.has(emp.employeeId))) {
      continue;
    }
    if (dept && emp?.department && String(emp.department).toLowerCase() !== dept) continue;
    seen.add(id);
    people.push({
      id,
      employeeId: emp?.employeeId || leave.employeeId,
      name: emp?.name || emp?.fullName || leave.employeeName || 'Team member',
      avatar: emp?.avatar,
      department: emp?.department || leave.department,
      leaveType: leave.leaveType || 'Leave',
      endDate: dateKey(leave.endDate) || dateKey(leave.startDate),
    });
  }

  return people.sort((a, b) => a.name.localeCompare(b.name));
}

export function upcomingHolidays(holidays: Holiday[] | undefined, day?: string, limit = 6) {
  const from = day || localDateKey();
  return (holidays || [])
    .filter((h) => h.isApproved !== false && dateKey(h.date) >= from)
    .sort((a, b) => dateKey(a.date).localeCompare(dateKey(b.date)))
    .slice(0, limit);
}

export function pendingLeaveRequests(leaves: LeaveRequest[], limit = 8) {
  return (leaves || [])
    .filter((l) => l.status === 'Pending')
    .sort((a, b) => dateKey(b.appliedOn).localeCompare(dateKey(a.appliedOn)) || dateKey(a.startDate).localeCompare(dateKey(b.startDate)))
    .slice(0, limit);
}

export function presentTodayCount(attendance: AttendanceRecord[], day?: string) {
  const today = day || localDateKey();
  return new Set(
    (attendance || [])
      .filter(
        (a) =>
          dateKey(a.date) === today &&
          (a.status === 'Present' || a.status === 'Late' || a.status === 'Work From Home')
      )
      .map((a) => a.employeeId)
      .filter(Boolean)
  ).size;
}

export function incompleteProfiles(employees: Employee[]) {
  return (employees || []).filter((emp) => {
    if (inactiveEmployee(emp)) return false;
    return emp.hasCompletedProfile !== true && (emp.onboardingProgress || 0) < 100;
  });
}

export function joinersThisMonth(employees: Employee[], day?: string) {
  const today = day || localDateKey();
  const prefix = today.slice(0, 7);
  return (employees || []).filter((emp) => {
    if (inactiveEmployee(emp)) return false;
    const joined = dateKey(emp.joiningDate || emp.joinDate);
    return joined.startsWith(prefix);
  });
}

export function formatShortDate(value?: string | null) {
  const key = dateKey(value);
  if (!key) return '';
  return formatDateShort(key) || key;
}

export function formatWeekday(value?: string | null) {
  const key = dateKey(value);
  if (!key) return '';
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { weekday: 'short' });
}
