'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import {
  ChatAvatar,
  RichText,
  chatMediaKind,
  formatBytes,
  formatClock,
  formatDayLabel,
} from '@/components/chat/chatUi';
import type { SupportAttachment, SupportAuthorKind, SupportMessage } from '@/services/supportTypes';

const GROUP_WINDOW_MS = 5 * 60 * 1000;
const NEAR_BOTTOM_PX = 120;

function SupportAttachmentTile({
  attachment,
  onOpen,
  resolveUrl,
}: {
  attachment: SupportAttachment;
  onOpen: () => void;
  resolveUrl: (attachmentId: string) => Promise<string>;
}) {
  const kind = chatMediaKind(attachment.mimeType, attachment.fileName);
  const [src, setSrc] = useState(attachment.downloadUrl || '');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (attachment.downloadUrl) {
      setSrc(attachment.downloadUrl);
      return;
    }
    if (kind === 'file') {
      setSrc('');
      return;
    }
    let cancelled = false;
    resolveUrl(attachment.id)
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.downloadUrl, attachment.id, kind, resolveUrl]);

  if (kind === 'file' || failed) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex max-w-[280px] items-center gap-2.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-left hover:border-[#2d628e]/50 hover:bg-[var(--bg-surface-hover)]"
        title={`Open ${attachment.fileName}`}
      >
        <FileText className="h-4 w-4 shrink-0 text-[#2d628e] dark:text-sky-300" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{attachment.fileName}</span>
          <span className="block text-[11px] text-[var(--text-muted)]">{formatBytes(attachment.sizeBytes || 0) || 'File'}</span>
        </span>
      </button>
    );
  }

  if (!src) {
    return (
      <div
        className="h-[160px] w-[220px] animate-pulse rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]"
        aria-label={`Loading ${attachment.fileName}`}
      />
    );
  }

  if (kind === 'image') {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="block max-w-[min(100%,280px)] overflow-hidden rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-left hover:border-[#2d628e]/50"
        title={`Open ${attachment.fileName}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={attachment.fileName} className="max-h-[240px] w-full object-cover" onError={() => setFailed(true)} />
      </button>
    );
  }

  return (
    <div className="max-w-[min(100%,320px)] overflow-hidden rounded-[8px] border border-[var(--border-color)] bg-black">
      <video src={src} controls preload="metadata" className="max-h-[240px] w-full bg-black" onError={() => setFailed(true)} aria-label={attachment.fileName} />
      <button
        type="button"
        onClick={onOpen}
        className="block w-full truncate bg-[var(--bg-surface)] px-2.5 py-1 text-left text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
      >
        Open {attachment.fileName}
      </button>
    </div>
  );
}

function dayKey(iso: string | null): string {
  return iso ? new Date(iso).toDateString() : '';
}

export function SupportMessageList({
  messages,
  mineKind,
  resolveUrl,
  emptyCopy,
}: {
  messages: SupportMessage[];
  mineKind: SupportAuthorKind;
  resolveUrl: (id: string) => Promise<string>;
  emptyCopy?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prevLastId = useRef<string | null>(null);
  const threadKey = messages[0]?.threadId || 'empty';

  const items = useMemo(() => messages, [messages]);

  useEffect(() => {
    nearBottomRef.current = true;
    prevLastId.current = null;
  }, [threadKey]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = items[items.length - 1];
    const lastId = last?.id || null;
    if (lastId !== prevLastId.current) {
      const ownNew = last?.authorKind === mineKind;
      if (nearBottomRef.current || ownNew || !prevLastId.current) {
        el.scrollTop = el.scrollHeight;
      }
    }
    prevLastId.current = lastId;
  }, [items, mineKind]);

  const openAttachment = async (attachmentId: string) => {
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const url = await resolveUrl(attachmentId);
      if (win) win.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      win?.close();
    }
  };

  return (
    <div
      ref={scrollRef}
      onScroll={() => {
        const el = scrollRef.current;
        if (!el) return;
        nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
      }}
      className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pb-3"
      role="log"
      aria-live="polite"
      aria-label="Messages"
    >
      <div className="px-6 pt-8 pb-4 text-center">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">
          {emptyCopy || 'Your ticket was shared privately with Pixbe Super Admin.'}
        </p>
      </div>

      {items.map((message, index) => {
        const prev = items[index - 1];
        const newDay = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
        const compact =
          !newDay &&
          !!prev &&
          prev.authorKind === message.authorKind &&
          prev.authorName === message.authorName &&
          !!prev.createdAt &&
          !!message.createdAt &&
          Date.parse(message.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;
        const mine = message.authorKind === mineKind;
        const displayName = mine ? 'You' : message.authorName || (message.authorKind === 'support' ? 'Pixbe Support' : 'You');

        return (
          <React.Fragment key={message.id}>
            {newDay && (
              <div className="flex items-center gap-3 px-4 pt-4 pb-1" role="separator">
                <span className="h-px flex-1 bg-[var(--border-color)]" />
                <span className="text-[11px] font-semibold text-[var(--text-muted)]">{formatDayLabel(message.createdAt)}</span>
                <span className="h-px flex-1 bg-[var(--border-color)]" />
              </div>
            )}
            <div className={`group relative flex gap-3 px-4 ${compact ? 'pt-0.5 pb-0.5' : 'pt-3 pb-0.5'} hover:bg-[var(--bg-surface-subtle)]/70 transition-colors`}>
              <div className="w-8 shrink-0">
                {!compact && <ChatAvatar name={displayName === 'You' ? message.authorName || 'You' : displayName} size={32} square={message.authorKind === 'support'} />}
                {compact && (
                  <span className="invisible block pt-1 text-right text-[10px] text-[var(--text-muted)] group-hover:visible">
                    {formatClock(message.createdAt)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                {!compact && (
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-bold text-[var(--text-primary)]">{displayName}</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{formatClock(message.createdAt)}</span>
                  </div>
                )}
                {message.body ? (
                  <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.55] text-[var(--text-primary)]">
                    <RichText text={message.body} />
                  </p>
                ) : null}
                {(message.attachments || []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(message.attachments || []).map((attachment) => (
                      <SupportAttachmentTile
                        key={attachment.id}
                        attachment={attachment}
                        onOpen={() => void openAttachment(attachment.id)}
                        resolveUrl={resolveUrl}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
