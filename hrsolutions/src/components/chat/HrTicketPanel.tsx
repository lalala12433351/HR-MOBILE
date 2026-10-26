'use client';

import React, { useEffect, useState } from 'react';
import { useChat } from '@/hooks/useChat';
import type { ChatConversation, ChatPerson, TicketPriority, TicketStatus } from '@/services/chatTypes';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  buttonSecondary,
  fieldClass,
  labelClass,
  ticketStatusClass,
} from './chatUi';

export function HrTicketPanel({ conversation }: { conversation: ChatConversation }) {
  const { isHr, me, updateHrTicket, searchPeople } = useChat();
  const ticket = conversation.ticket!;
  const [hrPeople, setHrPeople] = useState<ChatPerson[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const categories = me?.ticketCategories?.length ? me.ticketCategories : [ticket.category || 'General'];

  useEffect(() => {
    if (!isHr) return;
    searchPeople('', true)
      .then(setHrPeople)
      .catch(() => setHrPeople([]));
  }, [isHr, searchPeople]);

  const apply = async (
    field: string,
    input: { status?: TicketStatus; assignedHrId?: string | null; priority?: TicketPriority; category?: string }
  ) => {
    setSaving(field);
    setError(null);
    try {
      await updateHrTicket(conversation.id, input);
    } catch (err: any) {
      setError(err?.message || 'The request could not be updated.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <section aria-label="Request details" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Request</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ticketStatusClass(ticket.status)}`}>
          {TICKET_STATUS_LABELS[ticket.status]}
        </span>
      </div>

      <p className="chat-details-name">{conversation.name || 'HR request'}</p>
      <dl className="space-y-1.5 text-[12.5px]">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--text-muted)]">Raised by</dt>
          <dd className="font-semibold text-[var(--text-primary)] text-right">{conversation.createdByName || 'Employee'}</dd>
        </div>
        {!isHr && (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Topic</dt>
              <dd className="text-[var(--text-primary)] text-right">{ticket.category}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Priority</dt>
              <dd className="text-[var(--text-primary)] text-right">{TICKET_PRIORITY_LABELS[ticket.priority]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Handled by</dt>
              <dd className="text-[var(--text-primary)] text-right">{ticket.assignedHrName || 'Waiting for HR'}</dd>
            </div>
          </>
        )}
      </dl>

      {isHr && (
        <details className="chat-ticket-controls">
          <summary>Manage request</summary>
          <div className="space-y-3 pt-3">
          <div>
            <label htmlFor="ticket-status" className={labelClass}>
              Status
            </label>
            <select
              id="ticket-status"
              value={ticket.status}
              disabled={saving !== null}
              onChange={(e) => void apply('status', { status: e.target.value as TicketStatus })}
              className={`${fieldClass} h-9`}
            >
              {(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="ticket-assignee" className={labelClass}>
              Assigned to
            </label>
            <select
              id="ticket-assignee"
              value={ticket.assignedHrId || ''}
              disabled={saving !== null}
              onChange={(e) => void apply('assignee', { assignedHrId: e.target.value || null })}
              className={`${fieldClass} h-9`}
            >
              <option value="">Unassigned</option>
              {ticket.assignedHrId && !hrPeople.some((p) => p.id === ticket.assignedHrId) && (
                <option value={ticket.assignedHrId}>{ticket.assignedHrName || 'Current assignee'}</option>
              )}
              {hrPeople.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === me?.employeeId ? `${p.name} (you)` : p.name}
                </option>
              ))}
            </select>
            {ticket.assignedHrId !== me?.employeeId && (
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => void apply('assignee', { assignedHrId: me!.employeeId })}
                className={`${buttonSecondary} mt-2 h-8 w-full`}
              >
                Assign to me
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="ticket-priority" className={labelClass}>
                Priority
              </label>
              <select
                id="ticket-priority"
                value={ticket.priority}
                disabled={saving !== null}
                onChange={(e) => void apply('priority', { priority: e.target.value as TicketPriority })}
                className={`${fieldClass} h-9`}
              >
                {(Object.keys(TICKET_PRIORITY_LABELS) as TicketPriority[]).map((p) => (
                  <option key={p} value={p}>
                    {TICKET_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ticket-category" className={labelClass}>
                Topic
              </label>
              <select
                id="ticket-category"
                value={ticket.category || ''}
                disabled={saving !== null}
                onChange={(e) => void apply('category', { category: e.target.value })}
                className={`${fieldClass} h-9`}
              >
                {ticket.category && !categories.includes(ticket.category) && <option value={ticket.category}>{ticket.category}</option>}
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {ticket.status !== 'closed' && (
            <div className="flex gap-2">
              {ticket.status !== 'resolved' && (
                <button
                  type="button"
                  disabled={saving !== null}
                  onClick={() => void apply('status', { status: 'resolved' })}
                  className={`${buttonSecondary} h-8 flex-1`}
                >
                  Resolve
                </button>
              )}
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => void apply('status', { status: 'closed' })}
                className={`${buttonSecondary} h-8 flex-1 border-[#17324e] text-[#17324e]`}
              >
                Close request
              </button>
            </div>
          )}
          {saving && <p className="text-[11.5px] text-[var(--text-muted)]">Saving…</p>}
          </div>
        </details>
      )}

      {!isHr && (ticket.status === 'resolved' || ticket.status === 'closed') && (
        <p className="rounded-[8px] bg-[var(--bg-surface-subtle)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {ticket.status === 'resolved'
            ? 'HR marked this as resolved. Reply if you still need help and the request reopens.'
            : 'This request is closed. Start a new request if you need more help.'}
        </p>
      )}

      <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">Only you and the HR team can see this request.</p>
      {error && <p className="text-[12px] text-[#8b3133] dark:text-red-300">{error}</p>}
    </section>
  );
}
