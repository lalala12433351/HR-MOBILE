'use client';

import React, { useState, useEffect } from 'react';
import {
  Mail,
  Send,
  Inbox,
  Star,
  Archive,
  Trash2,
  RefreshCw,
  Plus,
  Search,
  CheckCircle2,
  Sparkles,
  Loader2,
  ExternalLink,
  Reply,
  Forward,
  ListTodo,
  UserPlus,
  AlertCircle,
  Tag,
  Clock,
  Check,
  Paperclip,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  initGoogleWorkspaceAuth,
  googleWorkspaceSignIn,
} from '../../services/googleDrive';
import {
  listGmailMessages,
  getGmailMessage,
  sendGmailEmail,
  modifyGmailMessageLabels,
  GmailMessageDetail,
} from '../../services/gmail';
import { AppState } from '../../services/store';
import { Task, Lead } from '../../types';

interface GmailComponentProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onTriggerToast?: (toast: any) => void;
}

export const GmailComponent: React.FC<GmailComponentProps> = ({
  state,
  onUpdateState,
  onTriggerToast,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Mailbox Folders & Search
  const [activeFolder, setActiveFolder] = useState<'inbox' | 'starred' | 'sent' | 'trash'>('inbox');
  const [searchQuery, setSearchQuery] = useState('');

  // Messages List
  const [messages, setMessages] = useState<GmailMessageDetail[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<GmailMessageDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Compose Modal
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const unsubscribe = initGoogleWorkspaceAuth(
      (u, token) => {
        setUser(u);
        setAccessToken(token);
        setIsLoadingAuth(false);
        fetchMessages(token, activeFolder, searchQuery);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setIsLoadingAuth(false);
        setMessages([]);
        setSelectedMessageId(null);
        setSelectedMessage(null);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (accessToken) {
      fetchMessages(accessToken, activeFolder, searchQuery);
    }
  }, [activeFolder]);

  const handleConnectGoogle = async () => {
    setIsLoadingAuth(true);
    setErrorMsg(null);
    try {
      const res = await googleWorkspaceSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        fetchMessages(res.accessToken, activeFolder, searchQuery);
        if (onTriggerToast) {
          onTriggerToast({
            type: 'system',
            title: 'Gmail API Connected',
            senderName: 'Gmail API v1',
            message: `Authenticated as ${res.user.email}`,
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to authenticate with Gmail API');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const fetchMessages = async (token: string, folder: string, query: string = '') => {
    setIsLoadingMessages(true);
    setErrorMsg(null);

    let folderQuery = '';
    if (folder === 'starred') folderQuery = 'is:starred';
    else if (folder === 'sent') folderQuery = 'is:sent';
    else if (folder === 'trash') folderQuery = 'is:trash';
    else folderQuery = 'category:primary';

    const fullQuery = [folderQuery, query].filter(Boolean).join(' ');

    try {
      const msgRefs = await listGmailMessages(token, fullQuery, 15);

      if (msgRefs.length === 0) {
        setMessages([]);
        setSelectedMessage(null);
        setIsLoadingMessages(false);
        return;
      }

      // Fetch details for top messages
      const detailsPromises = msgRefs.slice(0, 10).map((ref) => getGmailMessage(token, ref.id));
      const details = await Promise.all(detailsPromises);

      setMessages(details);
      if (details.length > 0 && !selectedMessageId) {
        setSelectedMessageId(details[0].id);
        setSelectedMessage(details[0]);
      }
    } catch (err: any) {
      console.error('Fetch Gmail error:', err);
      setErrorMsg('Could not fetch messages directly from Gmail.');
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleSelectMessage = async (msg: GmailMessageDetail) => {
    setSelectedMessageId(msg.id);
    setSelectedMessage(msg);

    // If fetching full body via token
    if (accessToken && (!msg.bodyText || msg.bodyText === msg.snippet)) {
      setIsLoadingDetail(true);
      try {
        const full = await getGmailMessage(accessToken, msg.id);
        setSelectedMessage(full);
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? full : m)));
      } catch (err) {
        console.error('Error fetching full email detail:', err);
      } finally {
        setIsLoadingDetail(false);
      }
    }
  };

  const handleToggleStar = async (msgId: string, currentStarred?: boolean) => {
    // Optimistic UI update
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, isStarred: !currentStarred } : m))
    );
    if (selectedMessage && selectedMessage.id === msgId) {
      setSelectedMessage({ ...selectedMessage, isStarred: !currentStarred });
    }

    if (accessToken) {
      try {
        await modifyGmailMessageLabels(
          accessToken,
          msgId,
          currentStarred ? [] : ['STARRED'],
          currentStarred ? ['STARRED'] : []
        );
      } catch (err) {
        console.error('Failed to toggle star in Gmail:', err);
      }
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeTo.trim() || !composeSubject.trim() || !composeBody.trim()) {
      setErrorMsg('Please fill in Recipient, Subject, and Body fields.');
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    try {
      if (accessToken) {
        await sendGmailEmail(accessToken, {
          to: composeTo,
          subject: composeSubject,
          body: composeBody,
        });

        if (onTriggerToast) {
          onTriggerToast({
            type: 'task',
            title: 'Email Sent via Gmail',
            senderName: 'Gmail API v1',
            message: `Successfully delivered email to ${composeTo}`,
          });
        }
      } else {
        // Fallback demo toast
        if (onTriggerToast) {
          onTriggerToast({
            type: 'task',
            title: 'Email Outbound Logged',
            senderName: 'Workspace Mail',
            message: `Outbound email dispatched to ${composeTo}`,
          });
        }
      }

      // Add to local sent view
      const newSent: GmailMessageDetail = {
        id: `sent_${Date.now()}`,
        threadId: `thread_${Date.now()}`,
        labelIds: ['SENT'],
        from: state.currentPersona.name,
        to: composeTo,
        subject: composeSubject,
        snippet: composeBody.substring(0, 80),
        date: new Date().toLocaleString(),
        bodyText: composeBody,
        isRead: true,
        isStarred: false,
      };

      setMessages([newSent, ...messages]);
      setSelectedMessageId(newSent.id);
      setSelectedMessage(newSent);

      setShowComposeModal(false);
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to send email via Gmail API');
    } finally {
      setIsSending(false);
    }
  };

  const handleConvertEmailToTask = (msg: GmailMessageDetail) => {
    const newTask: Task = {
      id: `tsk_gmail_${Date.now()}`,
      projectId: state.projects[0]?.id || 'prj_1',
      projectName: state.projects[0]?.name || 'Core Operations',
      title: `[Email Follow-up] ${msg.subject}`,
      description: `Action item derived from Gmail message.\nSender: ${msg.from}\n\nEmail Content Snippet:\n${msg.snippet}`,
      status: 'In Progress',
      priority: 'High',
      assigneeId: state.currentPersona.id || '',
      assigneeName: state.currentPersona.name,
      assigneeAvatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
      reporterName: msg.from || 'External Contact',
      startDate: new Date().toISOString().substring(0, 10),
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString().substring(0, 10),
      estimatedHours: 4,
      actualHours: 0,
      tags: ['Gmail', 'Email Action', 'Inbound'],
      subtasks: [],
      commentsCount: 0,
    };

    onUpdateState((prev) => ({
      ...prev,
      tasks: [newTask, ...prev.tasks],
    }));

    if (onTriggerToast) {
      onTriggerToast({
        type: 'task',
        title: 'Task Created from Email!',
        senderName: 'Gmail Automation Hook',
        message: `Task "${newTask.title}" added to Workspace Tasks.`,
      });
    }
  };

  const handleConvertEmailToLead = (msg: GmailMessageDetail) => {
    const newLead: Lead = {
      id: `lead_gmail_${Date.now()}`,
      name: msg.from ? msg.from.split('<')[0].trim() : 'Email Lead',
      company: msg.from && msg.from.includes('@') ? msg.from.split('@')[1].split('>')[0] : 'Inbound Client',
      email: msg.from && msg.from.includes('<') ? msg.from.split('<')[1].replace('>', '') : 'contact@client.com',
      phone: '+1-555-0182',
      source: 'Website',
      status: 'New',
      score: 85,
      value: 12500,
      assignedTo: state.currentPersona.name,
      createdDate: new Date().toISOString().substring(0, 10),
    };

    onUpdateState((prev) => ({
      ...prev,
      leads: [newLead, ...prev.leads],
    }));

    if (onTriggerToast) {
      onTriggerToast({
        type: 'crm',
        title: 'CRM Lead Logged!',
        senderName: 'Gmail CRM Sync',
        message: `Logged contact "${newLead.name}" as New Lead ($12,500).`,
      });
    }
  };

  const handleReplyToMessage = (msg: GmailMessageDetail) => {
    setComposeTo(msg.from ? (msg.from.includes('<') ? msg.from.split('<')[1].replace('>', '') : msg.from) : '');
    setComposeSubject(msg.subject?.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`);
    setComposeBody(`\n\n--- Original Message from ${msg.from} ---\n> ${msg.bodyText?.split('\n').join('\n> ')}`);
    setShowComposeModal(true);
  };

  return (
    <div className="space-y-6">
      {/* Banner & Google OAuth Status */}
      <div className="rounded-2xl border border-rose-200 bg-gradient-to-r from-slate-950 via-rose-950 to-slate-900 p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Mail className="h-56 w-56 text-rose-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/20 px-3 py-1 border border-rose-400/30 text-[11px] font-bold text-rose-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Gmail API v1 Full Integration
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Mail className="h-6 w-6 text-rose-400" />
              Gmail Inbox & Workspace Automation Engine
            </h2>
            <p className="text-xs text-rose-100/80 leading-relaxed">
              Read, compose, and manage Gmail messages live. Convert inbound client emails into active Workspace Tasks or CRM Leads with 1-click automation hooks.
            </p>
          </div>

          {/* Auth Card */}
          <div className="shrink-0 rounded-2xl bg-white/10 border border-white/15 p-4 flex flex-col items-center justify-center min-w-[240px]">
            {isLoadingAuth ? (
              <div className="flex items-center gap-2 text-xs font-bold text-rose-200">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying Session...
              </div>
            ) : user ? (
              <div className="w-full space-y-2.5 text-center">
                <div className="flex items-center gap-2.5 text-left bg-white/10 p-2 rounded-xl border border-white/10">
                  <img
                    src={user.photoURL || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'}
                    alt="User Avatar"
                    className="h-8 w-8 rounded-full border border-rose-300"
                  />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">{user.displayName || 'Google User'}</p>
                    <p className="text-[10px] text-rose-200 truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded-full border border-rose-400/30">
                    Gmail Scopes Active
                  </span>
                  <button
                    onClick={() => fetchMessages(accessToken!, activeFolder, searchQuery)}
                    className="text-[10px] font-bold text-rose-200 hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Sync Mail
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full space-y-3 text-center">
                <p className="text-xs text-rose-100 font-medium">Connect Gmail Account:</p>
                <button
                  onClick={handleConnectGoogle}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-slate-900 px-4 py-2.5 text-xs font-extrabold hover:bg-slate-100 transition-all shadow-md"
                >
                  <Mail className="h-4 w-4 text-rose-600" /> Connect Gmail
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Bar */}
      {errorMsg && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Mailbox Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[640px] rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
        {/* Sidebar Folder Selector */}
        <div className="lg:col-span-3 border-r border-slate-200 bg-slate-50/50 p-4 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <button
              onClick={() => setShowComposeModal(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white p-3 text-xs font-extrabold shadow-md transition-all active:scale-95"
            >
              <Plus className="h-4 w-4" /> Compose Email
            </button>

            <div className="space-y-1">
              {[
                { id: 'inbox', label: 'Inbox', icon: Inbox, badge: messages.length },
                { id: 'starred', label: 'Starred', icon: Star },
                { id: 'sent', label: 'Sent', icon: Send },
                { id: 'trash', label: 'Trash', icon: Trash2 },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFolder(f.id as any)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-bold transition-all ${
                    activeFolder === f.id
                      ? 'bg-rose-100 text-rose-950 font-bold shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-200/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <f.icon className={`h-4 w-4 ${activeFolder === f.id ? 'text-rose-600' : 'text-slate-500'}`} />
                    <span>{f.label}</span>
                  </div>
                  {f.badge !== undefined && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-700 font-bold">
                      {f.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Automation Tip */}
          <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-[11px] text-rose-900 space-y-1">
            <p className="font-extrabold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-rose-600" /> Automation Hooks
            </p>
            <p className="text-slate-600 text-[10px] leading-relaxed">
              Select any email to automatically generate Workspace Tasks or register new CRM Leads.
            </p>
          </div>
        </div>

        {/* Message List */}
        <div className="lg:col-span-4 border-r border-slate-200 space-y-2 p-3 flex flex-col">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && accessToken && fetchMessages(accessToken, activeFolder, searchQuery)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-2 text-xs outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {isLoadingMessages ? (
              <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-rose-600" /> Fetching Gmail items...
              </div>
            ) : messages.length > 0 ? (
              messages.map((m) => (
                <div
                  key={m.id}
                  onClick={() => handleSelectMessage(m)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all space-y-1 relative ${
                    selectedMessageId === m.id
                      ? 'border-rose-400 bg-rose-50/50 shadow-2xs'
                      : 'border-slate-100 hover:bg-slate-50'
                  } ${!m.isRead ? 'font-bold text-slate-900 bg-white' : 'text-slate-600'}`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate max-w-[170px] font-bold text-slate-900">
                      {m.from ? m.from.split('<')[0] : 'Sender'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleStar(m.id, m.isStarred);
                      }}
                      className="p-1 text-amber-400 hover:scale-110 transition-transform"
                    >
                      <Star className={`h-3.5 w-3.5 ${m.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    </button>
                  </div>

                  <p className="text-xs font-bold truncate text-slate-800">{m.subject}</p>
                  <p className="text-[11px] text-slate-500 line-clamp-1">{m.snippet}</p>

                  <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-100">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400" /> {m.date?.split(',')[0]}
                    </span>
                    {!m.isRead && (
                      <span className="bg-rose-600 text-white text-[9px] px-1.5 py-0.2 font-extrabold rounded-full">
                        UNREAD
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                No emails found in this folder.
              </div>
            )}
          </div>
        </div>

        {/* Selected Message Detail & Automation Actions */}
        <div className="lg:col-span-5 p-5 flex flex-col justify-between overflow-y-auto bg-slate-50/30 space-y-4">
          {isLoadingDetail ? (
            <div className="m-auto text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-rose-600" /> Loading full message body...
            </div>
          ) : selectedMessage ? (
            <div className="space-y-4 flex-1 flex flex-col justify-between">
              <div className="space-y-4">
                {/* Header Actions */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReplyToMessage(selectedMessage)}
                      className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs"
                    >
                      <Reply className="h-3.5 w-3.5 text-rose-600" /> Reply
                    </button>

                    <button
                      onClick={() => handleToggleStar(selectedMessage.id, selectedMessage.isStarred)}
                      className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1 shadow-2xs"
                    >
                      <Star className={`h-3.5 w-3.5 ${selectedMessage.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleConvertEmailToTask(selectedMessage)}
                      className="p-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-extrabold flex items-center gap-1 border border-blue-200 shadow-2xs"
                    >
                      <ListTodo className="h-3.5 w-3.5 text-blue-600" /> + Task
                    </button>

                    <button
                      onClick={() => handleConvertEmailToLead(selectedMessage)}
                      className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-extrabold flex items-center gap-1 border border-emerald-200 shadow-2xs"
                    >
                      <UserPlus className="h-3.5 w-3.5 text-emerald-600" /> + CRM Lead
                    </button>
                  </div>
                </div>

                {/* Email Subject & Meta */}
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-slate-900 leading-snug">
                    {selectedMessage.subject}
                  </h3>

                  <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs space-y-1 shadow-2xs">
                    <div className="flex justify-between font-bold text-slate-800">
                      <span>From: {selectedMessage.from}</span>
                      <span className="text-[10px] text-slate-400 font-medium">{selectedMessage.date}</span>
                    </div>
                    <p className="text-[11px] text-slate-500">To: {selectedMessage.to}</p>
                  </div>
                </div>

                {/* Email Body */}
                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-800 font-sans min-h-[180px] whitespace-pre-wrap shadow-2xs">
                  {selectedMessage.bodyText}
                </div>
              </div>

              {/* Bottom Quick Reply Prompt */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span className="text-[11px]">Need to follow up on this thread?</span>
                <button
                  onClick={() => handleReplyToMessage(selectedMessage)}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-xs flex items-center gap-1"
                >
                  <Send className="h-3 w-3" /> Quick Reply
                </button>
              </div>
            </div>
          ) : (
            <div className="m-auto text-center text-slate-400 text-xs space-y-2">
              <Mail className="h-8 w-8 mx-auto text-slate-300" />
              <p>Select a message from the list to view its contents.</p>
            </div>
          )}
        </div>
      </div>

      {/* Compose Email Modal */}
      {showComposeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-rose-600 text-white">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Compose Gmail Message</h3>
                  <p className="text-xs text-slate-500">Sends directly via Gmail API v1</p>
                </div>
              </div>
              <button
                onClick={() => setShowComposeModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">To (Recipient Email) *</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. client@enterprise.com"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Subject *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Project Deliverable Status Update"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-800">Message Body *</label>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-slate-400">Templates:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setComposeSubject('Project Status Update');
                        setComposeBody(`Hi,\n\nHere is a quick update regarding our project progress. All scheduled milestones are currently on track.\n\nPlease let me know if you have any questions.\n\nBest regards,\n${state.currentPersona.name}`);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
                    >
                      Status Update
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setComposeSubject('Invoice Payment Follow-up');
                        setComposeBody(`Hi,\n\nThis is a gentle reminder regarding the outstanding invoice for our recent services. Please confirm once the payment has been processed.\n\nThank you,\n${state.currentPersona.name}`);
                      }}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700"
                    >
                      Payment Reminder
                    </button>
                  </div>
                </div>
                <textarea
                  rows={7}
                  required
                  placeholder="Type your email message here..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-rose-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowComposeModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md flex items-center gap-1.5"
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send Email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
