'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Calendar as CalendarIcon, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { generateInitialHolidays } from '@/data/holidayTemplates';

export const CalendarWidget: React.FC = () => {
  const { state } = useApp();
  const dashboardState = useDashboardContext();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [currentViewDate, setCurrentViewDate] = useState(() => new Date());
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const year = currentViewDate.getFullYear();
  const month = currentViewDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const monthShortNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const monthLabel = `${monthNames[month]} ${year}`;

  // Close picker on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowPicker(false);
      }
    };
    if (showPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPicker]);

  const handlePrevMonth = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setCurrentViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleSelectMonth = (mIdx: number) => {
    setCurrentViewDate(new Date(year, mIdx, 1));
    setShowPicker(false);
  };

  const handleYearChange = (delta: number) => {
    setCurrentViewDate(new Date(year + delta, month, 1));
  };

  const handleJumpToToday = () => {
    const now = new Date();
    setCurrentViewDate(now);
    setSelectedDate(now.toISOString().split('T')[0]);
    setShowPicker(false);
  };

  // Synchronized Attendance & Holiday Data from AppContext
  const holidaysMap = useMemo(() => {
    const holidays = state.customOptions?.holidays || generateInitialHolidays();
    const map = new Map<string, string[]>();
    holidays.forEach((h) => {
      if (h.isApproved !== false && h.date) {
        const existing = map.get(h.date) || [];
        existing.push(h.name);
        map.set(h.date, existing);
      }
    });
    return map;
  }, [state.customOptions?.holidays]);

  const attendanceMap = useMemo(() => {
    const map = new Map<string, { count: number; userCheckedIn: boolean }>();
    const attendanceData = dashboardState.attendance?.length ? dashboardState.attendance : (state.attendance || []);
    attendanceData.forEach((a) => {
      if (a.date) {
        const entry = map.get(a.date) || { count: 0, userCheckedIn: false };
        entry.count += 1;
        if (a.employeeId === state.currentPersona?.id || a.employeeName?.toLowerCase() === state.currentPersona?.name?.toLowerCase()) {
          entry.userCheckedIn = true;
        }
        map.set(a.date, entry);
      }
    });
    return map;
  }, [dashboardState.attendance, state.attendance, state.currentPersona]);

  const leavesMap = useMemo(() => {
    const map = new Map<string, Array<{ name: string; type: string }>>();
    const leavesData = dashboardState.leaves?.length ? dashboardState.leaves : (state.leaves || []);
    leavesData.forEach((l) => {
      if (l.status === 'Approved' && l.startDate) {
        const start = new Date(l.startDate + 'T00:00:00');
        const end = new Date((l.endDate || l.startDate) + 'T00:00:00');
        const curr = new Date(start);
        
        while (curr <= end) {
          const dateStr = curr.toISOString().split('T')[0];
          const list = map.get(dateStr) || [];
          list.push({ name: l.employeeName || 'Staff', type: l.leaveType || 'Leave' });
          map.set(dateStr, list);
          curr.setDate(curr.getDate() + 1);
        }
      }
    });
    return map;
  }, [dashboardState.leaves, state.leaves]);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Compute month calendar cells
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells: Array<{
      dayNum: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
      holidays: string[];
      hasAttendance: boolean;
      userCheckedIn: boolean;
      leaves: Array<{ name: string; type: string }>;
      targetMonthOffset: number; // -1 = prev, 0 = current, 1 = next
    }> = [];

    // Prev month bleed
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = month === 0 ? 11 : month - 1;
      const prevY = month === 0 ? year - 1 : year;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const att = attendanceMap.get(dateStr);
      cells.push({
        dayNum,
        dateStr,
        isCurrentMonth: false,
        isSelected: dateStr === selectedDate,
        isToday: dateStr === todayStr,
        holidays: holidaysMap.get(dateStr) || [],
        hasAttendance: !!att && att.count > 0,
        userCheckedIn: !!att?.userCheckedIn,
        leaves: leavesMap.get(dateStr) || [],
        targetMonthOffset: -1,
      });
    }

    // Current month days
    for (let dayNum = 1; dayNum <= daysInCurrentMonth; dayNum++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const att = attendanceMap.get(dateStr);
      cells.push({
        dayNum,
        dateStr,
        isCurrentMonth: true,
        isSelected: dateStr === selectedDate,
        isToday: dateStr === todayStr,
        holidays: holidaysMap.get(dateStr) || [],
        hasAttendance: !!att && att.count > 0,
        userCheckedIn: !!att?.userCheckedIn,
        leaves: leavesMap.get(dateStr) || [],
        targetMonthOffset: 0,
      });
    }

    // Next month bleed to fill only needed weeks (35 cells for 5 weeks or 42 for 6 weeks)
    const neededRows = Math.ceil((firstDayIndex + daysInCurrentMonth) / 7);
    const totalCells = neededRows * 7;
    const remaining = totalCells - cells.length;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const nextM = month === 11 ? 0 : month + 1;
      const nextY = month === 11 ? year + 1 : year;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const att = attendanceMap.get(dateStr);
      cells.push({
        dayNum,
        dateStr,
        isCurrentMonth: false,
        isSelected: dateStr === selectedDate,
        isToday: dateStr === todayStr,
        holidays: holidaysMap.get(dateStr) || [],
        hasAttendance: !!att && att.count > 0,
        userCheckedIn: !!att?.userCheckedIn,
        leaves: leavesMap.get(dateStr) || [],
        targetMonthOffset: 1,
      });
    }

    return cells;
  }, [year, month, selectedDate, todayStr, holidaysMap, attendanceMap, leavesMap]);

  const handleCellClick = (cell: (typeof calendarDays)[number]) => {
    setSelectedDate(cell.dateStr);
    if (cell.targetMonthOffset !== 0) {
      setCurrentViewDate(new Date(year, month + cell.targetMonthOffset, 1));
    }
  };

  // Selected date status summary
  const selectedHolidays = holidaysMap.get(selectedDate) || [];
  const selectedLeaves = leavesMap.get(selectedDate) || [];
  const selectedAttendance = attendanceMap.get(selectedDate);

  const hasSelectedEvents = selectedHolidays.length > 0 || selectedLeaves.length > 0 || !!selectedAttendance;

  return (
    <div className="dash-card p-3 sm:p-3.5 relative" data-purpose="calendar-widget">
      {/* Calendar Header */}
      <div className="flex items-center justify-between mb-2">
        {/* Interactive Month Picker Trigger */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className="flex items-center space-x-1 py-0.5 px-1 -ml-1 rounded-md hover:bg-slate-100 transition cursor-pointer group"
          >
            <h2 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--primary-blue)] transition-colors">
              {monthLabel}
            </h2>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-transform ${showPicker ? 'rotate-180 text-blue-600' : ''}`} />
          </button>

          {/* Quick Month & Year Picker Flyout */}
          {showPicker && (
            <div className="absolute left-0 top-full mt-1 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
                <button
                  type="button"
                  onClick={() => handleYearChange(-1)}
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer"
                  title="Previous Year"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-bold text-slate-800">{year}</span>
                <button
                  type="button"
                  onClick={() => handleYearChange(1)}
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-600 cursor-pointer"
                  title="Next Year"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1 mb-1.5">
                {monthShortNames.map((name, idx) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelectMonth(idx)}
                    className={`py-1 rounded-md text-[10px] font-semibold transition cursor-pointer ${
                      idx === month
                        ? 'bg-blue-600 text-white font-bold shadow-xs'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleJumpToToday}
                className="w-full py-1 text-center text-[10px] font-bold text-blue-600 hover:bg-blue-50 rounded-md border border-blue-100 transition cursor-pointer"
              >
                Jump to Today
              </button>
            </div>
          )}
        </div>

        {/* Navigation Arrows */}
        <div className="flex items-center space-x-0.5">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous Month"
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600 active:scale-95 transition cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next Month"
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-600 active:scale-95 transition cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Calendar Days Grid Headers */}
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-[#94a3b8] mb-0.5">
        <span>S</span>
        <span>M</span>
        <span>T</span>
        <span>W</span>
        <span>T</span>
        <span>F</span>
        <span>S</span>
      </div>

      {/* Calendar Days Cells */}
      <div className="grid grid-cols-7 gap-y-0.5 gap-x-0.5 text-center text-xs font-medium text-slate-700">
        {calendarDays.map((cell, idx) => {
          const hasHoliday = cell.holidays.length > 0;
          const hasLeave = cell.leaves.length > 0;
          const hasAtt = cell.hasAttendance;

          return (
            <div
              key={`${cell.dateStr}-${idx}`}
              onClick={() => handleCellClick(cell)}
              className="py-0.5 relative cursor-pointer select-none group flex flex-col items-center"
            >
              {cell.isSelected ? (
                <span className="w-6.5 h-6.5 mx-auto rounded-full bg-[#2563eb] text-white font-bold flex items-center justify-center shadow-xs text-[11px]">
                  {cell.dayNum}
                </span>
              ) : cell.isToday ? (
                <span className="w-6.5 h-6.5 mx-auto rounded-full bg-[#eff6ff] text-[#2563eb] border border-[#2563eb] font-bold flex items-center justify-center text-[11px]">
                  {cell.dayNum}
                </span>
              ) : (
                <span className={`block w-6.5 h-6.5 leading-6.5 mx-auto rounded-full text-[11px] transition-colors ${
                  !cell.isCurrentMonth
                    ? 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}>
                  {cell.dayNum}
                </span>
              )}

              {/* Compact Event Indicator Bars */}
              {!cell.isSelected && (hasHoliday || hasAtt || hasLeave) && (
                <div className="flex items-center justify-center gap-0.5 h-1 mt-0.5">
                  {hasHoliday && (
                    <span className="w-2.5 h-0.5 rounded-full bg-amber-400" title={`Holiday: ${cell.holidays.join(', ')}`} />
                  )}
                  {hasAtt && (
                    <span className="w-2.5 h-0.5 rounded-full bg-[#2563eb]" title="Attendance Logged" />
                  )}
                  {hasLeave && (
                    <span className="w-2.5 h-0.5 rounded-full bg-[#38bdf8]" title={`On Leave: ${cell.leaves.map(l => l.name).join(', ')}`} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Synchronized Status / Micro-Legend Footer */}
      {hasSelectedEvents ? (
        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
          <div className="truncate pr-2">
            {selectedHolidays.length > 0 ? (
              <span className="font-semibold text-amber-700">
                <span className="truncate">{selectedHolidays[0]}</span>
              </span>
            ) : selectedLeaves.length > 0 ? (
              <span className="font-semibold text-sky-700">
                <span className="truncate">{selectedLeaves[0].name} ({selectedLeaves[0].type})</span>
              </span>
            ) : (
              <span className="font-semibold text-blue-700">
                <span>{selectedAttendance?.count || 1} Attendance Check-in{(selectedAttendance?.count || 1) > 1 ? 's' : ''}</span>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              if (selectedHolidays.length > 0) {
                router.push('/attendance?tab=holidays');
              } else if (selectedLeaves.length > 0) {
                router.push('/attendance?tab=leaves');
              } else {
                router.push('/attendance');
              }
            }}
            className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:underline shrink-0 flex items-center gap-0.5 cursor-pointer"
          >
            Attendance <ExternalLink className="w-2.5 h-2.5" />
          </button>
        </div>
      ) : (
        <div className="mt-2 pt-1.5 border-t border-slate-100 flex items-center justify-center gap-2 text-[10px] text-slate-500 font-medium">
          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/60">In Office</span>
          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60">Holiday</span>
          <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200/60">Leave</span>
        </div>
      )}
    </div>
  );
}
