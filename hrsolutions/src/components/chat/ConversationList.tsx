'use client';

import { useMobileViewport } from '@/hooks/useMobileViewport';
import {MobilePageTitle} from '@/components/mobile/MobilePageTitle';
import { MobileHeaderAction } from '@/components/mobile/MobileHeaderAction';
import { MobileRow } from '@/components/mobile/MobilePrimitives';
import { UserAvatar } from '@/components/common/UserAvatar';
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
  mentionPlainText,
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
  const body = mentionPlainText(last.body || (last.hasAttachments ? 'Sent a file' : ''));
  if (last.type === 'system') return body;
  const who = last.senderId === meId ? 'You' : last.senderName?.split(' ')[0];
  return conversation.type === 'direct' && last.senderId !== meId ? body : `${who}: ${body}`;
}

export function ConversationList({ tab, onTabChange, activeId, onSelect, onNewChat, onNewHrRequest }: ConversationListProps) {
  const { conversations, me, isHr, online, hrTickets, hrTicketsLoading, loadHrTickets } = useChat();
  const mobile=useMobileViewport();
  const [mobileFilter,setMobileFilter]=useState<'all'|'unread'|'hr'>('all');
  const [query, setQuery] = useState('');
  const [inboxStatus, setInboxStatus] = useState<TicketStatus | 'all'>('all');
  const [inboxAssigned, setInboxAssigned] = useState<'all' | 'me' | 'unassigned'>('all');
  const [inboxError, setInboxError] = useState<string | null>(null);
  const meId = me?.employeeId;

  useEffect(() => { setQuery(''); }, [tab]);

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
          className={`chat-row ${opts?.indent ? 'chat-row--nested' : ''}`}
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
              square={c.type === 'group'}
              online={other ? online.has(other.employeeId) : undefined}
            />
          )}
          <span className="chat-row-copy min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span
                className={`chat-row-title truncate text-[13px] ${unread ? 'font-bold text-[var(--text-primary)]' : 'font-semibold text-[var(--text-primary)]'}`}
              >
                {title}
              </span>
              {c.muted && <BellOff className="h-3 w-3 shrink-0 text-[var(--text-muted)]" aria-label="Muted" />}
              <span className="chat-row-time ml-auto shrink-0 text-[11px] text-[var(--text-muted)]">
                {formatListTime(c.lastMessage?.createdAt || c.lastMessageAt)}
              </span>
            </span>
            <span className="mt-0.5 flex items-center gap-2">
              <span
                className={`chat-row-preview truncate text-[12px] ${unread ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]'}`}
              >
                {c.type === 'hr_ticket' && c.ticket ? [TICKET_STATUS_LABELS[c.ticket.status], c.ticket.category, opts?.showRequester ? c.createdByName : null].filter(Boolean).join(' · ') : lastLine(c, meId)}
              </span>
              {unread && (
                <span className="chat-unread ml-auto min-w-[18px] h-[18px] shrink-0 rounded-full bg-[#17324e] dark:bg-sky-500 px-1.5 text-[10px] font-bold leading-[18px] text-white text-center">
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

  if(mobile && tab==='inbox') return <div className="m2-page m2-conversations"><MobilePageTitle title="HR inbox" onBack={()=>onTabChange('teams')}/><div className="m2-text-tabs" role="tablist" aria-label="HR request status">{(['open','in_progress','resolved'] as const).map(value=><button key={value} type="button" role="tab" aria-selected={inboxStatus===value||(inboxStatus==='all'&&value==='open')} onClick={()=>setInboxStatus(value)}>{TICKET_STATUS_LABELS[value]}</button>)}</div><div>{hrTickets.filter(c=>!c.ticket||c.ticket.status===(inboxStatus==='all'?'open':inboxStatus)).map(c=><MobileRow key={c.id} title={conversationTitle(c,meId)} detail={[c.createdByName,c.ticket?.category,c.ticket?TICKET_STATUS_LABELS[c.ticket.status]:null].filter(Boolean).join(' · ')} onClick={()=>onSelect(c.id)}/>)}{!hrTickets.length&&<p className="m2-empty">{hrTicketsLoading?'Loading requests…':'No requests match this view.'}</p>}</div><small className="m2-caption">Only authorised HR staff can access employee requests.</small></div>;
  if(mobile && tab!=='inbox') {
    const rows=visible.filter(matches).filter(c=>mobileFilter==='unread'?c.unreadCount>0:mobileFilter==='hr'?c.type==='hr_ticket':true).sort((a,b)=>String(b.lastMessageAt||'').localeCompare(String(a.lastMessageAt||'')));
    return <div className="m2-page m2-conversations"><MobileHeaderAction><button type="button" className="m2-icon-button m2-add" aria-label={mobileFilter==='hr'?'New HR request':'Start a new chat'} onClick={mobileFilter==='hr'?onNewHrRequest:onNewChat}>+</button></MobileHeaderAction><input type="search" className="m2-search-field" aria-label="Search conversations" placeholder="People, groups and conversations" value={query} onChange={event=>setQuery(event.target.value)}/><div className="m2-text-tabs" role="tablist" aria-label="Chat sections">{(['all','unread','hr'] as const).map(filter=><button key={filter} type="button" role="tab" aria-selected={mobileFilter===filter} onClick={()=>setMobileFilter(filter)}>{filter==='all'?'All':filter==='unread'?'Unread '+unreadOf(visible):'Ask HR'}</button>)}</div><div>{rows.map(c=><MobileRow key={c.id} title={conversationTitle(c,meId)+(c.unreadCount?' · '+c.unreadCount:'')} detail={[lastLine(c,meId),formatListTime(c.lastMessageAt||c.createdAt)].filter(Boolean).join(' · ')} onClick={()=>onSelect(c.id)} arrow={false}><UserAvatar name={conversationTitle(c,meId)} src={c.type==='direct'?c.participants.find(p=>p.employeeId!==meId)?.avatarUrl:undefined} className="m2-person-avatar"/></MobileRow>)}{!rows.length&&<p className="m2-empty">{query?'No conversations match your search.':mobileFilter==='hr'?'No HR requests yet. Use + to ask HR.':'No conversations in this view.'}</p>}</div>{isHr&&<MobileRow title="HR inbox" detail="Review employee requests" onClick={()=>onTabChange('inbox')}/>}</div>;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="chat-rail-head">
        <div className="chat-rail-heading flex items-center justify-between gap-2">
          <h1 className="chat-rail-title">Chat</h1>
          <button type="button" className={iconButton} onClick={tab === 'hr' ? onNewHrRequest : onNewChat} aria-label={tab === 'hr' ? 'New HR request' : 'Start a new chat'}>
            <Plus className="h-4 w-4" />
          </button>
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
          <label className="chat-rail-search relative block">
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
          <div className="chat-rail-search grid grid-cols-2 gap-2">
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

      <div className="chat-conversations min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {tab === 'teams' &&
          (channelGroups.every((group) => !group.items.some(matches))
            ? empty(query.trim() ? 'No teams match your search.' : 'You are not in a team yet. Team channels appear here once HR adds you to a department or team.')
            : channelGroups.map((group) => {
                const items = group.items.filter(matches);
                if (items.length === 0) return null;
                return (
                  <section key={group.key} className="mb-2">
                    <h2 className="chat-group-label">
                      {group.label}
                    </h2>
                    <ul className="chat-conversation-rows">{items.map((c) => renderRow(c, { indent: !!c.teamId }))}</ul>
                  </section>
                );
              }))}

        {tab === 'chats' &&
          (chats.filter(matches).length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
                {query.trim() ? 'No conversations match your search.' : 'Start a one-to-one chat or a group with the people you work with.'}
              </p>
              <button type="button" onClick={onNewChat} className="mt-3 text-[12.5px] font-semibold text-[#2d628e] dark:text-sky-300 hover:underline">
                Start a new chat
              </button>
            </div>
          ) : (
            <ul className="chat-conversation-rows">{chats.filter(matches).map((c) => renderRow(c))}</ul>
          ))}

        {tab === 'hr' &&
          (myTickets.filter(matches).length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
                {query.trim() ? 'No requests match your search.' : 'Questions about leave, pay, documents or policies? Send a private request to HR and follow the reply here.'}
              </p>
              <button type="button" onClick={onNewHrRequest} className="mt-3 text-[12.5px] font-semibold text-[#2d628e] dark:text-sky-300 hover:underline">
                Ask HR a question
              </button>
            </div>
          ) : (
            <ul className="chat-conversation-rows">{myTickets.filter(matches).map((c) => renderRow(c))}</ul>
          ))}

        {tab === 'inbox' &&
          (inboxError ? (
            empty(inboxError)
          ) : hrTicketsLoading && hrTickets.length === 0 ? (
            empty('Loading requests…')
          ) : hrTickets.length === 0 ? (
            empty('No requests match these filters.')
          ) : (
            <ul className="chat-conversation-rows">{hrTickets.map((c) => renderRow(c, { showRequester: true }))}</ul>
          ))}
      </div>
    </div>
  );
}
