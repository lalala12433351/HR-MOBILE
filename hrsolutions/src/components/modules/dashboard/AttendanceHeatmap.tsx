'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';
import { useDashboardContext } from './DashboardDataContext';
import { DashPanel } from './DashPanel';
import { localDateKey } from '@/utils/dashboardPeople';

type TimeRangeOption = 'this_month' | 'last_month' | 'this_week' | 'this_quarter';

const timeRangeLabels: Record<TimeRangeOption, string> = {
  this_month: 'This Month',
  last_month: 'Last Month',
  this_week: 'This Week',
  this_quarter: 'This Quarter',
};

export const AttendanceHeatmap: React.FC<{ className?: string }> = ({ className = '' }) => {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRangeOption>('this_month');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dashboardState = useDashboardContext();

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
  const { filteredAttendance, totalWorkingDays, periodStart, periodEnd } = useMemo(() => {
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
          dates.push(localDateKey(cur));
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
    const startStr = localDateKey(startDate);
    const endStr = localDateKey(endDate);

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
      periodStart: startDate,
      periodEnd: endDate,
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

  const weekRows = useMemo(() => {
    const now = new Date();
    const monthStart = periodStart;
    const monthEnd = periodEnd;
    const todayKey = localDateKey(now);
    const total = Math.max(employees.length, 1);

    const presentByDate = new Map<string, Set<string>>();
    filteredAttendance.forEach((record) => {
      const status = String(record.status || '').toLowerCase();
      const present = status === 'present' || status === 'late' || status.includes('home') || status === 'wfh';
      if (!present || !record.date) return;
      const key = record.employeeId || record.employeeName?.toLowerCase() || 'emp';
      const set = presentByDate.get(record.date) || new Set<string>();
      set.add(key);
      presentByDate.set(record.date, set);
    });

    const cursor = new Date(monthStart);
    const mondayOffset = (cursor.getDay() + 6) % 7;
    cursor.setDate(cursor.getDate() - mondayOffset);

    const rows: Array<{ label: string; cells: Array<{ key: string; label: string; tone: 'high' | 'mid' | 'empty' }> }> = [];
    while (cursor <= monthEnd) {
      const weekStart = new Date(cursor);
      const cells = [];
      for (let day = 0; day < 5; day += 1) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + day);
        const key = localDateKey(date);
        const inMonth = date >= periodStart;
        const future = key > todayKey;
        if (!inMonth || future || date > monthEnd) {
          cells.push({ key, label: '—', tone: 'empty' as const });
          continue;
        }
        const count = presentByDate.get(key)?.size || 0;
        if (employees.length === 0 || count === 0) {
          cells.push({ key, label: '—', tone: 'empty' as const });
          continue;
        }
        const rate = Math.min(100, Math.round((count / total) * 1000) / 10);
        cells.push({
          key,
          label: `${rate}%`,
          tone: rate >= 75 ? 'high' as const : 'mid' as const,
        });
      }
      const labelDate = cells.find((cell) => cell.label !== '—');
      const labelSource = labelDate ? new Date(`${labelDate.key}T00:00:00`) : weekStart;
      rows.push({
        label: labelSource.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
        cells,
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return rows;
  }, [employees.length, filteredAttendance, periodStart, periodEnd]);

  const scheduledToday = useMemo(() => {
    const todayKey = localDateKey(new Date());
    const present = new Set<string>();
    attendance.forEach((record) => {
      if (record.date !== todayKey) return;
      const status = String(record.status || '').toLowerCase();
      const isPresent = status === 'present' || status === 'late' || status.includes('home') || status === 'wfh';
      if (!isPresent) return;
      present.add(record.employeeId || record.employeeName?.toLowerCase() || 'emp');
    });
    return { present: present.size, total: employees.length };
  }, [employees.length, attendance]);

  const rangeControl = (
    <div className="flex items-center gap-3">
      <span className="sr-only">Period attendance: {attendanceRate}%</span>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          aria-expanded={dropdownOpen}
          className="inline-flex h-10 items-center gap-1.5 px-2.5 text-xs font-medium rounded-[7px] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] cursor-pointer"
        >
          <span>{timeRangeLabels[timeRange]}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${dropdownOpen ? 'rotate-180 text-[var(--studio-navy)]' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--bg-surface)] rounded-[9px] border border-[var(--border-color)] py-1 z-50">
            {(Object.keys(timeRangeLabels) as TimeRangeOption[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setTimeRange(option);
                  setDropdownOpen(false);
                }}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between cursor-pointer ${
                  timeRange === option
                    ? 'bg-[var(--studio-selected)] text-[var(--studio-navy)] font-bold'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                }`}
              >
                <span>{timeRangeLabels[option]}</span>
                {timeRange === option && <Check className="w-3.5 h-3.5 text-[var(--studio-navy)]" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long' });

  return (
    <DashPanel
      title="Attendance heatmap"
      action={
        <button type="button" className="dash-quiet-link" onClick={() => router.push('/attendance')}>
          Attendance ›
        </button>
      }
      className={className}
      purpose="attendance-heatmap"
    >
      <div className="heat-meta">
        <span>{timeRange === 'last_month' ? periodStart.toLocaleDateString('en-GB', { month: 'long' }) : monthLabel}, Daily attendance (%)</span>
        <span className="heat-today">
          {scheduledToday.present} / {scheduledToday.total} in today
        </span>
      </div>
      <div className="heat-grid" aria-hidden>
        <span />
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => (
          <span key={day} className="heat-day">{day}</span>
        ))}
      </div>
      {weekRows.map((row) => (
        <div key={row.label + row.cells[0]?.key} className="heat-grid">
          <span className="heat-label">{row.label}</span>
          {row.cells.map((cell, index) => (
            <span key={cell.key + index} className={`heat-cell heat-cell--${cell.tone}`} title={`${cell.key}: ${cell.label === '-' ? 'No data' : cell.label + ' attendance'}`}>
              {cell.label}
            </span>
          ))}
        </div>
      ))}
      <div className="heat-legend">
        <span>Attendance</span>
        <span><i className="heat-cell--mid" />0–74%</span>
        <span><i className="heat-cell--high" />75–100%</span>
        <span><i className="heat-cell--empty" />No data</span>
      </div>
      <div className="heat-footer"><span>Checked in ÷ people. Weekdays only.</span>{rangeControl}</div>
    </DashPanel>
  );
};

