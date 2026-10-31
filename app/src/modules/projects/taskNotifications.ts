import { Request } from 'express';
import { frontendUrl, sendEmail } from '../../config/ses.js';
import { withTenantContext } from '../../db/queryRunner.js';
import { taskAssignedEmail, taskDueSoonEmail } from '../../emails/templates.js';
import { log } from '../../utils/logger.js';
import { emitUserNotification } from '../chat/chat.realtime.js';
import { sendPushToEmployees } from '../push/push.service.js';

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
    return true;
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
  priority = 'medium',
  tag?: string,
  tenantKey?: string | null
): Promise<void> {
  let noticeId = '';
  try {
    const inserted = await query(
      `INSERT INTO notifications (recipient_employee_id, title, message, category, priority, link_url, is_read)
       VALUES ($1, $2, $3, 'Tasks', $4, $5, false)
       RETURNING id`,
      [recipientId, title, message, priority, linkUrl]
    );
    noticeId = inserted.rows[0]?.id ? String(inserted.rows[0].id) : '';
  } catch (err) {
    log.warn('Could not write task notification', err);
    return;
  }
  if (tenantKey && noticeId) {
    emitUserNotification(tenantKey, recipientId, {
      id: noticeId,
      title,
      message,
      category: 'Tasks',
      priority,
      linkUrl,
      createdAt: new Date().toISOString(),
    });
  }
  await sendPushToEmployees(query, [recipientId], {
    title,
    body: message.slice(0, 180),
    url: linkUrl,
    tag: tag || `task-${recipientId}-${title}`,
    notificationId: noticeId || undefined,
  });
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
  const schema = req.dbSchema;
  if (!schema || !taskId || !newAssigneeIds.length) return;
  const previous = new Set(previousAssigneeIds);
  const added = uniqueIds(newAssigneeIds).filter((id) => !previous.has(id));
  if (!added.length) return;

  const userSub = req.user?.sub || null;
  const userEmail = (req.user?.email || '').trim().toLowerCase();
  const fallbackName = req.user?.name || null;
  const workspaceName = req.tenant?.name || null;

  // The request client is released when the response finishes, so this work needs its own connection.
  void withTenantContext(schema, async (_client, tenantQuery) => {
    const queryOnTenant: TenantQuery = (text, params) => tenantQuery(text, params);
    let actorEmployeeId: string | null = null;
    let actorName = fallbackName;
    if (userSub || userEmail) {
      const me = await queryOnTenant(
        `SELECT id, first_name, last_name, email
         FROM employees
         WHERE ($1::text IS NOT NULL AND cognito_sub = $1)
            OR ($2 <> '' AND LOWER(email) = $2)
         ORDER BY CASE WHEN cognito_sub = $1 THEN 0 ELSE 1 END
         LIMIT 1`,
        [userSub, userEmail]
      );
      if (me.rows[0]) {
        actorEmployeeId = String(me.rows[0].id);
        actorName = displayName(me.rows[0]);
      }
    }
    await sendTaskAssignmentEmails(queryOnTenant, taskId, added, {
      actorEmployeeId,
      actorName,
      workspaceName,
      tenantKey: schema,
    });
  }).catch((err) => log.warn('Task assignment emails failed', err));
}

export async function sendTaskAssignmentEmails(
  query: TenantQuery,
  taskId: string,
  assigneeIds: string[],
  ctx: { actorEmployeeId?: string | null; actorName?: string | null; workspaceName?: string | null; tenantKey?: string | null }
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
      task.priority === 'urgent' || task.priority === 'high' ? 'high' : 'medium',
      `task-assign-${taskId}-${person.id}`,
      ctx.tenantKey
    );
    const email = String(person.email || '').trim();
    if (!email) continue;
    await safeSend(`assign:${email}`, async () => {
      await sendEmail({ to: email, ...rendered });
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
  workspaceName?: string | null,
  tenantKey?: string | null
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
      daysUntilDue <= 1 ? 'high' : 'medium',
      `task-due-${row.id}-${row.employee_id}-${kind}`,
      tenantKey
    );
    await safeSend(`due:${kind}:${row.email}`, async () => {
      await sendEmail({ to: row.email, ...rendered });
    });
    sent += 1;
  }

  return sent;
}
