'use client';

import React from 'react';
import type { SupportStatus, SupportThread } from '@/services/supportTypes';
import { SUPPORT_MAIL } from '@/services/supportTypes';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  buttonSecondary,
  fieldClass,
  labelClass,
  ticketStatusClass,
} from '@/components/chat/chatUi';
import { SUPPORT_PRIORITY_LABELS, supportMailto } from './supportUi';

export function SupportTicketPanel({
  thread,
  variant,
  busy,
  onStatus,
}: {
  thread: SupportThread;
  variant: 'tenant' | 'admin';
  busy?: boolean;
  onStatus?: (status: SupportStatus) => void;
}) {
  const created = thread.createdAt ? new Date(thread.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';

  return (
    <section aria-label="Ticket details" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">Ticket</h3>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ticketStatusClass(thread.status)}`}>
          {TICKET_STATUS_LABELS[thread.status]}
        </span>
      </div>

      <dl className="space-y-1.5 text-[12.5px]">
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--text-muted)]">Number</dt>
          <dd className="font-semibold text-[var(--text-primary)] text-right">{thread.ticketNumber}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--text-muted)]">Topic</dt>
          <dd className="text-[var(--text-primary)] text-right">{thread.category}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--text-muted)]">Priority</dt>
          <dd className="text-[var(--text-primary)] text-right">
            {SUPPORT_PRIORITY_LABELS[thread.priority] || TICKET_PRIORITY_LABELS[thread.priority]}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--text-muted)]">Raised by</dt>
          <dd className="text-[var(--text-primary)] text-right">{thread.requesterName}</dd>
        </div>
        {variant === 'admin' && (
          <>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Email</dt>
              <dd className="truncate text-[var(--text-primary)] text-right">{thread.requesterEmail}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--text-muted)]">Client</dt>
              <dd className="text-[var(--text-primary)] text-right">
                {thread.tenantName}
                {thread.tenantSlug ? ` (${thread.tenantSlug})` : ''}
              </dd>
            </div>
          </>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-[var(--text-muted)]">Opened</dt>
          <dd className="text-[var(--text-primary)] text-right">{created}</dd>
        </div>
      </dl>

      {variant === 'admin' && onStatus && (
        <div className="space-y-3">
          <div>
            <label htmlFor="support-ticket-status" className={labelClass}>
              Status
            </label>
            <select
              id="support-ticket-status"
              value={thread.status}
              disabled={busy}
              onChange={(event) => onStatus(event.target.value as SupportStatus)}
              className={`${fieldClass} h-9`}
            >
              {(Object.keys(TICKET_STATUS_LABELS) as SupportStatus[]).map((status) => (
                <option key={status} value={status}>
                  {TICKET_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          {thread.status !== 'closed' && (
            <div className="flex gap-2">
              {thread.status !== 'resolved' && (
                <button type="button" disabled={busy} onClick={() => onStatus('resolved')} className={`${buttonSecondary} h-8 flex-1`}>
                  Resolve
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => onStatus('closed')}
                className={`${buttonSecondary} h-8 flex-1 border-[#17324e] text-[#17324e]`}
              >
                Close ticket
              </button>
            </div>
          )}
          {(thread.status === 'resolved' || thread.status === 'closed') && (
            <button type="button" disabled={busy} onClick={() => onStatus('open')} className={`${buttonSecondary} h-8 w-full`}>
              Reopen
            </button>
          )}
        </div>
      )}

      {variant === 'tenant' && (thread.status === 'resolved' || thread.status === 'closed') && (
        <p className="rounded-[8px] bg-[var(--bg-surface-subtle)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
          {thread.status === 'resolved'
            ? 'Pixbe marked this as resolved. Reply if you still need help.'
            : 'This ticket is closed. Open a new ticket if you still need help.'}
        </p>
      )}

      <a
        href={supportMailto(thread.subject)}
        className="block rounded-[8px] bg-[var(--bg-surface-subtle)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]"
      >
        Or email <span className="font-semibold text-[#2d628e]">{SUPPORT_MAIL}</span>
      </a>
    </section>
  );
}
