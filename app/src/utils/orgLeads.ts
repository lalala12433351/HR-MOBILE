import { promoteEmployeeToManager } from './roles.js';

type TenantQuery = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

type LeadKind = 'department' | 'team';

const LEAD_TABLES: Record<LeadKind, { parent: string; leads: string; fk: string }> = {
  department: { parent: 'departments', leads: 'department_leads', fk: 'department_id' },
  team: { parent: 'teams', leads: 'team_leads', fk: 'team_id' },
};

/**
 * Creates the co-lead tables for tenants that have not re-run migration 002,
 * backfilling from the legacy single lead_employee_id columns.
 */
export async function ensureLeadTables(query: TenantQuery): Promise<void> {
  const res = await query(
    `SELECT to_regclass('department_leads') IS NOT NULL AS has_dept,
            to_regclass('team_leads') IS NOT NULL AS has_team`
  );
  if (res.rows[0]?.has_dept && res.rows[0]?.has_team) return;
  await query(`
    CREATE TABLE IF NOT EXISTS department_leads (
      department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (department_id, employee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_department_leads_employee ON department_leads(employee_id);
    CREATE TABLE IF NOT EXISTS team_leads (
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (team_id, employee_id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_leads_employee ON team_leads(employee_id);
    INSERT INTO department_leads (department_id, employee_id, is_primary)
    SELECT d.id, d.lead_employee_id, true FROM departments d
    JOIN employees e ON e.id = d.lead_employee_id
    ON CONFLICT (department_id, employee_id) DO NOTHING;
    INSERT INTO team_leads (team_id, employee_id, is_primary)
    SELECT t.id, t.lead_employee_id, true FROM teams t
    JOIN employees e ON e.id = t.lead_employee_id
    ON CONFLICT (team_id, employee_id) DO NOTHING;
  `);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeLeadIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (!UUID_RE.test(id) || id.startsWith('00000000') || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Replace every lead of a department/team. The first id becomes the primary
 * lead (mirrored to lead_employee_id); an empty list clears all leads.
 */
async function setLeads(
  query: TenantQuery,
  kind: LeadKind,
  parentId: string,
  employeeIds: string[]
): Promise<string[]> {
  const t = LEAD_TABLES[kind];
  const ids = normalizeLeadIds(employeeIds);

  await ensureLeadTables(query);
  await query(`DELETE FROM ${t.leads} WHERE ${t.fk} = $1`, [parentId]);
  for (const [index, employeeId] of ids.entries()) {
    await query(
      `INSERT INTO ${t.leads} (${t.fk}, employee_id, is_primary)
       SELECT $1, e.id, $3 FROM employees e WHERE e.id = $2::uuid
       ON CONFLICT (${t.fk}, employee_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [parentId, employeeId, index === 0]
    );
  }
  await query(`UPDATE ${t.parent} SET lead_employee_id = $2 WHERE id = $1`, [parentId, ids[0] || null]);

  for (const employeeId of ids) {
    await promoteEmployeeToManager(query, employeeId);
  }
  return ids;
}

/**
 * Legacy single-lead update: makes `employeeId` the primary lead while
 * keeping any existing co-leads.
 */
async function setPrimaryLead(
  query: TenantQuery,
  kind: LeadKind,
  parentId: string,
  employeeId: string
): Promise<string[]> {
  const current = await getLeadIds(query, kind, parentId);
  return setLeads(query, kind, parentId, [employeeId, ...current.filter((id) => id !== employeeId)]);
}

export async function getLeadIds(query: TenantQuery, kind: LeadKind, parentId: string): Promise<string[]> {
  const t = LEAD_TABLES[kind];
  await ensureLeadTables(query);
  const res = await query(
    `SELECT employee_id FROM ${t.leads} WHERE ${t.fk} = $1 ORDER BY is_primary DESC, created_at ASC`,
    [parentId]
  );
  return res.rows.map((row: any) => String(row.employee_id));
}

export const setDepartmentLeads = (query: TenantQuery, departmentId: string, employeeIds: string[]) =>
  setLeads(query, 'department', departmentId, employeeIds);

export const setTeamLeads = (query: TenantQuery, teamId: string, employeeIds: string[]) =>
  setLeads(query, 'team', teamId, employeeIds);

export const setPrimaryDepartmentLead = (query: TenantQuery, departmentId: string, employeeId: string) =>
  setPrimaryLead(query, 'department', departmentId, employeeId);

export const setPrimaryTeamLead = (query: TenantQuery, teamId: string, employeeId: string) =>
  setPrimaryLead(query, 'team', teamId, employeeId);

/**
 * True when `managerId` may act as a manager for `employeeId`: their
 * reporting manager, or any co-lead of the employee's department or team.
 */
export async function isManagerOf(
  query: TenantQuery,
  managerId: string | null | undefined,
  employeeId: string | null | undefined
): Promise<boolean> {
  if (!managerId || !employeeId || String(managerId) === String(employeeId)) return false;
  await ensureLeadTables(query);
  const res = await query(
    `SELECT 1
     FROM employees e
     WHERE e.id = $2::uuid
       AND (
         e.reporting_manager_id = $1::uuid
         OR EXISTS (SELECT 1 FROM department_leads dl WHERE dl.department_id = e.department_id AND dl.employee_id = $1::uuid)
         OR EXISTS (SELECT 1 FROM team_leads tl WHERE tl.team_id = e.team_id AND tl.employee_id = $1::uuid)
       )
     LIMIT 1`,
    [managerId, employeeId]
  );
  return res.rows.length > 0;
}
