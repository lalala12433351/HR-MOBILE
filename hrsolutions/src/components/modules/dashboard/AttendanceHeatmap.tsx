'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';

type TimeRangeOption = 'this_month' | 'last_month' | 'this_week' | 'this_quarter';

const timeRangeLabels: Record<TimeRangeOption, string> = {
  this_month: 'This Month',
  last_month: 'Last Month',
  this_week: 'This Week',
  this_quarter: 'This Quarter',
};

export const AttendanceHeatmap: React.FC = () => {
  const { state } = useApp();
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('this_month');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dashboardState = useDashboardContext();

  const isDark = (state.customOptions?.featureToggles?.themeMode || 'light') === 'dark';

  const employees = dashboardState.employees || [];
  const attendance = dashboardState.attendance || [];

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Filter attendance records by selected time range and compute working days
  const { filteredAttendance, weekdayOccurrences, totalWorkingDays } = useMemo(() => {
    const now = new Date();
    const currentY = now.getFullYear();
    const currentM = now.getMonth();
    const today = now.getDate();

    // Helper: list all working days (Mon-Fri) between start and end dates
    const getWorkingDaysBetween = (start: Date, end: Date) => {
      const dates: string[] = [];
      const cur = new Date(start);
      while (cur <= end) {
        const day = cur.getDay();
        if (day >= 1 && day <= 5) {
          dates.push(cur.toISOString().split('T')[0]);
        }
        cur.setDate(cur.getDate() + 1);
      }
      return dates;
    };

    let startDate: Date;
    let endDate: Date;

    if (timeRange === 'this_month') {
      startDate = new Date(currentY, currentM, 1);
      endDate = new Date(currentY, currentM, today);
    } else if (timeRange === 'last_month') {
      startDate = new Date(currentY, currentM - 1, 1);
      endDate = new Date(currentY, currentM, 0);
    } else if (timeRange === 'this_week') {
      const day = now.getDay();
      const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 4);
      // Cap at today if within the week
      if (endDate > now) endDate = new Date(now);
    } else if (timeRange === 'this_quarter') {
      const qStartMonth = Math.floor(currentM / 3) * 3;
      startDate = new Date(currentY, qStartMonth, 1);
      endDate = new Date(now);
    } else {
      startDate = new Date(currentY, currentM, 1);
      endDate = new Date(now);
    }

    const workingDayStrs = getWorkingDaysBetween(startDate, endDate);
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const records = attendance.filter((a) => a.date && a.date >= startStr && a.date <= endStr);

    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    workingDayStrs.forEach((dStr) => {
      const dayNum = new Date(dStr + 'T00:00:00').getDay();
      if (dayNum >= 1 && dayNum <= 5) {
        counts[dayNum]++;
      }
    });

    return {
      filteredAttendance: records,
      weekdayOccurrences: counts,
      totalWorkingDays: Math.max(1, workingDayStrs.length),
    };
  }, [attendance, timeRange]);

  // Overall Attendance Rate: Total unique present logs / (Total Company Employees * Elapsed Working Days in period)
  const attendanceRate = useMemo(() => {
    const totalEmployees = employees.length;
    if (totalEmployees === 0 || totalWorkingDays === 0) return 0;

    // Count unique (employeeKey, date) present instances in the period
    const presentInstanceSet = new Set<string>();
    filteredAttendance.forEach((a) => {
      const s = String(a.status || '').toLowerCase();
      const isPresent = s === 'present' || s === 'late' || s.includes('home') || s === 'wfh';
      if (isPresent && a.date) {
        const empKey = a.employeeId || a.employeeName?.toLowerCase() || 'emp';
        presentInstanceSet.add(`${empKey}_${a.date}`);
      }
    });

    const totalExpectedAttendance = totalEmployees * totalWorkingDays;
    if (totalExpectedAttendance === 0) return 0;

    return Math.min(100, Math.round((presentInstanceSet.size / totalExpectedAttendance) * 100));
  }, [employees, filteredAttendance, totalWorkingDays]);

  // Group departments dynamically from live employee records
  const departmentRows = useMemo(() => {
    const deptEmployeesMap: Record<string, typeof employees> = {};
    employees.forEach((e) => {
      const d = e.department || 'Operations';
      if (!deptEmployeesMap[d]) deptEmployeesMap[d] = [];
      deptEmployeesMap[d].push(e);
    });

    const depts = Object.keys(deptEmployeesMap);
    if (depts.length === 0) {
      return [];
    }

    return depts.slice(0, 5).map((deptName) => {
      const emps = deptEmployeesMap[deptName];
      const totalInDept = emps.length;

      // Build employee identifier set for fast lookup
      const empIdentifierSet = new Set<string>();
      emps.forEach((e) => {
        if (e.id) empIdentifierSet.add(e.id);
        if (e.employeeId) empIdentifierSet.add(e.employeeId);
        if (e.name) empIdentifierSet.add(e.name.toLowerCase());
        if (e.fullName) empIdentifierSet.add(e.fullName.toLowerCase());
        if (e.email) empIdentifierSet.add(e.email.toLowerCase());
      });

      // Map weekday (1=Mon..5=Fri) -> Set of unique `empKey_date`
      const weekdayPunchesMap: Record<number, Set<string>> = {
        1: new Set(),
        2: new Set(),
        3: new Set(),
        4: new Set(),
        5: new Set(),
      };

      filteredAttendance.forEach((att) => {
        const isMatch =
          (att.employeeId && empIdentifierSet.has(att.employeeId)) ||
          (att.employeeName && empIdentifierSet.has(att.employeeName.toLowerCase()));

        if (isMatch && att.date) {
          const s = String(att.status || '').toLowerCase();
          const isPresent = s === 'present' || s === 'late' || s.includes('home') || s === 'wfh';
          if (isPresent) {
            const dayOfWeek = new Date(att.date + 'T00:00:00').getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              const empKey = att.employeeId || att.employeeName?.toLowerCase() || 'emp';
              weekdayPunchesMap[dayOfWeek].add(`${empKey}_${att.date}`);
            }
          }
        }
      });

      const getRate = (dayNum: number) => {
        if (totalInDept === 0) return 0;
        const occurrences = Math.max(1, weekdayOccurrences[dayNum] || 0);
        const expectedForWeekday = totalInDept * occurrences;
        if (expectedForWeekday === 0) return 0;

        const actualPresent = weekdayPunchesMap[dayNum].size;
        return Math.min(100, Math.round((actualPresent / expectedForWeekday) * 100));
      };

      return {
        name: deptName,
        mon: getRate(1),
        tue: getRate(2),
        wed: getRate(3),
        thu: getRate(4),
        fri: getRate(5),
      };
    });
  }, [employees, filteredAttendance, weekdayOccurrences]);

  const getCellBadgeClass = (score: number) => {
    if (score > 85) return 'bg-[#1e3a8a] text-white';
    if (score >= 61) return 'bg-[#38bdf8] text-[#0f172a]';
    if (score >= 25) return 'bg-[#e0f2fe] text-[#0284c7]';
    return 'bg-[#f1f5f9] text-slate-400';
  };

  return (
    <div className="dash-card p-5" data-purpose="attendance-heatmap">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">Attendance Overview</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-extrabold text-[var(--text-primary)]">{attendanceRate}%</span>
          </div>
        </div>

        {/* Interactive Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer active:scale-98"
          >
            <span>{timeRangeLabels[timeRange]}</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              {(Object.keys(timeRangeLabels) as TimeRangeOption[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setTimeRange(option);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition cursor-pointer ${
                    timeRange === option
                      ? 'bg-blue-50 text-blue-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{timeRangeLabels[option]}</span>
                  {timeRange === option && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Heatmap Department Matrix */}
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[420px]">
          {/* Header */}
          <div className="grid grid-cols-6 gap-2 text-center text-xs font-semibold text-slate-400 mb-2">
            <span className="text-left text-slate-500 font-bold pl-1">Department</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
          </div>

          {departmentRows.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No department records found
            </div>
          ) : (
            <div className="space-y-2">
              {departmentRows.map((row) => (
                <div key={row.name} className="grid grid-cols-6 gap-2 items-center text-xs">
                  <span className="text-slate-800 font-semibold truncate pr-1" title={row.name}>
                    {row.name}
                  </span>
                  <div
                    className={`h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${getCellBadgeClass(row.mon)}`}
                    title={`Mon: ${row.mon}%`}
                  >
                    {row.mon}%
                  </div>
                  <div
                    className={`h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${getCellBadgeClass(row.tue)}`}
                    title={`Tue: ${row.tue}%`}
                  >
                    {row.tue}%
                  </div>
                  <div
                    className={`h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${getCellBadgeClass(row.wed)}`}
                    title={`Wed: ${row.wed}%`}
                  >
                    {row.wed}%
                  </div>
                  <div
                    className={`h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${getCellBadgeClass(row.thu)}`}
                    title={`Thu: ${row.thu}%`}
                  >
                    {row.thu}%
                  </div>
                  <div
                    className={`h-7 rounded-md flex items-center justify-center text-[10px] font-bold ${getCellBadgeClass(row.fri)}`}
                    title={`Fri: ${row.fri}%`}
                  >
                    {row.fri}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Density Token Legend */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="font-medium text-slate-600">Density Scale:</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#f1f5f9] border border-slate-200"></span> &lt;25%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#e0f2fe]"></span> 25%–60%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#38bdf8]"></span> 61%–85%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-[#1e3a8a]"></span> &gt;85%
          </span>
        </div>
      </div>
    </div>
  );
};

