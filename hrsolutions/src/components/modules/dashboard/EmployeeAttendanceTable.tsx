'use client';
import { ResponsiveTable } from '@/components/common/ResponsiveTable';

import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useDashboardContext } from './DashboardDataContext';
import { AttendanceRecord } from '@/types';
import { UserAvatar } from '@/components/common/UserAvatar';
import { DashPanel } from './DashPanel';
import { approvedAbsenceOnDay, localDateKey } from '@/utils/dashboardPeople';

export const EmployeeAttendanceTable: React.FC<{ className?: string }> = ({ className = '' }) => {
  const dashboardState = useDashboardContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'On-Time' | 'Late' | 'Remote' | 'On-Leave' | 'Absent'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 5;

  const employees = dashboardState.employees || [];
  const attendance = dashboardState.attendance || [];
  const leaves = dashboardState.leaves || [];
  const todayStr = localDateKey();

  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  // Join real employees with attendance punches and approved leaves for today
  const allRows = useMemo(() => {
    const attendanceMap = new Map<string, AttendanceRecord>();
    attendance.forEach((a) => {
      if (a.date === todayStr) {
        attendanceMap.set(a.employeeId, a);
      }
    });

    return employees.map((emp) => {
      const att = attendanceMap.get(emp.id) || attendanceMap.get(emp.employeeId);
      const onLeave = Boolean(approvedAbsenceOnDay(leaves, emp, todayStr));

      let status: 'On-Time' | 'Late' | 'Remote' | 'On-Leave' | 'Absent' = 'Absent';
      let checkIn = '—';
      let checkOut = '—';

      if (att?.checkIn) {
        const formatTime = (tStr?: string) => {
          if (!tStr || tStr === '—' || !tStr.trim()) return '—';
          const clean = tStr.replace(/\s*\(GMT[^)]*\)/gi, '').trim();
          if (/\b(AM|PM)\b/i.test(clean)) return clean;
          const match = clean.match(/^(\d{1,2}):(\d{2})/);
          if (match) {
            const h = parseInt(match[1], 10);
            const m = match[2];
            return `${String(h % 12 || 12).padStart(2, '0')}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
          }
          return clean;
        };

        checkIn = formatTime(att.checkIn);
        checkOut = att.checkOut ? formatTime(att.checkOut) : '—';
        const rawStatus = String(att.status || '').toLowerCase();
        if (rawStatus === 'late') status = 'Late';
        else if (rawStatus.includes('home') || rawStatus === 'wfh' || rawStatus === 'remote') status = 'Remote';
        else status = 'On-Time';
      } else if (onLeave) {
        status = 'On-Leave';
      }

      const nameParts = (emp.name || emp.fullName || 'User').split(' ');
      const initials =
        nameParts.length >= 2
          ? `${nameParts[0][0]}${nameParts[1][0]}`
          : nameParts[0].slice(0, 2).toUpperCase();

      return {
        id: emp.id,
        name: emp.name || emp.fullName || '—',
        email: emp.email || '—',
        avatar: emp.avatar,
        initials,
        designation: emp.designation || emp.role || 'Specialist',
        department: emp.department || 'Operations',
        date: formattedDate,
        checkIn,
        checkOut,
        status,
        checkInColor: status === 'Late' ? 'text-[var(--studio-error)] font-semibold' : undefined,
      };
    });
  }, [employees, attendance, leaves, todayStr, formattedDate]);

  const summaryCounts = useMemo(() => {
    const onTime = allRows.filter((r) => r.status === 'On-Time').length;
    const late = allRows.filter((r) => r.status === 'Late').length;
    const remote = allRows.filter((r) => r.status === 'Remote').length;
    const onLeave = allRows.filter((r) => r.status === 'On-Leave').length;
    const absent = allRows.filter((r) => r.status === 'Absent').length;

    return { onTime, late, remote, onLeave, absent };
  }, [allRows]);

  const filteredRows = useMemo(() => {
    let result = allRows;
    if (statusFilter !== 'all') {
      result = result.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.department.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allRows, statusFilter, searchQuery]);

  const totalMembersCount = employees.length;
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));

  const paginatedRows = useMemo(() => {
    if (filteredRows.length <= pageSize) return filteredRows;
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  return (
    <DashPanel
      title="Who is in today"
      className={className}
      purpose="employee-attendance-table"
      padded={false}
      action={
        <Link href="/attendance" className="dash-quiet-link">Team attendance ↗</Link>
      }
    >
      <div className="dash-attendance-summary">
        <span>{summaryCounts.onTime + summaryCounts.late + summaryCounts.remote} checked in, {summaryCounts.absent} not in yet, {summaryCounts.onLeave} on leave</span>
        <span className="dash-attendance-live">Live attendance</span>
      </div>
      <details className="dash-attendance-tools">
        <summary className="dash-quiet-link cursor-pointer">Search and filter team</summary>
      <div className="pt-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          {/* Summary Count Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'On-Time' ? 'all' : 'On-Time');
                setCurrentPage(1);
              }}
              className="dash-chip"
              data-active={statusFilter === 'On-Time' ? 'true' : 'false'}
            >
              {summaryCounts.onTime} In office
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'Remote' ? 'all' : 'Remote');
                setCurrentPage(1);
              }}
              className="dash-chip"
              data-active={statusFilter === 'Remote' ? 'true' : 'false'}
            >
              {summaryCounts.remote} Remote
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'Late' ? 'all' : 'Late');
                setCurrentPage(1);
              }}
              className="dash-chip"
              data-active={statusFilter === 'Late' ? 'true' : 'false'}
            >
              {summaryCounts.late} Late
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'On-Leave' ? 'all' : 'On-Leave');
                setCurrentPage(1);
              }}
              className="dash-chip"
              data-active={statusFilter === 'On-Leave' ? 'true' : 'false'}
            >
              {summaryCounts.onLeave} On leave
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'Absent' ? 'all' : 'Absent');
                setCurrentPage(1);
              }}
              className="dash-chip"
              data-active={statusFilter === 'Absent' ? 'true' : 'false'}
            >
              {summaryCounts.absent} Not in yet
            </button>

            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setCurrentPage(1);
                }}
                className="text-xs text-[var(--studio-navy)] font-semibold hover:underline ml-1 cursor-pointer"
              >
                Clear Filter
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              aria-label="Search team"
              placeholder="Search team"
              className="pl-8 pr-3 h-9 text-xs rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-blue)] focus:border-[var(--primary-blue)] w-40 sm:w-56"
            />
          </div>
        </div>
      </div>

      </details>

      {/* Data Table */}
      <div className="overflow-x-auto">
        <ResponsiveTable className="dash-attendance-table w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] font-bold text-[11px]">
              <th className="py-2.5 px-4" scope="col">Person</th>
              <th className="py-2.5 px-4" scope="col">Department</th>
              <th className="py-2.5 px-4" scope="col">Status</th>
              <th className="py-2.5 px-4" scope="col">Clock in</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-color)]">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-[var(--text-muted)] text-xs">
                  No employee attendance records found
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => (
                <tr key={row.id} className="even:bg-[var(--bg-surface-subtle)]/40 hover:bg-[var(--bg-surface-subtle)]">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        src={row.avatar}
                        name={row.name}
                        className="w-8 h-8 text-xs shrink-0"
                      />
                      <div>
                        <span className="font-bold text-[var(--text-primary)] block">{row.name}</span>
                        <span className="text-[11px] text-[var(--text-muted)]">{row.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-[var(--text-secondary)] font-medium">{row.department}</td>
                  <td className="py-2.5 px-4">
                    {row.status === 'On-Time' && <span className="dash-pill dash-pill--office">In office</span>}
                    {row.status === 'Remote' && <span className="dash-pill dash-pill--remote">Remote</span>}
                    {row.status === 'Late' && <span className="dash-pill dash-pill--away">Late</span>}
                    {row.status === 'On-Leave' && <span className="dash-pill dash-pill--leave">On leave</span>}
                    {row.status === 'Absent' && <span className="dash-pill dash-pill--away">Not in yet</span>}
                  </td>
                  <td
                    className={`py-2.5 px-4 tabular-nums ${row.checkIn === '—' ? 'text-[var(--text-muted)]' : 'font-semibold text-[var(--text-primary)]'}`}
                    title={row.checkOut !== '—' ? `Clock out ${row.checkOut}` : row.email}
                  >
                    {row.checkIn}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </ResponsiveTable>
      </div>

      {/* Pagination Footer */}
      <div className="pt-4 flex flex-wrap gap-3 items-center justify-between text-xs text-[var(--text-muted)]">
        <span>
          Showing <strong className="text-[var(--text-primary)] font-semibold">{paginatedRows.length}</strong> of <strong className="text-[var(--text-primary)] font-semibold">{filteredRows.length}</strong> team members
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="h-9 px-3 rounded-[7px] border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed font-medium cursor-pointer"
          >
            Previous
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
            const pageNum = Math.min(Math.max(1, currentPage - 2), Math.max(1, totalPages - 4)) + i;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`h-9 px-3 rounded-[7px] border font-medium cursor-pointer ${
                  currentPage === pageNum
                    ? 'border-[var(--studio-navy)] bg-[var(--studio-navy)] text-white font-bold'
                    : 'border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="h-9 px-3 rounded-[7px] border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] disabled:opacity-40 disabled:cursor-not-allowed font-medium cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    </DashPanel>
  );
};
