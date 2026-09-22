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
  User,
  Video,
  Link2,
} from 'lucide-react';
import { AppState, isTestEntity, normalizeTaskStatus } from '../../services/store';
import { TimesheetEntry, Project, Task } from '../../types';
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

export const TimesheetsModule: React.FC<TimesheetsModuleProps> = ({
  state,
  onUpdateState,
  selectedProjectId = 'All',
}) => {
  const userRole = state.currentPersona?.role;
  const isSuperAdmin = userRole === 'super_admin' || userRole === 'admin';
  const isHR = userRole === 'hr_manager';
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
    isAdmin ? 'All' : state.currentPersona?.id || state.employees[0]?.id || ''
  );
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };
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

  const timeGridScrollRef = useRef<HTMLDivElement>(null);
  const HOUR_HEIGHT = 68;

  useEffect(() => {
    if (isAdmin) {
      setSelectedEmployeeFilter('All');
    } else {
      setSelectedEmployeeFilter(state.currentPersona?.id || state.employees[0]?.id || '');
    }
  }, [state.currentPersona?.id, isAdmin, state.employees]);

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
            employeeId: task.assigneeId || state.currentPersona?.id || state.employees[0]?.id || '',
            employeeName: task.assigneeName || state.currentPersona?.name || state.employees[0]?.name || 'Team Member',
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

  const filteredEntries = useMemo(() => {
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

      if (selectedEmployeeFilter !== 'All') {
        const matchesEmp =
          entry.employeeId === selectedEmployeeFilter ||
          (entry.employeeName || '').toLowerCase() ===
            (state.employees.find((e) => e.id === selectedEmployeeFilter)?.name || '').toLowerCase();
        if (!matchesEmp) return false;
      }

      if (selectedProjectFilter !== 'All') {
        if (selectedProjectFilter === 'standalone') {
          if (entry.projectId && entry.projectId !== 'standalone' && entry.projectId !== 'general') return false;
        } else {
          if (entry.projectId !== selectedProjectFilter) return false;
        }
      }
      if (statusFilter !== 'All' && entry.status !== statusFilter) return false;
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
    selectedEmployeeFilter,
    selectedProjectFilter,
    statusFilter,
    searchQuery,
    state.employees,
    state.projects,
  ]);

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

  const handleOpenLogModal = (dateStr?: string, hourNum?: number) => {
    const targetDate = dateStr || selectedDate || TODAY_DATE;
    setFormDate(targetDate);
    const startH = hourNum !== undefined ? hourNum : 9;
    const startStr = `${String(startH).padStart(2, '0')}:00`;
    const endStr = `${String(Math.min(23, startH + 1)).padStart(2, '0')}:00`;
    setFormStartTime(startStr);
    setFormEndTime(endStr);
    setFormDurationHours('1.0');
    setFormTitle('');
    setFormType('task');
    setLogModalTab('task');
    setFormMeetingLink('');
    setShowMeetingLinkInput(false);
    setFormProjectId(state.projects[0]?.id || 'standalone');
    setFormTaskId('');
    setLogCategory('Development');
    setFormBillable(true);
    setFormDescription('');
    setFormEmployeeId(isAdmin && selectedEmployeeFilter !== 'All' ? selectedEmployeeFilter : state.currentPersona?.id || state.employees[0]?.id || '');
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
    const emp =
      state.employees.find((e) => e.id === formEmployeeId) ||
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
            tasks: prev.tasks.map((t) =>
              t.id === matchedTaskId || t.id === formTaskId
                ? {
                    ...t,
                    actualHours: Math.max(0, Number(((t.actualHours || 0) + hoursDiff).toFixed(2))),
                    timeSpentSeconds: Math.max(0, Math.round(((t.actualHours || 0) + hoursDiff) * 3600)),
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
      let updatedTasks = [...state.tasks];
      let finalTaskId = matchedTaskId || formTaskId;

      setIsSaving(true);
      try {
        if (!isSchedule && !finalTaskId) {
          const resTask = await api.projects.createTask({
            projectId: formProjectId === 'standalone' ? '' : formProjectId,
            title: title,
            description: formDescription.trim() || 'Logged from Timesheets',
            assignedToEmployeeId: emp.id,
            priority: 'medium',
            dueDate: formDate,
          });

          finalTaskId = resTask.data?.id || `task_${Date.now()}`;
          const createdTask: Task = {
            id: finalTaskId,
            taskKey: `TSK-${String(state.tasks.length + 1).padStart(3, '0')}`,
            issueType: 'Task',
            projectId: formProjectId === 'standalone' ? '' : formProjectId,
            projectName: projectName,
            title: title,
            description: formDescription.trim() || 'Logged from Timesheets',
            assigneeId: emp.id,
            assigneeName: emp.name,
            assigneeAvatar: emp.avatar || '',
            reporterName: state.currentPersona.name,
            priority: 'Medium',
            status: 'In Progress',
            startDate: formDate,
            actualHours: hoursNum,
            timeSpentSeconds: Math.round(hoursNum * 3600),
            isTimerRunning: false,
            tags: ['Timesheet', category || 'Development'],
            subtasks: [],
            commentsCount: 0,
            attachedDocIds: [],
          };
          updatedTasks = [createdTask, ...updatedTasks];
        }

      const resTs = await api.projects.logTimesheet({
        projectId: formProjectId === 'standalone' ? '' : formProjectId,
        taskId: isSchedule ? undefined : finalTaskId,
        employeeId: emp.id,
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
        alert(`Backend Error: ${resTs.error.message || 'Failed to log timesheet'}`);
        return;
      }

      const newEntryId = resTs.data?.id || `ts_${Date.now()}`;
      const newEntry: TimesheetEntry = {
        id: newEntryId,
        employeeId: emp.id,
        employeeName: emp.name,
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

      onUpdateState((prev) => ({
        ...prev,
        timesheets: [newEntry, ...prev.timesheets],
        tasks: isSchedule
          ? prev.tasks
          : updatedTasks.map((t) =>
              t.id === finalTaskId
                ? {
                    ...t,
                    actualHours: Number(((t.actualHours || 0) + (finalTaskId === (matchedTaskId || formTaskId) ? hoursNum : 0)).toFixed(2)),
                    timeSpentSeconds: Math.round(((t.actualHours || 0) + (finalTaskId === (matchedTaskId || formTaskId) ? hoursNum : 0)) * 3600),
                    status: t.status === 'To Do' ? 'In Progress' : t.status,
                    progress: t.status === 'To Do' ? 50 : t.progress,
                  }
                : t
            ),
        projects: prev.projects.map((p) => {
          if (p.id === formProjectId) {
            const newHrs = Number(((p.loggedWorkHours || 0) + hoursNum).toFixed(2));
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
            entityId: newEntryId,
            ipAddress: '106.51.72.18',
            details: isSchedule
              ? `Scheduled "${title}" (${to12HourStr(formStartTime)}–${to12HourStr(formEndTime)} on ${formDate})`
              : `Logged ${hoursNum}h on "${title}" (${projectName})`,
          },
          ...prev.auditLogs,
        ],
      }));

        showToast(isSchedule ? `Scheduled "${title}"` : `Logged ${hoursNum}h on "${title}"`);
      } catch (err) {
        console.error('Failed to save timesheet', err);
        alert('Failed to save timesheet.');
      } finally {
        setIsSaving(false);
      }
    }
    setSelectedDate(formDate);
    if (selectedEmployeeFilter !== 'All' && selectedEmployeeFilter !== emp.id) {
      setSelectedEmployeeFilter('All');
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
        tasks: prev.tasks.map((t) => {
          if (t.id === entry.taskId) {
            const newHrs = Math.max(0, Number(((t.actualHours || 0) - entry.hours).toFixed(2)));
            return { ...t, actualHours: newHrs, timeSpentSeconds: Math.round(newHrs * 3600) };
          }
          return t;
        }),
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
    if (selectedApprovalIds.length === 0) return;
    setIsSaving(true);
    try {
      await api.projects.bulkUpdateTimesheets({
        timesheetIds: selectedApprovalIds,
        status: 'Approved',
        approvedBy: state.currentPersona.name
      });
      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.map((t) => selectedApprovalIds.includes(t.id) ? { ...t, status: 'Approved', approvedBy: prev.currentPersona.name } : t),
        auditLogs: [{ id: `log_${Date.now()}`, timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19), user: prev.currentPersona.name, action: 'APPROVED_TIMESHEETS_BATCH', entity: 'TimesheetEntry', entityId: 'batch', ipAddress: '106.51.72.18', details: `Approved ${selectedApprovalIds.length} timesheet records` }, ...prev.auditLogs],
      }));
      showToast(`Approved ${selectedApprovalIds.length} timesheets`);
      setSelectedApprovalIds([]);
    } catch (e) {
      console.error('Failed to batch approve timesheets', e);
      alert('Failed to batch approve timesheets.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchReject = async () => {
    if (selectedApprovalIds.length === 0) return;
    const rejectingEntries = state.timesheets.filter((t) => selectedApprovalIds.includes(t.id));

    setIsSaving(true);
    try {
      await api.projects.bulkUpdateTimesheets({
        timesheetIds: selectedApprovalIds,
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
          timesheets: prev.timesheets.filter((t) => !selectedApprovalIds.includes(t.id)),
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'REJECTED_TIMESHEETS_BATCH',
              entity: 'TimesheetEntry',
              entityId: 'batch',
              ipAddress: '106.51.72.18',
              details: `Rejected and removed ${selectedApprovalIds.length} timesheet records, deducting hours from tasks`,
            },
            ...prev.auditLogs,
          ],
        };
      });
      showToast(`Rejected & removed ${selectedApprovalIds.length} timesheets`);
      setSelectedApprovalIds([]);
    } catch (e) {
      console.error('Failed to batch reject timesheets', e);
      alert('Failed to batch reject timesheets.');
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
      alert('Failed to approve timesheet.');
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
          timesheets: prev.timesheets.filter((t) => t.id !== entry.id),
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'REJECTED_TIMESHEET',
              entity: 'TimesheetEntry',
              entityId: entry.id,
              ipAddress: '106.51.72.18',
              details: `Rejected & removed timesheet entry for "${entry.taskTitle}" and deducted hours from task`,
            },
            ...prev.auditLogs,
          ],
        };
      });
      showToast(`Rejected & removed "${entry.taskTitle}"`);
    } catch (err) {
      console.error('Failed to reject timesheet', err);
      alert('Failed to reject timesheet.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveDay = async (date: string) => {
    const dayEntries = filteredEntries.filter((e) => e.date === date);
    if (dayEntries.length === 0) return;
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
      alert('Failed to approve day timesheets.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectDay = async (date: string) => {
    const dayEntries = filteredEntries.filter((e) => e.date === date);
    if (dayEntries.length === 0) return;
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
          timesheets: prev.timesheets.filter((t) => !ids.includes(t.id)),
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'REJECTED_DAY_TIMESHEETS',
              entity: 'TimesheetEntry',
              entityId: date,
              ipAddress: '106.51.72.18',
              details: `Rejected & removed all ${dayEntries.length} timesheets for ${date}`,
            },
            ...prev.auditLogs,
          ],
        };
      });
      showToast(`Rejected & removed all ${dayEntries.length} timesheets for ${date}`);
    } catch (err) {
      console.error('Failed to reject day timesheets', err);
      alert('Failed to reject day timesheets.');
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
    <div className="space-y-4">
      {toastMessage && (
        <div className="fixed top-6 right-6 z-70 bg-white border border-slate-200 text-slate-900 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-semibold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* PAGE TITLE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Time Sheets</h1>
        </div>
      </div>

      {/* TOP HEADER: Clean Light Toolbar */}
      <div className="bg-white p-3 md:px-4 md:py-2.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5 md:space-y-0">
        {/* Desktop View (md:) */}
        <div className="hidden md:flex md:items-center md:justify-between gap-2.5 flex-wrap xl:flex-nowrap">
          {/* Date Navigation */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToday}
              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer transition-all active:scale-95 shadow-2xs"
            >
              Today
            </button>

            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handlePrevDate}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition-all"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleNextDate}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer transition-all"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <h2 className="text-sm lg:text-base font-bold text-slate-800 tracking-tight ml-1 whitespace-nowrap">
              {headerDateTitle}
            </h2>
          </div>

          {/* Desktop Right Group (Search, Filters, Switcher, Log CTA) */}
          <div className="flex items-center gap-1.5 lg:gap-2 shrink-0 justify-end">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-7 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 w-28 lg:w-32 xl:w-36 transition-all"
              />
            </div>

            <select
              value={selectedProjectFilter}
              onChange={(e) => setSelectedProjectFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none hover:bg-slate-100 focus:bg-white focus:border-blue-500 cursor-pointer max-w-[110px] lg:max-w-[130px] truncate"
            >
              <option value="All">All Projects</option>
              <option value="standalone">General / Standalone</option>
              {activeProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {isAdmin && (
              <select
                value={selectedEmployeeFilter}
                onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none hover:bg-slate-100 focus:bg-white focus:border-blue-500 cursor-pointer max-w-[115px] lg:max-w-[135px] truncate"
              >
                <option value="All">{isSuperAdmin || isHR ? 'All Employees' : `My Team (${accessibleEmployees.length})`}</option>
                {accessibleEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.designation})
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 shrink-0">
              {(['day', 'week', 'month', 'list'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                    viewMode === m
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleOpenLogModal(selectedDate)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white transition-all active:scale-95 cursor-pointer shadow-xs shrink-0 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Log Time</span>
            </button>
          </div>
        </div>

        {/* Mobile View (< md:) */}
        <div className="md:hidden space-y-2.5">
          {/* Mobile Row 1: Date Stepper + Truncated Date Title + Log Time Button */}
          <div className="flex items-center justify-between gap-2 w-full">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-0.5 shrink-0 bg-slate-100 p-0.5 rounded-lg">
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-2 py-1 rounded-md text-[11px] font-bold text-slate-700 hover:bg-white transition-all cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={handlePrevDate}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-white transition-all cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleNextDate}
                  className="h-6 w-6 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-white transition-all cursor-pointer"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <h2 className="text-xs font-bold text-slate-800 tracking-tight truncate min-w-0 flex-1">
                {headerDateTitle}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => handleOpenLogModal(selectedDate)}
              className="flex items-center gap-1 rounded-xl bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-xs font-bold text-white transition-all active:scale-95 cursor-pointer shadow-xs shrink-0"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Log Time</span>
            </button>
          </div>

          {/* Mobile Row 2: 4-Column View Switcher */}
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
            {(['day', 'week', 'month', 'list'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setViewMode(m)}
                className={`py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer text-center ${
                  viewMode === m
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Mobile Row 3: Search & Filters Grid */}
          <div className="space-y-2">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search logs by task, project..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 transition-all"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={selectedProjectFilter}
                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-blue-500 cursor-pointer"
              >
                <option value="All">All Projects</option>
                <option value="standalone">General / Standalone</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {isAdmin && (
                <select
                  value={selectedEmployeeFilter}
                  onChange={(e) => setSelectedEmployeeFilter(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">{isSuperAdmin || isHR ? 'All Employees' : `My Team (${accessibleEmployees.length})`}</option>
                  {accessibleEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.designation})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* VIEW 1: DAY VIEW (Light Theme) */}
      {viewMode === 'day' && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col shadow-sm">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white py-2.5 px-3 sm:px-4 sticky top-0 z-20 gap-2">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="hidden sm:block w-16 sm:w-20 text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                GMT+05:30
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short' })}
                </span>
                <div
                  className={`h-8 w-8 sm:h-10 sm:w-10 rounded-full flex items-center justify-center text-sm sm:text-lg mt-0.5 transition-all ${
                    selectedDate === TODAY_DATE
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'text-slate-700 font-medium'
                  }`}
                >
                  {new Date(selectedDate).getDate()}
                </div>
              </div>
              <div className="text-xs text-slate-500 pl-1 sm:pl-2">
                <span className="text-slate-900 font-bold">{formatHoursHM(todayDayTotalHours)}</span> logged
                <span className="text-slate-400 ml-1">• {todayDayEntries.length} tasks</span>
              </div>
            </div>

            {/* Admin Daily Approval Action Bar */}
            {isAdmin && todayDayEntries.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApproveDay(selectedDate)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                >
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Approve Day ({todayDayEntries.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRejectDay(selectedDate)}
                  className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
                >
                  <X className="h-3.5 w-3.5 stroke-[2.5]" />
                  <span>Reject Day</span>
                </button>
              </div>
            )}
          </div>

          <div
            ref={timeGridScrollRef}
            className="overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar relative bg-white"
          >
            <div className="relative min-h-[1632px]">
              {timeHours.map(({ hour, label }) => (
                <div
                  key={hour}
                  style={{ height: `${HOUR_HEIGHT}px`, top: `${hour * HOUR_HEIGHT}px` }}
                  className="absolute inset-x-0 flex items-start border-t border-slate-100 group cursor-pointer hover:bg-slate-50/80 transition-colors"
                  onClick={() => handleOpenLogModal(selectedDate, hour)}
                >
                  <div className="w-16 sm:w-20 pr-3 -mt-2 text-right text-[11px] font-medium text-slate-400 select-none">
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
                        const task = state.tasks.find((t) => t.id === entry.taskId);
                        const topPx = (entry.startMins / 60) * HOUR_HEIGHT;
                        const heightPx = Math.max(40, ( (entry.endMins - entry.startMins) / 60) * HOUR_HEIGHT - 2);
                        const colIndex = (entry as any).colIndex || 0;
                        const widthPct = 100 / cols.length;
                        const leftPct = widthPct * colIndex;

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
                            className={`absolute pointer-events-auto rounded-xl px-3 py-2 border shadow-sm cursor-pointer transition-all flex flex-col justify-between overflow-hidden hover:scale-[1.01] hover:shadow-md hover:z-50 ${
                              task?.colorClass
                                ? `${task.colorClass} border-slate-300/80`
                                : entry.status === 'Approved'
                                  ? 'bg-emerald-600 text-white border-emerald-500'
                                  : 'bg-blue-600 text-white border-blue-500'
                            }`}
                          >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-bold truncate leading-snug">
                              {entry.taskTitle}
                            </h4>
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                              entry.status === 'Approved'
                                ? 'bg-emerald-500/20 text-emerald-900 border border-emerald-400/40'
                                : 'bg-blue-500/20 text-blue-900 border border-blue-400/40'
                            }`}>
                              {entry.status}
                            </span>
                          </div>
                          <p className="text-[11px] opacity-80 font-medium mt-0.5 truncate">
                            {entry.startTime} – {getEntryLiveEndTime(entry)} • {formatHoursHM(getEntryLiveHours(entry))} • {entry.employeeName}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {isAdmin && entry.status !== 'Approved' && (
                            <button
                              type="button"
                              onClick={(e) => handleApproveSingle(entry, e)}
                              title="Approve Task Log"
                              className="h-6 w-6 rounded-md bg-white/80 hover:bg-emerald-500 hover:text-white text-emerald-700 flex items-center justify-center transition-colors shadow-2xs"
                            >
                              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => handleRejectSingle(entry, e)}
                              title="Reject & Remove Task Log"
                              className="h-6 w-6 rounded-md bg-white/80 hover:bg-rose-500 hover:text-white text-rose-700 flex items-center justify-center transition-colors shadow-2xs"
                            >
                              <X className="h-3.5 w-3.5 stroke-[2.5]" />
                            </button>
                          )}
                          <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap">
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
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto custom-scrollbar touch-pan-x shadow-sm">
          <div className="min-w-[640px] flex flex-col">
            <div className="grid grid-cols-8 border-b border-slate-200 bg-white py-2.5 sticky top-0 z-20">
              <div className="p-2 text-center text-[10px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-center">
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                      {colDate.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <div
                      className={`h-7 w-7 rounded-full mx-auto flex items-center justify-center text-xs mt-1 ${
                        isToday ? 'bg-blue-600 text-white font-bold' : 'text-slate-700 font-semibold'
                      }`}
                    >
                      {colDate.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="divide-y divide-slate-100 max-h-[calc(100vh-280px)] overflow-y-auto custom-scrollbar">
              {timeHours.map(({ hour, label }) => (
                <div key={hour} className="grid grid-cols-8 min-h-[50px] divide-x divide-slate-100">
                  <div className="p-2 text-right text-[10px] font-medium text-slate-400 select-none">{label}</div>
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
                        className="relative p-1 hover:bg-blue-50/30 transition-colors cursor-pointer group"
                      >
                        {entriesInSlot.map((entry) => (
                          <div
                            key={entry.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditEntry(entry);
                            }}
                            className="w-full rounded-lg bg-blue-50 border border-blue-200/80 p-1.5 text-xs text-blue-900 shadow-2xs mb-1 hover:bg-blue-100/80 transition-all cursor-pointer"
                          >
                            <p className="font-bold truncate text-[11px]">{entry.projectName}</p>
                            <p className="text-[10px] text-blue-700 truncate">{entry.taskTitle || entry.description}</p>
                            <div className="flex items-center justify-between text-[9px] text-blue-600 mt-1 font-mono">
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
        <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto custom-scrollbar touch-pan-x shadow-sm">
          <div className="min-w-[640px] flex flex-col">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 py-2.5">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="text-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 divide-x divide-y divide-slate-100 min-h-[500px]">
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
                    className="min-h-[100px] p-2 hover:bg-slate-50/80 cursor-pointer transition-colors flex flex-col justify-between group"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold h-6 w-6 rounded-full flex items-center justify-center ${
                          isToday ? 'bg-blue-600 text-white font-bold' : 'text-slate-700'
                        }`}
                      >
                        {dayNum}
                      </span>
                      {dayTotalHrs > 0 && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
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
                              task?.colorClass || 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}
                          >
                            {entry.taskTitle}
                          </div>
                        );
                      })}
                      {dayEntries.length > 2 && (
                        <span className="text-[9px] font-bold text-slate-400 block pl-1">
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
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">
                Total: <strong className="text-slate-900">{filteredEntries.length} entries</strong> (
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
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold text-[11px] uppercase tracking-wider">
                <tr>
                  {isAdmin && (
                    <th className="p-3.5 w-8">
                      <input
                        type="checkbox"
                        checked={filteredEntries.length > 0 && selectedApprovalIds.length === filteredEntries.length}
                        onChange={(e) => setSelectedApprovalIds(e.target.checked ? filteredEntries.map((entry) => entry.id) : [])}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
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
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-xs text-slate-500 font-medium">
                      No timesheet entries found matching the active filters.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const task = state.tasks.find((t) => t.id === entry.taskId);
                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                        onClick={() => handleEditEntry(entry)}
                      >
                        {isAdmin && (
                          <td className="p-3.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedApprovalIds.includes(entry.id)}
                              onChange={(e) => setSelectedApprovalIds((prev) => e.target.checked ? [...prev, entry.id] : prev.filter((id) => id !== entry.id))}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                        )}
                        <td className="p-3.5 font-medium text-slate-900 whitespace-nowrap">{entry.date}</td>
                        <td className="p-3.5 font-medium text-slate-900">{entry.employeeName}</td>
                        <td className="p-3.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-blue-700">
                            {entry.projectName || 'General'}
                          </span>
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900 max-w-[220px]">
                          <div className="flex items-center gap-2">
                            {task?.colorClass && (
                              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${task.colorClass.split(' ')[0]}`} />
                            )}
                            <span className="truncate">{entry.taskTitle}</span>
                          </div>
                        </td>
                        <td className="p-3.5 text-slate-500 whitespace-nowrap">
                          {entry.startTime || '09:00 AM'} – {getEntryLiveEndTime(entry)}
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">{formatHoursHM(getEntryLiveHours(entry))}</td>
                        <td className="p-3.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 w-max ${
                            entry.status === 'Approved'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : entry.status === 'Review' || entry.status === 'Submitted'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : entry.status === 'Rejected'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {entry.status === 'Approved' ? <Check className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            <span>{entry.status}</span>
                          </span>
                        </td>
                        <td className="p-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {isAdmin && entry.status !== 'Approved' && (
                              <button
                                type="button"
                                onClick={(e) => handleApproveSingle(entry, e)}
                                title="Approve Task Log"
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                              >
                                <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={(e) => handleRejectSingle(entry, e)}
                                title="Reject & Remove Task Log"
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <X className="h-3.5 w-3.5 stroke-[2.5]" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEditEntry(entry)}
                              title="Edit Details"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEntry(entry.id)}
                              title="Delete Log"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
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
          <div className="relative w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col bg-white text-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-0 shrink-0">
              <h3 className="text-base font-bold text-slate-900">
                {logModalTab === 'schedule' ? 'Schedule Activity' : 'Log Task'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowLogModal(false);
                  setFormMeetingLink('');
                  setShowMeetingLinkInput(false);
                  setLogModalTab('task');
                }}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-full hover:bg-slate-100 cursor-pointer transition-colors shrink-0"
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
                        if (tab === 'schedule') setLogCategory('Meeting');
                      }}
                      className={`relative pb-2.5 text-sm font-medium cursor-pointer transition-colors duration-[180ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
                        active ? 'text-[#1a73e8]' : 'text-[#3c4043] hover:text-slate-800'
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
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
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
                          className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-8 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 transition-colors shadow-2xs cursor-pointer"
                        >
                          <option value="">Select a project task...</option>
                          {projectTasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                      </div>
                    ) : (
                      <input
                        type="text"
                        placeholder="What did you work on? (e.g. API Integration, Client Meeting)"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-blue-500 transition-colors shadow-2xs"
                        required
                      />
                    )}
                  </div>

                  <div className="flex items-start gap-3 pt-1">
                    <Clock className="h-5 w-5 text-slate-500 shrink-0 mt-2" />
                    <div className="flex-1 space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            value={formDate}
                            max={TODAY_DATE}
                            onChange={(e) => setFormDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 cursor-pointer transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Start Time
                          </label>
                          <input
                            type="time"
                            value={formStartTime}
                            onChange={(e) => handleTimeChange(e.target.value, formEndTime)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            End Time
                          </label>
                          <input
                            type="time"
                            value={formEndTime}
                            onChange={(e) => handleTimeChange(formStartTime, e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 transition-colors"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Duration:{' '}
                        <strong className="text-slate-800 font-bold">
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
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                      Activity / Meeting Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sprint planning, Client sync, Design review"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none focus:border-[#1a73e8] transition-colors shadow-2xs"
                      required
                    />
                  </div>

                  <div className="flex items-start gap-3 pt-1">
                    <Clock className="h-5 w-5 text-slate-500 shrink-0 mt-2" />
                    <div className="flex-1 space-y-1.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Date
                          </label>
                          <input
                            type="date"
                            value={formDate}
                            onChange={(e) => setFormDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-[#1a73e8] cursor-pointer transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Start
                          </label>
                          <input
                            type="time"
                            value={formStartTime}
                            onChange={(e) => handleTimeChange(e.target.value, formEndTime)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-[#1a73e8] transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            End
                          </label>
                          <input
                            type="time"
                            value={formEndTime}
                            onChange={(e) => handleTimeChange(formStartTime, e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-[#1a73e8] transition-colors"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Duration:{' '}
                        <strong className="text-slate-800 font-bold">
                          {formatHoursHM(parseFloat(formDurationHours) || 0)}
                        </strong>
                        {formDate > TODAY_DATE && (
                          <span className="ml-2 text-[#1a73e8] font-semibold">Upcoming</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Meet-style action row */}
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowMeetingLinkInput((v) => !v)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-50 cursor-pointer transition-colors active:scale-[0.99]"
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
                        <Link2 className="h-4 w-4 text-slate-400 shrink-0" />
                        <input
                          type="url"
                          placeholder="https://meet.google.com/..."
                          value={formMeetingLink}
                          onChange={(e) => setFormMeetingLink(e.target.value)}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-[#1a73e8] transition-colors"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Shared: Project */}
              <div className="flex items-center gap-3">
                <Briefcase className="h-5 w-5 text-slate-500 shrink-0" />
                <div className="flex-1">
                  <select
                    value={formProjectId}
                    onChange={(e) => {
                      setFormProjectId(e.target.value);
                      setFormTaskId('');
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 transition-colors"
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
                <FileText className="h-5 w-5 text-slate-500 shrink-0 mt-2" />
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
                    className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 transition-all resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <CalendarIcon className="h-5 w-5 text-slate-500 shrink-0" />
                <div className="flex-1 flex items-center justify-between text-xs">
                  {isAdmin ? (
                    <select
                      value={formEmployeeId}
                      onChange={(e) => setFormEmployeeId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-500 focus:bg-white cursor-pointer transition-colors"
                    >
                      {state.employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.designation})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div>
                      <span className="font-semibold text-slate-800">
                        {state.currentPersona?.name || 'Rajesh Sharma'}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
                        {logModalTab === 'schedule'
                          ? 'Visible on dashboard Schedules'
                          : 'Default visibility • Recorded on timesheet'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
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
                    className="px-4 py-2 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-full font-semibold cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                )}

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={logModalTab === 'task' && formDate > TODAY_DATE}
                    className={`px-6 py-2 rounded-full text-white text-xs font-bold shadow-sm transition-[transform,background-color] duration-160 ease-out active:scale-[0.97] ${
                      logModalTab === 'task' && formDate > TODAY_DATE
                        ? 'bg-slate-300 cursor-not-allowed'
                        : logModalTab === 'task' && formDate < TODAY_DATE
                          ? 'bg-amber-600 hover:bg-amber-700 cursor-pointer'
                          : 'bg-[#1a73e8] hover:bg-blue-700 cursor-pointer'
                    }`}
                  >
                    {logModalTab === 'schedule'
                      ? editingEntryId
                        ? 'Update Schedule'
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
