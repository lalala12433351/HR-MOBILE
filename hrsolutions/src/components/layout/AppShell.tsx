'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AppProvider, useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileBottomBar } from './MobileBottomBar';
import { ImpersonationBanner } from '@/components/common/ImpersonationBanner';
import { LicenseBanner } from '@/components/common/LicenseBanner';
import { CommandPalette } from '@/components/common/CommandPalette';
import { AIAssistantModal } from '@/components/ai/AIAssistantModal';
import { AppToaster } from '@/components/ui/AppToaster';
import { isMasterAdminHost } from '@/config/origins';
import { ChatProvider } from '@/hooks/useChat';
import { useWorkplaceLocationWatch } from '@/hooks/useWorkplaceLocationWatch';

function AppShellContent({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
  useWorkplaceLocationWatch();

  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/signup' ||
    pathname === '/student-login' ||
    pathname === '/accept-invite' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    Boolean(pathname?.startsWith('/student-login'));
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

  // Strict route protection: authenticated only when a real credential exists
  useEffect(() => {
    if (!isLoaded || isAuthPage || isMasterAdminPage || isImpersonatePage) return;

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

    // Staff session with token but persona never hydrated after sync — don't spin forever
    if (hasToken && state.isAuthenticated && !currentPersona && backendStatus !== 'syncing') {
      const timer = window.setTimeout(() => {
        if (!api.getToken()) return;
        // Still no persona after grace period — session is unusable
        logout();
      }, 8000);
      return () => window.clearTimeout(timer);
    }
  }, [
    isLoaded,
    state.isAuthenticated,
    isAuthPage,
    isMasterAdminPage,
    isImpersonatePage,
    router,
    pathname,
    currentPersona,
    logout,
    backendStatus,
  ]);

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
  if (isAuthPage || isMasterAdminPage || isImpersonatePage || isSetupPage || isEmployeeOnboardingPage) {
    return (
      <div className="h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-y-auto custom-scrollbar">
        {children}
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

  const handleSelectModule = (moduleId: string) => {
    const path = moduleId === 'dashboard' ? '/dashboard' : `/${moduleId}`;
    router.push(path);
  };

  if (!currentPersona) {
    return (
      <div className="h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] font-sans flex items-center justify-center">
        <p className="text-sm text-[var(--text-secondary)]">Loading workspace…</p>
      </div>
    );
  }

  const isChatPage = pathname === '/chat';
  const isPayrollPage = Boolean(pathname?.startsWith('/payroll'));
  const isFillCanvas = isChatPage || isPayrollPage;
  const isWorkPage = pathname === '/projects' || pathname === '/timesheets';

  return (
    <ChatProvider>
    <div className="flex h-screen w-full bg-[var(--bg-app)] text-[var(--text-primary)] overflow-hidden font-sans">
      {/* Fixed Sidebar Dock on Desktop / Slide-over Drawer on Mobile */}
      <Sidebar
        currentPersona={currentPersona}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Connected Workspace Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-transparent pl-0 lg:pl-[var(--sidebar-width)]">
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
        ) : isFillCanvas ? (
          <main className="pixbe-main flex flex-col flex-1 w-full max-w-[1600px] mx-auto min-w-0 min-h-0 overflow-hidden px-5 sm:px-6 lg:px-8 pt-5 pb-[88px] lg:pb-6 relative">
            {children}
          </main>
        ) : (
          <main className={`pixbe-main ${isWorkPage ? 'work-main' : ''} ${pathname === '/projects' ? 'projects-surface' : ''} flex-1 w-full max-w-[1600px] mx-auto min-w-0 overflow-y-auto px-6 lg:px-8 pb-16 sm:pb-20 custom-scrollbar relative`}>
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
