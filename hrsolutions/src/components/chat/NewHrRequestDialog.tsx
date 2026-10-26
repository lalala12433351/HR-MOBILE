'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import type { ChatConversation, TicketPriority } from '@/services/chatTypes';
import { ChatDialogFrame } from './NewChatDialog';
import { TICKET_PRIORITY_LABELS, buttonSecondary, fieldClass, formatBytes, iconButton, labelClass } from './chatUi';
import { slideOverCancelClass, slideOverPrimaryClass } from '@/components/common/SlideOverDrawer';

interface NewHrRequestDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversation: ChatConversation) => void;
}

export function NewHrRequestDialog({ open, onClose, onCreated }: NewHrRequestDialogProps) {
  const { me, createHrTicket } = useChat();
  const categories = me?.ticketCategories?.length ? me.ticketCategories : ['General'];
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setSubject('');
      setBody('');
      setFiles([]);
      setPriority('medium');
      setError(null);
      setTouched(false);
    }
  }, [open]);

  if (!open) return null;

  const subjectError = touched && subject.trim().length < 3 ? 'Add a short subject (at least 3 characters).' : null;
  const bodyError = touched && !body.trim() ? 'Describe what you need so HR can help.' : null;

  const submit = async () => {
    setTouched(true);
    if (subject.trim().length < 3 || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const conversation = await createHrTicket({
        subject: subject.trim(),
        category,
        priority,
        body: body.trim(),
        files,
      });
      onCreated(conversation);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Your request could not be sent. Your text is still here, so try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ChatDialogFrame
      title="Ask HR a question"
      description="Only you and the HR team can see this request. You will get a notification when HR replies."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={slideOverCancelClass} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={slideOverPrimaryClass} disabled={saving} onClick={() => void submit()}>
            {saving ? 'Sending request…' : 'Send to HR'}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div>
          <label htmlFor="hr-subject" className={labelClass}>
            Subject
          </label>
          <input
            id="hr-subject"
            autoFocus
            value={subject}
            maxLength={255}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="For example, March payslip is missing"
            aria-invalid={!!subjectError}
            className={fieldClass}
          />
          {subjectError && <p className="mt-1 text-[12px] text-[#8b3133] dark:text-red-300">{subjectError}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="hr-category" className={labelClass}>
              Topic
            </label>
            <select id="hr-category" value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="hr-priority" className={labelClass}>
              How urgent is it?
            </label>
            <select
              id="hr-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className={fieldClass}
            >
              {(Object.keys(TICKET_PRIORITY_LABELS) as TicketPriority[]).map((p) => (
                <option key={p} value={p}>
                  {TICKET_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="hr-body" className={labelClass}>
            What do you need?
          </label>
          <textarea
            id="hr-body"
            value={body}
            rows={5}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Include dates, amounts or document names that help HR answer quickly."
            aria-invalid={!!bodyError}
            className={`${fieldClass} h-auto py-2.5 leading-relaxed resize-y`}
          />
          {bodyError && <p className="mt-1 text-[12px] text-[#8b3133] dark:text-red-300">{bodyError}</p>}
        </div>

        <div>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              setFiles((prev) => [...prev, ...list].slice(0, 10));
              e.target.value = '';
            }}
          />
          <button type="button" className={buttonSecondary} onClick={() => fileRef.current?.click()}>
            <Paperclip className="h-4 w-4" />
            Attach file
          </button>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-[12px]">
                  <span className="truncate font-medium text-[var(--text-primary)]">{f.name}</span>
                  <span className="text-[var(--text-muted)]">{formatBytes(f.size)}</span>
                  <button
                    type="button"
                    className={`${iconButton} h-6 w-6`}
                    onClick={() => setFiles((list) => list.filter((_, idx) => idx !== i))}
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-[8px] bg-[#faeeee] dark:bg-red-500/10 px-3 py-2 text-[12.5px] text-[#8b3133] dark:text-red-200">
            {error}
          </p>
        )}
      </div>
    </ChatDialogFrame>
  );
}
