'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, CircleHelp, LifeBuoy, MessageCircle, Send, X } from 'lucide-react';
import { api } from '@/services/apiClient';
import type { SupportMessage, SupportStatus, SupportThread } from '@/services/supportTypes';
import { SUPPORT_FAQS } from './supportFaqs';

const SUPPORT_MAIL = 'support@pixbe.in';

function supportMailto(subject?: string): string {
  const next = (subject || 'Pixbe support').trim() || 'Pixbe support';
  return `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent(next)}`;
}

function statusLabel(status: SupportStatus): string {
  if (status === 'in_progress') return 'In progress';
  if (status === 'resolved') return 'Resolved';
  if (status === 'closed') return 'Closed';
  return 'Open';
}

type PanelTab = 'faq' | 'chat';

function formatTime(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function HelpSupportWidget() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>('faq');
  const [openFaq, setOpenFaq] = useState<string | null>(SUPPORT_FAQS[0]?.id ?? null);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [composingNew, setComposingNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeId) || null,
    [threads, activeId]
  );

  const loadThreads = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await api.support.listThreads();
      const list = res.data || [];
      setThreads(list);
      setActiveId((current) => {
        if (current && list.some((thread) => thread.id === current)) return current;
        return list[0]?.id ?? null;
      });
      if (!list.length) setComposingNew(true);
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Could not load support threads.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string, silent = false) => {
    try {
      const res = await api.support.listMessages(threadId);
      setMessages(res.data || []);
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Could not load this thread.');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadThreads();
    const timer = window.setInterval(() => {
      void loadThreads(true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [open, loadThreads]);

  useEffect(() => {
    if (!open || !activeId || composingNew) return;
    void loadMessages(activeId);
    const timer = window.setInterval(() => {
      void loadMessages(activeId, true);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [open, activeId, composingNew, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, open, tab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const startNew = () => {
    setComposingNew(true);
    setActiveId(null);
    setMessages([]);
    setSubject('');
    setBody('');
    setError(null);
    setTab('chat');
  };

  const submit = async () => {
    const nextSubject = subject.trim();
    const nextBody = body.trim();
    if (!nextBody) return;
    if (!composingNew && activeThread?.status === 'closed') {
      setError('This ticket is closed. Open a new ticket if you still need help.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (composingNew || !activeId) {
        if (nextSubject.length < 3) {
          setError('Add a short subject (at least 3 characters).');
          setSending(false);
          return;
        }
        const res = await api.support.createThread({ subject: nextSubject, body: nextBody });
        const created = res.data;
        if (created) {
          setThreads((prev) => [created, ...prev.filter((thread) => thread.id !== created.id)]);
          setActiveId(created.id);
          setMessages(created.messages || []);
          setComposingNew(false);
          setSubject('');
          setBody('');
        }
      } else {
        const res = await api.support.sendMessage(activeId, nextBody);
        const updated = res.data;
        if (updated) {
          setThreads((prev) => [updated, ...prev.filter((thread) => thread.id !== updated.id)]);
          setMessages(updated.messages || []);
          setBody('');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Your message could not be sent. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-20 right-4 z-40 lg:bottom-6 lg:right-6">
      {open && (
        <div
          ref={panelRef}
          className="pointer-events-auto mb-3 w-[min(100vw-2rem,22.5rem)] overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-[0_12px_40px_rgba(23,34,52,0.16)]"
          role="dialog"
          aria-label="Help and support"
        >
          <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3.5 py-2.5">
            <div>
              <p className="text-[13px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">Help & support</p>
              <p className="text-[11px] text-[var(--text-muted)]">FAQs and Pixbe product support</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
              aria-label="Close help"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 border-b border-[var(--border-color)] p-1">
            {(
              [
                { id: 'faq', label: 'FAQs', icon: CircleHelp },
                { id: 'chat', label: 'Open a ticket', icon: MessageCircle },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const selected = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] text-[12px] font-semibold ${
                    selected
                      ? 'bg-[var(--primary-blue-soft)] text-[var(--primary-blue)]'
                      : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {tab === 'faq' ? (
            <div className="max-h-[min(52vh,22rem)] overflow-y-auto p-2 custom-scrollbar">
              {SUPPORT_FAQS.map((faq) => {
                const expanded = openFaq === faq.id;
                return (
                  <div key={faq.id} className="border-b border-[var(--border-color)] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(expanded ? null : faq.id)}
                      className="flex w-full items-start justify-between gap-2 px-2 py-2.5 text-left"
                      aria-expanded={expanded}
                    >
                      <span className="text-[12px] font-semibold leading-5 text-[var(--text-primary)]">{faq.question}</span>
                      <ChevronDown
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {expanded && (
                      <p className="px-2 pb-2.5 text-[12px] leading-5 text-[var(--text-secondary)]">{faq.answer}</p>
                    )}
                  </div>
                );
              })}
              <button
                type="button"
                onClick={startNew}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-[7px] bg-[#17324e] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#285275]"
              >
                <LifeBuoy className="h-3.5 w-3.5" />
                Open a ticket
              </button>
              <p className="mt-2 px-1 pb-1 text-center text-[11px] leading-4 text-[var(--text-muted)]">
                Or email{' '}
                <a href={supportMailto()} className="font-semibold text-[#2d628e] hover:underline">
                  {SUPPORT_MAIL}
                </a>
              </p>
            </div>
          ) : (
            <div className="flex max-h-[min(58vh,26rem)] flex-col">
              {threads.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border-color)] px-2 py-1.5">
                  {threads.slice(0, 6).map((thread) => {
                    const selected = !composingNew && thread.id === activeId;
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        onClick={() => {
                          setComposingNew(false);
                          setActiveId(thread.id);
                          setError(null);
                        }}
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                          selected
                            ? 'bg-[#17324e] text-white'
                            : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        {thread.ticketNumber}
                        <span className={selected ? 'ml-1 text-white/70' : 'ml-1 text-[var(--text-muted)]'}>
                          {statusLabel(thread.status)}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={startNew}
                    className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold text-[#2d628e] hover:bg-[var(--primary-blue-soft)]"
                  >
                    New
                  </button>
                </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
                {loading && <p className="py-6 text-center text-[12px] text-[var(--text-muted)]">Loading…</p>}
                {!loading && composingNew && (
                  <p className="mb-2 text-[12px] leading-5 text-[var(--text-secondary)]">
                    This opens a ticket for Pixbe Super Admin. Include a short subject — we attach your workspace so they can see the client name and tenant.
                  </p>
                )}
                {!loading && !composingNew && messages.map((message) => (
                  <div
                    key={message.id}
                    className={`mb-2 max-w-[92%] rounded-[9px] px-2.5 py-2 text-[12px] leading-5 ${
                      message.authorKind === 'user'
                        ? 'ml-auto bg-[#17324e] text-white'
                        : 'bg-[var(--bg-surface-subtle)] text-[var(--text-primary)]'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p className={`mt-1 text-[10px] ${message.authorKind === 'user' ? 'text-white/70' : 'text-[var(--text-muted)]'}`}>
                      {message.authorKind === 'support' ? message.authorName || 'Pixbe Support' : 'You'} · {formatTime(message.createdAt)}
                    </p>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {error && <p className="px-3 pb-1 text-[11px] text-[#8b3133]">{error}</p>}

              {!composingNew && activeThread?.status === 'closed' ? (
                <p className="border-t border-[var(--border-color)] px-3 py-2.5 text-[12px] leading-5 text-[var(--text-secondary)]">
                  This ticket is closed. Open a new ticket if you still need help.
                </p>
              ) : (
                <form
                  className="space-y-2 border-t border-[var(--border-color)] p-2.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  {(composingNew || !activeId) && (
                    <input
                      value={subject}
                      onChange={(event) => setSubject(event.target.value)}
                      placeholder="Subject"
                      maxLength={255}
                      className="h-9 w-full rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-2.5 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#2d628e] focus:outline-none focus:ring-2 focus:ring-[#d8e8f2]"
                    />
                  )}
                  <div className="flex items-end gap-1.5">
                    <textarea
                      value={body}
                      onChange={(event) => setBody(event.target.value)}
                      placeholder={composingNew ? 'How can we help?' : 'Write a follow-up…'}
                      rows={2}
                      className="min-h-[2.5rem] flex-1 resize-none rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[#2d628e] focus:outline-none focus:ring-2 focus:ring-[#d8e8f2]"
                    />
                    <button
                      type="submit"
                      disabled={sending || !body.trim()}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[7px] bg-[#17324e] text-white hover:bg-[#285275] disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Send message"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </form>
              )}
              <p className="border-t border-[var(--border-color)] px-3 py-2 text-center text-[11px] leading-4 text-[var(--text-muted)]">
                Or email{' '}
                <a
                  href={supportMailto(composingNew ? subject : activeThread?.subject)}
                  className="font-semibold text-[#2d628e] hover:underline"
                >
                  {SUPPORT_MAIL}
                </a>
              </p>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)] text-[#17324e] shadow-[0_8px_24px_rgba(23,34,52,0.14)] hover:bg-[var(--bg-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
        aria-label={open ? 'Close help and support' : 'Open help and support'}
        aria-expanded={open}
      >
        {open ? <X className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}
      </button>
    </div>
  );
}
