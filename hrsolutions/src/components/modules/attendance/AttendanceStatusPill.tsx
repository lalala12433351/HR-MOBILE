'use client';

import React from 'react';

export type AttendanceStatusKind =
  | 'on_time'
  | 'present'
  | 'late'
  | 'absent'
  | 'on_leave'
  | 'wfh'
  | 'logged_out'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'neutral';

const STYLES: Record<AttendanceStatusKind, string> = {
  on_time: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  present: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  late: 'bg-amber-50 text-amber-800 border-amber-200/80',
  absent: 'bg-slate-900 text-white border-slate-900',
  on_leave: 'bg-slate-100 text-slate-600 border-slate-200/80',
  wfh: 'bg-sky-50 text-sky-700 border-sky-200/80',
  logged_out: 'bg-slate-100 text-slate-700 border-slate-200/80',
  pending: 'bg-amber-50 text-amber-800 border-amber-200/80',
  approved: 'bg-emerald-600 text-white border-emerald-600',
  rejected: 'bg-rose-600 text-white border-rose-600',
  neutral: 'bg-slate-100 text-slate-600 border-slate-200/80',
};

interface AttendanceStatusPillProps {
  kind: AttendanceStatusKind;
  label: string;
  className?: string;
}

export function AttendanceStatusPill({ kind, label, className = '' }: AttendanceStatusPillProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STYLES[kind]} ${className}`}
    >
      {label}
    </span>
  );
}
