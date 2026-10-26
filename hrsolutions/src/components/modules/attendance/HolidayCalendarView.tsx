'use client';
import { DateInput } from '@/components/common/DateInput';

import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import { Holiday } from '@/types';
import { holidayTemplates } from '@/data/holidayTemplates';
import { useApp } from '@/context/AppContext';
import { ATT_CARD } from './attendanceUi';

interface HolidayCalendarViewProps {
  holidays?: Holiday[];
  onUpdateHolidays?: (holidays: Holiday[]) => void | Promise<void>;
  isHR?: boolean;
}

const toLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const weekdayOf = (dateStr: string) =>
  new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });

const holidayYear = (h: Holiday) => (h.year ? Number(h.year) : parseInt(h.date?.split('-')[0], 10));

const makeHolidayId = (prefix: string, date: string) =>
  `${prefix}_${date}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const nameIncludes = (existing: string, candidate: string) =>
  existing
    .split(' / ')
    .some((part) => part.trim().toLowerCase() === candidate.trim().toLowerCase());

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const getHolidayTheme = (_monthIndex?: number) => ({
  pill: 'bg-[var(--studio-navy)] text-white',
  dot: 'bg-[var(--studio-navy)]',
  chipApproved: 'att-cal-chip',
  chipPending: 'att-cal-chip is-pending',
  badgeBg: 'bg-[var(--studio-navy)]',
});

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
  const [feedbackBanner, setFeedbackBanner] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [pendingSaves, setPendingSaves] = useState(0);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Standalone fallback when no parent owns the list
  const [localHolidays, setLocalHolidays] = useState<Holiday[]>(() => propHolidays ?? []);

  useEffect(() => {
    if (propHolidays) setLocalHolidays(propHolidays);
  }, [propHolidays]);

  useEffect(
    () => () => {
      if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    },
    []
  );

  const allHolidays = propHolidays ?? localHolidays;
  // Employees only ever see published (approved) holidays
  const visibleHolidays = useMemo(
    () => (isHR ? allHolidays : allHolidays.filter((h) => h.isApproved !== false)),
    [allHolidays, isHR]
  );

  // Latest list, so back-to-back actions never build on a stale render
  const holidaysRef = useRef<Holiday[]>(allHolidays);
  holidaysRef.current = allHolidays;

  const showBanner = (message: string, type: 'success' | 'info' | 'error') => {
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    setFeedbackBanner({ message, type });
    if (type !== 'error') {
      bannerTimerRef.current = setTimeout(() => setFeedbackBanner(null), 5000);
    }
  };

  const saveHolidays = (updated: Holiday[], successMessage?: string) => {
    holidaysRef.current = updated;
    setLocalHolidays(updated);
    const result = onUpdateHolidays?.(updated);
    if (!result) {
      if (successMessage) showBanner(successMessage, 'success');
      return;
    }
    setPendingSaves((n) => n + 1);
    result
      .then(() => {
        if (successMessage) showBanner(successMessage, 'success');
      })
      .catch((err: any) => {
        showBanner(
          `Couldn't save holidays${err?.message ? `: ${err.message}` : ''}. The calendar was reloaded from the last saved version.`,
          'error'
        );
      })
      .finally(() => setPendingSaves((n) => Math.max(0, n - 1)));
  };

  // Dynamic available years list
  const availableYears = useMemo(() => {
    const years = new Set<number>([2025, 2026, 2027]);
    years.add(new Date().getFullYear());
    years.add(activeYear);
    visibleHolidays.forEach((h) => {
      const y = holidayYear(h);
      if (y && !isNaN(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => a - b);
  }, [visibleHolidays, activeYear]);

  // Filtered by selected year and sorted chronologically
  const yearHolidays = useMemo(() => {
    return visibleHolidays
      .filter((h) => holidayYear(h) === activeYear)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [visibleHolidays, activeYear]);

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
  const [templatePreviewApproval, setTemplatePreviewApproval] = useState<Record<string, boolean>>({});

  const [showAddModal, setShowAddModal] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayIsApproved, setNewHolidayIsApproved] = useState<boolean>(true);
  const [addHolidayError, setAddHolidayError] = useState<string | null>(null);

  const highlightHoliday = (id: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedHolidayId(id);
    highlightTimerRef.current = setTimeout(() => setHighlightedHolidayId(null), 4000);
  };

  // Union of every selected template for the active year, one entry per date
  const selectedTemplateItems = useMemo(() => {
    const byDate = new Map<string, { name: string; date: string }>();
    selectedTemplateIds.forEach((tplId) => {
      const tpl = holidayTemplates.find((t) => t.id === tplId);
      if (!tpl) return;
      (tpl.holidaysByYear[activeYear] || []).forEach((item) => {
        const existing = byDate.get(item.date);
        if (!existing) {
          byDate.set(item.date, { name: item.name, date: item.date });
        } else if (!nameIncludes(existing.name, item.name)) {
          existing.name = `${existing.name} / ${item.name}`;
        }
      });
    });
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedTemplateIds, activeYear]);

  const selectedTemplatePreview = useMemo(() => {
    const existingByDate = new Map<string, Holiday>();
    allHolidays.forEach((h) => {
      if (holidayYear(h) === activeYear && h.date) existingByDate.set(h.date, h);
    });
    return selectedTemplateItems.map((item) => {
      const clash = existingByDate.get(item.date);
      let clashLabel: string | null = null;
      if (clash) {
        if (templateMergeMode === 'replace') {
          clashLabel = `Replaces “${clash.name}”`;
        } else if (nameIncludes(clash.name, item.name) && clash.name === item.name) {
          clashLabel = 'Already on calendar';
        } else {
          clashLabel = `Combines with “${clash.name}”`;
        }
      }
      return {
        ...item,
        weekday: weekdayOf(item.date),
        clashLabel,
        existingApproved: clash ? clash.isApproved !== false : null,
      };
    });
  }, [selectedTemplateItems, allHolidays, activeYear, templateMergeMode]);

  const willApprovePreviewDate = (date: string, existingApproved: boolean | null) => {
    if (!isHR) return false;
    if (Object.prototype.hasOwnProperty.call(templatePreviewApproval, date)) {
      return templatePreviewApproval[date];
    }
    return existingApproved === true;
  };

  const previewApproveCount = useMemo(
    () => selectedTemplatePreview.filter((item) => willApprovePreviewDate(item.date, item.existingApproved)).length,
    [selectedTemplatePreview, templatePreviewApproval, isHR]
  );

  const previewPendingCount = selectedTemplatePreview.length - previewApproveCount;

  const previewByMonth = useMemo(() => {
    const groups: { key: string; label: string; items: typeof selectedTemplatePreview }[] = [];
    selectedTemplatePreview.forEach((item) => {
      const monthIdx = parseInt(item.date.split('-')[1], 10) - 1;
      const key = `${item.date.slice(0, 7)}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(item);
      } else {
        groups.push({
          key,
          label: Number.isNaN(monthIdx) ? key : MONTH_NAMES[monthIdx],
          items: [item],
        });
      }
    });
    return groups;
  }, [selectedTemplatePreview]);

  const setPreviewApproval = (date: string, approve: boolean) => {
    setTemplatePreviewApproval((prev) => ({ ...prev, [date]: approve }));
  };

  const setAllPreviewApproval = (approve: boolean) => {
    const next: Record<string, boolean> = {};
    selectedTemplatePreview.forEach((item) => {
      next[item.date] = approve;
    });
    setTemplatePreviewApproval(next);
  };

  const openTemplateModal = () => {
    setTemplateMergeMode('merge');
    setTemplatePreviewApproval({});
    setShowTemplateModal(true);
  };

  const handleApplySelectedTemplates = () => {
    if (selectedTemplateItems.length === 0) return;

    const current = holidaysRef.current;
    const otherYears = current.filter((h) => holidayYear(h) !== activeYear);
    const currentYear = templateMergeMode === 'replace' ? [] : current.filter((h) => holidayYear(h) === activeYear);

    const byDate = new Map<string, Holiday>();
    currentYear.forEach((h) => byDate.set(h.date, { ...h }));

    let added = 0;
    let updated = 0;
    let approved = 0;
    selectedTemplateItems.forEach((item) => {
      const preview = selectedTemplatePreview.find((p) => p.date === item.date);
      const approve = willApprovePreviewDate(item.date, preview?.existingApproved ?? null);
      if (approve) approved += 1;
      const existing = byDate.get(item.date);
      if (existing) {
        const mergedName = nameIncludes(existing.name, item.name) ? existing.name : `${existing.name} / ${item.name}`;
        if (mergedName !== existing.name || existing.isApproved !== approve) updated += 1;
        byDate.set(item.date, { ...existing, name: mergedName, isApproved: approve });
      } else {
        added += 1;
        byDate.set(item.date, {
          id: makeHolidayId('hol', item.date),
          name: item.name,
          date: item.date,
          year: activeYear,
          dayOfWeek: weekdayOf(item.date),
          isApproved: approve,
        });
      }
    });

    const templateCount = selectedTemplateIds.length;
    const pendingNote =
      approved === selectedTemplateItems.length
        ? ', all approved'
        : approved === 0
          ? ' as pending (hidden from employees until approved)'
          : ` (${approved} approved, ${selectedTemplateItems.length - approved} pending)`;
    const summary =
      templateMergeMode === 'replace'
        ? `Replaced ${activeYear} with ${byDate.size} holidays from ${templateCount} template${templateCount === 1 ? '' : 's'}${pendingNote}.`
        : `Added ${added} holiday${added === 1 ? '' : 's'}${updated ? ` and updated ${updated}` : ''} for ${activeYear} from ${templateCount} template${templateCount === 1 ? '' : 's'}${pendingNote}.`;

    saveHolidays([...otherYears, ...Array.from(byDate.values())], summary);

    const firstApproved = selectedTemplateItems.find((item) => {
      const preview = selectedTemplatePreview.find((p) => p.date === item.date);
      return willApprovePreviewDate(item.date, preview?.existingApproved ?? null);
    });
    const first = firstApproved || selectedTemplateItems[0];
    if (first) {
      const monthIdx = parseInt(first.date.split('-')[1], 10) - 1;
      if (!Number.isNaN(monthIdx)) setActiveMonth(monthIdx);
      setSelectedMobileDate(first.date);
    }
    setApprovalFilter(approved === selectedTemplateItems.length ? 'all' : approved === 0 ? 'pending' : 'all');
    setSelectedHolidayIds([]);
    setShowTemplateModal(false);
  };

  const setApproval = (ids: string[], isApproved: boolean) => {
    const idSet = new Set(ids);
    saveHolidays(holidaysRef.current.map((h) => (idSet.has(h.id) ? { ...h, isApproved } : h)));
    if (activeHolidayDetail && idSet.has(activeHolidayDetail.id)) {
      setActiveHolidayDetail((prev) => (prev ? { ...prev, isApproved } : null));
    }
  };

  const handleApproveHoliday = (holidayId: string) => setApproval([holidayId], true);
  const handleRejectHoliday = (holidayId: string) => setApproval([holidayId], false);

  const handleDeleteHoliday = (holidayId: string) => {
    saveHolidays(holidaysRef.current.filter((h) => h.id !== holidayId));
    setSelectedHolidayIds((prev) => prev.filter((id) => id !== holidayId));
    if (activeHolidayDetail?.id === holidayId) {
      setActiveHolidayDetail(null);
    }
  };

  const handleApproveSelected = () => {
    setApproval(selectedHolidayIds, true);
    setSelectedHolidayIds([]);
  };

  const handleRejectSelected = () => {
    setApproval(selectedHolidayIds, false);
    setSelectedHolidayIds([]);
  };

  const handleDeleteSelected = () => {
    const idSet = new Set(selectedHolidayIds);
    saveHolidays(holidaysRef.current.filter((h) => !idSet.has(h.id)));
    setSelectedHolidayIds([]);
  };

  const handleApproveAllPending = () => {
    setApproval(pendingHolidays.map((h) => h.id), true);
  };

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

  const resetAddForm = () => {
    setNewHolidayName('');
    setNewHolidayDate('');
    setNewHolidayIsApproved(true);
    setAddHolidayError(null);
  };

  const openAddModal = (dateStr?: string) => {
    resetAddForm();
    const todayStr = toLocalDateStr(new Date());
    const viewingCurrentMonth = todayStr.startsWith(`${activeYear}-${String(activeMonth + 1).padStart(2, '0')}`);
    const resolved =
      dateStr ||
      selectedMobileDate ||
      (viewingCurrentMonth ? todayStr : `${activeYear}-${String(activeMonth + 1).padStart(2, '0')}-01`);
    const [yr, month] = resolved.split('-').map((p) => parseInt(p, 10));
    if (!Number.isNaN(yr)) setActiveYear(yr);
    if (!Number.isNaN(month)) setActiveMonth(month - 1);
    setSelectedMobileDate(resolved);
    setNewHolidayDate(resolved);
    setShowAddModal(true);
  };

  const handleDesktopCellClick = (dateStr: string) => {
    if (!isHR) return;
    openAddModal(dateStr);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    resetAddForm();
  };

  const handleAddCustomHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newHolidayName.trim();
    if (!name) {
      setAddHolidayError('Enter a name for the holiday.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newHolidayDate)) {
      setAddHolidayError('Pick a valid date.');
      return;
    }

    const [yr, month, dayNum] = newHolidayDate.split('-').map((p) => parseInt(p, 10));
    const mIdx = month - 1;
    if (yr < 2000 || yr > 2100) {
      setAddHolidayError('Pick a date between 2000 and 2100.');
      return;
    }
    if (yr !== activeYear) {
      setAddHolidayError(`Pick a date in ${activeYear}.`);
      return;
    }

    const clash = holidaysRef.current.find((h) => h.date === newHolidayDate);
    if (clash) {
      setAddHolidayError(`"${clash.name}" is already on this date. Delete it first or pick another date.`);
      return;
    }

    const newH: Holiday = {
      id: makeHolidayId('hol_custom', newHolidayDate),
      name,
      date: newHolidayDate,
      year: yr,
      dayOfWeek: weekdayOf(newHolidayDate),
      isApproved: newHolidayIsApproved,
    };

    saveHolidays(
      [...holidaysRef.current, newH],
      `"${newH.name}" added for ${MONTH_NAMES[mIdx]} ${dayNum}, ${yr}${newHolidayIsApproved ? '' : ' as pending (hidden from employees until approved)'}.`
    );

    setActiveYear(yr);
    setActiveMonth(mIdx);
    setSelectedHolidayIds([]);
    if (newHolidayIsApproved && approvalFilter === 'pending') {
      setApprovalFilter('all');
    } else if (!newHolidayIsApproved && approvalFilter === 'approved') {
      setApprovalFilter('all');
    }
    setSelectedMobileDate(newHolidayDate);
    highlightHoliday(newH.id);

    if (triggerToast) {
      triggerToast({
        title: 'Holiday Added',
        message: `"${newH.name}" scheduled on ${MONTH_NAMES[mIdx]} ${dayNum}, ${yr} (${newHolidayIsApproved ? 'Approved' : 'Pending'}).`,
        type: 'attendance',
      });
    }

    closeAddModal();
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

    const todayStr = toLocalDateStr(new Date());

    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = activeMonth === 0 ? 11 : activeMonth - 1;
      const prevY = activeMonth === 0 ? activeYear - 1 : activeYear;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const paddingMatching = visibleHolidays.filter((h) => {
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
      const nextPaddingMatching = visibleHolidays.filter((h) => {
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
  }, [activeYear, activeMonth, yearHolidays, visibleHolidays, approvalFilter]);

  const handlePrevMonth = () => {
    setSelectedMobileDate(null);
    if (activeMonth === 0) {
      setActiveMonth(11);
      setActiveYear((y) => y - 1);
    } else {
      setActiveMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    setSelectedMobileDate(null);
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
    setSelectedMobileDate(toLocalDateStr(today));
  };

  const previewMultiTemplateCount = selectedTemplateItems.length;

  return (
    <div className="space-y-4 w-full">
      {/* Top Feedback Banner */}
      {feedbackBanner && (
        <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-semibold animate-in fade-in slide-in-from-top-2 duration-200 ${
          feedbackBanner.type === 'success'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : feedbackBanner.type === 'error'
            ? 'bg-rose-50 text-rose-800 border-rose-200'
            : 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] text-blue-800 border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Top Header & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-bold text-[var(--text-primary)]">
            Holidays in {activeYear}
          </h2>
          <span className="text-xs text-[var(--text-muted)] font-medium">
            {isHR
              ? `· ${yearHolidays.length} total (${approvedHolidays.length} approved${pendingHolidays.length > 0 ? `, ${pendingHolidays.length} pending` : ''})`
              : `· ${yearHolidays.length} total`}
          </span>
          {pendingSaves > 0 && (
            <span className="text-[11px] text-[var(--text-muted)] font-medium animate-pulse">Saving…</span>
          )}
        </div>

        {/* Scrollable Action Strip on Mobile */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          {/* Dynamic Year Switcher */}
          <div className="flex items-center bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] rounded-xl p-0.5 shrink-0">
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
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-bold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] rounded-xl p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-bold'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
                onClick={openTemplateModal}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] transition-colors cursor-pointer shrink-0"
              >
                <Layers className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>Templates</span>
              </button>

              {/* Add Custom Holiday */}
              <button
                type="button"
                onClick={() => openAddModal()}
                className="work-btn-primary shrink-0 h-8 px-3 text-[12px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </>
          )}
        </div>
      </div>

      {!isHR && yearHolidays.length === 0 && (
        <div className={`${ATT_CARD} p-4 text-xs text-[var(--text-secondary)]`}>
          <span className="font-bold text-[var(--text-primary)]">No holidays published for {activeYear} yet.</span>
        </div>
      )}

      {isHR && yearHolidays.length === 0 && (
        <div className={`${ATT_CARD} p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
          <div className="text-xs text-[var(--text-secondary)]">
            <span className="font-bold text-[var(--text-primary)]">No holidays set up for {activeYear} yet.</span>{' '}
            Apply one or more templates, or add your own company holidays.
          </div>
          <button
            type="button"
            onClick={openTemplateModal}
            className="work-btn-primary shrink-0 h-8 px-3 text-[12px]"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Choose templates</span>
          </button>
        </div>
      )}

      {/* Filter Strip: Approval Status Filter + Bulk Actions */}
      {isHR && (
      <div className={`${ATT_CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 sm:p-3`}>
        {/* Left: Approval Filter Pills (Horizontally scrollable on mobile) */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface-subtle)]/90 border border-[var(--border-color)] overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setApprovalFilter('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
              approvalFilter === 'all'
                ? 'bg-[var(--studio-navy)] text-white font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/60'
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
                ? 'bg-[var(--studio-navy)] text-white font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/60'
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
                ? 'bg-[var(--studio-navy)] text-white font-bold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]/60'
            }`}
            style={approvalFilter === 'pending' ? { color: '#ffffff' } : undefined}
          >
            Pending ({pendingHolidays.length})
          </button>
        </div>

        {/* Right: Bulk Approval Actions (if HR and items selected) */}
        {isHR && selectedHolidayIds.length > 0 ? (
          <div className="flex items-center gap-2 shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-[var(--border-color)] overflow-x-auto no-scrollbar">
            <span className="text-xs text-[var(--text-muted)] font-medium whitespace-nowrap">
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
              className="px-2.5 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] text-xs font-semibold cursor-pointer whitespace-nowrap"
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
          <div className="flex items-center justify-between sm:justify-end gap-2 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-[var(--border-color)]">
            <span className="text-xs text-amber-700 font-medium flex items-center gap-1.5 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              {pendingHolidays.length} pending
            </span>
            <button
              type="button"
              onClick={handleApproveAllPending}
              className="work-btn-primary h-8 px-3 text-[12px] whitespace-nowrap"
            >
              Approve All Pending ({pendingHolidays.length})
            </button>
          </div>
        ) : null}
      </div>
      )}

      {/* ─── GOOGLE CALENDAR MONTHLY VIEW ─── */}
      {viewMode === 'calendar' && (
        <div className={`${ATT_CARD} overflow-hidden`}>
          {/* Calendar Month Navigation Header */}
          <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/70">
            <div className="flex items-center gap-2 sm:gap-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                {MONTH_NAMES[activeMonth]} {activeYear}
              </h3>
              <button
                type="button"
                onClick={handleGoToday}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer shadow-2xs"
              >
                Today
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] cursor-pointer shadow-2xs"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] cursor-pointer shadow-2xs"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Column Headers */}
          <div className="grid grid-cols-7 border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/90 text-center text-[11px] sm:text-xs font-semibold text-[var(--text-muted)]">
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-2">
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day[0]}</span>
              </div>
            ))}
          </div>

          {/* DESKTOP: 7-Column Full Grid Cells (Visible on md+) */}
          <div className="hidden md:grid grid-cols-7 divide-x divide-y divide-[var(--border-color)] border-b border-[var(--border-color)]">
            {calendarCells.map((cell, idx) => (
              <div
                key={idx}
                role={isHR ? 'button' : undefined}
                tabIndex={isHR ? 0 : undefined}
                onClick={() => handleDesktopCellClick(cell.dateStr)}
                onKeyDown={(e) => {
                  if (!isHR) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleDesktopCellClick(cell.dateStr);
                  }
                }}
                title={isHR ? `Add holiday on ${cell.dateStr}` : undefined}
                className={`min-h-[105px] p-1.5 transition-colors ${
                  cell.isCurrentMonth
                    ? 'bg-[var(--bg-surface)]'
                    : 'bg-[var(--bg-surface-subtle)]/40 text-slate-300'
                } ${isHR ? 'cursor-pointer hover:bg-[var(--bg-surface-subtle)]' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center justify-center text-xs font-semibold ${
                      cell.isToday
                        ? 'w-6 h-6 rounded-full att-cal-today font-bold'
                        : cell.isCurrentMonth
                        ? 'text-[var(--text-secondary)]'
                        : 'text-[var(--text-muted)]'
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
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveHolidayDetail(h);
                        }}
                        className={`w-full text-left px-2 py-1 rounded text-[11px] font-semibold truncate transition-all cursor-pointer flex items-center justify-between gap-1.5 ${
                          isApproved ? theme.chipApproved : theme.chipPending
                        } ${highlightedHolidayId === h.id ? 'ring-2 ring-blue-500 scale-[1.02] shadow-xs' : ''}`}
                        title={isHR ? `${h.name} (${isApproved ? 'Approved' : 'Pending Approval'}) — click to manage` : h.name}
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
            <div className="grid grid-cols-7 divide-x divide-y divide-[var(--border-color)] border-b border-[var(--border-color)] bg-[var(--bg-surface)]">
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
                        ? 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] ring-2 ring-blue-600 ring-inset z-10'
                        : cell.isCurrentMonth
                        ? 'bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)]'
                        : 'bg-[var(--bg-surface-subtle)]/50 text-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-flex items-center justify-center text-xs font-semibold ${
                        cell.isToday
                          ? 'w-6 h-6 rounded-full att-cal-today font-bold'
                          : cell.isCurrentMonth
                          ? isSelected
                            ? 'text-blue-900 font-bold'
                            : 'text-[var(--text-primary)]'
                          : 'text-[var(--text-muted)]'
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
                        <span className="text-[9px] font-bold text-[var(--text-muted)] leading-none">
                          +{cell.holidays.length - 1}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mobile Agenda / Holiday List for Active Month or Selected Date */}
            <div className="p-3 sm:p-4 bg-[var(--bg-surface-subtle)]/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--text-primary)]">
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
                <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-color)] text-center text-xs text-[var(--text-muted)]">
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
                      className="p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] hover:border-blue-400 transition-all cursor-pointer shadow-2xs flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Month/Day Badge */}
                        <div className="flex flex-col items-center w-10 shrink-0 rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]">
                          <span className={`w-full py-0.5 text-center text-[9px] font-extrabold tracking-wider ${theme.badgeBg} text-white`}>
                            {monthShort}
                          </span>
                          <span className="w-full py-1 text-center text-xs font-bold bg-[var(--bg-surface)] text-[var(--text-primary)]">
                            {dayNum}
                          </span>
                        </div>

                        <div className="min-w-0 space-y-0.5">
                          <div className="font-bold text-xs text-[var(--text-primary)] truncate">
                            {holiday.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
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
                              className="px-2 py-1 border border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg text-[11px] font-semibold cursor-pointer"
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
            <div className="p-12 text-center text-xs text-[var(--text-muted)]">
              No holidays found matching {approvalFilter !== 'all' ? `"${approvalFilter}"` : `year ${activeYear}`}.
            </div>
          ) : (
            <>
              {/* DESKTOP TABLE VIEW (Visible on md+) */}
              <div className="hidden md:block overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] font-semibold text-[11px]">
                      {isHR && (
                        <th className="py-3 px-3.5 w-10">
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center cursor-pointer"
                          >
                            {selectedHolidayIds.length > 0 && selectedHolidayIds.length === displayedHolidays.length ? (
                              <CheckSquare className="h-4 w-4 text-[var(--text-primary)]" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </th>
                      )}
                      <th className="py-3 px-3.5 font-bold text-[var(--text-primary)]">Date</th>
                      <th className="py-3 px-3.5 font-bold text-[var(--text-primary)]">Holiday Name</th>
                      <th className="py-3 px-3.5">Day of Week</th>
                      <th className="py-3 px-3.5">Status</th>
                      {isHR && <th className="py-3 px-3.5 text-right">Approval Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-primary)]">
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
                          className={`hover:bg-[var(--bg-surface-subtle)]/75 transition-colors ${isSelected ? 'bg-[var(--bg-surface-subtle)]' : ''}`}
                        >
                          {isHR && (
                            <td className="py-2.5 px-3.5">
                              <button
                                type="button"
                                onClick={() => toggleSelectHoliday(holiday.id)}
                                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center cursor-pointer"
                              >
                                {isSelected ? (
                                  <CheckSquare className="h-4 w-4 text-[var(--text-primary)]" />
                                ) : (
                                  <Square className="h-4 w-4" />
                                )}
                              </button>
                            </td>
                          )}

                          {/* Date Cell */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap font-medium text-[var(--text-primary)]">
                            <div className="flex items-center gap-2">
                              <span className={`w-10 text-center py-0.5 rounded text-[10px] font-bold ${getHolidayTheme(dateObj.getMonth()).badgeBg} text-white`}>
                                {monthShort} {dayNum}
                              </span>
                              <span>{holiday.date}</span>
                            </div>
                          </td>

                          {/* Holiday Name */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap font-bold text-[var(--text-primary)]">
                            {holiday.name}
                          </td>

                          {/* Day of Week */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap text-[var(--text-secondary)] font-medium">
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
                                    className="px-2.5 py-1 border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                                  >
                                    Disable
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleDeleteHoliday(holiday.id)}
                                  className="p-1 text-[var(--text-muted)] hover:text-rose-600 rounded cursor-pointer transition-colors"
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
              <div className="block md:hidden divide-y divide-[var(--border-color)]">
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
                        isSelected ? 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)]/40' : 'bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {isHR && (
                          <button
                            type="button"
                            onClick={() => toggleSelectHoliday(holiday.id)}
                            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] shrink-0 cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="h-4 w-4 text-[var(--text-primary)]" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        )}

                        {/* Date Block */}
                        <div className="flex flex-col items-center w-10 shrink-0 rounded-lg overflow-hidden border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]">
                          <span className={`w-full py-0.5 text-center text-[9px] font-extrabold tracking-wider ${theme.badgeBg} text-white`}>
                            {monthShort}
                          </span>
                          <span className="w-full py-1 text-center text-xs font-bold bg-[var(--bg-surface)] text-[var(--text-primary)]">
                            {dayNum}
                          </span>
                        </div>

                        {/* Holiday Info */}
                        <div className="min-w-0 space-y-0.5">
                          <div
                            onClick={() => setActiveHolidayDetail(holiday)}
                            className="font-bold text-xs text-[var(--text-primary)] truncate cursor-pointer hover:text-blue-600"
                          >
                            {holiday.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1.5">
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
                              className="px-2 py-1 border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] rounded-lg text-[11px] font-semibold cursor-pointer"
                            >
                              Disable
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteHoliday(holiday.id)}
                            className="p-1 text-[var(--text-muted)] hover:text-rose-600 rounded cursor-pointer"
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
        <div className="att-overlay" role="presentation" onClick={() => setShowTemplateModal(false)}>
          <div
            className="att-dialog max-w-4xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="holiday-templates-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="att-dialog-head">
              <h2 id="holiday-templates-title">Holiday templates</h2>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="att-dialog-close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 grid grid-cols-1 md:grid-cols-[minmax(16rem,18.5rem)_minmax(0,1fr)] overflow-y-auto md:overflow-hidden">
              <aside className="border-b md:border-b-0 md:border-r border-[var(--border-color)] bg-[var(--bg-app)] flex flex-col min-h-0">
                <div className="px-4 pt-4 pb-2 flex items-baseline justify-between gap-2 shrink-0">
                  <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                    Templates
                  </h3>
                  <span className="text-xs text-[var(--text-secondary)]">
                    {selectedTemplateIds.length} of {holidayTemplates.length}
                  </span>
                </div>
                <div className="px-3 pb-3 space-y-1.5 overflow-y-auto custom-scrollbar min-h-0">
                  {holidayTemplates.map((tpl) => {
                    const count = (tpl.holidaysByYear[activeYear] || []).length;
                    const isSelected = selectedTemplateIds.includes(tpl.id);

                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedTemplateIds((prev) =>
                            prev.includes(tpl.id) ? prev.filter((id) => id !== tpl.id) : [...prev, tpl.id]
                          );
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-[8px] border transition-[border-color,background-color,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer active:scale-[0.97] ${
                          isSelected
                            ? 'border-[var(--primary-blue)] bg-[var(--studio-selected)]'
                            : 'border-transparent hover:border-[var(--border-color)] hover:bg-[var(--bg-surface)]'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 w-4 h-4 rounded-[5px] border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? 'bg-[var(--studio-navy)] border-[var(--studio-navy)] text-white'
                                : 'border-[var(--border-strong)] bg-[var(--bg-surface)]'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
                              {tpl.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                              {count > 0 ? `${count} days in ${activeYear}` : `No ${activeYear} dates`}
                            </span>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-auto px-4 py-3 border-t border-[var(--border-color)] bg-[var(--bg-surface)]">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">When dates already exist</p>
                  <div className="mt-2 flex items-center gap-1 rounded-[7px] bg-[var(--bg-surface-subtle)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setTemplateMergeMode('merge')}
                      className={`flex-1 px-2.5 py-1.5 rounded-[6px] text-xs cursor-pointer transition-[background-color,color,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                        templateMergeMode === 'merge'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-[0_1px_3px_rgba(23,50,78,0.08)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                      }`}
                    >
                      Keep both
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateMergeMode('replace')}
                      className={`flex-1 px-2.5 py-1.5 rounded-[6px] text-xs cursor-pointer transition-[background-color,color,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] ${
                        templateMergeMode === 'replace'
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-[0_1px_3px_rgba(23,50,78,0.08)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium'
                      }`}
                    >
                      Replace {activeYear}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                    {templateMergeMode === 'merge'
                      ? 'Clashing dates become one holiday. Approval is set per date in the preview.'
                      : `Clears every ${activeYear} holiday, including custom ones, then applies this preview.`}
                  </p>
                </div>
              </aside>

              <section className="flex flex-col min-h-[18rem] md:min-h-0 bg-[var(--bg-surface)]">
                <div className="px-4 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div>
                    <h3 className="text-[15px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                      {activeYear} preview
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {previewMultiTemplateCount === 0
                        ? `Select a pack with ${activeYear} dates.`
                        : isHR
                          ? `${previewApproveCount} approved · ${previewPendingCount} pending`
                          : `${previewMultiTemplateCount} unique date${previewMultiTemplateCount === 1 ? '' : 's'}, applied as pending`}
                    </p>
                  </div>
                  {isHR && selectedTemplatePreview.length > 0 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setAllPreviewApproval(false)}
                        className="px-2.5 py-1.5 rounded-[7px] text-xs font-semibold text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer transition-[background-color,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
                      >
                        All pending
                      </button>
                      <button
                        type="button"
                        onClick={() => setAllPreviewApproval(true)}
                        className="px-2.5 py-1.5 rounded-[7px] text-xs font-semibold text-[var(--studio-navy)] border border-[var(--border-color)] hover:bg-[var(--studio-selected)] cursor-pointer transition-[background-color,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]"
                      >
                        Approve all
                      </button>
                    </div>
                  )}
                </div>

                {selectedTemplatePreview.length === 0 ? (
                  <p className="m-4 text-[13px] text-[var(--text-secondary)] px-4 py-10 text-center rounded-[12px] border border-dashed border-[var(--border-color)] bg-[var(--bg-app)]">
                    Select a template with dates for {activeYear} to review and approve them here.
                  </p>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pb-3">
                    {previewByMonth.map((group) => (
                      <div key={group.key} className="mb-3 last:mb-0">
                        <p className="sticky top-0 z-[1] px-1 py-1.5 text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-surface)]">
                          {group.label}
                        </p>
                        <div className="rounded-[12px] border border-[var(--border-color)] overflow-hidden divide-y divide-[var(--border-color)]">
                          {group.items.map((item) => {
                            const dateObj = new Date(`${item.date}T00:00:00`);
                            const dayNum = dateObj.getDate();
                            const monthShort = SHORT_MONTHS[dateObj.getMonth()] || 'JAN';
                            const approved = willApprovePreviewDate(item.date, item.existingApproved);
                            return (
                              <div
                                key={item.date}
                                className="grid grid-cols-[44px_minmax(0,1fr)] sm:grid-cols-[44px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-center px-3 py-2.5 bg-[var(--bg-surface)]"
                              >
                                <div className="flex flex-col items-center w-11 rounded-[8px] overflow-hidden border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]">
                                  <span className="w-full py-0.5 text-center text-xs font-extrabold tracking-wider bg-[var(--studio-navy)] text-white">
                                    {monthShort}
                                  </span>
                                  <span className="w-full py-1 text-center text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-surface)]">
                                    {dayNum}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                                    {item.name}
                                  </p>
                                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                                    {item.weekday}
                                    {item.clashLabel ? ` · ${item.clashLabel}` : ''}
                                  </p>
                                </div>
                                {isHR ? (
                                  <div
                                    role="group"
                                    aria-label={`Approval for ${item.name}`}
                                    className="col-span-2 sm:col-span-1 sm:justify-self-end flex items-center rounded-[7px] bg-[var(--bg-surface-subtle)] p-0.5"
                                  >
                                    <button
                                      type="button"
                                      aria-pressed={!approved}
                                      onClick={() => setPreviewApproval(item.date, false)}
                                      className={`px-2.5 py-1 rounded-[6px] text-xs cursor-pointer transition-[background-color,color,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--studio-focus)] ${
                                        !approved
                                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-[0_1px_3px_rgba(23,50,78,0.08)]'
                                          : 'text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)]'
                                      }`}
                                    >
                                      Pending
                                    </button>
                                    <button
                                      type="button"
                                      aria-pressed={approved}
                                      onClick={() => setPreviewApproval(item.date, true)}
                                      className={`px-2.5 py-1 rounded-[6px] text-xs cursor-pointer transition-[background-color,color,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--studio-focus)] ${
                                        approved
                                          ? 'bg-[var(--studio-navy)] text-white font-semibold'
                                          : 'text-[var(--text-secondary)] font-medium hover:text-[var(--text-primary)]'
                                      }`}
                                    >
                                      Approve
                                    </button>
                                  </div>
                                ) : (
                                  <span className="col-span-2 sm:col-span-1 sm:justify-self-end text-xs font-medium text-[var(--text-secondary)]">
                                    Pending
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="px-4 py-3.5 border-t border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--bg-surface)] shrink-0">
              <span className="text-xs text-[var(--text-secondary)] font-medium">
                {selectedTemplateIds.length} selected · {previewMultiTemplateCount} unique date{previewMultiTemplateCount === 1 ? '' : 's'}
                {isHR && previewMultiTemplateCount > 0
                  ? ` · ${previewApproveCount} approved, ${previewPendingCount} pending`
                  : ''}
              </span>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="work-btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={previewMultiTemplateCount === 0}
                  onClick={handleApplySelectedTemplates}
                  className="work-btn-primary disabled:opacity-50"
                >
                  Apply to {activeYear}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: ADD CUSTOM HOLIDAY ─── */}
      {showAddModal && (
        <div className="att-overlay" role="presentation" onClick={closeAddModal}>
          <form
            onSubmit={handleAddCustomHoliday}
            onClick={(e) => e.stopPropagation()}
            className="att-dialog max-w-sm p-5 space-y-4 overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2.5">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Add New Holiday
              </h3>
              <button
                type="button"
                onClick={closeAddModal}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">
                  Holiday Name
                </label>
                <input
                  type="text"
                  required
                  value={newHolidayName}
                  autoFocus
                  maxLength={255}
                  onChange={(e) => {
                    setNewHolidayName(e.target.value);
                    setAddHolidayError(null);
                  }}
                  placeholder="e.g. Founders Day"
                  className="work-field mt-1 w-full"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">
                  Holiday Date
                </label>
                <DateInput required value={newHolidayDate} min={`${activeYear}-01-01`} max={`${activeYear}-12-31`} onChange={(e) => {
                    setNewHolidayDate(e.target.value);
                    setAddHolidayError(null);
                  }}
                  className="work-field mt-1 w-full"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-secondary)]">
                  Approval Status
                </label>
                <select
                  value={newHolidayIsApproved ? 'approved' : 'pending'}
                  onChange={(e) => setNewHolidayIsApproved(e.target.value === 'approved')}
                  className="work-field mt-1 w-full"
                >
                  <option value="approved">Approved (visible to employees)</option>
                  <option value="pending">Pending (hidden until approved)</option>
                </select>
              </div>

              {addHolidayError && (
                <div className="att-warn flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                  <span>{addHolidayError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={closeAddModal}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="work-btn-primary"
              >
                Save Holiday
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── MODAL 3: CALENDAR CLICK TO APPROVE / MANAGE HOLIDAY ─── */}
      {activeHolidayDetail && (
        <div className="att-overlay" role="presentation" onClick={() => setActiveHolidayDetail(null)}>
          <div className="att-dialog max-w-sm p-5 space-y-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2.5">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Holiday Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveHolidayDetail(null)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[var(--text-muted)] block text-[11px] font-medium">Holiday</span>
                <span className="text-sm font-bold text-[var(--text-primary)] block mt-0.5">{activeHolidayDetail.name}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px] font-medium">Date</span>
                  <span className="font-semibold text-[var(--text-primary)]">{activeHolidayDetail.date}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px] font-medium">Day</span>
                  <span className="font-semibold text-[var(--text-primary)]">{activeHolidayDetail.dayOfWeek}</span>
                </div>
              </div>

              {isHR && (
              <div>
                <span className="text-[var(--text-muted)] block text-[11px] font-medium">Approval Status</span>
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
              )}
            </div>

            {isHR && (
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-[var(--border-color)]">
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
                      className="px-3.5 py-1.5 border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] text-xs font-semibold rounded-xl cursor-pointer"
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
