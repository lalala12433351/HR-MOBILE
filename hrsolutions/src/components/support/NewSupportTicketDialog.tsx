'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { ChatDialogFrame } from '@/components/chat/NewChatDialog';
import { TICKET_PRIORITY_LABELS, buttonSecondary, chatMediaKind, fieldClass, formatBytes, iconButton, labelClass } from '@/components/chat/chatUi';
import { slideOverCancelClass, slideOverPrimaryClass } from '@/components/common/SlideOverDrawer';
import { api } from '@/services/apiClient';
import type { SupportPriority, SupportThread } from '@/services/supportTypes';
import { SUPPORT_CATEGORIES } from '@/services/supportTypes';
import { uploadSupportFiles } from './supportUi';

interface NewSupportTicketDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (thread: SupportThread) => void;
}

export function NewSupportTicketDialog({ open, onClose, onCreated }: NewSupportTicketDialogProps) {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<string>(SUPPORT_CATEGORIES[0]);
  const [priority, setPriority] = useState<SupportPriority>('medium');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [filePreviews, setFilePreviews] = useState<{ kind: ReturnType<typeof chatMediaKind>; url: string | null }[]>([]);

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
    if (!open) {
      setSubject('');
      setBody('');
      setFiles([]);
      setPriority('medium');
      setCategory(SUPPORT_CATEGORIES[0]);
      setError(null);
      setTouched(false);
    }
  }, [open]);

  if (!open) return null;

  const subjectError = touched && subject.trim().length < 3 ? 'Add a short subject (at least 3 characters).' : null;
  const bodyError = touched && !body.trim() && files.length === 0 ? 'Describe what you need, or attach a file.' : null;

  const submit = async () => {
    setTouched(true);
    if (subject.trim().length < 3 || (!body.trim() && files.length === 0)) return;
    setSaving(true);
    setError(null);
    try {
      const attachments = files.length ? await uploadSupportFiles(files, { kind: 'tenant' }) : undefined;
      const res = await api.support.createThread({
        subject: subject.trim(),
        body: body.trim(),
        category,
        priority,
        attachments,
      });
      if (!res.data) throw new Error(res.error?.message || 'Your request could not be sent.');
      onCreated(res.data);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Your request could not be sent. Your text is still here, so try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ChatDialogFrame
      title="Open a Pixbe support ticket"
      description="Pixbe Super Admin sees this in Master Admin, with your workspace name. Replies appear here and by email."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={slideOverCancelClass} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={slideOverPrimaryClass} disabled={saving} onClick={() => void submit()}>
            {saving ? 'Sending request…' : 'Send to Pixbe'}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <label htmlFor="support-subject" className={labelClass}>
            Subject
          </label>
          <input
            id="support-subject"
            autoFocus
            value={subject}
            maxLength={255}
            onChange={(event) => setSubject(event.target.value)}
            placeholder="For example, license seats are not updating"
            aria-invalid={!!subjectError}
            className={fieldClass}
          />
          {subjectError && <p className="mt-1 text-[12px] text-[#8b3133]">{subjectError}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="support-category" className={labelClass}>
              Topic
            </label>
            <select id="support-category" value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClass}>
              {SUPPORT_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="support-priority" className={labelClass}>
              How urgent is it?
            </label>
            <select
              id="support-priority"
              value={priority}
              onChange={(event) => setPriority(event.target.value as SupportPriority)}
              className={fieldClass}
            >
              {(Object.keys(TICKET_PRIORITY_LABELS) as SupportPriority[]).map((item) => (
                <option key={item} value={item}>
                  {TICKET_PRIORITY_LABELS[item]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="support-body" className={labelClass}>
            Details
          </label>
          <textarea
            id="support-body"
            value={body}
            rows={5}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Include screens, dates, or license details that help Pixbe answer quickly."
            aria-invalid={!!bodyError}
            className={`${fieldClass} h-auto py-2.5 leading-relaxed resize-y`}
          />
          {bodyError && <p className="mt-1 text-[12px] text-[#8b3133]">{bodyError}</p>}
        </div>

        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
            className="hidden"
            onChange={(event) => {
              const list = Array.from(event.target.files || []);
              setFiles((prev) => [...prev, ...list].slice(0, 10));
              event.target.value = '';
            }}
          />
          <button type="button" className={buttonSecondary} onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
            Attach images or files
          </button>
          {files.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Files to send">
              {files.map((file, index) => {
                const preview = filePreviews[index];
                return (
                  <li
                    key={`${file.name}-${index}`}
                    className="relative flex items-center gap-1.5 overflow-hidden rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-[12px]"
                  >
                    {preview?.url && preview.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview.url} alt="" className="h-14 w-14 object-cover" />
                    ) : preview?.url && preview.kind === 'video' ? (
                      <video src={preview.url} muted playsInline preload="metadata" className="h-14 w-14 object-cover" />
                    ) : null}
                    <span className="max-w-[180px] truncate py-1 pl-2 font-medium text-[var(--text-primary)]">{file.name}</span>
                    <span className="text-[var(--text-muted)]">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      className={`${iconButton} mr-1 h-5 w-5`}
                      onClick={() => setFiles((list) => list.filter((_, idx) => idx !== index))}
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-[8px] bg-[#faeeee] px-3 py-2 text-[12.5px] text-[#8b3133]">
            {error}
          </p>
        )}
      </div>
    </ChatDialogFrame>
  );
}
