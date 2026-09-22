import type { Role } from '@/types';

/** Roles accepted by the backend employees / global_auth_mapping CHECK constraints. */
export type ApiAuthRole =
  | 'super_admin'
  | 'hr_manager'
  | 'manager'
  | 'employee'
  | 'faculty'
  | 'student';

/**
 * Map a frontend Role (or free-text) onto a backend auth role.
 * Frontend uses richer labels (team_lead, project_manager, …); the API only
 * persists the six values above.
 */
export function toApiAuthRole(role?: string | null): ApiAuthRole {
  const r = String(role || 'employee').trim().toLowerCase();

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
  return 'employee';
}

/** Infer a backend role from a job title when the UI only captured designation. */
export function inferApiRoleFromDesignation(
  designation?: string | null,
  explicitRole?: string | null
): ApiAuthRole {
  if (explicitRole) {
    const fromExplicit = toApiAuthRole(explicitRole);
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

/** Map backend auth role back to the closest frontend Role. */
export function fromApiAuthRole(role?: string | null): Role {
  const r = String(role || 'employee').trim().toLowerCase();
  if (r === 'super_admin') return 'super_admin';
  if (r === 'hr_manager') return 'hr_manager';
  if (r === 'manager') return 'manager';
  if (r === 'faculty' || r === 'teacher') return 'faculty';
  if (r === 'student') return 'student';
  return 'employee';
}
