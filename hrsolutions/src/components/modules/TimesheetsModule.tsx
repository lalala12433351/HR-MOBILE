'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Plus,
  CheckCircle2,
  X,
  FileText,
  Briefcase,
  Edit3,
  Trash2,
  Download,
  Check,
  Tag,
  Search,
  Video,
  Link2,
  Users,
} from 'lucide-react';
import { AppState, isTestEntity, normalizeTaskStatus } from '../../services/store';
import { TimesheetEntry, Project } from '../../types';
import { api } from '../../services/apiClient';

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
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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

  const getTodayIso = () => new Date().toISOString().split('T')[0];
  const TODAY_DATE = getTodayIso();

  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month' | 'list'>('day');
  const [selectedDate, setSelectedDate] = useState<string>(TODAY_DATE);
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
  const [isSaving, setIsSaving] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType] = useState<'task' | 'custom' | 'meeting'>('task');
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
  const HOUR_HEIGHT = 68;

  useEffect(() => {
    setSelectedEmployeeFilter(state.currentPersona?.id || state.employees[0]?.id || '');
  }, [state.currentPersona?.id, isAdmin, state.employees.length]);

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

  // Compute live hours for any timesheet entry based on its linked task (if tracking)
  const getEntryLiveHours = (entry: TimesheetEntry): number => {
    const task = state.tasks.find(
      (t) =>
        t.id === entry.taskId ||
        (t.title && entry.taskTitle && t.title.trim().toLowerCase() === entry.taskTitle.trim().toLowerCase())
    );

    if (task) {
      let totalSec = task.timeSpentSeconds || (task.actualHours ? Math.round(task.actualHours * 3600) : 0);
      if (normalizeTaskStatus(task.status) === 'In Progress' && task.isTimerRunning && task.timerStartedAt) {
        totalSec += Math.max(0, Math.floor((now - task.timerStartedAt) / 1000));
      }
      const taskHrs = Number((totalSec / 3600).toFixed(2));
      if (taskHrs > (entry.hours || 0)) {
        return taskHrs;
      }
    }

    return entry.hours || 0;
  };

  const getEntryLiveEndTime = (entry: TimesheetEntry): string => {
    if (entry.endTime) return entry.endTime;
    const task = state.tasks.find(
      (t) =>
        t.id === entry.taskId ||
        (t.title && entry.taskTitle && t.title.trim().toLowerCase() === entry.taskTitle.trim().toLowerCase())
    );
    if (task && normalizeTaskStatus(task.status) === 'In Progress' && task.isTimerRunning) {
      return new Date(now).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    return entry.endTime || 'Present';
  };

  const allTimesheets = useMemo(() => {
    const existing = [...state.timesheets];
    state.tasks.forEach((task) => {
      const isInProgress = normalizeTaskStatus(task.status) === 'In Progress';
      const hasTime = (task.timeSpentSeconds || 0) > 0 || (task.actualHours || 0) > 0 || task.isTimerRunning;
      if (isInProgress && hasTime) {
        const hasEntry = existing.some(
          (ts) =>
            (ts.taskId === task.id ||
              (ts.taskTitle && task.title && ts.taskTitle.trim().toLowerCase() === task.title.trim().toLowerCase())) &&
            ts.date === TODAY_DATE
        );
        if (!hasEntry) {
          const taskHrs = Number(((task.timeSpentSeconds || 0) / 3600).toFixed(2)) || task.actualHours || 0;
          existing.unshift({
            id: `ts_live_${task.id}`,
            employeeId: [...(task.assigneeIds || []), task.assigneeId].includes(state.currentPersona?.id)
              ? state.currentPersona?.id || task.assigneeId
              : task.assigneeId || state.currentPersona?.id || state.employees[0]?.id || '',
            employeeName: [...(task.assigneeNames || []), task.assigneeName].some(
              (name) => (name || '').toLowerCase() === (state.currentPersona?.name || '').toLowerCase()
            )
              ? state.currentPersona?.name || task.assigneeName
              : task.assigneeName || state.currentPersona?.name || state.employees[0]?.name || 'Team Member',
            projectId: task.projectId || 'standalone',
            projectName: task.projectName || 'General Project',
            taskId: task.id,
            taskTitle: task.title,
            date: TODAY_DATE,
            startTime: task.startDate || '09:00 AM',
            hours: taskHrs,
            billable: true,
            category: 'Development',
            description: `Active work on ${task.title}`,
            status: 'Review',
          });
        }
      }
    });
    return existing;
  }, [state.timesheets, state.tasks, TODAY_DATE, state.currentPersona, state.employees]);

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
        const q = searchQuery.toLowerCase();
        if (
          !(
            entry.taskTitle.toLowerCase().includes(q) ||
            entry.projectName.toLowerCase().includes(q) ||
            entry.description.toLowerCase().includes(q) ||
            entry.employeeName.toLowerCase().includes(q) ||
            (entry.category || '').toLowerCase().includes(q)
          )
        )
          return false;
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
    if (selectedEmployeeFilter === 'All') return scopedEntries;
    return scopedEntries.filter((entry) => entryBelongsTo(entry, selectedEmployeeFilter, selectedEmployee?.name));
  }, [scopedEntries, selectedEmployeeFilter, selectedEmployee]);

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
    const cur = new Date(selectedDate);
    if (viewMode === 'day') cur.setDate(cur.getDate() - 1);
    else if (viewMode === 'week') cur.setDate(cur.getDate() - 7);
    else if (viewMode === 'month') cur.setMonth(cur.getMonth() - 1);
    else cur.setDate(cur.getDate() - 7);
    setSelectedDate(cur.toISOString().split('T')[0]);
  };

  const handleNextDate = () => {
    const cur = new Date(selectedDate);
    if (viewMode === 'day') cur.setDate(cur.getDate() + 1);
    else if (viewMode === 'week') cur.setDate(cur.getDate() + 7);
    else if (viewMode === 'month') cur.setMonth(cur.getMonth() + 1);
    else cur.setDate(cur.getDate() + 7);
    setSelectedDate(cur.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setSelectedDate(TODAY_DATE);
  };

  const headerDateTitle = useMemo(() => {
    const dateObj = new Date(selectedDate);
    if (viewMode === 'day') return dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    if (viewMode === 'week') {
      const dayOfWeek = dateObj.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mon = new Date(dateObj);
      mon.setDate(dateObj.getDate() + mondayOffset);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return `${mon.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – ${sun.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    if (viewMode === 'month') return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedDate, viewMode]);

  const weekDays = useMemo(() => {
    const dateObj = new Date(selectedDate);
    const dayOfWeek = dateObj.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const days = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(dateObj);
      d.setDate(dateObj.getDate() + mondayOffset + i);
      const iso = d.toISOString().split('T')[0];
      const dayTotal = filteredEntries.filter((e) => e.date === iso).reduce((sum, e) => sum + getEntryLiveHours(e), 0);
      days.push({ dateStr: iso, dayName: dayNames[i], dayNum: d.getDate(), isToday: iso === TODAY_DATE, totalHours: dayTotal });
    }
    return days;
  }, [selectedDate, filteredEntries, TODAY_DATE, now, state.tasks]);

  const monthDays = useMemo(() => {
    const dateObj = new Date(selectedDate);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const firstDay = new Date(year, month, 1);
    const startingDayOfWeek = firstDay.getDay();
    const offset = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;
    const days = [];
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - offset);
    for (let i = 0; i < 35; i++) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + i);
      const iso = current.toISOString().split('T')[0];
      const isCurrentMonth = current.getMonth() === month;
      const dayEntries = filteredEntries.filter((e) => e.date === iso);
      const totalHours = dayEntries.reduce((sum, e) => sum + getEntryLiveHours(e), 0);
      days.push({ dateStr: iso, dayNum: current.getDate(), isCurrentMonth, isToday: iso === TODAY_DATE, entries: dayEntries, totalHours });
    }
    return days;
  }, [selectedDate, filteredEntries, TODAY_DATE, now, state.tasks]);

  const periodRange = useMemo<{ start: string; end: string } | null>(() => {
    if (viewMode === 'day') return { start: selectedDate, end: selectedDate };
    if (viewMode === 'week') return { start: weekDays[0].dateStr, end: weekDays[6].dateStr };
    if (viewMode === 'month') {
      const ym = selectedDate.slice(0, 7);
      return { start: `${ym}-01`, end: `${ym}-31` };
    }
    return null;
  }, [viewMode, selectedDate, weekDays]);

  const periodLabel = viewMode === 'list' ? 'all time' : headerDateTitle;

  const inPeriod = (entry: TimesheetEntry) =>
    !periodRange || (entry.date >= periodRange.start && entry.date <= periodRange.end);

  const [employeeSearch, setEmployeeSearch] = useState('');

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
    if (entries.length === 0 || !selectedEmployee) return;
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
            entityId: selectedEmployee.id,
            ipAddress: '106.51.72.18',
            details: `Approved ${ids.length} timesheets for ${selectedEmployee.name} (${periodLabel})`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Approved ${ids.length} entries for ${selectedEmployee.name}`);
    } catch (err) {
      console.error('Failed to approve employee timesheets', err);
      showToast(apiErrorMessage(err, 'Failed to approve timesheets.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectEmployeePeriod = async () => {
    const entries = reviewablePeriodEntries;
    if (entries.length === 0 || !selectedEmployee) return;
    if (!confirm(`Reject ${entries.length} pending entries for ${selectedEmployee.name}? Their hours will be removed from the linked tasks.`)) return;
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
            entityId: selectedEmployee.id,
            ipAddress: '106.51.72.18',
            details: `Rejected ${ids.length} timesheets for ${selectedEmployee.name} (${periodLabel})`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Rejected ${ids.length} entries for ${selectedEmployee.name}`);
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
    setFormType(tab === 'schedule' ? 'meeting' : 'task');
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
    setFormType(isSchedule ? 'meeting' : 'task');
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
    const saveStatus = isSchedule
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

  const handleDeleteEntry = async (entryId: string) => {
    const entry = state.timesheets.find((t) => t.id === entryId);
    if (!entry) return;
    
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
  const currentTimeMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const TIME_OPTIONS = useMemo(() => {
    return Array.from({ length: 48 }, (_, i) => {
      const totalMinutes = i * 30;
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 === 0 ? 12 : h % 12;
      return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    });
  }, []);

  return (
    <div className="work-page">
      {toastMessage && (
        <div className="fixed top-6 right-6 z-70 bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-1 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="work-chrome">
        <div className="work-chrome-row work-head">
          <h1 className="work-title min-w-0">Log hours</h1>
          <div className="work-actions ml-auto">
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleOpenLogModal(selectedDate, undefined, 'schedule')}
                className="work-btn-secondary"
              >
                <Users className="h-3.5 w-3.5 stroke-[2.5]" />
                <span className="hidden sm:inline">Schedule people</span>
                <span className="sm:hidden">Schedule</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleOpenLogModal(selectedDate)}
              className="work-btn-primary"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Log Time</span>
            </button>
          </div>
        </div>

        <div className="work-chrome-row">
          <div className="work-date-step shrink-0">
            <button type="button" onClick={handleToday}>
              Today
            </button>
            <button type="button" onClick={handlePrevDate} aria-label="Previous period">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={handleNextDate} aria-label="Next period">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h2 className="m-0 min-w-0 flex-1 text-[13px] font-bold tracking-tight text-[var(--text-primary)] sm:flex-none">
            {headerDateTitle}
          </h2>

          <div className="relative min-w-0 w-full sm:w-auto sm:ml-auto">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search logs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="work-field w-full pl-10 sm:w-40"
              aria-label="Search logs"
            />
          </div>
          <select
            value={selectedProjectFilter}
            onChange={(e) => setSelectedProjectFilter(e.target.value)}
            className="work-field min-w-0 w-full sm:w-auto"
            aria-label="Filter by project"
          >
            <option value="All">All projects</option>
            <option value="standalone">General / Standalone</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="work-seg w-full sm:w-auto" role="group" aria-label="Timesheet view">
            {(['day', 'week', 'month', 'list'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`flex-1 sm:flex-none ${viewMode === m ? 'is-on' : ''}`}
                aria-pressed={viewMode === m}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="work-chrome-row items-stretch">
            <div className="flex min-w-0 w-full flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="m-0 text-[13px] font-semibold tracking-tight text-[var(--text-primary)]">
                  {isSuperAdmin || isHR ? 'Employee timesheets' : 'Team timesheets'}
                  {selectedEmployee ? (
                    <span className="font-medium text-[var(--studio-navy)]">
                      {' '}
                      · {selectedEmployee.name}
                    </span>
                  ) : null}
                </h3>
                <div className="relative ml-auto min-w-0">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    placeholder="Search people"
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className="work-field w-full pl-10 sm:w-44"
                    aria-label="Search people"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="work-field"
                  aria-label="Filter by status"
                >
                  <option value="All">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>
              </div>

              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="flex min-w-0 flex-1 gap-1 overflow-x-auto custom-scrollbar"
                  role="group"
                  aria-label="Select employee"
                >
                  {employeeSummaries.map(({ emp, hours, pending }) => {
                    const active = selectedEmployeeFilter === emp.id;
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedEmployeeFilter(emp.id)}
                        title={`${emp.name}${emp.designation ? ` · ${emp.designation}` : ''}`}
                        className={`work-person shrink-0 ${active ? 'is-on' : ''}`}
                      >
                        <span className="work-person-mark relative">
                          {emp.avatar ? (
                            <img src={emp.avatar} alt="" />
                          ) : (
                            getInitials(emp.name)
                          )}
                          {active && (
                            <span className="absolute -right-0.5 -bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--studio-navy)] text-[var(--bg-surface)]">
                              <Check className="h-2.5 w-2.5 stroke-[3]" />
                            </span>
                          )}
                        </span>
                        <span className="work-person-name">{emp.name}</span>
                        {hours > 0 && (
                          <span className="work-person-meta">{formatHoursHM(hours)}</span>
                        )}
                        {pending > 0 && (
                          <span className="rounded-md bg-[var(--studio-focus)] px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--studio-navy)]">
                            {pending}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {employeeSummaries.length === 0 && (
                    <p className="m-0 py-1.5 text-xs text-[var(--text-muted)]">
                      No people match “{employeeSearch}”.
                    </p>
                  )}
                </div>

                {reviewablePeriodEntries.length > 0 ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={isSaving}
                      title="Approve pending entries you can review"
                      onClick={handleApproveEmployeePeriod}
                      className="h-9 rounded-[var(--control-radius)] bg-[var(--studio-sage)] px-2.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-50 cursor-pointer"
                    >
                      Approve {reviewablePeriodEntries.length}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      title="Reject pending entries you can review"
                      onClick={handleRejectEmployeePeriod}
                      className="h-9 rounded-[var(--control-radius)] px-2.5 text-xs font-semibold text-[var(--studio-error)] hover:bg-[var(--studio-error-surface)] disabled:opacity-50 cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  selectedEmployee &&
                  approvalDisabledReason &&
                  approvalDisabledReason !== 'No pending entries in this period.' && (
                    <p className="m-0 max-w-[220px] shrink-0 text-right text-[11px] leading-snug text-[var(--text-muted)]">
                      {approvalDisabledReason}
                    </p>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* VIEW 1: DAY VIEW (Light Theme) */}
      {viewMode === 'day' && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-hidden flex flex-col shadow-sm">
          <div className="flex flex-wrap items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-surface)] py-2.5 px-3 sm:px-4 sticky top-0 z-20 gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="hidden sm:block w-16 sm:w-20 text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                GMT+05:30
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] sm:text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <div
                  className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center text-sm sm:text-lg mt-0.5 transition-all ${
                    selectedDate === TODAY_DATE
                      ? 'bg-[var(--studio-navy)] text-white shadow-sm font-semibold'
                      : 'text-[var(--text-secondary)] font-medium'
                  }`}
                >
                  {new Date(selectedDate).getDate()}
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
            className="overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar relative bg-[var(--bg-surface)]"
          >
            <div className="relative min-h-[1632px]">
              {timeHours.map(({ hour, label }) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px`, top: `${hour * HOUR_HEIGHT}px` }}
                  className="absolute inset-x-0 flex items-start border-t border-[var(--border-color)] group cursor-pointer hover:bg-[var(--bg-surface-subtle)]/80 transition-colors"
                  onClick={() => handleOpenLogModal(selectedDate, hour)}
                >
                  <div className="w-16 sm:w-20 pr-3 -mt-2 text-right text-[11px] font-medium text-[var(--text-muted)] select-none">
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
                  className="absolute inset-x-0 z-30 flex items-center pointer-events-none"
                >
                  <div className="w-16 sm:w-20 flex justify-end pr-2">
                    <div className="h-3 w-3 rounded-full bg-rose-500 shadow-xs"></div>
                  </div>
                  <div className="flex-1 h-[2px] bg-rose-500"></div>
                </div>
              )}

              <div className="absolute inset-y-0 left-16 sm:left-20 right-4 z-20 pointer-events-none">
                {(() => {
                  const processed = [...todayDayEntries].map(entry => {
                    const startMins = parseTimeToMinutes(entry.startTime || '09:00 AM');
                    const liveHrs = getEntryLiveHours(entry);
                    const durationMins = Math.max(15, Math.round((liveHrs || 0.25) * 60));
                    return { ...entry, startMins, endMins: startMins + durationMins };
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
                            className={`absolute pointer-events-auto rounded-xl px-3 py-2 border shadow-sm cursor-pointer transition-[box-shadow,transform] duration-150 flex flex-col justify-between overflow-hidden hover:shadow-md hover:z-50 ${eventTone.card}`}
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
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-x-auto custom-scrollbar touch-pan-x shadow-sm">
          <div className="min-w-[640px] flex flex-col">
            <div className="grid grid-cols-8 border-b border-[var(--border-color)] bg-[var(--bg-surface)] py-2.5 sticky top-0 z-20">
              <div className="p-2 text-center text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider flex items-center justify-center">
                Time
              </div>
              {Array.from({ length: 7 }, (_, i) => {
                const d = new Date(selectedDate);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1) + i;
                const colDate = new Date(d.setDate(diff));
                const colDateStr = colDate.toISOString().split('T')[0];
                const isToday = colDateStr === TODAY_DATE;

                return (
                  <div key={i} className="p-2 text-center">
                    <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase">
                      {colDate.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <div
                      className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center text-xs mt-1 ${
                        isToday ? 'bg-[var(--studio-navy)] text-white font-bold' : 'text-[var(--text-secondary)] font-semibold'
                      }`}
                    >
                      {colDate.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="divide-y divide-[var(--border-color)] max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
              {timeHours.map(({ hour, label }) => (
                <div key={hour} className="grid grid-cols-8 min-h-[50px] divide-x divide-[var(--border-color)]">
                  <div className="p-2 text-right text-[10px] font-medium text-[var(--text-muted)] select-none">{label}</div>
                  {Array.from({ length: 7 }, (_, i) => {
                    const d = new Date(selectedDate);
                    const day = d.getDay();
                    const diff = d.getDate() - day + (day === 0 ? -6 : 1) + i;
                    const colDate = new Date(d.setDate(diff)).toISOString().split('T')[0];
                    const entriesInSlot = filteredEntries.filter((e) => {
                      if (e.date !== colDate) return false;
                      const startH = Math.floor(parseTimeToMinutes(e.startTime || '09:00 AM') / 60);
                      return startH === hour;
                    });

                    return (
                      <div
                        key={i}
                        onClick={() => handleOpenLogModal(colDate, hour)}
                        className="relative p-1 hover:bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)]/30 transition-colors cursor-pointer group"
                      >
                        {entriesInSlot.map((entry) => (
                          <div
                            key={entry.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditEntry(entry);
                            }}
                            className="w-full rounded-lg bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] border border-blue-200/80 p-1.5 text-xs text-blue-900 shadow-2xs mb-1 hover:bg-blue-100/80 transition-all cursor-pointer"
                          >
                            <p className="font-bold truncate text-[11px]">{entry.projectName}</p>
                            <p className="text-[10px] text-blue-700 truncate">{entry.taskTitle || entry.description}</p>
                            {isAdmin && selectedEmployeeFilter === 'All' && (
                              <p className="text-[9px] text-[var(--studio-navy)]/80 truncate">{entry.employeeName}</p>
                            )}
                            <div className="flex items-center justify-between text-[9px] text-[var(--studio-navy)] mt-1 font-mono">
                              <span>{entry.startTime || '09:00 AM'}</span>
                              <span className="font-bold">{formatHoursHM(getEntryLiveHours(entry))}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: MONTH VIEW (Light Theme) */}
      {viewMode === 'month' && (
        <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-x-auto custom-scrollbar touch-pan-x shadow-sm">
          <div className="min-w-[640px] flex flex-col">
            <div className="grid grid-cols-7 border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)] py-2.5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="text-center text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-[var(--border-color)] min-h-[500px]">
              {Array.from({ length: 35 }, (_, i) => {
                const dayNum = (i % 31) + 1;
                const dateStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const dayEntries = filteredEntries.filter((e) => e.date === dateStr);
                const dayTotalHrs = dayEntries.reduce((sum, e) => sum + (e.hours || 0), 0);
                const isToday = dateStr === TODAY_DATE;

                return (
                  <div
                    key={i}
                    onClick={() => handleOpenLogModal(dateStr)}
                    className="min-h-[100px] p-2 hover:bg-[var(--bg-surface-subtle)]/80 cursor-pointer transition-colors flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold h-6 w-6 rounded-full flex items-center justify-center ${
                          isToday ? 'bg-[var(--studio-navy)] text-white font-bold' : 'text-[var(--text-secondary)]'
                        }`}
                      >
                        {dayNum}
                      </span>
                      {dayTotalHrs > 0 && (
                        <span className="text-[10px] font-bold text-[var(--text-muted)] bg-[var(--bg-surface-subtle)] px-1.5 py-0.5 rounded">
                          {formatHoursHM(dayTotalHrs)}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 mt-1">
                      {dayEntries.slice(0, 2).map((entry) => {
                        const task = state.tasks.find((t) => t.id === entry.taskId);
                        return (
                          <div
                            key={entry.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditEntry(entry);
                            }}
                            className={`text-[10px] font-semibold p-1 rounded border truncate ${
                              task?.colorClass || 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] text-blue-700 border-blue-200'
                            }`}
                          >
                            {isAdmin && selectedEmployeeFilter === 'All' ? `${getInitials(entry.employeeName)} · ` : ''}
                            {entry.taskTitle}
                          </div>
                        );
                      })}
                      {dayEntries.length > 2 && (
                        <span className="text-[9px] font-bold text-[var(--text-muted)] block pl-1">
                          +{dayEntries.length - 2} more
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
        <div className="space-y-3">
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

      {/* GOOGLE CALENDAR LOG TIME POPOVER MODAL (Light Theme) */}
      {showLogModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col bg-[var(--bg-surface)] text-[var(--text-primary)] rounded-xl sm:rounded-3xl shadow-2xl border border-[var(--border-color)] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-0 shrink-0">
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {logModalTab === 'schedule'
                  ? isAdmin && !editingEntryId
                    ? 'Assign meeting'
                    : 'Schedule Activity'
                  : 'Log Task'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowLogModal(false);
                  setFormMeetingLink('');
                  setShowMeetingLinkInput(false);
                  setLogModalTab('task');
                }}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-1.5 rounded-full hover:bg-[var(--bg-surface-subtle)] cursor-pointer transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* GCal-style Task / Schedule tabs */}
            <div className="px-4 sm:px-6 mt-3 shrink-0">
              <div className="flex items-stretch gap-6 border-b border-[#dadce0]">
                {(['task', 'schedule'] as const).map((tab) => {
                  const active = logModalTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        setLogModalTab(tab);
                        setFormType(tab === 'schedule' ? 'meeting' : 'task');
                        if (tab === 'schedule') {
                          setLogCategory('Meeting');
                          if (isAdmin && !editingEntryId && formEmployeeIds.length === 0 && formEmployeeId) {
                            setFormEmployeeIds([formEmployeeId]);
                          }
                        }
                      }}
                      className={`relative pb-2.5 text-sm font-medium cursor-pointer transition-colors duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
                        active ? 'text-[#1a73e8]' : 'text-[#3c4043] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {tab === 'task' ? 'Task' : 'Schedule'}
                      <span
                        className={`absolute left-0 right-0 bottom-0 h-[3px] rounded-t-full bg-[#1a73e8] transition-transform duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] origin-left ${
                          active ? 'scale-x-100' : 'scale-x-0'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            <form
              onSubmit={handleSaveTimesheet}
              className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-6 py-4 sm:py-5 space-y-4 text-sm"
            >
              {logModalTab === 'task' ? (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                      Task / Deliverable Name
                    </label>
                    {projectTasks.length > 0 ? (
                      <div className="relative">
                        <select
                          value={formTaskId}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            setFormTaskId(selectedId);
                            const t = projectTasks.find((task) => task.id === selectedId);
                            if (t) setFormTitle(t.title);
                          }}
                          className="w-full appearance-none rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 pr-8 text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)] transition-colors shadow-2xs cursor-pointer"
                        >
                          <option value="">Select a project task...</option>
                          {projectTasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-[var(--text-muted)] pointer-events-none" />
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder="What did you work on? (e.g. API Integration, Client Meeting)"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)] transition-colors shadow-2xs"
                        required
                      />
                    )}
                  </div>

                  <div className="flex items-start gap-3 pt-1">
                    <Clock className="h-5 w-5 text-[var(--text-muted)] shrink-0 mt-2" />
                    <div className="flex-1 space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            value={formDate}
                            max={TODAY_DATE}
                            onChange={(e) => setFormDate(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)] cursor-pointer transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={formStartTime}
                            onChange={(e) => handleTimeChange(e.target.value, formEndTime)}
                            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)] transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            End Time
                          </label>
                          <input
                            type="time"
                            value={formEndTime}
                            onChange={(e) => handleTimeChange(formStartTime, e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)] transition-colors"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] font-medium">
                        Duration:{' '}
                        <strong className="text-[var(--text-primary)] font-bold">
                          {formatHoursHM(parseFloat(formDurationHours) || 0)}
                        </strong>{' '}
                        ({formDurationHours} hrs)
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                      Activity / Meeting Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sprint planning, Client sync, Design review"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-semibold text-[var(--text-primary)] outline-none focus:border-[#1a73e8] transition-colors shadow-2xs"
                      required
                    />
                  </div>

                  <div className="flex items-start gap-3 pt-1">
                    <Clock className="h-5 w-5 text-[var(--text-muted)] shrink-0 mt-2" />
                    <div className="flex-1 space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            value={formDate}
                            onChange={(e) => setFormDate(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[#1a73e8] cursor-pointer transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            Start
                          </label>
                          <input
                            type="time"
                            value={formStartTime}
                            onChange={(e) => handleTimeChange(e.target.value, formEndTime)}
                            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[#1a73e8] transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            End
                          </label>
                          <input
                            type="time"
                            value={formEndTime}
                            onChange={(e) => handleTimeChange(formStartTime, e.target.value)}
                            className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[#1a73e8] transition-colors"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] font-medium">
                        Duration:{' '}
                        <strong className="text-[var(--text-primary)] font-bold">
                          {formatHoursHM(parseFloat(formDurationHours) || 0)}
                        </strong>
                        {formDate > TODAY_DATE && (
                          <span className="ml-2 text-[#1a73e8] font-semibold">Upcoming</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Meet-style action row */}
                  <div className="rounded-xl border border-[var(--border-color)] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowMeetingLinkInput((v) => !v)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-[var(--bg-surface-subtle)] cursor-pointer transition-colors active:scale-[0.99]"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 via-yellow-400 to-blue-500 shrink-0">
                        <Video className="h-4 w-4 text-white" />
                      </span>
                      <span className="text-sm font-medium text-[#70757a]">
                        {showMeetingLinkInput || formMeetingLink
                          ? 'Meeting link added'
                          : 'Add Google Meet video conferencing'}
                      </span>
                    </button>
                    {showMeetingLinkInput && (
                      <div className="px-3.5 pb-3 flex items-center gap-2 border-t border-slate-50 pt-2">
                        <Link2 className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                        <input
                          type="url"
                          placeholder="https://meet.google.com/..."
                          value={formMeetingLink}
                          onChange={(e) => setFormMeetingLink(e.target.value)}
                          className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[#1a73e8] transition-colors"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Shared: Project */}
              <div className="flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-[var(--text-muted)] shrink-0" />
                <div className="flex-1">
                  <select
                    value={formProjectId}
                    onChange={(e) => {
                      setFormProjectId(e.target.value);
                      setFormTaskId('');
                    }}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)] transition-colors"
                  >
                    <option value="">General / Standalone Project</option>
                    {activeProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-[var(--text-muted)] shrink-0 mt-2" />
                <div className="flex-1">
                  <textarea
                    rows={2}
                    placeholder={
                      logModalTab === 'schedule'
                        ? 'Agenda or notes for this schedule...'
                        : 'Add deliverable description or notes...'
                    }
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] p-2.5 text-xs text-[var(--text-primary)] placeholder-slate-400 outline-none focus:border-[var(--primary-blue)] transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex items-start gap-4">
                <Users className="h-5 w-5 text-[var(--text-muted)] shrink-0 mt-2" />
                <div className="flex-1 text-xs">
                  {isAdmin && logModalTab === 'schedule' && !editingEntryId ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">People</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {formEmployeeIds.length === 0 && (
                          <span className="text-[11px] font-medium text-[var(--text-muted)]">Select who should attend</span>
                        )}
                        {formEmployeeIds.map((id) => {
                          const person = accessibleEmployees.find((e) => e.id === id);
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 rounded-full border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] py-0.5 pl-2 pr-0.5 text-[11px] font-semibold text-[var(--text-primary)]"
                            >
                              {person?.name || 'Unknown'}
                              <button
                                type="button"
                                onClick={() => setFormEmployeeIds((prev) => prev.filter((item) => item !== id))}
                                className="rounded-full px-1 text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600 cursor-pointer"
                                aria-label={`Remove ${person?.name || 'person'}`}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) setFormEmployeeIds((prev) => [...prev, e.target.value]);
                          }}
                          className="rounded-md border border-[var(--border-color)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] font-medium text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)]"
                        >
                          <option value="">{formEmployeeIds.length ? '+ Add another person' : '+ Add people'}</option>
                          {accessibleEmployees
                            .filter((emp) => !formEmployeeIds.includes(emp.id) && !isTestEntity(emp.name))
                            .map((emp) => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name}{emp.designation ? ` (${emp.designation})` : ''}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  ) : isAdmin ? (
                    <select
                      value={formEmployeeId}
                      onChange={(e) => setFormEmployeeId(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-[var(--primary-blue)] focus:bg-[var(--bg-surface)] cursor-pointer transition-colors"
                    >
                      {accessibleEmployees.filter((emp) => !isTestEntity(emp.name)).map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.designation})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {state.currentPersona?.name || 'Rajesh Sharma'}
                      </span>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-medium">
                        {logModalTab === 'schedule'
                          ? 'Visible on dashboard Schedules'
                          : 'Default visibility • Recorded on timesheet'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[var(--border-color)]">
                {editingEntryId ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteEntry(editingEntryId)}
                    className="px-4 py-2 rounded-full text-rose-500 hover:text-rose-700 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors active:scale-[0.97]"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setShowLogModal(false);
                      setFormMeetingLink('');
                      setShowMeetingLinkInput(false);
                      setLogModalTab('task');
                    }}
                    className="px-4 py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] rounded-full font-semibold cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={
                      (logModalTab === 'task' && formDate > TODAY_DATE) ||
                      (logModalTab === 'schedule' && isAdmin && !editingEntryId && formEmployeeIds.length === 0)
                    }
                    className={`px-6 py-2 rounded-full text-white text-xs font-bold shadow-sm transition-[transform,background-color] duration-160 ease-out active:scale-[0.97] ${
                      logModalTab === 'task' && formDate > TODAY_DATE
                        ? 'bg-slate-300 cursor-not-allowed'
                        : logModalTab === 'task' && formDate < TODAY_DATE
                          ? 'bg-amber-600 hover:bg-amber-700 cursor-pointer'
                          : 'bg-[#1a73e8] hover:bg-[var(--studio-navy-hover)] cursor-pointer'
                    }`}
                  >
                    {logModalTab === 'schedule'
                      ? editingEntryId
                        ? 'Update Schedule'
                        : formEmployeeIds.length > 1
                          ? `Assign to ${formEmployeeIds.length} people`
                          : 'Save Schedule'
                      : formDate > TODAY_DATE
                        ? 'Future Date Not Allowed'
                        : formDate < TODAY_DATE
                          ? 'Apply for Regularization'
                          : 'Save'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
