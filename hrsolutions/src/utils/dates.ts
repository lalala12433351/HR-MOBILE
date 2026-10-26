/** App-wide calendar locale: day-first (dd/mm/yyyy). */
export const APP_DATE_LOCALE = 'en-GB';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Normalize to YYYY-MM-DD for storage and `<input type="date">` values. */
export function toISODate(value?: string | Date | null): string {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const raw = String(value).trim();
  const iso = raw.match(ISO_DATE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return toISODate(parsed);
}

function asLocalDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const iso = toISODate(value);
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Numeric day-first display: 20/10/2026 */
export function formatDateDMY(value?: string | Date | null): string {
  const date = asLocalDate(value);
  if (!date) return '';
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

/** e.g. 20 Oct 2026 */
export function formatDateLong(value?: string | Date | null): string {
  const date = asLocalDate(value);
  if (!date) return '';
  return date.toLocaleDateString(APP_DATE_LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** e.g. 20 Oct */
export function formatDateShort(value?: string | Date | null): string {
  const date = asLocalDate(value);
  if (!date) return '';
  return date.toLocaleDateString(APP_DATE_LOCALE, { day: 'numeric', month: 'short' });
}
