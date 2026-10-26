'use client';

import React, { useEffect, useId, useState } from 'react';
import { Bell } from 'lucide-react';
import { enableDesktopPush } from '@/services/desktopPush';

interface DesktopPushPromptProps {
  onClose: () => void;
}

export function DesktopPushPrompt({ onClose }: DesktopPushPromptProps) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = typeof Notification !== 'undefined' && Notification.permission === 'denied';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    const result = await enableDesktopPush();
    setBusy(false);
    if (result.ok) {
      onClose();
      return;
    }
    setError(result.reason || 'Desktop alerts could not be turned on.');
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-5"
      style={{ background: 'rgba(23, 34, 52, 0.45)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[420px] rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-surface)] p-5 text-[var(--text-primary)]"
        style={{ boxShadow: '0 5px 15px rgba(26, 46, 62, 0.06)' }}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--bg-surface-subtle)] text-[#17324e]">
            <Bell className="h-4 w-4" strokeWidth={1.8} />
          </div>
          <div>
            <h2 id={titleId} className="text-[15px] font-bold tracking-[-0.02em]">
              Turn on desktop alerts
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--text-secondary)]">
              {blocked
                ? 'Notifications are blocked for this site. Allow them in your browser settings, then turn desktop alerts on.'
                : 'Get mentions, task updates, and HR replies even when Pixbe is closed. Your browser will ask you to allow notifications.'}
            </p>
          </div>
        </div>
        {error ? <p className="mt-3 text-[12px] leading-relaxed text-[#8b3133]">{error}</p> : null}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="h-9 cursor-pointer rounded-[7px] border border-[var(--border-color)] px-3.5 text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] disabled:opacity-60"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void turnOn()}
            className="h-9 cursor-pointer rounded-[7px] bg-[#17324e] px-3.5 text-[13px] font-semibold text-white hover:bg-[#285275] disabled:opacity-60"
          >
            {busy ? 'Turning on…' : 'Turn on'}
          </button>
        </div>
      </div>
    </div>
  );
}
