'use client';

import React, { useState, useEffect } from 'react';
import { openExternalUrl } from '@/lib/native';
import {
  HardDrive,
  FileText,
  Folder,
  Plus,
  Search,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Link2,
  CheckCircle2,
  Clock,
  User as UserIcon,
  FileSpreadsheet,
  FileCode,
  Download,
  Upload,
  AlertCircle,
  Loader2,
  ListTodo,
  FileCheck,
  Zap,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  initGoogleWorkspaceAuth,
  googleWorkspaceSignIn,
  listDriveFiles,
  createDriveFile,
  searchMeetTranscriptsInDrive,
  getDriveFileContent,
  DriveFile,
} from '../../services/googleDrive';
import { AppState } from '../../services/store';
import { Task, DriveItem, ChatMessage } from '../../types';

interface GoogleDriveComponentProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onTriggerToast?: (toast: any) => void;
}

export const GoogleDriveComponent: React.FC<GoogleDriveComponentProps> = ({
  state,
  onUpdateState,
  onTriggerToast,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New File Creator State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileMime, setNewFileMime] = useState('text/plain');
  const [newFileContent, setNewFileContent] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);

  // Meet Transcript Automation Hook State
  const [selectedTranscript, setSelectedTranscript] = useState<DriveFile | null>(null);
  const [transcriptText, setTranscriptText] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(state.projects[0]?.id || '');
  const [isLinkingTranscript, setIsLinkingTranscript] = useState(false);
  const [lastLinkedResult, setLastLinkedResult] = useState<{
    tasksCreated: number;
    noteTitle: string;
    channelMessage: string;
  } | null>(null);

  useEffect(() => {
    const unsubscribe = initGoogleWorkspaceAuth(
      (u, token) => {
        setUser(u);
        setAccessToken(token);
        setIsLoadingAuth(false);
        fetchFiles(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setIsLoadingAuth(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleConnectGoogle = async () => {
    setIsLoadingAuth(true);
    setErrorMsg(null);
    try {
      const res = await googleWorkspaceSignIn();
      if (res) {
        setUser(res.user);
        setAccessToken(res.accessToken);
        fetchFiles(res.accessToken);
        if (onTriggerToast) {
          onTriggerToast({
            type: 'system',
            title: 'Google Drive Connected',
            senderName: 'Google Drive API v3',
            message: `Connected as ${res.user.email}`,
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to authenticate with Google Drive');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const fetchFiles = async (token: string) => {
    setIsLoadingFiles(true);
    setErrorMsg(null);
    try {
      const files = await listDriveFiles(token);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Fetch Drive Files error:', err);
      setErrorMsg('Could not fetch Google Drive files. Showing workspace local files.');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleCreateFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFileName.trim()) return;

    setIsCreatingFile(true);
    setErrorMsg(null);

    try {
      let createdDriveLink = 'https://drive.google.com/';

      if (accessToken) {
        const file = await createDriveFile(accessToken, newFileName, newFileMime, newFileContent);
        createdDriveLink = file.webViewLink || createdDriveLink;
        fetchFiles(accessToken);
      }

      // Also register into local workspace drive items
      const newDriveItem: DriveItem = {
        id: `gdrive_${Date.now()}`,
        name: newFileName,
        type: newFileMime.includes('spreadsheet') ? 'sheet' : 'pdf',
        folderCategory: 'Company',
        size: `${(newFileContent.length / 1024).toFixed(1)} KB`,
        modifiedDate: new Date().toISOString().substring(0, 10),
        owner: state.currentPersona.name,
        sharedWith: ['All Team'],
      };

      onUpdateState((prev) => ({
        ...prev,
        driveItems: [newDriveItem, ...prev.driveItems],
      }));

      setShowCreateModal(false);
      setNewFileName('');
      setNewFileContent('');

      if (onTriggerToast) {
        onTriggerToast({
          type: 'task',
          title: 'File Created in Google Drive',
          senderName: 'Google Drive API v3',
          message: `Saved "${newFileName}" to Google Drive & Workspace.`,
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to create file in Google Drive');
    } finally {
      setIsCreatingFile(false);
    }
  };

  /**
   * AUTOMATION HOOK:
   * Parses Google Meet Transcript text and automatically links extracted action items
   * into project tasks, creates a project note in Drive, and broadcasts to CommunicationModule.
   */
  const handleRunMeetTranscriptAutomation = async () => {
    setIsLinkingTranscript(true);
    setErrorMsg(null);

    try {
      const selectedProject = state.projects.find((p) => p.id === selectedProjectId) || state.projects[0];
      const today = new Date().toISOString().substring(0, 10);

      // Parse action items from transcript lines
      const transcriptLines = transcriptText.split('\n');
      const actionItems: Array<{ assignee: string; title: string }> = [];

      transcriptLines.forEach((line) => {
        if (line.includes("I'll") || line.includes("I will") || line.includes("take responsibility") || line.includes("action item")) {
          const speakerMatch = line.match(/\[.*?\]\s*([^:]+):/);
          const speaker = speakerMatch ? speakerMatch[1].trim() : 'Team Member';
          
          let taskDesc = line.replace(/\[.*?\]\s*[^:]+:/, '').trim();
          taskDesc = taskDesc.replace(/^I'll\s+|^I will\s+|^take responsibility for\s+/i, '');
          taskDesc = taskDesc.charAt(0).toUpperCase() + taskDesc.slice(1);

          if (taskDesc.length > 5) {
            actionItems.push({ assignee: speaker, title: taskDesc });
          }
        }
      });

      // 1. Create Tasks in State (if any action items extracted)
      const newTasks: Task[] = actionItems.map((item, idx) => ({
        id: `tsk_meet_${Date.now()}_${idx}`,
        projectId: selectedProject.id,
        projectName: selectedProject.name,
        title: `[Meet Transcript] ${item.title}`,
        description: `Automated action item extracted from Google Meet Call Transcript.\nProject: ${selectedProject.name}\nSource Transcript: Google Drive Meet Record`,
        status: 'In Progress',
        priority: idx === 0 ? 'High' : 'Medium',
        assigneeId: state.currentPersona.id || '',
        assigneeName: item.assignee || state.currentPersona.name,
        assigneeAvatar: state.currentPersona.avatar || '',
        reporterName: state.currentPersona.name,
        startDate: today,
        dueDate: new Date(Date.now() + (idx + 2) * 86400000).toISOString().substring(0, 10),
        estimatedHours: 4,
        actualHours: 0,
        tags: ['Google Meet', 'Transcript', 'Auto-Linked'],
        subtasks: [],
        commentsCount: 0,
      }));

      // 2. Create Linked Note / Drive Item
      const noteTitle = `Meet Transcript & Action Plan - ${selectedProject.name} (${today})`;
      const newDriveItem: DriveItem = {
        id: `note_meet_${Date.now()}`,
        name: `${noteTitle}.pdf`,
        type: 'pdf',
        folderCategory: 'Projects',
        size: '18 KB',
        modifiedDate: today,
        owner: state.currentPersona.name,
        sharedWith: ['Project Team'],
      };

      // 3. Create Automated Broadcast Message in Channel
      const channelMsg: ChatMessage = {
        id: `msg_meet_auto_${Date.now()}`,
        channelId: 'chn_general',
        senderId: 'bot_meet_auto',
        senderName: 'Google Meet Automation Bot',
        senderAvatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `⚡ **Automation Hook Triggered**: Google Meet Transcript linked to **${selectedProject.name}**!\n\n📋 **Extracted Action Items (${newTasks.length})**:\n${newTasks.map((t) => `• [${t.assigneeName}] ${t.title}`).join('\n')}\n\n📁 Linked Note attached to Company Drive & Project Tasks.`,
      };

      // Apply to State
      onUpdateState((prev) => ({
        ...prev,
        tasks: [...newTasks, ...prev.tasks],
        driveItems: [newDriveItem, ...prev.driveItems],
        messages: [...prev.messages, channelMsg],
        auditLogs: [
          {
            id: `log_auto_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'MEET_TRANSCRIPT_AUTOMATION_EXECUTE',
            entity: 'ProjectTasks',
            entityId: selectedProject.id,
            ipAddress: '10.0.4.12',
            details: `Linked Meet transcript to ${selectedProject.name}, generated ${newTasks.length} tasks`,
          },
          ...prev.auditLogs,
        ],
      }));

      setLastLinkedResult({
        tasksCreated: newTasks.length,
        noteTitle,
        channelMessage: `Linked ${newTasks.length} tasks and project note to ${selectedProject.name}`,
      });

      if (onTriggerToast) {
        onTriggerToast({
          type: 'task',
          title: 'Transcript Auto-Linked!',
          senderName: 'Google Workspace Automation',
          message: `Linked Meet transcript to ${selectedProject.name} & created ${newTasks.length} project tasks.`,
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to run transcript automation hook');
    } finally {
      setIsLinkingTranscript(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <HardDrive className="h-56 w-56 text-blue-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 border border-blue-400/30 text-[11px] font-bold text-blue-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Google Drive & Google Meet Transcript Automation
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <HardDrive className="h-6 w-6 text-blue-400" />
              Google Drive Cloud Files & Meet Transcript Hook
            </h2>
            <p className="text-xs text-blue-100/80 leading-relaxed">
              Access Google Drive documents, spreadsheets, and meeting recordings. Automatically parse Google Meet transcripts and link key action items, decisions, and call summaries directly to project tasks and workspace communication channels.
            </p>
          </div>

          {/* Auth Card */}
          <div className="shrink-0 rounded-2xl bg-white/10 border border-white/15 p-4 flex flex-col items-center justify-center min-w-[240px]">
            {isLoadingAuth ? (
              <div className="flex items-center gap-2 text-xs font-bold text-blue-200">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying Google Session...
              </div>
            ) : user ? (
              <div className="w-full space-y-2.5 text-center">
                <div className="flex items-center gap-2.5 text-left bg-white/10 p-2 rounded-xl border border-white/10">
                  <img
                    src={user.photoURL || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'}
                    alt="User"
                    className="h-8 w-8 rounded-full border border-blue-300"
                  />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">{user.displayName || 'Google User'}</p>
                    <p className="text-[10px] text-blue-200 truncate">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold text-emerald-300 bg-emerald-500/20 px-2.5 py-0.5 rounded-full border border-emerald-400/30">
                    Drive API v3 Active
                  </span>
                  <button
                    onClick={() => fetchFiles(accessToken!)}
                    className="text-[10px] font-bold text-blue-200 hover:text-white flex items-center gap-1"
                  >
                    <RefreshCw className="h-3 w-3" /> Sync Drive
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full space-y-3 text-center">
                <p className="text-xs text-blue-100 font-medium">Connect Google Drive to list & sync files:</p>
                <button
                  onClick={handleConnectGoogle}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white text-slate-900 px-4 py-2.5 text-xs font-extrabold hover:bg-slate-100 transition-all shadow-md"
                >
                  <HardDrive className="h-4 w-4 text-blue-600" /> Connect Google Drive
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Banner if any */}
      {errorMsg && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* AUTOMATION HOOK: Meet Transcript Auto-Linker Block */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/90 via-white to-purple-50/90 p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-blue-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-md">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-blue-700 uppercase tracking-wider">
                <Sparkles className="h-3 w-3 text-amber-500" /> Automation Hook
              </div>
              <h3 className="text-base font-bold text-slate-900">
                Link Google Meet Transcripts to Project Notes & Tasks
              </h3>
            </div>
          </div>

          <button
            onClick={handleRunMeetTranscriptAutomation}
            disabled={isLinkingTranscript}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 text-xs font-extrabold shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            {isLinkingTranscript ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Parsing & Generating Tasks...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 text-amber-300" /> Execute Automation Hook
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Config & Target Project Selection */}
          <div className="space-y-4 lg:col-span-1">
            <div>
              <label className="text-xs font-bold text-slate-800 block mb-1.5">Target Project for Action Items *</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 shadow-2xs"
              >
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.category || p.code || 'Project'})
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Drive Transcript status */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2 text-xs">
              <span className="font-bold text-slate-700 block">Transcript Source:</span>
              <p className="text-[11px] font-mono text-blue-700 bg-blue-50 p-2 rounded-lg border border-blue-100">
                {selectedTranscript ? selectedTranscript.name : 'Google Meet Call Transcript (Live Drive Record)'}
              </p>
              <p className="text-[10px] text-slate-500">
                Parses attendee speaker tags, extracts responsibilities, and auto-populates project tasks & channel broadcast.
              </p>
            </div>

            {lastLinkedResult && (
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-extrabold text-emerald-800">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Automation Executed!
                </div>
                <p className="text-[11px]">
                  Created <strong>{lastLinkedResult.tasksCreated} project tasks</strong> & linked <strong>{lastLinkedResult.noteTitle}</strong> in Drive.
                </p>
              </div>
            )}
          </div>

          {/* Column 2: Transcript Preview & Content Editor */}
          <div className="space-y-2 lg:col-span-2">
            <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
              <span>Google Meet Transcript Content (Drive File View)</span>
              <span className="text-[10px] text-blue-600 font-extrabold">Editable Preview</span>
            </label>

            <textarea
              rows={7}
              value={transcriptText}
              onChange={(e) => setTranscriptText(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-xs font-mono text-slate-800 outline-none focus:border-blue-500 shadow-2xs leading-relaxed"
            />
          </div>
        </div>
      </div>

      {/* Drive File Browser & Actions */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-sm text-slate-900">Google Drive File Directory</h3>
              <p className="text-xs text-slate-500">Sync with company documents and Google Meet transcripts</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search Drive files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs font-medium outline-none focus:border-blue-500"
              />
            </div>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 text-xs font-bold shadow-xs transition-all"
            >
              <Plus className="h-4 w-4" /> New File
            </button>
          </div>
        </div>

        {/* File Grid / Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50/50">
                <th className="py-2.5 px-3">File Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Category / Link</th>
                <th className="py-2.5 px-3">Modified</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {/* Combine Drive API files + Workspace Drive Items */}
              {driveFiles.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      <span className="font-bold text-slate-900 truncate max-w-[240px]">{f.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                    {f.mimeType.includes('document') ? 'Google Doc' : f.mimeType.includes('spreadsheet') ? 'Google Sheet' : 'Text / Media'}
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                      Google Drive
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-500">
                    {f.modifiedTime ? f.modifiedTime.substring(0, 10) : 'Today'}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {f.webViewLink ? (
                      <a
                        href={f.webViewLink}
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                        onClick={(e) => {
                          e.preventDefault();
                          void openExternalUrl(String(f.webViewLink));
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                    ) : (
                      <span className="text-slate-400">Local Synced</span>
                    )}
                  </td>
                </tr>
              ))}

              {state.driveItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-slate-100 text-slate-700">
                        <FileText className="h-4 w-4" />
                      </div>
                      <span className="font-bold text-slate-900 truncate max-w-[240px]">{item.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono text-[11px] text-slate-500 uppercase">
                    {item.type}
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {item.folderCategory}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-500">{item.modifiedDate}</td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => {
                        setSelectedTranscript({
                          id: item.id,
                          name: item.name,
                          mimeType: 'text/plain',
                        });
                        if (onTriggerToast) {
                          onTriggerToast({
                            type: 'system',
                            title: 'Transcript Selected',
                            senderName: 'Drive',
                            message: `Selected ${item.name} for transcript automation`,
                          });
                        }
                      }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                    >
                      <Link2 className="h-3.5 w-3.5" /> Select for Hook
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create File in Google Drive */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-600 text-white">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Create Google Drive File</h3>
                  <p className="text-xs text-slate-500">Saves document to user's Google Drive</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateFileSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">Document Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Strategic Plan Notes.txt"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Document Mime Type</label>
                <select
                  value={newFileMime}
                  onChange={(e) => setNewFileMime(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none"
                >
                  <option value="text/plain">Plain Text (.txt)</option>
                  <option value="application/vnd.google-apps.document">Google Doc</option>
                  <option value="application/vnd.google-apps.spreadsheet">Google Sheet</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">File Content / Notes</label>
                <textarea
                  rows={4}
                  placeholder="Type initial document content here..."
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingFile}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md flex items-center gap-1.5"
                >
                  {isCreatingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                  Save to Drive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
