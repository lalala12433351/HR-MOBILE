import { log } from '../../utils/logger.js';
import { emitUserNotification } from '../chat/chat.realtime.js';
import { sendPushToEmployees } from '../push/push.service.js';

export type TenantQuery = (text: string, params?: any[]) => Promise<{ rows: any[] }>;

async function writeNotice(
  query: TenantQuery,
  recipientId: string,
  title: string,
  message: string,
  category: string,
  linkUrl: string,
  priority: string,
  tenantKey?: string | null
): Promise<string | null> {
  try {
    const inserted = await query(
      `INSERT INTO notifications (recipient_employee_id, title, message, category, priority, link_url, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, false)
       RETURNING id`,
      [recipientId, title, message, category, priority, linkUrl]
    );
    const noticeId = inserted.rows[0]?.id ? String(inserted.rows[0].id) : '';
    if (tenantKey && noticeId) {
      emitUserNotification(tenantKey, recipientId, {
        id: noticeId,
        title,
        message,
        category,
        priority,
        linkUrl,
        createdAt: new Date().toISOString(),
      });
    }
    return noticeId || null;
  } catch (err) {
    log.warn('Could not write attendance notification', err);
    return null;
  }
}

export async function notifyEmployees(
  query: TenantQuery,
  recipientIds: string[],
  title: string,
  message: string,
  opts: {
    category?: string;
    linkUrl?: string;
    priority?: string;
    tag?: string;
    tenantKey?: string | null;
  } = {}
): Promise<void> {
  const ids = Array.from(new Set(recipientIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) return;

  const category = opts.category || 'Approvals';
  const linkUrl = opts.linkUrl || '/attendance?tab=leaves';
  const priority = opts.priority || 'medium';

  for (const id of ids) {
    await writeNotice(query, id, title, message, category, linkUrl, priority, opts.tenantKey);
  }

  await sendPushToEmployees(query, ids, {
    title,
    body: message.slice(0, 180),
    url: linkUrl,
    tag: opts.tag || `attendance-${ids[0]}-${title}`,
  });
}

export async function resolveLeaveApproverIds(query: TenantQuery, employeeId: string): Promise<string[]> {
  const emp = await query(
    `SELECT reporting_manager_id FROM employees WHERE id = $1::uuid LIMIT 1`,
    [employeeId]
  );
  const managerId = emp.rows[0]?.reporting_manager_id ? String(emp.rows[0].reporting_manager_id) : '';
  const hr = await query(
    `SELECT id FROM employees
     WHERE role IN ('hr', 'hr_manager', 'super_admin', 'platform_admin')
       AND COALESCE(employment_status, 'active') IN ('active', 'on_probation')`
  );
  const ids = [
    managerId,
    ...hr.rows.map((row: any) => String(row.id)),
  ].filter((id) => id && id !== String(employeeId));
  return Array.from(new Set(ids));
}

export async function employeeDisplayName(query: TenantQuery, employeeId: string): Promise<string> {
  const res = await query(
    `SELECT first_name, last_name, email FROM employees WHERE id = $1::uuid LIMIT 1`,
    [employeeId]
  );
  const row = res.rows[0];
  if (!row) return 'An employee';
  const name = `${row.first_name || ''} ${row.last_name || ''}`.replace(/\s+/g, ' ').trim();
  return name || row.email || 'An employee';
}
