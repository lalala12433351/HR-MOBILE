type TenantQuery = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

export const SHORT_CODE_RE = /^[a-z][a-z0-9]{1,5}$/;
const STOP_WORDS = new Set(['and', 'of', 'the']);

/** Lowercases and strips everything except a-z / 0-9. */
export function normalizeShortCode(raw: unknown): string {
  return String(raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
}

/** "Engineering" -> "eng", "Human Resources" -> "hr", "Research and Development" -> "rd". */
export function suggestShortCode(name: string): string {
  const words = String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w));
  let code = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 4) : (words[0] || '').slice(0, 3);
  if (!/^[a-z]/.test(code)) code = `d${code}`;
  if (code.length < 2) code = `${code}x`.slice(0, 2);
  return code.slice(0, 6);
}

/** Appends 2, 3, ... until the code is not in `taken` (case-insensitive). */
export function uniqueShortCode(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base.slice(0, 6 - String(i).length)}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}

/**
 * Adds departments.short_code for tenants that predate it, and fills a
 * suggested code for any department without one (including departments
 * created by setup/import paths that don't pass a code).
 */
export async function ensureDepartmentShortCodes(query: TenantQuery): Promise<void> {
  const col = await query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'departments' AND column_name = 'short_code'`
  );
  if (!col.rows.length) {
    await query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS short_code VARCHAR(8)`);
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS departments_short_code_uq ON departments (LOWER(short_code)) WHERE short_code IS NOT NULL`
    );
  }

  const missing = await query(`SELECT id, name FROM departments WHERE short_code IS NULL ORDER BY created_at ASC`);
  if (!missing.rows.length) return;

  const existing = await query(`SELECT LOWER(short_code) AS code FROM departments WHERE short_code IS NOT NULL`);
  const taken = new Set<string>(existing.rows.map((r: any) => String(r.code)));
  for (const row of missing.rows) {
    const code = uniqueShortCode(suggestShortCode(row.name), taken);
    taken.add(code);
    await query(`UPDATE departments SET short_code = $2 WHERE id = $1 AND short_code IS NULL`, [row.id, code]);
  }
}

export type ShortCodeError = { status: 400 | 409; code: 'INVALID_SHORT_CODE' | 'SHORT_CODE_TAKEN'; message: string };

/** Returns an error when `code` is invalid or used by another department. */
export async function validateShortCode(
  query: TenantQuery,
  code: string,
  excludeDepartmentId?: string
): Promise<ShortCodeError | null> {
  if (!SHORT_CODE_RE.test(code)) {
    return {
      status: 400,
      code: 'INVALID_SHORT_CODE',
      message: 'Department code must be 2–6 lowercase letters or digits and start with a letter.',
    };
  }
  const clash = await query(
    `SELECT name FROM departments WHERE LOWER(short_code) = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
    [code, excludeDepartmentId || null]
  );
  return clash.rows[0]
    ? { status: 409, code: 'SHORT_CODE_TAKEN', message: `Code "${code}" is already used by ${clash.rows[0].name}.` }
    : null;
}
