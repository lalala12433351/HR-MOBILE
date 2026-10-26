import type { Employee, WorkShift } from '@/types';
import { rosterShiftIdForDate, type RosterCycle } from '@/utils/attendanceRules';

export function isGeneralShift(shift?: { id?: string; name?: string } | null): boolean {
  const name = String(shift?.name || '').trim().toLowerCase();
  return shift?.id === 'sh-1' || name === 'general shift' || name === 'general day shift' || name.startsWith('general ');
}

/** The shift settings treats as the default when someone has no explicit assignment. */
export function defaultOrgShift(shifts: WorkShift[] | undefined | null): WorkShift | undefined {
  const list = Array.isArray(shifts) ? shifts : [];
  return (
    list.find((shift) => !shift.isHourlyShift && shift.id !== 'sh-hourly' && isGeneralShift(shift)) ||
    list.find((shift) => !shift.isHourlyShift && shift.id !== 'sh-hourly') ||
    list[0]
  );
}

export function shiftByIdMap(shifts: WorkShift[] | undefined | null): Map<string, WorkShift> {
  const map = new Map<string, WorkShift>();
  for (const shift of Array.isArray(shifts) ? shifts : []) {
    if (shift?.id) map.set(String(shift.id), shift);
  }
  return map;
}

export function timingFromWorkShift(
  shift: WorkShift,
  hourlyRate?: number
): NonNullable<Employee['shiftTiming']> {
  return {
    shiftId: shift.id,
    shiftName: shift.name,
    startTime: shift.startTime || 'Flexible',
    endTime: shift.endTime || 'Flexible',
    graceMinutes: shift.gracePeriodMinutes || 0,
    isHourlyShift: Boolean(shift.isHourlyShift),
    hourlyRate: hourlyRate || shift.hourlyRate || 650,
  };
}

/**
 * Attendance settings shows everyone on the general shift by default, but that
 * choice is stored in employeeShiftAssignments — not on the employee row.
 * Resolve the label from the assignment, then the employee, then that default.
 */
export function resolveEmployeeShiftTiming(
  emp: Pick<Employee, 'id' | 'shiftId' | 'shiftTiming' | 'salaryType'>,
  shifts: WorkShift[] | undefined | null,
  assignments?: Record<string, string> | null,
  options?: {
    allowDefault?: boolean;
    date?: string;
    enableRosterShifts?: boolean;
    rosterRotationCycle?: RosterCycle | string;
    rosterMatrix?: Record<string, Record<string, string>> | null;
  }
): Employee['shiftTiming'] | undefined {
  const allowDefault = options?.allowDefault !== false;
  const byId = shiftByIdMap(shifts);
  if (options?.enableRosterShifts && options.date && options.rosterMatrix) {
    const row = options.rosterMatrix[emp.id] || options.rosterMatrix[String(emp.id)];
    const shiftIds = (Array.isArray(shifts) ? shifts : []).map((shift) => shift.id).filter(Boolean);
    const rosterShiftId = rosterShiftIdForDate(row, options.date, options.rosterRotationCycle, shiftIds);
    if (rosterShiftId === 'OFF') {
      return {
        shiftId: 'OFF',
        shiftName: 'Weekly Off',
        startTime: 'Flexible',
        endTime: 'Flexible',
        graceMinutes: 0,
        isHourlyShift: false,
      };
    }
    const rosterShift = rosterShiftId ? byId.get(String(rosterShiftId)) : undefined;
    if (rosterShift) return timingFromWorkShift(rosterShift, emp.shiftTiming?.hourlyRate);
  }
  const assignedId = assignments?.[emp.id] || assignments?.[String(emp.id)];
  const explicitId = assignedId || emp.shiftTiming?.shiftId || emp.shiftId;
  const matched = explicitId ? byId.get(String(explicitId)) : undefined;
  const hourly =
    emp.salaryType === 'hourly' || emp.shiftTiming?.isHourlyShift || Boolean(matched?.isHourlyShift);

  if (hourly) {
    const hourlyShift =
      (matched?.isHourlyShift ? matched : undefined) ||
      (Array.isArray(shifts) ? shifts.find((shift) => shift.isHourlyShift || shift.id === 'sh-hourly') : undefined);
    if (hourlyShift) return timingFromWorkShift(hourlyShift, emp.shiftTiming?.hourlyRate);
    return {
      shiftId: 'sh-hourly',
      shiftName: 'Hourly / Flexible',
      startTime: 'Flexible',
      endTime: 'Flexible',
      graceMinutes: 0,
      isHourlyShift: true,
      hourlyRate: emp.shiftTiming?.hourlyRate || 650,
    };
  }

  if (matched) return timingFromWorkShift(matched, emp.shiftTiming?.hourlyRate);
  if (emp.shiftTiming?.shiftName) return emp.shiftTiming;
  if (!allowDefault) return undefined;

  const fallback = defaultOrgShift(shifts);
  if (fallback) return timingFromWorkShift(fallback, emp.shiftTiming?.hourlyRate);
  return {
    shiftId: 'sh-1',
    shiftName: 'General Shift',
    startTime: '09:00 AM',
    endTime: '06:00 PM',
    graceMinutes: 15,
    isHourlyShift: false,
  };
}
