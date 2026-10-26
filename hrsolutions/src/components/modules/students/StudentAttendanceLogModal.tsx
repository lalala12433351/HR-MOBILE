'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  CalendarCheck,
  Search,
  ArrowUpRight,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { Student, AttendanceRecord } from '@/types';

interface StudentAttendanceLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  attendanceRecords: AttendanceRecord[];
  minThreshold?: number;
  warningMessage?: string;
}

export const StudentAttendanceLogModal: React.FC<StudentAttendanceLogModalProps> = ({
  isOpen,
  onClose,
  student,
  attendanceRecords = [],
  minThreshold = 75,
  warningMessage,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen || !student) return null;

  // Filter attendance records specific to this student
  const studentLogs = useMemo(() => {
    return attendanceRecords.filter(
      (a) =>
        a.employeeId === student.id ||
        a.employeeId === student.studentId ||
        (a.employeeName && a.employeeName.toLowerCase() === student.name.toLowerCase())
    );
  }, [attendanceRecords, student]);

  // Daily logs for this student
  const displayLogs = useMemo(() => {
    return [...studentLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [studentLogs]);

  // Attendance Metrics Computation
  const totalDays = displayLogs.length;
  const presentDays = displayLogs.filter((d) => d.status === 'Present').length;
  const lateDays = displayLogs.filter((d) => d.status === 'Late').length;
  const leaveDays = displayLogs.filter((d) => d.status === 'On Leave' || d.status === 'Absent').length;
  const attendanceRate = totalDays > 0 ? Math.round(((presentDays + lateDays) / totalDays) * 100) : 0;
  const isBelowThreshold = totalDays > 0 && attendanceRate < minThreshold;

  // Filtered rows
  const filteredLogs = useMemo(() => {
    return displayLogs.filter((log) => {
      const matchStatus = statusFilter === 'All' || log.status.toLowerCase() === statusFilter.toLowerCase();
      const matchQuery =
        !searchQuery.trim() ||
        log.date.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.locationName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchStatus && matchQuery;
    });
  }, [displayLogs, statusFilter, searchQuery]);

  // Format Date for UI
  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200 cursor-pointer"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-[var(--bg-surface)] border-l border-[var(--border-color)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-[var(--text-primary)] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Simplified Header */}
        <div className="p-4 sm:p-6 pb-4 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0 gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <img
              src={
                student.avatar ||
                'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
              }
              alt={student.name}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full object-cover ring-2 ring-slate-100 bg-[var(--bg-surface-subtle)] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-[var(--text-primary)] tracking-tight truncate">{student.name}</h3>
                <span className="bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] font-mono text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded-md shrink-0">
                  #{student.rollNumber}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-medium mt-0.5 truncate">
                {student.grade || '—'} {student.section ? `• Sec ${student.section}` : ''} • STU-{student.rollNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Summary Pill in Header */}
            <div className="hidden sm:flex flex-col items-end">
              <div className="flex items-center gap-1.5">
                <span className={`text-base font-extrabold leading-tight ${isBelowThreshold ? 'text-amber-800' : 'text-blue-600'}`}>
                  {attendanceRate}%
                </span>
                {isBelowThreshold && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    <AlertTriangle className="h-2.5 w-2.5 text-amber-600" /> At-Risk
                  </span>
                )}
              </div>
              <span className="text-[10px] font-semibold text-[var(--text-muted)]">
                {presentDays + lateDays}/{totalDays} Present
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-[var(--bg-surface-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] flex items-center justify-center transition-colors cursor-pointer"
              title="Close"
            >
              <X className="h-4 w-4 stroke-[2.2]" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1 text-xs bg-[var(--bg-surface)]">
          {/* Low Attendance Alert Banner */}
          {isBelowThreshold && (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900 shadow-2xs animate-in fade-in">
              <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-amber-900">Attendance Defaulter Warning</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200/80 text-amber-900 border border-amber-300">
                    {attendanceRate}% (Min. Req: {minThreshold}%)
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  {warningMessage || `Student attendance is below the mandatory ${minThreshold}% threshold. Guardian alert and remediation recommended.`}
                </p>
              </div>
            </div>
          )}

          {/* Streamlined Stats Strip & Progress Bar */}
          <div className="p-4 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] space-y-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block">Class Days</span>
                <span className="text-lg font-extrabold text-[var(--text-primary)]">{totalDays}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Present</span>
                <span className="text-lg font-extrabold text-emerald-600">{presentDays}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Late</span>
                <span className="text-lg font-extrabold text-amber-600">{lateDays}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block">Leave</span>
                <span className="text-lg font-extrabold text-rose-500">{leaveDays}</span>
              </div>
            </div>

            {/* Single Slim Progress Bar */}
            <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex gap-0.5">
              <div
                style={{ width: `${(presentDays / totalDays) * 100}%` }}
                className="bg-emerald-500 h-full rounded-l-full"
                title={`Present: ${presentDays}`}
              />
              <div
                style={{ width: `${(lateDays / totalDays) * 100}%` }}
                className="bg-amber-400 h-full"
                title={`Late: ${lateDays}`}
              />
              <div
                style={{ width: `${(leaveDays / totalDays) * 100}%` }}
                className="bg-rose-400 h-full rounded-r-full"
                title={`Leave: ${leaveDays}`}
              />
            </div>
          </div>

          {/* Filter Tabs & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-1 bg-[var(--bg-surface-subtle)] p-1 rounded-lg">
              {['All', 'Present', 'Late', 'On Leave'].map((st) => {
                const isSel = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSel
                        ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] '
                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>

            <div className="relative w-full sm:w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Filter date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] pl-8 pr-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-slate-400 outline-none focus:border-blue-500 transition-colors font-medium"
              />
            </div>
          </div>

          {/* Clean Minimal Table */}
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] uppercase font-bold text-[10px] border-b border-[var(--border-color)]">
                <tr>
                  <th className="p-3 pl-4">Date</th>
                  <th className="p-3">Check-In</th>
                  <th className="p-3">Check-Out</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3 text-right pr-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-[var(--text-secondary)] font-medium">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[var(--text-muted)]">
                      No logs found.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[var(--bg-surface-subtle)]/60 transition-colors">
                      <td className="p-3 pl-4 font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {formatDateDisplay(log.date)}
                      </td>
                      <td className="p-3 font-mono text-[var(--text-secondary)] whitespace-nowrap">
                        {log.checkIn || '—'}
                      </td>
                      <td className="p-3 font-mono text-[var(--text-muted)] whitespace-nowrap">
                        {log.checkOut || '—'}
                      </td>
                      <td className="p-3 font-mono text-[var(--text-muted)] whitespace-nowrap">
                        {log.workingHours ? `${Math.floor(log.workingHours)}h ${Math.round((log.workingHours % 1) * 60)}m` : '—'}
                      </td>
                      <td className="p-3 text-right pr-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.status === 'Present'
                              ? 'bg-emerald-50 text-emerald-700'
                              : log.status === 'Late'
                              ? 'bg-amber-50 text-amber-700'
                              : log.status === 'On Leave'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Minimal Footer */}
        <div className="p-4 sm:p-5 sm:px-6 border-t border-[var(--border-color)] bg-[var(--bg-surface)] flex items-center justify-between shrink-0 pb-7 sm:pb-5">
          <Link
            href="/student-attendance"
            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors"
          >
            <span>Live Terminal</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
