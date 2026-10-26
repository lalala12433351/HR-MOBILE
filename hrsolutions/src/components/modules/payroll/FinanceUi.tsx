import React from 'react';
import { Info } from 'lucide-react';

export function FinanceStatus({ status }: { status: string }) {
  const normalized = status.replace(/_/g, ' ').toLowerCase();
  const tone = ['paid', 'partially paid', 'approved', 'ready', 'on target'].includes(normalized)
    ? 'success'
    : ['short', 'missing bank details', 'pending'].includes(normalized)
      ? 'warning'
      : ['overdue', 'rejected', 'cancelled'].includes(normalized) ? 'danger' : 'info';
  return <span className="finance-status" data-tone={tone}>{status.replace(/_/g, ' ')}</span>;
}

export function FinanceNote({ title, children, tone = 'info' }: { title: string; children: React.ReactNode; tone?: 'info' | 'warning' | 'success' }) {
  return <div className="finance-note" data-tone={tone}><Info size={16} aria-hidden="true" /><div><strong>{title}</strong><p>{children}</p></div></div>;
}
