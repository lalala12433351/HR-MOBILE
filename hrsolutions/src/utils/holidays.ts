const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export type HolidayLike = {
  date?: string;
  name?: string;
  isApproved?: boolean;
};

export function workingDayNameSet(days?: string[]): Set<string> {
  const source = days && days.length > 0 ? days : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return new Set(source.map((day) => day.trim().toLowerCase()).filter(Boolean));
}

export function isNamedWorkingDay(day: string, names: Set<string>): boolean {
  const raw = String(day || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const dt = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return false;
  return names.has(WEEKDAY_NAMES[dt.getDay()]);
}

/** Approved holidays that fall on a working day inside the inclusive range. One entry per date. */
export function paidHolidayDates(args: {
  holidays?: HolidayLike[];
  start: string;
  end: string;
  workingDays?: string[];
}): Array<{ date: string; name: string }> {
  if (!args.start || !args.end || args.start > args.end) return [];
  const names = workingDayNameSet(args.workingDays);
  const seen = new Set<string>();
  const result: Array<{ date: string; name: string }> = [];
  for (const holiday of args.holidays || []) {
    if (holiday.isApproved === false) continue;
    const date = String(holiday.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < args.start || date > args.end) continue;
    if (seen.has(date) || !isNamedWorkingDay(date, names)) continue;
    seen.add(date);
    result.push({ date, name: holiday.name?.trim() || 'Holiday' });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
