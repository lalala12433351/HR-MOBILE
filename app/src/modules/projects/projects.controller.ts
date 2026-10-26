import { Request, Response } from 'express';
import {
  applyEmployeeScopeFilter,
  canAccessEmployee,
  canDecideTimesheet,
  getAccessScope,
  getManageableEmployeeIds,
  isManagerRole,
  isOrgWideRole,
  resolveCallerEmployee,
} from '../../utils/employeeScope.js';
import {
  currentTaskAssigneeIds,
  ensureTaskNotificationTables,
  queueTaskAssignmentEmails,
} from './taskNotifications.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val: any): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

/** Unassigned (null) targets are only manageable by managers. */
async function canManageEmployee(req: Request, employeeId: string | null | undefined): Promise<boolean> {
  const ids = await getManageableEmployeeIds(req);
  if (ids === null) return true;
  if (!employeeId) return isManagerRole(req.user?.role);
  return ids.has(String(employeeId));
}

const generalSettingsCache = new WeakMap<Request, Promise<Record<string, unknown>>>();

function loadGeneralSettings(req: Request): Promise<Record<string, unknown>> {
  const cached = generalSettingsCache.get(req);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const row = await req.tenantQuery!(
        `SELECT value FROM tenant_settings WHERE key = 'general' LIMIT 1`
      );
      const raw = row.rows[0]?.value;
      const settings = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();
  generalSettingsCache.set(req, pending);
  return pending;
}

function profileFlag(
  req: Request,
  key: 'anyoneCanAssignTasks' | 'anyoneCanCreateProjects'
): Promise<boolean> {
  return loadGeneralSettings(req).then((settings) => {
    const profile = settings.profileSelfServiceSettings;
    if (!profile || typeof profile !== 'object') return false;
    return (profile as Record<string, unknown>)[key] === true;
  });
}

/** Workspace setting: any employee may assign any task to anyone in the tenant. */
function openTaskAssignmentEnabled(req: Request): Promise<boolean> {
  return profileFlag(req, 'anyoneCanAssignTasks');
}

/** Workspace setting: any employee may create a project. */
function openProjectCreationEnabled(req: Request): Promise<boolean> {
  return profileFlag(req, 'anyoneCanCreateProjects');
}

const PROJECT_CREATOR_ROLES = new Set(['super_admin', 'manager', 'hr_manager']);

const ASSIGNEE_UPDATE_KEYS = new Set([
  'assignedToEmployeeId',
  'assignedToEmployeeIds',
  'assigned_to_employee_id',
  'assigned_to_employee_ids',
]);

function isAssigneeOnlyUpdate(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body || {}).filter((key) => body[key] !== undefined);
  return keys.length > 0 && keys.every((key) => ASSIGNEE_UPDATE_KEYS.has(key));
}

function sendForbidden(res: Response, message: string): void {
  res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message } });
}

async function ensureCanManageProject(req: Request, res: Response, projectId: string): Promise<boolean> {
  const project = await req.tenantQuery!(`SELECT manager_id FROM projects WHERE id = $1`, [projectId]);
  if (project.rows.length === 0) return true;
  if (await canManageEmployee(req, project.rows[0].manager_id)) return true;
  sendForbidden(res, 'You cannot modify projects led by someone above you or outside your team.');
  return false;
}

async function resolveEmployeeId(req: Request, employeeIdentifier?: string): Promise<string | null> {
  if (employeeIdentifier) {
    const clean = String(employeeIdentifier).trim();
    if (!clean) return null;
    if (isUuid(clean)) {
      const emp = await req.tenantQuery!('SELECT id FROM employees WHERE id = $1 LIMIT 1', [clean]);
      if (emp.rows[0]?.id) return emp.rows[0].id;
      // Explicit UUID that doesn't exist — do not silently reassign to someone else
      return null;
    }
    const emp = await req.tenantQuery!(
      `SELECT id FROM employees 
       WHERE id::text = $1 
          OR employee_code = $1 
          OR cognito_sub = $1 
          OR LOWER(email) = LOWER($1) 
       LIMIT 1`,
      [clean]
    );
    if (emp.rows[0]?.id && isUuid(emp.rows[0].id)) {
      return emp.rows[0].id;
    }
    return null;
  }

  // No identifier provided — resolve caller when possible, else first employee (legacy create paths)
  const me = await resolveCallerEmployee(req).catch(() => null);
  if (me?.id && isUuid(String(me.id))) return String(me.id);

  const fallback = await req.tenantQuery!('SELECT id FROM employees ORDER BY created_at ASC LIMIT 1');
  if (fallback.rows[0]?.id && isUuid(fallback.rows[0].id)) {
    return fallback.rows[0].id;
  }
  return null;
}

async function resolveProjectId(req: Request, projectIdentifier?: string): Promise<string | null> {
  if (projectIdentifier) {
    const clean = String(projectIdentifier).trim();
    if (clean && clean !== 'standalone' && isUuid(clean)) {
      const proj = await req.tenantQuery!('SELECT id FROM projects WHERE id = $1 LIMIT 1', [clean]);
      if (proj.rows[0]?.id) return proj.rows[0].id;
    }
    if (clean && clean !== 'standalone') {
      const proj = await req.tenantQuery!('SELECT id FROM projects WHERE code = $1 LIMIT 1', [clean]);
      if (proj.rows[0]?.id && isUuid(proj.rows[0].id)) {
        return proj.rows[0].id;
      }
    }
  }

  // Look for any existing project
  const defaultProj = await req.tenantQuery!('SELECT id FROM projects ORDER BY created_at ASC LIMIT 1');
  if (defaultProj.rows[0]?.id && isUuid(defaultProj.rows[0].id)) {
    return defaultProj.rows[0].id;
  }

  // If no project exists at all in the tenant schema, auto-provision a default project
  const empId = await resolveEmployeeId(req);
  const newProj = await req.tenantQuery!(
    `INSERT INTO projects (name, code, description, manager_id, status)
     VALUES ('General Operations', 'GEN-001', 'Default workspace project for operational tasks', $1, 'in_progress')
     RETURNING id`,
    [empId]
  );
  if (newProj.rows[0]?.id && isUuid(newProj.rows[0].id)) {
    return newProj.rows[0].id;
  }

  return null;
}

async function resolveTaskId(req: Request, taskIdentifier?: string): Promise<string | null> {
  if (!taskIdentifier) return null;
  const clean = String(taskIdentifier).trim();
  if (isUuid(clean)) {
    const t = await req.tenantQuery!('SELECT id FROM project_tasks WHERE id = $1 LIMIT 1', [clean]);
    if (t.rows[0]?.id) return t.rows[0].id;
  }
  const t = await req.tenantQuery!(
    `SELECT id FROM project_tasks 
     WHERE id::text = $1 
        OR LOWER(title) = LOWER($1)
     ORDER BY created_at DESC
     LIMIT 1`,
    [clean]
  );
  if (t.rows[0]?.id) return t.rows[0].id;
  return null;
}

async function ensureTaskExtraColumns(req: Request): Promise<void> {
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS timer_started_at TIMESTAMPTZ`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS time_spent_seconds INTEGER NOT NULL DEFAULT 0`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS recurrence_series_id UUID`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS recurrence_rule JSONB`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS recurrence_end DATE`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS is_recurrence_template BOOLEAN NOT NULL DEFAULT false`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS occurrence_date DATE`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT true`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS billing_type VARCHAR(16) NOT NULL DEFAULT 'deliverable'`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS invoice_id UUID`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS client_id UUID`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS attached_docs JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS board_order INTEGER`);
  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS project_task_assignees (
      task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (task_id, employee_id)
    )
  `);
  await req.tenantQuery!(
    `CREATE INDEX IF NOT EXISTS idx_project_task_assignees_employee ON project_task_assignees(employee_id)`
  );
  await ensureTaskNotificationTables(req.tenantQuery!);
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

async function setTaskAssignees(req: Request, taskId: string, employeeIds: string[]): Promise<void> {
  const ids = uniqueIds(employeeIds);
  const primary = ids[0] || null;
  await req.tenantQuery!(`UPDATE project_tasks SET assigned_to_employee_id = $2 WHERE id = $1`, [taskId, primary]);
  await req.tenantQuery!(`DELETE FROM project_task_assignees WHERE task_id = $1`, [taskId]);
  for (let i = 0; i < ids.length; i += 1) {
    await req.tenantQuery!(
      `INSERT INTO project_task_assignees (task_id, employee_id, is_primary) VALUES ($1, $2, $3)
       ON CONFLICT (task_id, employee_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [taskId, ids[i], i === 0]
    );
  }
}

async function copyTaskAssignees(req: Request, fromTaskId: string, toTaskId: string): Promise<void> {
  const existing = await req.tenantQuery!(
    `SELECT employee_id, is_primary FROM project_task_assignees WHERE task_id = $1 ORDER BY is_primary DESC`,
    [fromTaskId]
  );
  let ids = existing.rows.map((row: any) => String(row.employee_id));
  if (!ids.length) {
    const primary = await req.tenantQuery!(`SELECT assigned_to_employee_id FROM project_tasks WHERE id = $1`, [fromTaskId]);
    if (primary.rows[0]?.assigned_to_employee_id) ids = [String(primary.rows[0].assigned_to_employee_id)];
  }
  await setTaskAssignees(req, toTaskId, ids);
}

async function attachAssignees(req: Request, rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  const ids = rows.map((row) => String(row.id)).filter(Boolean);
  const result = await req.tenantQuery!(
    `SELECT a.task_id, a.employee_id, a.is_primary,
            TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(NULLIF(e.last_name, 'User'), e.last_name, '')) AS name
     FROM project_task_assignees a
     JOIN employees e ON e.id = a.employee_id
     WHERE a.task_id = ANY($1::uuid[])
     ORDER BY a.is_primary DESC, e.first_name`,
    [ids]
  );
  const byTask = new Map<string, { ids: string[]; names: string[] }>();
  for (const row of result.rows) {
    const taskId = String(row.task_id);
    const current = byTask.get(taskId) || { ids: [], names: [] };
    current.ids.push(String(row.employee_id));
    current.names.push(String(row.name || '').replace(/\s+/g, ' ').trim());
    byTask.set(taskId, current);
  }
  return rows.map((row) => {
    const attached = byTask.get(String(row.id));
    const fallbackId = row.assigned_to_employee_id ? String(row.assigned_to_employee_id) : '';
    const fallbackName = String(row.assigned_to_name || '').trim();
    const assignedIds = attached?.ids.length ? attached.ids : fallbackId ? [fallbackId] : [];
    const assignedNames = attached?.names.length ? attached.names : fallbackName ? [fallbackName] : [];
    return {
      ...row,
      assigned_to_employee_id: assignedIds[0] || row.assigned_to_employee_id || null,
      assigned_to_name: assignedNames[0] || row.assigned_to_name || null,
      assigned_to_employee_ids: assignedIds,
      assigned_to_names: assignedNames,
    };
  });
}

async function resolveAssigneeIds(req: Request, body: any): Promise<string[] | undefined> {
  const openAssignment = await openTaskAssignmentEnabled(req);
  const assertAssignable = async (id: string) => {
    if (openAssignment) return;
    if (!(await canManageEmployee(req, id))) {
      throw Object.assign(new Error('You cannot assign tasks to someone above you or outside your team.'), { status: 403 });
    }
  };
  if (body?.assignedToEmployeeIds !== undefined) {
    const raw = Array.isArray(body.assignedToEmployeeIds) ? body.assignedToEmployeeIds : [];
    const ids: string[] = [];
    for (const value of raw) {
      const id = await resolveEmployeeId(req, value);
      if (id && isUuid(id)) {
        await assertAssignable(id);
        ids.push(id);
      }
    }
    return uniqueIds(ids);
  }
  if (body?.assignedToEmployeeId !== undefined) {
    if (!body.assignedToEmployeeId) return [];
    const id = await resolveEmployeeId(req, body.assignedToEmployeeId);
    if (id && !isUuid(id)) return [];
    if (id) await assertAssignable(id);
    return id ? [id] : [];
  }
  return undefined;
}

async function canManageTaskRow(req: Request, taskId: string, primaryAssigneeId?: string | null): Promise<boolean> {
  if (isOrgWideRole(req.user?.role)) return true;
  const me = await resolveCallerEmployee(req);
  const meId = me?.id ? String(me.id) : '';
  const listed = await req.tenantQuery!(
    `SELECT employee_id FROM project_task_assignees WHERE task_id = $1`,
    [taskId]
  );
  const ids = uniqueIds([
    ...listed.rows.map((row: any) => String(row.employee_id)),
    primaryAssigneeId ? String(primaryAssigneeId) : '',
  ]);
  if (meId && ids.includes(meId)) return true;
  if (!ids.length) return isManagerRole(req.user?.role);
  for (const id of ids) {
    if (await canManageEmployee(req, id)) return true;
  }
  return false;
}

function shiftIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function addFrequency(isoDate: string, frequency: string): string {
  if (frequency === 'daily') return shiftIsoDate(isoDate, 1);
  if (frequency === 'biweekly') return shiftIsoDate(isoDate, 14);
  if (frequency === 'monthly') {
    const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    dt.setUTCMonth(dt.getUTCMonth() + 1);
    return dt.toISOString().slice(0, 10);
  }
  return shiftIsoDate(isoDate, 7);
}

function parseRecurrenceRule(raw: unknown): { frequency?: string; weekday?: number; count?: number } | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw as { frequency?: string; weekday?: number; count?: number };
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

async function spawnNextOccurrence(req: Request, taskRow: any): Promise<any | null> {
  if (!taskRow?.recurrence_series_id || taskRow.is_recurrence_template) return null;
  const rule = parseRecurrenceRule(taskRow.recurrence_rule);
  const frequency = String(rule?.frequency || '').toLowerCase();
  if (!frequency) return null;

  const base = taskRow.occurrence_date || taskRow.due_date;
  if (!base) return null;
  const nextDate = addFrequency(String(base).slice(0, 10), frequency);
  if (taskRow.recurrence_end && nextDate > String(taskRow.recurrence_end).slice(0, 10)) return null;

  if (rule?.count && Number(rule.count) > 0) {
    const counted = await req.tenantQuery!(
      `SELECT COUNT(*)::int AS n FROM project_tasks
       WHERE recurrence_series_id = $1 AND COALESCE(is_recurrence_template, false) = false`,
      [taskRow.recurrence_series_id]
    );
    if (Number(counted.rows[0]?.n || 0) >= Number(rule.count)) return null;
  }

  const existing = await req.tenantQuery!(
    `SELECT * FROM project_tasks
     WHERE recurrence_series_id = $1
       AND occurrence_date = $2
       AND COALESCE(is_recurrence_template, false) = false
     LIMIT 1`,
    [taskRow.recurrence_series_id, nextDate]
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await req.tenantQuery!(
    `INSERT INTO project_tasks (
       project_id, title, description, assigned_to_employee_id, priority, status, due_date,
       recurrence_series_id, recurrence_rule, recurrence_end, is_recurrence_template,
       occurrence_date, parent_task_id, billable, billing_type, unit_price, client_id
     )
     VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7, $8::jsonb, $9, false, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      taskRow.project_id,
      taskRow.title,
      taskRow.description,
      taskRow.assigned_to_employee_id,
      taskRow.priority,
      taskRow.due_date ? nextDate : null,
      taskRow.recurrence_series_id,
      JSON.stringify(rule),
      taskRow.recurrence_end || null,
      nextDate,
      taskRow.parent_task_id || taskRow.id,
      taskRow.billable !== false,
      taskRow.billing_type || 'deliverable',
      Number(taskRow.unit_price) || 0,
      taskRow.client_id || null,
    ]
  );
  const created = inserted.rows[0];
  if (created?.id && taskRow.id) {
    await copyTaskAssignees(req, String(taskRow.id), String(created.id));
  }
  return created || null;
}

async function applyRecurrenceToFuture(req: Request, before: any, after: any, body: any): Promise<void> {
  if (body.applyTo !== 'future' || !before?.recurrence_series_id) return;

  const shared: string[] = [];
  const params: any[] = [];
  const push = (col: string, val: any) => {
    params.push(val);
    shared.push(`${col} = $${params.length}`);
  };

  if (body.title !== undefined) push('title', after.title);
  if (body.description !== undefined) push('description', after.description);
  if (body.priority !== undefined) push('priority', after.priority);
  if (body.assignedToEmployeeId !== undefined) push('assigned_to_employee_id', after.assigned_to_employee_id);
  if (body.billable !== undefined) push('billable', after.billable);
  if (body.billingType !== undefined) push('billing_type', after.billing_type);
  if (body.unitPrice !== undefined) push('unit_price', after.unit_price);
  if (body.recurrenceEnd !== undefined) push('recurrence_end', after.recurrence_end);
  if (body.recurrence !== undefined || body.recurrenceRule !== undefined) {
    push('recurrence_rule', after.recurrence_rule);
  }

  const oldDue = before.due_date ? String(before.due_date).slice(0, 10) : null;
  const newDue = after.due_date ? String(after.due_date).slice(0, 10) : null;
  let deltaDays = 0;
  if (body.dueDate !== undefined && oldDue && newDue) {
    const a = Date.parse(`${oldDue}T00:00:00Z`);
    const b = Date.parse(`${newDue}T00:00:00Z`);
    deltaDays = Math.round((b - a) / 86400000);
  }

  if (shared.length > 0) {
    params.push(before.recurrence_series_id);
    const seriesParam = params.length;
    await req.tenantQuery!(
      `UPDATE project_tasks SET ${shared.join(', ')}
       WHERE recurrence_series_id = $${seriesParam} AND COALESCE(is_recurrence_template, false) = true`,
      params
    );

    const futureParams = [...params];
    futureParams.push(before.id);
    const idParam = futureParams.length;
    const occurrence = before.occurrence_date ? String(before.occurrence_date).slice(0, 10) : oldDue;
    futureParams.push(occurrence);
    const occParam = futureParams.length;
    await req.tenantQuery!(
      `UPDATE project_tasks SET ${shared.join(', ')}
       WHERE recurrence_series_id = $${seriesParam}
         AND COALESCE(is_recurrence_template, false) = false
         AND id <> $${idParam}
         AND status <> 'done'
         AND (occurrence_date IS NULL OR occurrence_date >= $${occParam})`,
      futureParams
    );
  }

  if (deltaDays !== 0) {
    const rows = await req.tenantQuery!(
      `SELECT id, due_date, occurrence_date FROM project_tasks
       WHERE recurrence_series_id = $1
         AND COALESCE(is_recurrence_template, false) = false
         AND id <> $2
         AND status <> 'done'
         AND (occurrence_date IS NULL OR occurrence_date >= $3)`,
      [
        before.recurrence_series_id,
        before.id,
        before.occurrence_date ? String(before.occurrence_date).slice(0, 10) : oldDue,
      ]
    );
    for (const row of rows.rows) {
      const due = row.due_date ? shiftIsoDate(String(row.due_date), deltaDays) : null;
      const occ = row.occurrence_date ? shiftIsoDate(String(row.occurrence_date), deltaDays) : due;
      await req.tenantQuery!(
        `UPDATE project_tasks SET due_date = $2, occurrence_date = $3 WHERE id = $1`,
        [row.id, due, occ]
      );
    }
  }
}

export async function getProjects(req: Request, res: Response): Promise<void> {
  try {
    await ensureProjectExtraColumns(req);
    const result = await req.tenantQuery!(
      `SELECT 
        p.*,
        e.first_name || ' ' || e.last_name as manager_name
       FROM projects p
       LEFT JOIN employees e ON p.manager_id = e.id
       ORDER BY p.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

function normalizeProjectStatus(raw: unknown): string {
  const clean = String(raw ?? '').toLowerCase().trim().replace(/[\s_-]+/g, '');
  if (clean === 'planning' || clean === 'planned') return 'planning';
  if (clean === 'onhold' || clean === 'paused') return 'on_hold';
  if (clean === 'completed' || clean === 'done' || clean === 'finished') return 'completed';
  return 'in_progress';
}

function normalizeProjectPriority(raw: unknown): string {
  const clean = String(raw ?? '').toLowerCase().trim();
  if (clean === 'low') return 'low';
  if (clean === 'high') return 'high';
  if (clean === 'urgent' || clean === 'critical') return 'urgent';
  return 'medium';
}

export async function createProject(req: Request, res: Response): Promise<void> {
  try {
    const role = String(req.user?.role || '');
    if (!PROJECT_CREATOR_ROLES.has(role) && !(await openProjectCreationEnabled(req))) {
      sendForbidden(res, 'Only admins and managers can create projects.');
      return;
    }

    const { name, code, description, clientName, clientId, managerId, startDate, endDate, status, category, priority, totalWorkHours } = req.body;
    const cleanName = String(name || '').trim();
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanName || !cleanCode) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'Project name and code are required.' } });
      return;
    }

    let validManagerId = await resolveEmployeeId(req, managerId);
    if (validManagerId && !isUuid(validManagerId)) {
      validManagerId = null;
    }

    await ensureProjectExtraColumns(req);
    let resolvedClientId = isUuid(String(clientId || '')) ? String(clientId) : null;
    let resolvedClientName = String(clientName || '').trim() || null;
    if (resolvedClientId) {
      const client = await req.tenantQuery!(`SELECT id, name, company_name FROM billing_clients WHERE id = $1`, [resolvedClientId]);
      if (client.rows[0]) {
        resolvedClientName = client.rows[0].company_name || client.rows[0].name;
      } else {
        resolvedClientId = null;
      }
    }

    const hours = totalWorkHours === undefined || totalWorkHours === null || totalWorkHours === ''
      ? null
      : Number(totalWorkHours);

    const result = await req.tenantQuery!(
      `INSERT INTO projects (
         name, code, description, client_name, client_id, manager_id, start_date, end_date,
         status, category, priority, total_work_hours
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        cleanName,
        cleanCode,
        String(description || '').trim() || null,
        resolvedClientName,
        resolvedClientId,
        validManagerId || null,
        startDate || null,
        endDate || null,
        normalizeProjectStatus(status),
        String(category || '').trim() || null,
        normalizeProjectPriority(priority),
        Number.isFinite(hours as number) ? hours : null,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    if (err?.code === '23505') {
      res.status(409).json({ success: false, error: { code: 'DUPLICATE_CODE', message: 'A project with this code already exists.' } });
      return;
    }
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getTasks(req: Request, res: Response): Promise<void> {
  try {
    await ensureTaskExtraColumns(req);
    const { projectId } = req.query;
    let sql = `
      SELECT 
        t.*,
        p.name as project_name,
        e.role as assignee_role,
        TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(NULLIF(e.last_name, 'User'), e.last_name, '')) as assigned_to_name
      FROM project_tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN employees e ON t.assigned_to_employee_id = e.id
      WHERE COALESCE(t.is_recurrence_template, false) = false
    `;
    const params: any[] = [];
    if (projectId && projectId !== 'All' && projectId !== 'standalone') {
      params.push(projectId);
      if (isUuid(projectId)) {
        sql += ` AND t.project_id = $${params.length}`;
      } else {
        sql += ` AND p.code = $${params.length}`;
      }
    }
    sql += ` ORDER BY
      CASE WHEN t.board_order IS NULL THEN 1 ELSE 0 END,
      t.board_order ASC,
      CASE LOWER(t.priority) WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      t.created_at DESC`;

    const result = await req.tenantQuery!(sql, params);
    const hydrated = await attachAssignees(req, result.rows);
    // Assignment permission does not grant a view of other people's tasks.
    if (isOrgWideRole(req.user?.role)) {
      res.json({ success: true, data: hydrated });
      return;
    }

    const allowed = await getManageableEmployeeIds(req);
    const me = await resolveCallerEmployee(req).catch(() => null);
    const meId = me?.id ? String(me.id) : '';
    const filtered = hydrated.filter((row: any) => {
      const assigneeIds: string[] = Array.isArray(row.assigned_to_employee_ids)
        ? row.assigned_to_employee_ids.map(String)
        : row.assigned_to_employee_id
          ? [String(row.assigned_to_employee_id)]
          : [];
      if (meId && assigneeIds.includes(meId)) return true;
      if (!assigneeIds.length) return false;
      return assigneeIds.some((id) => (allowed ? allowed.has(id) : false));
    });
    res.json({ success: true, data: filtered });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createTask(req: Request, res: Response): Promise<void> {
  try {
    await ensureTaskExtraColumns(req);
    const {
      projectId,
      title,
      description,
      priority = 'medium',
      dueDate,
      billable,
      billingType,
      unitPrice,
      clientId,
      recurrence,
    } = req.body;

    const validProjectId = await resolveProjectId(req, projectId);
    if (!validProjectId) {
      res.status(400).json({ success: false, error: { code: 'NO_PROJECT', message: 'Unable to resolve or create a project workspace for this task.' } });
      return;
    }

    let assigneeIds: string[] = [];
    try {
      assigneeIds = (await resolveAssigneeIds(req, req.body)) || [];
    } catch (err: any) {
      if (err?.status === 403) {
        sendForbidden(res, err.message);
        return;
      }
      throw err;
    }
    const validAssigneeId = assigneeIds[0] || null;

    const validPriority = ['low', 'medium', 'high', 'urgent'].includes(String(priority).toLowerCase())
      ? String(priority).toLowerCase()
      : 'medium';

    const rule = parseRecurrenceRule(recurrence);
    const frequency = String(rule?.frequency || '').toLowerCase();
    const requestedBillable = billable === undefined ? true : Boolean(billable);
    let validBillable = requestedBillable;
    if (requestedBillable) {
      try {
        const clients = await req.tenantQuery!(`SELECT id FROM billing_clients LIMIT 1`);
        if (!clients.rows.length) {
          if (billable === true) {
            res.status(400).json({
              success: false,
              error: { code: 'NO_BILLABLE_CLIENTS', message: 'Add a billable client before creating billable tasks.' },
            });
            return;
          }
          validBillable = false;
        }
      } catch {
        if (billable === true) {
          res.status(400).json({
            success: false,
            error: { code: 'NO_BILLABLE_CLIENTS', message: 'Add a billable client before creating billable tasks.' },
          });
          return;
        }
        validBillable = false;
      }
    }
    const validBillingType = String(billingType || 'deliverable').toLowerCase() === 'hourly' ? 'hourly' : 'deliverable';
    const validPrice = Number(unitPrice) || 0;
    const validClientId = isUuid(String(clientId || '')) ? String(clientId) : null;
    const firstDate = dueDate ? String(dueDate).slice(0, 10) : null;

    if (frequency) {
      const series = await req.tenantQuery!(`SELECT gen_random_uuid() AS id`);
      const seriesId = series.rows[0].id;
      const ruleJson = JSON.stringify({
        frequency,
        weekday: rule?.weekday,
        count: rule?.count || undefined,
      });
      const endDate = recurrence?.endDate || recurrence?.recurrenceEnd || null;
      const occurrence = firstDate || new Date().toISOString().slice(0, 10);

      const template = await req.tenantQuery!(
        `INSERT INTO project_tasks (
           project_id, title, description, assigned_to_employee_id, priority, status, due_date,
           recurrence_series_id, recurrence_rule, recurrence_end, is_recurrence_template,
           occurrence_date, billable, billing_type, unit_price, client_id
         )
         VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7, $8::jsonb, $9, true, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          validProjectId,
          title,
          description || null,
          validAssigneeId,
          validPriority,
          firstDate,
          seriesId,
          ruleJson,
          endDate,
          occurrence,
          validBillable,
          validBillingType,
          validPrice,
          validClientId,
        ]
      );

      const instance = await req.tenantQuery!(
        `INSERT INTO project_tasks (
           project_id, title, description, assigned_to_employee_id, priority, status, due_date,
           recurrence_series_id, recurrence_rule, recurrence_end, is_recurrence_template,
           occurrence_date, parent_task_id, billable, billing_type, unit_price, client_id
         )
         VALUES ($1, $2, $3, $4, $5, 'todo', $6, $7, $8::jsonb, $9, false, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          validProjectId,
          title,
          description || null,
          validAssigneeId,
          validPriority,
          firstDate,
          seriesId,
          ruleJson,
          endDate,
          occurrence,
          template.rows[0].id,
          validBillable,
          validBillingType,
          validPrice,
          validClientId,
        ]
      );

      await setTaskAssignees(req, template.rows[0].id, assigneeIds);
      await setTaskAssignees(req, instance.rows[0].id, assigneeIds);
      const [hydrated] = await attachAssignees(req, [instance.rows[0]]);
      queueTaskAssignmentEmails(req, String(instance.rows[0].id), assigneeIds);
      res.status(201).json({ success: true, data: hydrated, templateId: template.rows[0].id });
      return;
    }

    const result = await req.tenantQuery!(
      `INSERT INTO project_tasks (
         project_id, title, description, assigned_to_employee_id, priority, due_date,
         billable, billing_type, unit_price, client_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        validProjectId,
        title,
        description || null,
        validAssigneeId || null,
        validPriority,
        firstDate,
        validBillable,
        validBillingType,
        validPrice,
        validClientId,
      ]
    );

    await setTaskAssignees(req, result.rows[0].id, assigneeIds);
    const [hydrated] = await attachAssignees(req, [result.rows[0]]);
    queueTaskAssignmentEmails(req, String(result.rows[0].id), assigneeIds);
    res.status(201).json({ success: true, data: hydrated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function reorderTasks(req: Request, res: Response): Promise<void> {
  try {
    await ensureTaskExtraColumns(req);
    const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
    const updated: string[] = [];

    for (const item of orders) {
      const id = String(item?.id || '').trim();
      if (!isUuid(id)) continue;
      const boardOrder = Number(item?.boardOrder);
      if (!Number.isFinite(boardOrder)) continue;

      const beforeRes = await req.tenantQuery!(
        `SELECT id, assigned_to_employee_id FROM project_tasks WHERE id = $1`,
        [id]
      );
      if (!beforeRes.rows[0]) continue;
      if (!(await canManageTaskRow(req, id, beforeRes.rows[0].assigned_to_employee_id))) continue;

      await req.tenantQuery!(`UPDATE project_tasks SET board_order = $2 WHERE id = $1`, [id, Math.round(boardOrder)]);
      updated.push(id);
    }

    res.json({ success: true, data: { updated } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  try {
    await ensureTaskExtraColumns(req);
    const { id } = req.params;
    const body = req.body || {};
    const { status, priority, title, description, assignedToEmployeeId, dueDate } = body;

    const beforeRes = await req.tenantQuery!(`SELECT * FROM project_tasks WHERE id = $1`, [id]);
    if (beforeRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
      return;
    }
    const before = beforeRes.rows[0];
    const previousAssigneeIds = await currentTaskAssigneeIds(
      req.tenantQuery!,
      String(before.id),
      before.assigned_to_employee_id
    );
    const canManage = await canManageTaskRow(req, String(before.id), before.assigned_to_employee_id);
    if (!canManage) {
      const openAssignment = await openTaskAssignmentEnabled(req);
      if (!(openAssignment && isAssigneeOnlyUpdate(body))) {
        sendForbidden(res, 'You cannot modify tasks that belong to someone above you or outside your team.');
        return;
      }
    }

    let assigneeIds: string[] | undefined;
    try {
      assigneeIds = await resolveAssigneeIds(req, body);
    } catch (err: any) {
      if (err?.status === 403) {
        sendForbidden(res, err.message);
        return;
      }
      throw err;
    }

    const updates: string[] = [];
    const params: any[] = [id];

    if (status !== undefined) {
      const clean = String(status).toLowerCase().trim().replace(/[\s_-]+/g, '');
      let dbStatus = 'todo';
      if (clean === 'inprogress' || clean === 'ongoing' || clean === 'doing') dbStatus = 'in_progress';
      else if (clean === 'review' || clean === 'inreview' || clean === 'testing') dbStatus = 'review';
      else if (clean === 'completed' || clean === 'done' || clean === 'approved' || clean === 'finished') dbStatus = 'done';
      else dbStatus = 'todo';

      params.push(dbStatus);
      updates.push(`status = $${params.length}`);
    }

    if (priority !== undefined) {
      const clean = String(priority).toLowerCase().trim();
      const dbPriority = ['low', 'medium', 'high', 'urgent'].includes(clean) ? clean : 'medium';
      params.push(dbPriority);
      updates.push(`priority = $${params.length}`);
    }

    if (title !== undefined) {
      params.push(String(title).trim());
      updates.push(`title = $${params.length}`);
    }

    if (description !== undefined) {
      params.push(String(description).trim());
      updates.push(`description = $${params.length}`);
    }

    if (assigneeIds !== undefined) {
      params.push(assigneeIds[0] || null);
      updates.push(`assigned_to_employee_id = $${params.length}`);
    }

    if (dueDate !== undefined) {
      params.push(dueDate || null);
      updates.push(`due_date = $${params.length}`);
    }

    if (body.timeSpentSeconds !== undefined) {
      params.push(Math.max(0, Math.floor(Number(body.timeSpentSeconds) || 0)));
      updates.push(`time_spent_seconds = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'timerStartedAt')) {
      const raw = body.timerStartedAt;
      let ts: string | null = null;
      if (raw !== null && raw !== undefined && raw !== '') {
        const parsed = new Date(typeof raw === 'number' ? raw : raw);
        if (!Number.isNaN(parsed.getTime())) ts = parsed.toISOString();
      }
      params.push(ts);
      updates.push(`timer_started_at = $${params.length}`);
    }

    if (body.billable !== undefined) {
      params.push(Boolean(body.billable));
      updates.push(`billable = $${params.length}`);
    }

    if (body.billingType !== undefined) {
      const billingType = String(body.billingType).toLowerCase() === 'hourly' ? 'hourly' : 'deliverable';
      params.push(billingType);
      updates.push(`billing_type = $${params.length}`);
    }

    if (body.unitPrice !== undefined) {
      params.push(Number(body.unitPrice) || 0);
      updates.push(`unit_price = $${params.length}`);
    }

    if (body.clientId !== undefined) {
      params.push(isUuid(String(body.clientId || '')) ? String(body.clientId) : null);
      updates.push(`client_id = $${params.length}`);
    }

    if (body.recurrenceEnd !== undefined) {
      params.push(body.recurrenceEnd || null);
      updates.push(`recurrence_end = $${params.length}`);
    }

    if (body.recurrence !== undefined || body.recurrenceRule !== undefined) {
      const rule = parseRecurrenceRule(body.recurrence || body.recurrenceRule);
      params.push(rule ? JSON.stringify(rule) : null);
      updates.push(`recurrence_rule = $${params.length}::jsonb`);
    }

    if (body.attachedDocs !== undefined || body.attached_docs !== undefined) {
      const raw = body.attachedDocs !== undefined ? body.attachedDocs : body.attached_docs;
      const docs = Array.isArray(raw)
        ? raw
            .filter((doc: any) => doc && (doc.id || doc.name))
            .map((doc: any) => ({
              id: String(doc.id || ''),
              name: String(doc.name || 'Untitled'),
              size: doc.size ? String(doc.size) : undefined,
              type: doc.type ? String(doc.type) : undefined,
              s3Key: doc.s3Key || doc.s3_key || undefined,
              owner: doc.owner ? String(doc.owner) : undefined,
            }))
        : [];
      params.push(JSON.stringify(docs));
      updates.push(`attached_docs = $${params.length}::jsonb`);
    }

    if (updates.length === 0 && assigneeIds === undefined) {
      res.json({ success: true, data: before, message: 'No updates provided' });
      return;
    }

    let updated = before;
    if (updates.length > 0) {
      const sql = `UPDATE project_tasks SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
      const result = await req.tenantQuery!(sql, params);
      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }
      updated = result.rows[0];
    }

    if (assigneeIds !== undefined) {
      await setTaskAssignees(req, String(updated.id), assigneeIds);
      queueTaskAssignmentEmails(req, String(updated.id), assigneeIds, previousAssigneeIds);
      if (body.applyTo === 'future' && before.recurrence_series_id) {
        const future = await req.tenantQuery!(
          `SELECT id FROM project_tasks
           WHERE recurrence_series_id = $1
             AND id <> $2
             AND COALESCE(is_recurrence_template, false) = false
             AND COALESCE(occurrence_date, due_date) > COALESCE($3::date, '1900-01-01')`,
          [before.recurrence_series_id, before.id, before.occurrence_date || before.due_date]
        );
        for (const row of future.rows) {
          await setTaskAssignees(req, String(row.id), assigneeIds);
        }
      }
    }

    await applyRecurrenceToFuture(req, before, updated, body);

    let nextTask: any = null;
    const becameDone = updated.status === 'done' && before.status !== 'done';
    if (becameDone) {
      nextTask = await spawnNextOccurrence(req, updated);
      if (nextTask?.id) await copyTaskAssignees(req, String(updated.id), String(nextTask.id));
    }

    const [hydrated] = await attachAssignees(req, [updated]);
    const hydratedNext = nextTask ? (await attachAssignees(req, [nextTask]))[0] : null;
    res.json({ success: true, data: hydrated, nextTask: hydratedNext });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteTask(req: Request, res: Response): Promise<void> {
  try {
    await ensureTaskExtraColumns(req);
    const { id } = req.params;
    let validTaskId = await resolveTaskId(req, id);
    if (!validTaskId && isUuid(id)) {
      validTaskId = id;
    }

    const target = validTaskId
      ? await req.tenantQuery!(
          'SELECT id, assigned_to_employee_id, invoice_id FROM project_tasks WHERE id = $1',
          [validTaskId]
        )
      : await req.tenantQuery!(
          'SELECT id, assigned_to_employee_id, invoice_id FROM project_tasks WHERE id::text = $1 OR title = $1 LIMIT 1',
          [id]
        );
    if (target.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
      return;
    }
    if (target.rows[0].invoice_id) {
      res.status(409).json({
        success: false,
        error: {
          code: 'ALREADY_BILLED',
          message: 'This task is already on an invoice and cannot be deleted.',
        },
      });
      return;
    }
    if (!(await canManageTaskRow(req, String(target.rows[0].id), target.rows[0].assigned_to_employee_id))) {
      sendForbidden(res, 'You cannot delete tasks that belong to someone above you or outside your team.');
      return;
    }

    const result = await req.tenantQuery!('DELETE FROM project_tasks WHERE id = $1 RETURNING id', [target.rows[0].id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
      return;
    }

    res.json({ success: true, message: 'Task deleted successfully', data: { id: result.rows[0].id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function verifyTaskTracking(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { action = 'verify', title } = req.body || {};

    let validTaskId = await resolveTaskId(req, id);
    if (!validTaskId && title) {
      validTaskId = await resolveTaskId(req, title);
    }

    if (!validTaskId) {
      const fallback = await req.tenantQuery!('SELECT id FROM project_tasks ORDER BY created_at DESC LIMIT 1');
      validTaskId = fallback.rows[0]?.id || null;
    }

    let taskData: any = null;
    if (validTaskId) {
      const result = await req.tenantQuery!(
        `SELECT t.*, p.name as project_name, TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(NULLIF(e.last_name, 'User'), e.last_name, '')) as assigned_to_name
         FROM project_tasks t
         JOIN projects p ON t.project_id = p.id
         LEFT JOIN employees e ON t.assigned_to_employee_id = e.id
         WHERE t.id = $1 LIMIT 1`,
        [validTaskId]
      );
      taskData = result.rows[0];

      if (taskData && (action === 'start' || action === 'verify')) {
        if (taskData.status !== 'in_progress') {
          await req.tenantQuery!(
            `UPDATE project_tasks SET status = 'in_progress' WHERE id = $1`,
            [validTaskId]
          );
          taskData.status = 'in_progress';
        }
      }
    }

    const isStopped = action === 'stop';
    res.json({
      success: true,
      data: {
        taskId: validTaskId || id,
        title: taskData?.title || title || 'Testing',
        status: taskData?.status || (isStopped ? 'todo' : 'in_progress'),
        isTrackingVerified: !isStopped,
        verifiedAt: new Date().toISOString(),
        projectName: taskData?.project_name || 'General Operations',
        assignedToName: taskData?.assigned_to_name || 'Company Man',
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

async function ensureTimesheetExtraColumns(req: Request): Promise<void> {
  await req.tenantQuery!(`ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS entry_type VARCHAR(16) NOT NULL DEFAULT 'task'`);
  await req.tenantQuery!(`ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS title TEXT`);
  await req.tenantQuery!(`ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS start_time VARCHAR(16)`);
  await req.tenantQuery!(`ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS end_time VARCHAR(16)`);
  await req.tenantQuery!(`ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS category VARCHAR(64)`);
  await req.tenantQuery!(`ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS meeting_link TEXT`);
  await req.tenantQuery!(`ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS billable BOOLEAN NOT NULL DEFAULT true`);
  await req.tenantQuery!(`ALTER TABLE timesheets ADD COLUMN IF NOT EXISTS invoice_id UUID`);
  await req.tenantQuery!(
    `CREATE INDEX IF NOT EXISTS idx_timesheets_entry_type_date ON timesheets(entry_type, work_date)`
  );
  await req.tenantQuery!(`
    DO $$
    DECLARE r record;
    BEGIN
      LOCK TABLE timesheets IN ACCESS EXCLUSIVE MODE;
      FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'timesheets'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%hours_spent%'
          AND nsp.nspname = current_schema()
      LOOP
        EXECUTE format('ALTER TABLE timesheets DROP CONSTRAINT %I', r.conname);
      END LOOP;
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'timesheets'
          AND con.conname = 'timesheets_hours_nonneg'
          AND nsp.nspname = current_schema()
      ) THEN
        ALTER TABLE timesheets
          ADD CONSTRAINT timesheets_hours_nonneg
          CHECK (hours_spent >= 0 AND hours_spent <= 24);
      END IF;
    END $$
  `);
  await req.tenantQuery!(`
    UPDATE timesheets ts
    SET status = 'approved'
    FROM employees e
    WHERE ts.employee_id = e.id
      AND LOWER(COALESCE(e.role, '')) = 'super_admin'
      AND LOWER(COALESCE(ts.entry_type, 'task')) = 'task'
      AND LOWER(COALESCE(ts.status, '')) NOT IN ('approved', 'rejected', 'draft')
  `);
}

function normalizeEntryType(raw: unknown): 'task' | 'schedule' {
  const s = String(raw || '').toLowerCase().trim();
  return s === 'schedule' || s === 'meeting' ? 'schedule' : 'task';
}

function clockToMinutes(raw: unknown): number {
  const value = String(raw || '').trim();
  const match = value.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return Number.POSITIVE_INFINITY;
  let hours = Number(match[1]) || 0;
  const minutes = Number(match[2] || 0);
  const meridiem = (match[3] || '').toLowerCase();
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

async function isSuperAdminEmployee(req: Request, employeeId: string): Promise<boolean> {
  const row = await req.tenantQuery!(`SELECT role FROM employees WHERE id = $1 LIMIT 1`, [employeeId]);
  return String(row.rows[0]?.role || '').toLowerCase() === 'super_admin';
}

export async function logTimesheet(req: Request, res: Response): Promise<void> {
  try {
    await ensureTimesheetExtraColumns(req);
    const {
      projectId,
      taskId,
      employeeId,
      employeeIds,
      workDate,
      hoursSpent,
      description,
      entryType,
      title,
      startTime,
      endTime,
      category,
      meetingLink,
      billable,
    } = req.body;

    const validProjectId = await resolveProjectId(req, projectId);
    const me = await resolveCallerEmployee(req);
    if (!me?.id && !isOrgWideRole(req.user?.role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record for timesheet' },
      });
      return;
    }

    const requested = Array.from(
      new Set(
        [
          ...(Array.isArray(employeeIds) ? employeeIds : []),
          employeeId,
        ]
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )
    );
    if (requested.length === 0 && me?.id) requested.push(String(me.id));

    const targets: string[] = [];
    for (const raw of requested) {
      const id = await resolveEmployeeId(req, raw);
      if (!id) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: `Employee "${raw}" could not be resolved.` },
        });
        return;
      }
      const assigningToOther = !me?.id || String(id) !== String(me.id);
      if (assigningToOther && !(await canManageEmployee(req, id))) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Only a manager or admin can assign a meeting or log time for someone else.',
          },
        });
        return;
      }
      targets.push(id);
    }

    let validTaskId: string | null = null;
    if (taskId && isUuid(taskId)) {
      const t = await req.tenantQuery!('SELECT id FROM project_tasks WHERE id = $1 LIMIT 1', [taskId]);
      if (t.rows[0]?.id && isUuid(t.rows[0].id)) {
        validTaskId = t.rows[0].id;
      }
    }

    if (!validProjectId || targets.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid project and employee are required for timesheet entry.' }
      });
      return;
    }

    const validDate = workDate || new Date().toISOString().split('T')[0];
    const validEntryType = normalizeEntryType(entryType);
    const validTitle = (title || '').trim() || null;
    const validDesc = (description || validTitle || 'Task Timesheet Entry').trim();
    const validCategory =
      (category || '').trim() || (validEntryType === 'schedule' ? 'Meeting' : null);
    const validMeetingLink = (meetingLink || '').trim() || null;
    const validBillable = billable === undefined ? true : Boolean(billable);
    const validStart = (startTime || '').trim() || null;
    const validEnd = (endTime || '').trim() || null;
    const requestedStatus = normalizeTimesheetStatus((req.body || {}).status);
    const isOpenDraft = requestedStatus === 'draft' && !validEnd;
    const hoursNum = isOpenDraft
      ? 0
      : Math.min(24, Math.max(0.01, Number(hoursSpent) || 0.01));
    const defaultStatus = requestedStatus || (validEntryType === 'schedule' ? 'submitted' : 'approved');

    const created: any[] = [];
    for (const validEmpId of targets) {
      if (isOpenDraft && validTaskId) {
        const prior = await req.tenantQuery!(
          `SELECT id, work_date::text AS work_date, hours_spent, start_time, end_time, status, created_at
             FROM timesheets
            WHERE task_id = $1
              AND employee_id = $2
              AND COALESCE(entry_type, 'task') <> 'schedule'
              AND LOWER(COALESCE(status, '')) IN ('draft', 'submitted')
            ORDER BY created_at ASC`,
          [validTaskId, validEmpId]
        );
        const today = String(validDate).slice(0, 10);
        const todayRows: any[] = [];
        for (const row of prior.rows) {
          const date = String(row.work_date || '').slice(0, 10);
          if (date === today) {
            todayRows.push(row);
            continue;
          }
          if (!row.end_time) {
            await req.tenantQuery!(
              `UPDATE timesheets
                  SET end_time = COALESCE(NULLIF(end_time, ''), '11:59 PM'),
                      status = CASE WHEN status = 'draft' THEN 'submitted' ELSE status END
                WHERE id = $1`,
              [row.id]
            );
          }
        }
        if (todayRows.length > 0) {
          const ordered = [...todayRows].sort((a, b) => clockToMinutes(a.start_time) - clockToMinutes(b.start_time));
          const keeper = todayRows.find((row) => !row.end_time) || ordered[0];
          const hours = Math.min(
            24,
            todayRows.reduce((sum, row) => sum + (Number(row.hours_spent) || 0), 0)
          );
          const startTime = ordered[0].start_time || keeper.start_time || validStart;
          for (const extra of todayRows) {
            if (extra.id === keeper.id) continue;
            await req.tenantQuery!(`DELETE FROM timesheets WHERE id = $1`, [extra.id]);
          }
          await req.tenantQuery!(
            `UPDATE timesheets
                SET end_time = NULL,
                    status = 'draft',
                    hours_spent = $2,
                    start_time = COALESCE($3, start_time)
              WHERE id = $1`,
            [keeper.id, Number(hours.toFixed(2)), startTime]
          );
          const reused = await fetchTimesheetRow(req, keeper.id);
          if (reused) created.push(reused);
          continue;
        }
      }

      let status = defaultStatus;
      if (
        !isOpenDraft &&
        validEntryType === 'task' &&
        status !== 'rejected' &&
        (await isSuperAdminEmployee(req, validEmpId))
      ) {
        status = 'approved';
      }
      const result = await req.tenantQuery!(
        `INSERT INTO timesheets (
           project_id, task_id, employee_id, work_date, hours_spent, description, status,
           entry_type, title, start_time, end_time, category, meeting_link, billable
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          validProjectId,
          validTaskId || null,
          validEmpId,
          validDate,
          hoursNum,
          validDesc,
          status,
          validEntryType,
          validTitle,
          validStart,
          validEnd,
          validCategory,
          validMeetingLink,
          validBillable,
        ]
      );
      const row = result.rows[0]?.id ? await fetchTimesheetRow(req, result.rows[0].id) : result.rows[0];
      if (row) created.push(row);
    }

    res.status(201).json({ success: true, data: created.length === 1 ? created[0] : created });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getTimesheets(req: Request, res: Response): Promise<void> {
  try {
    await ensureTimesheetExtraColumns(req);
    const { employeeId, projectId, entryType } = req.query;
    const scope = await getAccessScope(req);
    let sql = `
      SELECT 
        ts.*,
        e.first_name || ' ' || e.last_name as employee_name,
        p.name as project_name,
        COALESCE(ts.title, t.title) as task_title,
        NULLIF(TRIM(CONCAT(appr.first_name, ' ', appr.last_name)), '') AS approver_name
      FROM timesheets ts
      JOIN employees e ON ts.employee_id = e.id
      JOIN projects p ON ts.project_id = p.id
      LEFT JOIN project_tasks t ON ts.task_id = t.id
      LEFT JOIN employees appr ON ts.approver_id = appr.id
      WHERE 1=1
    `;
    const params: any[] = [];
    sql = applyEmployeeScopeFilter(scope, sql, params, 'ts.employee_id');

    if (employeeId) {
      const access = await canAccessEmployee(req, String(employeeId));
      if (!access.ok || !access.target) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have access to timesheets for this employee' },
        });
        return;
      }
      params.push(access.target.id);
      sql += ` AND ts.employee_id = $${params.length}`;
    }
    if (projectId) {
      params.push(projectId);
      if (isUuid(projectId)) {
        sql += ` AND ts.project_id = $${params.length}`;
      } else {
        sql += ` AND p.code = $${params.length}`;
      }
    }
    if (entryType) {
      params.push(normalizeEntryType(entryType));
      sql += ` AND ts.entry_type = $${params.length}`;
    }
    sql += ` ORDER BY ts.work_date DESC, ts.start_time ASC NULLS LAST LIMIT 200`;

    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
async function ensureProjectExtraColumns(req: Request): Promise<void> {
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS approval_status VARCHAR(32)`);
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS denial_reason TEXT`);
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_work_hours NUMERIC(10, 2)`);
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_mode VARCHAR(16) NOT NULL DEFAULT 'deliverable'`);
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(12, 2)`);
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS currency VARCHAR(8) NOT NULL DEFAULT 'INR'`);
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id UUID`);
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS category VARCHAR(64)`);
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'medium'`);
}

async function ensureInvoiceTables(req: Request): Promise<void> {
  await ensureProjectExtraColumns(req);
  await ensureTaskExtraColumns(req);
  await ensureTimesheetExtraColumns(req);
  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      invoice_number VARCHAR(32) NOT NULL,
      customer_name VARCHAR(128),
      issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
      due_date DATE,
      subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
      gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS invoice_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
      unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total NUMERIC(12, 2) NOT NULL DEFAULT 0,
      source_task_id UUID,
      source_timesheet_id UUID
    )
  `);
  await req.tenantQuery!(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID`);
  await req.tenantQuery!(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_start DATE`);
  await req.tenantQuery!(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_end DATE`);
  await req.tenantQuery!(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'project'`);
  try {
    await req.tenantQuery!(`ALTER TABLE invoices ALTER COLUMN project_id DROP NOT NULL`);
  } catch {
    // already nullable
  }
}

function normalizeTimesheetStatus(raw: unknown): string | null {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  if (s === 'submitted') return 'submitted';
  if (s === 'draft') return 'draft';
  return null;
}

function isTimesheetDecision(status: string | null): status is 'approved' | 'rejected' {
  return status === 'approved' || status === 'rejected';
}

async function fetchTimesheetRow(req: Request, id: string): Promise<any | null> {
  const result = await req.tenantQuery!(
    `SELECT ts.*,
            e.first_name || ' ' || e.last_name AS employee_name,
            p.name AS project_name,
            COALESCE(ts.title, t.title) AS task_title,
            NULLIF(TRIM(CONCAT(appr.first_name, ' ', appr.last_name)), '') AS approver_name
     FROM timesheets ts
     JOIN employees e ON ts.employee_id = e.id
     JOIN projects p ON ts.project_id = p.id
     LEFT JOIN project_tasks t ON ts.task_id = t.id
     LEFT JOIN employees appr ON ts.approver_id = appr.id
     WHERE ts.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  try {
    await ensureProjectExtraColumns(req);
    const { id } = req.params;
    if (!(await ensureCanManageProject(req, res, id))) return;
    const body = req.body || {};
    const updates: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => {
      params.push(val);
      updates.push(`${col} = $${params.length}`);
    };

    if (body.name !== undefined) push('name', body.name);
    if (body.code !== undefined) push('code', body.code);
    if (body.description !== undefined) push('description', body.description);
    if (body.clientName !== undefined) push('client_name', body.clientName);
    if (body.clientId !== undefined) {
      const cid = isUuid(String(body.clientId || '')) ? String(body.clientId) : null;
      push('client_id', cid);
      if (cid && body.clientName === undefined) {
        const client = await req.tenantQuery!(`SELECT name, company_name FROM billing_clients WHERE id = $1`, [cid]);
        if (client.rows[0]) push('client_name', client.rows[0].company_name || client.rows[0].name);
      }
    }
    if (body.startDate !== undefined) push('start_date', body.startDate || null);
    if (body.endDate !== undefined) push('end_date', body.endDate || null);
    if (body.managerId !== undefined) {
      const mid = body.managerId ? await resolveEmployeeId(req, body.managerId) : null;
      push('manager_id', mid);
    }
    if (body.status !== undefined) push('status', normalizeProjectStatus(body.status));
    if (body.category !== undefined) push('category', String(body.category || '').trim() || null);
    if (body.priority !== undefined) push('priority', normalizeProjectPriority(body.priority));
    if (body.approvalStatus !== undefined) push('approval_status', String(body.approvalStatus));
    if (body.denialReason !== undefined) push('denial_reason', body.denialReason);
    if (body.totalWorkHours !== undefined) push('total_work_hours', Number(body.totalWorkHours) || 0);
    if (body.billingMode !== undefined) {
      const mode = String(body.billingMode).toLowerCase() === 'hourly' ? 'hourly' : 'deliverable';
      push('billing_mode', mode);
    }
    if (body.hourlyRate !== undefined) push('hourly_rate', body.hourlyRate === null || body.hourlyRate === '' ? null : Number(body.hourlyRate));
    if (body.currency !== undefined) push('currency', String(body.currency || 'INR').slice(0, 8));

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { code: 'NO_UPDATES', message: 'No valid fields to update' } });
      return;
    }

    params.push(id);
    const result = await req.tenantQuery!(
      `UPDATE projects SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteProject(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!isUuid(String(id || ''))) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Project id is invalid.' } });
      return;
    }
    const existing = await req.tenantQuery!(`SELECT id FROM projects WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      return;
    }
    if (!(await ensureCanManageProject(req, res, id))) return;

    try {
      await req.tenantQuery!(`ALTER TABLE invoices ALTER COLUMN project_id DROP NOT NULL`);
      await req.tenantQuery!(`UPDATE invoices SET project_id = NULL WHERE project_id = $1`, [id]);
    } catch (err: any) {
      if (err?.code !== '42P01') throw err;
    }

    await req.tenantQuery!(`DELETE FROM projects WHERE id = $1`, [id]);
    res.json({ success: true, data: { id, message: 'Project deleted' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function bulkCreateTasks(req: Request, res: Response): Promise<void> {
  try {
    const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
    if (tasks.length === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'tasks array required' } });
      return;
    }

    const created: any[] = [];
    for (const t of tasks) {
      const validProjectId = await resolveProjectId(req, t.projectId);
      if (!validProjectId || !t.title) continue;

      let validAssigneeId: string | null = null;
      if (t.assignedToEmployeeId) {
        validAssigneeId = await resolveEmployeeId(req, t.assignedToEmployeeId);
      }
      if (validAssigneeId && !isUuid(validAssigneeId)) validAssigneeId = null;

      const validPriority = ['low', 'medium', 'high', 'urgent'].includes(String(t.priority || '').toLowerCase())
        ? String(t.priority).toLowerCase()
        : 'medium';

      const result = await req.tenantQuery!(
        `INSERT INTO project_tasks (project_id, title, description, assigned_to_employee_id, priority, due_date)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [validProjectId, t.title, t.description || null, validAssigneeId, validPriority, t.dueDate || null]
      );
      if (result.rows[0]) {
        const extraIds = Array.isArray(t.assignedToEmployeeIds) ? t.assignedToEmployeeIds : [];
        const ids = uniqueIds([validAssigneeId || '', ...extraIds.map(String)]);
        const assigneeIds = ids.filter(Boolean);
        await setTaskAssignees(req, result.rows[0].id, assigneeIds);
        queueTaskAssignmentEmails(req, String(result.rows[0].id), assigneeIds);
        created.push(result.rows[0]);
      }
    }

    res.status(201).json({ success: true, data: await attachAssignees(req, created) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateTimesheet(req: Request, res: Response): Promise<void> {
  try {
    await ensureTimesheetExtraColumns(req);
    const { id } = req.params;
    const body = req.body || {};
    const updates: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => {
      params.push(val);
      updates.push(`${col} = $${params.length}`);
    };

    const existing = await req.tenantQuery!(
      `SELECT ts.employee_id, ts.project_id, ts.entry_type, LOWER(COALESCE(e.role, '')) AS employee_role
       FROM timesheets ts
       JOIN employees e ON e.id = ts.employee_id
       WHERE ts.id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Timesheet not found' } });
      return;
    }

    let mappedStatus = body.status !== undefined ? normalizeTimesheetStatus(body.status) : null;
    const entryType =
      body.entryType !== undefined ? normalizeEntryType(body.entryType) : normalizeEntryType(existing.rows[0].entry_type);
    const autoApprove =
      existing.rows[0].employee_role === 'super_admin' &&
      entryType === 'task' &&
      mappedStatus !== null &&
      mappedStatus !== 'draft' &&
      mappedStatus !== 'rejected';
    if (autoApprove) mappedStatus = 'approved';
    const deciding = isTimesheetDecision(mappedStatus) && !autoApprove;
    if (deciding) {
      const decision = await canDecideTimesheet(req, existing.rows[0]);
      if (!decision.ok) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: decision.reason } });
        return;
      }
    } else {
      const access = await canAccessEmployee(req, String(existing.rows[0].employee_id));
      if (!access.ok) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this timesheet' } });
        return;
      }
    }

    if (body.hoursSpent !== undefined || body.hours !== undefined) {
      const raw = Number(body.hoursSpent ?? body.hours);
      const hasEnd = body.endTime !== undefined && String(body.endTime || '').trim() !== '';
      const hours = hasEnd
        ? Math.min(24, Math.max(0.01, Number.isFinite(raw) ? raw : 0.01))
        : Math.min(24, Math.max(0, Number.isFinite(raw) ? raw : 0));
      push('hours_spent', Number(hours.toFixed(2)));
    }
    if (body.description !== undefined) push('description', body.description);
    if (body.workDate !== undefined || body.date !== undefined) {
      push('work_date', body.workDate || body.date);
    }
    if (body.entryType !== undefined) push('entry_type', normalizeEntryType(body.entryType));
    if (body.title !== undefined) push('title', String(body.title || '').trim() || null);
    if (body.startTime !== undefined) push('start_time', String(body.startTime || '').trim() || null);
    if (body.endTime !== undefined) push('end_time', String(body.endTime || '').trim() || null);
    if (body.category !== undefined) push('category', String(body.category || '').trim() || null);
    if (body.meetingLink !== undefined) push('meeting_link', String(body.meetingLink || '').trim() || null);
    if (body.billable !== undefined) push('billable', Boolean(body.billable));
    if (mappedStatus) push('status', mappedStatus);
    if (deciding) {
      const me = await resolveCallerEmployee(req);
      if (me?.id) push('approver_id', me.id);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { code: 'NO_UPDATES', message: 'No valid fields to update' } });
      return;
    }

    params.push(id);
    await req.tenantQuery!(
      `UPDATE timesheets SET ${updates.join(', ')} WHERE id = $${params.length}`,
      params
    );
    res.json({ success: true, data: await fetchTimesheetRow(req, id) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function bulkUpdateTimesheets(req: Request, res: Response): Promise<void> {
  try {
    const timesheetIds: string[] = Array.isArray(req.body?.timesheetIds) ? req.body.timesheetIds : [];
    const mapped = normalizeTimesheetStatus(req.body?.status);
    if (!mapped || timesheetIds.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'timesheetIds and status are required' },
      });
      return;
    }

    const deciding = isTimesheetDecision(mapped);
    const me = deciding ? await resolveCallerEmployee(req) : null;
    const updated: any[] = [];
    let deniedReason = '';

    for (const tid of timesheetIds) {
      const existing = await req.tenantQuery!(
        `SELECT employee_id, project_id FROM timesheets WHERE id = $1`,
        [tid]
      );
      if (existing.rows.length === 0) continue;
      if (deciding) {
        const decision = await canDecideTimesheet(req, existing.rows[0]);
        if (!decision.ok) {
          deniedReason = decision.reason;
          continue;
        }
      } else {
        const access = await canAccessEmployee(req, String(existing.rows[0].employee_id));
        if (!access.ok) continue;
      }

      if (deciding) {
        await req.tenantQuery!(
          `UPDATE timesheets SET status = $1, approver_id = $2 WHERE id = $3`,
          [mapped, me?.id || null, tid]
        );
      } else {
        await req.tenantQuery!(`UPDATE timesheets SET status = $1 WHERE id = $2`, [mapped, tid]);
      }
      const row = await fetchTimesheetRow(req, tid);
      if (row) updated.push(row);
    }

    if (updated.length === 0 && timesheetIds.length > 0) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: deniedReason || 'You cannot approve or reject these timesheets.',
        },
      });
      return;
    }

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteTimesheet(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await req.tenantQuery!(`SELECT employee_id FROM timesheets WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Timesheet not found' } });
      return;
    }

    const me = await resolveCallerEmployee(req);
    const isOwner = me?.id && String(existing.rows[0].employee_id) === String(me.id);
    if (!isOrgWideRole(req.user?.role) && !isOwner) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only delete your own timesheets' },
      });
      return;
    }

    await req.tenantQuery!(`DELETE FROM timesheets WHERE id = $1`, [id]);
    res.json({ success: true, data: { id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getUnbilledWork(req: Request, res: Response): Promise<void> {
  try {
    await ensureInvoiceTables(req);
    const { id } = req.params;
    const project = await req.tenantQuery!(`SELECT * FROM projects WHERE id = $1`, [id]);
    if (project.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      return;
    }

    const tasks = await req.tenantQuery!(
      `SELECT id, title, unit_price, billing_type, billable, occurrence_date, due_date, status, assigned_to_employee_id
       FROM project_tasks
       WHERE project_id = $1
         AND COALESCE(is_recurrence_template, false) = false
         AND COALESCE(billable, true) = true
         AND invoice_id IS NULL
         AND status = 'done'
         AND COALESCE(billing_type, 'deliverable') = 'deliverable'`,
      [id]
    );

    const timesheets = await req.tenantQuery!(
      `SELECT ts.id, ts.hours_spent, ts.work_date, ts.description, ts.employee_id, ts.task_id,
              COALESCE(t.title, ts.title, ts.description) AS task_title,
              t.occurrence_date
       FROM timesheets ts
       LEFT JOIN project_tasks t ON t.id = ts.task_id
       WHERE ts.project_id = $1
         AND COALESCE(ts.billable, true) = true
         AND ts.invoice_id IS NULL
         AND ts.status = 'approved'
         AND ts.end_time IS NOT NULL`,
      [id]
    );

    res.json({
      success: true,
      data: {
        project: project.rows[0],
        tasks: tasks.rows,
        timesheets: timesheets.rows,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function listProjectInvoices(req: Request, res: Response): Promise<void> {
  try {
    await ensureInvoiceTables(req);
    const { id } = req.params;
    const invoices = await req.tenantQuery!(
      `SELECT * FROM invoices WHERE project_id = $1 ORDER BY created_at DESC`,
      [id]
    );
    const lines = invoices.rows.length
      ? await req.tenantQuery!(
          `SELECT * FROM invoice_lines WHERE invoice_id = ANY($1::uuid[])`,
          [invoices.rows.map((row: any) => row.id)]
        )
      : { rows: [] };
    const grouped = invoices.rows.map((inv: any) => ({
      ...inv,
      lines: lines.rows.filter((line: any) => line.invoice_id === inv.id),
    }));
    res.json({ success: true, data: grouped });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createProjectInvoice(req: Request, res: Response): Promise<void> {
  try {
    await ensureInvoiceTables(req);
    const { id } = req.params;
    const project = await req.tenantQuery!(`SELECT * FROM projects WHERE id = $1`, [id]);
    if (project.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Project not found' } });
      return;
    }
    if (!(await ensureCanManageProject(req, res, id))) return;

    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    if (lines.length === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'At least one line is required' } });
      return;
    }

    const normalized = lines.map((line: any) => {
      const quantity = Math.max(0, Number(line.quantity) || 0);
      const unitPrice = Math.max(0, Number(line.unitPrice ?? line.unit_price) || 0);
      return {
        description: String(line.description || 'Work').trim() || 'Work',
        quantity,
        unitPrice,
        total: Number((quantity * unitPrice).toFixed(2)),
        sourceTaskId: line.sourceTaskId || line.source_task_id || null,
        sourceTimesheetId: line.sourceTimesheetId || line.source_timesheet_id || null,
      };
    });

    for (const line of normalized) {
      if (line.sourceTaskId) {
        const task = await req.tenantQuery!(
          `SELECT id, invoice_id, project_id, status FROM project_tasks WHERE id = $1`,
          [line.sourceTaskId]
        );
        const row = task.rows[0];
        if (!row || row.project_id !== id) {
          res.status(400).json({ success: false, error: { code: 'INVALID_LINE', message: 'Task is not part of this project' } });
          return;
        }
        if (row.invoice_id) {
          res.status(409).json({ success: false, error: { code: 'ALREADY_BILLED', message: 'Task is already on an invoice' } });
          return;
        }
        if (row.status !== 'done') {
          res.status(400).json({ success: false, error: { code: 'NOT_COMPLETE', message: 'Only completed tasks can be invoiced' } });
          return;
        }
      }
      if (line.sourceTimesheetId) {
        const ts = await req.tenantQuery!(
          `SELECT id, invoice_id, project_id, status FROM timesheets WHERE id = $1`,
          [line.sourceTimesheetId]
        );
        const row = ts.rows[0];
        if (!row || row.project_id !== id) {
          res.status(400).json({ success: false, error: { code: 'INVALID_LINE', message: 'Timesheet is not part of this project' } });
          return;
        }
        if (row.invoice_id) {
          res.status(409).json({ success: false, error: { code: 'ALREADY_BILLED', message: 'Timesheet is already on an invoice' } });
          return;
        }
        if (row.status !== 'approved') {
          res.status(400).json({ success: false, error: { code: 'NOT_APPROVED', message: 'Only approved timesheets can be invoiced' } });
          return;
        }
      }
    }

    const subtotal = Number(normalized.reduce((sum: number, line: any) => sum + line.total, 0).toFixed(2));
    const gstAmount = Number((subtotal * 0.18).toFixed(2));
    const totalAmount = Number((subtotal + gstAmount).toFixed(2));
    const count = await req.tenantQuery!(`SELECT COUNT(*)::int AS n FROM invoices`);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Number(count.rows[0]?.n || 0) + 1).padStart(4, '0')}`;
    const issueDate = new Date().toISOString().slice(0, 10);
    const dueDate = req.body?.dueDate || shiftIsoDate(issueDate, 15);

    const invoice = await req.tenantQuery!(
      `INSERT INTO invoices (
         project_id, client_id, invoice_number, customer_name, issue_date, due_date,
         kind, subtotal, gst_amount, total_amount, paid_amount, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'project', $7, $8, $9, 0, 'draft')
       RETURNING *`,
      [
        id,
        project.rows[0].client_id || null,
        invoiceNumber,
        project.rows[0].client_name || project.rows[0].name,
        issueDate,
        dueDate,
        subtotal,
        gstAmount,
        totalAmount,
      ]
    );

    const invoiceId = invoice.rows[0].id;
    const savedLines: any[] = [];
    for (const line of normalized) {
      const inserted = await req.tenantQuery!(
        `INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total, source_task_id, source_timesheet_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [invoiceId, line.description, line.quantity, line.unitPrice, line.total, line.sourceTaskId, line.sourceTimesheetId]
      );
      savedLines.push(inserted.rows[0]);
      if (line.sourceTaskId) {
        await req.tenantQuery!(`UPDATE project_tasks SET invoice_id = $1 WHERE id = $2 AND invoice_id IS NULL`, [invoiceId, line.sourceTaskId]);
      }
      if (line.sourceTimesheetId) {
        await req.tenantQuery!(`UPDATE timesheets SET invoice_id = $1 WHERE id = $2 AND invoice_id IS NULL`, [invoiceId, line.sourceTimesheetId]);
      }
    }

    res.status(201).json({ success: true, data: { ...invoice.rows[0], lines: savedLines } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateInvoice(req: Request, res: Response): Promise<void> {
  try {
    await ensureInvoiceTables(req);
    const { id } = req.params;
    const statusRaw = String(req.body?.status || '').toLowerCase().replace(/\s+/g, '_');
    const allowed = ['draft', 'sent', 'paid', 'partially_paid', 'overdue'];
    if (!allowed.includes(statusRaw)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Unsupported invoice status' } });
      return;
    }
    const invoice = await req.tenantQuery!(`SELECT project_id FROM invoices WHERE id = $1`, [id]);
    if (invoice.rows[0]?.project_id && !(await ensureCanManageProject(req, res, invoice.rows[0].project_id))) return;
    const result = await req.tenantQuery!(
      `UPDATE invoices
       SET status = $2,
           paid_amount = CASE WHEN $2 = 'paid' THEN total_amount ELSE paid_amount END
       WHERE id = $1
       RETURNING *`,
      [id, statusRaw]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
