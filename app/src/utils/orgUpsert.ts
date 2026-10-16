type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

function randomCode(name: string): string {
  const prefix = name.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'DEP';
  return prefix + String(Math.floor(10 + Math.random() * 90));
}

/**
 * Returns the department with this name (case-insensitive), creating it if missing.
 * Relies on the unique LOWER(name) index so concurrent callers converge on one row.
 */
export async function ensureDepartmentByName(query: QueryFn, name: string, code?: string): Promise<any> {
  const clean = name.trim();
  for (let attempt = 0; attempt < 5; attempt++) {
    const cleanCode = (attempt === 0 && code ? code : randomCode(clean)).toUpperCase().trim();
    const inserted = await query(
      `INSERT INTO departments (name, code) VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [clean, cleanCode]
    );
    if (inserted.rows[0]) return inserted.rows[0];
    const existing = await query(`SELECT * FROM departments WHERE LOWER(name) = LOWER($1) LIMIT 1`, [clean]);
    if (existing.rows[0]) return existing.rows[0];
  }
  throw new Error(`Could not create department "${clean}".`);
}

/** Returns the team with this name inside the department, creating it if missing. */
export async function ensureTeamByName(
  query: QueryFn,
  departmentId: string,
  name: string,
  leadEmployeeId: string | null = null
): Promise<any> {
  const clean = name.trim();
  const inserted = await query(
    `INSERT INTO teams (department_id, name, lead_employee_id) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [departmentId, clean, leadEmployeeId]
  );
  if (inserted.rows[0]) return inserted.rows[0];
  const existing = await query(
    `SELECT * FROM teams WHERE department_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
    [departmentId, clean]
  );
  return existing.rows[0];
}
