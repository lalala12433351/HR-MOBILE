import { Request, Response } from 'express';
import { ensureChatTables } from '../../db/ensureChatTables.js';
import { generatePresignedDownloadUrl } from '../../config/s3.js';
import { log } from '../../utils/logger.js';
import { listOnline } from './chat.realtime.js';
import { TICKET_CATEGORIES } from './chat.schema.js';
import {
  ChatCtx,
  ChatError,
  TenantQuery,
  addParticipants,
  createConversation,
  createHrTicket,
  deleteMessage,
  editMessage,
  getAttachmentForDownload,
  getConversation,
  listConversations,
  listHrTickets,
  listMessages,
  markRead,
  removeParticipant,
  resolveChatEmployee,
  searchPeople,
  sendMessage,
  setReaction,
  updateConversation,
  updateHrTicket,
} from './chat.service.js';

async function buildCtx(req: Request): Promise<ChatCtx> {
  const schema = req.dbSchema!;
  await ensureChatTables(schema);
  const q = req.tenantQuery as unknown as TenantQuery;
  const me = await resolveChatEmployee(q, req.user!.sub, req.user!.email);
  if (!me) {
    throw new ChatError(403, 'NO_EMPLOYEE_PROFILE', 'Chat is available to employees with a profile in this workspace.');
  }
  return {
    q,
    tenantKey: schema,
    storageTenant: req.tenantId || 'default',
    meId: me.id,
    meName: me.name,
    role: req.user!.role,
  };
}

function handle(fn: (ctx: ChatCtx, req: Request) => Promise<{ status?: number; data: unknown }>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const ctx = await buildCtx(req);
      const { status = 200, data } = await fn(ctx, req);
      res.status(status).json({ success: true, data });
    } catch (err: any) {
      if (err instanceof ChatError) {
        res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
        return;
      }
      log.error('Chat request failed', err);
      res.status(500).json({ success: false, error: { code: 'CHAT_ERROR', message: err?.message || 'Chat request failed' } });
    }
  };
}

export const getMe = handle(async (ctx) => ({
  data: { employeeId: ctx.meId, name: ctx.meName, role: ctx.role, ticketCategories: TICKET_CATEGORIES },
}));

export const getConversations = handle(async (ctx, req) => ({
  data: await listConversations(ctx, {
    type: req.query.type as any,
    includeArchived: req.query.includeArchived as unknown as boolean,
  }),
}));

export const getConversationById = handle(async (ctx, req) => ({
  data: await getConversation(ctx, req.params.id),
}));

export const postConversation = handle(async (ctx, req) => ({
  status: 201,
  data: await createConversation(ctx, req.body),
}));

export const patchConversation = handle(async (ctx, req) => ({
  data: await updateConversation(ctx, req.params.id, req.body),
}));

export const postParticipants = handle(async (ctx, req) => ({
  data: await addParticipants(ctx, req.params.id, req.body.employeeIds),
}));

export const deleteParticipant = handle(async (ctx, req) => ({
  data: await removeParticipant(ctx, req.params.id, req.params.employeeId),
}));

export const getMessages = handle(async (ctx, req) => ({
  data: await listMessages(ctx, req.params.id, {
    before: (req.query.before as string) || null,
    limit: req.query.limit as unknown as number,
  }),
}));

export const postMessage = handle(async (ctx, req) => ({
  status: 201,
  data: await sendMessage(ctx, req.params.id, req.body),
}));

export const patchMessage = handle(async (ctx, req) => ({
  data: await editMessage(ctx, req.params.id, req.body.body),
}));

export const removeMessage = handle(async (ctx, req) => ({
  data: await deleteMessage(ctx, req.params.id),
}));

export const postReaction = handle(async (ctx, req) => ({
  data: await setReaction(ctx, req.params.id, req.body.emoji, true),
}));

export const deleteReaction = handle(async (ctx, req) => ({
  data: await setReaction(ctx, req.params.id, decodeURIComponent(req.params.emoji), false),
}));

export const postRead = handle(async (ctx, req) => ({
  data: await markRead(ctx, req.params.id),
}));

export const getAttachmentUrl = handle(async (ctx, req) => {
  const attachment = await getAttachmentForDownload(ctx, req.params.id);
  let downloadUrl: string;
  try {
    downloadUrl = await generatePresignedDownloadUrl({ s3Key: attachment.fileKey });
  } catch (_) {
    downloadUrl = `http://localhost:8080/api/v1/storage/local-download-mock?key=${encodeURIComponent(attachment.fileKey)}`;
  }
  return { data: { ...attachment, downloadUrl } };
});

export const getPeople = handle(async (ctx, req) => ({
  data: await searchPeople(ctx, {
    search: req.query.search as string | undefined,
    hrOnly: req.query.hrOnly as unknown as boolean,
    limit: req.query.limit as unknown as number,
  }),
}));

export const getPresence = handle(async (ctx) => ({
  data: { online: listOnline(ctx.tenantKey) },
}));

export const postHrTicket = handle(async (ctx, req) => ({
  status: 201,
  data: await createHrTicket(ctx, req.body),
}));

export const getHrTickets = handle(async (ctx, req) => ({
  data: await listHrTickets(ctx, {
    status: req.query.status as any,
    assigned: req.query.assigned as any,
  }),
}));

export const patchHrTicket = handle(async (ctx, req) => ({
  data: await updateHrTicket(ctx, req.params.id, req.body),
}));
