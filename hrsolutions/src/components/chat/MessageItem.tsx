'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, Pencil, Reply, SmilePlus } from 'lucide-react';
import type { ChatMessage, ChatParticipant } from '@/services/chatTypes';
import {
  ChatAvatar,
  QUICK_REACTIONS,
  RichText,
  buttonPrimary,
  buttonSecondary,
  chatMediaKind,
  formatBytes,
  formatClock,
  mentionPlainText,
} from './chatUi';
import type { ChatAttachment } from '@/services/chatTypes';

interface MessageItemProps {
  message: ChatMessage;
  meId: string;
  compact: boolean;
  canInteract: boolean;
  participantsById: Map<string, ChatParticipant>;
  onReply: (message: ChatMessage) => void;
  onReact: (message: ChatMessage, emoji: string) => void;
  onEdit: (message: ChatMessage, body: string) => Promise<void>;
  onRetry: (message: ChatMessage) => void;
  onDiscard: (message: ChatMessage) => void;
  onOpenAttachment: (attachmentId: string) => void;
  onResolveAttachmentUrl: (attachmentId: string) => Promise<string>;
  onJumpTo: (messageId: string) => void;
}

export function MessageItem({
  message,
  meId,
  compact,
  canInteract,
  participantsById,
  onReply,
  onReact,
  onEdit,
  onRetry,
  onDiscard,
  onOpenAttachment,
  onResolveAttachmentUrl,
  onJumpTo,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [withinEditWindow, setWithinEditWindow] = useState(() => isWithinEditWindow(message.createdAt));

  const mine = message.senderId === meId;
  const deleted = !!message.deletedAt;
  const pending = !!message.status;

  useEffect(() => {
    if (editing) {
      const el = editRef.current;
      el?.focus();
      el?.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  useEffect(() => {
    const remaining = editWindowRemainingMs(message.createdAt);
    if (remaining <= 0) {
      setWithinEditWindow(false);
      setEditing(false);
      return;
    }
    setWithinEditWindow(true);
    const timer = window.setTimeout(() => {
      setWithinEditWindow(false);
      setEditing(false);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [message.createdAt]);

  if (message.type === 'system') {
    return (
      <div className="flex justify-center px-4 py-1.5" id={`msg-${message.id}`}>
        <p className="chat-system-message max-w-[80%] rounded-full bg-[var(--bg-surface-subtle)] px-3 py-1 text-center text-[11.5px] text-[var(--text-secondary)]">
          {message.body}
          <span className="ml-1.5 text-[var(--text-muted)]">{formatClock(message.createdAt)}</span>
        </p>
      </div>
    );
  }

  const saveEdit = async () => {
    const body = draft.trim();
    if (!body || body === message.body) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await onEdit(message, body);
      setEditing(false);
    } catch (err: any) {
      setActionError(err?.message || 'The message could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const reactionNames = (ids: string[]) =>
    ids.map((id) => (id === meId ? 'You' : participantsById.get(id)?.name || 'Someone')).join(', ');

  return (
    <div
      id={`msg-${message.id}`}
      className={`chat-message-row group relative flex gap-3 px-4 ${compact ? 'pt-0.5 pb-0.5' : 'pt-3 pb-0.5'} hover:bg-[var(--bg-surface-subtle)]/70 transition-colors`}
      onMouseLeave={() => setPickerOpen(false)}
    >
      <div className="w-8 shrink-0">
        {!compact && <ChatAvatar name={message.senderName} src={message.senderAvatar} size={32} />}
        {compact && (
          <span className="invisible block pt-1 text-right text-[10px] text-[var(--text-muted)] group-hover:visible">
            {formatClock(message.createdAt)}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="chat-message-byline flex items-baseline gap-2">
            <span className="text-[13px] font-bold text-[var(--text-primary)]">{mine ? 'You' : message.senderName || 'Former employee'}</span>
            <span className="text-[11px] text-[var(--text-muted)]">{formatClock(message.createdAt)}</span>
          </div>
        )}

        {message.parent && (
          <button
            type="button"
            onClick={() => onJumpTo(message.parent!.id)}
            className="chat-message-quote mt-1 mb-1 block max-w-full rounded-[7px] border-l-[3px] border-[#2d628e]/60 bg-[var(--bg-surface-subtle)] px-2.5 py-1 text-left hover:bg-[var(--bg-surface-hover)]"
          >
            <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">
              Replying to {message.parent.senderName || 'a message'}
            </span>
            <span className="block truncate text-[12px] text-[var(--text-muted)]">
              {message.parent.isDeleted ? 'Message deleted' : message.parent.body ? mentionPlainText(message.parent.body) : 'Attachment'}
            </span>
          </button>
        )}

        {editing ? (
          <div className="mt-1">
            <label className="sr-only" htmlFor={`edit-${message.id}`}>
              Edit message
            </label>
            <textarea
              id={`edit-${message.id}`}
              ref={editRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void saveEdit();
                }
                if (e.key === 'Escape') {
                  setEditing(false);
                  setDraft(message.body);
                }
              }}
              rows={Math.min(6, Math.max(2, draft.split('\n').length))}
              className="w-full resize-none rounded-[7px] border border-[#2d628e] bg-[var(--bg-surface)] px-3 py-2 text-[13.5px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#d8e8f2] dark:focus:ring-sky-500/30"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <button type="button" className={buttonPrimary} disabled={busy || !draft.trim()} onClick={() => void saveEdit()}>
                Save changes
              </button>
              <button
                type="button"
                className={buttonSecondary}
                onClick={() => {
                  setEditing(false);
                  setDraft(message.body);
                }}
              >
                Cancel
              </button>
              <span className="text-[11px] text-[var(--text-muted)]">Enter to save, Esc to cancel</span>
            </div>
          </div>
        ) : deleted ? (
          <p className="text-[13px] italic text-[var(--text-muted)]">This message was deleted.</p>
        ) : (
          message.body && (
            <p className={`chat-message-text whitespace-pre-wrap break-words text-[13.5px] leading-[1.55] ${pending ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
              <RichText text={message.body} />
              {message.editedAt && <span className="ml-1 text-[11px] text-[var(--text-muted)]">(edited)</span>}
            </p>
          )
        )}

        {!deleted && message.attachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <AttachmentTile
                key={a.id}
                attachment={a}
                pending={pending}
                onOpen={() => onOpenAttachment(a.id)}
                resolveUrl={onResolveAttachmentUrl}
              />
            ))}
          </div>
        )}

        {message.status === 'failed' && (
          <p className="mt-1 flex items-center gap-2 text-[12px] text-[#8b3133] dark:text-red-300">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            Not sent.
            <button type="button" className="font-semibold underline" onClick={() => onRetry(message)}>
              Try again
            </button>
            <button type="button" className="font-semibold underline" onClick={() => onDiscard(message)}>
              Discard
            </button>
          </p>
        )}
        {message.status === 'sending' && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Sending…</p>}

        {!deleted && message.reactions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {message.reactions.map((r) => {
              const reacted = r.employeeIds.includes(meId);
              return (
                <button
                  key={r.emoji}
                  type="button"
                  disabled={!canInteract}
                  onClick={() => onReact(message, r.emoji)}
                  title={reactionNames(r.employeeIds)}
                  aria-pressed={reacted}
                  aria-label={`${r.emoji} ${r.employeeIds.length}, reacted by ${reactionNames(r.employeeIds)}`}
                  className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[12px] transition-colors ${
                    reacted
                      ? 'border-[#2d628e]/60 bg-[#f8fbfe] text-[#17324e] dark:bg-sky-500/15 dark:text-sky-100'
                      : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-semibold">{r.employeeIds.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {actionError && <p className="mt-1 text-[12px] text-[#8b3133] dark:text-red-300">{actionError}</p>}
      </div>

      {canInteract && !deleted && !pending && !editing && (
        <div className="absolute -top-3 right-4 hidden items-center gap-0.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-0.5 shadow-[0_5px_15px_rgba(26,46,62,.08)] group-hover:flex group-focus-within:flex">
          {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(message, emoji)}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[14px] hover:bg-[var(--bg-surface-hover)]"
              aria-label={`React with ${emoji}`}
            >
              {emoji}
            </button>
          ))}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
              aria-label="More reactions"
              aria-expanded={pickerOpen}
            >
              <SmilePlus className="h-4 w-4" />
            </button>
            {pickerOpen && (
              <div className="absolute right-0 top-8 z-20 flex gap-0.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-1 shadow-[0_9px_22px_rgba(26,58,84,.12)]">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact(message, emoji);
                      setPickerOpen(false);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[16px] hover:bg-[var(--bg-surface-hover)]"
                    aria-label={`React with ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onReply(message)}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
            aria-label="Reply"
            title="Reply"
          >
            <Reply className="h-4 w-4" />
          </button>
          {mine && message.body && withinEditWindow && (
            <button
              type="button"
              onClick={() => {
                setDraft(message.body);
                setEditing(true);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
              aria-label="Edit message"
              title="Edit for 15 minutes after sending"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

function editWindowRemainingMs(createdAt: string | null): number {
  if (!createdAt) return 0;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return 0;
  return MESSAGE_EDIT_WINDOW_MS - (Date.now() - created);
}

function isWithinEditWindow(createdAt: string | null): boolean {
  return editWindowRemainingMs(createdAt) > 0;
}

const previewUrlCache = new Map<string, string>();

function AttachmentTile({
  attachment,
  pending,
  onOpen,
  resolveUrl,
}: {
  attachment: ChatAttachment;
  pending: boolean;
  onOpen: () => void;
  resolveUrl: (attachmentId: string) => Promise<string>;
}) {
  const kind = chatMediaKind(attachment.mimeType, attachment.fileName);
  const [src, setSrc] = useState(attachment.localPreviewUrl || '');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (attachment.localPreviewUrl) {
      setSrc(attachment.localPreviewUrl);
      return;
    }
    if (kind === 'file' || pending) {
      setSrc('');
      return;
    }
    const cached = previewUrlCache.get(attachment.id);
    if (cached) {
      setSrc(cached);
      return;
    }
    let cancelled = false;
    resolveUrl(attachment.id)
      .then((url) => {
        if (cancelled) return;
        previewUrlCache.set(attachment.id, url);
        setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.id, attachment.localPreviewUrl, kind, pending, resolveUrl]);

  if (kind === 'file' || failed) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={onOpen}
        className="chat-file-attachment flex max-w-full items-center gap-2.5 rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-left hover:border-[#2d628e]/50 hover:bg-[var(--bg-surface-hover)] disabled:cursor-wait"
        title={`Download ${attachment.fileName}`}
      >
        <FileText className="h-6 w-6 shrink-0 text-[#2d628e] dark:text-sky-300" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{attachment.fileName}</span>
          <span className="block text-[11px] text-[var(--text-muted)]">
            {pending ? 'Uploading…' : [attachment.fileName.split('.').pop()?.toUpperCase(), formatBytes(attachment.sizeBytes)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="chat-file-download">Download</span>
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
        disabled={pending}
        onClick={onOpen}
        className={`block max-w-[min(100%,280px)] overflow-hidden rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-left ${pending ? 'cursor-wait opacity-70' : 'hover:border-[#2d628e]/50'}`}
        title={pending ? `Uploading ${attachment.fileName}` : `Open ${attachment.fileName}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={attachment.fileName}
          className="max-h-[240px] w-full object-cover"
          onError={() => setFailed(true)}
        />
      </button>
    );
  }

  return (
    <div className={`max-w-[min(100%,320px)] overflow-hidden rounded-[8px] border border-[var(--border-color)] bg-black ${pending ? 'opacity-70' : ''}`}>
      <video
        src={src}
        controls={!pending}
        preload="metadata"
        className="max-h-[240px] w-full bg-black"
        onError={() => setFailed(true)}
        aria-label={attachment.fileName}
      />
      {!pending && (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full truncate bg-[var(--bg-surface)] px-2.5 py-1 text-left text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
        >
          Open {attachment.fileName}
        </button>
      )}
    </div>
  );
}
