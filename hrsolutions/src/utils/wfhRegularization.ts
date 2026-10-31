import type { AttendanceRegularization } from '../types';
import { api } from '../services/apiClient';

export function isWfhRegularizationText(value?: string | null): boolean {
  const text = String(value || '').toLowerCase();
  return text.includes('work from home') || /\bwfh\b/.test(text);
}

export function isWfhRegularization(
  reg: { reason?: string | null; remarks?: string | null } | null | undefined
): boolean {
  if (!reg) return false;
  return isWfhRegularizationText(reg.reason) || isWfhRegularizationText(reg.remarks);
}

/** Inclusive YYYY-MM-DD range (local calendar days). */
export function eachDateInclusive(startDate: string, endDate: string): string[] {
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return [];
  const out: string[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = /^\d{4}-\d{2}-\d{2}$/.test(end) ? new Date(`${end}T12:00:00`) : new Date(cursor);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [start];
  while (cursor.getTime() <= last.getTime()) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
    if (out.length > 366) break;
  }
  return out.length ? out : [start];
}

export function splitRegularizationReason(raw: string | null | undefined): {
  reason: AttendanceRegularization['reason'];
  remarks: string;
} {
  const full = String(raw || '').trim();
  if (!full) {
    return { reason: 'Forgot Punch In', remarks: '' };
  }
  const [head, ...rest] = full.split(' — ');
  const headTrim = head.trim();
  const remarks = rest.join(' — ').trim();
  const known: AttendanceRegularization['reason'][] = [
    'Client Visit',
    'Network / GPS Error',
    'Forgot Punch In',
    'Work From Home',
    'On Duty',
    'Biometric Scanner Glitch',
  ];
  const matched =
    known.find((k) => headTrim.toLowerCase() === k.toLowerCase()) ||
    known.find((k) => headTrim.toLowerCase().startsWith(k.toLowerCase())) ||
    (isWfhRegularizationText(headTrim) ? 'Work From Home' : null);
  if (matched) {
    return { reason: matched, remarks: remarks || (matched === headTrim ? '' : headTrim) };
  }
  return { reason: 'Forgot Punch In', remarks: full };
}

function to24HourTime(value: string): string {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '09:00';
  let hours = parseInt(match[1], 10);
  const mins = match[2];
  const meridiem = match[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${mins}`;
}

type WfhStatusRow = {
  date?: string;
  status?: string;
  reason?: string;
  remarks?: string;
  created_at?: string;
  createdAt?: string;
  employeeId?: string;
  employee_id?: string;
};

/** Newest WFH regularization status for a calendar day, or null when none exists. */
export function latestWfhRegularizationStatus(
  rows: WfhStatusRow[],
  date: string,
  employeeId?: string
): string | null {
  const day = String(date || '').slice(0, 10);
  const matches = rows.filter((row) => {
    const rowEmp = row.employeeId || row.employee_id;
    if (employeeId && rowEmp && rowEmp !== employeeId) return false;
    const rowDate = String(row.date || '').slice(0, 10);
    return (
      rowDate === day &&
      (isWfhRegularization(row) || isWfhRegularizationText(row.reason) || isWfhRegularizationText(row.remarks))
    );
  });
  matches.sort((a, b) =>
    String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || ''))
  );
  return matches[0] ? String(matches[0].status || '').toLowerCase() : null;
}

/**
 * True when the employee already has a pending or approved WFH request for the day.
 * Used so punch flows do not ask them to request WFH again.
 */
export function hasActiveWfhAuthorization(
  rows: WfhStatusRow[],
  date: string,
  employeeId?: string
): boolean {
  const status = latestWfhRegularizationStatus(rows, date, employeeId);
  return status === 'pending' || status === 'approved';
}

/**
 * File one pending WFH regularization for the day. Does not invent attendance hours.
 * A rejected request does not block a later punch from filing a new one.
 */
export async function ensurePendingWfhRegularization(input: {
  employeeId: string;
  employeeName: string;
  avatar?: string;
  department?: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  remarks: string;
  existing: AttendanceRegularization[];
}): Promise<
  | { kind: 'created'; regularization: AttendanceRegularization }
  | { kind: 'pending' }
  | { kind: 'approved' }
> {
  const day = String(input.date).slice(0, 10);
  let status: string | null = null;
  try {
    const listed = await api.attendance.getRegularizations({ employeeId: input.employeeId });
    if (listed.success && Array.isArray(listed.data)) {
      status = latestWfhRegularizationStatus(listed.data, day, input.employeeId);
    }
  } catch {
    status = null;
  }
  if (!status) {
    status = latestWfhRegularizationStatus(input.existing, day, input.employeeId);
  }
  // Re-use an existing pending/approved request — never file a second WFH for the same day.
  if (status === 'pending') return { kind: 'pending' };
  if (status === 'approved') return { kind: 'approved' };

  const created = await api.attendance.requestRegularization({
    employeeId: input.employeeId,
    date: day,
    requestedCheckIn: to24HourTime(input.shiftStart),
    requestedCheckOut: to24HourTime(input.shiftEnd),
    reason: 'Work From Home',
    remarks: input.remarks || 'Work from home request',
  });
  if (!created.success) {
    throw new Error(created.error?.message || 'Could not submit WFH request');
  }
  return {
    kind: 'created',
    regularization: {
      id: created.data?.id || `reg_${Date.now()}`,
      employeeId: created.data?.employee_id || input.employeeId,
      employeeName: input.employeeName,
      avatar: input.avatar || '',
      department: input.department || '',
      date: String(created.data?.date || day).slice(0, 10),
      requestedCheckIn: input.shiftStart,
      requestedCheckOut: input.shiftEnd,
      reason: 'Work From Home',
      remarks: input.remarks || 'Work from home request',
      status: 'Pending',
      appliedOn: day,
    },
  };
}
