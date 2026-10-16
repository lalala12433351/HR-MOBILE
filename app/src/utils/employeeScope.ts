import { Request } from 'express';
import { ensureLeadTables } from './orgLeads.js';

export type AccessScopeKind = 'all' | 'team' | 'self';

export type AccessScope = {
  kind: AccessScopeKind;
  /** Caller's employee UUID when resolved */
  meId: string | null;
  /** Explicit allow-list of employee UUIDs when kind is team/self. Empty = no access. */
  employeeIds: string[];
};

type TenantQuery = <T = any>(text: string, params?: any[]) => Promise<{ rows: T[] }>;

const ORG_WIDE_ROLES: string[] = ['super_admin', 'hr_manager', 'hr', 'admin'];
const MANAGER_ROLES: string[] = ['manager', 'team_lead', 'project_manager', 'sales_manager', 'finance_manager'];

function tenantQuery(req: Request): TenantQuery | null {
  return (req.tenantQuery as TenantQuery) || null;
}

/**
 * Resolve the caller's employee row in the current tenant schema.
 */
export async function resolveCallerEmployee(req: Request): Promise<any | null> {
  const q = tenantQuery(req);
  if (!q || !req.user) return null;

  const email = (req.user.email || '').trim().toLowerCase();
  const sub = req.user.sub;

  const result = await q(
    `SELECT id, email, role, team_id, reporting_manager_id, employee_code, first_name, last_name
     FROM employees
     WHERE (cognito_sub IS NOT NULL AND cognito_sub = $1)
        OR ($2 <> '' AND LOWER(email) = $2)
     ORDER BY CASE WHEN cognito_sub = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [sub, email]
  );

  return result.rows[0] || null;
}

/**
 * Build access scope for the authenticated user.
 * - super_admin / hr_manager / admin → entire org
 * - manager → self + direct reports + same team (or teams they lead)
 * - employee / faculty → self only
 */
export async function getAccessScope(req: Request): Promise<AccessScope> {
  const role = (req.user?.role || '') as string;

  if (!role) {
    return { kind: 'self', meId: null, employeeIds: [] };
  }

  if (ORG_WIDE_ROLES.includes(role)) {
    const me = await resolveCallerEmployee(req).catch(() => null);
    return { kind: 'all', meId: me?.id ? String(me.id) : null, employeeIds: [] };
  }

  const me = await resolveCallerEmployee(req);
  if (!me?.id) {
    // Can't resolve self — don't silently wipe the directory for authenticated users.
    // Prefer fail-open for read lists only when role looks managerial; otherwise empty.
    if (MANAGER_ROLES.includes(role)) {
      return { kind: 'all', meId: null, employeeIds: [] };
    }
    return { kind: 'self', meId: null, employeeIds: [] };
  }

  if (MANAGER_ROLES.includes(role) || role === 'manager') {
    const q = tenantQuery(req)!;
    await ensureLeadTables(q);
    const teamRes = await q(
      `SELECT id FROM employees
       WHERE id = $1
          OR reporting_manager_id = $1
          OR (team_id IS NOT NULL AND team_id = $2)
          OR team_id IN (SELECT id FROM teams WHERE lead_employee_id = $1)
          OR team_id IN (SELECT team_id FROM team_leads WHERE employee_id = $1)
          OR department_id IN (SELECT department_id FROM department_leads WHERE employee_id = $1)`,
      [me.id, me.team_id || null]
    );
    const ids = Array.from(new Set(teamRes.rows.map((r: any) => String(r.id))));
    return { kind: 'team', meId: String(me.id), employeeIds: ids };
  }

  // employee / faculty / everything else → self only
  return { kind: 'self', meId: String(me.id), employeeIds: [String(me.id)] };
}

/**
 * Append a SQL filter so `employeeColumn` is restricted to the caller's scope.
 * Returns updated params array (mutates params in place for convenience).
 */
export function applyEmployeeScopeFilter(
  scope: AccessScope,
  sql: string,
  params: any[],
  employeeColumn: string
): string {
  if (scope.kind === 'all') return sql;
  if (!scope.employeeIds.length) {
    params.push('00000000-0000-0000-0000-000000000000');
    return `${sql} AND ${employeeColumn} = $${params.length}::uuid`;
  }
  params.push(scope.employeeIds);
  return `${sql} AND ${employeeColumn} = ANY($${params.length}::uuid[])`;
}

/**
 * Returns true if the caller may access the given employee id/code/email.
 */
export async function canAccessEmployee(
  req: Request,
  targetId: string
): Promise<{ ok: boolean; target: any | null; scope: AccessScope; me: any | null }> {
  const scope = await getAccessScope(req);
  const q = tenantQuery(req);
  if (!q) return { ok: false, target: null, scope, me: null };

  const targetRes = await q(
    `SELECT id, email, role, team_id, reporting_manager_id, employee_code
     FROM employees
     WHERE id::text = $1 OR employee_code = $1 OR LOWER(email) = LOWER($1)
     LIMIT 1`,
    [targetId]
  );
  const target = targetRes.rows[0] || null;
  if (!target) return { ok: false, target: null, scope, me: null };

  if (scope.kind === 'all') {
    return { ok: true, target, scope, me: null };
  }

  const ok = scope.employeeIds.includes(String(target.id));
  const me = scope.meId
    ? { id: scope.meId }
    : await resolveCallerEmployee(req);

  return { ok, target, scope, me };
}

/**
 * Employee UUIDs whose tasks/projects the caller may modify, or null for org-wide access.
 * Same as the access scope, minus anyone above the caller (reporting chain + their team lead).
 */
export async function getManageableEmployeeIds(req: Request): Promise<Set<string> | null> {
  if (isOrgWideRole(req.user?.role)) return null;
  const scope = await getAccessScope(req);
  // Unresolved managers get 'all' for reads only; never for writes.
  if (!scope.meId) return new Set();

  const ids = new Set(scope.employeeIds);
  const q = tenantQuery(req);
  if (!q) return ids;

  const superiors = await q(
    `WITH RECURSIVE chain AS (
       SELECT reporting_manager_id AS id, 1 AS depth FROM employees WHERE id = $1
       UNION
       SELECT e.reporting_manager_id, c.depth + 1
       FROM employees e JOIN chain c ON e.id = c.id
       WHERE c.depth < 20
     )
     SELECT id FROM chain WHERE id IS NOT NULL
     UNION
     SELECT t.lead_employee_id FROM teams t
     JOIN employees me ON me.team_id = t.id
     WHERE me.id = $1 AND t.lead_employee_id IS NOT NULL`,
    [scope.meId]
  );
  for (const row of superiors.rows) {
    if (String(row.id) !== scope.meId) ids.delete(String(row.id));
  }
  ids.add(scope.meId);
  return ids;
}

export function isManagerRole(role?: string | null): boolean {
  return !!role && (ORG_WIDE_ROLES.includes(role) || MANAGER_ROLES.includes(role));
}

/** True when caller is org-wide admin/HR. */
export function isOrgWideRole(role?: string | null): boolean {
  return !!role && ORG_WIDE_ROLES.includes(role);
}

/**
 * Approve/reject is a decision: org-wide HR/admin, reporting or team lead, or the
 * project manager. The timesheet owner can never decide their own row.
 */
export async function canDecideTimesheet(
  req: Request,
  row: { employee_id: string; project_id?: string | null }
): Promise<{ ok: boolean; meId: string | null; reason: string }> {
  const me = await resolveCallerEmployee(req);
  const meId = me?.id ? String(me.id) : null;
  const ownerId = String(row.employee_id || '');
  const forbidden = 'Only a manager, team lead, project manager, or HR can approve this timesheet.';

  if (meId && ownerId && meId === ownerId) {
    return { ok: false, meId, reason: 'You cannot approve or reject your own timesheet.' };
  }

  if (isOrgWideRole(req.user?.role)) {
    return { ok: true, meId, reason: '' };
  }

  const ids = await getManageableEmployeeIds(req);
  if (ids && ownerId && ids.has(ownerId) && ownerId !== meId) {
    return { ok: true, meId, reason: '' };
  }

  if (row.project_id) {
    const q = tenantQuery(req);
    if (q && meId) {
      const project = await q(`SELECT manager_id FROM projects WHERE id = $1`, [row.project_id]);
      if (project.rows[0]?.manager_id && String(project.rows[0].manager_id) === meId) {
        return { ok: true, meId, reason: '' };
      }
    }
  }

  return { ok: false, meId, reason: forbidden };
}
