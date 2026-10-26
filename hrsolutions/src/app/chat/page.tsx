'use client';

import '@/components/chat/chat.css';
import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Info, MessageSquarePlus, LifeBuoy, WifiOff } from 'lucide-react';
import { conversationTitle, useChat } from '@/hooks/useChat';
import type { ChatConversation, ChatMessage } from '@/services/chatTypes';
import { ConversationList, type ChatTab } from '@/components/chat/ConversationList';
import { MessageList } from '@/components/chat/MessageList';
import { Composer } from '@/components/chat/Composer';
import { ConversationDetails } from '@/components/chat/ConversationDetails';
import { NewChatDialog } from '@/components/chat/NewChatDialog';
import { NewHrRequestDialog } from '@/components/chat/NewHrRequestDialog';
import {
  ChatAvatar,
  ChatChannelMark,
  TICKET_STATUS_LABELS,
  buttonPrimary,
  buttonSecondary,
  iconButton,
  ticketStatusClass,
} from '@/components/chat/chatUi';

function tabFor(conversation: ChatConversation, meId: string | undefined, isHr: boolean): ChatTab {
  if (conversation.type === 'team_channel') return 'teams';
  if (conversation.type === 'hr_ticket') return conversation.createdBy === meId || !isHr ? 'hr' : 'inbox';
  return 'chats';
}

function ChatShellMessage({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="chat-workspace">
      <div className="chat-empty flex">
        <div className="chat-empty-copy">
          <h1>{title}</h1>
          <p>{body}</p>
          {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
      </div>
    </div>
  );
}

function ChatLoading() {
  return (
    <div className="chat-workspace" aria-busy="true">
      <div className="chat-rail hidden flex-col space-y-3 p-4 md:flex">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--bg-surface-subtle)]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--bg-surface-subtle)]" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-[var(--bg-surface-subtle)]" />
            </div>
          </div>
        ))}
      </div>
      <div className="chat-stage" />
    </div>
  );
}

function ThreadHeader({
  conversation,
  onBack,
  detailsOpen,
  onToggleDetails,
}: {
  conversation: ChatConversation;
  onBack: () => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const { me, isHr, online, updateHrTicket } = useChat();
  const meId = me?.employeeId;
  const title = conversationTitle(conversation, meId);
  const other = conversation.type === 'direct' ? conversation.participants.find((p) => p.employeeId !== meId) : null;
  const memberCount = conversation.participants.length;
  const onlineCount = conversation.participants.filter((p) => online.has(p.employeeId)).length;
  const [ticketSaving, setTicketSaving] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const ticket = conversation.type === 'hr_ticket' ? conversation.ticket : undefined;

  const setTicketStatus = async (status: 'resolved' | 'closed') => {
    if (ticketSaving) return;
    setTicketSaving(status);
    setTicketError(null);
    try {
      await updateHrTicket(conversation.id, { status });
    } catch (err: unknown) {
      setTicketError(err instanceof Error ? err.message : 'The request could not be updated.');
    } finally {
      setTicketSaving(null);
    }
  };

  let subtitle: React.ReactNode;
  if (conversation.type === 'direct') {
    subtitle = other && online.has(other.employeeId) ? 'Online' : 'Offline';
  } else if (conversation.type === 'hr_ticket' && conversation.ticket) {
    subtitle = (
      <span className="flex items-center gap-1.5">
        <span className={`rounded-full px-1.5 py-px text-[11px] font-semibold ${ticketStatusClass(conversation.ticket.status)}`}>
          {TICKET_STATUS_LABELS[conversation.ticket.status]}
        </span>
        <span className="truncate">
          {conversation.ticket.category}
          {conversation.ticket.assignedHrName ? ` · Handled by ${conversation.ticket.assignedHrName}` : ''}
        </span>
      </span>
    );
  } else {
    const scope =
      conversation.type === 'team_channel'
        ? conversation.teamId
          ? `${conversation.departmentName || 'Team'} · `
          : 'Department channel · '
        : '';
    subtitle = `${scope}${memberCount} ${memberCount === 1 ? 'member' : 'members'} · ${onlineCount} online`;
  }

  return (
    <header className="chat-thread-head">
      <button type="button" onClick={onBack} className={`${iconButton} md:hidden`} aria-label="Back to conversations">
        <ArrowLeft className="h-4 w-4" />
      </button>
      {conversation.type === 'team_channel' ? (
        <ChatChannelMark conversation={conversation} className="h-9 w-9" />
      ) : (
        <ChatAvatar
          name={conversation.type === 'hr_ticket' ? 'HR' : title}
          src={other?.avatarUrl}
          size={36}
          square={conversation.type === 'hr_ticket' || conversation.type === 'group'}
          online={other ? online.has(other.employeeId) : undefined}
        />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="chat-thread-title">{title}</h1>
        <div className="chat-thread-meta">{subtitle}</div>
      </div>
      {isHr && ticket && ticket.status !== 'closed' && (
        <div className="flex shrink-0 items-center gap-1.5">
          {ticketError && (
            <span className="hidden max-w-[140px] truncate text-[11px] text-[#8b3133] sm:inline" title={ticketError}>
              {ticketError}
            </span>
          )}
          {ticket.status !== 'resolved' && (
            <button
              type="button"
              disabled={ticketSaving !== null}
              onClick={() => void setTicketStatus('resolved')}
              className={`${buttonSecondary} h-8 px-2.5 text-[12px]`}
            >
              {ticketSaving === 'resolved' ? 'Saving…' : 'Resolve'}
            </button>
          )}
          <button
            type="button"
            disabled={ticketSaving !== null}
            onClick={() => void setTicketStatus('closed')}
            className={`${buttonPrimary} h-8 px-2.5 text-[12px]`}
          >
            {ticketSaving === 'closed' ? 'Saving…' : 'Close'}
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={onToggleDetails}
        aria-pressed={detailsOpen}
        className={`${iconButton} ${detailsOpen ? 'bg-[#f8fbfe] dark:bg-white/10 text-[var(--text-primary)]' : ''}`}
        aria-label={detailsOpen ? 'Hide details' : 'Show details'}
      >
        <Info className="h-4 w-4" />
      </button>
    </header>
  );
}

function EmptyThread({ tab, onNewChat, onNewHrRequest }: { tab: ChatTab; onNewChat: () => void; onNewHrRequest: () => void }) {
  const copy: Record<ChatTab, { title: string; body: string }> = {
    teams: {
      title: 'Your team channels',
      body: 'Every team and department you belong to has a channel. Pick one on the left to catch up.',
    },
    chats: {
      title: 'Chat with anyone at work',
      body: 'Start a private chat with one person, or bring a few people together in a group.',
    },
    hr: {
      title: 'Ask HR',
      body: 'Questions about pay, leave, documents or policies go straight to the HR team. You can follow every request here.',
    },
    inbox: {
      title: 'HR Inbox',
      body: 'Pick a request to reply, assign it, or update its status.',
    },
  };
  return (
    <div className="chat-empty hidden h-full flex-1 items-center justify-center md:flex">
      <div className="chat-empty-copy">
        <h2>{copy[tab].title}</h2>
        <p>{copy[tab].body}</p>
        {tab === 'chats' && (
          <button type="button" onClick={onNewChat} className={`${buttonPrimary} mt-4`}>
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </button>
        )}
        {tab === 'hr' && (
          <button type="button" onClick={onNewHrRequest} className={`${buttonPrimary} mt-4`}>
            <LifeBuoy className="h-4 w-4" />
            New HR request
          </button>
        )}
      </div>
    </div>
  );
}

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('c');
  const chat = useChat();
  const {
    enabled,
    ready,
    connected,
    unavailableReason,
    me,
    isHr,
    conversationsById,
    messages,
    typing,
    openConversation,
    closeConversation,
    loadOlder,
    sendMessage,
    retryMessage,
    discardMessage,
    editMessage,
    toggleReaction,
    createConversation,
    notifyTyping,
    getAttachmentUrl,
  } = chat;

  const [tab, setTab] = useState<ChatTab>('teams');
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [hrRequestOpen, setHrRequestOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const syncedTabFor = useRef<string | null>(null);

  const conversation = selectedId ? conversationsById[selectedId] : undefined;
  const meId = me?.employeeId;

  const select = useCallback((id: string | null) => router.replace(id ? `/chat?c=${id}` : '/chat', { scroll: false }), [router]);

  useEffect(() => {
    if (!ready || !me) return;
    setReplyTo(null);
    setOpenError(null);
    if (!selectedId) {
      closeConversation();
      return;
    }
    openConversation(selectedId).catch((err: Error) => setOpenError(err?.message || 'This conversation could not be opened.'));
  }, [ready, me, selectedId, openConversation, closeConversation]);

  useEffect(() => () => closeConversation(), [closeConversation]);

  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (conversation) loadedId.current = conversation.id;
    else if (selectedId && loadedId.current === selectedId) {
      loadedId.current = null;
      select(null);
    }
  }, [conversation, selectedId, select]);

  useEffect(() => {
    if (!conversation || syncedTabFor.current === conversation.id) return;
    syncedTabFor.current = conversation.id;
    setTab(tabFor(conversation, meId, isHr));
    setDetailsOpen(window.matchMedia('(min-width: 1280px)').matches && conversation.type !== 'direct');
  }, [conversation, meId, isHr]);

  const openAttachment = useCallback(
    async (attachmentId: string) => {
      const win = window.open('', '_blank');
      if (win) win.opener = null;
      try {
        const url = await getAttachmentUrl(attachmentId);
        if (win) win.location.href = url;
        else window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        win?.close();
      }
    },
    [getAttachmentUrl]
  );

  if (!enabled) {
    return (
      <ChatShellMessage
        title="Chat isn't available for this account"
        body="Team chat is for staff accounts. If you think you should have access, ask your administrator."
      />
    );
  }

  if (unavailableReason) {
    return <ChatShellMessage title="Chat isn't set up for you yet" body={unavailableReason} />;
  }

  if (!ready || !me) return <ChatLoading />;

  const ticketClosed = conversation?.type === 'hr_ticket' && conversation.ticket?.status === 'closed';
  const hrCanJoin = conversation?.type === 'hr_ticket' && isHr;
  const canInteract = !!conversation && (conversation.isParticipant || hrCanJoin);

  let disabledReason: string | null = null;
  if (conversation) {
    if (ticketClosed) disabledReason = 'This request is closed. Start a new request if you need more help.';
    else if (!canInteract) disabledReason = "You're viewing this conversation but aren't a member, so you can't post here.";
  }

  const placeholder = !conversation
    ? ''
    : conversation.type === 'hr_ticket'
    ? conversation.isParticipant
      ? 'Reply to this request'
      : 'Reply to take part in this request'
    : `Message ${conversationTitle(conversation, meId)}`;

  const typingUsers = conversation ? (typing[conversation.id] || []).filter((u) => u.employeeId !== meId) : [];

  return (
    <div className="chat-workspace" data-conversation-open={Boolean(selectedId)}>
      <aside
        aria-label="Conversations"
        className={`chat-rail flex-col ${selectedId ? 'hidden md:flex' : 'flex'}`}
      >
        <ConversationList
          tab={tab}
          onTabChange={(nextTab) => {
            setTab(nextTab);
            select(null);
            setDetailsOpen(false);
          }}
          activeId={selectedId}
          onSelect={select}
          onNewChat={() => setNewChatOpen(true)}
          onNewHrRequest={() => setHrRequestOpen(true)}
        />
      </aside>

      <section aria-label="Conversation" className={`chat-stage ${selectedId ? 'flex' : 'hidden md:flex'}`}>
        {!connected && (
          <div role="status" className="chat-reconnect">
            <WifiOff className="h-3.5 w-3.5" />
            Reconnecting… new messages will appear when you are back online.
          </div>
        )}

        {!selectedId && <EmptyThread tab={tab} onNewChat={() => setNewChatOpen(true)} onNewHrRequest={() => setHrRequestOpen(true)} />}

        {selectedId && !conversation && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            {openError ? (
              <>
                <p className="max-w-sm text-[13px] text-[var(--text-secondary)]">{openError}</p>
                <button type="button" className={buttonSecondary} onClick={() => select(null)}>
                  Back to conversations
                </button>
              </>
            ) : (
              <p className="text-[13px] text-[var(--text-muted)]">Opening conversation…</p>
            )}
          </div>
        )}

        {conversation && (
          <div className="flex min-h-0 flex-1">
            <div className={`${detailsOpen ? 'chat-thread--with-details' : ''} chat-thread flex`}>
              <ThreadHeader
                conversation={conversation}
                onBack={() => select(null)}
                detailsOpen={detailsOpen}
                onToggleDetails={() => setDetailsOpen((v) => !v)}
              />
              <MessageList
                conversation={conversation}
                bucket={messages[conversation.id]}
                meId={me.employeeId}
                canInteract={canInteract && !ticketClosed}
                typing={typingUsers}
                onLoadOlder={() => void loadOlder(conversation.id)}
                onReply={(m) => setReplyTo(m)}
                onReact={(m, emoji) => void toggleReaction(m, emoji)}
                onEdit={(m, body) => editMessage(m.id, conversation.id, body)}
                onRetry={(m) => m.clientId && void retryMessage(conversation.id, m.clientId)}
                onDiscard={(m) => m.clientId && discardMessage(conversation.id, m.clientId)}
                onOpenAttachment={(id) => void openAttachment(id)}
                onResolveAttachmentUrl={getAttachmentUrl}
              />
              <Composer
                conversationId={conversation.id}
                placeholder={placeholder}
                disabledReason={disabledReason}
                replyTo={replyTo}
                participants={conversation.participants}
                meId={me.employeeId}
                onCancelReply={() => setReplyTo(null)}
                onSend={({ body, parentMessageId, files }) => {
                  setReplyTo(null);
                  void sendMessage(conversation.id, { body, parentMessageId, files });
                }}
                onTyping={() => notifyTyping(conversation.id)}
              />
            </div>

            {detailsOpen && (
              <aside
                aria-label="Conversation details"
                className="chat-details flex"
              >
                <ConversationDetails key={conversation.id} conversation={conversation} onClose={() => setDetailsOpen(false)} />
              </aside>
            )}
          </div>
        )}
      </section>

      <NewChatDialog
        open={newChatOpen}
        mode="new"
        onClose={() => setNewChatOpen(false)}
        onSubmit={async ({ participantIds, name }) => {
          const created = await createConversation({
            type: participantIds.length === 1 ? 'direct' : 'group',
            participantIds,
            name,
          });
          setTab('chats');
          select(created.id);
        }}
      />

      <NewHrRequestDialog
        open={hrRequestOpen}
        onClose={() => setHrRequestOpen(false)}
        onCreated={(created) => {
          setTab('hr');
          select(created.id);
        }}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<ChatLoading />}>
      <ChatPageInner />
    </Suspense>
  );
}
