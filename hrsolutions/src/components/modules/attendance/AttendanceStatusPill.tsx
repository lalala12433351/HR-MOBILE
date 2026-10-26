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
  on_time: 'work-chip work-chip-sage',
  present: 'work-chip work-chip-sage',
  late: 'work-chip work-chip-navy',
  absent: 'work-chip work-chip-muted',
  on_leave: 'work-chip work-chip-muted',
  wfh: 'work-chip work-chip-navy',
  logged_out: 'work-chip work-chip-muted',
  pending: 'work-chip work-chip-navy',
  approved: 'work-chip work-chip-sage',
  rejected: 'work-chip work-chip-error',
  neutral: 'work-chip work-chip-muted',
};

interface AttendanceStatusPillProps {
  kind: AttendanceStatusKind;
  label: string;
  className?: string;
}

export function AttendanceStatusPill({ kind, label, className = '' }: AttendanceStatusPillProps) {
  return <span data-attendance-status={kind} className={`${STYLES[kind]} ${className}`.trim()}>{label}</span>;
}
