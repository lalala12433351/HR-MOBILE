import { Request, Response } from 'express';
import {
  applyEmployeeScopeFilter,
  canAccessEmployee,
  getAccessScope,
  isOrgWideRole,
  resolveCallerEmployee,
} from '../../utils/employeeScope.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val: any): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
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

export async function getProjects(req: Request, res: Response): Promise<void> {
  try {
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

export async function createProject(req: Request, res: Response): Promise<void> {
  try {
    const { name, code, description, clientName, managerId, startDate, endDate } = req.body;

    let validManagerId = await resolveEmployeeId(req, managerId);
    if (validManagerId && !isUuid(validManagerId)) {
      validManagerId = null;
    }

    const result = await req.tenantQuery!(
      `INSERT INTO projects (name, code, description, client_name, manager_id, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, code, description || null, clientName || null, validManagerId || null, startDate || null, endDate || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getTasks(req: Request, res: Response): Promise<void> {
  try {
    const { projectId } = req.query;
    let sql = `
      SELECT 
        t.*,
        p.name as project_name,
        TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(NULLIF(e.last_name, 'User'), e.last_name, '')) as assigned_to_name
      FROM project_tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN employees e ON t.assigned_to_employee_id = e.id
      WHERE 1=1
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
    sql += ` ORDER BY t.created_at DESC`;

    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createTask(req: Request, res: Response): Promise<void> {
  try {
    const { projectId, title, description, assignedToEmployeeId, priority = 'medium', dueDate } = req.body;

    const validProjectId = await resolveProjectId(req, projectId);
    if (!validProjectId) {
      res.status(400).json({ success: false, error: { code: 'NO_PROJECT', message: 'Unable to resolve or create a project workspace for this task.' } });
      return;
    }

    let validAssigneeId: string | null = null;
    if (assignedToEmployeeId) {
      validAssigneeId = await resolveEmployeeId(req, assignedToEmployeeId);
    }
    if (validAssigneeId && !isUuid(validAssigneeId)) {
      validAssigneeId = null;
    }

    const validPriority = ['low', 'medium', 'high', 'urgent'].includes(String(priority).toLowerCase())
      ? String(priority).toLowerCase()
      : 'medium';

    const result = await req.tenantQuery!(
      `INSERT INTO project_tasks (project_id, title, description, assigned_to_employee_id, priority, due_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [validProjectId, title, description || null, validAssigneeId || null, validPriority, dueDate || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, priority, title, description, assignedToEmployeeId, dueDate } = req.body;

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

    if (assignedToEmployeeId !== undefined) {
      let validAssigneeId: string | null = null;
      if (assignedToEmployeeId) {
        validAssigneeId = await resolveEmployeeId(req, assignedToEmployeeId);
      }
      if (validAssigneeId && !isUuid(validAssigneeId)) {
        validAssigneeId = null;
      }
      params.push(validAssigneeId);
      updates.push(`assigned_to_employee_id = $${params.length}`);
    }

    if (dueDate !== undefined) {
      params.push(dueDate || null);
      updates.push(`due_date = $${params.length}`);
    }

    if (updates.length === 0) {
      res.json({ success: true, message: 'No updates provided' });
      return;
    }

    const sql = `UPDATE project_tasks SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await req.tenantQuery!(sql, params);

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
      return;
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteTask(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    let validTaskId = await resolveTaskId(req, id);
    if (!validTaskId && isUuid(id)) {
      validTaskId = id;
    }

    if (!validTaskId) {
      const delRes = await req.tenantQuery!(
        'DELETE FROM project_tasks WHERE id::text = $1 OR title = $1 RETURNING id',
        [id]
      );
      if (delRes.rows.length === 0) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        return;
      }
      res.json({ success: true, message: 'Task deleted successfully', data: { id: delRes.rows[0].id } });
      return;
    }

    const result = await req.tenantQuery!('DELETE FROM project_tasks WHERE id = $1 RETURNING id', [validTaskId]);
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
  await req.tenantQuery!(
    `CREATE INDEX IF NOT EXISTS idx_timesheets_entry_type_date ON timesheets(entry_type, work_date)`
  );
}

function normalizeEntryType(raw: unknown): 'task' | 'schedule' {
  const s = String(raw || '').toLowerCase().trim();
  return s === 'schedule' || s === 'meeting' ? 'schedule' : 'task';
}

export async function logTimesheet(req: Request, res: Response): Promise<void> {
  try {
    await ensureTimesheetExtraColumns(req);
    const {
      projectId,
      taskId,
      employeeId,
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
    let validEmpId = await resolveEmployeeId(req, employeeId);

    if (!isOrgWideRole(req.user?.role)) {
      const me = await resolveCallerEmployee(req);
      if (!me?.id) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record for timesheet' },
        });
        return;
      }
      validEmpId = me.id;
    }

    let validTaskId: string | null = null;
    if (taskId && isUuid(taskId)) {
      const t = await req.tenantQuery!('SELECT id FROM project_tasks WHERE id = $1 LIMIT 1', [taskId]);
      if (t.rows[0]?.id && isUuid(t.rows[0].id)) {
        validTaskId = t.rows[0].id;
      }
    }

    if (!validProjectId || !validEmpId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid project and employee are required for timesheet entry.' }
      });
      return;
    }

    const hoursNum = Math.min(24, Math.max(0.01, Number(hoursSpent) || 0.01));
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
    const status = validEntryType === 'schedule' ? 'submitted' : 'approved';

    const result = await req.tenantQuery!(
      `INSERT INTO timesheets (
         project_id, task_id, employee_id, work_date, hours_spent, description, status,
         entry_type, title, start_time, end_time, category, meeting_link, billable
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
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

    res.status(201).json({ success: true, data: result.rows[0] });
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
        COALESCE(ts.title, t.title) as task_title
      FROM timesheets ts
      JOIN employees e ON ts.employee_id = e.id
      JOIN projects p ON ts.project_id = p.id
      LEFT JOIN project_tasks t ON ts.task_id = t.id
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
}

function normalizeTimesheetStatus(raw: unknown): string | null {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  if (s === 'submitted') return 'submitted';
  if (s === 'draft') return 'draft';
  return null;
}

export async function updateProject(req: Request, res: Response): Promise<void> {
  try {
    await ensureProjectExtraColumns(req);
    const { id } = req.params;
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
    if (body.startDate !== undefined) push('start_date', body.startDate || null);
    if (body.endDate !== undefined) push('end_date', body.endDate || null);
    if (body.managerId !== undefined) {
      const mid = body.managerId ? await resolveEmployeeId(req, body.managerId) : null;
      push('manager_id', mid);
    }
    if (body.status !== undefined) {
      const clean = String(body.status).toLowerCase().trim().replace(/[\s_-]+/g, '');
      let dbStatus = 'in_progress';
      if (clean === 'planning' || clean === 'planned') dbStatus = 'planning';
      else if (clean === 'onhold' || clean === 'paused') dbStatus = 'on_hold';
      else if (clean === 'completed' || clean === 'done' || clean === 'finished') dbStatus = 'completed';
      else if (clean === 'inprogress' || clean === 'active') dbStatus = 'in_progress';
      push('status', dbStatus);
    }
    if (body.approvalStatus !== undefined) push('approval_status', String(body.approvalStatus));
    if (body.denialReason !== undefined) push('denial_reason', body.denialReason);
    if (body.totalWorkHours !== undefined) push('total_work_hours', Number(body.totalWorkHours) || 0);

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
      if (result.rows[0]) created.push(result.rows[0]);
    }

    res.status(201).json({ success: true, data: created });
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

    if (body.hoursSpent !== undefined || body.hours !== undefined) {
      const hours = Math.min(24, Math.max(0.01, Number(body.hoursSpent ?? body.hours) || 0.01));
      push('hours_spent', hours);
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
    if (body.status !== undefined) {
      const mapped = normalizeTimesheetStatus(body.status);
      if (mapped) push('status', mapped);
    }
    if (body.approvedBy !== undefined || body.status !== undefined) {
      const me = await resolveCallerEmployee(req);
      if (me?.id) push('approver_id', me.id);
    }

    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { code: 'NO_UPDATES', message: 'No valid fields to update' } });
      return;
    }

    const existing = await req.tenantQuery!(`SELECT employee_id FROM timesheets WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Timesheet not found' } });
      return;
    }
    const access = await canAccessEmployee(req, String(existing.rows[0].employee_id));
    if (!access.ok) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this timesheet' } });
      return;
    }

    params.push(id);
    const result = await req.tenantQuery!(
      `UPDATE timesheets SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ success: true, data: result.rows[0] });
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

    const me = await resolveCallerEmployee(req);
    const updated: any[] = [];

    for (const tid of timesheetIds) {
      const existing = await req.tenantQuery!(`SELECT employee_id FROM timesheets WHERE id = $1`, [tid]);
      if (existing.rows.length === 0) continue;
      const access = await canAccessEmployee(req, String(existing.rows[0].employee_id));
      if (!access.ok) continue;

      const result = await req.tenantQuery!(
        `UPDATE timesheets SET status = $1, approver_id = $2 WHERE id = $3 RETURNING *`,
        [mapped, me?.id || null, tid]
      );
      if (result.rows[0]) updated.push(result.rows[0]);
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
