import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { CommandPalette } from './components/common/CommandPalette';
import { AIAssistantModal } from './components/ai/AIAssistantModal';

import { DashboardModule } from './components/modules/DashboardModule';
import { HRMSModule } from './components/modules/HRMSModule';
import { ProjectsModule } from './components/modules/ProjectsModule';
import { TimesheetsModule } from './components/modules/TimesheetsModule';
import { DocumentsModule } from './components/modules/DocumentsModule';
import { AnnouncementsModule } from './components/modules/AnnouncementsModule';
import { NotificationsModule } from './components/modules/NotificationsModule';

import { loadStoredState, saveStoredState, AppState } from './services/store';
import { UserPersona, RealtimeToast } from './types';
import { Sparkles, Clock } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<AppState>(loadStoredState);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(1500); // 25 min pomodoro

  // Real-time Notification Toasts
  const [toasts, setToasts] = useState<RealtimeToast[]>([]);

  const handleTriggerToast = (toast: Omit<RealtimeToast, 'id' | 'timestamp'>) => {
    const newToast: RealtimeToast = {
      ...toast,
      id: `toast_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setToasts((prev) => [newToast, ...prev.slice(0, 3)]); // Keep max 4 visible at once

    // Also push to persistent notifications for the header bell dropdown
    setState((prev) => ({
      ...prev,
      notifications: [
        {
          id: `notif_${Date.now()}`,
          title: newToast.title,
          message: newToast.message,
          timestamp: 'Just now',
          category: newToast.type === 'task' ? 'Tasks' : 'System',
          read: false,
          linkModule: newToast.linkModule || 'announcements',
        },
        ...prev.notifications,
      ],
    }));
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleNavigateToToast = (toast: RealtimeToast) => {
    if (toast.linkModule) {
      handleSelectModule(toast.linkModule);
    } else if (toast.type === 'task') {
      handleSelectModule('projects');
    } else {
      handleSelectModule('announcements');
    }
  };

  // Sync state to local storage on mutation
  useEffect(() => {
    saveStoredState(state);
  }, [state]);

  // Sync global high-contrast theme class to HTML document element using CSS variables
  useEffect(() => {
    const isDark = state.customOptions?.featureToggles?.themeMode === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [state.customOptions?.featureToggles?.themeMode]);

  const handleToggleThemeMode = () => {
    setState((prev) => {
      const currentMode = prev.customOptions?.featureToggles?.themeMode || 'light';
      const nextMode = currentMode === 'dark' ? 'light' : 'dark';
      return {
        ...prev,
        customOptions: {
          ...prev.customOptions,
          featureToggles: {
            ...prev.customOptions.featureToggles,
            themeMode: nextMode,
          },
        },
      };
    });
  };

  // Timer interval effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [timerActive, timerSeconds]);

  const handleUpdateState = (updater: (prev: AppState) => AppState) => {
    setState((prev) => updater(prev));
  };

  const handleSelectModule = (module: string) => {
    setState((prev) => ({ ...prev, activeModule: module }));
  };

  const handleSelectPersona = (persona: UserPersona) => {
    setState((prev) => {
      const allowedModules = prev.customOptions?.roleModulePermissions?.[persona.role] || [];
      const isCurrentAllowed = allowedModules.length === 0 || allowedModules.includes(prev.activeModule);
      const nextActiveModule = isCurrentAllowed ? prev.activeModule : (allowedModules[0] || 'dashboard');

      return {
        ...prev,
        currentPersona: persona,
        activeModule: nextActiveModule,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: persona.name,
            action: 'PERSONA_SWITCHED',
            entity: 'UserSession',
            entityId: persona.id,
            ipAddress: '106.51.72.18',
            details: `Active user switched persona to ${persona.name} (${persona.role})`,
          },
          ...prev.auditLogs,
        ],
      };
    });
  };

  const handleMarkNotificationRead = (id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  };

  const handleMarkAllNotificationsRead = () => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Render module router
  const renderActiveModule = () => {
    switch (state.activeModule) {
      case 'dashboard':
        return <DashboardModule />;
      case 'announcements':
        return <AnnouncementsModule state={state} onUpdateState={handleUpdateState} onTriggerToast={(msg, type) => handleTriggerToast({ title: 'Announcement', message: msg, type: type === 'warning' ? 'warning' : type === 'info' ? 'info' : 'success' })} />;
      case 'hr':
        return <HRMSModule state={state} onUpdateState={handleUpdateState} />;
      case 'projects':
        return <ProjectsModule state={state} onUpdateState={handleUpdateState} />;
      case 'timesheets':
        return <TimesheetsModule state={state} onUpdateState={handleUpdateState} />;
      case 'documents':
        return <DocumentsModule state={state} onUpdateState={handleUpdateState} onTriggerToast={handleTriggerToast} />;
      case 'settings':
        return <DashboardModule />;
      case 'notifications':
        return <NotificationsModule state={state} onUpdateState={handleUpdateState} onNavigateModule={handleSelectModule} />;

      case 'productivity':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Focus & Pomodoro Work Timer</h2>
                <p className="text-xs text-slate-500">Boost deep work productivity with time blocking & micro-breaks</p>
              </div>
            </div>

            <div className="bg-white p-10 rounded-2xl border border-slate-200 shadow-sm text-center max-w-xl mx-auto space-y-6">
              <span className="px-3 py-1 bg-blue-50 text-blue-700 font-bold text-xs rounded-full uppercase tracking-wider">
                Focus Session
              </span>

              <div className="text-6xl font-bold text-slate-900 tracking-tight font-mono tabular-nums">
                {formatTimer(timerSeconds)}
              </div>

              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setTimerActive(!timerActive)}
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
                    timerActive ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {timerActive ? 'Pause Session' : 'Start Focus Session'}
                </button>
                <button
                  onClick={() => {
                    setTimerActive(false);
                    setTimerSeconds(1500);
                  }}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 bg-slate-50 hover:bg-slate-100"
                >
                  Reset Timer
                </button>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-center gap-4 text-xs font-medium text-slate-500">
                <button onClick={() => { setTimerSeconds(1500); setTimerActive(false); }} className="hover:text-blue-600">25m Work</button>
                <span>•</span>
                <button onClick={() => { setTimerSeconds(300); setTimerActive(false); }} className="hover:text-blue-600">5m Break</button>
                <span>•</span>
                <button onClick={() => { setTimerSeconds(900); setTimerActive(false); }} className="hover:text-blue-600">15m Long Break</button>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 capitalize">{state.activeModule} Module</h2>
                <p className="text-xs text-slate-500">Enterprise operations console & analytics</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 capitalize">{state.activeModule} Status</h3>
                    <p className="text-xs text-slate-500">Connected to Acme Enterprise API Service</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  All systems operational and synced with real-time audit logs, role-based security policies, and Gemini 3.6 Flash automated intelligence.
                </p>
                <div className="pt-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Active & Operational</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Module Metadata</p>
                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Module ID:</span>
                    <span className="font-bold text-slate-900">{state.activeModule}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="font-medium text-slate-500">Active User Role:</span>
                    <span className="font-bold text-blue-600">{state.currentPersona.role}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="font-medium text-slate-500">Organization:</span>
                    <span className="font-bold text-slate-900">{state.organization.name}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#F1F5F9] font-sans text-slate-800 overflow-hidden">
      {/* Sleek Sidebar Navigation */}
      <Sidebar
        activeModule={state.activeModule}
        onSelectModule={handleSelectModule}
        currentPersona={state.currentPersona}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Work Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Sleek Header Bar */}
        <Header
          currentPersona={state.currentPersona}
          onSelectPersona={handleSelectPersona}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenAIAssistant={() => {
            setAiQuery('');
            setAiAssistantOpen(true);
          }}
          onOpenQuickTimer={() => handleSelectModule('productivity')}
          notifications={state.notifications}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onNavigateModule={handleSelectModule}
          onToggleMobileSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          themeMode={state.customOptions?.featureToggles?.themeMode || 'light'}
          onToggleThemeMode={handleToggleThemeMode}
        />

        {/* Dynamic Content View Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          {renderActiveModule()}
        </main>
      </div>

      {/* Global Command Palette Search Modal */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpen={() => setCommandPaletteOpen(true)}
        state={state}
        onSelectModule={handleSelectModule}
        onOpenAIAssistantWithQuery={(q) => {
          setAiQuery(q);
          setAiAssistantOpen(true);
        }}
      />

      {/* Gemini AI Executive Assistant Modal */}
      <AIAssistantModal
        isOpen={aiAssistantOpen}
        onClose={() => setAiAssistantOpen(false)}
        state={state}
        initialQuery={aiQuery}
      />
    </div>
  );
}
