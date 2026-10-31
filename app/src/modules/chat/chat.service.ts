import { pool } from '../../config/database.js';
import { sanitizeSchemaName } from '../../db/queryRunner.js';
import { log } from '../../utils/logger.js';
import { sendPushToEmployees } from '../push/push.service.js';
import { emitToRooms, emitUserNotification, rooms } from './chat.realtime.js';

export type TenantQuery = <T = any>(text: string, params?: any[]) => Promise<{ rows: T[]; rowCount?: number | null }>;

export type ChatCtx = {
  q: TenantQuery;
  /** Sanitized tenant schema; also the realtime room namespace. */
  tenantKey: string;
  /** Tenant slug used as the storage key prefix by the storage module. */
  storageTenant: string;
  meId: string;
  meName: string;
  role: string;
};

export type ConversationType = 'team_channel' | 'group' | 'direct' | 'hr_ticket';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type AttachmentInput = {
  fileKey: string;
  fileName: string;
  mimeType?: string | null;
  sizeBytes?: number;
};

export class ChatError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const HR_ROLES = ['hr', 'hr_manager', 'super_admin', 'platform_admin'];

export function isHrRole(role?: string | null): boolean {
  return !!role && HR_ROLES.includes(role);
}

const NAME_SQL = (alias: string) => `NULLIF(TRIM(COALESCE(${alias}.first_name, '') || ' ' || COALESCE(${alias}.last_name, '')), '')`;

const MENTION_RE =
  /@\[([^\]\n]{1,120})\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

function mentionPattern(): RegExp {
  return new RegExp(MENTION_RE.source, 'g');
}

export function stripMentionTokens(text: string): string {
  return text.replace(mentionPattern(), '@$1');
}

function mentionLabel(name: string): string {
  return name.replace(/[\[\]\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Someone';
}

type MentionRef = { employeeId: string; name: string };

async function resolveMentionBody(
  ctx: ChatCtx,
  conversationId: string,
  body: string
): Promise<{ body: string; mentions: MentionRef[] }> {
  if (!body.includes('@[')) return { body, mentions: [] };
  const participants = await ctx.q(
    `SELECT p.employee_id, ${NAME_SQL('e')} AS name
     FROM chat_participants p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.conversation_id = $1`,
    [conversationId]
  );
  const byId = new Map<string, MentionRef>();
  for (const row of participants.rows) {
    const employeeId = String(row.employee_id);
    byId.set(employeeId.toLowerCase(), { employeeId, name: mentionLabel(row.name || 'Someone') });
  }
  const seen = new Set<string>();
  const mentions: MentionRef[] = [];
  const next = body.replace(mentionPattern(), (_full, rawName: string, rawId: string) => {
    const known = byId.get(String(rawId).toLowerCase());
    if (!known || known.employeeId.toLowerCase() === ctx.meId.toLowerCase()) return `@${mentionLabel(String(rawName))}`;
    if (!seen.has(known.employeeId)) {
      seen.add(known.employeeId);
      mentions.push(known);
    }
    return `@[${known.name}](${known.employeeId})`;
  });
  return { body: next, mentions };
}

async function replaceMessageMentions(ctx: ChatCtx, messageId: string, mentions: MentionRef[]) {
  await ctx.q(`DELETE FROM chat_mentions WHERE message_id = $1`, [messageId]);
  if (mentions.length === 0) return;
  await ctx.q(
    `INSERT INTO chat_mentions (message_id, employee_id)
     SELECT $1, x.id FROM unnest($2::uuid[]) AS x(id)
     ON CONFLICT (message_id, employee_id) DO NOTHING`,
    [messageId, mentions.map((m) => m.employeeId)]
  );
}

async function announceMentions(
  ctx: ChatCtx,
  conversationId: string,
  messageId: string,
  mentions: MentionRef[],
  body: string
) {
  if (mentions.length === 0) return;
  const conv = await ctx.q(`SELECT type, name FROM chat_conversations WHERE id = $1`, [conversationId]);
  const row = conv.rows[0];
  const where = row?.type === 'direct' ? '' : ` in ${row?.name || 'a chat'}`;
  const title = `${ctx.meName} mentioned you${where}`;
  const preview = stripMentionTokens(body).replace(/\s+/g, ' ').trim().slice(0, 180) || 'You were mentioned';
  const link = `/chat?c=${conversationId}`;
  const ids = mentions.map((m) => m.employeeId);
  await notify(ctx, ids, title, preview, link, 'high', 'Chat', `mention-${messageId}`);
}

// ---------------------------------------------------------------------------
// Tenant DB access outside of an HTTP request (sockets)
// ---------------------------------------------------------------------------

export async function withTenantClient<T>(schema: string, fn: (q: TenantQuery) => Promise<T>): Promise<T> {
  const sanitized = sanitizeSchemaName(schema);
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${sanitized}", public`);
    const q: TenantQuery = (text, params) => client.query(text, params) as any;
    return await fn(q);
  } finally {
    try {
      await client.query('RESET search_path');
    } catch (_) {}
    client.release();
  }
}

export async function resolveChatEmployee(
  q: TenantQuery,
  sub: string,
  email: string
): Promise<{ id: string; name: string; role: string } | null> {
  const normalized = (email || '').trim().toLowerCase();
  const result = await q(
    `SELECT id, role, ${NAME_SQL('e')} AS name, email
     FROM employees e
     WHERE (cognito_sub IS NOT NULL AND cognito_sub = $1)
        OR ($2 <> '' AND LOWER(email) = $2)
     ORDER BY CASE WHEN cognito_sub = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [sub, normalized]
  );
  const row = result.rows[0];
  if (!row) return null;
  return { id: String(row.id), name: row.name || row.email, role: row.role };
}

// ---------------------------------------------------------------------------
// Team channel sync
// ---------------------------------------------------------------------------

const TEAM_SYNC_TTL_MS = 60_000;
const lastTeamSync = new Map<string, number>();

/** Forces the next conversation listing in this tenant to resync team channels. */
export function markTeamChannelsDirty(tenantKey?: string | null): void {
  if (tenantKey) lastTeamSync.delete(tenantKey);
  else lastTeamSync.clear();
}

const DESIRED_MEMBERSHIP_SQL = `
  WITH desired AS (
    SELECT c.id AS conversation_id, e.id AS employee_id,
           CASE WHEN t.lead_employee_id = e.id THEN 'admin' ELSE 'member' END AS role
    FROM chat_conversations c
    JOIN teams t ON t.id = c.team_id
    JOIN employees e ON (e.team_id = t.id OR e.id = t.lead_employee_id)
    WHERE c.type = 'team_channel'
      AND e.employment_status IN ('active', 'on_probation')
    UNION ALL
    SELECT c.id, e.id,
           CASE WHEN d.lead_employee_id = e.id THEN 'admin' ELSE 'member' END
    FROM chat_conversations c
    JOIN departments d ON d.id = c.department_id
    JOIN employees e ON (e.department_id = d.id OR e.id = d.lead_employee_id)
    WHERE c.type = 'team_channel' AND c.team_id IS NULL
      AND e.employment_status IN ('active', 'on_probation')
  )`;

/** True when a team is just the auto-created department squad (`Ops`, `Ops Team`, `Ops Core Team`). */
const DEFAULT_DEPT_TEAM_SQL = `
  LOWER(regexp_replace(TRIM(t.name), '\\s+', ' ', 'g')) IN (
    LOWER(TRIM(d.name)),
    LOWER(TRIM(d.name)) || ' team',
    LOWER(TRIM(d.name)) || ' core team'
  )`;

export async function syncTeamChannels(q: TenantQuery, tenantKey: string, force = false): Promise<void> {
  const last = lastTeamSync.get(tenantKey);
  const skipMembership = !force && !!last && Date.now() - last < TEAM_SYNC_TTL_MS;

  try {
    await q(
      `INSERT INTO chat_conversations (type, name, department_id)
       SELECT 'team_channel', d.name, d.id FROM departments d
       ON CONFLICT (department_id) WHERE type = 'team_channel' AND team_id IS NULL AND department_id IS NOT NULL
       DO UPDATE SET name = EXCLUDED.name, updated_at = CURRENT_TIMESTAMP
       WHERE chat_conversations.name IS DISTINCT FROM EXCLUDED.name`
    );
    // Setup / employee save always creates "{Department} Team". Fold that duplicate into the department chat.
    const defaultTeamChannels = `
      SELECT team_c.id AS team_conv, dept_c.id AS dept_conv, team_c.last_message_at AS team_last_at
      FROM chat_conversations team_c
      JOIN teams t ON t.id = team_c.team_id
      JOIN departments d ON d.id = t.department_id
      JOIN chat_conversations dept_c
        ON dept_c.department_id = d.id
       AND dept_c.type = 'team_channel'
       AND dept_c.team_id IS NULL
      WHERE team_c.type = 'team_channel'
        AND team_c.team_id IS NOT NULL
        AND (${DEFAULT_DEPT_TEAM_SQL})`;
    await q(
      `INSERT INTO chat_participants (conversation_id, employee_id, role, joined_at, last_read_message_id, last_read_at, muted)
       SELECT r.dept_conv, p.employee_id, p.role, p.joined_at, p.last_read_message_id, p.last_read_at, p.muted
       FROM chat_participants p
       JOIN (${defaultTeamChannels}) r ON r.team_conv = p.conversation_id
       ON CONFLICT (conversation_id, employee_id) DO UPDATE SET
         last_read_at = GREATEST(chat_participants.last_read_at, EXCLUDED.last_read_at),
         last_read_message_id = CASE
           WHEN EXCLUDED.last_read_at IS NOT NULL
            AND (chat_participants.last_read_at IS NULL OR EXCLUDED.last_read_at >= chat_participants.last_read_at)
           THEN EXCLUDED.last_read_message_id
           ELSE chat_participants.last_read_message_id
         END,
         muted = chat_participants.muted OR EXCLUDED.muted`
    );
    await q(
      `UPDATE chat_messages msg
       SET conversation_id = r.dept_conv
       FROM (${defaultTeamChannels}) r
       WHERE msg.conversation_id = r.team_conv`
    );
    await q(
      `UPDATE chat_conversations c
       SET last_message_at = GREATEST(c.last_message_at, r.team_last_at),
           updated_at = CURRENT_TIMESTAMP
       FROM (${defaultTeamChannels}) r
       WHERE c.id = r.dept_conv`
    );
    await q(
      `DELETE FROM chat_conversations c
       USING (${defaultTeamChannels}) r
       WHERE c.id = r.team_conv`
    );
    await q(
      `INSERT INTO chat_conversations (type, name, team_id, department_id)
       SELECT 'team_channel', t.name, t.id, t.department_id
       FROM teams t
       JOIN departments d ON d.id = t.department_id
       WHERE NOT (${DEFAULT_DEPT_TEAM_SQL})
       ON CONFLICT (team_id) WHERE type = 'team_channel' AND team_id IS NOT NULL
       DO UPDATE SET name = EXCLUDED.name, department_id = EXCLUDED.department_id, updated_at = CURRENT_TIMESTAMP
       WHERE chat_conversations.name IS DISTINCT FROM EXCLUDED.name
          OR chat_conversations.department_id IS DISTINCT FROM EXCLUDED.department_id`
    );
    if (skipMembership) return;
    lastTeamSync.set(tenantKey, Date.now());
    await q(
      `${DESIRED_MEMBERSHIP_SQL}
       INSERT INTO chat_participants (conversation_id, employee_id, role)
       SELECT DISTINCT ON (conversation_id, employee_id) conversation_id, employee_id, role
       FROM desired
       ORDER BY conversation_id, employee_id, role
       ON CONFLICT (conversation_id, employee_id)
       DO UPDATE SET role = EXCLUDED.role
       WHERE chat_participants.role IS DISTINCT FROM EXCLUDED.role`
    );
    await q(
      `${DESIRED_MEMBERSHIP_SQL}
       DELETE FROM chat_participants p
       USING chat_conversations c
       WHERE p.conversation_id = c.id
         AND c.type = 'team_channel'
         AND NOT EXISTS (
           SELECT 1 FROM desired d
           WHERE d.conversation_id = p.conversation_id AND d.employee_id = p.employee_id
         )`
    );
  } catch (err) {
    lastTeamSync.delete(tenantKey);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

function iso(value: any): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapParticipant(row: any) {
  return {
    employeeId: String(row.employee_id),
    name: row.name || row.email || 'Unknown',
    email: row.email || null,
    avatarUrl: row.avatar_url || null,
    role: row.role,
    employeeRole: row.employee_role || null,
    lastReadAt: iso(row.last_read_at),
    lastReadMessageId: row.last_read_message_id ? String(row.last_read_message_id) : null,
  };
}

function mapConversation(row: any, participants: any[]) {
  return {
    id: String(row.id),
    type: row.type as ConversationType,
    name: row.name || null,
    description: row.description || null,
    avatar: row.avatar || null,
    teamId: row.team_id ? String(row.team_id) : null,
    teamName: row.team_name || null,
    departmentId: row.department_id ? String(row.department_id) : null,
    departmentName: row.department_name || null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdByName: row.created_by_name || null,
    isArchived: !!row.is_archived,
    lastMessageAt: iso(row.last_message_at),
    createdAt: iso(row.created_at),
    myRole: row.my_role || null,
    isParticipant: !!row.my_role,
    muted: !!row.muted,
    unreadCount: Number(row.unread_count || 0),
    lastMessage: row.last_message_id
      ? {
          id: String(row.last_message_id),
          body: row.last_message_deleted_at ? '' : stripMentionTokens(row.last_message_body || ''),
          type: row.last_message_type,
          senderId: row.last_message_sender_id ? String(row.last_message_sender_id) : null,
          senderName: row.last_message_sender_name || null,
          createdAt: iso(row.last_message_created_at),
          isDeleted: !!row.last_message_deleted_at,
          hasAttachments: !!row.last_message_has_attachments,
        }
      : null,
    ticket:
      row.type === 'hr_ticket'
        ? {
            status: row.ticket_status as TicketStatus,
            category: row.ticket_category || null,
            priority: row.ticket_priority || 'medium',
            assignedHrId: row.assigned_hr_id ? String(row.assigned_hr_id) : null,
            assignedHrName: row.assigned_hr_name || null,
            resolvedAt: iso(row.resolved_at),
          }
        : null,
    participants: participants.map(mapParticipant),
  };
}

export type ConversationDto = ReturnType<typeof mapConversation>;

function mapMessage(row: any, attachments: any[], reactions: any[], mentions: any[] = []) {
  const deleted = !!row.deleted_at;
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: row.sender_id ? String(row.sender_id) : null,
    senderName: row.sender_name || null,
    senderAvatar: row.sender_avatar || null,
    body: deleted ? '' : row.body || '',
    type: row.type as 'text' | 'system' | 'file',
    parentMessageId: row.parent_message_id ? String(row.parent_message_id) : null,
    parent: row.parent_message_id
      ? {
          id: String(row.parent_message_id),
          senderName: row.parent_sender_name || null,
          body: row.parent_deleted_at ? '' : row.parent_body || '',
          isDeleted: !!row.parent_deleted_at,
        }
      : null,
    replyCount: Number(row.reply_count || 0),
    editedAt: iso(row.edited_at),
    deletedAt: iso(row.deleted_at),
    createdAt: iso(row.created_at),
    attachments: deleted
      ? []
      : attachments.map((a) => ({
          id: String(a.id),
          fileKey: a.file_key,
          fileName: a.file_name,
          mimeType: a.mime_type || null,
          sizeBytes: Number(a.size_bytes || 0),
        })),
    reactions: reactions.map((r) => ({
      emoji: r.emoji,
      employeeIds: (r.employee_ids || []).map(String),
    })),
    mentions: deleted
      ? []
      : mentions.map((m) => ({
          employeeId: String(m.employee_id),
          name: m.name || 'Someone',
        })),
  };
}

export type MessageDto = ReturnType<typeof mapMessage>;

// ---------------------------------------------------------------------------
// Conversation queries
// ---------------------------------------------------------------------------

type ConversationFilter = {
  ids?: string[];
  type?: ConversationType;
  includeArchived?: boolean;
  participantOnly?: boolean;
  ticketStatus?: TicketStatus;
  assignedTo?: string;
  unassigned?: boolean;
};

async function fetchConversations(ctx: ChatCtx, filter: ConversationFilter): Promise<ConversationDto[]> {
  const params: any[] = [ctx.meId];
  const where: string[] = [];

  if (filter.participantOnly) {
    where.push('p.id IS NOT NULL');
  } else {
    params.push(isHrRole(ctx.role), ctx.role === 'super_admin' || ctx.role === 'platform_admin');
    where.push(`(p.id IS NOT NULL OR ($2::boolean AND c.type = 'hr_ticket') OR ($3::boolean AND c.type = 'team_channel'))`);
  }
  if (filter.ids) {
    params.push(filter.ids);
    where.push(`c.id = ANY($${params.length}::uuid[])`);
  }
  if (filter.type) {
    params.push(filter.type);
    where.push(`c.type = $${params.length}`);
  }
  if (!filter.includeArchived) where.push('c.is_archived = false');
  if (filter.ticketStatus) {
    params.push(filter.ticketStatus);
    where.push(`c.ticket_status = $${params.length}`);
  }
  if (filter.assignedTo) {
    params.push(filter.assignedTo);
    where.push(`c.assigned_hr_id = $${params.length}`);
  }
  if (filter.unassigned) where.push('c.assigned_hr_id IS NULL');

  const result = await ctx.q(
    `SELECT c.*,
            p.id AS participant_row_id, p.role AS my_role, p.muted,
            d.name AS department_name, t.name AS team_name,
            ${NAME_SQL('hr')} AS assigned_hr_name,
            ${NAME_SQL('cr')} AS created_by_name,
            lm.id AS last_message_id, lm.body AS last_message_body, lm.type AS last_message_type,
            lm.created_at AS last_message_created_at, lm.deleted_at AS last_message_deleted_at,
            lm.sender_id AS last_message_sender_id, ${NAME_SQL('lse')} AS last_message_sender_name,
            EXISTS (SELECT 1 FROM chat_attachments a WHERE a.message_id = lm.id) AS last_message_has_attachments,
            CASE WHEN p.id IS NULL THEN 0 ELSE (
              SELECT COUNT(*)::int FROM chat_messages um
              WHERE um.conversation_id = c.id
                AND um.deleted_at IS NULL
                AND um.sender_id IS DISTINCT FROM $1
                AND um.created_at > COALESCE(p.last_read_at, p.joined_at)
            ) END AS unread_count
     FROM chat_conversations c
     LEFT JOIN chat_participants p ON p.conversation_id = c.id AND p.employee_id = $1
     LEFT JOIN departments d ON d.id = c.department_id
     LEFT JOIN teams t ON t.id = c.team_id
     LEFT JOIN employees hr ON hr.id = c.assigned_hr_id
     LEFT JOIN employees cr ON cr.id = c.created_by
     LEFT JOIN LATERAL (
       SELECT * FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1
     ) lm ON true
     LEFT JOIN employees lse ON lse.id = lm.sender_id
     WHERE ${where.join(' AND ')}
       AND NOT (
         c.type = 'team_channel' AND c.team_id IS NOT NULL
         AND t.id IS NOT NULL AND d.id IS NOT NULL
         AND (${DEFAULT_DEPT_TEAM_SQL})
       )
     ORDER BY c.last_message_at DESC`,
    params
  );

  if (result.rows.length === 0) return [];

  const ids = result.rows.map((r: any) => r.id);
  const participantsRes = await ctx.q(
    `SELECT p.conversation_id, p.employee_id, p.role, p.last_read_at, p.last_read_message_id,
            ${NAME_SQL('e')} AS name, e.email, e.avatar_url, e.role AS employee_role
     FROM chat_participants p
     JOIN employees e ON e.id = p.employee_id
     WHERE p.conversation_id = ANY($1::uuid[])
     ORDER BY p.joined_at ASC`,
    [ids]
  );
  const byConversation = new Map<string, any[]>();
  for (const row of participantsRes.rows) {
    const key = String(row.conversation_id);
    if (!byConversation.has(key)) byConversation.set(key, []);
    byConversation.get(key)!.push(row);
  }

  return result.rows.map((row: any) => mapConversation(row, byConversation.get(String(row.id)) || []));
}

export async function listConversations(
  ctx: ChatCtx,
  opts: { type?: ConversationType; includeArchived?: boolean }
): Promise<ConversationDto[]> {
  await syncTeamChannels(ctx.q, ctx.tenantKey);
  return fetchConversations(ctx, { ...opts, participantOnly: true });
}

export async function getConversation(ctx: ChatCtx, id: string): Promise<ConversationDto> {
  const [conv] = await fetchConversations(ctx, { ids: [id], includeArchived: true });
  if (!conv) throw new ChatError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found or you do not have access.');
  return conv;
}

type AccessRow = {
  id: string;
  type: ConversationType;
  name: string | null;
  created_by: string | null;
  ticket_status: TicketStatus | null;
  assigned_hr_id: string | null;
  my_role: string | null;
};

async function requireAccess(ctx: ChatCtx, conversationId: string): Promise<AccessRow> {
  const res = await ctx.q<AccessRow>(
    `SELECT c.id, c.type, c.name, c.created_by, c.ticket_status, c.assigned_hr_id, p.role AS my_role
     FROM chat_conversations c
     LEFT JOIN chat_participants p ON p.conversation_id = c.id AND p.employee_id = $2
     WHERE c.id = $1`,
    [conversationId, ctx.meId]
  );
  const row = res.rows[0];
  const canRead =
    !!row &&
    (!!row.my_role ||
      (row.type === 'hr_ticket' && isHrRole(ctx.role)) ||
      (row.type === 'team_channel' && (ctx.role === 'super_admin' || ctx.role === 'platform_admin')));
  if (!canRead) {
    throw new ChatError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found or you do not have access.');
  }
  return row;
}

export async function canAccessConversation(ctx: ChatCtx, conversationId: string): Promise<boolean> {
  try {
    await requireAccess(ctx, conversationId);
    return true;
  } catch {
    return false;
  }
}

async function conversationRooms(ctx: ChatCtx, conversationId: string, type?: ConversationType): Promise<string[]> {
  const res = await ctx.q(`SELECT employee_id FROM chat_participants WHERE conversation_id = $1`, [conversationId]);
  const targets = res.rows.map((r: any) => rooms.user(ctx.tenantKey, String(r.employee_id)));
  targets.push(rooms.conversation(ctx.tenantKey, conversationId));
  if (type === 'hr_ticket') targets.push(rooms.hr(ctx.tenantKey));
  return targets;
}

async function broadcast(ctx: ChatCtx, conversationId: string, type: ConversationType, event: string, payload: unknown) {
  emitToRooms(await conversationRooms(ctx, conversationId, type), event, payload);
}

async function assertEmployeesExist(ctx: ChatCtx, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const res = await ctx.q(
    `SELECT id FROM employees WHERE id = ANY($1::uuid[]) AND employment_status IN ('active', 'on_probation')`,
    [ids]
  );
  if (res.rows.length !== new Set(ids).size) {
    throw new ChatError(400, 'INVALID_PARTICIPANTS', 'One or more selected people could not be found.');
  }
}

async function employeeNames(ctx: ChatCtx, ids: string[]): Promise<Map<string, string>> {
  const res = await ctx.q(`SELECT id, ${NAME_SQL('e')} AS name, email FROM employees e WHERE id = ANY($1::uuid[])`, [ids]);
  return new Map(res.rows.map((r: any) => [String(r.id), r.name || r.email]));
}

export async function createConversation(
  ctx: ChatCtx,
  input: { type: 'group' | 'direct'; participantIds: string[]; name?: string; description?: string }
): Promise<ConversationDto> {
  const others = Array.from(new Set(input.participantIds.filter((id) => id !== ctx.meId)));

  if (input.type === 'direct') {
    if (others.length !== 1) throw new ChatError(400, 'INVALID_PARTICIPANTS', 'A direct chat needs exactly one other person.');
    await assertEmployeesExist(ctx, others);
    const existing = await ctx.q(
      `SELECT c.id FROM chat_conversations c
       WHERE c.type = 'direct'
         AND EXISTS (SELECT 1 FROM chat_participants p WHERE p.conversation_id = c.id AND p.employee_id = $1)
         AND EXISTS (SELECT 1 FROM chat_participants p WHERE p.conversation_id = c.id AND p.employee_id = $2)
         AND (SELECT COUNT(*) FROM chat_participants p WHERE p.conversation_id = c.id) = 2
       LIMIT 1`,
      [ctx.meId, others[0]]
    );
    if (existing.rows[0]) {
      const id = String(existing.rows[0].id);
      await ctx.q(`UPDATE chat_conversations SET is_archived = false WHERE id = $1 AND is_archived = true`, [id]);
      return getConversation(ctx, id);
    }
  } else if (others.length < 1) {
    throw new ChatError(400, 'INVALID_PARTICIPANTS', 'Add at least one other person to start a group chat.');
  } else {
    await assertEmployeesExist(ctx, others);
  }

  const created = await ctx.q(
    `INSERT INTO chat_conversations (type, name, description, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.type, input.type === 'group' ? input.name?.trim() || null : null, input.description?.trim() || null, ctx.meId]
  );
  const id = String(created.rows[0].id);

  await ctx.q(
    `INSERT INTO chat_participants (conversation_id, employee_id, role)
     SELECT $1, x.employee_id, CASE WHEN x.employee_id = $2 THEN 'owner' ELSE 'member' END
     FROM unnest($3::uuid[]) AS x(employee_id)
     ON CONFLICT DO NOTHING`,
    [id, ctx.meId, [ctx.meId, ...others]]
  );

  if (input.type === 'group') {
    await insertSystemMessage(ctx, id, input.type, `${ctx.meName} created the chat`);
  }

  emitToRooms(
    [ctx.meId, ...others].map((eid) => rooms.user(ctx.tenantKey, eid)),
    'conversation:updated',
    { conversationId: id }
  );
  return getConversation(ctx, id);
}

export async function updateConversation(
  ctx: ChatCtx,
  id: string,
  input: { name?: string; description?: string | null; isArchived?: boolean; muted?: boolean }
): Promise<ConversationDto> {
  const access = await requireAccess(ctx, id);

  if (input.muted !== undefined) {
    if (!access.my_role) throw new ChatError(403, 'FORBIDDEN', 'Only participants can mute a chat.');
    await ctx.q(`UPDATE chat_participants SET muted = $1 WHERE conversation_id = $2 AND employee_id = $3`, [
      input.muted,
      id,
      ctx.meId,
    ]);
  }

  const wantsChange = input.name !== undefined || input.description !== undefined || input.isArchived !== undefined;
  if (wantsChange) {
    const isManager = access.my_role === 'owner' || access.my_role === 'admin';
    if (access.type === 'direct' || access.type === 'hr_ticket') {
      throw new ChatError(400, 'NOT_EDITABLE', 'This chat cannot be renamed or archived.');
    }
    if (access.type === 'team_channel' && (input.name !== undefined || input.isArchived !== undefined)) {
      throw new ChatError(400, 'NOT_EDITABLE', 'Team channels follow the team name and cannot be renamed or archived.');
    }
    if (!isManager) throw new ChatError(403, 'FORBIDDEN', 'Only chat owners and admins can change chat details.');

    await ctx.q(
      `UPDATE chat_conversations SET
         name = COALESCE($2, name),
         description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         is_archived = COALESCE($5, is_archived),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        id,
        input.name?.trim() || null,
        input.description !== undefined,
        input.description?.trim() || null,
        input.isArchived ?? null,
      ]
    );

    if (input.name?.trim() && input.name.trim() !== access.name) {
      await insertSystemMessage(ctx, id, access.type, `${ctx.meName} renamed the chat to "${input.name.trim()}"`);
    }
    await broadcast(ctx, id, access.type, 'conversation:updated', { conversationId: id });
  }

  return getConversation(ctx, id);
}

export async function addParticipants(ctx: ChatCtx, id: string, employeeIds: string[]): Promise<ConversationDto> {
  const access = await requireAccess(ctx, id);
  if (access.type !== 'group') throw new ChatError(400, 'NOT_EDITABLE', 'People can only be added to group chats.');
  if (!access.my_role) throw new ChatError(403, 'FORBIDDEN', 'Only participants can add people.');

  const ids = Array.from(new Set(employeeIds));
  await assertEmployeesExist(ctx, ids);
  const inserted = await ctx.q(
    `INSERT INTO chat_participants (conversation_id, employee_id, role)
     SELECT $1, x.employee_id, 'member' FROM unnest($2::uuid[]) AS x(employee_id)
     ON CONFLICT DO NOTHING
     RETURNING employee_id`,
    [id, ids]
  );
  const added = inserted.rows.map((r: any) => String(r.employee_id));
  if (added.length) {
    const names = await employeeNames(ctx, added);
    await insertSystemMessage(ctx, id, access.type, `${ctx.meName} added ${added.map((a) => names.get(a)).join(', ')}`);
    await broadcast(ctx, id, access.type, 'conversation:updated', { conversationId: id });
  }
  return getConversation(ctx, id);
}

export async function removeParticipant(ctx: ChatCtx, id: string, employeeId: string): Promise<{ removed: boolean }> {
  const access = await requireAccess(ctx, id);
  if (access.type !== 'group') throw new ChatError(400, 'NOT_EDITABLE', 'People can only be removed from group chats.');

  const leaving = employeeId === ctx.meId;
  const isManager = access.my_role === 'owner' || access.my_role === 'admin';
  if (!leaving && !isManager) throw new ChatError(403, 'FORBIDDEN', 'Only chat owners and admins can remove people.');

  const targetRes = await ctx.q(
    `SELECT role FROM chat_participants WHERE conversation_id = $1 AND employee_id = $2`,
    [id, employeeId]
  );
  const target = targetRes.rows[0];
  if (!target) throw new ChatError(404, 'NOT_A_PARTICIPANT', 'That person is not in this chat.');
  if (!leaving && target.role === 'owner' && access.my_role !== 'owner') {
    throw new ChatError(403, 'FORBIDDEN', 'Admins cannot remove the chat owner.');
  }

  const roomsBefore = await conversationRooms(ctx, id, access.type);
  await ctx.q(`DELETE FROM chat_participants WHERE conversation_id = $1 AND employee_id = $2`, [id, employeeId]);

  if (target.role === 'owner') {
    await ctx.q(
      `UPDATE chat_participants SET role = 'owner'
       WHERE id = (SELECT id FROM chat_participants WHERE conversation_id = $1 ORDER BY joined_at ASC LIMIT 1)`,
      [id]
    );
  }

  const names = await employeeNames(ctx, [employeeId]);
  await insertSystemMessage(
    ctx,
    id,
    access.type,
    leaving ? `${ctx.meName} left the chat` : `${ctx.meName} removed ${names.get(employeeId)}`
  );
  emitToRooms(roomsBefore, 'conversation:updated', { conversationId: id });
  return { removed: true };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

async function fetchMessages(
  ctx: ChatCtx,
  where: { conversationId?: string; ids?: string[]; before?: string | null; limit?: number }
): Promise<MessageDto[]> {
  const params: any[] = [];
  const clauses: string[] = [];
  if (where.conversationId) {
    params.push(where.conversationId);
    clauses.push(`m.conversation_id = $${params.length}`);
  }
  if (where.ids) {
    params.push(where.ids);
    clauses.push(`m.id = ANY($${params.length}::uuid[])`);
  }
  if (where.before) {
    params.push(where.before);
    clauses.push(
      `(m.created_at, m.id) < (SELECT cm.created_at, cm.id FROM chat_messages cm WHERE cm.id = $${params.length}::uuid)`
    );
  }
  let limitSql = '';
  if (where.limit) {
    params.push(where.limit);
    limitSql = `LIMIT $${params.length}`;
  }

  const res = await ctx.q(
    `SELECT m.*, ${NAME_SQL('e')} AS sender_name, e.avatar_url AS sender_avatar,
            pm.body AS parent_body, pm.deleted_at AS parent_deleted_at, ${NAME_SQL('pe')} AS parent_sender_name,
            (SELECT COUNT(*)::int FROM chat_messages r WHERE r.parent_message_id = m.id AND r.deleted_at IS NULL) AS reply_count
     FROM chat_messages m
     LEFT JOIN employees e ON e.id = m.sender_id
     LEFT JOIN chat_messages pm ON pm.id = m.parent_message_id
     LEFT JOIN employees pe ON pe.id = pm.sender_id
     WHERE ${clauses.join(' AND ') || 'true'}
     ORDER BY m.created_at DESC, m.id DESC
     ${limitSql}`,
    params
  );

  const rows = res.rows;
  if (rows.length === 0) return [];
  const ids = rows.map((r: any) => r.id);

  const [attachmentsRes, reactionsRes, mentionsRes] = await Promise.all([
    ctx.q(`SELECT * FROM chat_attachments WHERE message_id = ANY($1::uuid[]) ORDER BY created_at ASC`, [ids]),
    ctx.q(
      `SELECT message_id, emoji, array_agg(employee_id::text ORDER BY created_at) AS employee_ids
       FROM chat_reactions WHERE message_id = ANY($1::uuid[])
       GROUP BY message_id, emoji
       ORDER BY MIN(created_at)`,
      [ids]
    ),
    ctx.q(
      `SELECT cm.message_id, cm.employee_id, ${NAME_SQL('e')} AS name
       FROM chat_mentions cm
       JOIN employees e ON e.id = cm.employee_id
       WHERE cm.message_id = ANY($1::uuid[])
       ORDER BY cm.created_at ASC`,
      [ids]
    ),
  ]);

  const group = (list: any[]) => {
    const map = new Map<string, any[]>();
    for (const item of list) {
      const key = String(item.message_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  };
  const attachmentsBy = group(attachmentsRes.rows);
  const reactionsBy = group(reactionsRes.rows);
  const mentionsBy = group(mentionsRes.rows);

  return rows
    .map((row: any) =>
      mapMessage(
        row,
        attachmentsBy.get(String(row.id)) || [],
        reactionsBy.get(String(row.id)) || [],
        mentionsBy.get(String(row.id)) || []
      )
    )
    .reverse();
}

async function getMessageOrThrow(ctx: ChatCtx, messageId: string): Promise<MessageDto> {
  const [message] = await fetchMessages(ctx, { ids: [messageId] });
  if (!message) throw new ChatError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
  return message;
}

export async function listMessages(
  ctx: ChatCtx,
  conversationId: string,
  opts: { before?: string | null; limit?: number }
): Promise<{ messages: MessageDto[]; hasMore: boolean }> {
  await requireAccess(ctx, conversationId);
  const limit = Math.min(Math.max(opts.limit || 30, 1), 100);
  const messages = await fetchMessages(ctx, { conversationId, before: opts.before || null, limit: limit + 1 });
  const hasMore = messages.length > limit;
  return { messages: hasMore ? messages.slice(1) : messages, hasMore };
}

async function insertSystemMessage(ctx: ChatCtx, conversationId: string, type: ConversationType, body: string) {
  const res = await ctx.q(
    `INSERT INTO chat_messages (conversation_id, sender_id, body, type) VALUES ($1, $2, $3, 'system') RETURNING id`,
    [conversationId, ctx.meId, body]
  );
  await ctx.q(
    `UPDATE chat_conversations
     SET last_message_at = (SELECT created_at FROM chat_messages WHERE id = $2), updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [conversationId, res.rows[0].id]
  );
  const message = await getMessageOrThrow(ctx, String(res.rows[0].id));
  await broadcast(ctx, conversationId, type, 'message:new', message);
  return message;
}

function assertAttachmentKeys(ctx: ChatCtx, attachments: AttachmentInput[]) {
  const prefix = `tenants/${ctx.storageTenant}/chat/`;
  for (const a of attachments) {
    if (!a.fileKey.startsWith(prefix)) {
      throw new ChatError(400, 'INVALID_ATTACHMENT', 'Attachments must be uploaded through the chat upload flow.');
    }
  }
}

export async function sendMessage(
  ctx: ChatCtx,
  conversationId: string,
  input: { body?: string; parentMessageId?: string | null; attachments?: AttachmentInput[]; clientId?: string }
): Promise<MessageDto & { clientId?: string }> {
  const access = await requireAccess(ctx, conversationId);
  const rawBody = (input.body || '').trim();
  const attachments = input.attachments || [];
  if (!rawBody && attachments.length === 0) throw new ChatError(400, 'EMPTY_MESSAGE', 'Write a message or attach a file.');
  assertAttachmentKeys(ctx, attachments);

  if (!access.my_role) {
    if (access.type === 'hr_ticket' && isHrRole(ctx.role)) {
      await ctx.q(
        `INSERT INTO chat_participants (conversation_id, employee_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
        [conversationId, ctx.meId]
      );
    } else {
      throw new ChatError(403, 'READ_ONLY', 'You can read this channel but are not a member of it.');
    }
  }
  if (access.type === 'hr_ticket' && access.ticket_status === 'closed') {
    throw new ChatError(409, 'TICKET_CLOSED', 'This HR request is closed. Start a new request instead.');
  }

  if (input.parentMessageId) {
    const parent = await ctx.q(`SELECT id FROM chat_messages WHERE id = $1 AND conversation_id = $2`, [
      input.parentMessageId,
      conversationId,
    ]);
    if (!parent.rows[0]) throw new ChatError(400, 'INVALID_PARENT', 'The message you replied to is not in this chat.');
  }

  const resolved = await resolveMentionBody(ctx, conversationId, rawBody);
  const body = resolved.body;

  const inserted = await ctx.q(
    `INSERT INTO chat_messages (conversation_id, sender_id, body, type, parent_message_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [conversationId, ctx.meId, body, body ? 'text' : 'file', input.parentMessageId || null]
  );
  const messageId = String(inserted.rows[0].id);
  await replaceMessageMentions(ctx, messageId, resolved.mentions);

  for (const a of attachments) {
    await ctx.q(
      `INSERT INTO chat_attachments (message_id, file_key, file_name, mime_type, size_bytes) VALUES ($1, $2, $3, $4, $5)`,
      [messageId, a.fileKey, a.fileName.slice(0, 255), a.mimeType || null, Math.max(0, Math.round(a.sizeBytes || 0))]
    );
  }

  await ctx.q(
    `UPDATE chat_conversations
     SET last_message_at = (SELECT created_at FROM chat_messages WHERE id = $2), is_archived = false, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [conversationId, messageId]
  );
  await ctx.q(
    `UPDATE chat_participants
     SET last_read_at = (SELECT created_at FROM chat_messages WHERE id = $3), last_read_message_id = $3
     WHERE conversation_id = $1 AND employee_id = $2`,
    [conversationId, ctx.meId, messageId]
  );

  if (access.type === 'hr_ticket' && access.ticket_status === 'resolved' && access.created_by === ctx.meId) {
    await ctx.q(`UPDATE chat_conversations SET ticket_status = 'open', resolved_at = NULL WHERE id = $1`, [conversationId]);
    await insertSystemMessage(ctx, conversationId, access.type, `${ctx.meName} reopened the request`);
    emitToRooms([rooms.hr(ctx.tenantKey)], 'ticket:updated', { conversationId });
  }

  const message = await getMessageOrThrow(ctx, messageId);
  const payload = { ...message, clientId: input.clientId };
  await broadcast(ctx, conversationId, access.type, 'message:new', payload);
  await announceMentions(ctx, conversationId, messageId, resolved.mentions, body);
  try {
    await announceChatMessage(
      ctx,
      conversationId,
      access,
      body,
      attachments.length > 0,
      resolved.mentions.map((mention) => mention.employeeId)
    );
  } catch (err) {
    log.warn('Could not notify chat participants', err);
  }
  return payload;
}

/** Inbox and desktop alerts for a direct message, group message, or HR reply. Mentions are notified separately. */
async function announceChatMessage(
  ctx: ChatCtx,
  conversationId: string,
  access: { type: ConversationType; name: string | null },
  body: string,
  hasAttachments: boolean,
  mentionedIds: string[]
) {
  if (access.type !== 'direct' && access.type !== 'group' && access.type !== 'hr_ticket') return;
  const participants = await ctx.q(
    `SELECT employee_id, muted FROM chat_participants WHERE conversation_id = $1 AND employee_id <> $2`,
    [conversationId, ctx.meId]
  );
  const mentioned = new Set(mentionedIds.map((id) => id.toLowerCase()));
  const ids = participants.rows
    .filter((row: any) => !row.muted && !mentioned.has(String(row.employee_id).toLowerCase()))
    .map((row: any) => String(row.employee_id));
  if (ids.length === 0) return;

  const preview =
    stripMentionTokens(body).replace(/\s+/g, ' ').trim().slice(0, 180) ||
    (hasAttachments ? 'Sent a file' : 'New message');
  const place =
    access.type === 'hr_ticket'
      ? access.name || 'an HR request'
      : access.name || 'a group';
  const title = access.type === 'direct' ? ctx.meName : `${ctx.meName} in ${place}`;
  await notify(ctx, ids, title, preview, `/chat?c=${conversationId}`, 'medium', 'Chat', `chat-${conversationId}`);
}

const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

async function requireOwnMessage(ctx: ChatCtx, messageId: string) {
  const res = await ctx.q(
    `SELECT m.id, m.conversation_id, m.sender_id, m.type, m.created_at, m.deleted_at, c.type AS conversation_type
     FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id
     WHERE m.id = $1`,
    [messageId]
  );
  const row = res.rows[0];
  if (!row) throw new ChatError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
  await requireAccess(ctx, String(row.conversation_id));
  if (String(row.sender_id) !== ctx.meId || row.type === 'system') {
    throw new ChatError(403, 'FORBIDDEN', 'You can only change your own messages.');
  }
  if (row.deleted_at) throw new ChatError(409, 'MESSAGE_DELETED', 'This message was already deleted.');
  return row;
}

export async function editMessage(ctx: ChatCtx, messageId: string, body: string): Promise<MessageDto> {
  const row = await requireOwnMessage(ctx, messageId);
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : NaN;
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > MESSAGE_EDIT_WINDOW_MS) {
    throw new ChatError(403, 'EDIT_WINDOW_EXPIRED', 'Messages can only be edited for 15 minutes after they are sent.');
  }
  const trimmed = body.trim();
  if (!trimmed) throw new ChatError(400, 'EMPTY_MESSAGE', 'A message cannot be empty.');
  const conversationId = String(row.conversation_id);
  const previous = await ctx.q(`SELECT employee_id FROM chat_mentions WHERE message_id = $1`, [messageId]);
  const previousIds = new Set(previous.rows.map((r: any) => String(r.employee_id).toLowerCase()));
  const resolved = await resolveMentionBody(ctx, conversationId, trimmed);
  await ctx.q(`UPDATE chat_messages SET body = $2, type = 'text', edited_at = CURRENT_TIMESTAMP WHERE id = $1`, [
    messageId,
    resolved.body,
  ]);
  await replaceMessageMentions(ctx, messageId, resolved.mentions);
  const message = await getMessageOrThrow(ctx, messageId);
  await broadcast(ctx, conversationId, row.conversation_type, 'message:updated', message);
  const fresh = resolved.mentions.filter((m) => !previousIds.has(m.employeeId.toLowerCase()));
  await announceMentions(ctx, conversationId, messageId, fresh, resolved.body);
  return message;
}

export async function deleteMessage(_ctx: ChatCtx, _messageId: string): Promise<MessageDto> {
  throw new ChatError(403, 'DELETE_DISABLED', 'Messages cannot be deleted.');
}

export async function setReaction(ctx: ChatCtx, messageId: string, emoji: string, add: boolean) {
  const res = await ctx.q(
    `SELECT m.conversation_id, m.deleted_at, c.type AS conversation_type
     FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id WHERE m.id = $1`,
    [messageId]
  );
  const row = res.rows[0];
  if (!row) throw new ChatError(404, 'MESSAGE_NOT_FOUND', 'Message not found.');
  const access = await requireAccess(ctx, String(row.conversation_id));
  if (!access.my_role) throw new ChatError(403, 'READ_ONLY', 'Only chat members can react.');
  if (row.deleted_at) throw new ChatError(409, 'MESSAGE_DELETED', 'You cannot react to a deleted message.');

  if (add) {
    await ctx.q(
      `INSERT INTO chat_reactions (message_id, employee_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [messageId, ctx.meId, emoji]
    );
  } else {
    await ctx.q(`DELETE FROM chat_reactions WHERE message_id = $1 AND employee_id = $2 AND emoji = $3`, [
      messageId,
      ctx.meId,
      emoji,
    ]);
  }

  const message = await getMessageOrThrow(ctx, messageId);
  const payload = { conversationId: message.conversationId, messageId, reactions: message.reactions };
  await broadcast(ctx, String(row.conversation_id), row.conversation_type, 'reaction:updated', payload);
  return payload;
}

export async function markRead(ctx: ChatCtx, conversationId: string) {
  const access = await requireAccess(ctx, conversationId);
  if (!access.my_role) return null;

  const updated = await ctx.q(
    `UPDATE chat_participants
     SET last_read_at = GREATEST(
           COALESCE(last_read_at, 'epoch'::timestamptz),
           COALESCE((SELECT MAX(created_at) FROM chat_messages WHERE conversation_id = $1), CURRENT_TIMESTAMP)
         ),
         last_read_message_id = COALESCE(
           (SELECT id FROM chat_messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1),
           last_read_message_id
         )
     WHERE conversation_id = $1 AND employee_id = $2
     RETURNING last_read_at, last_read_message_id`,
    [conversationId, ctx.meId]
  );
  const receipt = {
    conversationId,
    employeeId: ctx.meId,
    lastReadAt: iso(updated.rows[0]?.last_read_at),
    lastReadMessageId: updated.rows[0]?.last_read_message_id ? String(updated.rows[0].last_read_message_id) : null,
  };
  await broadcast(ctx, conversationId, access.type, 'read:receipt', receipt);
  return receipt;
}

export async function getAttachmentForDownload(ctx: ChatCtx, attachmentId: string) {
  const res = await ctx.q(
    `SELECT a.*, m.conversation_id, m.deleted_at FROM chat_attachments a
     JOIN chat_messages m ON m.id = a.message_id WHERE a.id = $1`,
    [attachmentId]
  );
  const row = res.rows[0];
  if (!row || row.deleted_at) throw new ChatError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.');
  await requireAccess(ctx, String(row.conversation_id));
  return { fileKey: row.file_key as string, fileName: row.file_name as string, mimeType: row.mime_type as string | null };
}

export async function searchPeople(ctx: ChatCtx, opts: { search?: string; hrOnly?: boolean; limit?: number }) {
  const params: any[] = [];
  const where = [`e.employment_status IN ('active', 'on_probation')`];
  if (opts.search?.trim()) {
    params.push(`%${opts.search.trim().toLowerCase()}%`);
    where.push(
      `(LOWER(e.first_name || ' ' || COALESCE(e.last_name, '')) LIKE $${params.length} OR LOWER(e.email) LIKE $${params.length})`
    );
  }
  if (opts.hrOnly) where.push(`e.role IN ('hr', 'hr_manager', 'super_admin', 'platform_admin')`);
  params.push(Math.min(Math.max(opts.limit || 50, 1), 200));

  const res = await ctx.q(
    `SELECT e.id, ${NAME_SQL('e')} AS name, e.email, e.avatar_url, e.role,
            d.name AS department_name, jr.title AS job_title
     FROM employees e
     LEFT JOIN departments d ON d.id = e.department_id
     LEFT JOIN job_roles jr ON jr.id = e.job_role_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.first_name ASC, e.last_name ASC
     LIMIT $${params.length}`,
    params
  );
  return res.rows.map((r: any) => ({
    id: String(r.id),
    name: r.name || r.email,
    email: r.email,
    avatarUrl: r.avatar_url || null,
    role: r.role,
    departmentName: r.department_name || null,
    jobTitle: r.job_title || null,
  }));
}

// ---------------------------------------------------------------------------
// HR tickets
// ---------------------------------------------------------------------------

async function notify(
  ctx: ChatCtx,
  recipientIds: string[],
  title: string,
  message: string,
  linkUrl: string,
  priority = 'medium',
  category = 'HR Desk',
  tag?: string
) {
  const ids = Array.from(new Set(recipientIds.filter((id) => id && id !== ctx.meId)));
  if (ids.length === 0) return;
  const inserted = await ctx.q(
    `INSERT INTO notifications (recipient_employee_id, title, message, category, priority, link_url)
     SELECT x.id, $2, $3, $4, $5, $6 FROM unnest($1::uuid[]) AS x(id)
     RETURNING id, recipient_employee_id, title, message, category, priority, link_url, created_at`,
    [ids, title, message, category, priority, linkUrl]
  );
  for (const row of inserted.rows) {
    const noticeId = String(row.id);
    emitUserNotification(ctx.tenantKey, String(row.recipient_employee_id), {
      id: noticeId,
      title: row.title,
      message: row.message,
      category: row.category || category,
      priority: row.priority || priority,
      linkUrl: row.link_url || linkUrl,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    });
    await sendPushToEmployees(ctx.q, [String(row.recipient_employee_id)], {
      title,
      body: message.slice(0, 180),
      url: linkUrl,
      tag: tag || `notice-${linkUrl}-${title}`,
      notificationId: noticeId,
    });
  }
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export async function createHrTicket(
  ctx: ChatCtx,
  input: {
    subject: string;
    category: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    body: string;
    attachments?: AttachmentInput[];
  }
): Promise<ConversationDto> {
  const created = await ctx.q(
    `INSERT INTO chat_conversations (type, name, created_by, ticket_status, ticket_category, ticket_priority)
     VALUES ('hr_ticket', $1, $2, 'open', $3, $4) RETURNING id`,
    [input.subject.trim(), ctx.meId, input.category, input.priority || 'medium']
  );
  const id = String(created.rows[0].id);
  await ctx.q(`INSERT INTO chat_participants (conversation_id, employee_id, role) VALUES ($1, $2, 'owner')`, [id, ctx.meId]);

  await sendMessage(ctx, id, { body: input.body, attachments: input.attachments });

  const hrRes = await ctx.q(
    `SELECT id FROM employees WHERE role IN ('hr', 'hr_manager', 'super_admin', 'platform_admin') AND employment_status IN ('active', 'on_probation')`
  );
  await notify(
    ctx,
    hrRes.rows.map((r: any) => String(r.id)),
    'New HR request',
    `${ctx.meName}: ${input.subject.trim()}`,
    `/chat?c=${id}`,
    input.priority === 'urgent' || input.priority === 'high' ? 'high' : 'medium'
  );

  emitToRooms([rooms.hr(ctx.tenantKey), rooms.user(ctx.tenantKey, ctx.meId)], 'ticket:updated', { conversationId: id });
  return getConversation(ctx, id);
}

export async function listHrTickets(
  ctx: ChatCtx,
  opts: { status?: TicketStatus; assigned?: 'me' | 'unassigned' | 'all' }
): Promise<ConversationDto[]> {
  return fetchConversations(ctx, {
    type: 'hr_ticket',
    includeArchived: true,
    ticketStatus: opts.status,
    assignedTo: opts.assigned === 'me' ? ctx.meId : undefined,
    unassigned: opts.assigned === 'unassigned',
  });
}

export async function updateHrTicket(
  ctx: ChatCtx,
  id: string,
  input: {
    status?: TicketStatus;
    assignedHrId?: string | null;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    category?: string;
  }
): Promise<ConversationDto> {
  if (!isHrRole(ctx.role)) throw new ChatError(403, 'FORBIDDEN', 'Only HR can update requests.');
  const access = await requireAccess(ctx, id);
  if (access.type !== 'hr_ticket') throw new ChatError(400, 'NOT_A_TICKET', 'This chat is not an HR request.');

  const currentRes = await ctx.q(
    `SELECT ticket_status, ticket_priority, ticket_category, assigned_hr_id, created_by, name FROM chat_conversations WHERE id = $1`,
    [id]
  );
  const current = currentRes.rows[0];
  const changes: string[] = [];
  const requesterId = current.created_by ? String(current.created_by) : null;

  if (input.assignedHrId !== undefined && (input.assignedHrId || null) !== (current.assigned_hr_id ? String(current.assigned_hr_id) : null)) {
    if (input.assignedHrId) {
      const hrCheck = await ctx.q(
        `SELECT id, ${NAME_SQL('e')} AS name, email FROM employees e
         WHERE id = $1 AND role IN ('hr', 'hr_manager', 'super_admin', 'platform_admin') AND employment_status IN ('active', 'on_probation')`,
        [input.assignedHrId]
      );
      const assignee = hrCheck.rows[0];
      if (!assignee) throw new ChatError(400, 'INVALID_ASSIGNEE', 'Requests can only be assigned to HR team members.');
      await ctx.q(
        `INSERT INTO chat_participants (conversation_id, employee_id, role) VALUES ($1, $2, 'admin')
         ON CONFLICT (conversation_id, employee_id) DO UPDATE SET role = 'admin'`,
        [id, input.assignedHrId]
      );
      await ctx.q(`UPDATE chat_conversations SET assigned_hr_id = $2 WHERE id = $1`, [id, input.assignedHrId]);
      const assigneeName = assignee.name || assignee.email;
      changes.push(input.assignedHrId === ctx.meId ? `${ctx.meName} picked up the request` : `${ctx.meName} assigned the request to ${assigneeName}`);
      if (input.assignedHrId !== ctx.meId) {
        await notify(ctx, [input.assignedHrId], 'HR request assigned to you', `"${current.name}"`, `/chat?c=${id}`);
      }
    } else {
      await ctx.q(`UPDATE chat_conversations SET assigned_hr_id = NULL WHERE id = $1`, [id]);
      changes.push(`${ctx.meName} unassigned the request`);
    }
    if (!current.ticket_status || current.ticket_status === 'open') {
      if (input.assignedHrId && !input.status) input.status = 'in_progress';
    }
  }

  if (input.status && input.status !== current.ticket_status) {
    await ctx.q(
      `UPDATE chat_conversations SET ticket_status = $2::text,
         resolved_at = CASE WHEN $2::text IN ('resolved', 'closed') THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END
       WHERE id = $1`,
      [id, input.status]
    );
    changes.push(`${ctx.meName} changed the status to ${STATUS_LABELS[input.status]}`);
  }
  if (input.priority && input.priority !== current.ticket_priority) {
    await ctx.q(`UPDATE chat_conversations SET ticket_priority = $2 WHERE id = $1`, [id, input.priority]);
    changes.push(`${ctx.meName} set the priority to ${input.priority}`);
  }
  if (input.category && input.category !== current.ticket_category) {
    await ctx.q(`UPDATE chat_conversations SET ticket_category = $2 WHERE id = $1`, [id, input.category]);
    changes.push(`${ctx.meName} moved the request to ${input.category}`);
  }

  if (changes.length) {
    await ctx.q(`UPDATE chat_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    for (const change of changes) {
      await insertSystemMessage(ctx, id, 'hr_ticket', change);
    }
    // Only notify the requester for meaningful status outcomes — not priority/category/meta churn.
    const statusBecameTerminal =
      Boolean(input.status) &&
      input.status !== current.ticket_status &&
      (input.status === 'resolved' || input.status === 'closed');
    if (requesterId && statusBecameTerminal) {
      await notify(
        ctx,
        [requesterId],
        'Update on your HR request',
        `"${current.name}" is now ${STATUS_LABELS[input.status as TicketStatus]}.`,
        `/chat?c=${id}`
      );
    }
    await broadcast(ctx, id, 'hr_ticket', 'ticket:updated', { conversationId: id });
  }

  return getConversation(ctx, id);
}
