'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { api, ApiClientError } from '@/services/apiClient';
import { connectChatSocket, disconnectChatSocket, getChatSocket, refreshChatSocketAuth } from '@/services/chatSocket';
import { showRealtimeToast } from '@/lib/sonnerToast';
import { showAppNotification } from '@/lib/native';
import type {
  ChatAttachment,
  ChatAttachmentInput,
  ChatConversation,
  ChatMe,
  ChatMessage,
  ChatPerson,
  TicketPriority,
  TicketStatus,
} from '@/services/chatTypes';
import { chatMediaKind } from '@/components/chat/chatUi';

const PAGE_SIZE = 40;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const TYPING_SEND_INTERVAL_MS = 2500;
const TYPING_IDLE_MS = 3000;
const TYPING_EXPIRE_MS = 6000;

export type MessageBucket = {
  items: ChatMessage[];
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  error?: string;
};

export type TypingUser = { employeeId: string; name: string };

export type HrTicketFilter = { status?: TicketStatus; assigned?: 'me' | 'unassigned' | 'all' };

type SendInput = { body?: string; parentMessageId?: string | null; files?: File[] };

interface ChatContextValue {
  enabled: boolean;
  ready: boolean;
  connected: boolean;
  unavailableReason: string | null;
  me: ChatMe | null;
  isHr: boolean;
  conversations: ChatConversation[];
  conversationsById: Record<string, ChatConversation>;
  messages: Record<string, MessageBucket>;
  typing: Record<string, TypingUser[]>;
  online: Set<string>;
  totalUnread: number;
  activeConversationId: string | null;
  hrTickets: ChatConversation[];
  hrTicketsLoading: boolean;
  refreshConversations: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  closeConversation: () => void;
  loadOlder: (id: string) => Promise<void>;
  sendMessage: (id: string, input: SendInput) => Promise<void>;
  retryMessage: (id: string, clientId: string) => Promise<void>;
  discardMessage: (id: string, clientId: string) => void;
  editMessage: (messageId: string, conversationId: string, body: string) => Promise<void>;
  toggleReaction: (message: ChatMessage, emoji: string) => Promise<void>;
  createConversation: (input: {
    type: 'group' | 'direct';
    participantIds: string[];
    name?: string;
  }) => Promise<ChatConversation>;
  updateConversation: (
    id: string,
    input: { name?: string; description?: string | null; isArchived?: boolean; muted?: boolean }
  ) => Promise<void>;
  addParticipants: (id: string, employeeIds: string[]) => Promise<void>;
  removeParticipant: (id: string, employeeId: string) => Promise<void>;
  createHrTicket: (input: {
    subject: string;
    category: string;
    priority?: TicketPriority;
    body: string;
    files?: File[];
  }) => Promise<ChatConversation>;
  loadHrTickets: (filter: HrTicketFilter) => Promise<void>;
  updateHrTicket: (
    id: string,
    input: { status?: TicketStatus; assignedHrId?: string | null; priority?: TicketPriority; category?: string }
  ) => Promise<void>;
  notifyTyping: (id: string) => void;
  stopTyping: (id: string) => void;
  searchPeople: (search: string, hrOnly?: boolean) => Promise<ChatPerson[]>;
  getAttachmentUrl: (attachmentId: string) => Promise<string>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

const HR_ROLES = new Set(['hr', 'hr_manager', 'super_admin', 'platform_admin']);

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function byCreatedAt(a: ChatMessage, b: ChatMessage): number {
  const ta = a.createdAt ? Date.parse(a.createdAt) : Number.MAX_SAFE_INTEGER;
  const tb = b.createdAt ? Date.parse(b.createdAt) : Number.MAX_SAFE_INTEGER;
  return ta - tb;
}

function revokeLocalPreviews(message: ChatMessage) {
  for (const attachment of message.attachments) {
    if (attachment.localPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(attachment.localPreviewUrl);
  }
}

function upsertMessage(items: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const existingIndex = items.findIndex(
    (m) => m.id === message.id || (!!message.clientId && m.clientId === message.clientId)
  );
  if (existingIndex >= 0) {
    const previous = items[existingIndex];
    if (previous?.status) revokeLocalPreviews(previous);
    const next = items.slice();
    next[existingIndex] = { ...message, status: undefined };
    return next.filter((m, i) => i === existingIndex || m.id !== message.id);
  }
  return [...items, message].sort(byCreatedAt);
}

function previewOf(message: ChatMessage): string {
  if (message.deletedAt) return 'Message deleted';
  if (message.body) return message.body;
  if (message.attachments.length) return `Sent ${message.attachments.length === 1 ? 'a file' : `${message.attachments.length} files`}`;
  return '';
}

export function conversationTitle(conversation: ChatConversation, meId?: string | null): string {
  if (conversation.type === 'direct') {
    const other = conversation.participants.find((p) => p.employeeId !== meId);
    return other?.name || 'Direct chat';
  }
  if (conversation.name) return conversation.name;
  if (conversation.type === 'group') {
    const names = conversation.participants.filter((p) => p.employeeId !== meId).map((p) => p.name.split(' ')[0]);
    return names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '') || 'Group chat';
  }
  return 'Conversation';
}

async function uploadFiles(files: File[]): Promise<ChatAttachmentInput[]> {
  const uploaded: ChatAttachmentInput[] = [];
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`"${file.name}" is larger than 25 MB. Share a smaller file or a link instead.`);
    }
    const presigned = await api.storage.getPresignedUploadUrl({
      module: 'chat',
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      fileSizeBytes: file.size,
    });
    const { uploadUrl, s3Key } = presigned.data as { uploadUrl: string; s3Key: string };
    await api.storage.uploadFileToS3(uploadUrl, file);
    uploaded.push({ fileKey: s3Key, fileName: file.name, mimeType: file.type || null, sizeBytes: file.size });
  }
  return uploaded;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { state, currentPersona } = useApp();
  const enabled = Boolean(state.isAuthenticated && currentPersona && currentPersona.role !== 'student');

  const [me, setMe] = useState<ChatMe | null>(null);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [conversationsById, setConversationsById] = useState<Record<string, ChatConversation>>({});
  const [messages, setMessages] = useState<Record<string, MessageBucket>>({});
  const [typingMap, setTypingMap] = useState<Record<string, Record<string, TypingUser>>>({});
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [hrTickets, setHrTickets] = useState<ChatConversation[]>([]);
  const [hrTicketsLoading, setHrTicketsLoading] = useState(false);

  const meRef = useRef<ChatMe | null>(null);
  const activeRef = useRef<string | null>(null);
  const conversationsRef = useRef<Record<string, ChatConversation>>({});
  const messagesRef = useRef<Record<string, MessageBucket>>({});
  const hrFilterRef = useRef<HrTicketFilter | null>(null);
  const pendingSends = useRef<Map<string, SendInput & { conversationId: string }>>(new Map());
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const typingOutbound = useRef<Map<string, { lastSent: number; idleTimer: ReturnType<typeof setTimeout> | null }>>(new Map());
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  meRef.current = me;
  activeRef.current = activeConversationId;
  conversationsRef.current = conversationsById;
  messagesRef.current = messages;

  const isHr = Boolean(me && HR_ROLES.has(me.role));

  const mergeConversation = useCallback((conversation: ChatConversation) => {
    setConversationsById((prev) => ({ ...prev, [conversation.id]: conversation }));
    setHrTickets((prev) => {
      const index = prev.findIndex((t) => t.id === conversation.id);
      if (index >= 0) return prev.map((t) => (t.id === conversation.id ? conversation : t));
      if (conversation.type === 'hr_ticket') return [conversation, ...prev];
      return prev;
    });
  }, []);

  const refreshConversations = useCallback(async () => {
    const res = await api.chat.listConversations({ includeArchived: true });
    const list = res.data || [];
    setConversationsById((prev) => {
      const next: Record<string, ChatConversation> = {};
      for (const conversation of list) next[conversation.id] = conversation;
      const active = activeRef.current;
      if (active && prev[active] && !next[active]) next[active] = prev[active];
      return next;
    });
  }, []);

  const refreshConversation = useCallback(
    async (id: string) => {
      try {
        const res = await api.chat.getConversation(id);
        if (res.data) mergeConversation(res.data);
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'CONVERSATION_NOT_FOUND') {
          setConversationsById((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
        }
      }
    },
    [mergeConversation]
  );

  const loadHrTickets = useCallback(async (filter: HrTicketFilter) => {
    hrFilterRef.current = filter;
    setHrTicketsLoading(true);
    try {
      const res = await api.chat.listHrTickets(filter);
      if (hrFilterRef.current === filter) setHrTickets(res.data || []);
    } finally {
      if (hrFilterRef.current === filter) setHrTicketsLoading(false);
    }
  }, []);

  const scheduleMarkRead = useCallback((id: string) => {
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const conversation = conversationsRef.current[id];
      if (conversation && !conversation.isParticipant) return;
      setConversationsById((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], unreadCount: 0 } } : prev));
      const socket = getChatSocket();
      if (socket.connected) socket.emit('message:read', { conversationId: id });
      else void api.chat.markRead(id).catch(() => {});
    }, 300);
  }, []);

  // ---------------------------------------------------------------------
  // Bootstrap: profile, conversations, socket
  // ---------------------------------------------------------------------

  useEffect(() => {
    if (!enabled) {
      setMe(null);
      setReady(false);
      setConversationsById({});
      setMessages({});
      disconnectChatSocket();
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await api.chat.me();
        if (cancelled) return;
        setMe(res.data || null);
        setUnavailableReason(null);
        await refreshConversations();
        if (cancelled) return;
        setReady(true);
        connectChatSocket();
      } catch (err) {
        if (cancelled) return;
        setUnavailableReason(errorMessage(err, 'Chat is unavailable right now.'));
        setReady(true);
      }
    })();

    const tokenWatch = window.setInterval(refreshChatSocketAuth, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(tokenWatch);
    };
  }, [enabled, refreshConversations]);

  useEffect(() => {
    if (!enabled || !me) return;
    const socket = getChatSocket();

    const onConnect = () => {
      setConnected(true);
      const active = activeRef.current;
      if (active) {
        socket.emit('conversation:join', { conversationId: active });
        void (async () => {
          const res = await api.chat.listMessages(active, { limit: PAGE_SIZE }).catch(() => null);
          if (!res?.data) return;
          setMessages((prev) => {
            const bucket = prev[active];
            let items = bucket?.items || [];
            for (const m of res.data!.messages) items = upsertMessage(items, m);
            return { ...prev, [active]: { items, hasMore: bucket?.hasMore ?? res.data!.hasMore, loading: false, loaded: true } };
          });
        })();
      }
      void refreshConversations().catch(() => {});
    };
    const onDisconnect = () => setConnected(false);

    const onMessageNew = (message: ChatMessage) => {
      const mine = message.senderId === meRef.current?.employeeId;
      const id = message.conversationId;
      const isActive = activeRef.current === id;
      const known = conversationsRef.current[id];

      setMessages((prev) => {
        const bucket = prev[id];
        if (!bucket?.loaded) return prev;
        return { ...prev, [id]: { ...bucket, items: upsertMessage(bucket.items, message) } };
      });

      if (!known) {
        void refreshConversation(id);
      } else {
        setConversationsById((prev) => {
          const current = prev[id];
          if (!current) return prev;
          return {
            ...prev,
            [id]: {
              ...current,
              isArchived: false,
              lastMessageAt: message.createdAt,
              lastMessage: {
                id: message.id,
                body: previewOf(message),
                type: message.type,
                senderId: message.senderId,
                senderName: message.senderName,
                createdAt: message.createdAt,
                isDeleted: !!message.deletedAt,
                hasAttachments: message.attachments.length > 0,
              },
              unreadCount: mine || (isActive && document.visibilityState === 'visible') || !current.isParticipant
                ? current.unreadCount
                : current.unreadCount + 1,
            },
          };
        });
      }

      if (mine) return;
      if (isActive && document.visibilityState === 'visible') {
        scheduleMarkRead(id);
        return;
      }
      if (message.type === 'system' || known?.muted || (known && !known.isParticipant)) return;

      const title = known ? conversationTitle(known, meRef.current?.employeeId) : 'New message';
      const toastTitle = known?.type === 'direct' ? title : `${message.senderName || 'Someone'} in ${title}`;
      const preview = previewOf(message).slice(0, 140);
      showRealtimeToast(
        {
          id: `chat-${message.id}`,
          type: 'message',
          title: toastTitle,
          message: preview,
          timestamp: message.createdAt || new Date().toISOString(),
          senderName: message.senderName || undefined,
          linkModule: 'chat',
        },
        () => router.push(`/chat?c=${encodeURIComponent(id)}`)
      );
      void showAppNotification({
        id: `chat:${message.id}`,
        title: toastTitle,
        body: preview,
        linkUrl: `/chat?c=${encodeURIComponent(id)}`,
      });
    };

    const onMessageChanged = (message: ChatMessage) => {
      setMessages((prev) => {
        const bucket = prev[message.conversationId];
        if (!bucket?.loaded) return prev;
        return {
          ...prev,
          [message.conversationId]: {
            ...bucket,
            items: bucket.items.map((m) => {
              if (m.id === message.id) return message;
              if (m.parentMessageId === message.id && m.parent) {
                return { ...m, parent: { ...m.parent, body: message.body, isDeleted: !!message.deletedAt } };
              }
              return m;
            }),
          },
        };
      });
      setConversationsById((prev) => {
        const current = prev[message.conversationId];
        if (!current?.lastMessage || current.lastMessage.id !== message.id) return prev;
        return {
          ...prev,
          [message.conversationId]: {
            ...current,
            lastMessage: { ...current.lastMessage, body: previewOf(message), isDeleted: !!message.deletedAt },
          },
        };
      });
    };

    const onReaction = (payload: { conversationId: string; messageId: string; reactions: ChatMessage['reactions'] }) => {
      setMessages((prev) => {
        const bucket = prev[payload.conversationId];
        if (!bucket?.loaded) return prev;
        return {
          ...prev,
          [payload.conversationId]: {
            ...bucket,
            items: bucket.items.map((m) => (m.id === payload.messageId ? { ...m, reactions: payload.reactions } : m)),
          },
        };
      });
    };

    const onReadReceipt = (receipt: {
      conversationId: string;
      employeeId: string;
      lastReadAt: string | null;
      lastReadMessageId: string | null;
    }) => {
      setConversationsById((prev) => {
        const current = prev[receipt.conversationId];
        if (!current) return prev;
        return {
          ...prev,
          [receipt.conversationId]: {
            ...current,
            unreadCount: receipt.employeeId === meRef.current?.employeeId ? 0 : current.unreadCount,
            participants: current.participants.map((p) =>
              p.employeeId === receipt.employeeId
                ? { ...p, lastReadAt: receipt.lastReadAt, lastReadMessageId: receipt.lastReadMessageId }
                : p
            ),
          },
        };
      });
    };

    const onConversationUpdated = ({ conversationId }: { conversationId: string }) => {
      void refreshConversation(conversationId);
    };

    const onTicketUpdated = ({ conversationId }: { conversationId: string }) => {
      void refreshConversation(conversationId);
      if (hrFilterRef.current) void loadHrTickets(hrFilterRef.current).catch(() => {});
    };

    const onTyping = (payload: { conversationId: string; employeeId: string; name: string; isTyping: boolean }) => {
      const key = `${payload.conversationId}|${payload.employeeId}`;
      const existing = typingTimers.current.get(key);
      if (existing) clearTimeout(existing);
      const remove = () =>
        setTypingMap((prev) => {
          const conv = { ...(prev[payload.conversationId] || {}) };
          delete conv[payload.employeeId];
          return { ...prev, [payload.conversationId]: conv };
        });
      if (!payload.isTyping) {
        typingTimers.current.delete(key);
        remove();
        return;
      }
      setTypingMap((prev) => ({
        ...prev,
        [payload.conversationId]: {
          ...(prev[payload.conversationId] || {}),
          [payload.employeeId]: { employeeId: payload.employeeId, name: payload.name },
        },
      }));
      typingTimers.current.set(
        key,
        setTimeout(() => {
          typingTimers.current.delete(key);
          remove();
        }, TYPING_EXPIRE_MS)
      );
    };

    const onPresence = ({ employeeId, online: isOnline }: { employeeId: string; online: boolean }) => {
      setOnline((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(employeeId);
        else next.delete(employeeId);
        return next;
      });
    };
    const onPresenceSnapshot = ({ online: ids }: { online: string[] }) => setOnline(new Set(ids));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message:new', onMessageNew);
    socket.on('message:updated', onMessageChanged);
    socket.on('message:deleted', onMessageChanged);
    socket.on('reaction:updated', onReaction);
    socket.on('read:receipt', onReadReceipt);
    socket.on('conversation:updated', onConversationUpdated);
    socket.on('ticket:updated', onTicketUpdated);
    socket.on('typing', onTyping);
    socket.on('presence', onPresence);
    socket.on('presence:snapshot', onPresenceSnapshot);
    if (socket.connected) setConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message:new', onMessageNew);
      socket.off('message:updated', onMessageChanged);
      socket.off('message:deleted', onMessageChanged);
      socket.off('reaction:updated', onReaction);
      socket.off('read:receipt', onReadReceipt);
      socket.off('conversation:updated', onConversationUpdated);
      socket.off('ticket:updated', onTicketUpdated);
      socket.off('typing', onTyping);
      socket.off('presence', onPresence);
      socket.off('presence:snapshot', onPresenceSnapshot);
    };
  }, [enabled, me, refreshConversation, refreshConversations, loadHrTickets, scheduleMarkRead, router]);

  useEffect(() => {
    const onVisible = () => {
      const active = activeRef.current;
      if (document.visibilityState === 'visible' && active && (conversationsRef.current[active]?.unreadCount || 0) > 0) {
        scheduleMarkRead(active);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [scheduleMarkRead]);

  useEffect(() => {
    const timers = typingTimers.current;
    const outbound = typingOutbound.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      outbound.forEach((o) => o.idleTimer && clearTimeout(o.idleTimer));
      if (readTimer.current) clearTimeout(readTimer.current);
    };
  }, []);

  // ---------------------------------------------------------------------
  // Conversation actions
  // ---------------------------------------------------------------------

  const loadInitialMessages = useCallback(async (id: string) => {
    setMessages((prev) => ({
      ...prev,
      [id]: { items: prev[id]?.items || [], hasMore: prev[id]?.hasMore ?? false, loading: true, loaded: !!prev[id]?.loaded },
    }));
    try {
      const res = await api.chat.listMessages(id, { limit: PAGE_SIZE });
      setMessages((prev) => {
        const optimistic = (prev[id]?.items || []).filter((m) => m.status);
        let items = res.data?.messages || [];
        for (const m of optimistic) items = upsertMessage(items, m);
        return { ...prev, [id]: { items, hasMore: !!res.data?.hasMore, loading: false, loaded: true } };
      });
    } catch (err) {
      setMessages((prev) => ({
        ...prev,
        [id]: {
          items: prev[id]?.items || [],
          hasMore: false,
          loading: false,
          loaded: false,
          error: errorMessage(err, 'Messages could not be loaded.'),
        },
      }));
    }
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      const previous = activeRef.current;
      const socket = getChatSocket();
      if (previous && previous !== id) {
        socket.emit('conversation:leave', { conversationId: previous });
      }
      setActiveConversationId(id);
      activeRef.current = id;
      if (socket.connected) socket.emit('conversation:join', { conversationId: id });
      if (!conversationsRef.current[id]) await refreshConversation(id);
      await loadInitialMessages(id);
      scheduleMarkRead(id);
    },
    [loadInitialMessages, refreshConversation, scheduleMarkRead]
  );

  const closeConversation = useCallback(() => {
    const previous = activeRef.current;
    if (previous) getChatSocket().emit('conversation:leave', { conversationId: previous });
    setActiveConversationId(null);
    activeRef.current = null;
  }, []);

  const loadOlder = useCallback(async (id: string) => {
    const current = messagesRef.current[id];
    if (!current || current.loading || !current.hasMore) return;
    const before = current.items.find((m) => !m.status)?.id;
    if (!before) return;
    messagesRef.current = { ...messagesRef.current, [id]: { ...current, loading: true } };
    setMessages((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], loading: true } } : prev));
    try {
      const res = await api.chat.listMessages(id, { before, limit: PAGE_SIZE });
      setMessages((prev) => {
        const bucket = prev[id];
        let items = bucket?.items || [];
        for (const m of res.data?.messages || []) items = upsertMessage(items, m);
        return { ...prev, [id]: { items, hasMore: !!res.data?.hasMore, loading: false, loaded: true } };
      });
    } catch (err) {
      setMessages((prev) => ({
        ...prev,
        [id]: { ...prev[id], loading: false, error: errorMessage(err, 'Older messages could not be loaded.') },
      }));
    }
  }, []);

  const deliver = useCallback(async (conversationId: string, clientId: string, input: SendInput) => {
    try {
      const attachments = input.files?.length ? await uploadFiles(input.files) : undefined;
      const res = await api.chat.sendMessage(conversationId, {
        body: input.body,
        parentMessageId: input.parentMessageId || null,
        attachments,
        clientId,
      });
      pendingSends.current.delete(clientId);
      if (res.data) {
        const message = res.data;
        setMessages((prev) => {
          const bucket = prev[conversationId];
          if (!bucket) return prev;
          return { ...prev, [conversationId]: { ...bucket, items: upsertMessage(bucket.items, message) } };
        });
      }
    } catch (err) {
      setMessages((prev) => {
        const bucket = prev[conversationId];
        if (!bucket) return prev;
        return {
          ...prev,
          [conversationId]: {
            ...bucket,
            items: bucket.items.map((m) => (m.clientId === clientId && m.status ? { ...m, status: 'failed' } : m)),
            error: errorMessage(err, 'Your message was not sent.'),
          },
        };
      });
    }
  }, []);

  const sendMessage = useCallback(
    async (conversationId: string, input: SendInput) => {
      const current = meRef.current;
      if (!current) return;
      const body = (input.body || '').trim();
      if (!body && !input.files?.length) return;
      const clientId = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const bucket = messagesRef.current[conversationId];
      const parent = input.parentMessageId ? bucket?.items.find((m) => m.id === input.parentMessageId) : null;

      const optimistic: ChatMessage = {
        id: `tmp-${clientId}`,
        clientId,
        status: 'sending',
        conversationId,
        senderId: current.employeeId,
        senderName: current.name,
        senderAvatar: null,
        body,
        type: body ? 'text' : 'file',
        parentMessageId: input.parentMessageId || null,
        parent: parent ? { id: parent.id, senderName: parent.senderName, body: parent.body, isDeleted: !!parent.deletedAt } : null,
        replyCount: 0,
        editedAt: null,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        attachments: (input.files || []).map((f, i) => {
          const attachment: ChatAttachment = {
            id: `tmp-${clientId}-${i}`,
            fileKey: '',
            fileName: f.name,
            mimeType: f.type || null,
            sizeBytes: f.size,
          };
          if (chatMediaKind(f.type, f.name) !== 'file') attachment.localPreviewUrl = URL.createObjectURL(f);
          return attachment;
        }),
        reactions: [],
      };

      pendingSends.current.set(clientId, { ...input, body, conversationId });
      setMessages((prev) => {
        const b = prev[conversationId] || { items: [], hasMore: false, loading: false, loaded: true };
        return { ...prev, [conversationId]: { ...b, error: undefined, items: [...b.items, optimistic] } };
      });
      stopTypingRef.current(conversationId);
      await deliver(conversationId, clientId, { ...input, body });
    },
    [deliver]
  );

  const retryMessage = useCallback(
    async (conversationId: string, clientId: string) => {
      const pending = pendingSends.current.get(clientId);
      if (!pending) return;
      setMessages((prev) => {
        const bucket = prev[conversationId];
        if (!bucket) return prev;
        return {
          ...prev,
          [conversationId]: {
            ...bucket,
            error: undefined,
            items: bucket.items.map((m) => (m.clientId === clientId ? { ...m, status: 'sending' } : m)),
          },
        };
      });
      await deliver(conversationId, clientId, pending);
    },
    [deliver]
  );

  const discardMessage = useCallback((conversationId: string, clientId: string) => {
    pendingSends.current.delete(clientId);
    setMessages((prev) => {
      const bucket = prev[conversationId];
      if (!bucket) return prev;
      const discarded = bucket.items.find((m) => m.clientId === clientId && m.status);
      if (discarded) revokeLocalPreviews(discarded);
      return {
        ...prev,
        [conversationId]: { ...bucket, error: undefined, items: bucket.items.filter((m) => m.clientId !== clientId || !m.status) },
      };
    });
  }, []);

  const editMessage = useCallback(async (messageId: string, conversationId: string, body: string) => {
    const res = await api.chat.editMessage(messageId, body);
    if (res.data) {
      const message = res.data;
      setMessages((prev) => {
        const bucket = prev[conversationId];
        if (!bucket) return prev;
        return { ...prev, [conversationId]: { ...bucket, items: bucket.items.map((m) => (m.id === messageId ? message : m)) } };
      });
    }
  }, []);

  const toggleReaction = useCallback(async (message: ChatMessage, emoji: string) => {
    const meId = meRef.current?.employeeId;
    if (!meId) return;
    const hasReacted = message.reactions.some((r) => r.emoji === emoji && r.employeeIds.includes(meId));
    const optimistic = hasReacted
      ? message.reactions
          .map((r) => (r.emoji === emoji ? { ...r, employeeIds: r.employeeIds.filter((id) => id !== meId) } : r))
          .filter((r) => r.employeeIds.length > 0)
      : message.reactions.some((r) => r.emoji === emoji)
      ? message.reactions.map((r) => (r.emoji === emoji ? { ...r, employeeIds: [...r.employeeIds, meId] } : r))
      : [...message.reactions, { emoji, employeeIds: [meId] }];

    const apply = (reactions: ChatMessage['reactions']) =>
      setMessages((prev) => {
        const bucket = prev[message.conversationId];
        if (!bucket) return prev;
        return {
          ...prev,
          [message.conversationId]: {
            ...bucket,
            items: bucket.items.map((m) => (m.id === message.id ? { ...m, reactions } : m)),
          },
        };
      });

    apply(optimistic);
    try {
      const res = hasReacted
        ? await api.chat.removeReaction(message.id, emoji)
        : await api.chat.addReaction(message.id, emoji);
      if (res.data) apply(res.data.reactions);
    } catch (err) {
      apply(message.reactions);
      throw err;
    }
  }, []);

  const createConversation = useCallback(
    async (input: { type: 'group' | 'direct'; participantIds: string[]; name?: string }) => {
      const res = await api.chat.createConversation(input);
      mergeConversation(res.data!);
      return res.data!;
    },
    [mergeConversation]
  );

  const updateConversation = useCallback(
    async (id: string, input: { name?: string; description?: string | null; isArchived?: boolean; muted?: boolean }) => {
      const res = await api.chat.updateConversation(id, input);
      if (res.data) mergeConversation(res.data);
    },
    [mergeConversation]
  );

  const addParticipants = useCallback(
    async (id: string, employeeIds: string[]) => {
      const res = await api.chat.addParticipants(id, employeeIds);
      if (res.data) mergeConversation(res.data);
    },
    [mergeConversation]
  );

  const removeParticipant = useCallback(
    async (id: string, employeeId: string) => {
      await api.chat.removeParticipant(id, employeeId);
      if (employeeId === meRef.current?.employeeId) {
        setConversationsById((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        if (activeRef.current === id) {
          setActiveConversationId(null);
          activeRef.current = null;
        }
      } else {
        await refreshConversation(id);
      }
    },
    [refreshConversation]
  );

  const createHrTicket = useCallback(
    async (input: { subject: string; category: string; priority?: TicketPriority; body: string; files?: File[] }) => {
      const attachments = input.files?.length ? await uploadFiles(input.files) : undefined;
      const res = await api.chat.createHrTicket({
        subject: input.subject,
        category: input.category,
        priority: input.priority,
        body: input.body,
        attachments,
      });
      mergeConversation(res.data!);
      return res.data!;
    },
    [mergeConversation]
  );

  const updateHrTicket = useCallback(
    async (
      id: string,
      input: { status?: TicketStatus; assignedHrId?: string | null; priority?: TicketPriority; category?: string }
    ) => {
      const res = await api.chat.updateHrTicket(id, input);
      if (res.data) mergeConversation(res.data);
    },
    [mergeConversation]
  );

  const stopTyping = useCallback((id: string) => {
    const entry = typingOutbound.current.get(id);
    if (!entry) return;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    typingOutbound.current.delete(id);
    const socket = getChatSocket();
    if (socket.connected) socket.emit('typing:stop', { conversationId: id });
  }, []);
  const stopTypingRef = useRef(stopTyping);
  stopTypingRef.current = stopTyping;

  const notifyTyping = useCallback(
    (id: string) => {
      const socket = getChatSocket();
      if (!socket.connected) return;
      const now = Date.now();
      const entry = typingOutbound.current.get(id) || { lastSent: 0, idleTimer: null };
      if (now - entry.lastSent > TYPING_SEND_INTERVAL_MS) {
        socket.emit('typing:start', { conversationId: id });
        entry.lastSent = now;
      }
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      entry.idleTimer = setTimeout(() => stopTyping(id), TYPING_IDLE_MS);
      typingOutbound.current.set(id, entry);
    },
    [stopTyping]
  );

  const searchPeople = useCallback(async (search: string, hrOnly?: boolean) => {
    const res = await api.chat.people({ search: search || undefined, hrOnly, limit: 50 });
    return res.data || [];
  }, []);

  const getAttachmentUrl = useCallback(async (attachmentId: string) => {
    const res = await api.chat.getAttachmentUrl(attachmentId);
    return res.data!.downloadUrl;
  }, []);

  // ---------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------

  const conversations = useMemo(
    () =>
      Object.values(conversationsById)
        .filter((c) => c.isParticipant)
        .sort((a, b) => Date.parse(b.lastMessageAt || '0') - Date.parse(a.lastMessageAt || '0')),
    [conversationsById]
  );

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.muted || c.isArchived ? 0 : c.unreadCount), 0),
    [conversations]
  );

  const typing = useMemo(() => {
    const result: Record<string, TypingUser[]> = {};
    for (const [conversationId, users] of Object.entries(typingMap)) {
      result[conversationId] = Object.values(users);
    }
    return result;
  }, [typingMap]);

  const value: ChatContextValue = {
    enabled,
    ready,
    connected,
    unavailableReason,
    me,
    isHr,
    conversations,
    conversationsById,
    messages,
    typing,
    online,
    totalUnread,
    activeConversationId,
    hrTickets,
    hrTicketsLoading,
    refreshConversations,
    openConversation,
    closeConversation,
    loadOlder,
    sendMessage,
    retryMessage,
    discardMessage,
    editMessage,
    toggleReaction,
    createConversation,
    updateConversation,
    addParticipants,
    removeParticipant,
    createHrTicket,
    loadHrTickets,
    updateHrTicket,
    notifyTyping,
    stopTyping,
    searchPeople,
    getAttachmentUrl,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used inside <ChatProvider>.');
  return ctx;
}

/** Safe variant for shared chrome (sidebar, bottom bar) that may render outside the provider. */
export function useChatUnread(): number {
  return useContext(ChatContext)?.totalUnread || 0;
}
