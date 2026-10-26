'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ChatConversation, ChatMessage } from '@/services/chatTypes';
import type { MessageBucket, TypingUser } from '@/hooks/useChat';
import { MessageItem } from './MessageItem';
import { formatDayLabel } from './chatUi';

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 120;

interface MessageListProps {
  conversation: ChatConversation;
  bucket: MessageBucket | undefined;
  meId: string;
  canInteract: boolean;
  typing: TypingUser[];
  onLoadOlder: () => void;
  onReply: (message: ChatMessage) => void;
  onReact: (message: ChatMessage, emoji: string) => void;
  onEdit: (message: ChatMessage, body: string) => Promise<void>;
  onRetry: (message: ChatMessage) => void;
  onDiscard: (message: ChatMessage) => void;
  onOpenAttachment: (attachmentId: string) => void;
  onResolveAttachmentUrl: (attachmentId: string) => Promise<string>;
}

function dayKey(iso: string | null): string {
  return iso ? new Date(iso).toDateString() : '';
}

function typingLabel(users: TypingUser[]): string {
  const names = users.map((u) => u.name.split(' ')[0]);
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
}

export function MessageList({
  conversation,
  bucket,
  meId,
  canInteract,
  typing,
  onLoadOlder,
  ...handlers
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prevScrollHeight = useRef(0);
  const prevFirstId = useRef<string | null>(null);
  const prevLastId = useRef<string | null>(null);

  const items = useMemo(() => bucket?.items || [], [bucket?.items]);

  const participantsById = useMemo(
    () => new Map(conversation.participants.map((p) => [p.employeeId, p])),
    [conversation.participants]
  );

  const seenBy = useMemo(() => {
    if (conversation.type === 'team_channel') return null;
    const lastOwn = [...items].reverse().find((m) => m.senderId === meId && !m.status && m.type !== 'system');
    if (!lastOwn?.createdAt) return null;
    const sentAt = Date.parse(lastOwn.createdAt);
    const readers = conversation.participants.filter(
      (p) => p.employeeId !== meId && p.lastReadAt && Date.parse(p.lastReadAt) >= sentAt
    );
    if (readers.length === 0) return null;
    const label =
      conversation.type === 'direct'
        ? 'Seen'
        : `Seen by ${readers
            .slice(0, 3)
            .map((r) => r.name.split(' ')[0])
            .join(', ')}${readers.length > 3 ? ` +${readers.length - 3}` : ''}`;
    return { messageId: lastOwn.id, label };
  }, [items, conversation.participants, conversation.type, meId]);

  const jumpTo = useCallback((messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-[#d8e8f2]');
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-[#d8e8f2]'), 1400);
  }, []);

  useEffect(() => {
    nearBottomRef.current = true;
    prevFirstId.current = null;
    prevLastId.current = null;
  }, [conversation.id]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstId = items[0]?.id || null;
    const last = items[items.length - 1];
    const lastId = last?.id || null;

    if (prevFirstId.current && firstId !== prevFirstId.current && prevLastId.current === lastId) {
      // Older page was prepended: keep the reader's position.
      el.scrollTop = el.scrollHeight - prevScrollHeight.current + el.scrollTop;
    } else if (lastId !== prevLastId.current) {
      const ownNewMessage = last?.senderId === meId;
      if (nearBottomRef.current || ownNewMessage || !prevLastId.current) {
        el.scrollTop = el.scrollHeight;
      }
    }
    prevFirstId.current = firstId;
    prevLastId.current = lastId;
    prevScrollHeight.current = el.scrollHeight;
  }, [items, meId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current && typing.length > 0) el.scrollTop = el.scrollHeight;
  }, [typing.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    prevScrollHeight.current = el.scrollHeight;
    if (el.scrollTop < 80 && bucket?.hasMore && !bucket.loading) onLoadOlder();
  };

  if (!bucket || (!bucket.loaded && bucket.loading)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2d628e] border-t-transparent" aria-label="Loading messages" />
      </div>
    );
  }

  if (!bucket.loaded && bucket.error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-[13px] text-[#8b3133] dark:text-red-300">
        {bucket.error}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="chat-message-log min-h-0 flex-1 overflow-y-auto custom-scrollbar pb-3"
      role="log"
      aria-live="polite"
      aria-label="Messages"
    >
      <div className="chat-message-history">
        {bucket.hasMore ? (
          <div className="flex justify-center py-3">
            <button
              type="button"
              disabled={bucket.loading}
              onClick={onLoadOlder}
              className="rounded-full px-3 py-1 text-[12px] font-semibold text-[#2d628e] dark:text-sky-300 hover:bg-[var(--bg-surface-hover)] disabled:opacity-60"
            >
              {bucket.loading ? 'Loading earlier messages…' : 'Load earlier messages'}
            </button>
          </div>
        ) : (
          <div className="chat-conversation-start px-4 py-3 text-center">
            <p className="text-[12px] text-[var(--text-muted)]">
              {conversation.type === 'hr_ticket' ? 'Your request was shared privately with HR.' : 'This is the start of the conversation.'}
            </p>
            {conversation.description && (
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">{conversation.description}</p>
            )}
          </div>
        )}

        {items.map((message, index) => {
          const prev = items[index - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
          const compact =
            !newDay &&
            !!prev &&
            prev.type !== 'system' &&
            message.type !== 'system' &&
            prev.senderId === message.senderId &&
            !message.parentMessageId &&
            !!prev.createdAt &&
            !!message.createdAt &&
            Date.parse(message.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;

          return (
            <React.Fragment key={message.clientId && message.status ? message.clientId : message.id}>
              {newDay && (
                <div className="chat-day-divider flex items-center gap-3 px-4 pt-4 pb-1" role="separator">
                  <span className="h-px flex-1 bg-[var(--border-color)]" />
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">{formatDayLabel(message.createdAt)}</span>
                  <span className="h-px flex-1 bg-[var(--border-color)]" />
                </div>
              )}
              <MessageItem
                message={message}
                meId={meId}
                compact={compact}
                canInteract={canInteract}
                participantsById={participantsById}
                onJumpTo={jumpTo}
                {...handlers}
              />
              {seenBy?.messageId === message.id && (
                <p className="px-4 pl-[60px] pt-0.5 text-[11px] text-[var(--text-muted)]">{seenBy.label}</p>
              )}
            </React.Fragment>
          );
        })}

        {bucket.error && bucket.loaded && (
          <p className="px-4 pt-2 text-[12px] text-[#8b3133] dark:text-red-300">{bucket.error}</p>
        )}

        <div className="h-5 px-4 pl-[60px] pt-1 text-[11.5px] italic text-[var(--text-muted)]" aria-live="polite">
          {typing.length > 0 ? typingLabel(typing) : ''}
        </div>
      </div>
    </div>
  );
}
