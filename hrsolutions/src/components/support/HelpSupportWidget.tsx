'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, CircleHelp, Info, LifeBuoy, Plus, Search, X } from 'lucide-react';
import {
  ChatAvatar,
  TICKET_STATUS_LABELS,
  buttonPrimary,
  fieldClass,
  formatListTime,
  iconButton,
  ticketStatusClass,
} from '@/components/chat/chatUi';
import { api } from '@/services/apiClient';
import type { SupportMessage, SupportThread } from '@/services/supportTypes';
import { SUPPORT_MAIL } from '@/services/supportTypes';
import { SUPPORT_FAQS } from './supportFaqs';
import { NewSupportTicketDialog } from './NewSupportTicketDialog';
import { SupportComposer } from './SupportComposer';
import { SupportTicketPanel } from './SupportTicketPanel';
import { SupportMessageList } from './SupportThreadPane';
import { supportMailto, uploadSupportFiles } from './supportUi';

type PanelTab = 'faq' | 'tickets';

function lastLine(thread: SupportThread): string {
  if (!thread.preview) return 'No messages yet';
  return thread.preview;
}

type HelpSupportWidgetProps = {
  /** Controlled open state. When omitted, the widget manages its own open state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Floating launcher button. Hide when opening from the sidebar. */
  showLauncher?: boolean;
  /** When set, the panel opens as a popover extending from this element. */
  anchorRef?: React.RefObject<HTMLElement | null>;
};

type AnchorStyle = {
  left: number;
  bottom: number;
  width: number;
  maxHeight: number;
};

export function HelpSupportWidget({
  open: openProp,
  onOpenChange,
  showLauncher = true,
  anchorRef,
}: HelpSupportWidgetProps = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const value = typeof next === 'function' ? next(open) : next;
      if (openProp === undefined) setUncontrolledOpen(value);
      onOpenChange?.(value);
    },
    [open, openProp, onOpenChange]
  );
  const [anchorStyle, setAnchorStyle] = useState<AnchorStyle | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<PanelTab>('faq');
  const [openFaq, setOpenFaq] = useState<string | null>(SUPPORT_FAQS[0]?.id ?? null);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [composingNew, setComposingNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [query, setQuery] = useState('');
  const composingNewRef = useRef(composingNew);
  composingNewRef.current = composingNew;

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeId) || null,
    [threads, activeId]
  );

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(
      (thread) =>
        thread.subject.toLowerCase().includes(q) ||
        thread.ticketNumber.toLowerCase().includes(q) ||
        thread.category.toLowerCase().includes(q) ||
        (thread.preview || '').toLowerCase().includes(q)
    );
  }, [threads, query]);

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
        if (composingNewRef.current) return current;
        return list[0]?.id ?? null;
      });
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Could not load support tickets.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string, silent = false) => {
    try {
      const res = await api.support.listMessages(threadId);
      setMessages(res.data || []);
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Could not load this ticket.');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadThreads();
    const timer = window.setInterval(() => void loadThreads(true), 15000);
    return () => window.clearInterval(timer);
  }, [open, loadThreads]);

  useEffect(() => {
    if (!open || !activeId || composingNew) return;
    void loadMessages(activeId);
    const timer = window.setInterval(() => void loadMessages(activeId, true), 8000);
    return () => window.clearInterval(timer);
  }, [open, activeId, composingNew, loadMessages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (composingNew) {
        setComposingNew(false);
        return;
      }
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, composingNew, setOpen]);

  useEffect(() => {
    if (!open || !anchorRef) {
      setAnchorStyle(null);
      return;
    }

    const GAP = 10;
    const VIEW_PAD = 16;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.min(rect.right + GAP, vw - VIEW_PAD - 280);
      const bottom = Math.max(VIEW_PAD, vh - rect.bottom);
      const width = Math.min(880, Math.max(300, vw - left - VIEW_PAD));
      const maxHeight = Math.min(vh * 0.88, 640, Math.max(320, vh - bottom - VIEW_PAD));

      setAnchorStyle({ left, bottom, width, maxHeight });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updatePosition) : null;
    if (anchorRef.current) observer?.observe(anchorRef.current);
    const dock = document.getElementById('pixbe-sidebar');
    if (dock) observer?.observe(dock);
    // Follow the sidebar expand/collapse transition so the popover stays glued to the icon.
    const timer = window.setInterval(updatePosition, 32);
    const stopTimer = window.setTimeout(() => window.clearInterval(timer), 280);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      observer?.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(stopTimer);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open || !anchorRef) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      // Keep open while interacting with nested dialogs (new ticket, file pickers).
      if ((target as Element).closest?.('[data-help-support-portal], [role="dialog"]')) return;
      setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, anchorRef, setOpen]);

  const selectThread = (id: string) => {
    setComposingNew(false);
    setActiveId(id);
    setMobileThread(true);
    setError(null);
    setTab('tickets');
    setDetailsOpen(true);
  };

  const resolveUrl = useCallback(async (attachmentId: string) => {
    const res = await api.support.getAttachmentUrl(attachmentId);
    const url = res.data?.downloadUrl;
    if (!url) throw new Error('Could not open that file.');
    return url;
  }, []);

  const sendFollowUp = async (input: { body: string; files: File[] }) => {
    if (!activeId || activeThread?.status === 'closed') return;
    setSending(true);
    setError(null);
    try {
      const attachments = input.files.length ? await uploadSupportFiles(input.files, { kind: 'tenant' }) : undefined;
      const res = await api.support.sendMessage(activeId, { body: input.body, attachments });
      if (res.data) {
        setThreads((prev) => [res.data!, ...prev.filter((thread) => thread.id !== res.data!.id)]);
        setMessages(res.data.messages || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Your message could not be sent. Try again.');
    } finally {
      setSending(false);
    }
  };

  const anchored = Boolean(anchorRef);
  const panelStyle: React.CSSProperties | undefined = anchored && anchorStyle
    ? {
        left: anchorStyle.left,
        bottom: anchorStyle.bottom,
        width: anchorStyle.width,
        height: anchorStyle.maxHeight,
        maxHeight: anchorStyle.maxHeight,
      }
    : undefined;

  return (
    <>
      <div
        className={
          anchored
            ? 'contents'
            : showLauncher
              ? 'pointer-events-none fixed bottom-20 right-4 z-40 lg:bottom-6 lg:right-6'
              : 'pointer-events-none fixed bottom-20 right-4 z-40 lg:bottom-6 lg:right-6 flex flex-col items-end'
        }
      >
        {open && (!anchored || anchorStyle) && (
          <div
            ref={panelRef}
            className={
              anchored
                ? 'pointer-events-auto fixed z-50 flex flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-[0_16px_48px_rgba(23,34,52,0.18)]'
                : `pointer-events-auto flex h-[min(88vh,56rem)] w-[min(calc(100vw-2rem),72rem)] flex-col overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-[0_12px_40px_rgba(23,34,52,0.16)]${showLauncher ? ' mb-3' : ''}`
            }
            style={panelStyle}
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

            <div role="tablist" aria-label="Help sections" className="chat-tabs !mx-0 !mt-0 px-2">
              {(
                [
                  { id: 'faq', label: 'FAQs' },
                  { id: 'tickets', label: 'Tickets' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className="chat-tab"
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === 'faq' ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-2 custom-scrollbar">
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
                      {expanded && <p className="px-2 pb-2.5 text-[12px] leading-5 text-[var(--text-secondary)]">{faq.answer}</p>}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setTab('tickets');
                    setComposingNew(true);
                  }}
                  className={`${buttonPrimary} mt-3 w-full`}
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
              <div className="chat-workspace min-h-0 flex-1">
                <aside
                  aria-label="Your tickets"
                  className={`chat-rail flex-col ${mobileThread ? 'hidden md:flex' : 'flex'}`}
                >
                  <div className="chat-rail-head">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="chat-rail-title">Tickets</h2>
                      <button
                        type="button"
                        className={iconButton}
                        onClick={() => setComposingNew(true)}
                        aria-label="New support ticket"
                        title="New ticket"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <label className="relative mt-2.5 block">
                      <span className="sr-only">Search tickets</span>
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Find a request"
                        className={`${fieldClass} h-9 pl-8`}
                      />
                    </label>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
                    {loading && <p className="px-3 py-8 text-center text-[12px] text-[var(--text-muted)]">Loading…</p>}
                    {!loading && threads.length === 0 && (
                      <div className="px-3 py-8 text-center">
                        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
                          No tickets yet. Open one and Pixbe Super Admin will reply here, the same way HR replies in Chat.
                        </p>
                        <button
                          type="button"
                          onClick={() => setComposingNew(true)}
                          className="mt-3 text-[12.5px] font-semibold text-[#2d628e] dark:text-sky-300 hover:underline"
                        >
                          Open a ticket
                        </button>
                      </div>
                    )}
                    {!loading && threads.length > 0 && visibleThreads.length === 0 && (
                      <p className="px-3 py-8 text-center text-[12px] text-[var(--text-muted)]">No tickets match that search.</p>
                    )}
                    <ul className="space-y-0.5">
                      {visibleThreads.map((thread) => {
                        const selected = !composingNew && thread.id === activeId;
                        return (
                          <li key={thread.id}>
                            <button
                              type="button"
                              onClick={() => selectThread(thread.id)}
                              aria-current={selected ? 'true' : undefined}
                              className="chat-row"
                            >
                              <ChatAvatar name="Pixbe" size={32} square />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-baseline gap-2">
                                  <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{thread.subject}</span>
                                  <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">
                                    {formatListTime(thread.updatedAt)}
                                  </span>
                                </span>
                                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                                  <span className={`rounded-full px-1.5 py-px font-semibold ${ticketStatusClass(thread.status)}`}>
                                    {TICKET_STATUS_LABELS[thread.status]}
                                  </span>
                                  <span className="truncate">
                                    {thread.ticketNumber} · {thread.category}
                                  </span>
                                </span>
                                <span className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">{lastLine(thread)}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </aside>

                <section aria-label="Ticket conversation" className={`chat-stage ${mobileThread || activeThread ? 'flex' : 'hidden md:flex'}`}>
                  {!activeThread && (
                    <div className="chat-empty hidden h-full flex-1 items-center justify-center md:flex">
                      <div className="chat-empty-copy">
                        <h2>Pixbe support</h2>
                        <p>Questions about the product go to Super Admin. Open a ticket, attach screenshots, and follow the replies here.</p>
                        <button type="button" onClick={() => setComposingNew(true)} className={`${buttonPrimary} mt-4`}>
                          <LifeBuoy className="h-4 w-4" />
                          New ticket
                        </button>
                      </div>
                    </div>
                  )}

                  {activeThread && (
                    <div className="flex min-h-0 flex-1">
                      <div className={`${detailsOpen ? 'hidden lg:flex' : 'flex'} chat-thread`}>
                        <header className="chat-thread-head">
                          <button
                            type="button"
                            onClick={() => setMobileThread(false)}
                            className={`${iconButton} md:hidden`}
                            aria-label="Back to tickets"
                          >
                            <ArrowLeft className="h-4 w-4" />
                          </button>
                          <ChatAvatar name="Pixbe" size={36} square />
                          <div className="min-w-0 flex-1">
                            <h1 className="chat-thread-title">{activeThread.subject}</h1>
                            <div className="chat-thread-meta">
                              <span className="flex items-center gap-1.5">
                                <span className={`rounded-full px-1.5 py-px text-[11px] font-semibold ${ticketStatusClass(activeThread.status)}`}>
                                  {TICKET_STATUS_LABELS[activeThread.status]}
                                </span>
                                <span className="truncate">
                                  {activeThread.ticketNumber} · {activeThread.category}
                                </span>
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDetailsOpen((value) => !value)}
                            aria-pressed={detailsOpen}
                            className={`${iconButton} ${detailsOpen ? 'bg-[#f8fbfe] dark:bg-white/10 text-[var(--text-primary)]' : ''}`}
                            aria-label={detailsOpen ? 'Hide details' : 'Show details'}
                          >
                            <Info className="h-4 w-4" />
                          </button>
                        </header>
                        {error && <p className="px-4 py-1 text-[12px] text-[#8b3133] dark:text-red-300">{error}</p>}
                        <SupportMessageList messages={messages} mineKind="user" resolveUrl={resolveUrl} />
                        <SupportComposer
                          threadId={activeThread.id}
                          placeholder="Reply to this request"
                          sending={sending}
                          disabledReason={
                            activeThread.status === 'closed'
                              ? 'This ticket is closed. Open a new ticket if you still need help.'
                              : null
                          }
                          onSend={(input) => void sendFollowUp(input)}
                        />
                      </div>
                      {detailsOpen && (
                        <aside aria-label="Ticket details" className="chat-details flex">
                          <div className="flex h-full min-h-0 flex-col">
                            <div className="flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-4 py-3">
                              <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Details</h2>
                              <button type="button" className={iconButton} onClick={() => setDetailsOpen(false)} aria-label="Hide details">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
                              <SupportTicketPanel thread={activeThread} variant="tenant" />
                            </div>
                          </div>
                        </aside>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}

        {showLauncher && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-surface)] text-[#17324e] shadow-[0_8px_24px_rgba(23,34,52,0.14)] hover:bg-[var(--bg-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d8e8f2]"
            aria-label={open ? 'Close help and support' : 'Open help and support'}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <CircleHelp className="h-5 w-5" />}
          </button>
        )}
      </div>
      <NewSupportTicketDialog
        open={composingNew}
        onClose={() => setComposingNew(false)}
        onCreated={(thread) => {
          setThreads((prev) => [thread, ...prev.filter((item) => item.id !== thread.id)]);
          setActiveId(thread.id);
          setMessages(thread.messages || []);
          setTab('tickets');
          setMobileThread(true);
          setDetailsOpen(true);
          setComposingNew(false);
        }}
      />
    </>
  );
}
