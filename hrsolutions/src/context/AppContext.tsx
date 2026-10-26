'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { loadStoredState, saveStoredState, getDefaultState, AppState } from '../services/store';
import { UserPersona, RealtimeToast, NotificationItem } from '../types';
import { syncBackendDataToState } from '../services/backendSync';
import { api } from '../services/apiClient';
import { AuthService } from '../services/authService';
import { showRealtimeToast, dismissRealtimeToast } from '../lib/sonnerToast';
import { showAppNotification } from '../lib/native';
import { useAppNotificationBridge } from '../hooks/useAppNotificationBridge';
import { returnAssignedInProgressTasksToTodo } from '../utils/taskBoard';

interface AppContextType {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  updateState: (updater: (prev: AppState) => AppState) => void;
  isLoaded: boolean;
  backendStatus: 'connected' | 'disconnected' | 'syncing';
  syncWithBackend: (overrideState?: AppState) => Promise<void>;
  currentPersona: UserPersona;
  selectPersona: (persona: UserPersona) => void;
  login: (persona: UserPersona) => void;
  logout: () => void;
  toasts: RealtimeToast[];
  triggerToast: (toast: Omit<RealtimeToast, 'id' | 'timestamp'>) => void;
  dismissToast: (id: string) => void;
  navigateToToast: (toast: RealtimeToast) => void;
  timerSeconds: number;
  timerActive: boolean;
  toggleTimer: () => void;
  resetTimer: () => void;
  setTimerSeconds: (sec: number) => void;
  formatTimer: (sec: number) => string;
  themeMode: 'light' | 'dark';
  toggleThemeMode: () => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  aiAssistantOpen: boolean;
  setAiAssistantOpen: (open: boolean) => void;
  aiQuery: string;
  setAiQuery: (query: string) => void;
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearReadNotifications: () => void;
  deleteNotification: (id: string) => void;
  clearAllNotifications: () => void;
  pushNotification: (notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function readAuthPersist(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    if (sessionStorage.getItem('BOS_AUTH_PERSIST') === '0') return false;
    if (localStorage.getItem('BOS_AUTH_PERSIST') === '0') return false;
  } catch {
    return true;
  }
  return true;
}

export function AppProvider({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AppState>(getDefaultState);
  const [isLoaded, setIsLoaded] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'connected' | 'disconnected' | 'syncing'>('disconnected');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(1500); // 25 min pomodoro
  const [toasts, setToasts] = useState<RealtimeToast[]>([]);
  const [inboxHydrated, setInboxHydrated] = useState(false);
  // Bumped on logout so in-flight sync results are ignored
  const authEpochRef = useRef(0);
  const logoutStartedRef = useRef(false);

  useAppNotificationBridge(
    state.notifications,
    isLoaded && !!state.isAuthenticated,
    inboxHydrated,
  );

  const syncWithBackend = useCallback(async (overrideState?: AppState) => {
    const epoch = authEpochRef.current;
    if (!api.getToken()) {
      setBackendStatus('disconnected');
      return;
    }
    try {
      setBackendStatus('syncing');
      const baseState = overrideState || state;
      const updates = await syncBackendDataToState(baseState);
      if (epoch !== authEpochRef.current || !api.getToken()) {
        return;
      }
      if (Object.keys(updates).length > 0) {
        setState((prev) => ({
          ...prev,
          ...updates,
          isAuthenticated: true,
          currentPersona: updates.currentPersona || (overrideState ? overrideState.currentPersona : prev.currentPersona),
          employees: updates.employees !== undefined ? updates.employees : prev.employees || [],
        }));
      }
      setBackendStatus('connected');
      setInboxHydrated(true);
    } catch (err) {
      if (epoch !== authEpochRef.current) return;
      console.warn('Backend sync failed, maintaining local state:', err);
      setBackendStatus('disconnected');
      setInboxHydrated(true);
    }
  }, [state]);

  // Hydrate state from browser localStorage and sync with live PostgreSQL backend
  useEffect(() => {
    const epoch = authEpochRef.current;
    const loaded = loadStoredState();
    // Filter out old unnecessary/spam notifications from previous runs
    const cleanNotifications = (loaded.notifications || []).filter((n) => {
      if (!n || !n.title) return false;
      const title = n.title.toLowerCase();
      if (
        title.includes('action blocked') ||
        title.includes('demo workspace') ||
        title.includes('workspace ready') ||
        title.includes('backend notice') ||
        title.includes('profile was updated')
      ) {
        return false;
      }
      return true;
    });
    loaded.notifications = cleanNotifications;

    // Clean up stored audit log details if they contain raw JSON strings
    if (Array.isArray(loaded.auditLogs)) {
      loaded.auditLogs = loaded.auditLogs.map((log) => {
        if (!log || !log.details) return log;
        let details = log.details;
        if (typeof details === 'string' && (details.startsWith('{') || details.startsWith('['))) {
          try {
            const p = JSON.parse(details);
            if (p.message) {
              details = p.message;
            } else if (p.total_payout !== undefined) {
              const amt = typeof p.total_payout === 'number' ? `₹${p.total_payout.toLocaleString('en-IN')}` : `₹${p.total_payout}`;
              if (p.month && p.year) {
                const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                const mName = months[Number(p.month) - 1] || `Month ${p.month}`;
                details = `Processed payroll payout of ${amt} for ${mName} ${p.year}`;
              } else {
                details = `Processed payroll payout of ${amt}`;
              }
            }
          } catch {}
        }
        return { ...log, details };
      });
    }

    // Do not treat a stored flag as a login. Confirm the authorization token first.
    loaded.isAuthenticated = false;
    loaded.currentPersona = null;

    void (async () => {
      const authorization = await api.verifyStoredAuthorization();
      if (epoch !== authEpochRef.current) return;

      if (authorization.status !== 'authorized' || !api.getToken()) {
        loaded.isAuthenticated = false;
        loaded.currentPersona = null;
        setState(loaded);
        setIsLoaded(true);
        setBackendStatus('disconnected');
        setInboxHydrated(false);
        return;
      }

      loaded.isAuthenticated = true;
      const session = AuthService.getSession();
      const verified = authorization.user;
      if (session) {
        loaded.currentPersona = {
          id: session.sub,
          name: session.name || session.email || 'User',
          email: session.email || '',
          role: session.role as any,
          designation: session.role === 'super_admin' ? 'Founder & CEO' : 'Team Member',
          department: session.role === 'student' ? 'Academic' : 'Management',
          avatar: '',
        };
      } else if (verified?.email && verified.role) {
        const persist = readAuthPersist();
        const restored = AuthService.setSession({
          token: api.getToken(),
          sub: verified.sub || verified.id,
          email: verified.email,
          role: verified.role as any,
          tenantId: verified.tenantId || api.getTenantId(),
          dbSchema: verified.tenantSchema,
          name: verified.name,
          persist,
        });
        loaded.currentPersona = {
          id: restored.sub,
          name: restored.name || restored.email || 'User',
          email: restored.email || '',
          role: restored.role as any,
          designation: verified.designation || (restored.role === 'super_admin' ? 'Founder & CEO' : 'Team Member'),
          department: verified.department || (restored.role === 'student' ? 'Academic' : 'Management'),
          avatar: verified.avatar || '',
        };
      }

      setState(loaded);
      setIsLoaded(true);

      api
        .ensureFreshToken()
        .then(() => syncBackendDataToState(loaded))
        .then((updates) => {
          if (epoch !== authEpochRef.current || !api.getToken()) return;
          if (Object.keys(updates).length > 0) {
            setState((prev) => ({
              ...prev,
              ...updates,
              isAuthenticated: true,
              currentPersona: updates.currentPersona || prev.currentPersona,
              employees:
                updates.employees !== undefined ? updates.employees : prev.employees,
            }));
          }
          setBackendStatus('connected');
          setInboxHydrated(true);
        })
        .catch((err) => {
          if (epoch !== authEpochRef.current) return;
          console.debug('Initial live backend sync unavailable, operating with cached state:', err);
          setBackendStatus('disconnected');
          setInboxHydrated(true);
        });
    })();
  }, []);

  // Save state on changes
  useEffect(() => {
    if (isLoaded) {
      saveStoredState(state);
    }
  }, [state, isLoaded]);

  // Sync global theme class to document
  useEffect(() => {
    const isDark = state.customOptions?.featureToggles?.themeMode === 'dark';
    if (typeof document !== 'undefined') {
      if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
        document.documentElement.setAttribute('data-theme', 'light');
      }
    }
  }, [state.customOptions?.featureToggles?.themeMode]);

  // Focus timer countdown
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

  const updateState = useCallback((updater: (prev: AppState) => AppState) => {
    setState((prev) => updater(prev));
  }, []);

  const pushNotification = (notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => {
    const newNotif: NotificationItem = {
      ...notification,
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      timestamp: 'Just now',
      read: false,
    };
    setState((prev) => ({
      ...prev,
      notifications: [newNotif, ...prev.notifications],
    }));
  };

  const navigateToToast = useCallback(
    (toastItem: RealtimeToast) => {
      if (toastItem.linkModule) {
        const query = toastItem.linkTab ? `?tab=${toastItem.linkTab}` : '';
        router.push(`/${toastItem.linkModule.toLowerCase()}${query}`);
      } else if (toastItem.type === 'task') {
        router.push('/projects');
      } else if (toastItem.type === 'attendance') {
        router.push('/attendance');
      } else if (toastItem.type === 'approval' || toastItem.type === 'hr') {
        router.push('/hr');
      } else {
        router.push('/announcements');
      }
    },
    [router]
  );

  const triggerToast = useCallback(
    (toastPayload: Omit<RealtimeToast, 'id' | 'timestamp'>) => {
      const newToast: RealtimeToast = {
        ...toastPayload,
        id: `toast_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setToasts((prev) => [newToast, ...prev.slice(0, 3)]);
      showRealtimeToast(newToast, (item) => navigateToToast(item));

      const linkModule = newToast.linkModule
        ? `/${newToast.linkModule.toLowerCase()}${newToast.linkTab ? `?tab=${encodeURIComponent(newToast.linkTab)}` : ''}`
        : undefined;
      void showAppNotification({
        id: `toast:${newToast.id}`,
        title: newToast.title,
        body: newToast.message || newToast.title,
        linkUrl: linkModule,
      });
    },
    [navigateToToast]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    dismissRealtimeToast(id);
  }, []);

  const markAllNotificationsRead = () => {
    const employeeId = state.currentPersona?.id;
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => ({ ...n, read: true })),
    }));
    void api.auditComms.markAllNotificationsRead(employeeId).catch((err) => {
      console.error('Failed to mark all notifications read', err);
    });
  };

  const clearReadNotifications = () => {
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).filter((n) => !n.read),
    }));
  };

  const deleteNotification = (id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).filter((n) => n.id !== id),
    }));
    void api.auditComms.deleteNotification(id).catch((err) => {
      console.error('Failed to delete notification', err);
    });
  };

  const clearAllNotifications = () => {
    const employeeId = state.currentPersona?.id;
    setState((prev) => ({
      ...prev,
      notifications: [],
    }));
    void api.auditComms.clearAllNotifications(employeeId).catch((err) => {
      console.error('Failed to clear notifications', err);
    });
  };

  const login = (persona: UserPersona) => {
    setState((prev) => ({
      ...prev,
      isAuthenticated: true,
      currentPersona: persona,
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: persona.name,
          action: 'USER_LOGGED_IN',
          entity: 'UserSession',
          entityId: persona.id,
          ipAddress: '106.51.72.18',
          details: `User ${persona.name} (${persona.email}) logged in successfully`,
        },
        ...(prev.auditLogs || []),
      ],
    }));
  };

  const logout = useCallback(() => {
    if (logoutStartedRef.current) return;
    logoutStartedRef.current = true;

    const persona = state.currentPersona;
    const customOptions = state.customOptions;
    const hadToken = Boolean(api.getToken());

    void (async () => {
      if (hadToken && persona?.id && persona.role !== 'student') {
        try {
          await Promise.race([
            returnAssignedInProgressTasksToTodo(persona.id, persona.name || ''),
            new Promise((resolve) => setTimeout(resolve, 12000)),
          ]);
        } catch (err) {
          console.error('Failed to move in-progress tasks back to To Do on logout', err);
        }
      }

      // Invalidate any in-flight sync before clearing credentials
      authEpochRef.current += 1;
      setInboxHydrated(false);
      api.clearAuth();

      const loggedOutState: AppState = {
        ...getDefaultState(),
        isAuthenticated: false,
        currentPersona: null,
        notifications: [],
        customOptions,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: persona?.name || 'User',
            action: 'USER_LOGGED_OUT',
            entity: 'UserSession',
            entityId: persona?.id || 'session',
            ipAddress: '106.51.72.18',
            details: `User signed out of session. In-progress tasks moved back to To Do.`,
          },
        ],
      };

      // Persist logged-out UI state synchronously so refresh cannot resurrect the session
      saveStoredState(loggedOutState);
      setState(loggedOutState);
      setBackendStatus('disconnected');

      // Hard navigation resets React state and kills pending soft redirects
      if (typeof window !== 'undefined') {
        window.location.assign('/login');
      } else {
        router.replace('/login');
      }
    })();
  }, [router, state.currentPersona, state.customOptions]);

  const selectPersona = (persona: UserPersona) => {
    setState((prev) => {
      return {
        ...prev,
        isAuthenticated: true,
        currentPersona: persona,
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
          ...(prev.auditLogs || []),
        ],
      };
    });
  };

  const markNotificationRead = (id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: (prev.notifications || []).map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
    void api.auditComms.markNotificationRead(id).catch((err) => {
      console.error('Failed to mark notification read', err);
    });
  };

  const toggleThemeMode = () => {
    setState((prev) => {
      const currentMode = prev.customOptions?.featureToggles?.themeMode || 'light';
      const nextMode = currentMode === 'dark' ? 'light' : 'dark';
      if (typeof document !== 'undefined') {
        if (nextMode === 'dark') {
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
          document.documentElement.setAttribute('data-theme', 'dark');
        } else {
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
          document.documentElement.setAttribute('data-theme', 'light');
        }
      }
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

  const toggleTimer = () => {
    setTimerActive(!timerActive);
  };

  const resetTimer = () => {
    setTimerActive(false);
    setTimerSeconds(1500);
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const contextValue = useMemo(() => ({
    state,
    setState,
    updateState,
    isLoaded,
    backendStatus,
    syncWithBackend,
    currentPersona: state.currentPersona,
    selectPersona,
    login,
    logout,
    toasts,
    triggerToast,
    dismissToast,
    navigateToToast,
    timerSeconds,
    timerActive,
    toggleTimer,
    resetTimer,
    setTimerSeconds,
    formatTimer,
    themeMode: state.customOptions?.featureToggles?.themeMode || 'light',
    toggleThemeMode,
    commandPaletteOpen,
    setCommandPaletteOpen,
    aiAssistantOpen,
    setAiAssistantOpen,
    aiQuery,
    setAiQuery,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    markNotificationRead,
    markAllNotificationsRead,
    clearReadNotifications,
    deleteNotification,
    clearAllNotifications,
    pushNotification,
  }), [
    state,
    isLoaded,
    backendStatus,
    timerSeconds,
    timerActive,
    commandPaletteOpen,
    aiAssistantOpen,
    aiQuery,
    mobileSidebarOpen,
    toasts,
    syncWithBackend,
    logout,
    updateState,
  ]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
