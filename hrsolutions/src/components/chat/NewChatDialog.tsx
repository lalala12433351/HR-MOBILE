'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import type { ChatPerson } from '@/services/chatTypes';
import { ChatAvatar, fieldClass, iconButton, labelClass } from './chatUi';
import {
  SlideOverDrawer,
  slideOverCancelClass,
  slideOverPrimaryClass,
} from '@/components/common/SlideOverDrawer';

interface NewChatDialogProps {
  open: boolean;
  mode: 'new' | 'add';
  excludeIds?: string[];
  onClose: () => void;
  onSubmit: (input: { participantIds: string[]; name?: string }) => Promise<void>;
}

export function ChatDialogFrame({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = document.getElementById(titleId)?.closest<HTMLElement>('[role="dialog"]');
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex="0"]') || []).filter((el) => el.getClientRects().length > 0);
    if (dialog && !dialog.contains(document.activeElement)) focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.removeEventListener('keydown', trapFocus); previousFocus?.focus(); };
  }, [titleId]);

  return (
    <SlideOverDrawer title={title} onClose={onClose} footer={footer} zClass="chat-dialog-overlay z-[80]" panelClassName="chat-drawer" labelledBy={titleId}>
      {description && <p className="chat-drawer-description">{description}</p>}
      {children}
    </SlideOverDrawer>
  );
}

export function NewChatDialog({ open, mode, excludeIds = [], onClose, onSubmit }: NewChatDialogProps) {
  const { searchPeople, me, online } = useChat();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatPerson[]>([]);
  const [selected, setSelected] = useState<ChatPerson[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected([]);
      setName('');
      setError(null);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchPeople(query)
        .then((people) => {
          if (requestId.current === id) setResults(people);
        })
        .catch((err: Error) => {
          if (requestId.current === id) setError(err.message || 'People could not be loaded.');
        })
        .finally(() => {
          if (requestId.current === id) setLoading(false);
        });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, query, searchPeople]);

  if (!open) return null;

  const excluded = new Set([...(excludeIds || []), me?.employeeId || '']);
  const visible = results.filter((p) => !excluded.has(p.id));
  const isSelected = (id: string) => selected.some((p) => p.id === id);
  const toggle = (person: ChatPerson) =>
    setSelected((list) => (list.some((p) => p.id === person.id) ? list.filter((p) => p.id !== person.id) : [...list, person]));

  const isGroup = mode === 'new' && selected.length > 1;
  const submitLabel =
    mode === 'add'
      ? `Add ${selected.length || ''} ${selected.length === 1 ? 'person' : 'people'}`.replace('  ', ' ')
      : isGroup
      ? 'Start group chat'
      : 'Start chat';

  const submit = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ participantIds: selected.map((p) => p.id), name: isGroup ? name.trim() || undefined : undefined });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'The chat could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ChatDialogFrame
      title={mode === 'add' ? 'Add people to this chat' : 'Start a new chat'}
      description={
        mode === 'add'
          ? 'They will see the full chat history.'
          : 'Pick one person for a private chat, or several to start a group.'
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" className={slideOverCancelClass} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={slideOverPrimaryClass} disabled={selected.length === 0 || saving} onClick={() => void submit()}>
            {saving ? 'Working…' : submitLabel}
          </button>
        </>
      }
    >
      {isGroup && (
        <div className="mb-3">
          <label className={labelClass} htmlFor="new-chat-name">
            Group name (optional)
          </label>
          <input
            id="new-chat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="For example, Q3 launch crew"
            maxLength={255}
            className={fieldClass}
          />
        </div>
      )}

      <label className="relative block">
        <span className="sr-only">Search people</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className={`${fieldClass} pl-9`}
        />
      </label>

      {selected.length > 0 && (
        <ul className="my-3 flex flex-wrap gap-1.5" aria-label="Selected people">
          {selected.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5 rounded-full border border-[#d8e8f2] bg-[#f8fbfe] dark:bg-white/5 dark:border-white/10 py-0.5 pl-1 pr-1.5 text-[12px]">
              <span className="font-semibold text-[var(--text-primary)]">{p.name}</span>
              <button type="button" onClick={() => toggle(p)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]" aria-label={`Remove ${p.name}`}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-[12px] text-[#8b3133] dark:text-red-300">{error}</p>}

      <ul className="mt-2 space-y-0.5" aria-label="People">
        {loading && visible.length === 0 && <li className="py-6 text-center text-[12px] text-[var(--text-muted)]">Searching…</li>}
        {!loading && visible.length === 0 && (
          <li className="py-6 text-center text-[12px] text-[var(--text-muted)]">No one matches that search.</li>
        )}
        {visible.map((person) => {
          const checked = isSelected(person.id);
          return (
            <li key={person.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => toggle(person)}
                className={`flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left transition-colors ${
                  checked ? 'bg-[#f8fbfe] dark:bg-white/5 ring-1 ring-[#d8e8f2] dark:ring-white/10' : 'hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <ChatAvatar name={person.name} src={person.avatarUrl} size={34} online={online.has(person.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{person.name}</span>
                  <span className="block truncate text-[11.5px] text-[var(--text-muted)]">
                    {[person.jobTitle, person.departmentName].filter(Boolean).join(' · ') || person.email}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`flex h-5 w-5 items-center justify-center rounded-[5px] border ${
                    checked ? 'border-[#17324e] bg-[#17324e] text-white' : 'border-[var(--border-color)]'
                  }`}
                >
                  {checked && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </ChatDialogFrame>
  );
}
