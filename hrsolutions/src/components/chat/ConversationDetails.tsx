'use client';

import React, { useState } from 'react';
import { Bell, BellOff, LogOut, UserPlus, X } from 'lucide-react';
import { useChat } from '@/hooks/useChat';
import type { ChatConversation } from '@/services/chatTypes';
import { HrTicketPanel } from './HrTicketPanel';
import { NewChatDialog } from './NewChatDialog';
import { ChatAvatar, buttonPrimary, buttonSecondary, fieldClass, iconButton } from './chatUi';

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin' };

export function ConversationDetails({ conversation, onClose }: { conversation: ChatConversation; onClose: () => void }) {
  const { me, online, updateConversation, addParticipants, removeParticipant } = useChat();
  const [addOpen, setAddOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(conversation.name || '');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meId = me?.employeeId;

  const isGroup = conversation.type === 'group';
  const canManage = isGroup && (conversation.myRole === 'owner' || conversation.myRole === 'admin');
  const sortedMembers = [...conversation.participants].sort((a, b) => {
    const ao = online.has(a.employeeId) ? 0 : 1;
    const bo = online.has(b.employeeId) ? 0 : 1;
    return ao - bo || a.name.localeCompare(b.name);
  });
  const onlineCount = conversation.participants.filter((p) => online.has(p.employeeId)).length;

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err?.message || 'That change could not be saved.');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="chat-details-heading flex items-center justify-between gap-2 border-b border-[var(--border-color)] px-4 py-3">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)]">Details</h2>
        <button type="button" className={iconButton} onClick={onClose} aria-label="Hide details">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="chat-details-body min-h-0 flex-1 space-y-5 overflow-y-auto custom-scrollbar px-4 py-4">
        {conversation.type === 'hr_ticket' && conversation.ticket && <HrTicketPanel conversation={conversation} />}

        {isGroup && (
          <section aria-label="Chat name">
            <h3 className="chat-details-label">Group chat</h3>
            <p className="chat-details-name">{conversation.name || 'Group chat'}</p>
            {renaming ? (
              <div className="space-y-2">
                <label htmlFor="rename-chat" className="sr-only">
                  Chat name
                </label>
                <input id="rename-chat" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} className={`${fieldClass} h-9`} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`${buttonPrimary} h-8`}
                    disabled={!name.trim()}
                    onClick={() =>
                      void run(async () => {
                        await updateConversation(conversation.id, { name: name.trim() });
                        setRenaming(false);
                      })
                    }
                  >
                    Save name
                  </button>
                  <button type="button" className={`${buttonSecondary} h-8`} onClick={() => setRenaming(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setName(conversation.name || '');
                    setRenaming(true);
                  }}
                  className={`${buttonSecondary} w-full`}
                >
                  Rename chat
                </button>
              )
            )}
          </section>
        )}

        {conversation.type === 'team_channel' && (
          <section>
            <h3 className="chat-details-label">About this channel</h3>
            <p className="chat-details-name">{conversation.name}</p>
            <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
            Everyone in {conversation.teamId ? `the ${conversation.name} team` : `the ${conversation.name} department`} is a member. Membership follows
            the org structure, so changes happen in Team &amp; Employees.
            </p>
          </section>
        )}

        {conversation.isParticipant && (
          <button
            type="button"
            onClick={() => void run(() => updateConversation(conversation.id, { muted: !conversation.muted }))}
            className={`${buttonSecondary} h-8 w-full`}
          >
            {conversation.muted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            {conversation.muted ? 'Turn notifications on' : 'Mute notifications'}
          </button>
        )}

        <section aria-label="Members">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              {conversation.type === 'hr_ticket' ? 'Visible to' : `Members · ${conversation.participants.length}`}
            </h3>
            <span className="text-[11.5px] text-[var(--text-muted)]">{onlineCount} online</span>
          </div>
          {isGroup && conversation.isParticipant && (
            <button type="button" onClick={() => setAddOpen(true)} className={`${buttonSecondary} mb-2 h-8 w-full`}>
              <UserPlus className="h-3.5 w-3.5" />
              Add people
            </button>
          )}
          <ul className="space-y-0.5">
            {sortedMembers.map((p) => (
              <li key={p.employeeId} className="group flex items-center gap-2.5 rounded-[8px] px-1.5 py-1.5 hover:bg-[var(--bg-surface-hover)]">
                <ChatAvatar name={p.name} src={p.avatarUrl} size={28} online={online.has(p.employeeId)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold text-[var(--text-primary)]">
                    {p.name}
                    {p.employeeId === meId && <span className="font-normal text-[var(--text-muted)]"> (you)</span>}
                  </span>
                  {ROLE_LABELS[p.role] && <span className="block text-[11px] text-[var(--text-muted)]">{ROLE_LABELS[p.role]}</span>}
                </span>
                {canManage && p.employeeId !== meId && p.role !== 'owner' && (
                  <button
                    type="button"
                    onClick={() => void run(() => removeParticipant(conversation.id, p.employeeId))}
                    className="rounded-[6px] px-2 py-1 text-[11px] font-semibold text-[#8b3133] hover:bg-[#faeeee] group-hover:block focus:block"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>

        {isGroup && conversation.isParticipant && (
          <section aria-label="Leave chat">
            {confirmLeave ? (
              <div className="rounded-[8px] border border-[#8b3133]/25 bg-[#faeeee] dark:bg-red-500/10 px-3 py-2.5">
                <p className="text-[12.5px] text-[#8b3133] dark:text-red-200">You will stop receiving messages from this chat.</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void run(() => removeParticipant(conversation.id, meId!))}
                    className="h-8 rounded-[7px] bg-[#8b3133] px-3 text-[12px] font-semibold text-white hover:bg-[#742729]"
                  >
                    Leave chat
                  </button>
                  <button type="button" onClick={() => setConfirmLeave(false)} className={`${buttonSecondary} h-8`}>
                    Stay
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#8b3133] dark:text-red-300 hover:underline"
              >
                <LogOut className="h-3.5 w-3.5" />
                Leave chat
              </button>
            )}
          </section>
        )}

        {error && <p className="text-[12px] text-[#8b3133] dark:text-red-300">{error}</p>}
      </div>

      <NewChatDialog
        open={addOpen}
        mode="add"
        excludeIds={conversation.participants.map((p) => p.employeeId)}
        onClose={() => setAddOpen(false)}
        onSubmit={({ participantIds }) => addParticipants(conversation.id, participantIds)}
      />
    </div>
  );
}
