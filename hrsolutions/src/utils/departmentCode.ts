import type { AppState } from '@/services/store';

const STOP_WORDS = new Set(['and', 'of', 'the']);

/** Lowercases and strips everything except a-z / 0-9 (max 6 chars). */
export function normalizeDepartmentCode(raw: string): string {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
}

export const isValidDepartmentCode = (code: string) => /^[a-z][a-z0-9]{1,5}$/.test(code);

/** Mirrors the backend suggestion: "Engineering" -> "eng", "Human Resources" -> "hr". */
export function suggestDepartmentCode(name: string): string {
  const words = String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w));
  let code = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 4) : (words[0] || '').slice(0, 3);
  if (code && !/^[a-z]/.test(code)) code = `d${code}`;
  if (code.length === 1) code = `${code}x`;
  return code.slice(0, 6);
}

type DepartmentRecord = { id?: string; name?: string; shortCode?: string };

export function getDepartmentRecords(state: Pick<AppState, 'customOptions'>): DepartmentRecord[] {
  return ((state.customOptions as any)?.departmentRecords || []) as DepartmentRecord[];
}

/** Map of lowercased department name -> short code. */
export function buildDepartmentCodeMap(state: Pick<AppState, 'customOptions'>): Map<string, string> {
  const map = new Map<string, string>();
  getDepartmentRecords(state).forEach((r) => {
    if (r.name && r.shortCode) map.set(r.name.trim().toLowerCase(), r.shortCode);
  });
  return map;
}
