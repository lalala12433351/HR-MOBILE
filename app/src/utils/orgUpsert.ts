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

/**
 * Job role for this title inside the given department.
 * A role that belongs to another department is not reused.
 * A role with no department is claimed by this department.
 */
export async function ensureJobRoleForDepartment(
  query: QueryFn,
  input: { title?: string | null; departmentId?: string | null; jobRoleId?: string | null }
): Promise<string | null> {
  const title = String(input.title || '').trim();
  const departmentId =
    input.departmentId && !String(input.departmentId).startsWith('00000000')
      ? String(input.departmentId)
      : null;
  const explicitId =
    input.jobRoleId && !String(input.jobRoleId).startsWith('00000000') ? String(input.jobRoleId) : null;

  if (explicitId) {
    const row = await query(`SELECT id, title, department_id FROM job_roles WHERE id = $1 LIMIT 1`, [explicitId]);
    const role = row.rows[0];
    if (role) {
      const titleOk = !title || String(role.title).toLowerCase() === title.toLowerCase();
      const deptOk = !departmentId || !role.department_id || String(role.department_id) === departmentId;
      if (titleOk && deptOk) {
        if (departmentId && !role.department_id) {
          await query(`UPDATE job_roles SET department_id = $2 WHERE id = $1 AND department_id IS NULL`, [
            role.id,
            departmentId,
          ]);
        }
        return String(role.id);
      }
    }
  }

  if (!title) return null;

  if (departmentId) {
    const match = await query(
      `SELECT id, department_id FROM job_roles
       WHERE title ILIKE $1 AND (department_id = $2 OR department_id IS NULL)
       ORDER BY CASE WHEN department_id = $2 THEN 0 WHEN department_id IS NULL THEN 1 ELSE 2 END
       LIMIT 1`,
      [title, departmentId]
    );
    if (match.rows[0]) {
      if (!match.rows[0].department_id) {
        await query(`UPDATE job_roles SET department_id = $2 WHERE id = $1 AND department_id IS NULL`, [
          match.rows[0].id,
          departmentId,
        ]);
      }
      return String(match.rows[0].id);
    }
  } else {
    const match = await query(
      `SELECT id FROM job_roles
       WHERE title ILIKE $1
       ORDER BY CASE WHEN department_id IS NULL THEN 1 ELSE 0 END
       LIMIT 1`,
      [title]
    );
    if (match.rows[0]) return String(match.rows[0].id);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const inserted = await query(
      `INSERT INTO job_roles (title, code, department_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
      [title, randomCode(title), departmentId]
    );
    if (inserted.rows[0]) return String(inserted.rows[0].id);
    const existing = departmentId
      ? await query(`SELECT id FROM job_roles WHERE title ILIKE $1 AND department_id = $2 LIMIT 1`, [title, departmentId])
      : await query(`SELECT id FROM job_roles WHERE title ILIKE $1 LIMIT 1`, [title]);
    if (existing.rows[0]) return String(existing.rows[0].id);
  }
  throw new Error(`Could not create job role "${title}".`);
}

type DepartmentRow = { id: string; name: string };

/** "Design Team" or "Design" belongs to the department named Design. Longer names win. */
export function departmentImpliedByTeamName(teamName: string, departments: DepartmentRow[]): DepartmentRow | null {
  const team = teamName.trim().toLowerCase();
  if (!team) return null;
  const sorted = [...departments].sort((a, b) => b.name.length - a.name.length);
  for (const dept of sorted) {
    const key = dept.name.trim().toLowerCase();
    if (!key) continue;
    if (team === key || team === `${key} team`) return dept;
  }
  return null;
}

/**
 * Department and team are one assignment. A team named after a department
 * (Design Team) puts the employee in that department. Changing department
 * drops a team that still belongs to the previous one.
 */
export async function resolveEmployeeOrgPlacement(
  query: QueryFn,
  input: {
    requestedDepartmentName?: string;
    requestedDepartmentId?: string | null;
    requestedTeamName?: string;
    requestedTeamId?: string | null;
    teamProvided: boolean;
    departmentProvided: boolean;
    currentDepartmentId?: string | null;
    currentTeamId?: string | null;
  }
): Promise<{ departmentId: string | null; teamId: string | null }> {
  const loaded = await query(`SELECT id, name FROM departments`);
  let departments: DepartmentRow[] = loaded.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
  }));
  const current =
    departments.find((dept) => dept.id === String(input.currentDepartmentId || '')) || null;

  let department = current;
  if (input.departmentProvided) {
    const requestedName = String(input.requestedDepartmentName || '').trim();
    if (requestedName) {
      const row = await ensureDepartmentByName(query, requestedName);
      department = { id: String(row.id), name: String(row.name || requestedName) };
      if (!departments.some((dept) => dept.id === department!.id)) departments = [...departments, department];
    } else if (
      input.requestedDepartmentId &&
      !String(input.requestedDepartmentId).startsWith('00000000')
    ) {
      department =
        departments.find((dept) => dept.id === String(input.requestedDepartmentId)) || department;
    }
  }

  const deptChanged = Boolean(department && current && department.id !== current.id);
  let teamName = String(input.requestedTeamName || '').trim();

  if (!input.teamProvided && !deptChanged) {
    return {
      departmentId: department?.id || null,
      teamId: input.currentTeamId ? String(input.currentTeamId) : null,
    };
  }

  if (!teamName && input.requestedTeamId && !String(input.requestedTeamId).startsWith('00000000')) {
    const named = await query(`SELECT name, department_id FROM teams WHERE id = $1 LIMIT 1`, [
      input.requestedTeamId,
    ]);
    teamName = String(named.rows[0]?.name || '').trim();
    if (!deptChanged && named.rows[0]?.department_id) {
      const owner = departments.find((dept) => dept.id === String(named.rows[0].department_id));
      if (owner) department = owner;
    }
  }

  if (deptChanged && department) {
    if (!teamName) {
      teamName = `${department.name} Team`;
    } else {
      const inNew = await query(
        `SELECT id FROM teams WHERE department_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
        [department.id, teamName]
      );
      if (!inNew.rows[0]) {
        const implied = departmentImpliedByTeamName(teamName, departments);
        const belongsToPrevious = Boolean(implied && current && implied.id === current.id);
        let belongsToOldRow = false;
        if (!belongsToPrevious && current) {
          const inOld = await query(
            `SELECT id FROM teams WHERE department_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`,
            [current.id, teamName]
          );
          belongsToOldRow = Boolean(inOld.rows[0]);
        }
        if (belongsToPrevious || belongsToOldRow) teamName = `${department.name} Team`;
      }
    }
  } else if (teamName) {
    const implied = departmentImpliedByTeamName(teamName, departments);
    if (implied) {
      department = implied;
    } else {
      const matches = await query(
        `SELECT department_id FROM teams WHERE LOWER(name) = LOWER($1)`,
        [teamName]
      );
      if (matches.rows.length === 1 && matches.rows[0]?.department_id) {
        const owner = departments.find((dept) => dept.id === String(matches.rows[0].department_id));
        if (owner) department = owner;
      }
    }
  }

  if (!department) {
    return { departmentId: null, teamId: input.currentTeamId ? String(input.currentTeamId) : null };
  }
  if (!teamName) {
    return { departmentId: department.id, teamId: null };
  }
  const team = await ensureTeamByName(query, department.id, teamName);
  return { departmentId: department.id, teamId: team?.id ? String(team.id) : null };
}

/** Move people onto the department their team name already names, e.g. Design Team → Design. */
export async function reconcileEmployeesFollowingTeamNames(query: QueryFn): Promise<number> {
  const deptRes = await query(`SELECT id, name FROM departments`);
  const departments: DepartmentRow[] = deptRes.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name || ''),
  }));
  if (!departments.length) return 0;

  const empRes = await query(
    `SELECT e.id, e.department_id, t.name AS team_name
     FROM employees e
     JOIN teams t ON t.id = e.team_id
     WHERE e.team_id IS NOT NULL`
  );
  let updated = 0;
  for (const emp of empRes.rows) {
    const implied = departmentImpliedByTeamName(String(emp.team_name || ''), departments);
    if (!implied || implied.id === String(emp.department_id || '')) continue;
    const team = await ensureTeamByName(query, implied.id, String(emp.team_name));
    if (!team?.id) continue;
    await query(`UPDATE employees SET department_id = $2, team_id = $3 WHERE id = $1`, [
      emp.id,
      implied.id,
      team.id,
    ]);
    updated += 1;
  }
  return updated;
}
