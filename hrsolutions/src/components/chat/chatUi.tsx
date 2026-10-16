'use client';

import React from 'react';
import { Building2, Users } from 'lucide-react';
import { PresenceDot } from './PresenceDot';
import type { ChatConversation, TicketPriority, TicketStatus } from '@/services/chatTypes';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🙏'];

export const EMOJI_SET = [
  '😀', '😁', '😂', '🙂', '😉', '😊', '😍', '🤔', '😮', '😢', '😅', '😎',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '👀', '🤝', '✅', '❌', '⚡', '🔥',
  '🎉', '❤️', '💯', '⭐', '📌', '📎', '📅', '⏰', '☕', '🚀', '💡', '📝',
];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function ticketStatusClass(status: TicketStatus): string {
  switch (status) {
    case 'open':
      return 'bg-[#e7eef0] text-[#17324e] dark:bg-white/10 dark:text-slate-100';
    case 'in_progress':
      return 'bg-[#d8e8f2] text-[#17324e] dark:bg-sky-500/15 dark:text-sky-200';
    case 'resolved':
      return 'bg-[#eaf1ee] text-[#2f5d45] dark:bg-emerald-500/15 dark:text-emerald-200';
    case 'closed':
    default:
      return 'bg-[var(--bg-surface-subtle)] text-[var(--text-muted)]';
  }
}

export function initialsOf(name?: string | null): string {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function ChatAvatar({
  name,
  src,
  size = 32,
  online,
  square,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  online?: boolean;
  square?: boolean;
}) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className={`h-full w-full object-cover ${square ? 'rounded-[7px]' : 'rounded-full'}`}
        />
      ) : (
        <span
          aria-hidden
          className={`flex h-full w-full items-center justify-center bg-[#e7eef0] text-[#17324e] dark:bg-white/10 dark:text-slate-100 font-semibold ${
            square ? 'rounded-[7px]' : 'rounded-full'
          }`}
          style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
        >
          {initialsOf(name)}
        </span>
      )}
      {online !== undefined && (
        <PresenceDot online={online} className="absolute -bottom-0.5 -right-0.5" />
      )}
    </span>
  );
}

/** Department vs team channel avatar in the Teams rail and thread header. */
export function ChatChannelMark({
  conversation,
  className = '',
}: {
  conversation: Pick<ChatConversation, 'teamId'>;
  className?: string;
}) {
  const Icon = conversation.teamId ? Users : Building2;
  return (
    <span aria-hidden className={`chat-channel-mark ${className}`.trim()}>
      <Icon className="h-4 w-4" strokeWidth={2.25} />
    </span>
  );
}

export function formatClock(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatListTime(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return formatClock(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  const diffDays = (now.getTime() - date.getTime()) / 86_400_000;
  if (diffDays < 7) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function formatDayLabel(iso?: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}

export type ChatMediaKind = 'image' | 'video' | 'file';

export function chatMediaKind(mimeType?: string | null, fileName?: string | null): ChatMediaKind {
  const mime = (mimeType || '').toLowerCase();
  const name = (fileName || '').toLowerCase();
  if (mime.startsWith('image/') || /\.(avif|bmp|gif|heic|heif|jpe?g|png|svg|webp)$/i.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(m4v|mov|mp4|mpeg|ogv|webm)$/i.test(name)) return 'video';
  return 'file';
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/g;

/** Renders plain text with clickable links; never injects HTML. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#2d628e] dark:text-sky-300 underline underline-offset-2 break-all"
          >
            {part}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

export const buttonPrimary =
  'inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-[7px] bg-[#17324e] hover:bg-[#285275] text-white text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2] dark:focus-visible:ring-sky-500/40';

export const buttonSecondary =
  'inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] text-[13px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2] dark:focus-visible:ring-sky-500/40';

export const iconButton =
  'inline-flex items-center justify-center h-8 w-8 rounded-[7px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2] dark:focus-visible:ring-sky-500/40 disabled:opacity-40';

export const fieldClass =
  'w-full h-10 rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[#2d628e] focus:ring-2 focus:ring-[#d8e8f2] dark:focus:ring-sky-500/30';

export const labelClass = 'block text-[12px] font-bold text-[var(--text-secondary)] mb-1.5';
