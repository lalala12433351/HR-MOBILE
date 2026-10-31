'use client';
import { ResponsiveFilters } from '@/components/common/ResponsiveFilters';
import './workspaces.css';
import { DateInput } from '@/components/common/DateInput';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import styles from './mobile-timesheets.module.css';
import drawerStyles from '@/components/common/mobile-drawers.module.css';
import { useDrawerFocus } from '@/hooks/useDrawerFocus';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  CheckCircle2,
  X,
  Edit3,
  Trash2,
  Download,
  Check,
  Search,
} from 'lucide-react';
import { AppState, isTestEntity, normalizeTaskStatus } from '../../services/store';
import { TimesheetEntry, Project } from '../../types';
import { api } from '../../services/apiClient';
import { combineResumedTaskEntries, isUuid, taskDayMergePlans } from '../../utils/taskBoard';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { localDateKey } from '@/utils/dashboardPeople';

interface TimesheetsModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  selectedProjectId?: string;
}

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60;
  if (!timeStr.toLowerCase().includes('m')) {
    const [h, m] = timeStr.split(':');
    return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
  }
  const isPM = /pm/i.test(timeStr);
  const isAM = /am/i.test(timeStr);
  const cleanStr = timeStr.replace(/(am|pm|\s)/gi, '');
  const parts = cleanStr.split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function to24HourStr(time12: string): string {
  if (!time12) return '09:00';
  if (!time12.toLowerCase().includes('m')) return time12;
  const isPM = /pm/i.test(time12);
  const cleanStr = time12.replace(/(am|pm|\s)/gi, '');
  const parts = cleanStr.split(':');
  let hh = parseInt(parts[0], 10) || 0;
  if (isPM && hh < 12) hh += 12;
  if (!isPM && hh === 12) hh = 0;
  return `${String(hh).padStart(2, '0')}:${String(parts[1] || '00').padStart(2, '0')}`;
}

function to12HourStr(time24: string): string {
  if (!time24) return '';
  if (time24.toLowerCase().includes('m')) return time24;
  const parts = time24.split(':');
  let hh = parseInt(parts[0], 10) || 0;
  const ampm = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12 || 12;
  return `${String(hh).padStart(2, '0')}:${String(parts[1] || '00').padStart(2, '0')} ${ampm}`;
}

import {
  isExecutiveOrAdmin,
  isHRPersona,
  isManagerPersona,
  getTeamEmployees,
  canApproveTimesheet,
} from '../../utils/teamAccess';

function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatHoursHM(hrs: number): string {
  const totalMinutes = Math.round((hrs || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (totalMinutes === 0) return '0h';
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatChipHours(hrs: number): string {
  const value = Math.round((hrs || 0) * 10) / 10;
  return `${Number.isInteger(value) ? value.toFixed(0) : value}h`;
}

function chipInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function avatarTone(name: string): 1 | 2 | 3 {
  const sum = [...name].reduce((total, char) => total + char.charCodeAt(0), 0);
  return ((sum % 3) + 1) as 1 | 2 | 3;
}

function isPendingStatus(status?: TimesheetEntry['status']): boolean {
  return status !== 'Approved' && status !== 'Rejected';
}

function getInitials(name: string): string {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

function getDayEventAppearance(status?: TimesheetEntry['status']) {
  switch (status) {
    case 'Approved':
      return {
        card: 'bg-[var(--studio-sage-surface)] text-[var(--text-primary)] border-[var(--border-color)]',
        badge: 'work-chip work-chip-sage border-0',
        meta: 'text-[var(--text-secondary)]',
      };
    case 'Rejected':
      return {
        card: 'bg-[var(--studio-error-surface)] text-[var(--text-primary)] border-[var(--border-color)]',
        badge: 'work-chip work-chip-error border-0',
        meta: 'text-[var(--studio-error)]',
      };
    case 'Review':
    case 'Submitted':
      return {
        card: 'bg-[var(--studio-selected)] text-[var(--text-primary)] border-[var(--studio-focus)]',
        badge: 'work-chip work-chip-navy border-0',
        meta: 'text-[var(--text-secondary)]',
      };
    default:
      return {
        card: 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-color)]',
        badge: 'work-chip work-chip-muted border-0',
        meta: 'text-[var(--text-muted)]',
      };
  }
}

export const TimesheetsModule: React.FC<TimesheetsModuleProps> = ({
  state,
  onUpdateState,
  selectedProjectId = 'All',
}) => {
  const userRole = state.currentPersona?.role;
  const isSuperAdmin = userRole === 'super_admin' || userRole === 'admin';
  const isHR = isHRPersona(state.currentPersona);
  const isManager = isManagerPersona(state.currentPersona, state.employees);
  const isAdmin = isSuperAdmin || isHR || isManager;

  const accessibleEmployees = useMemo(() => {
    return getTeamEmployees(state.currentPersona, state.employees);
  }, [state.currentPersona, state.employees]);

  const accessibleEmpIds = useMemo(
    () => new Set(accessibleEmployees.map((e) => e.id)),
    [accessibleEmployees]
  );
  const accessibleEmpNames = useMemo(
    () => new Set(accessibleEmployees.map((e) => (e.name || '').toLowerCase())),
    [accessibleEmployees]
  );

  const getTodayIso = () => localDateKey();
  const TODAY_DATE = getTodayIso();

  const mobileViewport = useMobileViewport();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [listDateScope, setListDateScope] = useState<'week' | 'all'>('week');
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'list'>('day');
  const [selectedDate, setSelectedDate] = useState<string>(TODAY_DATE);
  const requestedDate = useSearchParams().get('date');
  useEffect(() => {
    if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return;
    const parsed = new Date(requestedDate + 'T12:00:00');
    if (Number.isNaN(parsed.getTime()) || localDateKey(parsed) !== requestedDate) return;
    setSelectedDate(requestedDate);
    setViewMode('day');
  }, [requestedDate]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>(selectedProjectId);
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>(
    state.currentPersona?.id || state.employees[0]?.id || ''
  );
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };
  const apiErrorMessage = (err: unknown, fallback: string) =>
    err instanceof Error && err.message ? err.message : fallback;
  const canReviewEntry = (entry: TimesheetEntry) =>
    canApproveTimesheet(state.currentPersona, entry, state.employees, state.projects);
  const [showLogModal, setShowLogModal] = useState(false);
  const timeDrawerRef = useDrawerFocus(showLogModal, () => setShowLogModal(false));
  const [confirmRejectPeriod, setConfirmRejectPeriod] = useState(false);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<TimesheetEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [logModalTab, setLogModalTab] = useState<'task' | 'schedule'>('task');
  const [formMeetingLink, setFormMeetingLink] = useState('');
  const [showMeetingLinkInput, setShowMeetingLinkInput] = useState(false);
  const [formDate, setFormDate] = useState(TODAY_DATE);
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('11:00');
  const [formDurationHours, setFormDurationHours] = useState('2.0');
  const [formProjectId, setFormProjectId] = useState(state.projects[0]?.id || '');
  const [formTaskId, setFormTaskId] = useState(state.tasks[0]?.id || '');
  const [formCategory, setLogCategory] = useState<TimesheetEntry['category']>('Development');
  const [formBillable, setFormBillable] = useState(true);
  const [formDescription, setFormDescription] = useState('');
  const [formEmployeeId, setFormEmployeeId] = useState(state.currentPersona?.id || state.employees[0]?.id || '');
  const [formEmployeeIds, setFormEmployeeIds] = useState<string[]>([]);


  const timeGridScrollRef = useRef<HTMLDivElement>(null);
  const HOUR_HEIGHT = 44;

  useEffect(() => {
    setSelectedEmployeeFilter(state.currentPersona?.id || state.employees[0]?.id || '');
  }, [state.currentPersona?.id]);

  useEffect(() => {
    setSelectedApprovalIds([]);
  }, [selectedEmployeeFilter]);

  useEffect(() => {
    if (timeGridScrollRef.current) {
      timeGridScrollRef.current.scrollTop = 8 * HOUR_HEIGHT;
    }
  }, [viewMode]);

  // Live Timer Tick State (1s heartbeat)
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const onUpdateStateRef = useRef(onUpdateState);
  onUpdateStateRef.current = onUpdateState;
  const mergingKeysRef = useRef(new Set<string>());
  useEffect(() => {
    const plans = taskDayMergePlans(state.timesheets || []).filter(
      (plan) => isUuid(plan.keeper.id) && isUuid(plan.keeper.taskId) && plan.extras.every((entry) => isUuid(entry.id))
    );
    if (!plans.length) return;
    const key = plans
      .map((plan) => plan.keeper.id)
      .sort()
      .join('|');
    if (mergingKeysRef.current.has(key)) return;
    mergingKeysRef.current.add(key);
    let cancelled = false;
    (async () => {
      for (const plan of plans) {
        await api.projects.updateTimesheet(plan.keeper.id, {
          hoursSpent: plan.merged.hours,
          startTime: plan.merged.startTime,
          endTime: plan.merged.endTime || '',
          status: plan.merged.status === 'Draft' ? 'draft' : 'submitted',
        });
        for (const extra of plan.extras) {
          try {
            await api.projects.deleteTimesheet(extra.id);
          } catch {
            /* The extra row may already have been removed. */
          }
        }
      }
      if (cancelled) return;
      const removeIds = new Set(plans.flatMap((plan) => plan.extras.map((entry) => entry.id)));
      const replacements = new Map(plans.map((plan) => [plan.keeper.id, plan.merged]));
      onUpdateStateRef.current((prev) => ({
        ...prev,
        timesheets: (prev.timesheets || [])
          .filter((entry) => !removeIds.has(entry.id))
          .map((entry) => replacements.get(entry.id) || entry),
      }));
    })()
      .catch(() => {
        /* The calendar already draws these sessions as one block. */
      })
      .finally(() => {
        mergingKeysRef.current.delete(key);
      });
    return () => {
      cancelled = true;
    };
  }, [state.timesheets]);

  const taskForEntry = (entry: TimesheetEntry) => state.tasks.find((task) => task.id === entry.taskId);

  const isScheduleEntry = (entry: TimesheetEntry) => entry.entryType === 'schedule' || entry.category === 'Meeting';

  const isRunningEntry = (entry: TimesheetEntry) => {
    if (entry.endTime || isScheduleEntry(entry)) return false;
    const task = taskForEntry(entry);
    if (!task || normalizeTaskStatus(task.status) !== 'In Progress' || !task.isTimerRunning || !task.timerStartedAt) return false;
    if (task.openTimesheetId) return entry.id === task.openTimesheetId;
    return true;
  };

  const getEntryLiveHours = (entry: TimesheetEntry): number => {
    if (!isRunningEntry(entry)) return entry.hours || 0;
    const task = taskForEntry(entry);
    const elapsedHrs = task?.timerStartedAt ? Math.max(0, (now - task.timerStartedAt) / 3600000) : 0;
    return Number(((entry.hours || 0) + elapsedHrs).toFixed(2));
  };

  const getEntryLiveEndTime = (entry: TimesheetEntry): string => {
    if (isRunningEntry(entry)) {
      return new Date(now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    if (entry.endTime) return entry.endTime;
    const start = parseTimeToMinutes(entry.startTime || '09:00 AM');
    return formatMinutesToTime(start + Math.round((entry.hours || 0) * 60));
  };

  const showOnCalendar = (entry: TimesheetEntry) => {
    if (isScheduleEntry(entry) || isRunningEntry(entry)) return true;
    return getEntryLiveHours(entry) >= 0.25;
  };

  const allTimesheets = state.timesheets || [];

  const entryBelongsTo = (entry: TimesheetEntry, empId: string, empName?: string) =>
    entry.employeeId === empId ||
    (!!empName && (entry.employeeName || '').toLowerCase() === empName.toLowerCase());

  // Everything the viewer may see after project/status/search filters, before narrowing to one employee.
  const scopedEntries = useMemo(() => {
    return allTimesheets.filter((entry) => {
      if (isTestEntity(entry.taskTitle) || isTestEntity(entry.projectName) || isTestEntity(entry.description)) return false;
      
      // Strict role and team scoping
      if (!isSuperAdmin && !isHR) {
        if (isManager) {
          const isMyEntry =
            entry.employeeId === state.currentPersona?.id ||
            (entry.employeeName || '').toLowerCase() === (state.currentPersona?.name || '').toLowerCase();
          const isTeamEntry =
            (entry.employeeId && accessibleEmpIds.has(entry.employeeId)) ||
            (entry.employeeName && accessibleEmpNames.has(entry.employeeName.toLowerCase()));
          const isManagedProject = state.projects.some(
            (p) => p.id === entry.projectId && (p.managerId === state.currentPersona?.id || p.managerName?.toLowerCase() === state.currentPersona?.name?.toLowerCase())
          );
          if (!isMyEntry && !isTeamEntry && !isManagedProject) return false;
        } else {
          const isMyEntry =
            entry.employeeId === state.currentPersona?.id ||
            (entry.employeeName || '').toLowerCase() === (state.currentPersona?.name || '').toLowerCase();
          if (!isMyEntry) return false;
        }
      }

      if (selectedProjectFilter !== 'All') {
        if (selectedProjectFilter === 'standalone') {
          if (entry.projectId && entry.projectId !== 'standalone' && entry.projectId !== 'general') return false;
        } else {
          if (entry.projectId !== selectedProjectFilter) return false;
        }
      }
      if (statusFilter === 'Pending') {
        if (!isPendingStatus(entry.status)) return false;
      } else if (statusFilter !== 'All' && entry.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matches = [entry.taskTitle, entry.projectName, entry.description, entry.employeeName, entry.category]
          .some((value) => (value || '').toLowerCase().includes(query));
        if (!matches) return false;
      }
      return true;
    });
  }, [
    allTimesheets,
    isSuperAdmin,
    isHR,
    isManager,
    accessibleEmpIds,
    accessibleEmpNames,
    state.currentPersona,
    selectedProjectFilter,
    statusFilter,
    searchQuery,
    state.projects,
  ]);

  const selectedEmployee = useMemo(
    () => (selectedEmployeeFilter === 'All' ? null : state.employees.find((e) => e.id === selectedEmployeeFilter) || null),
    [selectedEmployeeFilter, state.employees]
  );

  const filteredEntries = useMemo(() => {
    const scoped =
      selectedEmployeeFilter === 'All'
        ? scopedEntries
        : scopedEntries.filter((entry) => entryBelongsTo(entry, selectedEmployeeFilter, selectedEmployee?.name));
    let periodEntries = scoped;
    if (viewMode === 'list' && listDateScope === 'week') {
      const monday = new Date(`${selectedDate}T00:00:00`);
      monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      const start = localDateKey(monday);
      const end = localDateKey(sunday);
      periodEntries = scoped.filter((entry) => entry.date >= start && entry.date <= end);
    }
    return combineResumedTaskEntries(periodEntries);
  }, [scopedEntries, selectedEmployeeFilter, selectedEmployee, viewMode, listDateScope, selectedDate]);

  const projectTasks = useMemo(() => {
    if (!formProjectId || formProjectId === 'standalone') {
      return state.tasks.filter((t) => !t.projectId || t.projectId === 'standalone' || t.projectId === 'general');
    }
    return state.tasks.filter((t) => t.projectId === formProjectId);
  }, [state.tasks, formProjectId]);

  const activeProjects = useMemo(() => {
    return state.projects.filter((p) => !isTestEntity(p.name));
  }, [state.projects]);

  const handlePrevDate = () => {
    const cur = new Date(`${selectedDate}T00:00:00`);
    if (viewMode === 'day') cur.setDate(cur.getDate() - 1);
    else if (viewMode === 'week') cur.setDate(cur.getDate() - 7);
    else if (viewMode === 'month') {
      const day = cur.getDate();
      cur.setDate(1);
      cur.setMonth(cur.getMonth() - 1);
      cur.setDate(Math.min(day, new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()));
    }
    else cur.setDate(cur.getDate() - 7);
    setSelectedDate(localDateKey(cur));
  };

  const handleNextDate = () => {
    const cur = new Date(`${selectedDate}T00:00:00`);
    if (viewMode === 'day') cur.setDate(cur.getDate() + 1);
    else if (viewMode === 'week') cur.setDate(cur.getDate() + 7);
    else if (viewMode === 'month') {
      const day = cur.getDate();
      cur.setDate(1);
      cur.setMonth(cur.getMonth() + 1);
      cur.setDate(Math.min(day, new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()));
    }
    else cur.setDate(cur.getDate() + 7);
    setSelectedDate(localDateKey(cur));
  };

  const handleToday = () => {
    setSelectedDate(TODAY_DATE);
  };

  const headerDateTitle = useMemo(() => {
    const dateObj = new Date(`${selectedDate}T00:00:00`);
    if (viewMode === 'day') return dateObj.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if (viewMode === 'week' || (viewMode === 'list' && listDateScope === 'week')) {
      const dayOfWeek = dateObj.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mon = new Date(dateObj);
      mon.setDate(dateObj.getDate() + mondayOffset);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return `${mon.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${sun.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (viewMode === 'month') return dateObj.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    return dateObj.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }, [selectedDate, viewMode, listDateScope]);

  const weekDays = useMemo(() => {
    const dateObj = new Date(`${selectedDate}T00:00:00`);
    const dayOfWeek = dateObj.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const days = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(dateObj);
      d.setDate(dateObj.getDate() + mondayOffset + i);
      const iso = localDateKey(d);
      const dayTotal = filteredEntries.filter((e) => e.date === iso).reduce((sum, e) => sum + getEntryLiveHours(e), 0);
      days.push({ dateStr: iso, dayName: dayNames[i], dayNum: d.getDate(), isToday: iso === TODAY_DATE, totalHours: dayTotal });
    }
    return days;
  }, [selectedDate, filteredEntries, TODAY_DATE, now, state.tasks]);

  const monthDays = useMemo(() => {
    const dateObj = new Date(`${selectedDate}T00:00:00`);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    const offset = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;
    const days = [];
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - offset);
    const cellCount = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7) * 7;
    for (let i = 0; i < cellCount; i++) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + i);
      const iso = localDateKey(current);
      const isCurrentMonth = current.getMonth() === month;
      const dayEntries = filteredEntries.filter((e) => e.date === iso);
      const totalHours = dayEntries.reduce((sum, e) => sum + getEntryLiveHours(e), 0);
      days.push({ dateStr: iso, dayNum: current.getDate(), isCurrentMonth, isToday: iso === TODAY_DATE, entries: dayEntries, totalHours });
    }
    return days;
  }, [selectedDate, filteredEntries, TODAY_DATE, now, state.tasks]);

  const periodRange = useMemo<{ start: string; end: string } | null>(() => {
    if (viewMode === 'day') return { start: selectedDate, end: selectedDate };
    if (viewMode === 'week' || (viewMode === 'list' && listDateScope === 'week')) {
      return { start: weekDays[0].dateStr, end: weekDays[6].dateStr };
    }
    if (viewMode === 'month') {
      const ym = selectedDate.slice(0, 7);
      return { start: `${ym}-01`, end: `${ym}-31` };
    }
    return null;
  }, [viewMode, selectedDate, weekDays, listDateScope]);

  const periodLabel = viewMode === 'list' && listDateScope === 'all' ? 'all time' : headerDateTitle;

  const inPeriod = (entry: TimesheetEntry) =>
    !periodRange || (entry.date >= periodRange.start && entry.date <= periodRange.end);

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [peopleMenuOpen, setPeopleMenuOpen] = useState(false);
  const peopleMenuRef = useRef<HTMLDivElement>(null);

  const employeeSummaries = useMemo(() => {
    const q = employeeSearch.trim().toLowerCase();
    return accessibleEmployees
      .filter((emp) => !isTestEntity(emp.name))
      .filter(
        (emp) =>
          !q ||
          [emp.name, emp.designation, emp.department, emp.email]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
      )
      .map((emp) => {
        const entries = scopedEntries.filter((e) => inPeriod(e) && entryBelongsTo(e, emp.id, emp.name));
        return {
          emp,
          hours: entries.reduce((sum, e) => sum + getEntryLiveHours(e), 0),
          pending: entries.filter((e) => isPendingStatus(e.status)).length,
          count: entries.length,
        };
      })
      .sort((a, b) => b.pending - a.pending || b.hours - a.hours || a.emp.name.localeCompare(b.emp.name));
  }, [accessibleEmployees, employeeSearch, scopedEntries, periodRange, now, state.tasks]);

  const { shownPeople, morePeople } = useMemo(() => {
    const limit = 4;
    const selectedIndex = employeeSummaries.findIndex((row) => row.emp.id === selectedEmployeeFilter);
    if (selectedIndex < limit) {
      return { shownPeople: employeeSummaries.slice(0, limit), morePeople: employeeSummaries.slice(limit) };
    }
    const selected = employeeSummaries[selectedIndex];
    const rest = employeeSummaries.filter((row) => row.emp.id !== selected.emp.id);
    const shownPeople = [selected, ...rest.slice(0, limit - 1)];
    const shownIds = new Set(shownPeople.map((row) => row.emp.id));
    return { shownPeople, morePeople: employeeSummaries.filter((row) => !shownIds.has(row.emp.id)) };
  }, [employeeSummaries, selectedEmployeeFilter]);

  useEffect(() => {
    if (!peopleMenuOpen) return;
    const close = (event: MouseEvent) => {
      if (!peopleMenuRef.current?.contains(event.target as Node)) setPeopleMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPeopleMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [peopleMenuOpen]);

  const reviewablePeriodEntries = useMemo(
    () =>
      filteredEntries.filter(
        (e) =>
          inPeriod(e) &&
          isPendingStatus(e.status) &&
          !e.id.startsWith('ts_live_') &&
          canReviewEntry(e)
      ),
    [filteredEntries, periodRange, state.currentPersona, state.employees, state.projects]
  );

  const approvalDisabledReason = useMemo(() => {
    if (!selectedEmployee || reviewablePeriodEntries.length > 0) return '';
    const pending = filteredEntries.filter(
      (e) => inPeriod(e) && isPendingStatus(e.status) && !e.id.startsWith('ts_live_')
    );
    if (pending.length === 0) return 'No pending entries in this period.';
    const onlyOwn = pending.every(
      (e) =>
        e.employeeId === state.currentPersona?.id ||
        (e.employeeName || '').toLowerCase() === (state.currentPersona?.name || '').toLowerCase()
    );
    if (onlyOwn) return 'You cannot approve your own timesheets.';
    return 'You can only approve timesheets for your team or projects you manage.';
  }, [selectedEmployee, reviewablePeriodEntries.length, filteredEntries, periodRange, state.currentPersona]);

  const handleApproveEmployeePeriod = async () => {
    const entries = reviewablePeriodEntries;
    if (entries.length === 0) return;
    const ids = entries.map((e) => e.id);
    setIsSaving(true);
    try {
      await api.projects.bulkUpdateTimesheets({ timesheetIds: ids, status: 'Approved', approvedBy: state.currentPersona.name });
      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.map((t) => (ids.includes(t.id) ? { ...t, status: 'Approved', approvedBy: prev.currentPersona.name } : t)),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'APPROVED_EMPLOYEE_TIMESHEETS',
            entity: 'TimesheetEntry',
            entityId: selectedEmployee?.id || 'team',
            ipAddress: '106.51.72.18',
            details: `Approved ${ids.length} timesheets for ${selectedEmployee?.name || 'selected people'} (${periodLabel})`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Approved ${ids.length} entries for ${selectedEmployee?.name || 'selected people'}`);
    } catch (err) {
      console.error('Failed to approve employee timesheets', err);
      showToast(apiErrorMessage(err, 'Failed to approve timesheets.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectEmployeePeriod = () => {
    const entries = reviewablePeriodEntries;
    if (entries.length === 0) return;
    setConfirmRejectPeriod(true);
  };

  const confirmRejectEmployeePeriod = async () => {
    const entries = reviewablePeriodEntries;
    if (entries.length === 0) return;
    const ids = entries.map((e) => e.id);
    setIsSaving(true);
    try {
      await api.projects.bulkUpdateTimesheets({ timesheetIds: ids, status: 'Rejected', approvedBy: state.currentPersona.name });
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((task) => {
          const deductHours = entries.filter((e) => e.taskId === task.id).reduce((sum, e) => sum + (e.hours || 0), 0);
          if (!deductHours) return task;
          const newSeconds = Math.max(0, (task.timeSpentSeconds || 0) - Math.round(deductHours * 3600));
          return { ...task, timeSpentSeconds: newSeconds, actualHours: Number((newSeconds / 3600).toFixed(2)) };
        }),
        timesheets: prev.timesheets.map((t) =>
          ids.includes(t.id) ? { ...t, status: 'Rejected' as const, approvedBy: prev.currentPersona.name } : t
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'REJECTED_EMPLOYEE_TIMESHEETS',
            entity: 'TimesheetEntry',
            entityId: selectedEmployee?.id || 'team',
            ipAddress: '106.51.72.18',
            details: `Rejected ${ids.length} timesheets for ${selectedEmployee?.name || 'selected people'} (${periodLabel})`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Rejected ${ids.length} entries for ${selectedEmployee?.name || 'selected people'}`);
      setConfirmRejectPeriod(false);
    } catch (err) {
      console.error('Failed to reject employee timesheets', err);
      showToast(apiErrorMessage(err, 'Failed to reject timesheets.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenLogModal = (dateStr?: string, hourNum?: number, tab: 'task' | 'schedule' = 'task') => {
    const targetDate = dateStr || selectedDate || TODAY_DATE;
    setFormDate(targetDate);
    const startH = hourNum !== undefined ? hourNum : 9;
    const startStr = `${String(startH).padStart(2, '0')}:00`;
    const endStr = `${String(Math.min(23, startH + 1)).padStart(2, '0')}:00`;
    setFormStartTime(startStr);
    setFormEndTime(endStr);
    setFormDurationHours('1.0');
    setFormTitle('');
    setLogModalTab(tab);
    setFormMeetingLink('');
    setShowMeetingLinkInput(false);
    setFormProjectId(state.projects[0]?.id || 'standalone');
    setFormTaskId('');
    setLogCategory(tab === 'schedule' ? 'Meeting' : 'Development');
    setFormBillable(true);
    setFormDescription('');
    const defaultEmp =
      isAdmin && selectedEmployeeFilter !== 'All'
        ? selectedEmployeeFilter
        : state.currentPersona?.id || state.employees[0]?.id || '';
    setFormEmployeeId(defaultEmp);
    setFormEmployeeIds(tab === 'schedule' && isAdmin ? (defaultEmp ? [defaultEmp] : []) : defaultEmp ? [defaultEmp] : []);
    setEditingEntryId(null);
    setShowLogModal(true);
  };

  const handleEditEntry = (entry: TimesheetEntry) => {
    setEditingEntryId(entry.id);
    setFormTitle(entry.taskTitle);
    setFormDate(entry.date || TODAY_DATE);
    setFormStartTime(to24HourStr(entry.startTime || '09:00'));
    setFormEndTime(to24HourStr(entry.endTime || formatMinutesToTime(parseTimeToMinutes(entry.startTime || '09:00') + Math.round(entry.hours * 60))));
    setFormDurationHours(String(entry.hours || 1.0));
    setFormProjectId(entry.projectId || 'standalone');
    setFormTaskId(entry.taskId || '');
    setLogCategory(entry.category || 'Development');
    setFormBillable(entry.billable ?? true);
    setFormDescription(entry.description || '');
    setFormEmployeeId(entry.employeeId || state.currentPersona?.id || state.employees[0]?.id || '');
    setFormEmployeeIds(entry.employeeId ? [entry.employeeId] : []);
    const isSchedule = entry.entryType === 'schedule' || entry.category === 'Meeting';
    setLogModalTab(isSchedule ? 'schedule' : 'task');
    setFormMeetingLink(entry.meetingLink || '');
    setShowMeetingLinkInput(Boolean(entry.meetingLink));
    setShowLogModal(true);
  };

  const handleTimeChange = (startStr: string, endStr: string) => {
    setFormStartTime(startStr);
    setFormEndTime(endStr);
    const startMins = parseTimeToMinutes(startStr);
    let endMins = parseTimeToMinutes(endStr);
    if (endMins <= startMins) endMins += 24 * 60;
    setFormDurationHours(String(Number(((endMins - startMins) / 60).toFixed(2))));
  };

  const handleSaveTimesheet = async (e: React.FormEvent) => {
    e.preventDefault();
    const isSchedule = logModalTab === 'schedule';
    if (!isSchedule && formDate > TODAY_DATE) {
      showToast("Cannot log time for future dates!");
      return;
    }
    const proj = state.projects.find((p) => p.id === formProjectId);
    const assignablePeople = accessibleEmployees.filter((emp) => !isTestEntity(emp.name));
    const selectedIds = isSchedule && isAdmin && !editingEntryId
      ? [...new Set(formEmployeeIds.filter(Boolean))]
      : [formEmployeeId].filter(Boolean);
    if (isSchedule && isAdmin && !editingEntryId && selectedIds.length === 0) {
      showToast('Select at least one person for this meeting.');
      return;
    }
    const emp =
      state.employees.find((e) => e.id === (selectedIds[0] || formEmployeeId)) ||
      state.employees.find(
        (e) =>
          e.id === state.currentPersona.id ||
          (e.email && e.email.toLowerCase() === state.currentPersona.email?.toLowerCase())
      ) ||
      state.employees[0] ||
      state.currentPersona;
    const task = state.tasks.find((t) => t.id === formTaskId);
    const title = formTitle.trim() || task?.title || (isSchedule ? 'Scheduled Activity' : 'General Deliverable');
    const projectName = proj?.name || (formProjectId === 'standalone' ? 'General' : 'General');
    const hoursNum = parseFloat(formDurationHours) || 1.0;
    const entryType: 'task' | 'schedule' = isSchedule ? 'schedule' : 'task';
    const category = isSchedule ? ('Meeting' as const) : formCategory;
    const meetingLink = isSchedule && showMeetingLinkInput ? formMeetingLink.trim() : '';

    const isPast = formDate < TODAY_DATE;
    const isFuture = formDate > TODAY_DATE;
    const ownerRole = String(
      (emp as { role?: string }).role ||
        (emp.id === state.currentPersona.id ? state.currentPersona.role : '') ||
        ''
    ).toLowerCase();
    const saveStatus =
      !isSchedule && ownerRole === 'super_admin'
        ? 'Approved'
        : isSchedule
          ? isFuture
            ? 'Submitted'
            : isPast
              ? 'Pending Regularization'
              : 'Submitted'
          : isPast
            ? 'Pending Regularization'
            : 'Submitted';

    const matchedTaskId = formTaskId || state.tasks.find((t) => t.title.toLowerCase() === title.toLowerCase())?.id;

    if (editingEntryId) {
      setIsSaving(true);
      try {
        await api.projects.updateTimesheet(editingEntryId, {
          hoursSpent: hoursNum,
          description: formDescription.trim() || title,
          workDate: formDate,
          entryType,
          title,
          startTime: to12HourStr(formStartTime),
          endTime: to12HourStr(formEndTime),
          category,
          meetingLink: meetingLink || undefined,
          billable: formBillable,
          status: saveStatus === 'Pending Regularization' ? 'submitted' : saveStatus.toLowerCase(),
        });
        
        onUpdateState((prev) => {
          const oldEntry = prev.timesheets.find((t) => t.id === editingEntryId);
          const hoursDiff = hoursNum - (oldEntry?.hours || 0);
          return {
            ...prev,
            timesheets: prev.timesheets.map((t) =>
              t.id === editingEntryId
                ? {
                    ...t,
                    taskTitle: title,
                    projectId: formProjectId,
                    projectName,
                    taskId: matchedTaskId || formTaskId,
                    date: formDate,
                    startTime: to12HourStr(formStartTime),
                    endTime: to12HourStr(formEndTime),
                    hours: hoursNum,
                    category,
                    billable: formBillable,
                    description: formDescription.trim(),
                    employeeId: emp.id,
                    employeeName: emp.name,
                    status: t.status === 'Approved' ? 'Approved' : saveStatus,
                    entryType,
                    meetingLink: meetingLink || undefined,
                  }
                : t
            ),
            projects: prev.projects.map((p) => {
              if (p.id === formProjectId) {
                const newHrs = Math.max(0, Number(((p.loggedWorkHours || 0) + hoursDiff).toFixed(2)));
                return {
                  ...p,
                  loggedWorkHours: newHrs,
                  progress: p.totalWorkHours ? Math.min(100, Math.round((newHrs / p.totalWorkHours) * 100)) : p.progress,
                };
              }
              return p;
            }),
            auditLogs: [
              {
                id: `log_${Date.now()}`,
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                user: prev.currentPersona.name,
                action: isSchedule ? 'UPDATED_SCHEDULE' : 'UPDATED_TIMESHEET',
                entity: 'TimesheetEntry',
                entityId: editingEntryId,
                ipAddress: '106.51.72.18',
                details: `Updated ${isSchedule ? 'schedule' : 'logged time'} for "${title}" (${hoursNum}h on ${formDate})`,
              },
              ...prev.auditLogs,
            ],
          };
        });
        showToast(isSchedule ? `Updated schedule "${title}"` : `Updated log for "${title}"`);
      } catch (err) {
        console.error('Failed to update timesheet', err);
        alert('Failed to update timesheet.');
      } finally {
        setIsSaving(false);
      }
    } else {
      const finalTaskId = isSchedule ? '' : matchedTaskId || formTaskId;

      setIsSaving(true);
      try {
      const people = selectedIds.length
        ? selectedIds.map((id) => assignablePeople.find((e) => e.id === id) || state.employees.find((e) => e.id === id)).filter(Boolean) as { id: string; name: string }[]
        : [{ id: emp.id, name: emp.name }];
      const resTs = await api.projects.logTimesheet({
        projectId: formProjectId === 'standalone' ? '' : formProjectId,
        taskId: finalTaskId || undefined,
        employeeId: people.length === 1 ? people[0].id : undefined,
        employeeIds: people.length > 1 ? people.map((p) => p.id) : undefined,
        workDate: formDate,
        hoursSpent: hoursNum,
        description: formDescription.trim() || title,
        entryType,
        title,
        startTime: to12HourStr(formStartTime),
        endTime: to12HourStr(formEndTime),
        category,
        meetingLink: meetingLink || undefined,
        billable: formBillable,
      });

      if (!resTs.success && resTs.error) {
        showToast(resTs.error.message || 'Failed to log timesheet');
        return;
      }

      const createdRows = Array.isArray(resTs.data) ? resTs.data : resTs.data ? [resTs.data] : [];
      const newEntries: TimesheetEntry[] = (createdRows.length ? createdRows : people).map((row: any, index: number) => {
        const person = people[index] || people.find((p) => p.id === String(row.employee_id || row.employeeId)) || people[0];
        return {
          id: String(row.id || `ts_${Date.now()}_${index}`),
          employeeId: String(row.employee_id || row.employeeId || person.id),
          employeeName: String(row.employee_name || row.employeeName || person.name),
          projectId: formProjectId,
          projectName,
          taskId: finalTaskId || '',
          taskTitle: title,
          date: formDate,
          startTime: to12HourStr(formStartTime),
          endTime: to12HourStr(formEndTime),
          hours: hoursNum,
          billable: formBillable,
          category,
          description: formDescription.trim() || (isSchedule ? 'Scheduled activity' : 'Work deliverable completed as scheduled.'),
          status: saveStatus,
          entryType,
          meetingLink: meetingLink || undefined,
        };
      });

      onUpdateState((prev) => ({
        ...prev,
        timesheets: [...newEntries, ...prev.timesheets],
        projects: prev.projects.map((p) => {
          if (p.id === formProjectId) {
            const newHrs = Number(((p.loggedWorkHours || 0) + hoursNum * newEntries.length).toFixed(2));
            return {
              ...p,
              loggedWorkHours: newHrs,
              progress: p.totalWorkHours ? Math.min(100, Math.round((newHrs / p.totalWorkHours) * 100)) : p.progress,
            };
          }
          return p;
        }),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: isSchedule ? 'SCHEDULED_ACTIVITY' : 'LOGGED_TIME',
            entity: 'TimesheetEntry',
            entityId: newEntries[0]?.id || 'batch',
            ipAddress: '106.51.72.18',
            details: isSchedule
              ? `Scheduled "${title}" for ${newEntries.length} people (${to12HourStr(formStartTime)}–${to12HourStr(formEndTime)} on ${formDate})`
              : `Logged ${hoursNum}h on "${title}" (${projectName})`,
          },
          ...prev.auditLogs,
        ],
      }));

        showToast(
          isSchedule
            ? newEntries.length > 1
              ? `Assigned "${title}" to ${newEntries.length} people`
              : `Scheduled "${title}"`
            : `Logged ${hoursNum}h on "${title}"`
        );
      } catch (err) {
        console.error('Failed to save timesheet', err);
        showToast(apiErrorMessage(err, 'Failed to save timesheet.'));
      } finally {
        setIsSaving(false);
      }
    }
    setSelectedDate(formDate);
    if (selectedEmployeeFilter !== emp.id) {
      setSelectedEmployeeFilter(emp.id);
    }
    if (selectedProjectFilter !== 'All' && formProjectId && selectedProjectFilter !== formProjectId) {
      setSelectedProjectFilter('All');
    }
    setShowLogModal(false);
    setEditingEntryId(null);
    setFormMeetingLink('');
    setShowMeetingLinkInput(false);
    setLogModalTab('task');
  };

  const handleDeleteEntry = (entryId: string) => {
    const entry = state.timesheets.find((t) => t.id === entryId);
    if (!entry) return;
    setPendingDeleteEntry(entry);
  };

  const confirmDeleteEntry = async () => {
    const entry = pendingDeleteEntry;
    if (!entry) return;
    const entryId = entry.id;

    setIsSaving(true);
    try {
      await api.projects.deleteTimesheet(entryId);

      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.filter((t) => t.id !== entryId),
        projects: prev.projects.map((p) => {
          if (p.id === entry.projectId) {
            const newHrs = Math.max(0, Number(((p.loggedWorkHours || 0) - entry.hours).toFixed(2)));
            return {
              ...p,
              loggedWorkHours: newHrs,
              progress: p.totalWorkHours ? Math.min(100, Math.round((newHrs / p.totalWorkHours) * 100)) : p.progress,
            };
          }
          return p;
        }),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'DELETED_TIMESHEET',
            entity: 'TimesheetEntry',
            entityId: entryId,
            ipAddress: '106.51.72.18',
            details: `Deleted timesheet entry "${entry.taskTitle}" (${entry.hours}h)`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Deleted "${entry.taskTitle}"`);
      setShowLogModal(false);
      setEditingEntryId(null);
      setPendingDeleteEntry(null);
    } catch (err) {
      console.error('Failed to delete timesheet', err);
      alert('Failed to delete timesheet.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchApprove = async () => {
    const ids = selectedApprovalIds.filter((id) => {
      const entry = state.timesheets.find((t) => t.id === id);
      return entry && isPendingStatus(entry.status) && canReviewEntry(entry);
    });
    if (ids.length === 0) {
      showToast('None of the selected entries can be approved by you.');
      return;
    }
    setIsSaving(true);
    try {
      await api.projects.bulkUpdateTimesheets({
        timesheetIds: ids,
        status: 'Approved',
        approvedBy: state.currentPersona.name
      });
      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.map((t) => ids.includes(t.id) ? { ...t, status: 'Approved', approvedBy: prev.currentPersona.name } : t),
        auditLogs: [{ id: `log_${Date.now()}`, timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19), user: prev.currentPersona.name, action: 'APPROVED_TIMESHEETS_BATCH', entity: 'TimesheetEntry', entityId: 'batch', ipAddress: '106.51.72.18', details: `Approved ${ids.length} timesheet records` }, ...prev.auditLogs],
      }));
      showToast(`Approved ${ids.length} timesheets`);
      setSelectedApprovalIds([]);
    } catch (e) {
      console.error('Failed to batch approve timesheets', e);
      showToast(apiErrorMessage(e, 'Failed to batch approve timesheets.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchReject = async () => {
    const rejectingEntries = state.timesheets.filter(
      (t) => selectedApprovalIds.includes(t.id) && isPendingStatus(t.status) && canReviewEntry(t)
    );
    if (rejectingEntries.length === 0) {
      showToast('None of the selected entries can be rejected by you.');
      return;
    }
    const selectedIds = rejectingEntries.map((t) => t.id);

    setIsSaving(true);
    try {
      await api.projects.bulkUpdateTimesheets({
        timesheetIds: selectedIds,
        status: 'Rejected',
        approvedBy: state.currentPersona.name
      });
      onUpdateState((prev) => {
        const updatedTasks = prev.tasks.map((task) => {
          const entry = rejectingEntries.find((e) => e.taskId === task.id);
          if (!entry) return task;
          const hoursToDeduct = entry.hours || 0;
          const secondsToDeduct = Math.round(hoursToDeduct * 3600);
          const newSeconds = Math.max(0, (task.timeSpentSeconds || 0) - secondsToDeduct);
          return {
            ...task,
            timeSpentSeconds: newSeconds,
            actualHours: Number((newSeconds / 3600).toFixed(2)),
          };
        });

        return {
          ...prev,
          tasks: updatedTasks,
          timesheets: prev.timesheets.map((t) =>
            selectedIds.includes(t.id)
              ? { ...t, status: 'Rejected' as const, approvedBy: prev.currentPersona.name }
              : t
          ),
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'REJECTED_TIMESHEETS_BATCH',
              entity: 'TimesheetEntry',
              entityId: 'batch',
              ipAddress: '106.51.72.18',
              details: `Rejected ${selectedIds.length} timesheet records, deducting hours from tasks`,
            },
            ...prev.auditLogs,
          ],
        };
      });
      showToast(`Rejected ${selectedIds.length} timesheets`);
      setSelectedApprovalIds([]);
    } catch (e) {
      console.error('Failed to batch reject timesheets', e);
      showToast(apiErrorMessage(e, 'Failed to batch reject timesheets.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveSingle = async (entry: TimesheetEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsSaving(true);
    try {
      await api.projects.updateTimesheet(entry.id, { status: 'Approved', approvedBy: state.currentPersona.name });
      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.map((t) => (t.id === entry.id ? { ...t, status: 'Approved', approvedBy: prev.currentPersona.name } : t)),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'APPROVED_TIMESHEET',
            entity: 'TimesheetEntry',
            entityId: entry.id,
            ipAddress: '106.51.72.18',
            details: `Approved timesheet for "${entry.taskTitle}" (${entry.hours}h)`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Approved "${entry.taskTitle}"`);
    } catch (err) {
      console.error('Failed to approve timesheet', err);
      showToast(apiErrorMessage(err, 'Failed to approve timesheet.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectSingle = async (entry: TimesheetEntry, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsSaving(true);
    try {
      await api.projects.updateTimesheet(entry.id, { status: 'Rejected', approvedBy: state.currentPersona.name });
      onUpdateState((prev) => {
        const updatedTasks = prev.tasks.map((task) => {
          if (task.id !== entry.taskId) return task;
          const hoursToDeduct = entry.hours || 0;
          const secondsToDeduct = Math.round(hoursToDeduct * 3600);
          const newSeconds = Math.max(0, (task.timeSpentSeconds || 0) - secondsToDeduct);
          return {
            ...task,
            timeSpentSeconds: newSeconds,
            actualHours: Number((newSeconds / 3600).toFixed(2)),
          };
        });

        return {
          ...prev,
          tasks: updatedTasks,
          timesheets: prev.timesheets.map((t) =>
            t.id === entry.id ? { ...t, status: 'Rejected' as const, approvedBy: prev.currentPersona.name } : t
          ),
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'REJECTED_TIMESHEET',
              entity: 'TimesheetEntry',
              entityId: entry.id,
              ipAddress: '106.51.72.18',
              details: `Rejected timesheet entry for "${entry.taskTitle}" and deducted hours from task`,
            },
            ...prev.auditLogs,
          ],
        };
      });
      showToast(`Rejected "${entry.taskTitle}"`);
    } catch (err) {
      console.error('Failed to reject timesheet', err);
      showToast(apiErrorMessage(err, 'Failed to reject timesheet.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveDay = async (date: string) => {
    const dayEntries = filteredEntries.filter(
      (e) => e.date === date && isPendingStatus(e.status) && canReviewEntry(e)
    );
    if (dayEntries.length === 0) {
      showToast('No pending entries on this day that you can approve.');
      return;
    }
    const ids = dayEntries.map((e) => e.id);

    setIsSaving(true);
    try {
      await api.projects.bulkUpdateTimesheets({
        timesheetIds: ids,
        status: 'Approved',
        approvedBy: state.currentPersona.name
      });
      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.map((t) => ids.includes(t.id) ? { ...t, status: 'Approved', approvedBy: prev.currentPersona.name } : t),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'APPROVED_DAY_TIMESHEETS',
            entity: 'TimesheetEntry',
            entityId: date,
            ipAddress: '106.51.72.18',
            details: `Approved all ${dayEntries.length} timesheets for ${date}`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Approved all ${dayEntries.length} timesheets for ${date}`);
    } catch (err) {
      console.error('Failed to approve day timesheets', err);
      showToast(apiErrorMessage(err, 'Failed to approve day timesheets.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectDay = async (date: string) => {
    const dayEntries = filteredEntries.filter(
      (e) => e.date === date && isPendingStatus(e.status) && canReviewEntry(e)
    );
    if (dayEntries.length === 0) {
      showToast('No pending entries on this day that you can reject.');
      return;
    }
    const ids = dayEntries.map((e) => e.id);

    setIsSaving(true);
    try {
      await api.projects.bulkUpdateTimesheets({
        timesheetIds: ids,
        status: 'Rejected',
        approvedBy: state.currentPersona.name
      });
      onUpdateState((prev) => {
        const updatedTasks = prev.tasks.map((task) => {
          const entry = dayEntries.find((e) => e.taskId === task.id);
          if (!entry) return task;
          const hoursToDeduct = entry.hours || 0;
          const secondsToDeduct = Math.round(hoursToDeduct * 3600);
          const newSeconds = Math.max(0, (task.timeSpentSeconds || 0) - secondsToDeduct);
          return {
            ...task,
            timeSpentSeconds: newSeconds,
            actualHours: Number((newSeconds / 3600).toFixed(2)),
          };
        });

        return {
          ...prev,
          tasks: updatedTasks,
          timesheets: prev.timesheets.map((t) =>
            ids.includes(t.id) ? { ...t, status: 'Rejected' as const, approvedBy: prev.currentPersona.name } : t
          ),
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'REJECTED_DAY_TIMESHEETS',
              entity: 'TimesheetEntry',
              entityId: date,
              ipAddress: '106.51.72.18',
              details: `Rejected all ${dayEntries.length} timesheets for ${date}`,
            },
            ...prev.auditLogs,
          ],
        };
      });
      showToast(`Rejected all ${dayEntries.length} timesheets for ${date}`);
    } catch (err) {
      console.error('Failed to reject day timesheets', err);
      showToast(apiErrorMessage(err, 'Failed to reject day timesheets.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Employee', 'Project', 'Task Title', 'Start Time', 'End Time', 'Hours', 'Billable', 'Category', 'Status', 'Description'];
    const rows = filteredEntries.map((e) => [e.date, `"${e.employeeName}"`, `"${e.projectName}"`, `"${e.taskTitle}"`, e.startTime || '', e.endTime || '', e.hours, e.billable ? 'Yes' : 'No', e.category || 'Development', e.status, `"${(e.description || '').replace(/"/g, '""')}"`]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Timesheets_Export_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const timeHours = useMemo(() => {
    const list = [];
    for (let h = 0; h < 24; h++) {
      const displayH = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      list.push({ hour: h, label: displayH });
    }
    return list;
  }, []);

  const todayDayEntries = useMemo(() => filteredEntries.filter((e) => e.date === selectedDate), [filteredEntries, selectedDate]);
  const todayDayReviewable = useMemo(
    () => todayDayEntries.filter((e) => isPendingStatus(e.status) && canReviewEntry(e)),
    [todayDayEntries, state.currentPersona, state.employees, state.projects]
  );
  const todayDayTotalHours = useMemo(() => todayDayEntries.reduce((sum, e) => sum + getEntryLiveHours(e), 0), [todayDayEntries, now, state.tasks]);
  const mobileEntryCount = filteredEntries.filter(entry => viewMode === 'list' || viewMode === 'week' || entry.date === selectedDate).length;
  const currentTimeMinutes = useMemo(() => {
    const clock = new Date(now);
    return clock.getHours() * 60 + clock.getMinutes();
  }, [now]);

  const blockRange = (entry: TimesheetEntry) => {
    const startMins = parseTimeToMinutes(entry.startTime || '09:00 AM');
    if (isRunningEntry(entry)) {
      return { startMins, endMins: Math.max(startMins + 1, currentTimeMinutes) };
    }
    if (entry.endTime) {
      let endMins = parseTimeToMinutes(entry.endTime);
      if (endMins <= startMins) endMins = startMins + Math.max(15, Math.round((entry.hours || 0) * 60));
      return { startMins, endMins };
    }
    return { startMins, endMins: startMins + Math.max(1, Math.round(getEntryLiveHours(entry) * 60)) };
  };

  return (
    <div className={`work-page timesheets-page ${styles.page}`} data-mobile-filters={mobileFiltersOpen}>
      {toastMessage && (
        <div className="fixed top-6 right-6 z-70 bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-1 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="work-head">
        <h1 className="work-title"><span className="work-desktop-label">Log hours</span><span className="work-mobile-label">Timesheets</span></h1>
        <div className="work-actions">
          {isAdmin && <button type="button" onClick={() => handleOpenLogModal(selectedDate, undefined, 'schedule')} className="work-btn-secondary work-schedule-action">Schedule people</button>}
          <button type="button" onClick={() => handleOpenLogModal(selectedDate)} className="work-btn-primary">Log time</button>
        </div>
      </div>
      <div className="work-time-toolbar" role="region" aria-label="Timesheet controls">
        <div className="work-time-navigation">
          <div className="work-date-step">
            <button type="button" onClick={handleToday}>Today</button>
            <button type="button" onClick={handlePrevDate} aria-label="Previous period"><ChevronLeft size={16} aria-hidden="true" /></button>
            <button type="button" onClick={handleNextDate} aria-label="Next period"><ChevronRight size={16} aria-hidden="true" /></button>
          </div>
          <h2 className="work-period-title" title={headerDateTitle}>{headerDateTitle}</h2>
        </div>
        <div className="work-time-controls">
          <ResponsiveFilters expanded={mobileViewport ? mobileFiltersOpen : undefined} active={Boolean(searchQuery || selectedProjectFilter !== 'All' || statusFilter !== 'All')}>
            <label className="work-log-search">
              <Search size={14} aria-hidden="true" />
              <input type="search" placeholder="Search logs" aria-label="Search logs" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="work-field" />
            </label>
            <select value={selectedProjectFilter} onChange={(event) => setSelectedProjectFilter(event.target.value)} className="work-field work-time-project-filter" aria-label="Filter by project">
              <option value="All">All projects</option><option value="standalone">General / Standalone</option>
              {activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="work-field work-time-status-filter" aria-label="Filter by status">
              <option value="All">All statuses</option><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option>
            </select>
            {viewMode === 'list' && <select className="work-field work-time-range-filter" aria-label="List date range" value={listDateScope} onChange={(event) => setListDateScope(event.target.value as 'week' | 'all')}><option value="week">Selected week</option><option value="all">All dates</option></select>}
            <button type="button" className="mobile-filter-today" onClick={handleToday}>Go to today</button>
          </ResponsiveFilters>
          <div className={styles.viewRow}><div className="work-seg work-time-views" role="group" aria-label="Timesheet view">
            {(['day', 'week', 'month', 'list'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => setViewMode(mode)} className={viewMode === mode ? 'is-on' : ''} aria-pressed={viewMode === mode}>{mode}</button>
            ))}
          </div>{mobileViewport && <button type="button" className={styles.filterButton} aria-label="Timesheet filters" aria-expanded={mobileFiltersOpen} onClick={()=>setMobileFiltersOpen(open=>!open)}>Filters</button>}</div>
        </div>
      </div>
      {isAdmin && (
        <div className="work-time-people">
          <h3>Team timesheets</h3>
          <select className="work-field work-mobile-employee" aria-label="Select employee" value={selectedEmployeeFilter} onChange={(event) => setSelectedEmployeeFilter(event.target.value)}>
            <option value="All">All people</option>
            {employeeSummaries.map(({emp}) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <div className="work-people-strip" role="group" aria-label="Select employee">
            <button type="button" className={`work-person work-person-all ${selectedEmployeeFilter === 'All' ? 'is-on' : ''}`} onClick={() => setSelectedEmployeeFilter('All')} aria-pressed={selectedEmployeeFilter === 'All'}>All</button>
            {shownPeople.map(({ emp, hours, pending }) => {
              const selected = selectedEmployeeFilter === emp.id;
              return (
                <button key={emp.id} type="button" className={`work-person ${selected ? 'is-on' : ''}`} data-avatar={avatarTone(emp.name)} onClick={() => setSelectedEmployeeFilter(emp.id)} aria-pressed={selected}>
                  <span className="work-person-mark" aria-hidden="true">{chipInitials(emp.name)}</span>
                  <span className="work-person-copy">
                    <span>{emp.name}</span>
                    {selected && <small>{formatChipHours(hours)}{pending ? ` • ${pending} pending` : ''}</small>}
                  </span>
                </button>
              );
            })}
            {employeeSummaries.length === 0 && <p className="work-people-empty">No people match</p>}
          </div>
          {morePeople.length > 0 && (
            <div className="work-people-more" ref={peopleMenuRef}>
              <button type="button" aria-expanded={peopleMenuOpen} aria-haspopup="listbox" onClick={() => setPeopleMenuOpen((open) => !open)}>+{morePeople.length}</button>
              {peopleMenuOpen && (
                <div className="work-people-more-list" role="listbox" aria-label="More people">
                  {morePeople.map(({ emp, hours, pending }) => (
                    <button key={emp.id} type="button" role="option" aria-selected={selectedEmployeeFilter === emp.id} className="work-person" data-avatar={avatarTone(emp.name)} onClick={() => { setSelectedEmployeeFilter(emp.id); setPeopleMenuOpen(false); }}>
                      <span className="work-person-mark" aria-hidden="true">{chipInitials(emp.name)}</span>
                      <span className="work-person-copy">
                        <span>{emp.name}</span>
                        <small>{formatChipHours(hours)}{pending ? ` • ${pending} pending` : ''}</small>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <label className="work-people-search">
            <Search size={14} aria-hidden="true" />
            <input type="search" aria-label="Search people" placeholder="Find a person" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} />
          </label>
          {reviewablePeriodEntries.length > 0 && (
            <div className="work-period-review">
              <button type="button" disabled={isSaving} onClick={handleApproveEmployeePeriod} className="work-approve">Approve {reviewablePeriodEntries.length}</button>
              <button type="button" disabled={isSaving} onClick={handleRejectEmployeePeriod} className="work-reject">Reject</button>
            </div>
          )}
          {selectedEmployee && approvalDisabledReason && approvalDisabledReason !== 'No pending entries in this period.' && <p className="work-review-note">{approvalDisabledReason}</p>}
        </div>
      )}

      <div className="work-mobile-timesheets">
        {viewMode === 'week' && (
          <div className="work-mobile-week" role="group" aria-label="Choose day">
            {weekDays.map((day) => <button key={day.dateStr} type="button" aria-pressed={selectedDate === day.dateStr} onClick={() => setSelectedDate(day.dateStr)}><span>{day.dayName}</span><strong>{day.dayNum}</strong><small>{day.totalHours ? formatHoursHM(day.totalHours) : '—'}</small></button>)}
          </div>
        )}
        {viewMode === 'month' && (
          <div className="work-mobile-month">
            {['M','T','W','T','F','S','S'].map((label,index) => <span key={index}>{label}</span>)}
            {monthDays.map((day) => <button key={day.dateStr} type="button" aria-pressed={selectedDate === day.dateStr} data-outside={!day.isCurrentMonth} onClick={() => setSelectedDate(day.dateStr)}><strong>{day.dayNum}</strong><small>{day.totalHours ? formatHoursHM(day.totalHours) : ''}</small></button>)}
          </div>
        )}
        {viewMode === 'week' && <div className="work-mobile-totals"><div><span>Week total</span><strong>{formatHoursHM(weekDays.reduce((total,day) => total + day.totalHours, 0))}</strong></div><div><span>Pending review</span><strong>{reviewablePeriodEntries.length} entries</strong></div></div>}
        {viewMode === 'day' && (
          <div className="work-mobile-totals" aria-label="Day summary">
            <div>
              <span>Logged {selectedDate === TODAY_DATE ? 'today' : new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              <strong>{formatHoursHM(todayDayTotalHours)}</strong>
            </div>
            <div>
              <span>Pending review</span>
              <strong>{todayDayEntries.filter((entry) => isPendingStatus(entry.status)).length} entries</strong>
            </div>
          </div>
        )}
        {viewMode === 'month' && <div className="m2-metric"><span>Month total</span><strong>{formatHoursHM(filteredEntries.reduce((total,entry)=>total+getEntryLiveHours(entry),0))}</strong><small>{filteredEntries.length} time entries</small></div>}
          <div className="m2-section-heading"><h2>Time entries</h2><span>{mobileEntryCount} {mobileEntryCount === 1 ? 'entry' : 'entries'}</span></div>
          {viewMode === 'week' && filteredEntries.length === 0 && <p className="work-mobile-empty">No time entries for this week.</p>}
          {viewMode === 'list' && <div className="work-mobile-list-actions"><span>{filteredEntries.length} entries · {formatHoursHM(filteredEntries.reduce((total,entry) => total + getEntryLiveHours(entry), 0))} logged</span><button type="button" className="work-btn-secondary" onClick={handleExportCSV}>Export CSV</button></div>}
        {(viewMode === 'week' ? weekDays : [{dateStr:selectedDate, dayName:'', dayNum:0, totalHours:todayDayTotalHours}]).map((day) => {
          const entries = viewMode === 'list' ? filteredEntries : filteredEntries.filter((entry) => entry.date === day.dateStr);
          return <section key={day.dateStr} className="work-mobile-agenda">
            {viewMode === 'week' && entries.length > 0 && <h2>{new Date(`${day.dateStr}T00:00:00`).toLocaleDateString('en-GB', {weekday:'short',day:'numeric',month:'short'})}</h2>}
            {entries.map((entry) => <button key={entry.id} type="button" className="work-mobile-entry" onClick={() => handleEditEntry(entry)}>
              <span className={styles.entryHeading}><strong>{entry.taskTitle || 'Time entry'}</strong><small data-status={entry.status}>{entry.status}</small></span>
              <span>{entry.projectName || 'General'} · {entry.startTime?to12HourStr(entry.startTime):'-'} – {entry.endTime?to12HourStr(entry.endTime):'Running'}</span>
              <small className={styles.entryHours}>{formatHoursHM(getEntryLiveHours(entry))}{selectedEmployeeFilter === 'All' ? ' · '+entry.employeeName : ''}</small>
            </button>)}
            {entries.length === 0 && viewMode !== 'week' && <p className="work-mobile-empty">No time entries for this period.</p>}
          </section>;
        })}
      </div>

      <div className="m2-timesheet-actions"><button type="button" className="m2-primary" onClick={() => handleOpenLogModal(selectedDate)}>Log time</button>{isAdmin && <button type="button" className="m2-secondary" onClick={()=>handleOpenLogModal(selectedDate,undefined,'schedule')}>Schedule people</button>}</div>

{/* VIEW 1: DAY VIEW (Light Theme) */}
      {viewMode === 'day' && (
        <div className="work-time-calendar work-time-desktop work-time-day rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-hidden flex flex-col shadow-sm">
          <div className="flex flex-wrap items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-surface)] py-2.5 px-3 sm:px-4 sticky top-0 z-20 gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="hidden sm:block work-time-gutter w-16 sm:w-20 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                GMT+05:30
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] sm:text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })}
                </span>
                <div
                  className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center text-sm sm:text-lg mt-0.5 transition-all ${
                    selectedDate === TODAY_DATE
                      ? 'bg-[var(--studio-navy)] text-white shadow-sm font-semibold'
                      : 'text-[var(--text-secondary)] font-medium'
                  }`}
                >
                  {new Date(`${selectedDate}T00:00:00`).getDate()}
                </div>
              </div>
              <div className="text-xs text-[var(--text-muted)] pl-1 sm:pl-2">
                <span className="text-[var(--text-primary)] font-bold">{formatHoursHM(todayDayTotalHours)}</span> logged
                <span className="text-[var(--text-muted)] ml-1">• {todayDayEntries.length} tasks</span>
              </div>
            </div>

            {isAdmin && todayDayReviewable.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleApproveDay(selectedDate)}
                  className="px-2.5 py-1.5 rounded-[var(--control-radius)] bg-[var(--studio-sage)] hover:brightness-95 text-white font-semibold text-xs cursor-pointer transition-[filter,transform] duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus)]"
                >
                  Approve {todayDayReviewable.length}
                </button>
                <button
                  type="button"
                  onClick={() => handleRejectDay(selectedDate)}
                  className="px-2.5 py-1.5 rounded-[var(--control-radius)] text-[var(--studio-error)] font-semibold text-xs hover:bg-[var(--studio-error-surface)] cursor-pointer transition-colors duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-focus)]"
                >
                  Reject
                </button>
              </div>
            )}
          </div>

          <div
            ref={timeGridScrollRef}
            className="work-time-scroll overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar relative bg-[var(--bg-surface)]"
          >
            <div className="relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
              {timeHours.map(({ hour, label }) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px`, top: `${hour * HOUR_HEIGHT}px` }}
                  className="absolute inset-x-0 flex items-start border-t border-[var(--border-color)] group cursor-pointer hover:bg-[var(--bg-surface-subtle)]/80 transition-colors"
                  onClick={() => handleOpenLogModal(selectedDate, hour)}
                >
                  <div className="work-time-gutter w-16 sm:w-20 pr-3 -mt-2 text-right text-[11px] font-medium text-[var(--text-muted)] select-none">
                    {label}
                  </div>
                  <div className="flex-1 h-full flex items-center pl-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[11px] text-blue-500 font-semibold flex items-center gap-1">
                      <Plus className="h-3 w-3" /> Log time at {label}
                    </span>
                  </div>
                </div>
              ))}


              {selectedDate === TODAY_DATE && (
                <div
                  style={{ top: `${(currentTimeMinutes / 60) * HOUR_HEIGHT}px` }}
                  className="absolute inset-x-0 z-10 flex items-center pointer-events-none"
                >
                  <div className="work-time-gutter w-16 sm:w-20 flex justify-end pr-2">
                    <div className="h-3 w-3 rounded-full bg-rose-500 shadow-xs"></div>
                  </div>
                  <div className="flex-1 h-[2px] bg-rose-500"></div>
                </div>
              )}

              <div className="work-day-events absolute inset-y-0 left-16 sm:left-20 right-4 z-20 pointer-events-none">
                {(() => {
                  const processed = todayDayEntries.filter((entry) => showOnCalendar(entry)).map(entry => {
                    return { ...entry, ...blockRange(entry) };
                  }).sort((a, b) => a.startMins - b.startMins);

                  const clusters: (typeof processed)[] = [];
                  let currentCluster: typeof processed = [];
                  let clusterEnd = 0;

                  processed.forEach(entry => {
                     if (currentCluster.length === 0) {
                        currentCluster.push(entry);
                        clusterEnd = entry.endMins;
                     } else if (entry.startMins < clusterEnd) {
                        currentCluster.push(entry);
                        clusterEnd = Math.max(clusterEnd, entry.endMins);
                     } else {
                        clusters.push(currentCluster);
                        currentCluster = [entry];
                        clusterEnd = entry.endMins;
                     }
                  });
                  if (currentCluster.length > 0) {
                     clusters.push(currentCluster);
                  }

                  return clusters.flatMap(cluster => {
                     const cols: typeof processed[] = [];
                     cluster.forEach(entry => {
                        let placed = false;
                        for (let i = 0; i < cols.length; i++) {
                           const lastInCol = cols[i][cols[i].length - 1];
                           if (entry.startMins >= lastInCol.endMins) {
                              cols[i].push(entry);
                              placed = true;
                              (entry as any).colIndex = i;
                              break;
                           }
                        }
                        if (!placed) {
                           cols.push([entry]);
                           (entry as any).colIndex = cols.length - 1;
                        }
                     });

                     return cluster.map(entry => {
                        const topPx = (entry.startMins / 60) * HOUR_HEIGHT;
                        const heightPx = Math.max(40, ( (entry.endMins - entry.startMins) / 60) * HOUR_HEIGHT - 2);
                        const colIndex = (entry as any).colIndex || 0;
                        const widthPct = 100 / cols.length;
                        const leftPct = widthPct * colIndex;
                        const eventTone = getDayEventAppearance(entry.status);

                        return (
                          <div
                            key={entry.id}
                            style={{ 
                              top: `${topPx}px`, 
                              height: `${heightPx}px`, 
                              width: `calc(${widthPct}% - 12px)`,
                              left: `calc(${leftPct}% + 6px)`,
                              zIndex: 20 + colIndex,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditEntry(entry);
                            }}
                            className={`work-time-event absolute pointer-events-auto rounded-xl px-3 py-2 border shadow-sm cursor-pointer transition-[box-shadow,transform] duration-150 flex flex-col justify-between overflow-hidden hover:shadow-md hover:z-50 ${eventTone.card}`}
                          >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold truncate leading-snug">
                              {entry.taskTitle}
                            </h4>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${eventTone.badge}`}>
                              {entry.status}
                            </span>
                          </div>
                          <p className={`text-[11px] font-medium mt-0.5 truncate ${eventTone.meta}`}>
                            {entry.startTime} – {getEntryLiveEndTime(entry)} • {formatHoursHM(getEntryLiveHours(entry))} • {entry.employeeName}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {isAdmin && entry.status !== 'Approved' && (
                            <button
                              type="button"
                              onClick={(e) => handleApproveSingle(entry, e)}
                              title="Approve Task Log"
                              className="h-6 w-6 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] hover:bg-emerald-500 hover:border-emerald-500 hover:text-white text-emerald-600 flex items-center justify-center transition-colors shadow-2xs"
                            >
                              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => handleRejectSingle(entry, e)}
                              title="Reject & Remove Task Log"
                              className="h-6 w-6 rounded-md bg-[var(--bg-surface)] border border-[var(--border-color)] hover:bg-rose-500 hover:border-rose-500 hover:text-white text-rose-600 flex items-center justify-center transition-colors shadow-2xs"
                            >
                              <X className="h-3.5 w-3.5 stroke-[2.5]" />
                            </button>
                          )}
                          <span className="text-[10px] bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded-md font-semibold whitespace-nowrap">
                            {entry.projectName || 'General'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                });
              });
            })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: WEEK VIEW (Light Theme) */}
      {viewMode === 'week' && (
        <div className="work-time-calendar work-time-desktop work-time-week rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-hidden shadow-sm">
          <div className="grid grid-cols-[4rem_repeat(7,minmax(0,1fr))] border-b border-[var(--border-color)] bg-[var(--bg-surface)] py-2.5">
            <div className="p-2 text-center text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-center">
              Time
            </div>
            {weekDays.map((day) => (
              <div key={day.dateStr} className="p-2 text-center">
                <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">{day.dayName}</span>
                <div
                  className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center text-xs mt-1 ${
                    day.isToday ? 'bg-[var(--studio-navy)] text-white font-bold' : 'text-[var(--text-secondary)] font-semibold'
                  }`}
                >
                  {day.dayNum}
                </div>
                {day.totalHours > 0 && (
                  <span className="mt-1 block text-[10px] font-semibold text-[var(--text-muted)]">{formatHoursHM(day.totalHours)}</span>
                )}
              </div>
            ))}
          </div>

          <div ref={timeGridScrollRef} className="work-time-scroll overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar">
            <div className="relative min-w-[720px]" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
              {timeHours.map(({ hour, label }) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-[var(--border-color)]"
                  style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                >
                  <div className="w-[4rem] -mt-2 pr-2 text-right text-[10px] font-medium text-[var(--text-muted)] select-none">{label}</div>
                </div>
              ))}
              <div className="absolute inset-y-0 left-[4rem] right-0 grid grid-cols-7">
                {weekDays.map((day) => {
                  const dayEntries = filteredEntries
                    .filter((entry) => entry.date === day.dateStr && showOnCalendar(entry))
                    .map((entry) => {
                      const range = blockRange(entry);
                      return { entry, startMins: range.startMins, endMins: range.endMins };
                    })
                    .sort((a, b) => a.startMins - b.startMins);
                  const columnEnds: number[] = [];
                  dayEntries.forEach((item) => {
                    let placed = false;
                    for (let index = 0; index < columnEnds.length; index += 1) {
                      if (item.startMins >= columnEnds[index]) {
                        columnEnds[index] = item.endMins;
                        (item as { colIndex?: number }).colIndex = index;
                        placed = true;
                        break;
                      }
                    }
                    if (!placed) {
                      (item as { colIndex?: number }).colIndex = columnEnds.length;
                      columnEnds.push(item.endMins);
                    }
                  });
                  const columnCount = Math.max(1, columnEnds.length);

                  return (
                    <div key={day.dateStr} className="relative border-l border-[var(--border-color)]">
                      {timeHours.map(({ hour }) => (
                        <button
                          key={hour}
                          type="button"
                          aria-label={`Log time on ${day.dateStr} at ${hour}`}
                          onClick={() => handleOpenLogModal(day.dateStr, hour)}
                          className="absolute inset-x-0 cursor-pointer hover:bg-[var(--bg-surface-subtle)]/80"
                          style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                        />
                      ))}
                      {dayEntries.map((item) => {
                        const colIndex = (item as { colIndex?: number }).colIndex || 0;
                        const width = 100 / columnCount;
                        const eventTone = getDayEventAppearance(item.entry.status);
                        return (
                          <div
                            key={item.entry.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditEntry(item.entry);
                            }}
                            style={{
                              top: `${(item.startMins / 60) * HOUR_HEIGHT}px`,
                              height: `${Math.max(28, ((item.endMins - item.startMins) / 60) * HOUR_HEIGHT - 2)}px`,
                              width: `calc(${width}% - 6px)`,
                              left: `calc(${width * colIndex}% + 3px)`,
                            }}
                            className={`work-time-event absolute z-10 overflow-hidden rounded-lg border px-1.5 py-1 cursor-pointer ${eventTone.card}`}
                          >
                            <p className="truncate text-[11px] font-bold leading-tight">{item.entry.taskTitle}</p>
                            <p className={`truncate text-[10px] ${eventTone.meta}`}>{formatHoursHM(getEntryLiveHours(item.entry))}</p>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: MONTH VIEW (Light Theme) */}
      {viewMode === 'month' && (
        <div className="work-time-calendar work-time-desktop work-time-month rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-x-auto custom-scrollbar touch-pan-x shadow-sm">
          <div className="min-w-[640px] flex flex-col">
            <div className="grid grid-cols-7 border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)] py-2.5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="text-center text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-[var(--border-color)] min-h-[500px]">
              {monthDays.map((day) => {
                const visibleEntries = day.entries.filter((entry) => showOnCalendar(entry));
                return (
                  <div
                    key={day.dateStr}
                    onClick={() => handleOpenLogModal(day.dateStr)}
                    className={`min-h-[100px] p-2 hover:bg-[var(--bg-surface-subtle)]/80 cursor-pointer transition-colors flex flex-col justify-between group ${
                      day.isCurrentMonth ? '' : 'opacity-45'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold h-6 w-6 rounded-full flex items-center justify-center ${
                          day.isToday ? 'bg-[var(--studio-navy)] text-white font-bold' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {day.dayNum}
                      </span>
                      {day.totalHours > 0 && (
                        <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-surface-subtle)] px-1.5 py-0.5 rounded">
                          {formatHoursHM(day.totalHours)}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 mt-1">
                      {visibleEntries.slice(0, 2).map((entry) => (
                        <div
                          key={entry.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditEntry(entry);
                          }}
                          className="text-[10px] font-semibold p-1 rounded border truncate bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] text-blue-700 border-blue-200"
                        >
                          {isAdmin && selectedEmployeeFilter === 'All' ? `${getInitials(entry.employeeName)} · ` : ''}
                          {entry.taskTitle}
                        </div>
                      ))}
                      {visibleEntries.length > 2 && (
                        <span className="text-[9px] font-bold text-[var(--text-muted)] block pl-1">
                          +{visibleEntries.length - 2} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: LIST VIEW (Light Theme) */}
      {viewMode === 'list' && (
        <div className="work-time-desktop work-time-list space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-color)] shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">
                Total: <strong className="text-[var(--text-primary)]">{filteredEntries.length} entries</strong> (
                {filteredEntries.reduce((sum, e) => sum + getEntryLiveHours(e), 0).toFixed(1)} hrs)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && selectedApprovalIds.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleBatchApprove}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>Approve Selected ({selectedApprovalIds.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleBatchReject}
                    className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <X className="h-3.5 w-3.5 stroke-[2.5]" />
                    <span>Reject Selected ({selectedApprovalIds.length})</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border-b border-[var(--border-color)] font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  {isAdmin && (
                    <th className="p-3.5 w-8">
                      <input
                        type="checkbox"
                        checked={filteredEntries.length > 0 && selectedApprovalIds.length === filteredEntries.length}
                        onChange={(e) => setSelectedApprovalIds(e.target.checked ? filteredEntries.map((entry) => entry.id) : [])}
                        className="rounded border-[var(--border-strong)] text-[var(--studio-navy)] focus:ring-[var(--primary-blue)] cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Employee</th>
                  <th className="p-3.5">Project</th>
                  <th className="p-3.5">Task Deliverable</th>
                  <th className="p-3.5">Time Window</th>
                  <th className="p-3.5">Hours</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-secondary)]">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-xs text-[var(--text-muted)] font-medium">
                      No timesheet entries found matching the active filters.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const task = state.tasks.find((t) => t.id === entry.taskId);
                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
                        onClick={() => handleEditEntry(entry)}
                      >
                        {isAdmin && (
                          <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedApprovalIds.includes(entry.id)}
                              onChange={(e) => setSelectedApprovalIds((prev) => e.target.checked ? [...prev, entry.id] : prev.filter((id) => id !== entry.id))}
                              className="rounded border-[var(--border-strong)] text-[var(--studio-navy)] focus:ring-[var(--primary-blue)] cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="p-3.5 font-medium text-[var(--text-primary)] whitespace-nowrap">{entry.date}</td>
                        <td className="p-3.5 font-medium text-[var(--text-primary)]">{entry.employeeName}</td>
                        <td className="p-3.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] text-blue-700">
                            {entry.projectName || 'General'}
                          </span>
                        </td>
                        <td className="p-3.5 font-semibold text-[var(--text-primary)] max-w-[220px]">
                          <div className="flex items-center gap-2">
                            {task?.colorClass && (
                              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${task.colorClass.split(' ')[0]}`} />
                            )}
                            <span className="truncate">{entry.taskTitle}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-[var(--text-muted)] whitespace-nowrap">
                          {entry.startTime || '09:00 AM'} – {getEntryLiveEndTime(entry)}
                        </td>
                        <td className="p-3.5 font-bold text-[var(--text-primary)]">{formatHoursHM(getEntryLiveHours(entry))}</td>
                        <td className="p-3.5">
                          <span
                            title={entry.approvedBy ? `${entry.status} by ${entry.approvedBy}` : entry.status}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 w-max ${
                            entry.status === 'Approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : entry.status === 'Review' || entry.status === 'Submitted'
                              ? 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] text-blue-700 border-blue-200'
                              : entry.status === 'Rejected'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-color)]'
                          }`}>
                            {entry.status === 'Approved' ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            <span>{entry.status}{entry.approvedBy && (entry.status === 'Approved' || entry.status === 'Rejected') ? ` · ${entry.approvedBy}` : ''}</span>
                          </span>
                        </td>
                        <td className="p-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {isAdmin && isPendingStatus(entry.status) && canReviewEntry(entry) && (
                              <button
                                type="button"
                                onClick={(e) => handleApproveSingle(entry, e)}
                                title="Approve Task Log"
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                              >
                                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                              </button>
                            )}
                            {isAdmin && isPendingStatus(entry.status) && canReviewEntry(entry) && (
                              <button
                                type="button"
                                onClick={(e) => handleRejectSingle(entry, e)}
                                title="Reject Task Log"
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <X className="h-3.5 w-3.5 stroke-[2.5]" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEditEntry(entry)}
                              title="Edit Details"
                              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--studio-navy)] hover:bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] transition-colors"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(entry.id)}
                              title="Delete Log"
                              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showLogModal && (
        <div className={`work-time-modal-overlay fixed inset-0 z-60 flex items-center justify-center p-4 ${drawerStyles.overlay}`}>
          <div ref={timeDrawerRef} tabIndex={-1} role="dialog" aria-modal="true" data-drawer-kind="form" aria-labelledby="work-time-dialog-title" className={`work-time-modal ${drawerStyles.panel} ${styles.form}`}>
            <header className="work-time-modal-head">
              <div><h2 id="work-time-dialog-title">{logModalTab === 'schedule' ? editingEntryId ? 'Edit schedule' : 'Assign meeting' : editingEntryId ? 'Edit time entry' : 'Log task'}</h2><p>{new Date(`${formDate}T00:00:00`).toLocaleDateString('en-GB', {weekday:'long',day:'numeric',month:'long'})}</p></div>
              <button type="button" aria-label="Close time form" onClick={() => setShowLogModal(false)}><X size={18} /></button>
            </header>
            <div className="work-time-modal-tabs" role="tablist" aria-label="Time entry type">
              {(['task','schedule'] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={logModalTab === tab} onClick={() => { setLogModalTab(tab); if(tab === 'schedule') { setLogCategory('Meeting'); if(isAdmin && !editingEntryId && !formEmployeeIds.length && formEmployeeId) setFormEmployeeIds([formEmployeeId]); } }}>{tab === 'task' ? 'Task' : 'Schedule'}</button>)}
            </div>
            <form className="work-time-form" onSubmit={handleSaveTimesheet}>
              <div className="work-time-form-body custom-scrollbar">
                {logModalTab === 'schedule' && <label htmlFor="time-activity">Activity / meeting title *<input id="time-activity" required value={formTitle} onChange={(event) => setFormTitle(event.target.value)} placeholder="Sprint planning" /></label>}
                <div className="work-time-form-dates">
                  <label htmlFor="time-date">Date *<DateInput id="time-date" value={formDate} max={logModalTab === 'task' ? TODAY_DATE : undefined} onChange={(event) => setFormDate(event.target.value)} required /></label>
                  <label htmlFor="time-start">Start *<input id="time-start" type="time" required value={formStartTime} onChange={(event) => handleTimeChange(event.target.value,formEndTime)} /></label>
                  <label htmlFor="time-end">End *<input id="time-end" type="time" required value={formEndTime} onChange={(event) => handleTimeChange(formStartTime,event.target.value)} /></label>
                </div>
                <p className="work-time-duration">Duration: {formatHoursHM(parseFloat(formDurationHours) || 0)}{formDate > TODAY_DATE ? ' · Upcoming' : ''}</p>
                {logModalTab === 'schedule' && <label htmlFor="time-meeting-link">Meeting link<input id="time-meeting-link" type="url" value={formMeetingLink} placeholder="https://meet.google.com/…" onChange={(event) => { setFormMeetingLink(event.target.value); setShowMeetingLinkInput(Boolean(event.target.value)); }} /></label>}
                <label htmlFor="time-project">Project<select id="time-project" value={formProjectId} onChange={(event) => { setFormProjectId(event.target.value); setFormTaskId(''); }}><option value="">General / Standalone</option>{activeProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                {logModalTab === 'task' && <>
                  <label htmlFor="time-task">Task<select id="time-task" value={formTaskId} onChange={(event) => { setFormTaskId(event.target.value); const task=projectTasks.find((item) => item.id === event.target.value); setFormTitle(task?.title || ''); }}><option value="">Custom work</option>{projectTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
                  {!formTaskId && <label htmlFor="time-title">Work title *<input id="time-title" value={formTitle} onChange={(event) => setFormTitle(event.target.value)} required placeholder="What did you work on?" /></label>}
                  <label htmlFor="time-category">Category *<select id="time-category" required value={formCategory} onChange={(event) => setLogCategory(event.target.value as TimesheetEntry['category'])}>{(['Development','Design','Testing','Code Review','Meeting','Documentation','Bug Fix'] as const).map((category) => <option key={category}>{category}</option>)}</select></label>
                </>}
                <label htmlFor="time-notes">{logModalTab === 'schedule' ? 'Agenda' : 'Notes'}<textarea id="time-notes" rows={3} value={formDescription} onChange={(event) => setFormDescription(event.target.value)} placeholder={logModalTab === 'schedule' ? 'What will you cover?' : 'What did you complete?'} /></label>
                {isAdmin && logModalTab === 'schedule' && !editingEntryId ? <div className="work-time-meeting-people"><h3>People · {formEmployeeIds.length}</h3><div>{formEmployeeIds.map((id) => <span key={id}>{accessibleEmployees.find((employee) => employee.id === id)?.name || 'Team member'}<button type="button" aria-label={`Remove ${accessibleEmployees.find((employee) => employee.id === id)?.name || 'person'}`} onClick={() => setFormEmployeeIds((ids) => ids.filter((value) => value !== id))}><X size={12}/></button></span>)}</div><label htmlFor="time-add-person">Add person<select id="time-add-person" aria-label="Add person" value="" onChange={(event) => { if(event.target.value) setFormEmployeeIds((ids) => [...ids,event.target.value]); }}><option value="">Choose a person</option>{accessibleEmployees.filter((employee) => !formEmployeeIds.includes(employee.id) && !isTestEntity(employee.name)).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label></div> : isAdmin ? <label htmlFor="time-person">Person<select id="time-person" value={formEmployeeId} onChange={(event) => setFormEmployeeId(event.target.value)}>{accessibleEmployees.filter((employee) => !isTestEntity(employee.name)).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label> : null}
                {logModalTab === 'task' && <label className="work-time-billable" htmlFor="time-billable"><span>Billable work<small>Include these hours on the client invoice.</small></span><input id="time-billable" type="checkbox" role="switch" checked={formBillable} onChange={(event) => setFormBillable(event.target.checked)} /></label>}
              </div>
              <footer className="work-time-modal-footer">
                {editingEntryId && <button type="button" className="work-time-delete" onClick={() => handleDeleteEntry(editingEntryId)}>Delete entry</button>}
                <button type="button" className="work-btn-secondary" onClick={() => setShowLogModal(false)}>Cancel</button>
                <button type="submit" disabled={isSaving || (logModalTab === 'task' && formDate > TODAY_DATE) || (logModalTab === 'schedule' && isAdmin && !editingEntryId && !formEmployeeIds.length)} className="work-btn-primary">{isSaving ? 'Saving…' : logModalTab === 'schedule' ? editingEntryId ? 'Update schedule' : `Assign to ${formEmployeeIds.length || 1} ${formEmployeeIds.length === 1 ? 'person' : 'people'}` : formDate < TODAY_DATE ? 'Apply for regularization' : 'Save entry'}</button>
              </footer>
            </form>
          </div>
        </div>
      )}

      {confirmRejectPeriod && (
        <ConfirmDialog
          title={`Reject ${reviewablePeriodEntries.length} entries?`}
          description={`Reject ${reviewablePeriodEntries.length} pending entries for ${selectedEmployee?.name || 'selected people'}? Their hours will be removed from the linked tasks.`}
          confirmLabel="Reject entries"
          busy={isSaving}
          busyLabel="Rejecting…"
          onCancel={() => setConfirmRejectPeriod(false)}
          onConfirm={() => void confirmRejectEmployeePeriod()}
        />
      )}

      {pendingDeleteEntry && (
        <ConfirmDialog
          title={`Delete “${pendingDeleteEntry.taskTitle}”?`}
          description="This timesheet entry will be removed. This cannot be undone."
          confirmLabel="Delete entry"
          busy={isSaving}
          busyLabel="Deleting…"
          onCancel={() => setPendingDeleteEntry(null)}
          onConfirm={() => void confirmDeleteEntry()}
        />
      )}
    </div>
  );
};
