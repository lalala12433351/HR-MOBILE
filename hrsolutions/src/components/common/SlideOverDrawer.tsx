'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const slideOverCancelClass =
  'flex-1 py-2.5 sm:py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-sm font-semibold text-[var(--text-secondary)] cursor-pointer transition-colors disabled:opacity-50';

export const slideOverPrimaryClass =
  'flex-1 py-2.5 sm:py-3 rounded-xl bg-[var(--studio-navy)] hover:bg-[var(--studio-navy-hover)] text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed';

export const slideOverBodyClass =
  'flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 sm:px-8 space-y-4 sm:space-y-5 text-xs';

export const slideOverFooterClass =
  'p-4 sm:p-5 sm:px-8 border-t border-[var(--border-color)] bg-[var(--bg-surface)] flex items-center justify-end gap-3 shrink-0';

interface SlideOverDrawerProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  zClass?: string;
  panelClassName?: string;
  labelledBy?: string;
}

export function SlideOverDrawer({
  title,
  description,
  onClose,
  children,
  footer,
  zClass = 'z-50',
  panelClassName = '',
  labelledBy,
}: SlideOverDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const titleId = labelledBy || 'slide-over-title';

  return (
    <div
      className={`fixed inset-0 ${zClass} flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200`}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className={`mobile-drawer-panel relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-[var(--bg-surface)] border-l border-[var(--border-color)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-[var(--text-primary)] ${panelClassName}`.trim()}
      >
        <div className="p-4 sm:p-6 sm:px-8 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0 gap-2">
          <div className="min-w-0 flex-1 pr-2">
            <h3 id={titleId} className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-xs font-medium text-[var(--text-muted)] leading-relaxed">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-2 cursor-pointer rounded-xl hover:bg-[var(--bg-surface-subtle)] transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {footer ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 sm:px-8">{children}</div>
            <div className={slideOverFooterClass}>{footer}</div>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
