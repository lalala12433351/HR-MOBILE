'use client';

import React, { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  busyLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={description ? 'confirm-dialog-description' : undefined}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-100 bg-white p-6 text-slate-900 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900">
            {title}
          </h3>
        </div>
        {description ? (
          <p
            id="confirm-dialog-description"
            className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-600"
          >
            {description}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-2xs transition-all hover:bg-slate-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="cursor-pointer rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? busyLabel || confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
