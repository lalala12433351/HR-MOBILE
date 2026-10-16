'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { generateInitialHolidays } from '@/data/holidayTemplates';

/* ─────────────────────────────────────────────
   CalendarWidget — redesigned with Linear/Notion
   SaaS-grade polish
   ───────────────────────────────────────────── */

export const CalendarWidget: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { state } = useApp();
  const dashboardState = useDashboardContext();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [currentViewDate, setCurrentViewDate] = useState(() => new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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

  /* ── Keyboard navigation ── */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const idx = focusedIdx ?? calendarDays.findIndex((c) => c.isSelected);
    if (idx === -1) return;
    let next = idx;
    switch (e.key) {
      case 'ArrowLeft':  next = Math.max(0, idx - 1); break;
      case 'ArrowRight': next = Math.min(calendarDays.length - 1, idx + 1); break;
      case 'ArrowUp':    next = Math.max(0, idx - 7); break;
      case 'ArrowDown':  next = Math.min(calendarDays.length - 1, idx + 7); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        handleCellClick(calendarDays[idx]);
        return;
      default: return;
    }
    e.preventDefault();
    setFocusedIdx(next);
  }, [focusedIdx, calendarDays]);

  // Build tooltip text for a cell
  const getTooltip = (cell: (typeof calendarDays)[number]) => {
    const parts: string[] = [];
    if (cell.holidays.length) parts.push(`Holiday: ${cell.holidays.join(', ')}`);
    if (cell.hasAttendance) parts.push('In Office');
    if (cell.leaves.length) parts.push(`Leave: ${cell.leaves.map(l => l.name).join(', ')}`);
    return parts.join(' · ');
  };

  // Selected date status summary
  const selectedHolidays = holidaysMap.get(selectedDate) || [];
  const selectedLeaves = leavesMap.get(selectedDate) || [];
  const selectedAttendance = attendanceMap.get(selectedDate);
  const hasSelectedEvents = selectedHolidays.length > 0 || selectedLeaves.length > 0 || !!selectedAttendance;

  return (
    <div className={`cal-w ${className}`.trim()} data-purpose="calendar-widget">
      {/* ─── Header ─── */}
      <div className="cal-w-header">
        {/* Month/Year picker trigger */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className="cal-w-month-btn"
          >
            <span className="cal-w-month-label">{monthLabel}</span>
            <ChevronDown className={`cal-w-chevron ${showPicker ? 'cal-w-chevron-open' : ''}`} />
          </button>

          {/* Quick Month & Year Picker Flyout */}
          {showPicker && (
            <div className="cal-w-picker-flyout">
              <div className="cal-w-picker-year-row">
                <button
                  type="button"
                  onClick={() => handleYearChange(-1)}
                  className="cal-w-icon-btn cal-w-icon-btn--sm"
                  title="Previous Year"
                >
                  <ChevronLeft className="cal-w-icon-14" />
                </button>
                <span className="cal-w-picker-year">{year}</span>
                <button
                  type="button"
                  onClick={() => handleYearChange(1)}
                  className="cal-w-icon-btn cal-w-icon-btn--sm"
                  title="Next Year"
                >
                  <ChevronRight className="cal-w-icon-14" />
                </button>
              </div>

              <div className="cal-w-picker-months">
                {monthShortNames.map((name, idx) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelectMonth(idx)}
                    className={`cal-w-picker-month ${idx === month ? 'cal-w-picker-month--active' : ''}`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleJumpToToday}
                className="cal-w-picker-today"
              >
                Jump to Today
              </button>
            </div>
          )}
        </div>

        {/* Navigation arrows — 32×32 icon buttons */}
        <div className="cal-w-nav-arrows">
          <button
            type="button"
            onClick={handlePrevMonth}
            aria-label="Previous Month"
            className="cal-w-icon-btn"
          >
            <ChevronLeft className="cal-w-icon-16" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            aria-label="Next Month"
            className="cal-w-icon-btn"
          >
            <ChevronRight className="cal-w-icon-16" />
          </button>
        </div>
      </div>

      {/* ─── Day-of-week headers ─── */}
      <div className="cal-w-dow-row">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
          <span key={d} className="cal-w-dow">{d}</span>
        ))}
      </div>

      {/* ─── Calendar grid ─── */}
      <div
        ref={gridRef}
        role="grid"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onBlur={() => setFocusedIdx(null)}
        className="cal-w-grid"
      >
        {calendarDays.map((cell, idx) => {
          const hasHoliday = cell.holidays.length > 0;
          const hasLeave = cell.leaves.length > 0;
          const hasAtt = cell.hasAttendance;
          const hasEvents = hasHoliday || hasAtt || hasLeave;
          const isFocused = focusedIdx === idx;
          const tooltip = getTooltip(cell);

          // Build class list for the circle
          let circleClass = 'cal-w-circle';
          if (cell.isSelected)        circleClass += ' cal-w-circle--selected';
          else if (cell.isToday)      circleClass += ' cal-w-circle--today';
          else if (!cell.isCurrentMonth) circleClass += ' cal-w-circle--outside';
          if (isFocused)              circleClass += ' cal-w-circle--focused';

          return (
            <div
              key={`${cell.dateStr}-${idx}`}
              role="gridcell"
              aria-label={`${cell.dayNum}, ${monthNames[month]} ${year}`}
              aria-selected={cell.isSelected}
              onClick={() => {
                handleCellClick(cell);
                setFocusedIdx(idx);
              }}
              className="cal-w-cell"
              title={tooltip || undefined}
            >
              <span className={circleClass}>{cell.dayNum}</span>

              {/* Status dots — up to 3 tiny colored dots below the date */}
              <span className="cal-w-dots">
                {hasAtt     && <span className="cal-w-dot cal-w-dot--att" />}
                {hasHoliday && <span className="cal-w-dot cal-w-dot--hol" />}
                {hasLeave   && <span className="cal-w-dot cal-w-dot--leave" />}
              </span>
            </div>
          );
        })}
      </div>

      {/* ─── Footer: Status summary or Legend ─── */}
      {hasSelectedEvents ? (
        <div className="cal-w-footer cal-w-footer--status">
          <div className="cal-w-footer-text">
            {selectedHolidays.length > 0 ? (
              <span className="cal-w-footer-label cal-w-footer-label--hol">
                {selectedHolidays[0]}
              </span>
            ) : selectedLeaves.length > 0 ? (
              <span className="cal-w-footer-label cal-w-footer-label--leave">
                {selectedLeaves[0].name} ({selectedLeaves[0].type})
              </span>
            ) : (
              <span className="cal-w-footer-label cal-w-footer-label--att">
                {selectedAttendance?.count || 1} Check-in{(selectedAttendance?.count || 1) > 1 ? 's' : ''}
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
            className="cal-w-footer-link"
          >
            Attendance <ExternalLink className="cal-w-icon-11" />
          </button>
        </div>
      ) : (
        /* Compact legend — dot + text */
        <div className="cal-w-footer cal-w-footer--legend">
          <div className="cal-w-legend-item">
            <span className="cal-w-legend-dot cal-w-dot--att" />
            <span className="cal-w-legend-label">In Office</span>
          </div>
          <div className="cal-w-legend-item">
            <span className="cal-w-legend-dot cal-w-dot--hol" />
            <span className="cal-w-legend-label">Holiday</span>
          </div>
          <div className="cal-w-legend-item">
            <span className="cal-w-legend-dot cal-w-dot--leave" />
            <span className="cal-w-legend-label">Leave</span>
          </div>
        </div>
      )}
    </div>
  );
}
