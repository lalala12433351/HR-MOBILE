'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { UserReport } from '@/utils/userReport';
import { UserReportView } from './UserReportView';

export function UserReportModal({
  isOpen,
  onClose,
  report,
  organizationName,
}: {
  isOpen: boolean;
  onClose: () => void;
  report: UserReport | null;
  organizationName: string;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !report) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-report-title"
        className="people-studio flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-app)] shadow-[0_9px_22px_rgba(26,58,84,0.09)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-color)] bg-[var(--bg-surface)] px-5 py-3">
          <h2 id="user-report-title" className="people-studio__title">
            User report
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="people-studio__btn people-studio__btn--ghost inline-flex h-9 w-9 items-center justify-center p-0"
          >
            <X size={16} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <UserReportView report={report} organizationName={organizationName} />
        </div>
      </div>
    </div>
  );
}
