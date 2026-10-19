import { v4 as uuidv4 } from 'uuid';
import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import { generatePresignedDownloadUrl, generatePresignedUploadUrl } from '../../config/s3.js';
import { frontendUrl, sendEmail } from '../../config/ses.js';
import {
  supportStaffReplyEmail,
  supportTicketFollowUpEmail,
  supportTicketOpenedEmail,
} from '../../emails/templates.js';
import { log } from '../../utils/logger.js';

export type SupportStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type SupportPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SupportAuthorKind = 'user' | 'support';

export type TenantQuery = <T = any>(text: string, params?: any[]) => Promise<{ rows: T[]; rowCount?: number | null }>;

export class SupportError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'SupportError';
  }
}

export type SupportAttachmentInput = {
  fileKey: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number;
};

export type SupportAttachment = {
  id: string;
  messageId: string;
  fileKey: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

export type SupportMessage = {
  id: string;
  threadId: string;
  authorKind: SupportAuthorKind;
  authorName: string | null;
  body: string;
  createdAt: string;
  attachments: SupportAttachment[];
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
  category: string;
  priority: SupportPriority;
  status: SupportStatus;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
};

function ticketNumber(id: string): string {
  return `PX-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function mapAttachment(row: any): SupportAttachment {
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    fileKey: row.file_key,
    fileName: row.file_name,
    mimeType: row.mime_type || null,
    sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
    createdAt: row.created_at,
  };
}

function mapMessage(row: any, attachments: SupportAttachment[] = []): SupportMessage {
  return {
    id: String(row.id),
    threadId: String(row.thread_id),
    authorKind: row.author_kind,
    authorName: row.author_name || null,
    body: row.body || '',
    createdAt: row.created_at,
    attachments,
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
    category: row.category || 'General',
    priority: (row.priority || 'medium') as SupportPriority,
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

function attachmentNote(attachments: SupportAttachmentInput[]): string {
  if (!attachments.length) return '';
  const names = attachments.map((a) => a.fileName).join(', ');
  return `\n\n[${attachments.length} attachment${attachments.length === 1 ? '' : 's'}: ${names}]`;
}

const THREAD_SELECT = `
  SELECT t.*, tn.name AS tenant_name, tn.slug AS tenant_slug, tn.schema_name AS tenant_schema,
         (
           SELECT COALESCE(NULLIF(m.body, ''), 'Sent a file') FROM public.support_messages m
           WHERE m.thread_id = t.id
           ORDER BY m.created_at DESC
           LIMIT 1
         ) AS preview
  FROM public.support_threads t
  JOIN public.tenants tn ON tn.id = t.tenant_id
`;

function supportKeyPrefix(tenantId: string): string {
  return `tenants/${tenantId}/support/`;
}

function assertAttachmentKeys(tenantId: string, attachments: SupportAttachmentInput[]) {
  const prefix = supportKeyPrefix(tenantId);
  for (const a of attachments) {
    if (!a.fileKey.startsWith(prefix)) {
      throw new SupportError(400, 'INVALID_ATTACHMENT', 'Attachments must be uploaded through the support upload flow.');
    }
  }
}

export async function createSupportUpload(
  tenantId: string,
  input: { fileName: string; contentType?: string }
): Promise<{ uploadUrl: string; s3Key: string; expiresInSeconds: number }> {
  const sanitized = (input.fileName || 'unnamed-file').replace(/[^a-zA-Z0-9._-]/g, '_');
  const s3Key = `${supportKeyPrefix(tenantId)}${uuidv4()}-${sanitized}`;
  const contentType = input.contentType || 'application/octet-stream';
  try {
    const uploadUrl = await generatePresignedUploadUrl({ s3Key, contentType });
    return { uploadUrl, s3Key, expiresInSeconds: 900 };
  } catch {
    return {
      uploadUrl: `http://localhost:8080/api/v1/storage/local-upload-mock?key=${encodeURIComponent(s3Key)}`,
      s3Key,
      expiresInSeconds: 900,
    };
  }
}

async function insertAttachments(client: { query: TenantQuery }, messageId: string, attachments: SupportAttachmentInput[]) {
  for (const a of attachments) {
    await client.query(
      `INSERT INTO public.support_attachments (message_id, file_key, file_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)`,
      [messageId, a.fileKey, a.fileName.slice(0, 255), a.mimeType || null, Math.max(0, Math.round(a.sizeBytes || 0))]
    );
  }
}

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
  if (!result.rows.length) return [];
  const ids = result.rows.map((row) => row.id);
  const attachmentsRes = await pool.query(
    `SELECT * FROM public.support_attachments WHERE message_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
    [ids]
  );
  const byMessage = new Map<string, SupportAttachment[]>();
  for (const row of attachmentsRes.rows) {
    const key = String(row.message_id);
    const list = byMessage.get(key) || [];
    list.push(mapAttachment(row));
    byMessage.set(key, list);
  }
  return result.rows.map((row) => mapMessage(row, byMessage.get(String(row.id)) || []));
}

export async function createThread(input: {
  tenant: { id: string; name: string; slug: string };
  employee: { id: string; name: string; email: string };
  subject: string;
  body: string;
  category?: string;
  priority?: SupportPriority;
  attachments?: SupportAttachmentInput[];
}): Promise<SupportThread> {
  const attachments = input.attachments || [];
  const body = (input.body || '').trim();
  if (!body && attachments.length === 0) {
    throw new SupportError(400, 'EMPTY_MESSAGE', 'Write a message or attach a file.');
  }
  assertAttachmentKeys(input.tenant.id, attachments);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const threadRes = await client.query(
      `INSERT INTO public.support_threads
         (tenant_id, requester_employee_id, requester_name, requester_email, subject, status, category, priority)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7)
       RETURNING *`,
      [
        input.tenant.id,
        input.employee.id,
        input.employee.name,
        input.employee.email,
        input.subject,
        input.category || 'General',
        input.priority || 'medium',
      ]
    );
    const thread = threadRes.rows[0];
    const messageRes = await client.query(
      `INSERT INTO public.support_messages (thread_id, author_kind, author_name, body)
       VALUES ($1, 'user', $2, $3) RETURNING id`,
      [thread.id, input.employee.name, body]
    );
    await insertAttachments(client, String(messageRes.rows[0].id), attachments);
    await client.query('COMMIT');
    const created = await getMyThread(input.tenant.id, input.employee.id, String(thread.id), true);
    void notifySupportInbox(
      supportTicketOpenedEmail({
        ticketNumber: created.ticketNumber,
        workspaceName: created.tenantName || input.tenant.name,
        requesterName: created.requesterName,
        requesterEmail: created.requesterEmail,
        subject: created.subject,
        body: `${body}${attachmentNote(attachments)}`,
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
  authorName: string,
  attachments: SupportAttachmentInput[] = []
): Promise<SupportThread> {
  const thread = await getMyThread(tenantId, employeeId, threadId);
  if (thread.status === 'closed') {
    throw new SupportError(400, 'THREAD_CLOSED', 'This support thread is closed.');
  }
  const nextBody = (body || '').trim();
  if (!nextBody && attachments.length === 0) {
    throw new SupportError(400, 'EMPTY_MESSAGE', 'Write a message or attach a file.');
  }
  assertAttachmentKeys(tenantId, attachments);

  const messageRes = await pool.query(
    `INSERT INTO public.support_messages (thread_id, author_kind, author_name, body)
     VALUES ($1, 'user', $2, $3) RETURNING id`,
    [threadId, authorName, nextBody]
  );
  await insertAttachments(pool, String(messageRes.rows[0].id), attachments);
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
      body: `${nextBody}${attachmentNote(attachments)}`,
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

export async function addStaffReply(
  threadId: string,
  body: string,
  authorName: string,
  attachments: SupportAttachmentInput[] = []
): Promise<SupportThread> {
  const thread = await getTicketForAdmin(threadId);
  if (thread.status === 'closed') {
    throw new SupportError(400, 'THREAD_CLOSED', 'This support thread is closed.');
  }
  const nextBody = (body || '').trim();
  if (!nextBody && attachments.length === 0) {
    throw new SupportError(400, 'EMPTY_MESSAGE', 'Write a message or attach a file.');
  }
  assertAttachmentKeys(thread.tenantId, attachments);

  const messageRes = await pool.query(
    `INSERT INTO public.support_messages (thread_id, author_kind, author_name, body)
     VALUES ($1, 'support', $2, $3) RETURNING id`,
    [threadId, authorName, nextBody]
  );
  await insertAttachments(pool, String(messageRes.rows[0].id), attachments);
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
      body: `${nextBody}${attachmentNote(attachments)}`.trim() || 'Pixbe Support sent a file.',
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

export async function getAttachmentForUser(
  tenantId: string,
  employeeId: string,
  attachmentId: string
): Promise<SupportAttachment> {
  const result = await pool.query(
    `SELECT a.*, t.tenant_id, t.requester_employee_id
     FROM public.support_attachments a
     JOIN public.support_messages m ON m.id = a.message_id
     JOIN public.support_threads t ON t.id = m.thread_id
     WHERE a.id = $1`,
    [attachmentId]
  );
  const row = result.rows[0];
  if (!row || String(row.tenant_id) !== tenantId || String(row.requester_employee_id) !== employeeId) {
    throw new SupportError(404, 'ATTACHMENT_NOT_FOUND', 'That file was not found.');
  }
  return mapAttachment(row);
}

export async function getAttachmentForAdmin(attachmentId: string): Promise<SupportAttachment> {
  const result = await pool.query(`SELECT * FROM public.support_attachments WHERE id = $1`, [attachmentId]);
  const row = result.rows[0];
  if (!row) throw new SupportError(404, 'ATTACHMENT_NOT_FOUND', 'That file was not found.');
  return mapAttachment(row);
}

export async function attachmentDownloadUrl(fileKey: string): Promise<string> {
  try {
    return await generatePresignedDownloadUrl({ s3Key: fileKey });
  } catch {
    return `http://localhost:8080/api/v1/storage/local-download-mock?key=${encodeURIComponent(fileKey)}`;
  }
}
