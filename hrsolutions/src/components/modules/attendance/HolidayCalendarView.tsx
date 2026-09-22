'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Check,
  X,
  Calendar as CalendarIcon,
  List,
  CheckSquare,
  Square,
  Layers,
  CheckCircle2,
  Clock,
  Trash2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { Holiday, HolidayTemplate } from '@/types';
import { holidayTemplates, generateInitialHolidays } from '@/data/holidayTemplates';
import { useApp } from '@/context/AppContext';
import { ATT_CARD } from './attendanceUi';

interface HolidayCalendarViewProps {
  holidays?: Holiday[];
  onUpdateHolidays?: (holidays: Holiday[]) => void;
  isHR?: boolean;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Helper to get month badge & calendar event color theme (4-month cycling: Blue, Amber, Pink, Indigo)
const getHolidayTheme = (monthIndex: number) => {
  switch (monthIndex % 4) {
    case 0:
      return {
        pill: 'bg-blue-600 text-white',
        dot: 'bg-blue-600',
        chipApproved: 'bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200/80',
        chipPending: 'bg-blue-50/50 hover:bg-blue-100 text-blue-900 border-blue-300 border-dashed',
        badgeBg: 'bg-blue-600',
      };
    case 1:
      return {
        pill: 'bg-amber-500 text-white',
        dot: 'bg-amber-500',
        chipApproved: 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200/80',
        chipPending: 'bg-amber-50/50 hover:bg-amber-100 text-amber-900 border-amber-300 border-dashed',
        badgeBg: 'bg-amber-500',
      };
    case 2:
      return {
        pill: 'bg-pink-500 text-white',
        dot: 'bg-pink-500',
        chipApproved: 'bg-pink-50 hover:bg-pink-100 text-pink-800 border-pink-200/80',
        chipPending: 'bg-pink-50/50 hover:bg-pink-100 text-pink-900 border-pink-300 border-dashed',
        badgeBg: 'bg-pink-500',
      };
    default:
      return {
        pill: 'bg-indigo-600 text-white',
        dot: 'bg-indigo-600',
        chipApproved: 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200/80',
        chipPending: 'bg-indigo-50/50 hover:bg-indigo-100 text-indigo-900 border-indigo-300 border-dashed',
        badgeBg: 'bg-indigo-600',
      };
  }
};

export const HolidayCalendarView: React.FC<HolidayCalendarViewProps> = ({
  holidays: propHolidays,
  onUpdateHolidays,
  isHR = false,
}) => {
  let triggerToast: ((toast: any) => void) | undefined;
  try {
    const appContext = useApp();
    triggerToast = appContext.triggerToast;
  } catch (_) {}

  const [activeYear, setActiveYear] = useState<number>(() => {
    const y = new Date().getFullYear();
    return y >= 2024 && y <= 2028 ? y : 2026;
  });
  const [activeMonth, setActiveMonth] = useState<number>(() => {
    return new Date().getMonth();
  });
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [approvalFilter, setApprovalFilter] = useState<'all' | 'approved' | 'pending'>('all');
  const [selectedHolidayIds, setSelectedHolidayIds] = useState<string[]>([]);
  const [activeHolidayDetail, setActiveHolidayDetail] = useState<Holiday | null>(null);
  const [highlightedHolidayId, setHighlightedHolidayId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  // Active Holiday List State (with fallback)
  const [internalHolidays, setInternalHolidays] = useState<Holiday[]>(() => {
    return propHolidays && propHolidays.length > 0 ? propHolidays : generateInitialHolidays();
  });

  useEffect(() => {
    if (propHolidays && propHolidays.length > 0) {
      setInternalHolidays(propHolidays);
    }
  }, [propHolidays]);

  const allHolidays = propHolidays && propHolidays.length > 0 ? propHolidays : internalHolidays;

  const saveHolidays = (updated: Holiday[]) => {
    setInternalHolidays(updated);
    if (onUpdateHolidays) {
      onUpdateHolidays(updated);
    }
  };

  // Dynamic available years list
  const availableYears = useMemo(() => {
    const years = new Set<number>([2025, 2026, 2027]);
    years.add(new Date().getFullYear());
    years.add(activeYear);
    allHolidays.forEach((h) => {
      const y = h.year ? Number(h.year) : parseInt(h.date?.split('-')[0], 10);
      if (y && !isNaN(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [allHolidays, activeYear]);

  // Filtered by selected year and sorted chronologically
  const yearHolidays = useMemo(() => {
    return allHolidays
      .filter((h) => {
        const y = h.year ? Number(h.year) : parseInt(h.date?.split('-')[0], 10);
        return y === activeYear;
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [allHolidays, activeYear]);

  // Approved & Pending counts for active year
  const approvedHolidays = useMemo(() => {
    return yearHolidays.filter((h) => h.isApproved !== false);
  }, [yearHolidays]);

  const pendingHolidays = useMemo(() => {
    return yearHolidays.filter((h) => h.isApproved === false);
  }, [yearHolidays]);

  // Displayed holidays based on active approval filter
  const displayedHolidays = useMemo(() => {
    if (approvalFilter === 'approved') return approvedHolidays;
    if (approvalFilter === 'pending') return pendingHolidays;
    return yearHolidays;
  }, [approvalFilter, approvedHolidays, pendingHolidays, yearHolidays]);

  // Mobile selected date in calendar
  const [selectedMobileDate, setSelectedMobileDate] = useState<string | null>(null);

  // Active month holidays (for mobile agenda view)
  const activeMonthHolidays = useMemo(() => {
    return yearHolidays.filter((h) => {
      const d = new Date(h.date + 'T00:00:00');
      if (d.getMonth() !== activeMonth) return false;
      if (approvalFilter === 'approved') return h.isApproved !== false;
      if (approvalFilter === 'pending') return h.isApproved === false;
      return true;
    });
  }, [yearHolidays, activeMonth, approvalFilter]);

  // Mobile agenda holidays (filtered by selected date or all in active month)
  const mobileAgendaHolidays = useMemo(() => {
    if (selectedMobileDate) {
      return yearHolidays.filter((h) => {
        if (h.date !== selectedMobileDate) return false;
        if (approvalFilter === 'approved') return h.isApproved !== false;
        if (approvalFilter === 'pending') return h.isApproved === false;
        return true;
      });
    }
    return activeMonthHolidays;
  }, [selectedMobileDate, yearHolidays, activeMonthHolidays, approvalFilter]);

  // Modals state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>(['indian_national_festivals']);
  const [templateMergeMode, setTemplateMergeMode] = useState<'merge' | 'replace'>('merge');
  const [templateImportApproval, setTemplateImportApproval] = useState<'approved' | 'pending'>('approved');

  const [showAddModal, setShowAddModal] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayIsApproved, setNewHolidayIsApproved] = useState<boolean>(true);

  // Multi-Template Apply Handler
  const handleApplySelectedTemplates = () => {
    if (selectedTemplateIds.length === 0) return;

    // Collect holidays from all selected templates
    const rawItems: { name: string; date: string; dayOfWeek: string; templateName: string }[] = [];
    selectedTemplateIds.forEach((tplId) => {
      const tpl = holidayTemplates.find((t) => t.id === tplId);
      if (!tpl) return;
      const yearItems = tpl.holidaysByYear[activeYear] || [];
      yearItems.forEach((h) => {
        rawItems.push({ ...h, templateName: tpl.name });
      });
    });

    // Deduplicate items that fall on the exact same date
    const mergedMap = new Map<string, { name: string; date: string; dayOfWeek: string; templateName: string }>();
    rawItems.forEach((item) => {
      if (mergedMap.has(item.date)) {
        const existing = mergedMap.get(item.date)!;
        if (!existing.name.toLowerCase().includes(item.name.toLowerCase())) {
          existing.name = `${existing.name} / ${item.name}`;
        }
      } else {
        mergedMap.set(item.date, { ...item });
      }
    });

    const isApprovedOnImport = templateImportApproval === 'approved';

    const newHolidays: Holiday[] = Array.from(mergedMap.values()).map((item, idx) => ({
      id: `hol_${activeYear}_${Date.now()}_${idx}`,
      name: item.name,
      date: item.date,
      year: activeYear,
      dayOfWeek: item.dayOfWeek,
      isApproved: isApprovedOnImport,
    }));

    if (templateMergeMode === 'replace') {
      const otherYears = allHolidays.filter((h) => h.year !== activeYear);
      saveHolidays([...otherYears, ...newHolidays]);
    } else {
      // Merge with existing holidays for active year (deduplicate against existing)
      const existingDateMap = new Set(yearHolidays.map((h) => h.date));
      const nonDuplicateNew = newHolidays.filter((h) => !existingDateMap.has(h.date));
      saveHolidays([...allHolidays, ...nonDuplicateNew]);
    }

    setShowTemplateModal(false);
  };

  // Toggle Single Holiday Approval
  const handleToggleApproval = (holidayId: string) => {
    const updated = allHolidays.map((h) => {
      if (h.id === holidayId) {
        return { ...h, isApproved: !h.isApproved };
      }
      return h;
    });
    saveHolidays(updated);
    if (activeHolidayDetail?.id === holidayId) {
      setActiveHolidayDetail((prev) => (prev ? { ...prev, isApproved: !prev.isApproved } : null));
    }
  };

  // Approve a single holiday
  const handleApproveHoliday = (holidayId: string) => {
    const updated = allHolidays.map((h) => (h.id === holidayId ? { ...h, isApproved: true } : h));
    saveHolidays(updated);
    if (activeHolidayDetail?.id === holidayId) {
      setActiveHolidayDetail((prev) => (prev ? { ...prev, isApproved: true } : null));
    }
  };

  // Reject / Disable a single holiday
  const handleRejectHoliday = (holidayId: string) => {
    const updated = allHolidays.map((h) => (h.id === holidayId ? { ...h, isApproved: false } : h));
    saveHolidays(updated);
    if (activeHolidayDetail?.id === holidayId) {
      setActiveHolidayDetail((prev) => (prev ? { ...prev, isApproved: false } : null));
    }
  };

  // Delete a holiday
  const handleDeleteHoliday = (holidayId: string) => {
    const updated = allHolidays.filter((h) => h.id !== holidayId);
    saveHolidays(updated);
    setSelectedHolidayIds((prev) => prev.filter((id) => id !== holidayId));
    if (activeHolidayDetail?.id === holidayId) {
      setActiveHolidayDetail(null);
    }
  };

  // Bulk Approve Selected
  const handleApproveSelected = () => {
    const updated = allHolidays.map((h) => {
      if (selectedHolidayIds.includes(h.id)) {
        return { ...h, isApproved: true };
      }
      return h;
    });
    saveHolidays(updated);
    setSelectedHolidayIds([]);
  };

  // Bulk Reject Selected
  const handleRejectSelected = () => {
    const updated = allHolidays.map((h) => {
      if (selectedHolidayIds.includes(h.id)) {
        return { ...h, isApproved: false };
      }
      return h;
    });
    saveHolidays(updated);
    setSelectedHolidayIds([]);
  };

  // Bulk Delete Selected
  const handleDeleteSelected = () => {
    const updated = allHolidays.filter((h) => !selectedHolidayIds.includes(h.id));
    saveHolidays(updated);
    setSelectedHolidayIds([]);
  };

  // Approve All Pending in Active Year
  const handleApproveAllPending = () => {
    const updated = allHolidays.map((h) => {
      if (h.year === activeYear) {
        return { ...h, isApproved: true };
      }
      return h;
    });
    saveHolidays(updated);
  };

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedHolidayIds.length === displayedHolidays.length) {
      setSelectedHolidayIds([]);
    } else {
      setSelectedHolidayIds(displayedHolidays.map((h) => h.id));
    }
  };

  const toggleSelectHoliday = (id: string) => {
    setSelectedHolidayIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Add Custom Holiday
  const handleAddCustomHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayName.trim() || !newHolidayDate) return;

    const parts = newHolidayDate.trim().split('-');
    if (parts.length < 3) return;

    const yr = parseInt(parts[0], 10);
    const mIdx = parseInt(parts[1], 10) - 1;
    const dayNum = parseInt(parts[2], 10);
    const dateObj = new Date(yr, mIdx, dayNum);
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const normalizedDate = `${yr}-${String(mIdx + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;

    const newH: Holiday = {
      id: `hol_custom_${Date.now()}`,
      name: newHolidayName.trim(),
      date: normalizedDate,
      year: yr,
      dayOfWeek,
      isApproved: newHolidayIsApproved,
    };

    saveHolidays([...allHolidays, newH]);

    // 1. Instantly transition view to the holiday's year and month
    setActiveYear(yr);
    setActiveMonth(mIdx);

    // 2. Adjust filter so it's not hidden
    if (newHolidayIsApproved && approvalFilter === 'pending') {
      setApprovalFilter('all');
    } else if (!newHolidayIsApproved && approvalFilter === 'approved') {
      setApprovalFilter('all');
    }

    // 3. Highlight the date & holiday
    setSelectedMobileDate(normalizedDate);
    setHighlightedHolidayId(newH.id);
    setTimeout(() => {
      setHighlightedHolidayId((prev) => (prev === newH.id ? null : prev));
    }, 4000);

    // 4. In-component feedback message
    setFeedbackBanner({
      message: `Holiday "${newH.name}" added successfully for ${MONTH_NAMES[mIdx]} ${dayNum}, ${yr}.`,
      type: 'success',
    });
    setTimeout(() => setFeedbackBanner(null), 5000);

    // 5. Global toast if available
    if (triggerToast) {
      triggerToast({
        title: 'Holiday Added',
        message: `"${newH.name}" scheduled on ${MONTH_NAMES[mIdx]} ${dayNum}, ${yr} (${newHolidayIsApproved ? 'Approved' : 'Pending'}).`,
        type: 'attendance',
      });
    }

    // 6. Reset form
    setNewHolidayName('');
    setNewHolidayDate('');
    setShowAddModal(false);
  };

  // Google Calendar Grid Generator
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(activeYear, activeMonth, 1).getDay();
    const daysInMonth = new Date(activeYear, activeMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(activeYear, activeMonth, 0).getDate();

    const cells: {
      dateNumber: number;
      dateStr: string;
      isCurrentMonth: boolean;
      holidays: Holiday[];
      isToday: boolean;
    }[] = [];

    const todayStr = new Date().toISOString().split('T')[0];

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = activeMonth === 0 ? 11 : activeMonth - 1;
      const prevY = activeMonth === 0 ? activeYear - 1 : activeYear;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const paddingMatching = allHolidays.filter((h) => {
        if (h.date !== dateStr) return false;
        if (approvalFilter === 'approved') return h.isApproved !== false;
        if (approvalFilter === 'pending') return h.isApproved === false;
        return true;
      });
      cells.push({
        dateNumber: d,
        dateStr,
        isCurrentMonth: false,
        holidays: paddingMatching,
        isToday: dateStr === todayStr,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${activeYear}-${String(activeMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const matchingHolidays = yearHolidays.filter((h) => {
        if (h.date !== dateStr) return false;
        if (approvalFilter === 'approved') return h.isApproved !== false;
        if (approvalFilter === 'pending') return h.isApproved === false;
        return true;
      });

      cells.push({
        dateNumber: d,
        dateStr,
        isCurrentMonth: true,
        holidays: matchingHolidays,
        isToday: dateStr === todayStr,
      });
    }

    // Next month padding to fill 35 or 42 grid cells
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextM = activeMonth === 11 ? 0 : activeMonth + 1;
      const nextY = activeMonth === 11 ? activeYear + 1 : activeYear;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const nextPaddingMatching = allHolidays.filter((h) => {
        if (h.date !== dateStr) return false;
        if (approvalFilter === 'approved') return h.isApproved !== false;
        if (approvalFilter === 'pending') return h.isApproved === false;
        return true;
      });
      cells.push({
        dateNumber: i,
        dateStr,
        isCurrentMonth: false,
        holidays: nextPaddingMatching,
        isToday: dateStr === todayStr,
      });
    }

    return cells;
  }, [activeYear, activeMonth, yearHolidays, allHolidays, approvalFilter]);

  const handlePrevMonth = () => {
    if (activeMonth === 0) {
      setActiveMonth(11);
      setActiveYear((y) => y - 1);
    } else {
      setActiveMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (activeMonth === 11) {
      setActiveMonth(0);
      setActiveYear((y) => y + 1);
    } else {
      setActiveMonth((m) => m + 1);
    }
  };

  const handleGoToday = () => {
    const today = new Date();
    setActiveYear(today.getFullYear());
    setActiveMonth(today.getMonth());
    setSelectedMobileDate(today.toISOString().split('T')[0]);
  };

  // Preview unique count for multi-templates
  const previewMultiTemplateCount = useMemo(() => {
    const dateSet = new Set<string>();
    selectedTemplateIds.forEach((tplId) => {
      const tpl = holidayTemplates.find((t) => t.id === tplId);
      if (!tpl) return;
      (tpl.holidaysByYear[activeYear] || []).forEach((h) => dateSet.add(h.date));
    });
    return dateSet.size;
  }, [selectedTemplateIds, activeYear]);

  return (
    <div className="space-y-4 w-full">
      {/* Top Feedback Banner */}
      {feedbackBanner && (
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200 ${
          feedbackBanner.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-blue-50 text-blue-800 border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-bold text-slate-900">
            Holidays in {activeYear}
          </h2>
          <span className="text-xs text-slate-400 font-medium">
            · {yearHolidays.length} total ({approvedHolidays.length} approved{pendingHolidays.length > 0 ? `, ${pendingHolidays.length} pending` : ''})
          </span>
        </div>

        {/* Scrollable Action Strip on Mobile */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          {/* Dynamic Year Switcher */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shrink-0">
            {availableYears.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => {
                  setActiveYear(yr);
                  setSelectedHolidayIds([]);
                  setSelectedMobileDate(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  activeYear === yr
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>List</span>
            </button>
          </div>

          {/* HR Management Actions */}
          {isHR && (
            <>
              {/* Multi-Template Button */}
              <button
                type="button"
                onClick={() => setShowTemplateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors cursor-pointer shrink-0"
              >
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span>Templates</span>
              </button>

              {/* Add Custom Holiday */}
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-all cursor-pointer shadow-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filter Strip: Approval Status Filter + Bulk Actions */}
      <div className={`${ATT_CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3`}>
        {/* Left: Approval Filter Pills (Horizontally scrollable on mobile) */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/90 border border-slate-200/60 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setApprovalFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              approvalFilter === 'all'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
            style={approvalFilter === 'all' ? { color: '#ffffff' } : undefined}
          >
            All ({yearHolidays.length})
          </button>
          <button
            type="button"
            onClick={() => setApprovalFilter('approved')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              approvalFilter === 'approved'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
            style={approvalFilter === 'approved' ? { color: '#ffffff' } : undefined}
          >
            Approved ({approvedHolidays.length})
          </button>
          <button
            type="button"
            onClick={() => setApprovalFilter('pending')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              approvalFilter === 'pending'
                ? 'bg-blue-600 text-white font-bold shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
            style={approvalFilter === 'pending' ? { color: '#ffffff' } : undefined}
          >
            Pending ({pendingHolidays.length})
          </button>
        </div>

        {/* Right: Bulk Approval Actions (if HR and items selected) */}
        {isHR && selectedHolidayIds.length > 0 ? (
          <div className="flex items-center gap-2 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-100 overflow-x-auto no-scrollbar">
            <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
              {selectedHolidayIds.length} selected:
            </span>
            <button
              type="button"
              onClick={handleApproveSelected}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer shadow-xs whitespace-nowrap"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={handleRejectSelected}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Disable
            </button>
            <button
              type="button"
              onClick={handleDeleteSelected}
              className="px-2 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Delete
            </button>
          </div>
        ) : isHR && pendingHolidays.length > 0 ? (
          /* One-click Approve All Pending Banner */
          <div className="flex items-center justify-between sm:justify-end gap-2 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <span className="text-xs text-amber-700 font-medium flex items-center gap-1.5 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              {pendingHolidays.length} pending
            </span>
            <button
              type="button"
              onClick={handleApproveAllPending}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer shadow-xs whitespace-nowrap"
            >
              Approve All Pending ({pendingHolidays.length})
            </button>
          </div>
        ) : null}
      </div>

      {/* ─── GOOGLE CALENDAR MONTHLY VIEW ─── */}
      {viewMode === 'calendar' && (
        <div className={`${ATT_CARD} overflow-hidden`}>
          {/* Calendar Month Navigation Header */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200/80 bg-slate-50/70">
            <div className="flex items-center gap-2 sm:gap-3">
              <h3 className="text-sm font-bold text-slate-900">
                {MONTH_NAMES[activeMonth]} {activeYear}
              </h3>
              <button
                type="button"
                onClick={handleGoToday}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                Today
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white cursor-pointer shadow-2xs"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-white cursor-pointer shadow-2xs"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Column Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/90 text-center text-[11px] sm:text-xs font-semibold text-slate-500">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-2">
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day[0]}</span>
              </div>
            ))}
          </div>

          {/* DESKTOP: 7-Column Full Grid Cells (Visible on md+) */}
          <div className="hidden md:grid grid-cols-7 divide-x divide-y divide-slate-200 border-b border-slate-200">
            {calendarCells.map((cell, idx) => (
              <div
                key={idx}
                className={`min-h-[105px] p-1.5 transition-colors ${
                  cell.isCurrentMonth
                    ? 'bg-white'
                    : 'bg-slate-50/40 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-semibold ${
                      cell.isToday
                        ? 'w-6 h-6 rounded-full bg-blue-600 text-white font-bold'
                        : cell.isCurrentMonth
                        ? 'text-slate-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {cell.dateNumber}
                  </span>
                </div>

                {/* Holiday Event Chips */}
                <div className="mt-1 space-y-1">
                  {cell.holidays.map((h) => {
                    const isApproved = h.isApproved !== false;
                    const dateObj = new Date(h.date + 'T00:00:00');
                    const mIdx = dateObj.getMonth();
                    const theme = getHolidayTheme(mIdx);

                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setActiveHolidayDetail(h)}
                        className={`w-full text-left px-2 py-1 rounded text-[11px] font-semibold truncate transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                          isApproved ? theme.chipApproved : theme.chipPending
                        } ${highlightedHolidayId === h.id ? 'ring-2 ring-blue-500 scale-[1.02] shadow-xs' : ''}`}
                        title={`${h.name} (${isApproved ? 'Approved' : 'Pending Approval'}) - Click to manage`}
                      >
                        <span className="truncate">{h.name}</span>
                        {!isApproved && <span className="ml-auto text-[9px] font-bold opacity-75">Pending</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* MOBILE: Compact Grid with Agenda Cards (Visible on mobile/tablet < md) */}
          <div className="block md:hidden">
            {/* Compact 7-Column Date Picker Grid */}
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 border-b border-slate-200 bg-white">
              {calendarCells.map((cell, idx) => {
                const isSelected = selectedMobileDate === cell.dateStr;
                const hasHolidays = cell.holidays.length > 0;
                const hasPending = cell.holidays.some((h) => h.isApproved === false);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (!cell.isCurrentMonth) {
                        const clickedDate = new Date(cell.dateStr + 'T00:00:00');
                        setActiveMonth(clickedDate.getMonth());
                        setActiveYear(clickedDate.getFullYear());
                      }
                      setSelectedMobileDate((prev) => (prev === cell.dateStr ? null : cell.dateStr));
                    }}
                    className={`h-11 sm:h-12 p-0.5 sm:p-1 flex flex-col items-center justify-between transition-colors cursor-pointer relative ${
                      isSelected
                        ? 'bg-blue-50 ring-2 ring-blue-600 ring-inset z-10'
                        : cell.isCurrentMonth
                        ? 'bg-white hover:bg-slate-50'
                        : 'bg-slate-50/50 text-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center text-xs font-semibold ${
                        cell.isToday
                          ? 'w-6 h-6 rounded-full bg-blue-600 text-white font-bold'
                          : cell.isCurrentMonth
                          ? isSelected
                            ? 'text-blue-900 font-bold'
                            : 'text-slate-800'
                          : 'text-slate-400'
                      }`}
                    >
                      {cell.dateNumber}
                    </span>

                    {/* Indicator Pill for Holidays (no dots) */}
                    <div className="h-2 flex items-center justify-center gap-0.5">
                      {hasHolidays && (
                        <span className={`w-3.5 h-1 rounded-full ${hasPending ? 'bg-amber-400' : 'bg-blue-600'}`} />
                      )}
                      {cell.holidays.length > 1 && (
                        <span className="text-[9px] font-bold text-slate-500 leading-none">
                          +{cell.holidays.length - 1}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mobile Agenda / Holiday List for Active Month or Selected Date */}
            <div className="p-3 sm:p-4 bg-slate-50/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  {selectedMobileDate
                    ? `Holidays on ${selectedMobileDate}`
                    : `${MONTH_NAMES[activeMonth]} Holidays (${activeMonthHolidays.length})`}
                </span>
                {selectedMobileDate && (
                  <button
                    type="button"
                    onClick={() => setSelectedMobileDate(null)}
                    className="text-[11px] text-blue-600 font-semibold hover:underline cursor-pointer"
                  >
                    Show Entire Month
                  </button>
                )}
              </div>

              {mobileAgendaHolidays.length === 0 ? (
                <div className="p-4 rounded-xl bg-white border border-slate-200 text-center text-xs text-slate-400">
                  {selectedMobileDate
                    ? 'No holidays scheduled on this date.'
                    : `No holidays found for ${MONTH_NAMES[activeMonth]} ${activeYear}.`}
                </div>
              ) : (
                mobileAgendaHolidays.map((holiday) => {
                  const isApproved = holiday.isApproved !== false;
                  const dateObj = new Date(holiday.date + 'T00:00:00');
                  const dayNum = dateObj.getDate();
                  const monthShort = SHORT_MONTHS[dateObj.getMonth()] || 'JAN';
                  const theme = getHolidayTheme(dateObj.getMonth());

                  return (
                    <div
                      key={holiday.id}
                      onClick={() => setActiveHolidayDetail(holiday)}
                      className="p-3 rounded-xl border border-slate-200 bg-white hover:border-blue-400 transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Month/Day Badge */}
                        <div className="flex flex-col items-center w-10 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                          <span className={`w-full py-0.5 text-center text-[9px] font-extrabold tracking-wider ${theme.badgeBg} text-white`}>
                            {monthShort}
                          </span>
                          <span className="w-full py-1 text-center text-xs font-bold bg-white text-slate-900">
                            {dayNum}
                          </span>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="font-bold text-xs text-slate-900 truncate">
                            {holiday.name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span>{holiday.dayOfWeek}</span>
                            <span>•</span>
                            {isApproved ? (
                              <span className="text-emerald-700 font-medium">Approved</span>
                            ) : (
                              <span className="text-amber-700 font-bold">Pending</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isHR && (
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {!isApproved ? (
                            <button
                              type="button"
                              onClick={() => handleApproveHoliday(holiday.id)}
                              className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-semibold cursor-pointer shadow-2xs"
                            >
                              Approve
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRejectHoliday(holiday.id)}
                              className="px-2 py-1 border border-slate-200 text-slate-600 rounded-lg text-[11px] font-semibold cursor-pointer"
                            >
                              Disable
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── LIST VIEW WITH DIRECT APPROVAL ACTIONS ─── */}
      {viewMode === 'list' && (
        <div className={`${ATT_CARD} overflow-hidden`}>
          {displayedHolidays.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">
              No holidays found matching {approvalFilter !== 'all' ? `"${approvalFilter}"` : `year ${activeYear}`}.
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW (Visible on md+) */}
              <div className="hidden md:block overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold text-[11px]">
                      {isHR && (
                        <th className="py-3 px-3.5 w-10">
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="text-slate-400 hover:text-slate-600 flex items-center cursor-pointer"
                          >
                            {selectedHolidayIds.length > 0 && selectedHolidayIds.length === displayedHolidays.length ? (
                              <CheckSquare className="h-4 w-4 text-slate-900" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </th>
                      )}
                      <th className="py-3 px-3.5 font-bold text-slate-900">Date</th>
                      <th className="py-3 px-3.5 font-bold text-slate-900">Holiday Name</th>
                      <th className="py-3 px-3.5">Day of Week</th>
                      <th className="py-3 px-3.5">Status</th>
                      {isHR && <th className="py-3 px-3.5 text-right">Approval Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {displayedHolidays.map((holiday) => {
                      const isSelected = selectedHolidayIds.includes(holiday.id);
                      const isApproved = holiday.isApproved !== false;

                      const dateObj = new Date(holiday.date + 'T00:00:00');
                      const monthIdx = dateObj.getMonth();
                      const dayNum = dateObj.getDate();
                      const monthShort = SHORT_MONTHS[monthIdx] || 'JAN';

                      return (
                        <tr
                          key={holiday.id}
                          className={`hover:bg-slate-50/75 transition-colors ${isSelected ? 'bg-slate-50' : ''}`}
                        >
                          {isHR && (
                            <td className="py-2.5 px-3.5">
                              <button
                                type="button"
                                onClick={() => toggleSelectHoliday(holiday.id)}
                                className="text-slate-400 hover:text-slate-600 flex items-center cursor-pointer"
                              >
                                {isSelected ? (
                                  <CheckSquare className="h-4 w-4 text-slate-900" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                          )}

                          {/* Date Cell */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <span className={`w-10 text-center py-0.5 rounded text-[10px] font-bold ${getHolidayTheme(dateObj.getMonth()).badgeBg} text-white`}>
                                {monthShort} {dayNum}
                              </span>
                              <span>{holiday.date}</span>
                            </div>
                          </td>

                          {/* Holiday Name */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap font-bold text-slate-900">
                            {holiday.name}
                          </td>

                          {/* Day of Week */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap text-slate-600 font-medium">
                            {holiday.dayOfWeek}
                          </td>

                          {/* Approval Status Badge */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap font-semibold">
                            {isApproved ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
                                <Clock className="w-3.5 h-3.5" /> Pending Approval
                              </span>
                            )}
                          </td>

                          {/* Actions (HR Only) */}
                          {isHR && (
                            <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                {!isApproved ? (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveHoliday(holiday.id)}
                                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
                                  >
                                    Approve
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleRejectHoliday(holiday.id)}
                                    className="px-2.5 py-1 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                                  >
                                    Disable
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteHoliday(holiday.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer transition-colors"
                                  title="Delete Holiday"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARD LIST VIEW (Visible on mobile < md) */}
              <div className="block md:hidden divide-y divide-slate-100">
                {displayedHolidays.map((holiday) => {
                  const isSelected = selectedHolidayIds.includes(holiday.id);
                  const isApproved = holiday.isApproved !== false;
                  const dateObj = new Date(holiday.date + 'T00:00:00');
                  const dayNum = dateObj.getDate();
                  const monthShort = SHORT_MONTHS[dateObj.getMonth()] || 'JAN';
                  const theme = getHolidayTheme(dateObj.getMonth());

                  return (
                    <div
                      key={holiday.id}
                      className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                        isSelected ? 'bg-blue-50/40' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isHR && (
                          <button
                            type="button"
                            onClick={() => toggleSelectHoliday(holiday.id)}
                            className="text-slate-400 hover:text-slate-600 shrink-0 cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-slate-900" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        )}

                        {/* Date Block */}
                        <div className="flex flex-col items-center w-10 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                          <span className={`w-full py-0.5 text-center text-[9px] font-extrabold tracking-wider ${theme.badgeBg} text-white`}>
                            {monthShort}
                          </span>
                          <span className="w-full py-1 text-center text-xs font-bold bg-white text-slate-900">
                            {dayNum}
                          </span>
                        </div>

                        {/* Holiday Info */}
                        <div className="min-w-0 space-y-0.5">
                          <div
                            onClick={() => setActiveHolidayDetail(holiday)}
                            className="font-bold text-xs text-slate-900 truncate cursor-pointer hover:text-blue-600"
                          >
                            {holiday.name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span>{holiday.dayOfWeek}</span>
                            <span>•</span>
                            {isApproved ? (
                              <span className="text-emerald-700 font-medium">Approved</span>
                            ) : (
                              <span className="text-amber-700 font-bold">Pending</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* HR Quick Actions */}
                      {isHR && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isApproved ? (
                            <button
                              type="button"
                              onClick={() => handleApproveHoliday(holiday.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold cursor-pointer shadow-2xs"
                            >
                              Approve
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRejectHoliday(holiday.id)}
                              className="px-2 py-1 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-[11px] font-semibold cursor-pointer"
                            >
                              Disable
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteHoliday(holiday.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── MODAL 1: CHOOSE MULTIPLE TEMPLATES ─── */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl text-slate-900 animate-in zoom-in-95 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Holiday Templates
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select calendar schedules to apply for {activeYear}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Template Selection List */}
            <div className="p-6 py-4 space-y-2 max-h-[260px] overflow-y-auto custom-scrollbar">
              {holidayTemplates.map((tpl) => {
                const count = (tpl.holidaysByYear[activeYear] || []).length;
                const isSelected = selectedTemplateIds.includes(tpl.id);

                return (
                  <div
                    key={tpl.id}
                    onClick={() => {
                      setSelectedTemplateIds((prev) =>
                        prev.includes(tpl.id) ? prev.filter((id) => id !== tpl.id) : [...prev, tpl.id]
                      );
                    }}
                    className={`px-4 py-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/50 shadow-2xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {tpl.name}
                      </span>
                    </div>

                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 shrink-0">
                      {count} Days
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Configuration Options: Merge Mode & Approval Mode */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-700">Merge Policy</span>
                <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setTemplateMergeMode('merge')}
                    className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer ${
                      templateMergeMode === 'merge'
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                  >
                    Merge & Deduplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateMergeMode('replace')}
                    className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer ${
                      templateMergeMode === 'replace'
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                  >
                    Replace All
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-700">Import Status</span>
                <div className="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setTemplateImportApproval('approved')}
                    className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer ${
                      templateImportApproval === 'approved'
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                  >
                    Auto-Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateImportApproval('pending')}
                    className={`px-3 py-1 rounded-md text-xs transition-all cursor-pointer ${
                      templateImportApproval === 'pending'
                        ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 font-medium'
                    }`}
                  >
                    Pending Review
                  </button>
                </div>
              </div>
            </div>

            {/* Summary & Apply Actions */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-white">
              <span className="text-xs text-slate-500 font-medium">
                {selectedTemplateIds.length} Selected · {previewMultiTemplateCount} Days
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedTemplateIds.length === 0}
                  onClick={handleApplySelectedTemplates}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer shadow-2xs transition-all active:scale-98"
                  style={{ color: '#ffffff' }}
                >
                  Apply Templates
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: ADD CUSTOM HOLIDAY ─── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <form
            onSubmit={handleAddCustomHoliday}
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 shadow-2xl text-slate-900 animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900">
                Add New Holiday
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Holiday Name
                </label>
                <input
                  type="text"
                  required
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="e.g. Founders Day"
                  className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 outline-none focus:border-slate-400 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Holiday Date
                </label>
                <input
                  type="date"
                  required
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 outline-none focus:border-slate-400 font-medium"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700">
                  Approval Status
                </label>
                <select
                  value={newHolidayIsApproved ? 'approved' : 'pending'}
                  onChange={(e) => setNewHolidayIsApproved(e.target.value === 'approved')}
                  className="mt-1 w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 outline-none focus:border-slate-400 font-medium cursor-pointer"
                >
                  <option value="approved">Approved</option>
                  <option value="pending">Pending Approval</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-xs"
              >
                Save Holiday
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── MODAL 3: CALENDAR CLICK TO APPROVE / MANAGE HOLIDAY ─── */}
      {activeHolidayDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 shadow-2xl text-slate-900 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Holiday Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveHolidayDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px] font-medium">Holiday</span>
                <span className="text-sm font-bold text-slate-900 block mt-0.5">{activeHolidayDetail.name}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Date</span>
                  <span className="font-semibold text-slate-800">{activeHolidayDetail.date}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px] font-medium">Day</span>
                  <span className="font-semibold text-slate-800">{activeHolidayDetail.dayOfWeek}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px] font-medium">Approval Status</span>
                <div className="mt-1">
                  {activeHolidayDetail.isApproved !== false ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      <Clock className="w-3.5 h-3.5" /> Pending Approval
                    </span>
                  )}
                </div>
              </div>
            </div>

            {isHR && (
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleDeleteHoliday(activeHolidayDetail.id)}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                >
                  Delete
                </button>

                <div className="flex items-center gap-2">
                  {activeHolidayDetail.isApproved === false ? (
                    <button
                      type="button"
                      onClick={() => handleApproveHoliday(activeHolidayDetail.id)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-xs"
                    >
                      Approve Holiday
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRejectHoliday(activeHolidayDetail.id)}
                      className="px-3.5 py-1.5 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl cursor-pointer"
                    >
                      Mark as Pending
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
