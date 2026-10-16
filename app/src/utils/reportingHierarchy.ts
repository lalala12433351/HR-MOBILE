import { ensureLeadTables } from './orgLeads.js';

type TenantQuery = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

const APEX_TITLE_RE =
  /\b(ceo|chief executive|founder|president|managing director)\b/i;

export function isApexTitle(title: string | null | undefined): boolean {
  return APEX_TITLE_RE.test(String(title || ''));
}

export function isApexEmployee(emp: {
  role?: string | null;
  job_title?: string | null;
  title?: string | null;
}): boolean {
  const role = String(emp.role || '').toLowerCase();
  if (role === 'super_admin') return true;
  return isApexTitle(emp.job_title || emp.title);
}

function wouldCreateCycle(
  managerById: Map<string, string | null>,
  employeeId: string,
  managerId: string | null
): boolean {
  if (!managerId) return false;
  if (managerId === employeeId) return true;
  const seen = new Set<string>([employeeId]);
  let cursor: string | null = managerId;
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = managerById.get(cursor) ?? null;
  }
  return false;
}

function groupLeadIds(rows: any[], fk: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const parentId = String(row[fk]);
    const list = map.get(parentId) || [];
    list.push(String(row.employee_id));
    map.set(parentId, list);
  }
  return map;
}

async function loadOrgSnapshot(query: TenantQuery) {
  await ensureLeadTables(query);
  const [empRes, deptRes, teamRes, deptLeadRes, teamLeadRes] = await Promise.all([
    query(
      `SELECT e.id,
              e.role,
              e.department_id,
              e.team_id,
              e.reporting_manager_id,
              j.title as job_title
       FROM employees e
       LEFT JOIN job_roles j ON e.job_role_id = j.id`
    ),
    query(`SELECT id, lead_employee_id FROM departments`),
    query(`SELECT id, department_id, lead_employee_id FROM teams`),
    query(`SELECT department_id, employee_id FROM department_leads ORDER BY is_primary DESC, created_at ASC`),
    query(`SELECT team_id, employee_id FROM team_leads ORDER BY is_primary DESC, created_at ASC`),
  ]);
  const deptLeadIds = groupLeadIds(deptLeadRes.rows, 'department_id');
  const teamLeadIds = groupLeadIds(teamLeadRes.rows, 'team_id');

  const employees = empRes.rows.map((row: any) => ({
    id: String(row.id),
    role: row.role as string | null,
    department_id: row.department_id ? String(row.department_id) : null,
    team_id: row.team_id ? String(row.team_id) : null,
    reporting_manager_id: row.reporting_manager_id ? String(row.reporting_manager_id) : null,
    job_title: row.job_title as string | null,
  }));

  const departments = deptRes.rows.map((row: any) => ({
    id: String(row.id),
    lead_employee_id: row.lead_employee_id ? String(row.lead_employee_id) : null,
    lead_ids: deptLeadIds.get(String(row.id)) || (row.lead_employee_id ? [String(row.lead_employee_id)] : []),
  }));

  const teams = teamRes.rows.map((row: any) => ({
    id: String(row.id),
    department_id: row.department_id ? String(row.department_id) : null,
    lead_employee_id: row.lead_employee_id ? String(row.lead_employee_id) : null,
    lead_ids: teamLeadIds.get(String(row.id)) || (row.lead_employee_id ? [String(row.lead_employee_id)] : []),
  }));

  return { employees, departments, teams };
}

function pickPrimaryApex(
  employees: Array<{ id: string; role?: string | null; job_title?: string | null }>
): string | null {
  const apex = employees.filter((e) => isApexEmployee(e));
  const superAdmin = apex.find((e) => String(e.role || '').toLowerCase() === 'super_admin');
  return superAdmin?.id || apex[0]?.id || null;
}

function expectedManagerId(
  emp: {
    id: string;
    department_id: string | null;
    team_id: string | null;
  },
  opts: {
    apexIds: Set<string>;
    primaryApexId: string | null;
    deptLeadsById: Map<string, string[]>;
    teamLeadsById: Map<string, string[]>;
  }
): string | null {
  if (opts.apexIds.has(emp.id)) return null;

  const deptLeads = emp.department_id ? opts.deptLeadsById.get(emp.department_id) || [] : [];
  const teamLeads = emp.team_id ? opts.teamLeadsById.get(emp.team_id) || [] : [];
  const isDeptLead = deptLeads.includes(emp.id);

  // Co-leads never report to each other; they fall through to the apex.
  if (deptLeads.length && !isDeptLead) return deptLeads[0];

  if (teamLeads.length && !isDeptLead && !teamLeads.includes(emp.id)) return teamLeads[0];

  if (opts.primaryApexId && opts.primaryApexId !== emp.id) return opts.primaryApexId;
  return null;
}

function isAutoManagedManager(
  current: string | null,
  expected: string | null,
  autoIds: Set<string>
): boolean {
  if (!current) return true;
  if (current === expected) return true;
  return autoIds.has(current);
}

export async function resolveDefaultReportingManagerId(
  query: TenantQuery,
  args: {
    employeeId?: string | null;
    departmentId?: string | null;
    teamId?: string | null;
    role?: string | null;
    jobTitle?: string | null;
  }
): Promise<string | null> {
  if (isApexEmployee({ role: args.role, job_title: args.jobTitle })) {
    return null;
  }

  const { employees, departments, teams } = await loadOrgSnapshot(query);
  const primaryApexId = pickPrimaryApex(employees);
  const selfId = args.employeeId ? String(args.employeeId) : '';
  const deptLeads = args.departmentId
    ? departments.find((d) => d.id === String(args.departmentId))?.lead_ids || []
    : [];
  const isDeptLead = !!selfId && deptLeads.includes(selfId);
  if (deptLeads.length && !isDeptLead) return deptLeads[0];

  const teamLeads = args.teamId
    ? teams.find((t) => t.id === String(args.teamId))?.lead_ids || []
    : [];
  if (teamLeads.length && !isDeptLead && !(selfId && teamLeads.includes(selfId))) return teamLeads[0];

  if (primaryApexId && primaryApexId !== args.employeeId) return primaryApexId;
  return null;
}

/**
 * Assigns reporting_manager_id from org structure:
 * Founder/CEO (null) → department head → members.
 * Only fills missing links or links still pointing at previous auto managers.
 */
export async function syncReportingHierarchy(
  query: TenantQuery,
  options?: {
    previousDeptLeads?: Record<string, string | null>;
    previousLeadIds?: string[];
    skipEmployeeIds?: string[];
  }
): Promise<{ updated: number }> {
  const { employees, departments, teams } = await loadOrgSnapshot(query);
  const deptLeadsById = new Map(departments.map((d) => [d.id, d.lead_ids]));
  const teamLeadsById = new Map(teams.map((t) => [t.id, t.lead_ids]));
  const apexIds = new Set(employees.filter((e) => isApexEmployee(e)).map((e) => e.id));
  const primaryApexId = pickPrimaryApex(employees);

  const autoIds = new Set<string>();
  if (primaryApexId) autoIds.add(primaryApexId);
  for (const leads of deptLeadsById.values()) {
    for (const lead of leads) autoIds.add(lead);
  }
  for (const leads of teamLeadsById.values()) {
    for (const lead of leads) autoIds.add(lead);
  }
  for (const prev of Object.values(options?.previousDeptLeads || {})) {
    if (prev) autoIds.add(prev);
  }
  for (const prev of options?.previousLeadIds || []) {
    if (prev) autoIds.add(String(prev));
  }

  const skip = new Set((options?.skipEmployeeIds || []).map(String));
  const managerById = new Map(employees.map((e) => [e.id, e.reporting_manager_id]));
  let updated = 0;

  for (const emp of employees) {
    if (skip.has(emp.id)) continue;
    const expected = expectedManagerId(emp, {
      apexIds,
      primaryApexId,
      deptLeadsById,
      teamLeadsById,
    });
    const current = emp.reporting_manager_id;
    if (current === expected) continue;
    if (!isAutoManagedManager(current, expected, autoIds)) continue;
    if (wouldCreateCycle(managerById, emp.id, expected)) continue;

    await query(`UPDATE employees SET reporting_manager_id = $2 WHERE id = $1`, [
      emp.id,
      expected,
    ]);
    managerById.set(emp.id, expected);
    emp.reporting_manager_id = expected;
    updated += 1;
  }

  return { updated };
}
