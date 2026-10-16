'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BellOff, Plus, Search } from 'lucide-react';
import { conversationTitle, useChat } from '@/hooks/useChat';
import type { ChatConversation, TicketStatus } from '@/services/chatTypes';
import {
  ChatAvatar,
  ChatChannelMark,
  TICKET_STATUS_LABELS,
  fieldClass,
  formatListTime,
  iconButton,
  ticketStatusClass,
} from './chatUi';

export type ChatTab = 'teams' | 'chats' | 'hr' | 'inbox';

interface ConversationListProps {
  tab: ChatTab;
  onTabChange: (tab: ChatTab) => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onNewHrRequest: () => void;
}

function unreadOf(conversations: ChatConversation[]): number {
  return conversations.reduce((sum, c) => sum + (c.muted ? 0 : c.unreadCount), 0);
}

function lastLine(conversation: ChatConversation, meId?: string): string {
  const last = conversation.lastMessage;
  if (!last) return conversation.type === 'team_channel' ? 'No messages yet. Say hello to the team.' : 'No messages yet';
  if (last.isDeleted) return 'Message deleted';
  const body = last.body || (last.hasAttachments ? 'Sent a file' : '');
  if (last.type === 'system') return body;
  const who = last.senderId === meId ? 'You' : last.senderName?.split(' ')[0];
  return conversation.type === 'direct' && last.senderId !== meId ? body : `${who}: ${body}`;
}

export function ConversationList({ tab, onTabChange, activeId, onSelect, onNewChat, onNewHrRequest }: ConversationListProps) {
  const { conversations, me, isHr, online, hrTickets, hrTicketsLoading, loadHrTickets } = useChat();
  const [query, setQuery] = useState('');
  const [inboxStatus, setInboxStatus] = useState<TicketStatus | 'all'>('all');
  const [inboxAssigned, setInboxAssigned] = useState<'all' | 'me' | 'unassigned'>('all');
  const [inboxError, setInboxError] = useState<string | null>(null);
  const meId = me?.employeeId;

  useEffect(() => {
    if (tab !== 'inbox' || !isHr) return;
    setInboxError(null);
    loadHrTickets({
      status: inboxStatus === 'all' ? undefined : inboxStatus,
      assigned: inboxAssigned,
    }).catch((err: Error) => setInboxError(err.message || 'The HR queue could not be loaded.'));
  }, [tab, isHr, inboxStatus, inboxAssigned, loadHrTickets]);

  const visible = useMemo(() => conversations.filter((c) => !c.isArchived), [conversations]);
  const channels = useMemo(() => visible.filter((c) => c.type === 'team_channel'), [visible]);
  const chats = useMemo(() => visible.filter((c) => c.type === 'group' || c.type === 'direct'), [visible]);
  const myTickets = useMemo(
    () => conversations.filter((c) => c.type === 'hr_ticket' && c.createdBy === meId),
    [conversations, meId]
  );

  const matches = (c: ChatConversation) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      conversationTitle(c, meId).toLowerCase().includes(q) ||
      (c.departmentName || '').toLowerCase().includes(q) ||
      c.participants.some((p) => p.name.toLowerCase().includes(q))
    );
  };

  const channelGroups = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; items: ChatConversation[] }>();
    for (const c of channels) {
      const key = c.departmentId || 'other';
      if (!groups.has(key)) groups.set(key, { key, label: c.departmentName || 'Other teams', items: [] });
      groups.get(key)!.items.push(c);
    }
    for (const group of groups.values()) {
      group.items.sort((a, b) => {
        if (!a.teamId && b.teamId) return -1;
        if (a.teamId && !b.teamId) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
    }
    return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [channels]);

  const tabs: { id: ChatTab; label: string; unread: number }[] = [
    { id: 'teams', label: 'Teams', unread: unreadOf(channels) },
    { id: 'chats', label: 'Chats', unread: unreadOf(chats) },
    { id: 'hr', label: 'Ask HR', unread: unreadOf(myTickets) },
  ];
  if (isHr) tabs.push({ id: 'inbox', label: 'HR Inbox', unread: 0 });

  const renderRow = (c: ChatConversation, opts?: { indent?: boolean; showRequester?: boolean }) => {
    const title = conversationTitle(c, meId);
    const other = c.type === 'direct' ? c.participants.find((p) => p.employeeId !== meId) : null;
    const active = c.id === activeId;
    const unread = c.unreadCount > 0 && !c.muted;
    return (
      <li key={c.id}>
        <button
          type="button"
          onClick={() => onSelect(c.id)}
          aria-current={active ? 'true' : undefined}
          className={`chat-row ${opts?.indent ? 'pl-4' : ''}`}
        >
          {c.type === 'team_channel' ? (
            <ChatChannelMark conversation={c} className="mt-0.5" />
          ) : c.type === 'hr_ticket' ? (
            <ChatAvatar name={opts?.showRequester ? c.createdByName : 'HR'} size={32} square />
          ) : (
            <ChatAvatar
              name={title}
              src={other?.avatarUrl}
              size={32}
              online={other ? online.has(other.employeeId) : undefined}
            />
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span
                className={`truncate text-[13px] ${unread ? 'font-bold text-[var(--text-primary)]' : 'font-semibold text-[var(--text-primary)]'}`}
              >
                {title}
              </span>
              {c.muted && <BellOff className="h-3 w-3 shrink-0 text-[var(--text-muted)]" aria-label="Muted" />}
              <span className="ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">
                {formatListTime(c.lastMessage?.createdAt || c.lastMessageAt)}
              </span>
            </span>
            {c.type === 'hr_ticket' && c.ticket && (
              <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                <span className={`rounded-full px-1.5 py-px font-semibold ${ticketStatusClass(c.ticket.status)}`}>
                  {TICKET_STATUS_LABELS[c.ticket.status]}
                </span>
                <span className="truncate">
                  {opts?.showRequester ? `${c.createdByName || 'Employee'} · ` : ''}
                  {c.ticket.category}
                </span>
              </span>
            )}
            <span className="mt-0.5 flex items-center gap-2">
              <span
                className={`truncate text-[12px] ${unread ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}
              >
                {lastLine(c, meId)}
              </span>
              {unread && (
                <span className="ml-auto min-w-[18px] h-[18px] shrink-0 rounded-full bg-[#17324e] dark:bg-sky-500 px-1.5 text-[10px] font-bold leading-[18px] text-white text-center">
                  {c.unreadCount > 99 ? '99+' : c.unreadCount}
                </span>
              )}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const empty = (text: string) => <p className="px-3 py-8 text-center text-[12px] leading-relaxed text-[var(--text-muted)]">{text}</p>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="chat-rail-head">
        <div className="flex items-center justify-between gap-2">
          <h1 className="chat-rail-title">Chat</h1>
          {tab === 'chats' && (
            <button type="button" className={iconButton} onClick={onNewChat} title="Start a new chat" aria-label="Start a new chat">
              <Plus className="h-4 w-4" />
            </button>
          )}
          {tab === 'hr' && (
            <button type="button" className={iconButton} onClick={onNewHrRequest} title="New HR request" aria-label="New HR request">
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
        <div role="tablist" aria-label="Chat sections" className="chat-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => onTabChange(t.id)}
              className="chat-tab"
            >
              {t.label}
              {t.unread > 0 && (
                <span className="chat-tab-count">
                  {t.unread > 99 ? '99+' : t.unread}
                </span>
              )}
            </button>
          ))}
        </div>
        {tab !== 'inbox' && (
          <label className="relative mt-2.5 block">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === 'teams' ? 'Find a team' : tab === 'hr' ? 'Find a request' : 'Find a person or chat'}
              className={`${fieldClass} h-9 pl-8`}
            />
          </label>
        )}
        {tab === 'inbox' && (
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <select
              aria-label="Filter by status"
              value={inboxStatus}
              onChange={(e) => setInboxStatus(e.target.value as TicketStatus | 'all')}
              className={`${fieldClass} h-9`}
            >
              <option value="all">All statuses</option>
              {(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by assignee"
              value={inboxAssigned}
              onChange={(e) => setInboxAssigned(e.target.value as 'all' | 'me' | 'unassigned')}
              className={`${fieldClass} h-9`}
            >
              <option value="all">Everyone</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-2 py-2">
        {tab === 'teams' &&
          (channelGroups.length === 0
            ? empty('You are not in a team yet. Team channels appear here once HR adds you to a department or team.')
            : channelGroups.map((group) => {
                const items = group.items.filter(matches);
                if (items.length === 0) return null;
                return (
                  <section key={group.key} className="mb-2">
                    <h2 className="chat-group-label">
                      {group.label}
                    </h2>
                    <ul className="space-y-0.5">{items.map((c) => renderRow(c, { indent: !!c.teamId }))}</ul>
                  </section>
                );
              }))}

        {tab === 'chats' &&
          (chats.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
                Start a one-to-one chat or a group with the people you work with.
              </p>
              <button type="button" onClick={onNewChat} className="mt-3 text-[12.5px] font-semibold text-[#2d628e] dark:text-sky-300 hover:underline">
                Start a new chat
              </button>
            </div>
          ) : (
            <ul className="space-y-0.5">{chats.filter(matches).map((c) => renderRow(c))}</ul>
          ))}

        {tab === 'hr' &&
          (myTickets.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
                Questions about leave, pay, documents or policies? Send a private request to HR and follow the reply here.
              </p>
              <button type="button" onClick={onNewHrRequest} className="mt-3 text-[12.5px] font-semibold text-[#2d628e] dark:text-sky-300 hover:underline">
                Ask HR a question
              </button>
            </div>
          ) : (
            <ul className="space-y-0.5">{myTickets.filter(matches).map((c) => renderRow(c))}</ul>
          ))}

        {tab === 'inbox' &&
          (inboxError ? (
            empty(inboxError)
          ) : hrTicketsLoading && hrTickets.length === 0 ? (
            empty('Loading requests…')
          ) : hrTickets.length === 0 ? (
            empty('No requests match these filters.')
          ) : (
            <ul className="space-y-0.5">{hrTickets.map((c) => renderRow(c, { showRequester: true }))}</ul>
          ))}
      </div>
    </div>
  );
}
