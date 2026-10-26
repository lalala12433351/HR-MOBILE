import type { Server } from 'socket.io';

let io: Server | null = null;

export function setChatServer(server: Server): void {
  io = server;
}

export function getChatServer(): Server | null {
  return io;
}

export const rooms = {
  tenant: (tenantKey: string) => `tenant:${tenantKey}`,
  user: (tenantKey: string, employeeId: string) => `tenant:${tenantKey}:user:${employeeId}`,
  conversation: (tenantKey: string, conversationId: string) => `tenant:${tenantKey}:conv:${conversationId}`,
  hr: (tenantKey: string) => `tenant:${tenantKey}:hr`,
};

/** Socket.IO delivers once per socket even when it sits in several of the target rooms. */
export function emitToRooms(targets: string[], event: string, payload: unknown): void {
  if (!io || targets.length === 0) return;
  io.to(Array.from(new Set(targets))).emit(event, payload);
}

export type LiveNotice = {
  id: string;
  title: string;
  message: string;
  category: string;
  priority: string;
  linkUrl: string;
  createdAt: string;
};

export function emitUserNotification(tenantKey: string, employeeId: string, notice: LiveNotice): void {
  emitToRooms([rooms.user(tenantKey, employeeId)], 'notification:new', notice);
}

const onlineCounts = new Map<string, number>();

function presenceKey(tenantKey: string, employeeId: string): string {
  return `${tenantKey}|${employeeId}`;
}

/** Returns true when this connection brought the employee online. */
export function markOnline(tenantKey: string, employeeId: string): boolean {
  const key = presenceKey(tenantKey, employeeId);
  const next = (onlineCounts.get(key) || 0) + 1;
  onlineCounts.set(key, next);
  return next === 1;
}

/** Returns true when this disconnect took the employee offline. */
export function markOffline(tenantKey: string, employeeId: string): boolean {
  const key = presenceKey(tenantKey, employeeId);
  const next = (onlineCounts.get(key) || 0) - 1;
  if (next <= 0) {
    onlineCounts.delete(key);
    return true;
  }
  onlineCounts.set(key, next);
  return false;
}

export function listOnline(tenantKey: string): string[] {
  const prefix = `${tenantKey}|`;
  const ids: string[] = [];
  for (const key of onlineCounts.keys()) {
    if (key.startsWith(prefix)) ids.push(key.slice(prefix.length));
  }
  return ids;
}
