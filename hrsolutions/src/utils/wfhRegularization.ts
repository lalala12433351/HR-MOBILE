import type { AttendanceRegularization } from '../types';

export function isWfhRegularizationText(value?: string | null): boolean {
  const text = String(value || '').toLowerCase();
  return text.includes('work from home') || /\bwfh\b/.test(text);
}

export function isWfhRegularization(
  reg: Pick<AttendanceRegularization, 'reason' | 'remarks'> | null | undefined
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
