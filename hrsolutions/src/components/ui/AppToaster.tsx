'use client';

import { Toaster } from 'sonner';
import { useApp } from '@/context/AppContext';

/**
 * Single app-wide Sonner host. Mount once under AppProvider — never per-page.
 * Theme tracks the workspace light/dark toggle.
 */
export function AppToaster() {
  const { themeMode } = useApp();

  return (
    <Toaster
      theme={themeMode}
      position="bottom-right"
      closeButton
      richColors
      expand={false}
      visibleToasts={4}
      gap={12}
      offset={24}
      mobileOffset={{ bottom: 72, right: 16 }}
      toastOptions={{
        classNames: {
          toast:
            '!font-sans !rounded-xl !border !border-[var(--border-color)] !bg-[var(--bg-surface)] !text-[var(--text-primary)] !shadow-[0_8px_30px_rgba(15,23,42,0.12)]',
          title: '!text-sm !font-semibold !tracking-tight',
          description: '!text-xs !text-[var(--text-secondary)]',
          actionButton:
            '!bg-[var(--primary-blue)] !text-white !text-xs !font-semibold !rounded-lg',
          cancelButton:
            '!bg-[var(--bg-surface-subtle)] !text-[var(--text-secondary)] !text-xs !font-semibold !rounded-lg',
          closeButton:
            '!bg-[var(--bg-surface)] !border-[var(--border-color)] !text-[var(--text-muted)]',
        },
      }}
    />
  );
}
