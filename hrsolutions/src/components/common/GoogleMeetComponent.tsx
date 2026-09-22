'use client';

import React, { useState, useEffect } from 'react';
import {
  Video,
  Plus,
  Copy,
  ExternalLink,
  Check,
  Shield,
  Users,
  Calendar,
  Sparkles,
  Lock,
  Globe,
  Settings,
  RefreshCw,
  LogOut,
  Clock,
  AlertCircle,
  Loader2,
  VideoOff,
  Mic,
  Share2,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  googleSignIn,
  googleSignOut,
  initGoogleAuth,
  createMeetSpace,
  updateMeetSpaceSettings,
  getMeetSpace,
  MeetSpace,
} from '../../services/googleMeet';
import { AppState } from '../../services/store';
import { Meeting } from '../../types';

interface GoogleMeetComponentProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onTriggerToast?: (toast: any) => void;
}

export const GoogleMeetComponent: React.FC<GoogleMeetComponentProps> = ({
  state,
  onUpdateState,
  onTriggerToast,
}) => {
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // New Space Generator State
  const [isCreatingSpace, setIsCreatingSpace] = useState(false);
  const [accessType, setAccessType] = useState<'OPEN' | 'TRUSTED' | 'RESTRICTED'>('OPEN');
  const [lastCreatedSpace, setLastCreatedSpace] = useState<MeetSpace | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Schedule Meeting State
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTime, setNewTime] = useState('10:00 AM');
  const [newAgenda, setNewAgenda] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);

  // Space Settings Modal / Inspector
  const [inspectSpace, setInspectSpace] = useState<MeetSpace | null>(null);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
        setIsAuthLoading(false);
      },
      () => {
        setGoogleUser(null);
        setAccessToken(null);
        setIsAuthLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    setIsAuthLoading(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setAccessToken(result.accessToken);
        if (onTriggerToast) {
          onTriggerToast({
            type: 'system',
            title: 'Google Account Connected',
            senderName: 'Google Meet API',
            message: `Authenticated as ${result.user.email || result.user.displayName}`,
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Failed to authenticate with Google Meet');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    await googleSignOut();
    setGoogleUser(null);
    setAccessToken(null);
    setLastCreatedSpace(null);
  };

  const handleCreateInstantMeet = async () => {
    if (!accessToken) {
      await handleSignIn();
      return;
    }

    setIsCreatingSpace(true);
    setAuthError(null);

    try {
      const space = await createMeetSpace(accessToken, { accessType });
      setLastCreatedSpace(space);

      // Create a meeting record in workspace state
      const meetingUri = space.meetingUri || `https://meet.google.com/${space.meetingCode || 'live-space'}`;
      const newMtg: Meeting = {
        id: `mtg_meet_${Date.now()}`,
        title: `Instant Google Meet (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        organizer: state.currentPersona.name,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        endTime: '11:00 AM',
        link: meetingUri,
        participants: [
          state.currentPersona.name,
          ...state.employees.slice(0, 3).map((e) => e.name),
        ],
        agenda: `Live video collaboration space created via Google Meet API v2.\nSpace Name: ${space.name}\nAccess Type: ${accessType}`,
        actionItems: [
          'Align on team sprint deliverables',
          'Review current Cloud Run infrastructure metrics',
        ],
      };

      onUpdateState((prev) => ({
        ...prev,
        meetings: [newMtg, ...prev.meetings],
      }));

      if (onTriggerToast) {
        onTriggerToast({
          type: 'task',
          title: 'Google Meet Room Active',
          senderName: 'Google Meet API v2',
          message: `Created space ${space.meetingCode || space.name}. Link attached to team calendar.`,
        });
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Failed to create Google Meet space');
    } finally {
      setIsCreatingSpace(false);
    }
  };

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleScheduleMeetingWithMeet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsScheduling(true);
    setAuthError(null);

    let meetUri = 'https://meet.google.com/new';

    try {
      if (accessToken) {
        const space = await createMeetSpace(accessToken, { accessType });
        meetUri = space.meetingUri || meetUri;
      }

      const scheduledMtg: Meeting = {
        id: `mtg_sched_${Date.now()}`,
        title: newTitle,
        organizer: state.currentPersona.name,
        date: newDate,
        startTime: newTime,
        endTime: '11:00 AM',
        link: meetUri,
        participants: [
          state.currentPersona.name,
          ...state.employees.slice(0, 3).map((e) => e.name),
        ],
        agenda: newAgenda || 'Google Meet conference call scheduled for team alignment.',
        actionItems: [
          'Prepare slide deck and review metrics prior to call',
          'Document action points during meeting',
        ],
      };

      onUpdateState((prev) => ({
        ...prev,
        meetings: [scheduledMtg, ...prev.meetings],
      }));

      setShowScheduleModal(false);
      setNewTitle('');
      setNewAgenda('');

      if (onTriggerToast) {
        onTriggerToast({
          type: 'task',
          title: `Scheduled: ${scheduledMtg.title}`,
          senderName: 'Google Meet',
          message: `Added meeting for ${newDate} at ${newTime} with attached Meet link.`,
        });
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Failed to schedule meeting space');
    } finally {
      setIsScheduling(false);
    }
  };

  const handleUpdateSpaceAccess = async (newAccess: 'OPEN' | 'TRUSTED' | 'RESTRICTED') => {
    if (!accessToken || !inspectSpace) return;
    setIsUpdatingSettings(true);
    try {
      const updated = await updateMeetSpaceSettings(accessToken, inspectSpace.name, newAccess);
      setInspectSpace(updated);
      if (lastCreatedSpace && lastCreatedSpace.name === inspectSpace.name) {
        setLastCreatedSpace(updated);
      }
      if (onTriggerToast) {
        onTriggerToast({
          type: 'system',
          title: 'Google Meet Access Updated',
          senderName: 'Google Meet API',
          message: `Space access set to ${newAccess}`,
        });
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Failed to update space settings');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Account Auth Bar */}
      <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Video className="h-56 w-56 text-blue-400" />
        </div>

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 border border-blue-400/30 text-[11px] font-bold text-blue-300">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Official Google Meet Workspace Integration
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Video className="h-6 w-6 text-blue-400" />
              Google Meet Conference & Video Rooms
            </h2>
            <p className="text-xs text-blue-100/80 leading-relaxed">
              Create instant HD video calls, generate dynamic meeting spaces via Google Meet API v2, configure room security access (`OPEN`, `TRUSTED`, `RESTRICTED`), and sync conference links directly with your team calendar and AI summarizer.
            </p>
          </div>

          {/* Auth Card Status */}
          <div className="shrink-0 rounded-2xl bg-white/10 border border-white/15 p-4 flex flex-col items-center justify-center min-w-[240px]">
            {isAuthLoading ? (
              <div className="flex items-center gap-2 text-xs font-bold text-blue-200">
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying Google Session...
              </div>
            ) : googleUser && accessToken ? (
              <div className="w-full space-y-3 text-center">
                <div className="flex items-center gap-2.5 text-left bg-white/10 p-2.5 rounded-xl border border-white/10">
                  <img
                    src={googleUser.photoURL || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'}
                    alt="Google Avatar"
                    className="h-8 w-8 rounded-full border border-blue-300"
                  />
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">{googleUser.displayName || 'Google User'}</p>
                    <p className="text-[10px] text-blue-200 truncate">{googleUser.email}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/30">
                    <Check className="h-3 w-3" /> OAuth Token Active
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-[10px] font-bold text-blue-200 hover:text-white flex items-center gap-1 hover:underline"
                  >
                    <LogOut className="h-3 w-3" /> Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full space-y-3 text-center">
                <p className="text-xs text-blue-100 font-medium">Connect Google Account to create real Google Meet spaces:</p>

                <button
                  onClick={handleSignIn}
                  type="button"
                  className="w-full flex items-center justify-center gap-2.5 rounded-xl bg-white text-slate-900 px-4 py-2.5 text-xs font-extrabold hover:bg-slate-100 transition-all shadow-md active:scale-95"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Sign in with Google
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Alert if any */}
      {authError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Google Meet Action Notice</p>
            <p>{authError}</p>
          </div>
        </div>
      )}

      {/* Main Grid: Instant Creator + Scheduled Meetings List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Instant Meeting Launcher & Security Config */}
        <div className="space-y-6 lg:col-span-1">
          {/* Instant Creator Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Video className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Instant Google Meet</h3>
                  <p className="text-[11px] text-slate-500">Generate live space link</p>
                </div>
              </div>
              <span className="text-[10px] font-extrabold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                API v2
              </span>
            </div>

            {/* Access Type Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Room Access Policy:</span>
                <span className="text-[10px] text-slate-500 font-normal">Google Security</span>
              </label>

              <select
                value={accessType}
                onChange={(e) => setAccessType(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="OPEN">OPEN (Anyone with link can join)</option>
                <option value="TRUSTED">TRUSTED (Organization & Invited guests)</option>
                <option value="RESTRICTED">RESTRICTED (Explicit permission only)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleCreateInstantMeet}
              disabled={isCreatingSpace}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white p-3 text-xs font-bold shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {isCreatingSpace ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Calling Google Meet API...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" /> Create Instant Google Meet
                </>
              )}
            </button>

            {/* Last Created Space Result Box */}
            {lastCreatedSpace && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-extrabold text-emerald-900 flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-600" /> Space Created
                  </span>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    {lastCreatedSpace.name}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-white border border-emerald-200 font-mono text-xs text-slate-800 truncate select-all flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{lastCreatedSpace.meetingUri}</span>
                  <button
                    onClick={() => handleCopyLink(lastCreatedSpace.meetingUri)}
                    className="p-1 rounded hover:bg-slate-100 text-slate-600 shrink-0"
                    title="Copy Link"
                  >
                    {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={lastCreatedSpace.meetingUri}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white p-2.5 text-xs font-extrabold shadow-xs transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Join Google Meet Now
                  </a>

                  <button
                    type="button"
                    onClick={() => setInspectSpace(lastCreatedSpace)}
                    className="p-2.5 rounded-xl border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100 text-xs font-bold"
                    title="Inspect & Configure Space"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Schedule Meeting Button Box */}
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50/80 to-purple-50/80 p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <h3 className="font-bold text-sm text-slate-900">Schedule Conference Call</h3>
            </div>
            <p className="text-xs text-slate-600">
              Schedule team meetings for future dates. Automatically attaches an official Google Meet space to invitations.
            </p>

            <button
              onClick={() => setShowScheduleModal(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white p-2.5 text-xs font-bold transition-all shadow-xs"
            >
              <Plus className="h-4 w-4" /> Schedule Google Meet
            </button>
          </div>
        </div>

        {/* Column 2 & 3: Scheduled Meetings & Active Conference Rooms */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Video className="h-4 w-4 text-blue-600" /> Upcoming Google Meet Conferences
                </h3>
                <p className="text-xs text-slate-500">Live workspace video rooms with attached Meet URIs</p>
              </div>

              <span className="text-xs font-extrabold bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100">
                {state.meetings.length} Meetings Scheduled
              </span>
            </div>

            <div className="space-y-4">
              {state.meetings.map((mtg) => (
                <div
                  key={mtg.id}
                  className="rounded-2xl border border-slate-200 hover:border-blue-300 bg-white p-4 transition-all shadow-2xs hover:shadow-md space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-blue-700 border border-blue-100">
                        <Calendar className="h-3 w-3" /> {mtg.date}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600">
                        <Clock className="h-3 w-3 text-slate-400" /> {mtg.startTime} - {mtg.endTime}
                      </span>
                    </div>

                    <a
                      href={mtg.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-extrabold shadow-xs transition-all active:scale-95 shrink-0"
                    >
                      <Video className="h-3.5 w-3.5" /> Join Google Meet
                    </a>
                  </div>

                  <div>
                    <h4 className="font-bold text-sm text-slate-900">{mtg.title}</h4>
                    <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{mtg.agenda}</p>
                  </div>

                  {/* Participants */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Users className="h-3.5 w-3.5 text-blue-600" />
                      <span className="font-semibold text-slate-700">Invited ({mtg.participants.length}):</span>
                      <span className="truncate max-w-[280px]">{mtg.participants.join(', ')}</span>
                    </div>

                    <span className="font-mono text-[10px] text-slate-400 truncate max-w-[180px]">
                      {mtg.link}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal 1: Schedule Google Meet Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-600 text-white">
                  <Video className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Schedule Google Meet</h3>
                  <p className="text-xs text-slate-500">Creates new conference space via Google Meet API</p>
                </div>
              </div>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleScheduleMeetingWithMeet} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">Meeting Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Q3 Architecture & Design Review"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">Time</label>
                  <input
                    type="text"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Agenda & Notes</label>
                <textarea
                  rows={3}
                  placeholder="Topics to discuss, slide deck links..."
                  value={newAgenda}
                  onChange={(e) => setNewAgenda(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 font-medium outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isScheduling}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md flex items-center gap-1.5"
                >
                  {isScheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  Schedule Google Meet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Inspect & Update Google Meet Space Settings */}
      {inspectSpace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-600 text-white">
                  <Settings className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Google Meet Space Settings</h3>
                  <p className="text-xs text-slate-500">{inspectSpace.name}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectSpace(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Meeting URI</span>
                <p className="font-mono font-bold text-blue-700 select-all">{inspectSpace.meetingUri}</p>
              </div>

              <div>
                <label className="font-bold text-slate-800 block mb-1">Update Access Policy (Google API):</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'OPEN', label: 'OPEN', desc: 'Anyone with link can join without asking' },
                    { id: 'TRUSTED', label: 'TRUSTED', desc: 'Users in organization or explicit invitees' },
                    { id: 'RESTRICTED', label: 'RESTRICTED', desc: 'Only creator and granted attendees' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleUpdateSpaceAccess(p.id as any)}
                      disabled={isUpdatingSettings}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        inspectSpace.config?.accessType === p.id
                          ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-bold ring-1 ring-emerald-400'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{p.label}</span>
                        {inspectSpace.config?.accessType === p.id && (
                          <Check className="h-4 w-4 text-emerald-600" />
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{p.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setInspectSpace(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
