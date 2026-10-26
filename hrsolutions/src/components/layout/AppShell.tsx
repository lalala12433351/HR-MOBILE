'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AppProvider, useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';
import { AuthService } from '@/services/authService';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomBar } from './MobileBottomBar';
import { ImpersonationBanner } from '@/components/common/ImpersonationBanner';
import { LicenseBanner } from '@/components/common/LicenseBanner';
import { CommandPalette } from '@/components/common/CommandPalette';
import { AIAssistantModal } from '@/components/ai/AIAssistantModal';
import { AttendanceSessionGuard } from '@/components/attendance/AttendanceSessionGuard';
import { NativeShellBootstrap } from '@/components/native/NativeShellBootstrap';
import { isNativePlatform } from '@/lib/native';
import { AppToaster } from '@/components/ui/AppToaster';
import { DesktopPushPrompt } from '@/components/common/DesktopPushPrompt';
import { IMPERSONATION_TENANT_KEY, isMasterAdminHost } from '@/config/origins';
import { ChatProvider } from '@/hooks/useChat';
import {
  clearDesktopPushLoginAsk,
  desktopPushGranted,
  desktopPushLoginAskPending,
  syncDesktopPush,
} from '@/services/desktopPush';

/** Max wait for persona to hydrate from session /me before forcing re-login. */
const PERSONA_HYDRATE_MS = 4000;

function AppShellContent({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname()?.replace(/\/+$/, '') || '/';
  const {
    state,
    isLoaded,
    backendStatus,
    currentPersona,
    selectPersona,
    logout,
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
    themeMode,
    toggleThemeMode,
  } = useApp();
  const [personaTimedOut, setPersonaTimedOut] = useState(false);
  const [pushAskOpen, setPushAskOpen] = useState(false);
  const personaHydrateAttempted = useRef(false);

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/signup' ||
    pathname === '/student-login' ||
    pathname === '/accept-invite' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/change-email' ||
    Boolean(pathname?.startsWith('/student-login'));
  const isDevPreviewPage =
    process.env.NODE_ENV === 'development' && Boolean(pathname?.startsWith('/dev/'));
  const hostname = typeof window !== 'undefined' ? window.location.hostname : null;
  const onMasterAdminHost = isMasterAdminHost(hostname);
  // Trust the path for shell bypass — host gating lives in proxy / page HostGate.
  // Do not require hostname here: SSR has no window, and that used to trap the console
  // in the tenant "Loading workspace..." gate forever on first paint.
  const isMasterAdminPage =
    Boolean(pathname?.startsWith('/master-admin')) ||
    (onMasterAdminHost && (pathname === '/' || pathname === ''));
  const isImpersonatePage = pathname === '/impersonate' || Boolean(pathname?.startsWith('/impersonate/'));
  const isSetupPage = pathname === '/setup';
  const isEmployeeOnboardingPage = pathname === '/employee-onboarding';
  const bypassTenantGates =
    isAuthPage ||
    isMasterAdminPage ||
    isImpersonatePage ||
    isSetupPage ||
    isEmployeeOnboardingPage ||
    isDevPreviewPage;

  // Strict route protection: AppContext already verified the authorization token before isLoaded.
  useEffect(() => {
    if (!isLoaded || isAuthPage || isMasterAdminPage || isImpersonatePage || isDevPreviewPage) return;

    const hasToken = Boolean(api.getToken());

    if (!hasToken) {
      if (state.isAuthenticated) {
        // Stale React auth without credentials — force login
        logout();
        return;
      }
      router.replace('/login');
      return;
    }

    // Token exists — stay on the workspace. Persona hydrates from stored session / /me.
  }, [
    isLoaded,
    state.isAuthenticated,
    isAuthPage,
    isMasterAdminPage,
    isImpersonatePage,
    isDevPreviewPage,
    router,
    logout,
  ]);

  // Rehydrate persona from AuthService when React state lost it (cold load strips persona).
  useEffect(() => {
    if (!isLoaded || bypassTenantGates || currentPersona) {
      if (currentPersona) {
        personaHydrateAttempted.current = false;
        setPersonaTimedOut(false);
      }
      return;
    }
    if (!state.isAuthenticated || !api.getToken()) return;
    if (personaHydrateAttempted.current) return;

    personaHydrateAttempted.current = true;
    const session = AuthService.getSession();
    if (session) {
      selectPersona({
        id: session.sub,
        name: session.name || session.email || 'User',
        email: session.email || '',
        role: session.role as any,
        designation: session.role === 'super_admin' ? 'Founder & CEO' : 'Team Member',
        department: session.role === 'student' ? 'Academic' : 'Management',
        avatar: '',
      });
    }
  }, [
    isLoaded,
    bypassTenantGates,
    currentPersona,
    state.isAuthenticated,
    selectPersona,
  ]);

  // Bound wait: never leave the user on "Loading workspace…" forever.
  useEffect(() => {
    if (!isLoaded || bypassTenantGates || currentPersona) {
      setPersonaTimedOut(false);
      return;
    }
    if (!state.isAuthenticated) return;

    const timer = window.setTimeout(() => {
      setPersonaTimedOut(true);
    }, PERSONA_HYDRATE_MS);

    return () => window.clearTimeout(timer);
  }, [isLoaded, bypassTenantGates, currentPersona, state.isAuthenticated]);

  useEffect(() => {
    if (!currentPersona || bypassTenantGates || !state.isAuthenticated || isNativePlatform()) return;
    let impersonating = false;
    try {
      impersonating = Boolean(sessionStorage.getItem(IMPERSONATION_TENANT_KEY));
    } catch {
      impersonating = false;
    }
    if (impersonating || desktopPushGranted() || !desktopPushLoginAskPending()) {
      if (impersonating || desktopPushGranted()) clearDesktopPushLoginAsk();
      return;
    }
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      clearDesktopPushLoginAsk();
      return;
    }
    setPushAskOpen(true);
  }, [currentPersona, bypassTenantGates, state.isAuthenticated]);

  const dismissPushAsk = () => {
    clearDesktopPushLoginAsk();
    setPushAskOpen(false);
  };

  useEffect(() => {
    if (!currentPersona || bypassTenantGates || !state.isAuthenticated || isNativePlatform()) return;
    void syncDesktopPush();
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | null;
      if (!data || data.type !== 'pixbe-push-open' || typeof data.url !== 'string') return;
      try {
        const url = new URL(data.url, window.location.origin);
        if (url.origin !== window.location.origin) return;
        router.push(`${url.pathname}${url.search}`);
      } catch {
        /* ignore a malformed notification url */
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [currentPersona, bypassTenantGates, state.isAuthenticated, router]);

  const handleSessionRecovery = () => {
    logout();
    router.replace('/login?reason=session');
  };

  // Incomplete employee profile → force onboarding (durable gate beyond login routing)
  useEffect(() => {
    if (!isLoaded || isAuthPage || isMasterAdminPage || isImpersonatePage || isSetupPage || isEmployeeOnboardingPage) return;
    if (!state.isAuthenticated || !api.getToken()) return;
    if (backendStatus === 'syncing') return;

    const role = currentPersona?.role;
    if (!role || role === 'student' || role === 'super_admin') return;

    const matched = (state.employees || []).find(
      (e) =>
        e.id === currentPersona?.id ||
        (currentPersona?.email && e.email?.toLowerCase() === currentPersona.email.toLowerCase())
    );
    if (!matched) return;
    if (matched.hasCompletedProfile === true || (matched.onboardingProgress || 0) >= 100) return;

    router.replace('/employee-onboarding');
  }, [
    isLoaded,
    isAuthPage,
    isMasterAdminPage,
    isImpersonatePage,
    isSetupPage,
    isEmployeeOnboardingPage,
    state.isAuthenticated,
    state.employees,
    currentPersona,
    backendStatus,
    router,
  ]);

  // Platform console / auth surfaces must render immediately — do not wait on tenant AppContext.
  if (bypassTenantGates) {
    return (
      <div className="h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-y-auto custom-scrollbar">
        {children}
      </div>
    );
  }

  const handleSelectModule = (moduleId: string) => {
    const path = moduleId === 'dashboard' ? '/dashboard' : `/${moduleId}`;
    router.push(path);
  };

  // Session could not be restored — never spin forever
  if (personaTimedOut && !currentPersona) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-primary)] font-sans px-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <p className="text-sm text-[var(--text-secondary)]">
            Couldn&apos;t restore your session. Sign in again to open your workspace.
          </p>
          <button
            type="button"
            onClick={handleSessionRecovery}
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--studio-navy)] text-white hover:opacity-90"
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  // Loading state while checking authentication session (tenant app only)
  if (!isLoaded || !state.isAuthenticated) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg-app)] flex items-center justify-center text-[var(--text-primary)] font-sans">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 border-[var(--studio-navy)] border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-[var(--text-secondary)] font-medium">
            Loading workspace...
          </span>
        </div>
      </div>
    );
  }

  if (!currentPersona) {
    return (
      <div className="h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] font-sans flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 border-[var(--studio-navy)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Loading workspace…</p>
        </div>
      </div>
    );
  }

  const isChatPage = pathname === '/chat';
  const isPayrollPage = Boolean(pathname?.startsWith('/payroll'));
  const isWorkPage = pathname === '/projects' || pathname === '/timesheets';

  return (
    <ChatProvider>
    <div data-workspace-page={pathname} className="pixbe-app flex h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden font-sans">
      {/* Fixed Sidebar Dock on Desktop / Slide-over Drawer on Mobile */}
      <Sidebar
        currentPersona={currentPersona}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Connected Workspace Area */}
      <div className="workspace-canvas flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-transparent pl-0 lg:pl-[var(--sidebar-width)]">
        {/* Impersonation Banner if active */}
        <ImpersonationBanner />
        {!isMasterAdminPage && !isSetupPage && !isEmployeeOnboardingPage && <LicenseBanner />}

        {/* ─── GLOBAL TOP NAVIGATION HEADER ─── */}
        <Header
          currentPersona={currentPersona}
          onSelectPersona={selectPersona}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenAIAssistant={() => setAiAssistantOpen(true)}
          onOpenQuickTimer={() => router.push('/productivity')}
          notifications={state.notifications || []}
          onMarkNotificationRead={markNotificationRead}
          onMarkAllNotificationsRead={markAllNotificationsRead}
          onClearReadNotifications={clearReadNotifications}
          onNavigateModule={handleSelectModule}
          onToggleMobileSidebar={() => setMobileSidebarOpen(true)}
          themeMode={themeMode}
          onToggleThemeMode={toggleThemeMode}
        />

        {/* Dynamic Page Content Directly in Canvas */}
        {isChatPage ? (
          <main className="pixbe-main chat-main flex flex-col flex-1 w-full min-w-0 min-h-0 overflow-hidden relative">
            {children}
          </main>
        ) : isPayrollPage ? (
          <main className="pixbe-main flex flex-col flex-1 w-full max-w-[1600px] mx-auto min-w-0 min-h-0 overflow-y-auto px-5 sm:px-6 lg:px-8 pt-5 pb-[88px] lg:pb-6 relative">
            {children}
          </main>
        ) : (
          <main className={`pixbe-main ${isWorkPage ? 'work-main' : ''} ${pathname === '/projects' ? 'projects-surface' : ''} flex-1 w-full max-w-[1600px] mx-auto min-w-0 overflow-y-auto px-4 sm:px-6 lg:px-8 pb-[88px] lg:pb-16 custom-scrollbar relative`}>
            {children}
          </main>
        )}

        {/* ─── MINIMALIST MOBILE BOTTOM NAVIGATION BAR ─── */}
        <MobileBottomBar />
      </div>

      {/* Command Palette Modal */}
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

      {pushAskOpen ? <DesktopPushPrompt onClose={dismissPushAsk} /> : null}
      <NativeShellBootstrap />
      <AttendanceSessionGuard />
    </div>
    </ChatProvider>
  );
}

export function AppShell({ children }: { children?: React.ReactNode }) {
  return (
    <AppProvider>
      <AppToaster />
      <AppShellContent>{children}</AppShellContent>
    </AppProvider>
  );
}
