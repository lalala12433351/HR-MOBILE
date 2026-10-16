import { ensureDepartmentByName } from './orgUpsert.js';

type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

export function defaultLeadershipDepartment(industry?: string | null) {
  const value = String(industry || '');
  if (/institut|educat|school|college/i.test(value)) return 'Administration';
  return 'Management';
}

export function defaultLeadershipTitle(industry?: string | null, jobTitle?: string | null) {
  const title = String(jobTitle || '').trim();
  if (title) return title;
  return defaultLeadershipDepartment(industry) === 'Administration' ? 'Principal / Dean' : 'CEO / Executive Owner';
}

export async function ensureOwnerOrgDefaults(
  query: QueryFn,
  options: { industry?: string | null; jobTitle?: string | null } = {}
) {
  const ownerStatus = await query(
    `SELECT onboarding_status FROM employees WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1`
  );
  const status = String(ownerStatus.rows[0]?.onboarding_status || 'NOT_STARTED').toUpperCase();
  if (status === 'COMPLETED') return { departmentId: null, jobRoleId: null };

  const departmentName = defaultLeadershipDepartment(options.industry);
  const departmentCode = departmentName === 'Administration' ? 'ADMIN' : 'MGMT';

  const departmentId = (await ensureDepartmentByName(query, departmentName, departmentCode))?.id as string | undefined;
  if (!departmentId) return { departmentId: null, jobRoleId: null };

  const owner = await query(
    `SELECT id, job_role_id FROM employees WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1`
  );
  const ownerRow = owner.rows[0];

  let title = String(options.jobTitle || '').trim();
  if (!title && ownerRow?.job_role_id) {
    const current = await query(`SELECT title FROM job_roles WHERE id = $1`, [ownerRow.job_role_id]);
    title = String(current.rows[0]?.title || '').trim();
  }
  title = defaultLeadershipTitle(options.industry, title);

  let jobRoleId = (ownerRow?.job_role_id as string | undefined) || undefined;
  if (!jobRoleId) {
    const named = await query(`SELECT id FROM job_roles WHERE title ILIKE $1 LIMIT 1`, [title]);
    jobRoleId = named.rows[0]?.id;
  }
  if (!jobRoleId) {
    const created = await query(
      `INSERT INTO job_roles (title, code, department_id, level)
       VALUES ($1, $2, $3, 'Admin')
       ON CONFLICT (code) DO UPDATE SET
         title = EXCLUDED.title,
         department_id = EXCLUDED.department_id,
         level = EXCLUDED.level
       RETURNING id`,
      [title, departmentName === 'Administration' ? 'PRIN-OWN' : 'CEO-OWN', departmentId]
    );
    jobRoleId = created.rows[0]?.id;
  } else {
    await query(
      `UPDATE job_roles
       SET department_id = COALESCE(department_id, $2),
           level = CASE
             WHEN COALESCE(level, '') IN ('', 'L1', 'Employee') THEN 'Admin'
             ELSE level
           END
       WHERE id = $1`,
      [jobRoleId, departmentId]
    );
  }

  if (ownerRow?.id && jobRoleId) {
    await query(
      `UPDATE employees
       SET department_id = COALESCE(department_id, $2),
           job_role_id = COALESCE(job_role_id, $3)
       WHERE id = $1`,
      [ownerRow.id, departmentId, jobRoleId]
    );
  }

  return { departmentId, jobRoleId: jobRoleId || null };
}
