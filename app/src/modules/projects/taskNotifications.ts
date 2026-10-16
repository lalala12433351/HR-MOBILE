import { Request } from 'express';
import { frontendUrl, sendEmail } from '../../config/ses.js';
import { taskAssignedEmail, taskDueSoonEmail } from '../../emails/templates.js';
import { log } from '../../utils/logger.js';
import { resolveCallerEmployee } from '../../utils/employeeScope.js';

export type TenantQuery = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

const COMPLETED_STATUSES = new Set(['done', 'completed', 'approved']);

export async function ensureTaskNotificationTables(query: TenantQuery): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS task_due_reminders (
      task_id UUID NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      due_date DATE NOT NULL,
      reminder_kind VARCHAR(16) NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (task_id, employee_id, due_date, reminder_kind)
    )
  `);
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((v) => String(v || '').trim()).filter(Boolean)));
}

function displayName(row: { first_name?: string; last_name?: string; email?: string }): string {
  const name = `${row.first_name || ''} ${row.last_name || ''}`.replace(/\s+/g, ' ').trim();
  return name || row.email || 'there';
}

async function loadAssignees(query: TenantQuery, employeeIds: string[]) {
  const ids = uniqueIds(employeeIds);
  if (!ids.length) return [];
  const result = await query(
    `SELECT id, email, first_name, last_name, account_status, employment_status
     FROM employees
     WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  return result.rows.filter((row: any) => {
    const account = String(row.account_status || '');
    const employment = String(row.employment_status || 'active').toLowerCase();
    if (account === 'Deactivated' || account === 'Suspended' || account === 'Terminated') return false;
    if (employment === 'terminated' || employment === 'exited') return false;
    return Boolean(String(row.email || '').trim());
  });
}

async function loadTaskContext(query: TenantQuery, taskId: string) {
  const result = await query(
    `SELECT t.id, t.title, t.description, t.due_date, t.priority, t.status,
            p.name AS project_name
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.id = $1
     LIMIT 1`,
    [taskId]
  );
  return result.rows[0] || null;
}

async function writeInAppNotice(
  query: TenantQuery,
  recipientId: string,
  title: string,
  message: string,
  linkUrl: string,
  priority = 'medium'
): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (recipient_employee_id, title, message, category, priority, link_url, is_read)
       VALUES ($1, $2, $3, 'Tasks', $4, $5, false)`,
      [recipientId, title, message, priority, linkUrl]
    );
  } catch (err) {
    log.warn('Could not write task notification', err);
  }
}

async function safeSend(label: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    log.warn(`Task email failed (${label})`, err);
  }
}

export async function currentTaskAssigneeIds(
  query: TenantQuery,
  taskId: string,
  fallbackPrimary?: string | null
): Promise<string[]> {
  const listed = await query(`SELECT employee_id FROM project_task_assignees WHERE task_id = $1`, [taskId]);
  const ids = uniqueIds(listed.rows.map((row: any) => row.employee_id));
  if (ids.length) return ids;
  return fallbackPrimary ? uniqueIds([fallbackPrimary]) : [];
}

export function queueTaskAssignmentEmails(
  req: Request,
  taskId: string,
  newAssigneeIds: string[],
  previousAssigneeIds: string[] = []
): void {
  const query = req.tenantQuery;
  if (!query || !taskId || !newAssigneeIds.length) return;
  const previous = new Set(previousAssigneeIds);
  const added = uniqueIds(newAssigneeIds).filter((id) => !previous.has(id));
  if (!added.length) return;

  void (async () => {
    const me = await resolveCallerEmployee(req).catch(() => null);
    await sendTaskAssignmentEmails(query, taskId, added, {
      actorEmployeeId: me?.id ? String(me.id) : null,
      actorName: me ? displayName(me) : req.user?.name || null,
      workspaceName: req.tenant?.name || null,
    });
  })().catch((err) => log.warn('Task assignment emails failed', err));
}

export async function sendTaskAssignmentEmails(
  query: TenantQuery,
  taskId: string,
  assigneeIds: string[],
  ctx: { actorEmployeeId?: string | null; actorName?: string | null; workspaceName?: string | null }
): Promise<void> {
  const ids = uniqueIds(assigneeIds).filter((id) => id !== ctx.actorEmployeeId);
  if (!ids.length) return;

  const task = await loadTaskContext(query, taskId);
  if (!task) return;

  const people = await loadAssignees(query, ids);
  const tasksUrl = frontendUrl('/projects');
  const workspaceName = ctx.workspaceName || undefined;

  for (const person of people) {
    const firstName = person.first_name || displayName(person);
    const rendered = taskAssignedEmail({
      firstName,
      workspaceName,
      assignerName: ctx.actorName || undefined,
      title: task.title,
      description: task.description,
      projectName: task.project_name,
      dueDate: task.due_date,
      priority: task.priority,
      tasksUrl,
    });
    await writeInAppNotice(
      query,
      String(person.id),
      'Task assigned to you',
      ctx.actorName ? `${ctx.actorName} assigned you “${task.title}”.` : `You were assigned “${task.title}”.`,
      '/projects',
      task.priority === 'urgent' || task.priority === 'high' ? 'high' : 'medium'
    );
    await safeSend(`assign:${person.email}`, async () => {
      await sendEmail({ to: person.email, ...rendered });
    });
  }
}

export type DueReminderKind = '3d' | '1d' | 'due';

function reminderKindForDays(daysUntilDue: number): DueReminderKind | null {
  if (daysUntilDue === 3) return '3d';
  if (daysUntilDue === 1) return '1d';
  if (daysUntilDue === 0) return 'due';
  return null;
}

export async function sendDueRemindersForTenant(
  query: TenantQuery,
  workspaceName?: string | null
): Promise<number> {
  await ensureTaskNotificationTables(query);

  const dueRows = await query(
    `SELECT DISTINCT
        t.id,
        t.title,
        t.description,
        t.due_date,
        t.priority,
        t.status,
        p.name AS project_name,
        e.id AS employee_id,
        e.email,
        e.first_name,
        e.last_name,
        e.account_status,
        ((t.due_date)::date - (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date) AS days_until_due
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN (
       SELECT task_id, employee_id FROM project_task_assignees
       UNION
       SELECT id AS task_id, assigned_to_employee_id AS employee_id
       FROM project_tasks
       WHERE assigned_to_employee_id IS NOT NULL
     ) a ON a.task_id = t.id
     JOIN employees e ON e.id = a.employee_id
     WHERE COALESCE(t.is_recurrence_template, false) = false
       AND t.due_date IS NOT NULL
       AND LOWER(COALESCE(t.status, '')) NOT IN ('done', 'completed', 'approved')
       AND t.due_date BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
                          AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 3
       AND e.email IS NOT NULL AND TRIM(e.email) <> ''
       AND COALESCE(e.account_status, '') NOT IN ('Deactivated', 'Suspended', 'Terminated')
       AND COALESCE(e.employment_status, 'active') NOT IN ('terminated', 'exited')`
  );

  const tasksUrl = frontendUrl('/projects');
  let sent = 0;

  for (const row of dueRows.rows) {
    if (COMPLETED_STATUSES.has(String(row.status || '').toLowerCase())) continue;
    const daysUntilDue = Number(row.days_until_due);
    const kind = reminderKindForDays(daysUntilDue);
    if (!kind) continue;

    const claimed = await query(
      `INSERT INTO task_due_reminders (task_id, employee_id, due_date, reminder_kind)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING task_id`,
      [row.id, row.employee_id, row.due_date, kind]
    );
    if (!claimed.rows.length) continue;

    const firstName = row.first_name || displayName(row);
    const rendered = taskDueSoonEmail({
      firstName,
      workspaceName: workspaceName || undefined,
      title: row.title,
      description: row.description,
      projectName: row.project_name,
      dueDate: row.due_date,
      priority: row.priority,
      daysUntilDue,
      tasksUrl,
    });
    const when = daysUntilDue <= 0 ? 'due today' : daysUntilDue === 1 ? 'due tomorrow' : `due in ${daysUntilDue} days`;
    await writeInAppNotice(
      query,
      String(row.employee_id),
      `Task ${when}`,
      `“${row.title}” is ${when}.`,
      '/projects',
      daysUntilDue <= 1 ? 'high' : 'medium'
    );
    await safeSend(`due:${kind}:${row.email}`, async () => {
      await sendEmail({ to: row.email, ...rendered });
    });
    sent += 1;
  }

  return sent;
}
