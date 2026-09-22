'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { AttendanceRecord, LeaveRequest } from '@/types';
import { UserAvatar } from '@/components/common/UserAvatar';

export const EmployeeAttendanceTable: React.FC = () => {
  const { state } = useApp();
  const dashboardState = useDashboardContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<'all' | 'On-Time' | 'Late' | 'On-Leave' | 'Absent'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const pageSize = 5;

  const employees = dashboardState.employees || [];
  const attendance = dashboardState.attendance || [];
  const leaves = dashboardState.leaves || [];
  const todayStr = new Date().toISOString().split('T')[0];

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

    const activeLeavesSet = new Set<string>();
    leaves.forEach((l) => {
      if (l.status === 'Approved' && l.startDate <= todayStr && l.endDate >= todayStr) {
        activeLeavesSet.add(l.employeeId);
      }
    });

    const avatarBgs = [
      'bg-emerald-100 text-emerald-800',
      'bg-[#eff6ff] text-[#2563eb]',
      'bg-indigo-100 text-indigo-800',
      'bg-rose-100 text-rose-800',
      'bg-teal-100 text-teal-800',
    ];

    return employees.map((emp, idx) => {
      const att = attendanceMap.get(emp.id);
      const onLeave = activeLeavesSet.has(emp.id);

      let status: 'On-Time' | 'Late' | 'On-Leave' | 'Absent' = 'Absent';
      let checkIn = '—';
      let checkOut = '—';

      if (onLeave) {
        status = 'On-Leave';
      } else if (att) {
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

        const rawIn = att.checkIn ? att.checkIn.slice(0, 5) : '09:00';
        const isLate = att.status === 'Late' || rawIn > '09:15';
        status = isLate ? 'Late' : 'On-Time';
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
        avatarBg: avatarBgs[idx % avatarBgs.length],
        checkInColor: status === 'Late' ? 'text-amber-700 font-semibold' : undefined,
      };
    });
  }, [employees, attendance, leaves, todayStr, formattedDate]);

  const summaryCounts = useMemo(() => {
    const onTime = allRows.filter((r) => r.status === 'On-Time').length;
    const late = allRows.filter((r) => r.status === 'Late').length;
    const onLeave = allRows.filter((r) => r.status === 'On-Leave').length;
    const absent = allRows.filter((r) => r.status === 'Absent').length;

    return { onTime, late, onLeave, absent };
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
    <section className="dash-card overflow-hidden" data-purpose="employee-attendance-table">
      {/* Table Header & Summary KPIs */}
      <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Employee Attendance</h2>
          {/* Summary Count Pills */}
          <div className="flex flex-wrap items-center gap-2.5 mt-3">
            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'On-Time' ? 'all' : 'On-Time');
                setCurrentPage(1);
              }}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                statusFilter === 'On-Time'
                  ? 'bg-[#047857] text-white ring-2 ring-[#047857]/30'
                  : 'bg-[#d1fae5] text-[#047857] hover:bg-[#a7f3d0]'
              }`}
            >
              {summaryCounts.onTime} On-Time
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'Late' ? 'all' : 'Late');
                setCurrentPage(1);
              }}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                statusFilter === 'Late'
                  ? 'bg-[#b45309] text-white ring-2 ring-[#b45309]/30'
                  : 'bg-[#fef3c7] text-[#b45309] hover:bg-[#fde68a]'
              }`}
            >
              {summaryCounts.late} Late
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'On-Leave' ? 'all' : 'On-Leave');
                setCurrentPage(1);
              }}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                statusFilter === 'On-Leave'
                  ? 'bg-[#475569] text-white ring-2 ring-[#475569]/30'
                  : 'bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0]'
              }`}
            >
              {summaryCounts.onLeave} On Leave
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFilter(statusFilter === 'Absent' ? 'all' : 'Absent');
                setCurrentPage(1);
              }}
              className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer ${
                statusFilter === 'Absent'
                  ? 'bg-rose-700 text-white ring-2 ring-rose-700/30'
                  : 'bg-[#0f172a] text-white hover:bg-slate-800'
              }`}
            >
              {summaryCounts.absent} Absent
            </button>

            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('all');
                  setCurrentPage(1);
                }}
                className="text-xs text-blue-600 font-semibold hover:underline ml-1 cursor-pointer"
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
              placeholder="Search team..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-36 sm:w-48"
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <th className="py-3 px-5" scope="col">Name</th>
              <th className="py-3 px-5" scope="col">Job Title</th>
              <th className="py-3 px-5" scope="col">Date</th>
              <th className="py-3 px-5" scope="col">Check In</th>
              <th className="py-3 px-5" scope="col">Check Out</th>
              <th className="py-3 px-5" scope="col">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                  No employee attendance records found
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/90 transition-colors">
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        src={row.avatar}
                        name={row.name}
                        className="w-8 h-8 text-xs shrink-0"
                      />
                      <div>
                        <span className="font-bold text-[#0f172a] block">{row.name}</span>
                        <span className="text-[11px] text-slate-400">{row.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className="font-semibold text-slate-800 block">{row.designation}</span>
                    <span className="text-[11px] text-slate-400">{row.department}</span>
                  </td>
                  <td className="py-3.5 px-5 text-slate-600 font-medium">{row.date}</td>
                  <td className={`py-3.5 px-5 tabular-nums ${row.checkInColor || 'text-slate-800'} ${row.checkIn === '—' ? 'text-slate-400' : 'font-semibold'}`}>
                    {row.checkIn}
                  </td>
                  <td className={`py-3.5 px-5 tabular-nums text-slate-800 ${row.checkOut === '—' ? 'text-slate-400' : 'font-semibold'}`}>
                    {row.checkOut}
                  </td>
                  <td className="py-3.5 px-5">
                    {row.status === 'On-Time' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#d1fae5] text-[#047857]">
                        On-Time
                      </span>
                    )}
                    {row.status === 'Late' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fef3c7] text-[#b45309]">
                        Late
                      </span>
                    )}
                    {row.status === 'On-Leave' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#f1f5f9] text-[#475569]">
                        On-Leave
                      </span>
                    )}
                    {row.status === 'Absent' && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#0f172a] text-white">
                        Absent
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-5 py-3.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing <strong className="text-slate-800 font-semibold">{paginatedRows.length}</strong> of <strong className="text-slate-800 font-semibold">{totalMembersCount}</strong> team members
        </span>
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-50 font-medium cursor-pointer"
          >
            Previous
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
            const pageNum = i + 1;
            return (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                className={`px-3 py-1.5 rounded-lg border font-medium cursor-pointer ${
                  currentPage === pageNum
                    ? 'border-[#2563eb] bg-[#2563eb] text-white font-bold'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
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
            className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium cursor-pointer"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
};
