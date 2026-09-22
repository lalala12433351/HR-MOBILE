export type ApiAuthRole =
  | 'platform_admin'
  | 'super_admin'
  | 'hr_manager'
  | 'manager'
  | 'employee'
  | 'faculty'
  | 'student';

const VALID: ReadonlySet<string> = new Set([
  'platform_admin',
  'super_admin',
  'hr_manager',
  'manager',
  'employee',
  'faculty',
  'teacher',
  'student',
]);

const PROTECTED_FROM_MANAGER_PROMOTE: ReadonlySet<string> = new Set([
  'platform_admin',
  'super_admin',
  'hr_manager',
]);

type TenantQuery = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

/**
 * Promote an employee to the manager auth role when they are assigned
 * as a team/department manager. Never overwrites super_admin / hr_manager.
 * Also syncs public.global_auth_mapping.role when an email is present.
 */
export async function promoteEmployeeToManager(
  query: TenantQuery,
  employeeId: string | null | undefined
): Promise<{ id: string; email: string; role: string } | null> {
  if (!employeeId) return null;

  const empRes = await query(
    `SELECT id, email, role FROM employees WHERE id = $1::uuid LIMIT 1`,
    [employeeId]
  );
  const emp = empRes.rows[0] as { id: string; email: string; role: string } | undefined;
  if (!emp) return null;

  const currentRole = String(emp.role || '').toLowerCase();
  if (PROTECTED_FROM_MANAGER_PROMOTE.has(currentRole)) {
    return emp;
  }

  if (currentRole !== 'manager') {
    await query(
      `UPDATE employees
       SET role = 'manager'
       WHERE id = $1::uuid
         AND role IS DISTINCT FROM 'super_admin'
         AND role IS DISTINCT FROM 'hr_manager'
         AND role IS DISTINCT FROM 'platform_admin'`,
      [employeeId]
    );
  }

  const email = (emp.email || '').trim().toLowerCase();
  if (email) {
    await query(
      `UPDATE public.global_auth_mapping
       SET role = 'manager'
       WHERE LOWER(email) = $1
         AND role IS DISTINCT FROM 'super_admin'
         AND role IS DISTINCT FROM 'hr_manager'
         AND role IS DISTINCT FROM 'platform_admin'`,
      [email]
    );
  }

  return { id: String(emp.id), email: emp.email, role: 'manager' };
}

/**
 * Normalize any frontend / legacy role string into a DB-safe auth role.
 */
export function normalizeAuthRole(role?: string | null): ApiAuthRole {
  const r = String(role || 'employee').trim().toLowerCase();

  if (r === 'platform_admin' || r === 'platform') return 'platform_admin';
  if (r === 'super_admin' || r === 'admin') return 'super_admin';
  if (r === 'hr_manager' || r === 'hr') return 'hr_manager';
  if (
    r === 'manager' ||
    r === 'team_lead' ||
    r === 'project_manager' ||
    r === 'sales_manager' ||
    r === 'finance_manager' ||
    r === 'management'
  ) {
    return 'manager';
  }
  if (r === 'faculty' || r === 'teacher') return 'faculty';
  if (r === 'student') return 'student';
  if (VALID.has(r)) return r as ApiAuthRole;
  return 'employee';
}

/** Infer auth role from a job title when callers only send designation. */
export function inferAuthRoleFromDesignation(
  designation?: string | null,
  explicitRole?: string | null
): ApiAuthRole {
  if (explicitRole) {
    const fromExplicit = normalizeAuthRole(explicitRole);
    if (fromExplicit !== 'employee' || String(explicitRole).toLowerCase() === 'employee') {
      return fromExplicit;
    }
  }

  const d = String(designation || '').toLowerCase();
  if (!d) return 'employee';

  if (d.includes('hr') || d.includes('people ops') || d.includes('people lead')) {
    return 'hr_manager';
  }
  if (
    d.includes('manager') ||
    d.includes('lead') ||
    d.includes('director') ||
    d.includes('head')
  ) {
    return 'manager';
  }
  if (d.includes('faculty') || d.includes('teacher') || d.includes('professor')) {
    return 'faculty';
  }
  return 'employee';
}
