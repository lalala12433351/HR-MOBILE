import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import { frontendUrl, sendEmail } from '../../config/ses.js';
import {
  supportStaffReplyEmail,
  supportTicketFollowUpEmail,
  supportTicketOpenedEmail,
} from '../../emails/templates.js';
import { log } from '../../utils/logger.js';

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportAuthorKind = 'user' | 'support';

export type TenantQuery = <T = any>(text: string, params?: any[]) => Promise<{ rows: T[]; rowCount?: number | null }>;

export class SupportError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'SupportError';
  }
}

export type SupportMessage = {
  id: string;
  threadId: string;
  authorKind: SupportAuthorKind;
  authorName: string | null;
  body: string;
  createdAt: string;
};

export type SupportThread = {
  id: string;
  ticketNumber: string;
  tenantId: string;
  tenantName: string | null;
  tenantSlug: string | null;
  tenantSchema: string | null;
  requesterEmployeeId: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  status: SupportStatus;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
};

function ticketNumber(id: string): string {
  return `PX-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function mapMessage(row: any): SupportMessage {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    authorKind: row.author_kind,
    authorName: row.author_name || null,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapThread(row: any, messages?: SupportMessage[]): SupportThread {
  return {
    id: String(row.id),
    ticketNumber: ticketNumber(String(row.id)),
    tenantId: String(row.tenant_id),
    tenantName: row.tenant_name || null,
    tenantSlug: row.tenant_slug || null,
    tenantSchema: row.tenant_schema || null,
    requesterEmployeeId: String(row.requester_employee_id),
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    subject: row.subject,
    status: row.status,
    preview: row.preview || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  };
}

export async function resolveSupportEmployee(
  q: TenantQuery,
  sub: string,
  email: string
): Promise<{ id: string; name: string; email: string } | null> {
  const normalized = (email || '').trim().toLowerCase();
  const result = await q(
    `SELECT id,
            NULLIF(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), '') AS name,
            email
     FROM employees
     WHERE (cognito_sub IS NOT NULL AND cognito_sub = $1)
        OR ($2 <> '' AND LOWER(email) = $2)
     ORDER BY CASE WHEN cognito_sub = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [sub, normalized]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: row.name || row.email || 'Workspace admin',
    email: String(row.email || normalized),
  };
}

export async function resolveTenantRecord(hint: {
  tenantId?: string | null;
  schema?: string | null;
}): Promise<{ id: string; name: string; slug: string }> {
  const tenantId = (hint.tenantId || '').trim();
  const schema = (hint.schema || '').trim();
  const result = await pool.query(
    `SELECT id, name, slug
     FROM public.tenants
     WHERE ($1 <> '' AND (id::text = $1 OR slug = $1))
        OR ($2 <> '' AND schema_name = $2)
     ORDER BY CASE WHEN id::text = $1 THEN 0 WHEN slug = $1 THEN 1 ELSE 2 END
     LIMIT 1`,
    [tenantId, schema]
  );
  const row = result.rows[0];
  if (!row) {
    throw new SupportError(400, 'TENANT_NOT_FOUND', 'This workspace could not be matched for support.');
  }
  return { id: String(row.id), name: row.name, slug: row.slug };
}

async function safeSend(run: () => Promise<void>, label: string): Promise<void> {
  try {
    await run();
  } catch (err: any) {
    log.error(`Support email failed (${label})`, err);
  }
}

function notifySupportInbox(
  rendered: { subject: string; html: string; text: string },
  replyTo: string,
  label: string
): Promise<void> {
  return safeSend(async () => {
    await sendEmail({
      to: env.SUPPORT_EMAIL,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: replyTo || undefined,
    });
  }, label);
}

const THREAD_SELECT = `
  SELECT t.*, tn.name AS tenant_name, tn.slug AS tenant_slug, tn.schema_name AS tenant_schema,
         (
           SELECT m.body FROM public.support_messages m
           WHERE m.thread_id = t.id
           ORDER BY m.created_at ASC
           LIMIT 1
         ) AS preview
  FROM public.support_threads t
  JOIN public.tenants tn ON tn.id = t.tenant_id
`;

export async function listMyThreads(tenantId: string, employeeId: string): Promise<SupportThread[]> {
  const result = await pool.query(
    `${THREAD_SELECT}
     WHERE t.tenant_id = $1 AND t.requester_employee_id = $2
     ORDER BY t.updated_at DESC`,
    [tenantId, employeeId]
  );
  return result.rows.map((row) => mapThread(row));
}

export async function getMyThread(
  tenantId: string,
  employeeId: string,
  threadId: string,
  withMessages = false
): Promise<SupportThread> {
  const result = await pool.query(`${THREAD_SELECT} WHERE t.id = $1 AND t.tenant_id = $2 AND t.requester_employee_id = $3`, [
    threadId,
    tenantId,
    employeeId,
  ]);
  const row = result.rows[0];
  if (!row) throw new SupportError(404, 'THREAD_NOT_FOUND', 'That support thread was not found.');
  const messages = withMessages ? await listMessages(threadId) : undefined;
  return mapThread(row, messages);
}

export async function listMessages(threadId: string): Promise<SupportMessage[]> {
  const result = await pool.query(
    `SELECT * FROM public.support_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
    [threadId]
  );
  return result.rows.map(mapMessage);
}

export async function createThread(input: {
  tenant: { id: string; name: string; slug: string };
  employee: { id: string; name: string; email: string };
  subject: string;
  body: string;
}): Promise<SupportThread> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const threadRes = await client.query(
      `INSERT INTO public.support_threads
         (tenant_id, requester_employee_id, requester_name, requester_email, subject, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING *`,
      [input.tenant.id, input.employee.id, input.employee.name, input.employee.email, input.subject]
    );
    const thread = threadRes.rows[0];
    await client.query(
      `INSERT INTO public.support_messages (thread_id, author_kind, author_name, body)
       VALUES ($1, 'user', $2, $3)`,
      [thread.id, input.employee.name, input.body]
    );
    await client.query('COMMIT');
    const created = await getMyThread(input.tenant.id, input.employee.id, String(thread.id), true);
    void notifySupportInbox(
      supportTicketOpenedEmail({
        ticketNumber: created.ticketNumber,
        workspaceName: created.tenantName || input.tenant.name,
        requesterName: created.requesterName,
        requesterEmail: created.requesterEmail,
        subject: created.subject,
        body: input.body,
      }),
      created.requesterEmail,
      'ticket-opened'
    );
    return created;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

export async function addUserMessage(
  tenantId: string,
  employeeId: string,
  threadId: string,
  body: string,
  authorName: string
): Promise<SupportThread> {
  const thread = await getMyThread(tenantId, employeeId, threadId);
  if (thread.status === 'closed') {
    throw new SupportError(400, 'THREAD_CLOSED', 'This support thread is closed.');
  }

  await pool.query(
    `INSERT INTO public.support_messages (thread_id, author_kind, author_name, body)
     VALUES ($1, 'user', $2, $3)`,
    [threadId, authorName, body]
  );
  const nextStatus = thread.status === 'resolved' ? 'open' : thread.status;
  await pool.query(
    `UPDATE public.support_threads SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [threadId, nextStatus]
  );

  const updated = await getMyThread(tenantId, employeeId, threadId, true);
  void notifySupportInbox(
    supportTicketFollowUpEmail({
      ticketNumber: updated.ticketNumber,
      workspaceName: updated.tenantName || 'Workspace',
      requesterName: updated.requesterName,
      requesterEmail: updated.requesterEmail,
      subject: updated.subject,
      body,
    }),
    updated.requesterEmail,
    'ticket-follow-up'
  );
  return updated;
}

export async function listAllTickets(status?: SupportStatus): Promise<SupportThread[]> {
  const params: unknown[] = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE t.status = $1`;
  }
  const result = await pool.query(
    `${THREAD_SELECT} ${where} ORDER BY t.updated_at DESC LIMIT 200`,
    params
  );
  return result.rows.map((row) => mapThread(row));
}

export async function getTicketForAdmin(threadId: string): Promise<SupportThread> {
  const result = await pool.query(`${THREAD_SELECT} WHERE t.id = $1`, [threadId]);
  const row = result.rows[0];
  if (!row) throw new SupportError(404, 'THREAD_NOT_FOUND', 'That support ticket was not found.');
  return mapThread(row, await listMessages(threadId));
}

export async function addStaffReply(threadId: string, body: string, authorName: string): Promise<SupportThread> {
  const thread = await getTicketForAdmin(threadId);
  if (thread.status === 'closed') {
    throw new SupportError(400, 'THREAD_CLOSED', 'This support thread is closed.');
  }

  await pool.query(
    `INSERT INTO public.support_messages (thread_id, author_kind, author_name, body)
     VALUES ($1, 'support', $2, $3)`,
    [threadId, authorName, body]
  );
  await pool.query(
    `UPDATE public.support_threads SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [threadId]
  );

  await safeSend(async () => {
    const rendered = supportStaffReplyEmail({
      firstName: thread.requesterName.split(' ')[0],
      ticketNumber: thread.ticketNumber,
      workspaceName: thread.tenantName || 'your workspace',
      subject: thread.subject,
      body,
      settingsUrl: frontendUrl('/settings'),
    });
    await sendEmail({ to: thread.requesterEmail, ...rendered });
  }, 'staff-reply');

  return getTicketForAdmin(threadId);
}

export async function updateTicketStatus(threadId: string, status: SupportStatus): Promise<SupportThread> {
  const result = await pool.query(
    `UPDATE public.support_threads SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`,
    [threadId, status]
  );
  if (!result.rows[0]) throw new SupportError(404, 'THREAD_NOT_FOUND', 'That support ticket was not found.');
  return getTicketForAdmin(threadId);
}
