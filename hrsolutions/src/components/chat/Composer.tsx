'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, SendHorizontal, Smile, X } from 'lucide-react';
import type { ChatMessage } from '@/services/chatTypes';
import { EMOJI_SET, chatMediaKind, formatBytes, iconButton, type ChatMediaKind } from './chatUi';

const MAX_FILES = 10;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

interface ComposerProps {
  conversationId: string;
  placeholder: string;
  disabledReason?: string | null;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  onSend: (input: { body: string; parentMessageId: string | null; files: File[] }) => void;
  onTyping: () => void;
}

export function Composer({
  conversationId,
  placeholder,
  disabledReason,
  replyTo,
  onCancelReply,
  onSend,
  onTyping,
}: ComposerProps) {
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drafts = useRef<Map<string, string>>(new Map());
  const currentId = useRef(conversationId);

  useEffect(() => {
    drafts.current.set(currentId.current, body);
    currentId.current = conversationId;
    setBody(drafts.current.get(conversationId) || '');
    setFiles([]);
    setFileError(null);
    setEmojiOpen(false);
    textRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (replyTo) textRef.current?.focus();
  }, [replyTo]);

  const [filePreviews, setFilePreviews] = useState<{ kind: ChatMediaKind; url: string | null }[]>([]);

  useEffect(() => {
    const next = files.map((file) => {
      const kind = chatMediaKind(file.type, file.name);
      return { kind, url: kind === 'file' ? null : URL.createObjectURL(file) };
    });
    setFilePreviews(next);
    return () => {
      for (const preview of next) {
        if (preview.url) URL.revokeObjectURL(preview.url);
      }
    };
  }, [files]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [body]);

  if (disabledReason) {
    return (
      <div className="chat-composer text-center text-[12.5px] text-[var(--text-secondary)]">
        {disabledReason}
      </div>
    );
  }

  const canSend = body.trim().length > 0 || files.length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend({ body: body.trim(), parentMessageId: replyTo?.id || null, files });
    setBody('');
    setFiles([]);
    setFileError(null);
    drafts.current.delete(conversationId);
    onCancelReply();
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setFileError(`"${tooBig.name}" is larger than 25 MB.`);
      return;
    }
    const next = [...files, ...incoming].slice(0, MAX_FILES);
    setFileError(files.length + incoming.length > MAX_FILES ? `You can attach up to ${MAX_FILES} files at a time.` : null);
    setFiles(next);
  };

  const insertEmoji = (emoji: string) => {
    const el = textRef.current;
    if (!el) {
      setBody((b) => b + emoji);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  return (
    <div
      className="chat-composer"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      }}
    >
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-[8px] border-l-[3px] border-[#2d628e]/60 bg-[var(--bg-surface-subtle)] px-3 py-1.5">
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold text-[var(--text-secondary)]">Replying to {replyTo.senderName || 'message'}</p>
            <p className="truncate text-[12px] text-[var(--text-muted)]">{replyTo.body || 'Attachment'}</p>
          </div>
          <button type="button" className={`${iconButton} h-6 w-6`} onClick={onCancelReply} aria-label="Cancel reply">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label="Files to send">
          {files.map((f, i) => {
            const preview = filePreviews[i];
            return (
              <li
                key={`${f.name}-${i}`}
                className="relative flex items-center gap-1.5 overflow-hidden rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-[12px]"
              >
                {preview?.url && preview.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt="" className="h-14 w-14 object-cover" />
                ) : preview?.url && preview.kind === 'video' ? (
                  <video src={preview.url} muted playsInline preload="metadata" className="h-14 w-14 object-cover" />
                ) : null}
                <span className="max-w-[180px] truncate py-1 pl-2 font-medium text-[var(--text-primary)]">{f.name}</span>
                <span className="text-[var(--text-muted)]">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((list) => list.filter((_, idx) => idx !== i))}
                  className={`${iconButton} mr-1 h-5 w-5`}
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {fileError && <p className="mb-2 text-[12px] text-[#8b3133] dark:text-red-300">{fileError}</p>}

      <div className="chat-composer-box relative">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <button type="button" className={iconButton} onClick={() => fileRef.current?.click()} aria-label="Attach files" title="Attach files">
          <Paperclip className="h-4 w-4" />
        </button>
        <div className="relative">
          <button
            type="button"
            className={iconButton}
            onClick={() => setEmojiOpen((v) => !v)}
            aria-label="Insert emoji"
            aria-expanded={emojiOpen}
            title="Emoji"
          >
            <Smile className="h-4 w-4" />
          </button>
          {emojiOpen && (
            <div
              className="absolute bottom-10 left-0 z-30 grid w-[264px] grid-cols-8 gap-0.5 rounded-[9px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-1.5 shadow-[0_9px_22px_rgba(26,58,84,.12)]"
              role="dialog"
              aria-label="Emoji picker"
              onKeyDown={(e) => e.key === 'Escape' && setEmojiOpen(false)}
            >
              {EMOJI_SET.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    insertEmoji(emoji);
                    setEmojiOpen(false);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-[6px] text-[17px] hover:bg-[var(--bg-surface-hover)]"
                  aria-label={`Insert ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="sr-only" htmlFor={`composer-${conversationId}`}>
          Message
        </label>
        <textarea
          id={`composer-${conversationId}`}
          ref={textRef}
          value={body}
          rows={1}
          placeholder={placeholder}
          onChange={(e) => {
            setBody(e.target.value);
            if (e.target.value.trim()) onTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape' && replyTo) onCancelReply();
          }}
          onPaste={(e) => {
            if (e.clipboardData.files.length > 0) {
              e.preventDefault();
              addFiles(e.clipboardData.files);
            }
          }}
          className="min-h-[32px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[13.5px] leading-[1.45] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[7px] bg-[#17324e] text-white transition-colors hover:bg-[#285275] disabled:bg-[var(--bg-surface-subtle)] disabled:text-[var(--text-muted)]"
          aria-label="Send message"
          title="Send (Enter)"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 hidden text-[10.5px] text-[var(--text-muted)] sm:block">Enter to send · Shift + Enter for a new line</p>
    </div>
  );
}
