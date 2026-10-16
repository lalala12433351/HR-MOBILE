import type { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { env } from '../../config/env.js';
import { resolveAuthContext } from '../../middleware/auth.middleware.js';
import { sanitizeSchemaName } from '../../db/queryRunner.js';
import { ensureChatTables } from '../../db/ensureChatTables.js';
import { log } from '../../utils/logger.js';
import { listOnline, markOffline, markOnline, rooms, setChatServer } from './chat.realtime.js';
import {
  ChatCtx,
  ChatError,
  canAccessConversation,
  isHrRole,
  markRead,
  resolveChatEmployee,
  withTenantClient,
} from './chat.service.js';

type SocketData = {
  tenantKey: string;
  storageTenant: string;
  employeeId: string;
  name: string;
  role: string;
  joined: Set<string>;
};

type Ack = (response: { ok: boolean; error?: string }) => void;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function withCtx<T>(data: SocketData, fn: (ctx: ChatCtx) => Promise<T>): Promise<T> {
  return withTenantClient(data.tenantKey, (q) =>
    fn({
      q,
      tenantKey: data.tenantKey,
      storageTenant: data.storageTenant,
      meId: data.employeeId,
      meName: data.name,
      role: data.role,
    })
  );
}

function safeAck(ack: unknown): Ack {
  return typeof ack === 'function' ? (ack as Ack) : () => {};
}

export function initChatSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: env.ALLOWED_ORIGINS === '*' ? true : env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
      credentials: true,
    },
  });
  setChatServer(io);

  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as any)?.token || (socket.handshake.query?.token as string | undefined);
      if (!token) {
        next(new Error('UNAUTHORIZED'));
        return;
      }
      const auth = await resolveAuthContext(String(token));
      const schema = sanitizeSchemaName(auth.dbSchema || auth.user.db_schema);
      await ensureChatTables(schema);
      const me = await withTenantClient(schema, (q) => resolveChatEmployee(q, auth.user.sub, auth.user.email));
      if (!me) {
        next(new Error('NO_EMPLOYEE_PROFILE'));
        return;
      }
      const data: SocketData = {
        tenantKey: schema,
        storageTenant: auth.tenantId || 'default',
        employeeId: me.id,
        name: me.name,
        role: auth.user.role,
        joined: new Set(),
      };
      socket.data = data;
      next();
    } catch (err: any) {
      next(new Error(err?.code || 'UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;
    const { tenantKey, employeeId } = data;

    socket.join(rooms.tenant(tenantKey));
    socket.join(rooms.user(tenantKey, employeeId));
    if (isHrRole(data.role)) socket.join(rooms.hr(tenantKey));

    if (markOnline(tenantKey, employeeId)) {
      socket.to(rooms.tenant(tenantKey)).emit('presence', { employeeId, online: true });
    }
    socket.emit('presence:snapshot', { online: listOnline(tenantKey) });

    socket.on('conversation:join', async (payload: { conversationId?: string }, ack: unknown) => {
      const reply = safeAck(ack);
      const conversationId = String(payload?.conversationId || '');
      if (!UUID_RE.test(conversationId)) {
        reply({ ok: false, error: 'INVALID_CONVERSATION' });
        return;
      }
      try {
        const allowed = await withCtx(data, (ctx) => canAccessConversation(ctx, conversationId));
        if (!allowed) {
          reply({ ok: false, error: 'FORBIDDEN' });
          return;
        }
        socket.join(rooms.conversation(tenantKey, conversationId));
        data.joined.add(conversationId);
        reply({ ok: true });
      } catch (err: any) {
        log.warn('Chat socket join failed', { error: err?.message });
        reply({ ok: false, error: 'JOIN_FAILED' });
      }
    });

    socket.on('conversation:leave', (payload: { conversationId?: string }) => {
      const conversationId = String(payload?.conversationId || '');
      if (!data.joined.has(conversationId)) return;
      socket.leave(rooms.conversation(tenantKey, conversationId));
      data.joined.delete(conversationId);
      socket.to(rooms.conversation(tenantKey, conversationId)).emit('typing', {
        conversationId,
        employeeId,
        name: data.name,
        isTyping: false,
      });
    });

    const relayTyping = (isTyping: boolean) => (payload: { conversationId?: string }) => {
      const conversationId = String(payload?.conversationId || '');
      if (!data.joined.has(conversationId)) return;
      socket.to(rooms.conversation(tenantKey, conversationId)).emit('typing', {
        conversationId,
        employeeId,
        name: data.name,
        isTyping,
      });
    };
    socket.on('typing:start', relayTyping(true));
    socket.on('typing:stop', relayTyping(false));

    socket.on('message:read', async (payload: { conversationId?: string }, ack: unknown) => {
      const reply = safeAck(ack);
      const conversationId = String(payload?.conversationId || '');
      if (!UUID_RE.test(conversationId)) {
        reply({ ok: false, error: 'INVALID_CONVERSATION' });
        return;
      }
      try {
        await withCtx(data, (ctx) => markRead(ctx, conversationId));
        reply({ ok: true });
      } catch (err: any) {
        reply({ ok: false, error: err instanceof ChatError ? err.code : 'READ_FAILED' });
      }
    });

    socket.on('disconnect', () => {
      for (const conversationId of data.joined) {
        socket.to(rooms.conversation(tenantKey, conversationId)).emit('typing', {
          conversationId,
          employeeId,
          name: data.name,
          isTyping: false,
        });
      }
      if (markOffline(tenantKey, employeeId)) {
        io.to(rooms.tenant(tenantKey)).emit('presence', { employeeId, online: false });
      }
    });
  });

  log.info('Chat realtime server attached (Socket.IO).');
  return io;
}
