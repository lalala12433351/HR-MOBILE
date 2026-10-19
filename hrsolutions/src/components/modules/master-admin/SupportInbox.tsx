'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Search, X } from 'lucide-react';
import {
  ChatAvatar,
  TICKET_STATUS_LABELS,
  buttonPrimary,
  buttonSecondary,
  fieldClass,
  formatListTime,
  iconButton,
  ticketStatusClass,
} from '@/components/chat/chatUi';
import { SupportComposer } from '@/components/support/SupportComposer';
import { SupportTicketPanel } from '@/components/support/SupportTicketPanel';
import { SupportMessageList } from '@/components/support/SupportThreadPane';
import { uploadSupportFiles } from '@/components/support/supportUi';
import { api } from '@/services/apiClient';
import type { SupportMessage, SupportStatus, SupportThread } from '@/services/supportTypes';

export function SupportInbox() {
  const [tickets, setTickets] = useState<SupportThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState<SupportStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const loadTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.controlPlane.listSupportTickets();
      const list = res.data || [];
      setTickets(list);
      setActiveId((current) => {
        if (current && list.some((ticket) => ticket.id === current)) return current;
        return list[0]?.id ?? null;
      });
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Could not load support tickets.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const openTicket = useCallback(async (id: string, silent = false) => {
    try {
      const res = await api.controlPlane.getSupportTicket(id);
      if (res.data) {
        setTickets((prev) => prev.map((ticket) => (ticket.id === id ? res.data! : ticket)));
        setMessages(res.data.messages || []);
      }
    } catch (err: any) {
      if (!silent) setError(err?.message || 'Could not load this ticket.');
    }
  }, []);

  useEffect(() => {
    void loadTickets();
    const timer = window.setInterval(() => void loadTickets(true), 20000);
    return () => window.clearInterval(timer);
  }, [loadTickets]);

  useEffect(() => {
    if (!activeId) return;
    void openTicket(activeId);
    const timer = window.setInterval(() => void openTicket(activeId, true), 8000);
    return () => window.clearInterval(timer);
  }, [activeId, openTicket]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
      if (!q) return true;
      return (
        ticket.subject.toLowerCase().includes(q) ||
        ticket.ticketNumber.toLowerCase().includes(q) ||
        (ticket.tenantName || '').toLowerCase().includes(q) ||
        (ticket.tenantSlug || '').toLowerCase().includes(q) ||
        ticket.requesterName.toLowerCase().includes(q) ||
        ticket.requesterEmail.toLowerCase().includes(q)
      );
    });
  }, [tickets, statusFilter, query]);

  const active = tickets.find((ticket) => ticket.id === activeId) || null;

  const resolveUrl = useCallback(async (attachmentId: string) => {
    const res = await api.controlPlane.getSupportAttachmentUrl(attachmentId);
    const url = res.data?.downloadUrl;
    if (!url) throw new Error('Could not open that file.');
    return url;
  }, []);

  const sendReply = async (input: { body: string; files: File[] }) => {
    if (!active || active.status === 'closed') return;
    setBusy(true);
    setError(null);
    try {
      const attachments = input.files.length
        ? await uploadSupportFiles(input.files, { kind: 'platform', ticketId: active.id })
        : undefined;
      const res = await api.controlPlane.replySupportTicket(active.id, { body: input.body, attachments });
      if (res.data) {
        setTickets((prev) => prev.map((ticket) => (ticket.id === res.data!.id ? res.data! : ticket)));
        setMessages(res.data.messages || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not send the reply.');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: SupportStatus) => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.controlPlane.updateSupportTicket(active.id, { status });
      if (res.data) {
        setTickets((prev) => prev.map((ticket) => (ticket.id === res.data!.id ? res.data! : ticket)));
      }
    } catch (err: any) {
      setError(err?.message || 'Could not update the ticket.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat-workspace h-[min(78vh,48rem)] overflow-hidden rounded-lg border border-[var(--border-color)]">
      <aside aria-label="Support tickets" className="chat-rail hidden flex-col md:flex">
        <div className="chat-rail-head">
          <h2 className="chat-rail-title">Support</h2>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as SupportStatus | 'all')}
              className={`${fieldClass} h-9`}
            >
              <option value="all">All statuses</option>
              {(Object.keys(TICKET_STATUS_LABELS) as SupportStatus[]).map((status) => (
                <option key={status} value={status}>
                  {TICKET_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <label className="relative block">
              <span className="sr-only">Search tickets</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a ticket"
                className={`${fieldClass} h-9 pl-8`}
              />
            </label>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
          {loading && <p className="px-3 py-8 text-center text-[12px] text-[var(--text-muted)]">Loading…</p>}
          {!loading && visible.length === 0 && (
            <p className="px-3 py-8 text-center text-[12px] leading-relaxed text-[var(--text-muted)]">
              No support tickets found. Help & support tickets from client workspaces appear here.
            </p>
          )}
          <ul className="space-y-0.5">
            {visible.map((ticket) => {
              const selected = ticket.id === activeId;
              return (
                <li key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(ticket.id);
                      setDetailsOpen(true);
                    }}
                    aria-current={selected ? 'true' : undefined}
                    className="chat-row"
                  >
                    <ChatAvatar name={ticket.tenantName || ticket.requesterName} size={32} square />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{ticket.subject}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">{formatListTime(ticket.updatedAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                        <span className={`rounded-full px-1.5 py-px font-semibold ${ticketStatusClass(ticket.status)}`}>
                          {TICKET_STATUS_LABELS[ticket.status]}
                        </span>
                        <span className="truncate">
                          {ticket.tenantName} · {ticket.ticketNumber}
                        </span>
                      </span>
                      <span className="mt-0.5 truncate text-[12px] text-[var(--text-secondary)]">{ticket.preview || ticket.requesterName}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <section aria-label="Ticket conversation" className="chat-stage flex">
        {!active && (
          <div className="chat-empty flex h-full flex-1 items-center justify-center">
            <div className="chat-empty-copy">
              <h2>Support inbox</h2>
              <p>Select a ticket to chat with the client workspace.</p>
            </div>
          </div>
        )}
        {active && (
          <div className="flex min-h-0 flex-1">
            <div className={`${detailsOpen ? 'hidden lg:flex' : 'flex'} chat-thread`}>
              <header className="chat-thread-head">
                <ChatAvatar name={active.tenantName || active.requesterName} size={36} square />
                <div className="min-w-0 flex-1">
                  <h2 className="chat-thread-title">{active.subject}</h2>
                  <div className="chat-thread-meta">
                    <span className="flex items-center gap-1.5">
                      <span className={`rounded-full px-1.5 py-px text-[11px] font-semibold ${ticketStatusClass(active.status)}`}>
                        {TICKET_STATUS_LABELS[active.status]}
                      </span>
                      <span className="truncate">
                        {active.ticketNumber} · {active.category} · {active.tenantName}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {active.status !== 'resolved' && active.status !== 'closed' && (
                    <button type="button" disabled={busy} onClick={() => void setStatus('resolved')} className={`${buttonSecondary} h-8 px-2.5 text-[12px]`}>
                      Resolve
                    </button>
                  )}
                  {active.status !== 'closed' && (
                    <button type="button" disabled={busy} onClick={() => void setStatus('closed')} className={`${buttonPrimary} h-8 px-2.5 text-[12px]`}>
                      Close
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDetailsOpen((value) => !value)}
                    aria-pressed={detailsOpen}
                    className={`${iconButton} ${detailsOpen ? 'bg-[#f8fbfe] dark:bg-white/10 text-[var(--text-primary)]' : ''}`}
                    aria-label={detailsOpen ? 'Hide details' : 'Show details'}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </div>
              </header>
              {error && <p className="px-4 py-1 text-[12px] text-[#8b3133] dark:text-red-300">{error}</p>}
              <SupportMessageList
                messages={messages}
                mineKind="support"
                resolveUrl={resolveUrl}
                emptyCopy="This ticket is a private chat with the client workspace."
              />
              <SupportComposer
                threadId={active.id}
                placeholder="Reply to this request"
                sending={busy}
                disabledReason={active.status === 'closed' ? 'This ticket is closed. Reopen it to send another reply.' : null}
                onSend={(input) => void sendReply(input)}
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
                    <SupportTicketPanel thread={active} variant="admin" busy={busy} onStatus={(status) => void setStatus(status)} />
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
