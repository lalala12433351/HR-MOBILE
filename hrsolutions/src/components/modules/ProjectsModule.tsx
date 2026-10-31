'use client';
import { ResponsiveFilters } from '@/components/common/ResponsiveFilters';
import './workspaces.css';
import { TaskPanel, TaskPeopleField } from './TaskPanels';
import { DateInput } from '@/components/common/DateInput';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { MobileProjectOverview } from '@/components/mobile/MobileProjectOverview';
import { MobilePageTitle } from '@/components/mobile/MobilePageTitle';
import { MobileHeaderAction } from '@/components/mobile/MobileHeaderAction';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import mobileStyles from './mobile-workspace.module.css';
import detailStyles from './mobile-project-details.module.css';
import drawerStyles from '@/components/common/mobile-drawers.module.css';
import { useDrawerFocus } from '@/hooks/useDrawerFocus';
import {
  CheckCircle2,
  Clock,
  Plus,
  Search,
  User,
  Calendar,
  AlertCircle,
  MessageSquare,
  CheckSquare,
  Bookmark,
  Bug,
  ChevronUp,
  ChevronsUp,
  ChevronDown,
  MoreVertical,
  XCircle,
  Layers,
  Paperclip,
  FileText,
  Upload,
  Download,
  Trash2,
  ExternalLink,
  Briefcase,
  X,
  Check,
  ShieldCheck,
  Play,
  Pause,
  LogIn,
} from 'lucide-react';
import { AppState, isTestEntity, normalizeTaskStatus, normalizeTaskPriority } from '../../services/store';
import { Task, TaskAttachment, Project, TimesheetEntry, AttendanceRecord, Invoice, DriveItem } from '../../types';
import { api } from '../../services/apiClient';
import { encodeTaskBody, mapApiTask } from '../../services/backendSync';
import { adoptOpenedTimesheet, closeTaskTimesheet, boardInsertionIndex, compareTaskPriority, isTaskOverdue, mergeTimesheet, mergeVisibleColumnOrder, openTaskTimesheet, priorityTone, recurrenceLabel, sortColumnTasks } from '../../utils/taskBoard';
import { canManageProject, canManageTask, getManageableEmployees, isTaskAssignee, taskAssigneeIds, taskAssigneeNames } from '../../utils/teamAccess';
import { hasOpenAttendanceSession, isAttendanceToday } from '../../utils/attendancePunches';
import { TimesheetsModule } from './TimesheetsModule';
import {
  SlideOverDrawer,
  slideOverBodyClass,
  slideOverCancelClass,
  slideOverFooterClass,
  slideOverPrimaryClass,
} from '@/components/common/SlideOverDrawer';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { localDateKey } from '@/utils/dashboardPeople';

interface ProjectsModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

const fileTypeFromName = (name: string): DriveItem['type'] => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  if (['zip', 'rar', '7z'].includes(ext)) return 'zip';
  if (['doc', 'docx', 'txt'].includes(ext)) return 'doc';
  return 'pdf';
};

const formatFileSize = (bytes: number) => {
  if (!bytes) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const driveItemToAttachment = (item: DriveItem): TaskAttachment => ({
  id: item.id,
  name: item.name,
  size: item.size,
  type: item.type,
  s3Key: item.s3Key || (item.downloadUrl && !/^https?:|^#/.test(item.downloadUrl) ? item.downloadUrl : undefined),
  owner: item.owner,
});


const AVATAR_COLORS = [
  'person-avatar',
];

const PROJECT_CATEGORY_OPTIONS: Array<[string, string]> = [
  ['General', 'General'],
  ['Development', 'Development'],
  ['Design', 'Design & UI/UX'],
  ['DevOps', 'DevOps & Cloud'],
  ['Security', 'Security & Audit'],
  ['Marketing', 'Marketing'],
];
const PROJECT_STATUSES: Project['status'][] = ['Planning', 'In Progress', 'On Hold', 'Completed'];
const PROJECT_PRIORITIES: Project['priority'][] = ['Low', 'Medium', 'High', 'Urgent'];

type ProjectEditDraft = {
  name: string;
  code: string;
  status: Project['status'];
  priority: Project['priority'];
  description: string;
  clientId: string;
  category: string;
  managerId: string;
  startDate: string;
  endDate: string;
  totalWorkHours: string;
};

const projectFieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-slate-400';

export const ProjectsModule: React.FC<ProjectsModuleProps> = ({ state, onUpdateState }) => {
  const requestedTaskId = useSearchParams().get('task');
  const openedTaskLink = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedTaskId) { openedTaskLink.current = null; return; }
    if (openedTaskLink.current === requestedTaskId) return;
    const task = state.tasks.find(item => item.id === requestedTaskId);
    if (!task || !canManageTask(state.currentPersona, task, state.employees || [])) return;
    setSelectedTask(task);
    openedTaskLink.current = requestedTaskId;
  }, [requestedTaskId, state.tasks, state.currentPersona, state.employees]);
  const todayStr = useMemo(() => localDateKey(), []);
  const openTaskAssignment =
    state.customOptions?.profileSelfServiceSettings?.anyoneCanAssignTasks === true;
  const openProjectCreation =
    state.customOptions?.profileSelfServiceSettings?.anyoneCanCreateProjects === true;

  const mobileViewport = useMobileViewport();
  useEffect(() => { if (mobileViewport) setActiveTab('backlog'); }, [mobileViewport]);
  const [mobileBoardStatus, setMobileBoardStatus] = useState<Task['status']>('To Do');
  const [activeTab, setActiveTab] = useState<'kanban' | 'backlog' | 'timesheets' | 'projects'>('kanban');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('All');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('All');
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedProjectForDetails, setSelectedProjectForDetails] = useState<Project | null>(null);
  const projectDetailsRef = useDrawerFocus(Boolean(selectedProjectForDetails), () => setSelectedProjectForDetails(null));
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [pendingTransitionTask, setPendingTransitionTask] = useState<{
    task: Task;
    targetStatus: 'In Progress';
    source: 'drag' | 'stepper' | 'button';
    columnOrder?: string[];
  } | null>(null);

  // Kanban Drag States
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dropSlot, setDropSlot] = useState<{ column: Task['status']; index: number } | null>(null);
  const suppressCardClick = useRef(false);
  const draggedTaskIdRef = useRef<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const handleAddSubtask = async (taskId: string) => {
    if (!newSubtaskTitle.trim()) return;
    if (!ensureCanManageTask(taskId)) return;
    const current = state.tasks.find((t) => t.id === taskId);
    const description = (selectedTask?.id === taskId ? selectedTask.description : current?.description) || '';
    const subtasks = [...(current?.subtasks || []), {
      id: `sub_${Date.now()}`,
      title: newSubtaskTitle.trim(),
      completed: false,
    }];
    setIsSaving(true);
    try {
      await api.projects.updateTask(taskId, { description: encodeTaskBody(description, subtasks) });
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => t.id === taskId ? { ...t, description, subtasks } : t),
      }));
      setSelectedTask((prev) => prev && prev.id === taskId ? { ...prev, description, subtasks } : prev);
      setNewSubtaskTitle('');
    } catch (err: any) {
      setPermissionNotice(err?.message || 'Failed to save the subtask.');
      setTimeout(() => setPermissionNotice(null), 4500);
    } finally {
      setIsSaving(false);
    }
  };

  // Backend-Verified Active Time Tracking Task IDs
  const [verifiedTrackingTaskIds, setVerifiedTrackingTaskIds] = useState<Set<string>>(new Set());

  // Automatically verify any actively tracked tasks with backend
  useEffect(() => {
    const trackingTasks = state.tasks.filter(
      (t) =>
        normalizeTaskStatus(t.status) === 'In Progress' &&
        (t.isTimerRunning || t.isTrackingVerified || (t.timerStartedAt && t.timeSpentSeconds !== undefined))
    );

    trackingTasks.forEach((t) => {
      if (!verifiedTrackingTaskIds.has(t.id)) {
        api.projects
          .verifyTaskTracking(t.id, { action: 'start', title: t.title })
          .then((res) => {
            if (res.success && res.data?.isTrackingVerified) {
              setVerifiedTrackingTaskIds((prev) => new Set(prev).add(t.id));
            }
          })
          .catch((err: any) => {
            notifyApiError(err?.message || 'Failed to verify task tracking.');
          });
      }
    });

    setVerifiedTrackingTaskIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        const found = state.tasks.find((task) => task.id === id);
        if (
          found &&
          normalizeTaskStatus(found.status) === 'In Progress' &&
          (found.isTimerRunning || found.isTrackingVerified || (found.timerStartedAt && found.timeSpentSeconds !== undefined))
        ) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [state.tasks]);

  // New Project Form State
  const [newProjName, setNewProjName] = useState('');
  const [newProjCode, setNewProjCode] = useState('');
  const [newProjClient, setNewProjClient] = useState('');
  const [newProjClientId, setNewProjClientId] = useState('');
  const [newProjManagerId, setNewProjManagerId] = useState(state.employees[0]?.id || '');
  const [newProjTeamMembers, setNewProjTeamMembers] = useState<string[]>([state.employees[0]?.id || '']);
  const [newProjCategory, setNewProjCategory] = useState('General');
  const [newProjTotalHours, setNewProjTotalHours] = useState('250');
  const [newProjStartDate, setNewProjStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [newProjEndDate, setNewProjEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  });
  const [newProjStatus, setNewProjStatus] = useState<Project['status']>('Planning');
  const [newProjPriority, setNewProjPriority] = useState<Project['priority']>('High');
  const [newProjDescription, setNewProjDescription] = useState('');

  // Live Timer Tick State (1s heartbeat)
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Format total seconds into clean normal hours & mins text e.g. "0h 0m", "1h 24m"
  const formatHM = (totalSec: number) => {
    if (isNaN(totalSec) || totalSec <= 0) return '0h 0m';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h}h ${m}m`;
  };

  // Format seconds into short label e.g. "1h 30m" or "45m"
  const formatShortDuration = (totalSec: number) => {
    if (isNaN(totalSec) || totalSec <= 0) return '0h 0m';
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h}h ${m}m`;
  };

  // Compute live total seconds for any task
  const getTaskTotalSeconds = (t: Task) => {
    let secs = t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0);
    if (normalizeTaskStatus(t.status) === 'In Progress' && t.isTimerRunning && t.timerStartedAt) {
      secs += Math.max(0, Math.floor((now - t.timerStartedAt) / 1000));
    }
    return secs;
  };

  // Check if an employee or current persona is currently clocked in today.
  // An open session later in the day still counts when an earlier row has a checkout,
  // and a shift-end written for later today is not a clock-out yet.
  const normalizePersonName = (value?: string | null) =>
    String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const samePersonId = (a?: string | null, b?: string | null) => {
    const left = String(a || '').trim().toLowerCase();
    const right = String(b || '').trim().toLowerCase();
    return !!left && left === right;
  };

  const idsForPerson = (empId?: string, empName?: string) => {
    const ids = new Set<string>();
    const add = (value?: string | null) => {
      const id = String(value || '').trim().toLowerCase();
      if (id) ids.add(id);
    };
    add(empId);
    const name = normalizePersonName(empName);
    for (const emp of state.employees || []) {
      if (
        samePersonId(emp.id, empId) ||
        samePersonId(emp.employeeId, empId) ||
        (name && normalizePersonName(emp.name) === name)
      ) {
        add(emp.id);
        add(emp.employeeId);
      }
    }
    if (name && normalizePersonName(state.currentPersona?.name) === name) add(state.currentPersona?.id);
    if (samePersonId(state.currentPersona?.id, empId)) add(state.currentPersona?.id);
    return ids;
  };

  const attendanceMatchesPerson = (record: AttendanceRecord, empId?: string, empName?: string) => {
    const ids = idsForPerson(empId, empName);
    if (ids.has(String(record.employeeId || '').trim().toLowerCase())) return true;
    const name = normalizePersonName(empName);
    return !!name && normalizePersonName(record.employeeName) === name;
  };

  const isEmployeeClockedIn = (empId?: string, empName?: string) => {
    const explicit = empId != null || empName != null;
    const targetId = empId || (explicit ? undefined : state.currentPersona?.id);
    const targetName = empName || (explicit ? undefined : state.currentPersona?.name);
    return state.attendance.some(
      (record) =>
        attendanceMatchesPerson(record, targetId, targetName) &&
        isAttendanceToday(record.date) &&
        hasOpenAttendanceSession(record)
    );
  };

  const isAnyAssigneeClockedIn = (task?: Task | null) => {
    if (!task) return false;
    const ids = taskAssigneeIds(task);
    const names = taskAssigneeNames(task);
    if (!ids.length && !names.length) return isEmployeeClockedIn(task.assigneeId, task.assigneeName);
    const count = Math.max(ids.length, names.length);
    for (let index = 0; index < count; index += 1) {
      if (isEmployeeClockedIn(ids[index], names[index])) return true;
    }
    return false;
  };

  // Time belongs to the person assigned to the task. A manager moving someone
  // else's card must not land on the manager's own timesheet.
  const timesheetOwner = (task: Task): { id: string; name: string } => {
    const selfId = state.currentPersona?.id || '';
    const selfName = state.currentPersona?.name || '';
    const resolved = (id?: string, name?: string) => {
      const match = (state.employees || []).find(
        (emp) =>
          samePersonId(emp.id, id) ||
          samePersonId(emp.employeeId, id) ||
          (!!name && normalizePersonName(emp.name) === normalizePersonName(name))
      );
      return {
        id: String(match?.id || id || '').trim(),
        name: String(match?.name || name || '').trim(),
      };
    };

    if (isTaskAssignee(task, selfId, selfName)) return { id: selfId, name: selfName };

    const ids = taskAssigneeIds(task);
    const names = taskAssigneeNames(task);
    const count = Math.max(ids.length, names.length);
    for (let index = 0; index < count; index += 1) {
      const owner = resolved(ids[index], names[index] || names[0]);
      if (owner.id && isEmployeeClockedIn(ids[index], names[index] || names[0])) return owner;
    }
    const primary = resolved(ids[0] || task.assigneeId, names[0] || task.assigneeName);
    if (primary.id) return primary;
    return { id: selfId, name: selfName };
  };

  // Project & Task Hours / Rejection States
  const [showDenyReasonModal, setShowDenyReasonModal] = useState<string | null>(null);
  const [denyReasonText, setDenyReasonText] = useState('');
  const [isEditingWorkHours, setIsEditingWorkHours] = useState(false);
  const [editWorkHoursValue, setEditWorkHoursValue] = useState('250');
  const [projectEditDraft, setProjectEditDraft] = useState<ProjectEditDraft | null>(null);
  const [confirmRejectTaskId, setConfirmRejectTaskId] = useState<string | null>(null);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<Project | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);

  // New Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProj, setNewTaskProj] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(state.employees[0]?.id || '');
  const [newTaskAssignees, setNewTaskAssignees] = useState<string[]>(state.employees[0]?.id ? [state.employees[0].id] : []);
  const [newTaskPriority, setNewTaskPriority] = useState<Task['priority']>('High');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskRepeat, setNewTaskRepeat] = useState<'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly'>('none');
  const [newTaskWeekday, setNewTaskWeekday] = useState(() => new Date().getDay());
  const [newTaskRecurrenceEnd, setNewTaskRecurrenceEnd] = useState('');
  const [newTaskBillable, setNewTaskBillable] = useState(false);
  const [newTaskBillingType, setNewTaskBillingType] = useState<'deliverable' | 'hourly'>('deliverable');
  const [newTaskPrice, setNewTaskPrice] = useState('');
  const [newTaskClientId, setNewTaskClientId] = useState('');
  const [billingClients, setBillingClients] = useState<Array<{ id: string; name: string; company_name?: string; companyName?: string }>>([]);
  const [editDueScope, setEditDueScope] = useState<'occurrence' | 'future'>('occurrence');
  const [billLines, setBillLines] = useState<Array<{
    key: string;
    description: string;
    quantity: number;
    unitPrice: number;
    sourceTaskId?: string;
    sourceTimesheetId?: string;
    included: boolean;
  }>>([]);
  const [pendingUnbilledDelete, setPendingUnbilledDelete] = useState<(typeof billLines)[number] | null>(null);
  const [projectInvoices, setProjectInvoices] = useState<any[]>([]);
  const [billingModeDraft, setBillingModeDraft] = useState<'deliverable' | 'hourly'>('deliverable');
  const [hourlyRateDraft, setHourlyRateDraft] = useState('');
  const hasBillableClients = billingClients.length > 0;

  useEffect(() => {
    let cancelled = false;
    void api.billing.getClients().then((res) => {
      if (cancelled || !res.success || !Array.isArray(res.data)) return;
      setBillingClients(res.data);
      if (!res.data.length) setNewTaskBillable(false);
    }).catch(() => {
      if (!cancelled) setBillingClients([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasBillableClients) setNewTaskBillable(false);
  }, [hasBillableClients]);

  useEffect(() => {
    const proj = state.projects.find((p) => p.id === newTaskProj);
    if (proj?.clientId) setNewTaskClientId(proj.clientId);
  }, [newTaskProj, state.projects]);

  const roleHourlyRate = (employeeId?: string) => {
    const rates = state.customOptions?.hourlyBillingRatesByRole || {};
    const emp = state.employees.find((e) => e.id === employeeId);
    const role = String(emp?.role || 'employee').toLowerCase();
    return Number(rates[role] ?? rates.employee ?? 0);
  };

  const loadProjectBilling = async (project: Project) => {
    setBillingModeDraft(project.billingMode || 'deliverable');
    setHourlyRateDraft(project.hourlyRate != null ? String(project.hourlyRate) : '');
    const [unbilledRes, invoiceRes] = await Promise.all([
      api.projects.getUnbilledWork(project.id),
      api.projects.listProjectInvoices(project.id),
    ]);
    setProjectInvoices(invoiceRes.success && Array.isArray(invoiceRes.data) ? invoiceRes.data : []);
    const mode = project.billingMode || 'deliverable';
    const projectRate = project.hourlyRate;
    const lines: typeof billLines = [];
    if (unbilledRes.success && unbilledRes.data) {
      if (mode === 'hourly') {
        for (const ts of unbilledRes.data.timesheets || []) {
          const when = ts.occurrence_date
            ? String(ts.occurrence_date).slice(0, 10)
            : String(ts.work_date || '').slice(0, 10);
          lines.push({
            key: `ts-${ts.id}`,
            description: when ? `${ts.task_title} (${when})` : String(ts.task_title || 'Work'),
            quantity: Number(ts.hours_spent) || 0,
            unitPrice: projectRate != null && Number(projectRate) > 0 ? Number(projectRate) : roleHourlyRate(ts.employee_id),
            sourceTimesheetId: ts.id,
            included: true,
          });
        }
      } else {
        for (const task of unbilledRes.data.tasks || []) {
          const when = task.occurrence_date ? String(task.occurrence_date).slice(0, 10) : '';
          lines.push({
            key: `task-${task.id}`,
            description: when ? `${task.title} (${when})` : task.title,
            quantity: 1,
            unitPrice: Number(task.unit_price) || 0,
            sourceTaskId: task.id,
            included: true,
          });
        }
      }
    }
    setBillLines(lines);
  };

  useEffect(() => {
    if (!selectedProjectForDetails) return;
    loadProjectBilling(selectedProjectForDetails).catch((err) => console.error(err));
    // Reload when the open project changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectForDetails?.id]);

  useEffect(() => {
    setProjectEditDraft(null);
    setIsEditingWorkHours(false);
  }, [selectedProjectForDetails?.id]);

  const saveTaskDescription = async (task: Task, value: string) => {
    const previous = state.tasks.find((item) => item.id === task.id)?.description ?? '';
    if (value === previous) return;
    if (!ensureCanManageTask(task.id)) return;
    try {
      await api.projects.updateTask(task.id, { description: encodeTaskBody(value, task.subtasks || []) });
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((item) => item.id === task.id ? { ...item, description: value } : item),
      }));
      setSelectedTask((prev) => prev && prev.id === task.id ? { ...prev, description: value } : prev);
    } catch (err: any) {
      notifyApiError(err?.message || 'Failed to save the description.');
    }
  };

  const saveTaskDueDate = async (task: Task, value: string) => {
    if (!ensureCanManageTask(task.id)) return;
    const dueDate = value || null;
    const applyTo = task.recurrenceSeriesId ? editDueScope : 'occurrence';
    try {
      await api.projects.updateTask(task.id, { dueDate, applyTo });
      if (applyTo === 'future') {
        const refreshed = await api.projects.getTasks();
        if (refreshed.success && Array.isArray(refreshed.data)) {
          onUpdateState((prev) => ({ ...prev, tasks: refreshed.data.map(mapApiTask) }));
        }
      } else {
        onUpdateState((prev) => ({
          ...prev,
          tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, dueDate: dueDate || undefined } : t)),
        }));
      }
      setSelectedTask((prev) => (prev && prev.id === task.id ? { ...prev, dueDate: dueDate || undefined } : prev));
    } catch (err: any) {
      notifyApiError(err?.message || 'Failed to save the due date.');
    }
  };

  const saveTaskPriority = async (task: Task, priority: Task['priority']) => {
    if (priority === task.priority) return;
    if (!ensureCanManageTask(task.id)) return;
    try {
      await api.projects.updateTask(task.id, { priority: priority.toLowerCase() });
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, priority } : t)),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'TASK_PRIORITY_UPDATED',
            entity: 'Task',
            entityId: task.id,
            ipAddress: '106.51.72.18',
            details: `Changed priority of "${task.title}" from ${task.priority} to ${priority}`,
          },
          ...prev.auditLogs,
        ],
      }));
      setSelectedTask((prev) => (prev && prev.id === task.id ? { ...prev, priority } : prev));
    } catch (err: any) {
      notifyApiError(err?.message || 'Failed to save the priority.');
    }
  };
  const saveTaskAssignees = async (task: Task, ids: string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (
      unique.join(',') === taskAssigneeIds(task).join(',') &&
      unique.length === taskAssigneeIds(task).length
    ) {
      return;
    }
    if (!openTaskAssignment && !ensureCanManageTask(task.id)) return;
    const people = unique
      .map((id) => state.employees.find((emp) => emp.id === id))
      .filter(Boolean) as typeof state.employees;
    try {
      await api.projects.updateTask(task.id, { assignedToEmployeeIds: unique });
      const next = {
        assigneeId: people[0]?.id || '',
        assigneeName: people[0]?.name || (unique.length ? 'Team Member' : 'Unassigned'),
        assigneeIds: unique,
        assigneeNames: people.map((person) => person.name),
      };
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, ...next } : t)),
      }));
      setSelectedTask((prev) => (prev && prev.id === task.id ? { ...prev, ...next } : prev));
    } catch (err: any) {
      notifyApiError(err?.message || 'Failed to save assignees.');
    }
  };

  const saveProjectBilling = async () => {
    if (!selectedProjectForDetails) return;
    if (!ensureCanManageProject(selectedProjectForDetails.id)) return;
    try {
      await api.projects.updateProject(selectedProjectForDetails.id, {
        billingMode: billingModeDraft,
        hourlyRate: hourlyRateDraft === '' ? null : Number(hourlyRateDraft),
      });
      const next: Project = {
        ...selectedProjectForDetails,
        billingMode: billingModeDraft,
        hourlyRate: hourlyRateDraft === '' ? undefined : Number(hourlyRateDraft),
      };
      setSelectedProjectForDetails(next);
      onUpdateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) => (p.id === next.id ? { ...p, billingMode: next.billingMode, hourlyRate: next.hourlyRate } : p)),
      }));
      await loadProjectBilling(next);
    } catch (err: any) {
      notifyApiError(err?.message || 'Failed to save billing settings.');
    }
  };

  const createDraftInvoice = async () => {
    const project = selectedProjectForDetails;
    if (!project) return;
    if (!ensureCanManageProject(project.id)) return;
    const lines = billLines.filter((line) => line.included);
    if (lines.length === 0) {
      notifyApiError('Select at least one completed item to invoice.');
      return;
    }
    try {
      const res = await api.projects.createProjectInvoice(project.id, {
        lines: lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          sourceTaskId: line.sourceTaskId,
          sourceTimesheetId: line.sourceTimesheetId,
        })),
      });
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Could not create the invoice');
      }
      const inv = res.data;
      const draft: Invoice = {
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        customerId: project.id,
        customerName: inv.customer_name || project.clientName || project.name,
        issueDate: String(inv.issue_date || '').slice(0, 10),
        dueDate: String(inv.due_date || '').slice(0, 10),
        subtotal: Number(inv.subtotal) || 0,
        gstAmount: Number(inv.gst_amount) || 0,
        totalAmount: Number(inv.total_amount) || 0,
        paidAmount: Number(inv.paid_amount) || 0,
        status: 'Draft',
        items: (inv.lines || []).map((line: any) => ({
          description: line.description,
          quantity: Number(line.quantity) || 0,
          unitPrice: Number(line.unit_price) || 0,
          total: Number(line.total) || 0,
        })),
      };
      onUpdateState((prev) => ({
        ...prev,
        invoices: [draft, ...(prev.invoices || [])],
      }));
      await loadProjectBilling(project);
    } catch (err: any) {
      notifyApiError(err?.message || 'Could not create the invoice.');
    }
  };

  const sendProjectInvoice = async (invoiceId: string) => {
    if (!ensureCanManageProject(selectedProjectForDetails?.id)) return;
    try {
      await api.projects.updateInvoice(invoiceId, { status: 'sent' });
      setProjectInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: 'sent' } : inv)));
      onUpdateState((prev) => ({
        ...prev,
        invoices: (prev.invoices || []).map((inv: Invoice) => (inv.id === invoiceId ? { ...inv, status: 'Sent' } : inv)),
      }));
    } catch (err: any) {
      notifyApiError(err?.message || 'Could not send the invoice.');
    }
  };

  const deleteUnbilledProjectTask = (line: (typeof billLines)[number]) => {
    const project = selectedProjectForDetails;
    const taskId = String(line.sourceTaskId || '').trim();
    if (!project || !taskId) return;
    if (!ensureCanManageProject(project.id)) return;
    setPendingUnbilledDelete(line);
  };

  const confirmDeleteUnbilledProjectTask = async () => {
    const line = pendingUnbilledDelete;
    const project = selectedProjectForDetails;
    const taskId = String(line?.sourceTaskId || '').trim();
    if (!project || !line || !taskId) return;
    if (!ensureCanManageProject(project.id)) return;
    setIsSaving(true);
    try {
      await api.projects.deleteTask(taskId);
      setBillLines((prev) => prev.filter((row) => row.sourceTaskId !== taskId));
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
      }));
      await loadProjectBilling(project);
      setPendingUnbilledDelete(null);
    } catch (err: any) {
      notifyApiError(err?.message || 'Could not delete the task.');
    } finally {
      setIsSaving(false);
    }
  };

  // Quick Log Time on Selected Task
  const [showTaskLogTimeModal, setShowTaskLogTimeModal] = useState(false);
  const [taskLogHours, setTaskLogHours] = useState('1.0');
  const [taskLogDate, setTaskLogDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [taskLogCategory, setTaskLogCategory] = useState<'Development' | 'Testing' | 'Design' | 'Code Review' | 'Meeting'>('Development');
  const [taskLogBillable, setTaskLogBillable] = useState(true);
  const [taskLogDescription, setTaskLogDescription] = useState('');

  // Document Attachment State
  const [showAttachDriveModal, setShowAttachDriveModal] = useState(false);
  const [showUploadAttachModal, setShowUploadAttachModal] = useState(false);
  const [attachSearchQuery, setAttachSearchQuery] = useState('');
  const [pendingAttachFile, setPendingAttachFile] = useState<File | null>(null);
  const [isAttachingDoc, setIsAttachingDoc] = useState(false);
  const attachFileInputRef = useRef<HTMLInputElement>(null);

  const userRole = (state.currentPersona?.role || '').toLowerCase();
  const isSuperAdmin = userRole === 'super_admin' || userRole === 'admin';
  const isHR = userRole === 'hr_manager';
  const isManagerRole =
    userRole === 'manager' ||
    userRole === 'project_manager' ||
    userRole === 'team_lead' ||
    userRole === 'sales_manager' ||
    userRole === 'finance_manager';
  // Managers must be able to view/assign team tasks (setup assigns leads as "manager")
  const isAdmin = isSuperAdmin || isHR || isManagerRole;
  const canCreateProjects = isAdmin || openProjectCreation;

  const visiblePeople = useMemo(
    () => getManageableEmployees(state.currentPersona, state.employees || []),
    [state.currentPersona, state.employees]
  );
  const assignableEmployees = useMemo(
    () => (openTaskAssignment ? state.employees || [] : visiblePeople),
    [openTaskAssignment, state.employees, visiblePeople]
  );
  const canFilterByPerson = visiblePeople.length > 1;
  const priorityOptions = useMemo(() => {
    const custom = (state.customOptions?.taskPriorities || []).map((p) => p.name).filter(Boolean);
    return custom.length ? custom : ['Low', 'Medium', 'High', 'Urgent'];
  }, [state.customOptions?.taskPriorities]);

  const canPickAssignees = isAdmin || openTaskAssignment;
  const canManageThisTask = (task?: Task | null) => canManageTask(state.currentPersona, task, state.employees || []);
  const canManageThisProject = (project?: Project | null) =>
    canManageProject(state.currentPersona, project, state.employees || []);

  const flashPermissionNotice = (message: string) => {
    setPermissionNotice(message);
    setTimeout(() => setPermissionNotice(null), 4000);
  };

  /** Returns false (and shows a notice) when the current user may not modify this task. */
  const ensureCanManageTask = (taskOrId?: Task | string | null): boolean => {
    const task = typeof taskOrId === 'string' ? state.tasks.find((t) => t.id === taskOrId) : taskOrId;
    if (task && canManageThisTask(task)) return true;
    flashPermissionNotice("You can't modify tasks that belong to someone above you or outside your team.");
    return false;
  };

  const ensureCanManageProject = (projectOrId?: Project | string | null): boolean => {
    const project = typeof projectOrId === 'string' ? state.projects.find((p) => p.id === projectOrId) : projectOrId;
    if (project && canManageThisProject(project)) return true;
    flashPermissionNotice("You can't modify projects led by someone above you or outside your team.");
    return false;
  };

  const getAssigneeAvatarStyle = (name: string) => {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  };

  const renderAssigneeStack = (task: Task, size = 24) => {
    const names = taskAssigneeNames(task);
    const label = names.length ? names : ['Unassigned'];
    const shown = label.slice(0, 3);
    return (
      <div className="work-assignees flex items-center min-w-0">
        <div className={`flex ${shown.length > 1 ? '-space-x-1.5' : ''}`}>
          {shown.map((name, index) => (
            <div
              key={`${name}-${index}`}
              title={name}
              className={`work-assignee-mark rounded-full flex items-center justify-center shrink-0 ${shown.length > 1 ? 'ring-2 ring-white' : ''} ${getAssigneeAvatarStyle(name)}`}
              style={{
                width: size,
                height: size,
                minWidth: size,
                fontSize: Math.round(size * 0.4),
                zIndex: shown.length - index,
              }}
            >
              {getInitials(name)}
            </div>
          ))}
        </div>
        <span className="ml-2 text-[11px] text-slate-600 font-medium truncate">
          {label.length === 1 ? label[0] : `${label[0]} +${label.length - 1}`}
        </span>
      </div>
    );
  };

  const resolveTaskAttachments = (task: Task): TaskAttachment[] => {
    if (task.attachedDocs && task.attachedDocs.length) return task.attachedDocs;
    return (task.attachedDocIds || []).map((id) => {
      const item = state.driveItems.find((d) => d.id === id);
      return item ? driveItemToAttachment(item) : { id, name: id };
    });
  };

  const applyTaskAttachments = (
    taskId: string,
    docs: TaskAttachment[],
    options?: { auditDetails?: string; driveItem?: DriveItem }
  ) => {
    const ids = docs.map((doc) => doc.id);
    onUpdateState((prev) => ({
      ...prev,
      driveItems: options?.driveItem
        ? [options.driveItem, ...prev.driveItems.filter((item) => item.id !== options.driveItem!.id)]
        : prev.driveItems,
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, attachedDocs: docs, attachedDocIds: ids } : t
      ),
      auditLogs: options?.auditDetails
        ? [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: state.currentPersona.name,
              action: 'TASK_DOCUMENT_ATTACHED',
              entity: 'Task',
              entityId: taskId,
              ipAddress: '106.51.72.18',
              details: options.auditDetails,
            },
            ...prev.auditLogs,
          ]
        : prev.auditLogs,
    }));
    setSelectedTask((prev) => (prev && prev.id === taskId ? { ...prev, attachedDocs: docs, attachedDocIds: ids } : prev));
    api.projects.updateTask(taskId, { attachedDocs: docs }).catch((err: any) => {
      flashPermissionNotice(err?.message || 'Could not save the document attachment.');
    });
  };

  const handleAttachExistingDoc = (doc: DriveItem | TaskAttachment) => {
    if (!selectedTask) return;
    if (!ensureCanManageTask(selectedTask.id)) return;
    const attachment: TaskAttachment = 'folderCategory' in doc ? driveItemToAttachment(doc) : doc;
    const next = [...resolveTaskAttachments(selectedTask).filter((item) => item.id !== attachment.id), attachment];
    applyTaskAttachments(selectedTask.id, next, {
      auditDetails: `Attached document "${attachment.name}" to task "${selectedTask.title}"`,
    });
    setShowAttachDriveModal(false);
    setAttachSearchQuery('');
  };

  const handleUploadAndAttach = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !pendingAttachFile) return;
    if (!ensureCanManageTask(selectedTask.id)) return;

    setIsAttachingDoc(true);
    const file = pendingAttachFile;
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    let newDocId = `doc_${Date.now()}`;
    let s3Key: string | undefined;

    try {
      try {
        const presigned = await api.storage.getPresignedUploadUrl({
          module: 'documents',
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          fileSizeBytes: file.size,
        });
        const uploadData = presigned.data as { uploadUrl: string; s3Key: string };
        s3Key = uploadData.s3Key;
        await api.storage.uploadFileToS3(uploadData.uploadUrl, file);
        try {
          const registered = await api.storage.registerDocument({
            employeeId: state.currentPersona.id,
            docType: 'Projects',
            fileName: file.name,
            s3Key: uploadData.s3Key,
            fileSizeBytes: file.size,
          });
          if (registered?.data?.id) newDocId = String(registered.data.id);
        } catch {
          /* attachment still saved on the task if catalog registration fails */
        }
      } catch (err: any) {
        flashPermissionNotice(err?.message || 'Could not upload the file. It will still be listed on this task.');
      }

      const newDriveDoc: DriveItem = {
        id: newDocId,
        name: file.name,
        type: fileTypeFromName(file.name),
        size: formatFileSize(file.size),
        owner: state.currentPersona.name,
        uploadedAt: nowStr,
        modifiedDate: nowStr,
        folderCategory: 'Projects',
        tags: ['Deliverable', 'Attachment'],
        projectId: selectedTask.projectId,
        taskId: selectedTask.id,
        taskTitle: selectedTask.title,
        s3Key,
        downloadUrl: s3Key,
      };
      const attachment: TaskAttachment = driveItemToAttachment(newDriveDoc);

      applyTaskAttachments(
        selectedTask.id,
        [...resolveTaskAttachments(selectedTask).filter((item) => item.id !== attachment.id), attachment],
        {
          auditDetails: `Uploaded & attached "${file.name}" to task "${selectedTask.title}"`,
          driveItem: newDriveDoc,
        }
      );

      setShowUploadAttachModal(false);
      setPendingAttachFile(null);
      if (attachFileInputRef.current) attachFileInputRef.current.value = '';
    } finally {
      setIsAttachingDoc(false);
    }
  };

  const handleRemoveAttachment = (docId: string) => {
    if (!selectedTask) return;
    if (!ensureCanManageTask(selectedTask.id)) return;
    applyTaskAttachments(
      selectedTask.id,
      resolveTaskAttachments(selectedTask).filter((doc) => doc.id !== docId)
    );
  };

  const handleDownloadAttachment = async (doc: TaskAttachment) => {
    if (!doc.s3Key) {
      flashPermissionNotice('This file is not available for download.');
      return;
    }
    try {
      const res = await api.storage.getPresignedDownloadUrl(doc.s3Key);
      const url = (res.data as { downloadUrl?: string })?.downloadUrl;
      if (!url) throw new Error('Download URL missing');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      flashPermissionNotice(err?.message || 'Could not download the file.');
    }
  };

  const activeProjects = state.projects.filter(
    (p) => !isTestEntity(p.name) && !isTestEntity(p.code) && !isTestEntity(p.clientName)
  );

  const projectStatusChip = (status?: string) => {
    if (status === 'Completed') return 'work-chip work-chip-sage';
    if (status === 'On Hold' || status === 'Denied') return 'work-chip work-chip-error';
    if (status === 'Planning' || status === 'Pending Approval') return 'work-chip work-chip-muted';
    return 'work-chip work-chip-navy';
  };

  const projectDateLabel = (project: Project) => {
    const start = project.startDate ? String(project.startDate).slice(0, 10) : '';
    const end = project.endDate ? String(project.endDate).slice(0, 10) : '';
    if (start && end) return `${start} – ${end}`;
    return start || end || '—';
  };

  const projectHourBudget = (project: Project) => {
    const budget = Number(project.totalWorkHours);
    return Number.isFinite(budget) && budget > 0 ? budget : 0;
  };

  // Jira Issue Type Badge Helper
  const getIssueTypeBadge = (type?: Task['issueType']) => {
    const label = type === 'Bug' ? 'Bug' : type === 'Story' ? 'Story' : type === 'Improvement' ? 'Improvement' : 'Task';
    const mark =
      type === 'Bug' ? 'work-type work-type-bug' : type === 'Story' ? 'work-type work-type-story' : type === 'Improvement' ? 'work-type work-type-improvement' : 'work-type work-type-task';
    const Icon = type === 'Bug' ? Bug : type === 'Story' ? Bookmark : CheckSquare;
    return (
      <span className={mark} title={label} aria-label={label}>
        <Icon className="h-3 w-3" strokeWidth={2.4} />
      </span>
    );
  };

  const getPriorityBadge = (priority: Task['priority']) => {
    const Icon = priority === 'Urgent' || priority === 'High' ? ChevronsUp : priority === 'Low' ? ChevronDown : ChevronUp;
    const tone = priorityTone(priority);
    return (
      <span className={`work-chip work-chip-${tone} gap-1`} title={`${priority} priority`} aria-label={`${priority} priority`}>
        <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} aria-hidden="true" />
        {priority}
      </span>
    );
  };

  const taskStatusChip = (status: string) => {
    const s = normalizeTaskStatus(status);
    if (s === 'Completed') return 'work-chip work-chip-sage';
    if (s === 'In Progress' || s === 'Review') return 'work-chip work-chip-navy';
    return 'work-chip work-chip-muted';
  };

  const notifyApiError = (message: string) => {
    setPermissionNotice(message);
    setTimeout(() => setPermissionNotice(null), 4500);
  };

  const persistTaskStatus = (
    taskId: string,
    nextStatus: Task['status'],
    previousStatus: Task['status'],
    extra?: { timeSpentSeconds?: number; timerStartedAt?: number | null }
  ) => {
    api.projects.updateTask(taskId, { status: nextStatus, ...extra }).then((res: any) => {
      const next = res?.nextTask;
      if (!next) return;
      const mapped = mapApiTask(next);
      onUpdateState((prev) => ({
        ...prev,
        tasks: [mapped, ...prev.tasks.filter((t) => t.id !== mapped.id)],
      }));
    }).catch((err: any) => {
      notifyApiError(err?.message || 'Failed to update task status on the server.');
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, status: previousStatus } : t)),
      }));
      if (selectedTask?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, status: previousStatus } : prev));
      }
    });
  };

  // Helper for Clean Jira Issue Key
  const getTaskKey = (t: Task) => {
    if (t.taskKey) return t.taskKey;
    const prefix = t.issueType === 'Bug' ? 'BUG' : t.issueType === 'Story' ? 'STR' : 'TSK';
    const num = t.id.replace(/\D/g, '').slice(-3) || '101';
    return `${prefix}-${num}`;
  };

  // Drag and Drop Handlers for Kanban Board
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!ensureCanManageTask(task)) {
      e.preventDefault();
      return;
    }

    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    suppressCardClick.current = true;
    draggedTaskIdRef.current = taskId;
    // A state update inside dragstart re-renders the card before Chrome commits the gesture and cancels it.
    window.setTimeout(() => {
      if (draggedTaskIdRef.current === taskId) setDraggedTaskId(taskId);
    }, 0);
  };

  const rememberDropSlot = (column: Task['status'], index: number) => {
    setDragOverColumn((current) => (current === column ? current : column));
    setDropSlot((current) => (current?.column === column && current.index === index ? current : { column, index }));
  };

  const handleDragOver = (e: React.DragEvent, colStatus: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn((current) => (current === colStatus ? current : colStatus));
  };

  const handleDragLeave = (e: React.DragEvent, colStatus: string) => {
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    if (dragOverColumn === colStatus) {
      setDragOverColumn(null);
    }
    setDropSlot((prev) => (prev?.column === colStatus ? null : prev));
  };

  const handleDragEnd = () => {
    draggedTaskIdRef.current = null;
    setDraggedTaskId(null);
    setDragOverColumn(null);
    setDropSlot(null);
  };

  const tasksInStatus = (status: Task['status'], tasks: Task[] = state.tasks) =>
    tasks.filter((task) => !task.isRecurrenceTemplate && normalizeTaskStatus(task.status) === status);

  const withColumnOrder = (tasks: Task[], orderedIds: string[]) =>
    tasks.map((task) => {
      const boardOrder = orderedIds.indexOf(task.id);
      return boardOrder >= 0 ? { ...task, boardOrder } : task;
    });

  const persistColumnOrder = (orderedIds: string[]) => {
    if (!orderedIds.length) return;
    api.projects.reorderTasks(orderedIds.map((id, boardOrder) => ({ id, boardOrder }))).catch((err: any) => {
      notifyApiError(err?.message || 'Failed to save the board order.');
    });
  };

  const saveColumnOrder = (orderedIds: string[]) => {
    if (!orderedIds.length) return;
    onUpdateState((prev) => ({
      ...prev,
      tasks: withColumnOrder(prev.tasks, orderedIds),
    }));
    persistColumnOrder(orderedIds);
  };

  const handleDrop = async (e: React.DragEvent, targetStatus: Task['status'], rawIndex?: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverColumn(null);
    setDropSlot(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskIdRef.current || draggedTaskId;
    draggedTaskIdRef.current = null;
    setDraggedTaskId(null);

    if (!taskId) return;

    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (!ensureCanManageTask(task)) return;

    const sameColumn = normalizeTaskStatus(task.status) === targetStatus;
    const visibleWithout = sortColumnTasks(
      filteredTasks.filter((item) => normalizeTaskStatus(item.status) === targetStatus && item.id !== task.id)
    );
    const insertAt = Math.max(0, Math.min(rawIndex ?? visibleWithout.length, visibleWithout.length));
    const nextVisible = [...visibleWithout];
    nextVisible.splice(insertAt, 0, { ...task, status: targetStatus });
    const orderedIds = mergeVisibleColumnOrder(
      [...tasksInStatus(targetStatus).filter((item) => item.id !== task.id), { ...task, status: targetStatus }],
      nextVisible
    );
    const currentIds = sortColumnTasks(tasksInStatus(targetStatus)).map((item) => item.id);

    if (sameColumn) {
      if (orderedIds.join('|') !== currentIds.join('|')) saveColumnOrder(orderedIds);
      return;
    }

    // Only Super Admin can drag a task in Review to Completed
    if (normalizeTaskStatus(task.status) === 'Review' && targetStatus === 'Completed') {
      if (!isSuperAdmin) {
        setPermissionNotice('Only Super Admin can approve and mark tasks in Review as Completed.');
        setTimeout(() => setPermissionNotice(null), 4500);
        return;
      }
    }

    // If moving to In Progress, enforce that the user and assignee are clocked in
    if ((targetStatus as string) === 'In Progress') {
      const isCurrentPersonaClockedIn = isEmployeeClockedIn(state.currentPersona?.id, state.currentPersona?.name);
      if (!isCurrentPersonaClockedIn) {
        setPermissionNotice('You are not clocked in. Please clock in to your shift before moving tasks to In Progress.');
        setTimeout(() => setPermissionNotice(null), 5000);
        return;
      }

      const isAssigneeClockedIn = isAnyAssigneeClockedIn(task);
      if (!isAssigneeClockedIn) {
        setPermissionNotice(`Cannot move task to In Progress: none of the assignees are clocked in today.`);
        setTimeout(() => setPermissionNotice(null), 5000);
        return;
      }

      setPendingTransitionTask({ task, targetStatus: 'In Progress', source: 'drag', columnOrder: orderedIds });
      return;
    }

    const nowTime = Date.now();
    let closedTimesheet: TimesheetEntry | null = null;
    let closedSeconds: number | undefined;
    if (normalizeTaskStatus(task.status) === 'In Progress') {
      try {
        const closed = await closeTaskTimesheet(task, state.timesheets, nowTime, {
          employeeId: timesheetOwner(task).id,
        });
        closedTimesheet = closed.timesheet;
        closedSeconds = closed.timeSpentSeconds;
      } catch (err: any) {
        notifyApiError(err?.message || 'Failed to save the timesheet for this task.');
        return;
      }
    }

    onUpdateState((prev) => {
      let updatedTimesheets = mergeTimesheet(prev.timesheets, closedTimesheet, false);
      const updatedTasks = prev.tasks.map((t) => {
        if (t.id !== taskId) return t;

        let timeSpentSeconds = closedSeconds ?? (t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0));
        let isTimerRunning = t.isTimerRunning;
        let timerStartedAt = t.timerStartedAt;

        if (normalizeTaskStatus(t.status) === 'In Progress') {
          isTimerRunning = false;
          timerStartedAt = undefined;
        }

        const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));

        return {
          ...t,
          status: targetStatus,
          openTimesheetId: undefined,
          timeSpentSeconds,
          timerStartedAt,
          isTimerRunning,
          actualHours,
          progress:
            targetStatus === 'Completed'
              ? 100
              : targetStatus === 'Review'
                ? 85
                : (targetStatus as string) === 'In Progress'
                  ? 50
                  : 10,
        };
      });

      return {
        ...prev,
        tasks: withColumnOrder(updatedTasks, orderedIds),
        timesheets: updatedTimesheets,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'TASK_STATUS_UPDATED',
            entity: 'Task',
            entityId: taskId,
            ipAddress: '106.51.72.18',
            details: `Moved task "${task.title}" to "${targetStatus}" via Drag & Drop`,
          },
          ...prev.auditLogs,
        ],
      };
    });

    persistTaskStatus(
      taskId,
      targetStatus,
      task.status,
      closedSeconds != null ? { timeSpentSeconds: closedSeconds, timerStartedAt: null } : undefined
    );
    persistColumnOrder(orderedIds);
    if (targetStatus !== 'In Progress') {
      setVerifiedTrackingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      api.projects.verifyTaskTracking(taskId, { action: 'stop' }).catch((err: any) => {
        notifyApiError(err?.message || 'Failed to stop task tracking.');
      });
    }

    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask((prev) => {
        if (!prev) return null;
        let timeSpentSeconds = prev.timeSpentSeconds || (prev.actualHours ? Math.round(prev.actualHours * 3600) : 0);
        let isTimerRunning = prev.isTimerRunning;
        let timerStartedAt = prev.timerStartedAt;

        if (normalizeTaskStatus(prev.status) === 'In Progress') {
          if (isTimerRunning && timerStartedAt) {
            const elapsed = Math.max(0, Math.floor((nowTime - timerStartedAt) / 1000));
            timeSpentSeconds += elapsed;
          }
          isTimerRunning = false;
          timerStartedAt = undefined;
        }

        return {
          ...prev,
          status: targetStatus,
          timeSpentSeconds,
          timerStartedAt,
          isTimerRunning,
          actualHours: Number((timeSpentSeconds / 3600).toFixed(2)),
        };
      });
    }
  };

  // Direct Status Changer inside Task Drawer
  const handleUpdateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || normalizeTaskStatus(task.status) === newStatus) return;
    if (!ensureCanManageTask(task)) return;

    if (normalizeTaskStatus(task.status) === 'Review' && newStatus === 'Completed') {
      if (!isSuperAdmin) {
        setPermissionNotice('Only Super Admin can approve and mark tasks in Review as Completed.');
        setTimeout(() => setPermissionNotice(null), 4500);
        return;
      }
    }

    // If moving to In Progress, enforce that the user and assignee are clocked in
    if ((newStatus as string) === 'In Progress') {
      const isCurrentPersonaClockedIn = isEmployeeClockedIn(state.currentPersona?.id, state.currentPersona?.name);
      if (!isCurrentPersonaClockedIn) {
        setPermissionNotice('You are not clocked in. Please clock in to your shift before moving tasks to In Progress.');
        setTimeout(() => setPermissionNotice(null), 5000);
        return;
      }

      const isAssigneeClockedIn = isAnyAssigneeClockedIn(task);
      if (!isAssigneeClockedIn) {
        setPermissionNotice(`Cannot move task to In Progress: none of the assignees are clocked in today.`);
        setTimeout(() => setPermissionNotice(null), 5000);
        return;
      }

      setPendingTransitionTask({ task, targetStatus: 'In Progress', source: 'stepper' });
      return;
    }

    const nowTime = Date.now();
    let closedTimesheet: TimesheetEntry | null = null;
    let closedSeconds: number | undefined;
    if (normalizeTaskStatus(task.status) === 'In Progress') {
      try {
        const closed = await closeTaskTimesheet(task, state.timesheets, nowTime, {
          employeeId: timesheetOwner(task).id,
        });
        closedTimesheet = closed.timesheet;
        closedSeconds = closed.timeSpentSeconds;
      } catch (err: any) {
        notifyApiError(err?.message || 'Failed to save the timesheet for this task.');
        return;
      }
    }

    persistTaskStatus(
      taskId,
      newStatus,
      task.status,
      closedSeconds != null ? { timeSpentSeconds: closedSeconds, timerStartedAt: null } : undefined
    );
    if (newStatus !== 'In Progress') {
      setVerifiedTrackingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      api.projects.verifyTaskTracking(taskId, { action: 'stop' }).catch((err: any) => {
        notifyApiError(err?.message || 'Failed to stop task tracking.');
      });
    }

    onUpdateState((prev) => {
      const updatedTimesheets = mergeTimesheet(prev.timesheets, closedTimesheet, false);
      const updatedTasks = prev.tasks.map((t) => {
        if (t.id !== taskId) return t;

        let timeSpentSeconds = closedSeconds ?? (t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0));
        let isTimerRunning = t.isTimerRunning;
        let timerStartedAt = t.timerStartedAt;

        if (normalizeTaskStatus(t.status) === 'In Progress') {
          isTimerRunning = false;
          timerStartedAt = undefined;
        }

        const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));

        return {
          ...t,
          status: newStatus,
          openTimesheetId: undefined,
          timeSpentSeconds,
          timerStartedAt,
          isTimerRunning,
          actualHours,
          progress:
            newStatus === 'Completed'
              ? 100
              : newStatus === 'Review'
                ? 85
                : (newStatus as string) === 'In Progress'
                  ? 50
                  : 10,
        };
      });

      return {
        ...prev,
        tasks: updatedTasks,
        timesheets: updatedTimesheets,
      };
    });

    setSelectedTask((prev) => {
      if (!prev || prev.id !== taskId) return prev;
      let timeSpentSeconds = prev.timeSpentSeconds || (prev.actualHours ? Math.round(prev.actualHours * 3600) : 0);
      let isTimerRunning = prev.isTimerRunning;
      let timerStartedAt = prev.timerStartedAt;

      if (normalizeTaskStatus(prev.status) === 'In Progress') {
        if (isTimerRunning && timerStartedAt) {
          const elapsed = Math.max(0, Math.floor((nowTime - timerStartedAt) / 1000));
          timeSpentSeconds += elapsed;
        }
        isTimerRunning = false;
        timerStartedAt = undefined;
      }

      return {
        ...prev,
        status: newStatus,
        timeSpentSeconds,
        timerStartedAt,
        isTimerRunning,
        actualHours: Number((timeSpentSeconds / 3600).toFixed(2)),
      };
    });
  };

  // Execute transition to In Progress with Tracking and Auto Check-In options
  const executeTaskTransition = async (
    taskId: string,
    targetStatus: Task['status'],
    startTimer: boolean,
    autoCheckIn: boolean = false
  ) => {
    const nowTime = Date.now();
    const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const targetTask = state.tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    const hasConfiguredOffice =
      (Array.isArray(state.customOptions?.offices) && state.customOptions.offices.length > 0) ||
      !!(state.organization?.officeLocation?.address && state.organization.officeLocation.address.trim() !== '');
    if (autoCheckIn && !hasConfiguredOffice) {
      setPermissionNotice('Office Setup Required: Attendance is disabled because no office location has been configured in Settings.');
      setTimeout(() => setPermissionNotice(null), 5000);
      return;
    }
    if (targetStatus === 'In Progress' && !autoCheckIn) {
      const isAssigneeClockedIn = isAnyAssigneeClockedIn(targetTask);
      const isCurrentPersonaClockedIn = isEmployeeClockedIn(state.currentPersona?.id, state.currentPersona?.name);
      if (!isAssigneeClockedIn && !isCurrentPersonaClockedIn) {
        setPermissionNotice('You must clock in / check in attendance before moving tasks to In Progress.');
        setTimeout(() => setPermissionNotice(null), 5000);
        return;
      }
    }

    const pausedSessions: Array<{ id: string; timesheet: TimesheetEntry | null; timeSpentSeconds: number }> = [];
    if (startTimer) {
      const others = state.tasks.filter(
        (t) =>
          t.id !== taskId &&
          t.isTimerRunning &&
          (t.assigneeId === targetTask.assigneeId ||
            (targetTask.assigneeName && t.assigneeName === targetTask.assigneeName))
      );
      for (const other of others) {
        try {
          const closed = await closeTaskTimesheet(other, state.timesheets, nowTime, {
            keepOpen: true,
            employeeId: timesheetOwner(other).id,
          });
          await api.projects.updateTask(other.id, {
            timeSpentSeconds: closed.timeSpentSeconds,
            timerStartedAt: null,
          });
          pausedSessions.push({ id: other.id, timesheet: closed.timesheet, timeSpentSeconds: closed.timeSpentSeconds });
        } catch (err: any) {
          notifyApiError(err?.message || 'Failed to pause the other running task.');
          return;
        }
      }
    }

    let openedTimesheet: TimesheetEntry | null = null;
    try {
      const owner = timesheetOwner(targetTask);
      openedTimesheet = await openTaskTimesheet(targetTask, owner.id, owner.name);
    } catch (err: any) {
      notifyApiError(err?.message || 'Failed to log this task on the timesheet.');
      return;
    }

    onUpdateState((prev) => {
      let updatedAttendance = prev.attendance;

      const hasConfiguredOffice =
        (Array.isArray(prev.customOptions?.offices) && prev.customOptions.offices.length > 0) ||
        !!(prev.organization?.officeLocation?.address && prev.organization.officeLocation.address.trim() !== '');

      if (autoCheckIn && hasConfiguredOffice) {
        const officeAddress = prev.customOptions?.offices?.[0] || prev.organization?.officeLocation?.address || 'Primary Office';
        const officeLat = prev.organization?.officeLocation?.latitude || 0;
        const officeLng = prev.organization?.officeLocation?.longitude || 0;

        const newRecord: AttendanceRecord = {
          id: `att_${Date.now()}`,
          employeeId: prev.currentPersona.id,
          employeeName: prev.currentPersona.name,
          avatar: prev.currentPersona.avatar,
          date: todayStr,
          checkIn: nowStr,
          status: 'Present',
          locationName: officeAddress,
          latitude: officeLat,
          longitude: officeLng,
          isWithinGeofence: true,
          ipAddress: '106.51.72.18',
          device: 'Web App / Desktop',
          workingHours: 0,
          breakHours: 0,
        };
        updatedAttendance = [
          newRecord,
          ...prev.attendance.filter(
            (a) => !(a.employeeId === prev.currentPersona.id && a.date === todayStr)
          ),
        ];
      }

      const targetTask = prev.tasks.find((t) => t.id === taskId);
      const assigneeId = targetTask?.assigneeId;
      const assigneeName = targetTask?.assigneeName;

      let updatedTimesheets = [...prev.timesheets];
      const columnOrder = pendingTransitionTask?.task.id === taskId ? pendingTransitionTask.columnOrder : undefined;

      const updatedTasks = prev.tasks.map((t) => {
        let timeSpentSeconds = t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0);
        let isTimerRunning = t.isTimerRunning;
        let timerStartedAt = t.timerStartedAt;

        if (t.id === taskId) {
          if (startTimer) {
            isTimerRunning = true;
            timerStartedAt = nowTime;
          } else {
            isTimerRunning = false;
            timerStartedAt = undefined;
          }
          const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));
          return {
            ...t,
            status: targetStatus,
            timeSpentSeconds,
            timerStartedAt,
            isTimerRunning,
            actualHours,
            progress: 50,
            openTimesheetId: openedTimesheet?.id,
          };
        }

        // Auto-pause any other task currently tracking for this assignee
        if (
          startTimer &&
          (t.assigneeId === assigneeId || (assigneeName && t.assigneeName === assigneeName)) &&
          normalizeTaskStatus(t.status) === 'In Progress' &&
          t.isTimerRunning
        ) {
          const paused = pausedSessions.find((session) => session.id === t.id);
          const pausedSeconds = paused?.timeSpentSeconds ?? timeSpentSeconds;
          return {
            ...t,
            isTimerRunning: false,
            timerStartedAt: undefined,
            timeSpentSeconds: pausedSeconds,
            actualHours: Number((pausedSeconds / 3600).toFixed(2)),
          };
        }

        return t;
      }).map((t) => {
        if (!columnOrder) return t;
        const boardOrder = columnOrder.indexOf(t.id);
        return boardOrder >= 0 ? { ...t, boardOrder } : t;
      });

      updatedTimesheets = adoptOpenedTimesheet(updatedTimesheets, openedTimesheet);
      for (const paused of pausedSessions) {
        updatedTimesheets = mergeTimesheet(updatedTimesheets, paused.timesheet, true);
      }

      return {
        ...prev,
        attendance: updatedAttendance,
        tasks: updatedTasks,
        timesheets: updatedTimesheets,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: autoCheckIn ? 'CHECKIN_AND_TASK_STARTED' : 'TASK_MOVED_IN_PROGRESS',
            entity: 'Task',
            entityId: taskId,
            ipAddress: '106.51.72.18',
            details: `Moved task "${targetTask?.title || taskId}" to In Progress and logged to Timesheets ${startTimer ? '(Live tracking active)' : '(Tracking paused)'}${autoCheckIn ? ' and checked in attendance' : ''}`,
          },
          ...prev.auditLogs,
        ],
      };
    });

    persistTaskStatus(taskId, targetStatus, targetTask?.status || 'To Do', {
      timerStartedAt: startTimer ? nowTime : null,
      timeSpentSeconds: targetTask.timeSpentSeconds || 0,
    });
    const columnOrder = pendingTransitionTask?.task.id === taskId ? pendingTransitionTask.columnOrder : undefined;
    if (columnOrder?.length) {
      api.projects.reorderTasks(columnOrder.map((id, boardOrder) => ({ id, boardOrder }))).catch((err: any) => {
        notifyApiError(err?.message || 'Failed to save the board order.');
      });
    }

    if (startTimer) {
      api.projects
        .verifyTaskTracking(taskId, { action: 'start', title: targetTask?.title })
        .then((res) => {
          if (res.success && res.data?.isTrackingVerified) {
            setVerifiedTrackingTaskIds((prev) => new Set(prev).add(taskId));
          }
        })
        .catch((err: any) => {
          notifyApiError(err?.message || 'Failed to start task tracking.');
        });
    }

    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask((prev) => {
        if (!prev) return null;
        let timeSpentSeconds = prev.timeSpentSeconds || (prev.actualHours ? Math.round(prev.actualHours * 3600) : 0);
        return {
          ...prev,
          status: targetStatus,
          timeSpentSeconds,
          timerStartedAt: startTimer ? nowTime : undefined,
          isTimerRunning: startTimer,
          actualHours: Number((timeSpentSeconds / 3600).toFixed(2)),
          progress: 50,
        };
      });
    }

    setPendingTransitionTask(null);
  };

  // Toggle Live Timer (Play / Pause) for an In Progress task
  const handleToggleTimer = async (taskId: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (!ensureCanManageTask(task)) return;

    // If starting/resuming timer, verify attendance check-in
    if (!task.isTimerRunning) {
      const isAssigneeClockedIn = isAnyAssigneeClockedIn(task);
      const isCurrentPersonaClockedIn = isEmployeeClockedIn(state.currentPersona?.id, state.currentPersona?.name);

      if (!isAssigneeClockedIn && !isCurrentPersonaClockedIn) {
        setPendingTransitionTask({ task, targetStatus: 'In Progress', source: 'button' });
        return;
      }
    }

    const nowTime = Date.now();
    const starting = !task.isTimerRunning;
    let sessionSheet: TimesheetEntry | null = null;
    let persistedSeconds = task.timeSpentSeconds || (task.actualHours ? Math.round(task.actualHours * 3600) : 0);
    try {
      const owner = timesheetOwner(task);
      if (starting) {
        sessionSheet = await openTaskTimesheet(task, owner.id, owner.name);
        await api.projects.updateTask(taskId, {
          status: 'In Progress',
          timerStartedAt: nowTime,
          timeSpentSeconds: persistedSeconds,
        });
      } else {
        const closed = await closeTaskTimesheet(task, state.timesheets, nowTime, {
          keepOpen: true,
          employeeId: owner.id,
        });
        sessionSheet = closed.timesheet;
        persistedSeconds = closed.timeSpentSeconds;
        await api.projects.updateTask(taskId, {
          timerStartedAt: null,
          timeSpentSeconds: persistedSeconds,
        });
      }
    } catch (err: any) {
      notifyApiError(err?.message || 'Failed to update the timesheet for this task.');
      return;
    }

    onUpdateState((prev) => {
      const updatedTasks = prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const timeSpentSeconds = starting
          ? t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0)
          : persistedSeconds;
        return {
          ...t,
          timeSpentSeconds,
          timerStartedAt: starting ? nowTime : undefined,
          isTimerRunning: starting,
          actualHours: Number((timeSpentSeconds / 3600).toFixed(2)),
          openTimesheetId: sessionSheet?.id || t.openTimesheetId,
        };
      });

      return {
        ...prev,
        tasks: updatedTasks,
        timesheets: starting
          ? adoptOpenedTimesheet(prev.timesheets, sessionSheet)
          : mergeTimesheet(prev.timesheets, sessionSheet, true),
      };
    });

    setSelectedTask((prev) => {
      if (!prev || prev.id !== taskId) return prev;
      const timeSpentSeconds = starting
        ? prev.timeSpentSeconds || (prev.actualHours ? Math.round(prev.actualHours * 3600) : 0)
        : persistedSeconds;
      return {
        ...prev,
        timeSpentSeconds,
        timerStartedAt: starting ? nowTime : undefined,
        isTimerRunning: starting,
        actualHours: Number((timeSpentSeconds / 3600).toFixed(2)),
        openTimesheetId: sessionSheet?.id || prev.openTimesheetId,
      };
    });

    if (!task.isTimerRunning) {
      api.projects
        .verifyTaskTracking(taskId, { action: 'start', title: task.title })
        .then((res) => {
          if (res.success && res.data?.isTrackingVerified) {
            setVerifiedTrackingTaskIds((prev) => new Set(prev).add(taskId));
          }
        })
        .catch((err: any) => {
          notifyApiError(err?.message || 'Failed to start task tracking.');
        });
    } else {
      setVerifiedTrackingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      api.projects.verifyTaskTracking(taskId, { action: 'stop', title: task.title }).catch((err: any) => {
        notifyApiError(err?.message || 'Failed to stop task tracking.');
      });
    }
  };

  // Subtask Management in Drawer
  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    if (!ensureCanManageTask(taskId)) return;
    const current = state.tasks.find((t) => t.id === taskId);
    if (!current) return;
    const description = (selectedTask?.id === taskId ? selectedTask.description : current.description) || '';
    const subtasks = (current.subtasks || []).map((st) => (st.id === subtaskId ? { ...st, completed: !st.completed } : st));
    onUpdateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, description, subtasks } : t)),
    }));
    setSelectedTask((prev) => (prev && prev.id === taskId ? { ...prev, description, subtasks } : prev));
    api.projects.updateTask(taskId, { description: encodeTaskBody(description, subtasks) }).catch((err: any) => {
      notifyApiError(err?.message || 'Failed to update the subtask.');
    });
  };

  const handleCreateSubtask = async (taskId: string) => {
    if (!newSubtaskTitle.trim()) return;
    if (!ensureCanManageTask(taskId)) return;

    const newSt = {
      id: `st_${Date.now()}`,
      title: newSubtaskTitle.trim(),
      completed: false,
    };

    setIsSaving(true);
    try {
      const targetTask = state.tasks.find((t) => t.id === taskId);
      if (targetTask) {
        const subtasks = [...(targetTask.subtasks || []), newSt];
        const description = (selectedTask?.id === taskId ? selectedTask.description : targetTask.description) || '';
        await api.projects.updateTask(taskId, { description: encodeTaskBody(description, subtasks) });
      }

      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== taskId) return t;
          return { ...t, subtasks: [...(t.subtasks || []), newSt] };
        }),
      }));

      setSelectedTask((prev) => {
        if (!prev || prev.id !== taskId) return prev;
        return { ...prev, subtasks: [...(prev.subtasks || []), newSt] };
      });
      setNewSubtaskTitle('');
    } catch (e) {
      console.error('Failed to save subtask', e);
      alert('Failed to save subtask.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSubtask = async (taskId: string, subtaskId: string) => {
    if (!ensureCanManageTask(taskId)) return;
    setIsSaving(true);
    try {
      const targetTask = state.tasks.find((t) => t.id === taskId);
      if (targetTask) {
        const subtasks = (targetTask.subtasks || []).filter((st) => st.id !== subtaskId);
        const description = (selectedTask?.id === taskId ? selectedTask.description : targetTask.description) || '';
        await api.projects.updateTask(taskId, { description: encodeTaskBody(description, subtasks) });
      }

      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => {
          if (t.id !== taskId) return t;
          return { ...t, subtasks: (t.subtasks || []).filter((st) => st.id !== subtaskId) };
        }),
      }));

      setSelectedTask((prev) => {
        if (!prev || prev.id !== taskId) return prev;
        return { ...prev, subtasks: (prev.subtasks || []).filter((st) => st.id !== subtaskId) };
      });
    } catch (e) {
      console.error('Failed to delete subtask', e);
      alert('Failed to delete subtask.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtered Tasks. Priority is the default order; the board can override it per column.
  const filteredTasks: Task[] = state.tasks.filter((t) => {
    if (t.isRecurrenceTemplate) return false;
    if (isTestEntity(t.title) || isTestEntity(t.description) || isTestEntity(t.projectName || '')) {
      return false;
    }

    // Own tasks, plus a manager's team. Assigning a task to someone does not reveal their other work.
    if (!canManageThisTask(t)) return false;

    const matchesProj =
      selectedProjectId === 'All' ||
      (selectedProjectId === 'standalone'
        ? !t.projectId || t.projectId === 'standalone' || t.projectId === 'general' || t.projectId === ''
        : t.projectId === selectedProjectId);

    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.projectName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.tags || []).some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())) ||
      taskAssigneeNames(t).some((name) => name.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesEmployee =
      !canFilterByPerson
        ? true
        : selectedEmployeeId === 'All' ||
        taskAssigneeIds(t).includes(selectedEmployeeId) ||
        taskAssigneeNames(t).some(
          (name) =>
            name.toLowerCase() ===
            (visiblePeople.find((e) => e.id === selectedEmployeeId)?.name || '').toLowerCase()
        );

    return matchesProj && matchesSearch && matchesEmployee;
  });
  filteredTasks.sort((a, b) => compareTaskPriority(a, b));

  const filteredProjects = activeProjects.filter((project) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || `${project.name} ${project.code} ${project.clientName || ''}`.toLowerCase().includes(query);
    const matchesProject = selectedProjectId === 'All' || project.id === selectedProjectId;
    const matchesPerson = selectedEmployeeId === 'All' || project.managerId === selectedEmployeeId || project.teamMembers?.includes(selectedEmployeeId);
    return matchesSearch && matchesProject && (!canFilterByPerson || matchesPerson);
  });

  const columns: Task['status'][] = ['To Do', 'In Progress', 'Review', 'Completed'];

  useEffect(() => {
    if (!selectedTask && !selectedProjectForDetails && !showCreateTaskModal && !showCreateProjectModal) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]');
      if (dialogs[dialogs.length - 1]?.getAttribute('aria-label') === 'Project details') setSelectedProjectForDetails(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [selectedTask, selectedProjectForDetails, showCreateTaskModal, showCreateProjectModal]);

  const handleOpenCreateTaskModal = (projId?: string) => {
    const targetProj =
      projId !== undefined
        ? projId
        : selectedProjectId !== 'All' && selectedProjectId !== 'standalone'
          ? selectedProjectId
          : '';

    setNewTaskProj(targetProj);
    const defaultEmp =
      assignableEmployees.find(
        (e) =>
          e.id === state.currentPersona?.id ||
          (e.email && e.email.toLowerCase() === state.currentPersona?.email?.toLowerCase())
      ) || assignableEmployees[0] || state.employees[0];
    const defaultId = defaultEmp?.id || state.currentPersona?.id || '';
    setNewTaskAssignee(defaultId);
    setNewTaskAssignees(defaultId ? [defaultId] : []);
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('High');
    setNewTaskBillable(billingClients.length > 0);
    setShowCreateTaskModal(true);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const canBillTask = hasBillableClients && newTaskBillable;
    if (newTaskBillable && !hasBillableClients) {
      flashPermissionNotice('Add a billable client before creating billable tasks.');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const isStandalone = !newTaskProj || newTaskProj === 'standalone';
    const proj = !isStandalone ? state.projects.find((p) => p.id === newTaskProj) : undefined;
    const targetAssigneeIds = canPickAssignees
      ? (newTaskAssignees.length ? newTaskAssignees : newTaskAssignee ? [newTaskAssignee] : [])
      : [state.currentPersona?.id || state.employees[0]?.id || ''].filter(Boolean);
    if (!openTaskAssignment && targetAssigneeIds.some((id) => id !== state.currentPersona?.id && !assignableEmployees.some((e) => e.id === id))) {
      flashPermissionNotice("You can't assign tasks to someone above you or outside your team.");
      return;
    }
    const targetAssigneeId = targetAssigneeIds[0] || '';
    const assignedEmployees = targetAssigneeIds
      .map((id) => state.employees.find((e) => e.id === id))
      .filter(Boolean) as typeof state.employees;
    const emp =
      assignedEmployees[0] ||
      state.employees.find(
        (e) =>
          e.id === targetAssigneeId ||
          (e as any).employeeCode === targetAssigneeId ||
          (e.email && e.email.toLowerCase() === targetAssigneeId.toLowerCase())
      ) ||
      state.employees.find(
        (e) =>
          e.id === state.currentPersona?.id ||
          (e.email && e.email.toLowerCase() === state.currentPersona?.email?.toLowerCase())
      ) ||
      state.employees[0] ||
      state.currentPersona;

    setIsSaving(true);
    try {
      const taskRes = await api.projects.createTask({
        projectId: isStandalone ? '' : proj?.id || '',
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || 'Sprint deliverable requirement.',
        assignedToEmployeeId: emp?.id || (targetAssigneeId && targetAssigneeId !== 'user_admin' ? targetAssigneeId : undefined),
        assignedToEmployeeIds: targetAssigneeIds.filter((id) => id && id !== 'user_admin'),
        priority: newTaskPriority?.toLowerCase() as any,
        dueDate: newTaskDueDate || null,
        billable: canBillTask,
        billingType: newTaskBillingType,
        unitPrice: Number(newTaskPrice) || 0,
        clientId: canBillTask ? newTaskClientId || undefined : undefined,
        recurrence: newTaskRepeat === 'none' ? null : {
          frequency: newTaskRepeat,
          weekday: newTaskWeekday,
          endDate: newTaskRecurrenceEnd || null,
        },
      });

      if (!taskRes.success) {
        throw new Error(taskRes.error?.message || 'Request failed');
      }

      const mapped = taskRes.data
        ? mapApiTask({
            ...taskRes.data,
            project_name: isStandalone ? 'General' : proj?.name || 'General Project',
            assigned_to_name: emp?.name || state.currentPersona?.name,
          })
        : null;
      const newTask: Task = {
        id: mapped?.id || taskRes.data?.id || `task_${Date.now()}`,
        taskKey: taskRes.data?.task_key || `TSK-${String(state.tasks.length + 1).padStart(3, '0')}`,
        issueType: 'Task',
        projectId: isStandalone ? '' : proj?.id || '',
        projectName: isStandalone ? 'General' : proj?.name || 'General Project',
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || 'Sprint deliverable requirement.',
        assigneeId: emp?.id || state.currentPersona?.id || '',
        assigneeName: emp?.name || state.currentPersona?.name || 'Workspace Member',
        assigneeIds: assignedEmployees.map((person) => person.id),
        assigneeNames: assignedEmployees.map((person) => person.name),
        assigneeAvatar: emp?.avatar || state.currentPersona?.avatar || '',
        reporterName: state.currentPersona?.name || 'Admin',
        priority: newTaskPriority,
        status: 'To Do',
        startDate: today,
        dueDate: mapped?.dueDate,
        billable: mapped?.billable ?? canBillTask,
        billingType: mapped?.billingType || newTaskBillingType,
        unitPrice: mapped?.unitPrice ?? (Number(newTaskPrice) || 0),
        clientId: mapped?.clientId || (canBillTask ? newTaskClientId || undefined : undefined),
        recurrenceRule: mapped?.recurrenceRule || (newTaskRepeat === 'none' ? null : { frequency: newTaskRepeat, weekday: newTaskWeekday }),
        recurrenceSeriesId: mapped?.recurrenceSeriesId,
        recurrenceEnd: mapped?.recurrenceEnd,
        occurrenceDate: mapped?.occurrenceDate,
        parentTaskId: mapped?.parentTaskId,
        actualHours: 0,
        timeSpentSeconds: 0,
        isTimerRunning: false,
        tags: [],
        subtasks: [],
        commentsCount: 0,
        attachedDocIds: [],
      };

      onUpdateState((prev) => ({
        ...prev,
        tasks: [newTask, ...prev.tasks],
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'TASK_CREATED',
            entity: 'Task',
            entityId: newTask.id,
            ipAddress: '106.51.72.18',
            details: `Created task "${newTask.title}"`,
          },
          ...prev.auditLogs,
        ],
        notifications: [
          {
            id: `notif_${Date.now()}`,
            title: 'Task Created & Assigned',
            message: `"${newTask.title}" assigned to ${newTask.assigneeNames?.join(', ') || newTask.assigneeName}.`,
            timestamp: 'Just now',
            category: 'Tasks' as const,
            priority: (newTask.priority === 'Urgent' ? 'urgent' : newTask.priority === 'High' ? 'high' : 'medium') as any,
            read: false,
            linkModule: 'Projects',
            actorName: prev.currentPersona.name,
            actorAvatar: prev.currentPersona.avatar,
            actionLabel: 'View Task',
          },
          ...prev.notifications,
        ],
      }));

      setShowCreateTaskModal(false);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskDueDate('');
      setNewTaskRepeat('none');
      setNewTaskRecurrenceEnd('');
      setNewTaskPrice('');
      setNewTaskBillable(billingClients.length > 0);
      setNewTaskBillingType('deliverable');
    } catch (e) {
      console.error('Task creation failed', e);
      alert(`Could not create task in backend database: ${e instanceof Error ? e.message : 'Request failed'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = (taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const taskToDelete = state.tasks.find((t) => t.id === taskId);
    if (!taskToDelete) return;
    if (!ensureCanManageTask(taskToDelete)) return;
    setPendingDeleteTask(taskToDelete);
  };

  const confirmDeleteTask = async () => {
    const taskToDelete = pendingDeleteTask;
    if (!taskToDelete) return;
    const taskId = taskToDelete.id;

    setIsSaving(true);
    try {
      await api.projects.deleteTask(taskId);

      if (taskToDelete.isTimerRunning) {
        api.projects.verifyTaskTracking(taskId, { action: 'stop' }).catch((err: any) => {
          notifyApiError(err?.message || 'Failed to stop task tracking.');
        });
      }

      setVerifiedTrackingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });

      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
      }

      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
        timesheets: prev.timesheets.filter((ts) => ts.taskId !== taskId),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona?.name || 'Admin',
            action: 'TASK_DELETED',
            entity: 'Task',
            entityId: taskId,
            ipAddress: '106.51.72.18',
            details: `Deleted task "${taskToDelete.title}"`,
          },
          ...prev.auditLogs,
        ],
      }));
      setPendingDeleteTask(null);
    } catch (err) {
      console.warn('Backend task delete note:', err);
      alert('Failed to delete task.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveTimesheet = async (timesheetId: string) => {
    setIsSaving(true);
    try {
      await api.projects.updateTimesheet(timesheetId, { status: 'Approved', approvedBy: state.currentPersona.name });

      onUpdateState((prev) => {
        const updatedTimesheets = prev.timesheets.map((ts) =>
          ts.id === timesheetId
            ? { ...ts, status: 'Approved' as const, approvedBy: prev.currentPersona.name }
            : ts
        );

        const approvedTaskHours = updatedTimesheets
          .filter((ts) => ts.taskId === selectedTask?.id && ts.status === 'Approved')
          .reduce((sum, ts) => sum + ts.hours, 0);

        const updatedTasks = prev.tasks.map((t) =>
          t.id === selectedTask?.id ? { ...t, actualHours: approvedTaskHours } : t
        );

        return {
          ...prev,
          timesheets: updatedTimesheets,
          tasks: updatedTasks,
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'TIMESHEET_APPROVED',
              entity: 'TimesheetEntry',
              entityId: timesheetId,
              ipAddress: '106.51.72.18',
              details: `Approved timesheet entry for task "${selectedTask?.title}"`,
            },
            ...prev.auditLogs,
          ],
        };
      });
    } catch (e) {
      console.error('Failed to approve timesheet', e);
      alert('Failed to approve timesheet.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectTimesheet = async (timesheetId: string) => {
    setIsSaving(true);
    try {
      await api.projects.updateTimesheet(timesheetId, { status: 'Rejected', approvedBy: state.currentPersona.name });

      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.map((ts) =>
          ts.id === timesheetId
            ? { ...ts, status: 'Rejected' as const, approvedBy: prev.currentPersona.name }
            : ts
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'TIMESHEET_REJECTED',
            entity: 'TimesheetEntry',
            entityId: timesheetId,
            ipAddress: '106.51.72.18',
            details: `Rejected timesheet entry for task "${selectedTask?.title}"`,
          },
          ...prev.auditLogs,
        ],
      }));
    } catch (e) {
      console.error('Failed to reject timesheet', e);
      alert('Failed to reject timesheet.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBatchApproveTaskTimesheets = async () => {
    if (!selectedTask) return;
    const timesheetsToApprove = state.timesheets
      .filter((ts) => ts.taskId === selectedTask.id && (ts.status === 'Submitted' || ts.status === 'Draft'))
      .map((ts) => ts.id);
    
    if (timesheetsToApprove.length === 0) return;

    setIsSaving(true);
    try {
      await api.projects.bulkUpdateTimesheets({
        timesheetIds: timesheetsToApprove,
        status: 'Approved',
        approvedBy: state.currentPersona.name
      });

      onUpdateState((prev) => {
        const updatedTimesheets = prev.timesheets.map((ts) =>
          ts.taskId === selectedTask.id && (ts.status === 'Submitted' || ts.status === 'Draft')
            ? { ...ts, status: 'Approved' as const, approvedBy: prev.currentPersona.name }
            : ts
        );

        const approvedTaskHours = updatedTimesheets
          .filter((ts) => ts.taskId === selectedTask.id && ts.status === 'Approved')
          .reduce((sum, ts) => sum + ts.hours, 0);

        const updatedTasks = prev.tasks.map((t) =>
          t.id === selectedTask.id ? { ...t, actualHours: approvedTaskHours } : t
        );

        return {
          ...prev,
          timesheets: updatedTimesheets,
          tasks: updatedTasks,
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'TIMESHEET_BATCH_APPROVED',
              entity: 'Task',
              entityId: selectedTask.id,
              ipAddress: '106.51.72.18',
              details: `Batch approved all pending timesheet hours for task "${selectedTask.title}"`,
            },
            ...prev.auditLogs,
          ],
        };
      });
    } catch (e) {
      console.error('Failed to batch approve timesheets', e);
      alert('Failed to batch approve timesheets.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTaskQuickLogTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    if (!ensureCanManageTask(selectedTask)) return;
    const todayStr = new Date().toISOString().split('T')[0];
    if (taskLogDate > todayStr) {
      alert("Cannot log time for future dates!");
      return;
    }

    const hours = parseFloat(taskLogHours) || 1.0;
    const isPast = taskLogDate < todayStr;
    const isAutoApproved = isAdmin && !isPast;

    setIsSaving(true);
    try {
      const newEntry: TimesheetEntry = {
        id: `ts_${Date.now()}`,
        employeeId: state.currentPersona.id,
        employeeName: state.currentPersona.name,
        projectId: selectedTask.projectId,
        projectName: selectedTask.projectName,
        taskId: selectedTask.id,
        taskTitle: selectedTask.title,
        date: taskLogDate,
        startTime: '09:00 AM',
        endTime: '05:30 PM',
        hours: hours,
        billable: taskLogBillable,
        category: taskLogCategory,
        description: taskLogDescription.trim() || `Work performed on ${selectedTask.title}`,
        status: isPast ? 'Pending Regularization' : (isAutoApproved ? 'Approved' : 'Submitted'),
        approvedBy: isAutoApproved ? state.currentPersona.name : undefined,
      };

      await api.projects.logTimesheet({
        projectId: selectedTask.projectId,
        taskId: selectedTask.id,
        employeeId: state.currentPersona.id,
        workDate: taskLogDate,
        hoursSpent: hours,
        description: newEntry.description,
      });

      onUpdateState((prev) => {
        const newTimesheets = [newEntry, ...prev.timesheets];
        const newActualHours = newTimesheets
          .filter((ts) => ts.taskId === selectedTask.id && (ts.status === 'Approved' || ts.status === 'Submitted'))
          .reduce((sum, ts) => sum + ts.hours, 0);

        const updatedTasks = prev.tasks.map((t) =>
          t.id === selectedTask.id ? { ...t, actualHours: newActualHours } : t
        );

        return {
          ...prev,
          timesheets: newTimesheets,
          tasks: updatedTasks,
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'TIMESHEET_LOGGED',
              entity: 'TimesheetEntry',
              entityId: newEntry.id,
              ipAddress: '106.51.72.18',
              details: `Logged ${hours}h on task "${selectedTask.title}" (${newEntry.status})`,
            },
            ...prev.auditLogs,
          ],
        };
      });

      setShowTaskLogTimeModal(false);
      setTaskLogDescription('');
      setTaskLogHours('2.0');
    } catch (err) {
      console.error('Failed to log time', err);
      alert('Failed to log time to backend.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveProject = async (projectId: string) => {
    if (!ensureCanManageProject(projectId)) return;
    setIsSaving(true);
    try {
      await api.projects.updateProject(projectId, { approvalStatus: 'Approved' });

      onUpdateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId
            ? {
              ...p,
              approvalStatus: 'Approved' as const,
              status: p.status === 'Pending Approval' || p.status === 'Denied' ? ('In Progress' as const) : p.status,
              approvedBy: prev.currentPersona.name,
            }
            : p
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'PROJECT_APPROVED',
            entity: 'Project',
            entityId: projectId,
            ipAddress: '106.51.72.18',
            details: `Admin ${prev.currentPersona.name} approved project workspace #${projectId}`,
          },
          ...prev.auditLogs,
        ],
      }));

      if (selectedProjectForDetails?.id === projectId) {
        setSelectedProjectForDetails((prev) =>
          prev
            ? {
              ...prev,
              approvalStatus: 'Approved',
              status: prev.status === 'Pending Approval' || prev.status === 'Denied' ? 'In Progress' : prev.status,
              approvedBy: state.currentPersona.name,
            }
            : null
        );
      }
    } catch (e) {
      console.error('Failed to approve project', e);
      alert('Failed to approve project.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDenyProject = async (projectId: string, reason?: string) => {
    if (!ensureCanManageProject(projectId)) return;
    setIsSaving(true);
    try {
      await api.projects.updateProject(projectId, { approvalStatus: 'Denied', denialReason: reason });

      onUpdateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId
            ? {
              ...p,
              approvalStatus: 'Denied' as const,
              status: 'Denied' as const,
              approvedBy: prev.currentPersona.name,
              denialReason: reason || 'Project scope or allocated hours exceeded quarterly ceiling.',
            }
            : p
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'PROJECT_DENIED',
            entity: 'Project',
            entityId: projectId,
            ipAddress: '106.51.72.18',
            details: `Admin ${prev.currentPersona.name} denied project #${projectId}. Reason: ${reason || 'Parameters exceeded'}`,
          },
          ...prev.auditLogs,
        ],
      }));

      if (selectedProjectForDetails?.id === projectId) {
        setSelectedProjectForDetails((prev) =>
          prev
            ? {
              ...prev,
              approvalStatus: 'Denied',
              status: 'Denied',
              approvedBy: state.currentPersona?.name || 'Admin',
              denialReason: reason || 'Parameters exceeded',
            }
            : null
        );
      }
      setShowDenyReasonModal(null);
      setDenyReasonText('');

      // Automatically remove rejected project from state after 2.5 seconds
      setTimeout(() => {
        onUpdateState((latest) => ({
          ...latest,
          projects: latest.projects.filter((p) => p.id !== projectId),
          tasks: latest.tasks.filter((t) => t.projectId !== projectId),
          timesheets: latest.timesheets.filter((ts) => ts.projectId !== projectId),
        }));
        setSelectedProjectForDetails((current) => (current?.id === projectId ? null : current));
      }, 2500);
    } catch (e) {
      console.error('Failed to deny project', e);
      alert('Failed to deny project.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateProjectWorkHours = async (projectId: string, hours: number) => {
    if (!ensureCanManageProject(projectId)) return;
    setIsSaving(true);
    try {
      await api.projects.updateProject(projectId, { totalWorkHours: hours });

      onUpdateState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, totalWorkHours: hours } : p
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'PROJECT_WORK_HOURS_UPDATED',
            entity: 'Project',
            entityId: projectId,
            ipAddress: '106.51.72.18',
            details: `Admin ${prev.currentPersona.name} set total work hours to ${hours}h for project #${projectId}`,
          },
          ...prev.auditLogs,
        ],
      }));
      if (selectedProjectForDetails?.id === projectId) {
        setSelectedProjectForDetails((prev) => (prev ? { ...prev, totalWorkHours: hours } : null));
      }
      setIsEditingWorkHours(false);
    } catch (e) {
      console.error('Failed to update project work hours', e);
      alert('Failed to update project work hours.');
    } finally {
      setIsSaving(false);
    }
  };

  const openProjectEditor = (project: Project) => {
    const hours = projectHourBudget(project);
    const status = PROJECT_STATUSES.includes(project.status) ? project.status : 'In Progress';
    const priority = PROJECT_PRIORITIES.includes(project.priority) ? project.priority : 'Medium';
    setIsEditingWorkHours(false);
    setProjectEditDraft({
      name: project.name || '',
      code: project.code || '',
      status,
      priority,
      description: project.description || '',
      clientId: project.clientId || '',
      category: project.category || 'General',
      managerId: project.managerId || '',
      startDate: project.startDate ? String(project.startDate).slice(0, 10) : '',
      endDate: project.endDate ? String(project.endDate).slice(0, 10) : '',
      totalWorkHours: hours > 0 ? String(hours) : '',
    });
  };

  const saveProjectDetails = async () => {
    const project = selectedProjectForDetails;
    const draft = projectEditDraft;
    if (!project || !draft) return;
    if (!ensureCanManageProject(project.id)) return;

    const name = draft.name.trim();
    const code = draft.code.trim().toUpperCase();
    if (!name || !code) {
      notifyApiError('Project name and code are required.');
      return;
    }
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      notifyApiError('End date must be on or after the start date.');
      return;
    }
    const hours = draft.totalWorkHours.trim() === '' ? 0 : Number(draft.totalWorkHours);
    if (!Number.isFinite(hours) || hours < 0) {
      notifyApiError('Work hours must be zero or more.');
      return;
    }

    const selectedClient = billingClients.find((client) => client.id === draft.clientId);
    const clientName = draft.clientId
      ? selectedClient?.company_name || selectedClient?.companyName || selectedClient?.name || project.clientName || ''
      : '';
    const manager = state.employees.find((emp) => emp.id === draft.managerId);

    setIsSaving(true);
    try {
      await api.projects.updateProject(project.id, {
        name,
        code,
        description: draft.description.trim(),
        clientId: draft.clientId || null,
        clientName,
        managerId: draft.managerId || null,
        startDate: draft.startDate || null,
        endDate: draft.endDate || null,
        status: draft.status,
        category: draft.category || 'General',
        priority: draft.priority,
        totalWorkHours: hours,
      });
      const next: Project = {
        ...project,
        name,
        code,
        description: draft.description.trim(),
        clientId: draft.clientId || undefined,
        clientName,
        managerId: draft.managerId,
        managerName: manager?.name || (draft.managerId ? project.managerName : ''),
        startDate: draft.startDate,
        endDate: draft.endDate,
        dueDate: draft.endDate,
        status: draft.status,
        category: draft.category || 'General',
        priority: draft.priority,
        totalWorkHours: hours,
      };
      setSelectedProjectForDetails(next);
      onUpdateState((prev) => ({
        ...prev,
        projects: prev.projects.map((item) => (item.id === next.id ? { ...item, ...next } : item)),
        tasks: prev.tasks.map((task) => (task.projectId === next.id ? { ...task, projectName: next.name } : task)),
      }));
      setProjectEditDraft(null);
    } catch (err) {
      console.error('Failed to update project', err);
      notifyApiError(err instanceof Error ? err.message : 'Could not save this project.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveTask = async (taskId: string) => {
    if (!ensureCanManageTask(taskId)) return;
    setIsSaving(true);
    try {
      await api.projects.updateTask(taskId, { status: 'In Progress' });
      
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId
            ? {
              ...t,
              status: 'In Progress' as const,
              isTimerRunning: true,
              timerStartedAt: Date.now(),
            }
            : t
        ),
        timesheets: prev.timesheets.map((ts) =>
          ts.taskId === taskId && (ts.status === 'Submitted' || ts.status === 'Draft')
            ? { ...ts, status: 'Approved' as const, approvedBy: prev.currentPersona?.name || 'Admin' }
            : ts
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona?.name || 'Admin',
            action: 'TASK_APPROVED',
            entity: 'Task',
            entityId: taskId,
            ipAddress: '106.51.72.18',
            details: `Admin ${prev.currentPersona?.name || 'Admin'} approved task #${taskId}`,
          },
          ...prev.auditLogs,
        ],
      }));

      if (selectedTask?.id === taskId) {
        setSelectedTask((prev) =>
          prev
            ? {
              ...prev,
              status: 'In Progress',
              actualHours: prev.actualHours > 0 ? prev.actualHours : (prev.estimatedHours || 8),
            }
            : null
        );
      }
    } catch (e) {
      console.error('Failed to approve task', e);
      alert('Failed to approve task.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRejectTask = async (taskId: string) => {
    if (!ensureCanManageTask(taskId)) return;
    setIsSaving(true);
    try {
      await api.projects.updateTask(taskId, { status: 'Review' });
      
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, status: 'Review' as const } : t
        ),
        timesheets: prev.timesheets.map((ts) =>
          ts.taskId === taskId && (ts.status === 'Submitted' || ts.status === 'Draft')
            ? { ...ts, status: 'Rejected' as const, approvedBy: prev.currentPersona?.name || 'Admin' }
            : ts
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona?.name || 'Admin',
            action: 'TASK_REJECTED',
            entity: 'Task',
            entityId: taskId,
            ipAddress: '106.51.72.18',
            details: `Admin ${prev.currentPersona?.name || 'Admin'} rejected/denied task #${taskId}`,
          },
          ...prev.auditLogs,
        ],
      }));

      if (selectedTask?.id === taskId) {
        setSelectedTask((prev) => (prev ? { ...prev, status: 'Review' } : null));
      }
    } catch (e) {
      console.error('Failed to reject task', e);
      alert('Failed to reject task.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenCreateProjectModal = () => {
    if (!canCreateProjects) {
      setPermissionNotice('Only admins and managers can create projects.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }
    const today = localDateKey(new Date());
    const defaultEnd = new Date();
    defaultEnd.setMonth(defaultEnd.getMonth() + 3);
    const defaultEndStr = localDateKey(defaultEnd);

    setNewProjName('');
    setNewProjCode(`PRJ-${String(state.projects.length + 1).padStart(3, '0')}`);
    setNewProjClient('');
    setNewProjClientId('');
    setNewProjDescription('');
    setNewProjTotalHours('250');
    setNewProjStatus('Planning');
    const currentLead =
      state.employees.find(
        (emp) =>
          emp.id === state.currentPersona?.id ||
          (emp.email && emp.email.toLowerCase() === state.currentPersona?.email?.toLowerCase())
      ) || state.employees[0];
    setNewProjManagerId(currentLead?.id || '');
    setNewProjTeamMembers(currentLead?.id ? [currentLead.id] : []);
    setNewProjStartDate(today);
    setNewProjEndDate(defaultEndStr);
    setNewProjCategory('General');
    setNewProjPriority('High');
    setShowCreateProjectModal(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;

    const finalStartDate = newProjStartDate || '';
    const finalEndDate = newProjEndDate || '';
    if (finalStartDate && finalEndDate && finalEndDate < finalStartDate) {
      alert('End date must be on or after the start date.');
      return;
    }

    const manager =
      state.employees.find((e) => e.id === newProjManagerId) ||
      state.employees.find(
        (e) =>
          e.id === state.currentPersona?.id ||
          (e.email && e.email.toLowerCase() === state.currentPersona?.email?.toLowerCase())
      ) ||
      state.employees[0];
    const code = newProjCode.trim() || `PRJ-${String(state.projects.length + 1).padStart(3, '0')}`;
    const managerId = newProjManagerId || manager?.id || (state.currentPersona?.id !== 'user_admin' ? state.currentPersona?.id : undefined) || '';
    const managerName = manager?.name || state.currentPersona?.name || 'Project Manager';

    setIsSaving(true);
    try {
      const selectedClient = billingClients.find((c) => c.id === newProjClientId);
      const clientName =
        selectedClient?.company_name ||
        selectedClient?.companyName ||
        selectedClient?.name ||
        newProjClient.trim() ||
        '';
      const projRes = await api.projects.createProject({
        name: newProjName.trim(),
        code: code.toUpperCase(),
        description: newProjDescription.trim(),
        clientName,
        clientId: newProjClientId || undefined,
        managerId: managerId,
        startDate: finalStartDate || undefined,
        endDate: finalEndDate || undefined,
        status: newProjStatus || 'In Progress',
        category: newProjCategory || 'General',
        priority: newProjPriority || 'Medium',
        totalWorkHours: parseFloat(newProjTotalHours) || 0,
      });

      if (!projRes.success) {
        throw new Error(projRes.error?.message || 'Request failed');
      }

      const newProject: Project = {
        id: projRes.data?.id || `proj_${Date.now()}`,
        name: newProjName.trim(),
        code: code.toUpperCase(),
        clientName,
        clientId: newProjClientId || undefined,
        description: newProjDescription.trim(),
        managerId: managerId,
        managerName: managerName,
        teamMembers: newProjTeamMembers.length > 0 ? newProjTeamMembers : [managerId],
        startDate: finalStartDate,
        endDate: finalEndDate,
        dueDate: finalEndDate,
        budget: 0,
        totalWorkHours: parseFloat(newProjTotalHours) || 0,
        loggedWorkHours: 0,
        approvalStatus: 'Approved',
        approvedBy: state.currentPersona?.name || 'Admin',
        spent: 0,
        currency: 'INR',
        category: newProjCategory || 'General',
        status: newProjStatus || 'In Progress',
        priority: newProjPriority || 'High',
        progress: 0,
      };

      onUpdateState((prev) => ({
        ...prev,
        projects: [newProject, ...prev.projects],
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona?.name || 'Admin',
            action: 'CREATED_PROJECT',
            entity: 'Project',
            entityId: newProject.id,
            ipAddress: '106.51.72.18',
            details: `Created new project "${newProject.name}" (${newProject.code}) with ${newProject.totalWorkHours}h allocated work hours`,
          },
          ...prev.auditLogs,
        ],
      }));

      setSelectedProjectId(newProject.id);
      setNewTaskProj(newProject.id);
      setShowCreateProjectModal(false);
      setActiveTab('projects');
      setNewProjName('');
      setNewProjCode('');
      setNewProjClient('');
      setNewProjDescription('');
      setNewProjTotalHours('250');
    } catch (err) {
      console.error('Project creation failed', err);
      alert(`Could not create project in backend database: ${err instanceof Error ? err.message : 'Request failed'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (!ensureCanManageProject(project)) return;
    setIsSaving(true);
    try {
      await api.projects.deleteProject(project.id);
      onUpdateState((prev) => ({
        ...prev,
        projects: prev.projects.filter((item) => item.id !== project.id),
        tasks: prev.tasks.filter((task) => task.projectId !== project.id),
        timesheets: prev.timesheets.filter((entry) => entry.projectId !== project.id),
      }));
      if (selectedProjectId === project.id) setSelectedProjectId('All');
      if (newTaskProj === project.id) setNewTaskProj('');
      setSelectedProjectForDetails((current) => (current?.id === project.id ? null : current));
      setPendingDeleteProject(null);
    } catch (err) {
      console.error('Failed to delete project', err);
      alert(err instanceof Error ? err.message : 'Could not delete this project.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`work-page projects-page ${mobileStyles.page}`} data-mobile-work-view={activeTab}>
      {mobileViewport && <MobileHeaderAction><button type="button" className="m2-icon-button m2-add" aria-label="Add task" onClick={() => handleOpenCreateTaskModal()}>＋</button></MobileHeaderAction>}
      <div className="work-head">
        <h1 className="work-title"><span className="work-desktop-label">Plan project work</span><span className="work-mobile-label">Projects</span></h1>
        <div className="work-actions">
          {canCreateProjects && (
            <button type="button" onClick={handleOpenCreateProjectModal} className="work-btn-secondary">
              Add project
            </button>
          )}
          <button type="button" onClick={() => handleOpenCreateTaskModal()} className="work-btn-primary">
            Add task
          </button>
        </div>
      </div>


      {permissionNotice && (
        <div className="fixed top-6 right-6 z-60 flex items-center gap-3 rounded-[9px] border border-[var(--studio-error)]/30 bg-[var(--studio-error-surface)] px-4 py-3 text-[var(--studio-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-[13px] font-semibold">{permissionNotice}</span>
          <button type="button" onClick={() => setPermissionNotice(null)} className="p-1" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="work-toolbar">
        <div className="relative w-[220px] max-w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            aria-label={activeTab === 'projects' ? 'Search projects' : 'Search tasks'}
            placeholder={activeTab === 'projects' ? 'Search projects' : 'Find a task or project'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="work-field w-full pl-10"
          />
        </div>
        <ResponsiveFilters active={selectedProjectId !== 'All' || selectedEmployeeId !== 'All'}>
        <label className={mobileStyles.filterField}><span>Project</span>
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="work-field"
          aria-label="Filter by project"
        >
          <option value="All">All projects</option>
          <option value="standalone">Standalone tasks</option>
          {state.projects.map((p) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>
        </label>
        {canFilterByPerson && (
          <label className={mobileStyles.filterField}><span>Person</span>
          <select
            value={selectedEmployeeId}
            onChange={(e) => setSelectedEmployeeId(e.target.value)}
            className="work-field"
            aria-label="Filter by person"
          >
            <option value="All">Everyone</option>
            {visiblePeople.map((emp) => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
          </label>
        )}
        </ResponsiveFilters>
        <span className="work-filter-count text-[12px] text-[var(--text-muted)]">
          {activeTab === 'projects'
            ? `${filteredProjects.length} ${filteredProjects.length === 1 ? 'project' : 'projects'}`
            : `${filteredTasks.length} ${filteredTasks.length === 1 ? 'task' : 'tasks'}`}
        </span>
      </div>

      <div role="tablist" aria-label="Project views" className="work-tabs">
        <button type="button" role="tab" aria-selected={activeTab === 'kanban'} onClick={() => setActiveTab('kanban')} className="work-tab">
          Board
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'backlog'} onClick={() => setActiveTab('backlog')} className="work-tab"><span className="m2-desktop-label">List</span><span className="m2-mobile-label">My tasks</span></button>
        <button type="button" role="tab" aria-selected={activeTab === 'projects'} onClick={() => setActiveTab('projects')} className="work-tab">
          Projects
        </button>
      </div>

      {/* TAB 1: KANBAN BOARD WITH DRAG & DROP */}
      {activeTab === 'kanban' && (
        <>
        {mobileViewport && <MobilePageTitle title={state.projects.find(p=>p.id===selectedProjectId)?.name || 'Task board'} onBack={()=>setActiveTab('backlog')}/>}
        <div className="work-board-status" role="group" aria-label="Board status">
          {columns.map((status) => (
            <button key={status} type="button" aria-pressed={mobileBoardStatus === status} onClick={() => setMobileBoardStatus(status)}>
              <span>{status === 'To Do' ? 'To do' : status === 'In Progress' ? 'In progress' : status}</span>
              <strong>{filteredTasks.filter((task) => normalizeTaskStatus(task.status) === status).length}</strong>
            </button>
          ))}
        </div>
        <div className="work-kanban">
          {columns.map((col) => {
            const colTasks = sortColumnTasks(filteredTasks.filter((t) => normalizeTaskStatus(t.status) === col));
            let slot = 0;
            const dropEndIndex = colTasks.filter((task) => task.id !== draggedTaskId).length;
            const showEndLine =
              Boolean(draggedTaskId) &&
              dropSlot?.column === col &&
              (colTasks.length === 0 || dropSlot.index === dropEndIndex);

            return (
              <section
                key={col}
                aria-label={col}
                data-mobile-active={mobileBoardStatus === col}
                data-status={col}
                onDragOver={(e) => handleDragOver(e, col)}
                onDragLeave={(e) => handleDragLeave(e, col)}
                onDrop={(e) => {
                  const activeId = draggedTaskIdRef.current;
                  const index = dropSlot?.column === col
                    ? dropSlot.index
                    : colTasks.filter((task) => task.id !== activeId).length;
                  handleDrop(e, col, index);
                }}
                className={`work-col ${dragOverColumn === col ? 'is-drop' : ''}`}
              >
                <div className="work-col-head">
                  <h3>{col}</h3>
                  <span className="work-count">{colTasks.length}</span>
                </div>

                <div
                  className={`work-col-body custom-scrollbar${showEndLine ? ' is-drop-end' : ''}`}
                  onDragOver={(e) => {
                    const target = e.target as HTMLElement;
                    if (target === e.currentTarget || target.classList.contains('work-col-empty')) {
                      const activeId = draggedTaskIdRef.current;
                      rememberDropSlot(col, colTasks.filter((task) => task.id !== activeId).length);
                    }
                  }}
                >
                  {colTasks.length === 0 ? (
                    <p className="work-col-empty">No tasks</p>
                  ) : (
                    colTasks.map((task, index) => {
                      const isFeatured = task.id === selectedTask?.id;
                      const canDrag = canManageThisTask(task);
                      const isBeingTracked =
                        normalizeTaskStatus(task.status) === 'In Progress' &&
                        (Boolean(task.isTimerRunning) || verifiedTrackingTaskIds.has(task.id) || Boolean(task.isTrackingVerified));
                      const overdue = isTaskOverdue(task);
                      const repeatText = recurrenceLabel(task.recurrenceRule);
                      const isDragged = task.id === draggedTaskId;
                      const showDropBefore = !isDragged && dropSlot?.column === col && dropSlot.index === slot;
                      if (!isDragged) slot += 1;

                      return (
                        <div
                          key={task.id}
                          draggable={canDrag}
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.dataTransfer.dropEffect = 'move';
                            const rect = e.currentTarget.getBoundingClientRect();
                            const after = e.clientY > rect.top + rect.height / 2;
                            const activeId = draggedTaskIdRef.current;
                            rememberDropSlot(col, boardInsertionIndex(colTasks, activeId, index, after));
                          }}
                          onDrop={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            const after = e.clientY > rect.top + rect.height / 2;
                            handleDrop(e, col, boardInsertionIndex(colTasks, draggedTaskIdRef.current, index, after));
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open task: ${task.title}`}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedTask(task); }
                          }}
                          onClick={() => {
                            if (suppressCardClick.current) {
                              suppressCardClick.current = false;
                              return;
                            }
                            setSelectedTask(task);
                          }}
                          className={`work-card work-task-card group is-prio-${priorityTone(task.priority)} ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
                            isDragged ? 'is-dragging' : ''
                          } ${showDropBefore ? 'is-drop-before' : ''} ${
                            overdue ? 'is-overdue' : isBeingTracked ? 'is-tracking' : isFeatured ? 'is-selected' : ''
                          }`}
                        >
                          <div className="work-task-project">
                            <span>{state.projects.find((project) => project.id === task.projectId)?.code ? `${state.projects.find((project) => project.id === task.projectId)?.code} · ` : ''}{task.projectName || 'General'}</span>
                            <button type="button" aria-label={`Details for ${task.title}`} onClick={(event) => { event.stopPropagation(); setSelectedTask(task); }}>
                              <MoreVertical size={16} aria-hidden="true" />
                            </button>
                          </div>

                          <div>
                            <h4 className="text-[13px] font-bold leading-snug text-[var(--text-primary)]">{task.title}</h4>
                            {task.description && (
                              <p className="mt-1 line-clamp-2 text-[12px] text-[var(--text-secondary)]">{task.description}</p>
                            )}
                          </div>
                          <div className="work-task-meta">
                            <span className={`work-chip work-chip-${priorityTone(task.priority)}`}>{task.priority}</span>
                            {task.dueDate && (
                              <span className={`work-task-due ${overdue ? 'is-overdue' : ''}`}>
                                <Calendar size={14} aria-hidden="true" />
                                {overdue ? 'Overdue · ' : ''}{new Date(`${task.dueDate.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                            {repeatText && <span className="work-task-repeat">{repeatText}</span>}
                          </div>

                          {mobileViewport && <small className="m2-board-task-status">{overdue ? 'Overdue' : col}</small>}
                          <div className="work-task-footer flex items-center justify-between border-t border-[var(--border-color)] pt-2.5">
                            {renderAssigneeStack(task)}
                            <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                              <span className="inline-flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" /> {task.commentsCount || 0}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Paperclip className="h-3 w-3" /> {(task.attachedDocIds || []).length || 0}
                              </span>
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Clock className="h-3 w-3" />
                                {formatHM(getTaskTotalSeconds(task))}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
        {mobileViewport && <button type="button" className="m2-secondary" onClick={()=>handleOpenCreateTaskModal()}>Add task</button>}
        </>
      )}

      {/* TAB 2: BACKLOG / LIST VIEW */}
      {activeTab === 'backlog' && (
        <div className="space-y-4">
          {/* Mobile Tasks Cards */}
          <div className="m2-task-list md:hidden">
  <div className="m2-section-heading"><h2>Tasks</h2><span>{filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}</span></div>
  {filteredTasks.length === 0 ? <div className="m2-empty">No tasks match these filters. Add a task to start the list.</div> : filteredTasks.map(task => {
    const status = normalizeTaskStatus(task.status);
    const overdue = isTaskOverdue(task);
    const tone = overdue ? 'is-overdue' : status === 'Completed' ? 'is-complete' : status === 'In Progress' ? 'is-active' : 'is-todo';
    return (
    <button type="button" key={task.id} className="m2-task-row" onClick={() => setSelectedTask(task)}>
      <span className={mobileStyles.taskHeading}><strong>{task.title}</strong><small className={tone}>{status}</small></span>
      <span>{task.projectName || 'Personal task'}</span>
      <span className={mobileStyles.taskFooter}><span data-overdue={overdue}>{task.dueDate ? (overdue ? 'Overdue · ' : task.dueDate.slice(0,10) === todayStr ? '' : 'Due ') + (task.dueDate.slice(0,10) === todayStr ? 'Due today' : new Date(task.dueDate.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})) : 'No due date'}</span><span className={`work-chip work-chip-${priorityTone(task.priority)}`}>{task.priority} priority</span></span>
    </button>
    );
  })}
</div>
{/* Desktop Backlog Table */}
          <div className="work-table hidden md:block overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold text-[10px] uppercase">
                <tr>
                  <th className="px-4 py-3.5 text-slate-900 font-bold">Task Title</th>
                  <th className="px-4 py-3.5">Project</th>
                  <th className="px-4 py-3.5">Assignee</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Priority</th>
                  <th className="px-4 py-3.5">Due</th>
                  <th className="px-4 py-3.5">Time Tracked</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-xs text-slate-400">
                      No tasks match these filters. Add a task to start the list.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const overdue = isTaskOverdue(task);
                    return (
                    <tr key={task.id} className={`transition-colors ${overdue ? 'bg-rose-50/60 ring-2 ring-inset ring-rose-500' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-slate-900 text-xs">{task.title}</p>
                          <p className="text-[11px] text-slate-500 line-clamp-1">{task.description}</p>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 inline-flex items-center gap-1">
                            <Layers className="h-3 w-3 text-slate-400 shrink-0 stroke-[1.8]" />
                            <span>{task.projectName || 'General'}</span>
                          </span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {renderAssigneeStack(task, 28)}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={taskStatusChip(task.status)}>
                            {normalizeTaskStatus(task.status)}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {getPriorityBadge(task.priority)}
                        </td>

                        <td className={`px-4 py-3.5 whitespace-nowrap text-[11px] font-semibold ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                          {task.dueDate ? task.dueDate.slice(0, 10) : '—'}
                          {overdue ? ' · Overdue' : ''}
                        </td>

                        <td className="px-4 py-3.5 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3 text-slate-400" />
                            {formatHM(getTaskTotalSeconds(task))}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedTask(task)}
                              className="rounded-lg bg-slate-100 hover:bg-[var(--studio-navy)] hover:text-white border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 transition-all cursor-pointer"
                            >
                              Details
                            </button>
                            {canManageThisTask(task) && (
                              <button
                                type="button"
                                onClick={(e) => handleDeleteTask(task.id, e)}
                                title="Delete Task"
                                className="rounded-lg bg-slate-100 hover:bg-rose-600 hover:text-white border border-slate-200 p-1.5 text-xs text-slate-500 transition-all cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
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
      </div>
    )}

      {/* TAB 3: TIMESHEETS & WORK LOGS */}
      {activeTab === 'timesheets' && (
        <TimesheetsModule state={state} onUpdateState={onUpdateState} selectedProjectId={selectedProjectId} />
      )}

      {/* TAB 4: PROJECTS LIST OVERVIEW */}
      {activeTab === 'projects' && (mobileViewport ? <MobileProjectOverview projects={filteredProjects} tasks={state.tasks} onOpen={setSelectedProjectForDetails} onNew={canCreateProjects?handleOpenCreateProjectModal:undefined} onBack={()=>setActiveTab('backlog')}/> : (
        <div className="work-project-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Add Project Card (Admin Only) */}
          {canCreateProjects && (
            <button
              type="button"
              onClick={handleOpenCreateProjectModal}
              className="work-add-project flex min-h-[180px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[var(--border-strong)] bg-[var(--bg-app)] px-6 py-8 text-center text-[13px] font-semibold text-[var(--studio-navy)] hover:bg-[var(--studio-selected)]"
            >
              <Plus size={24} aria-hidden="true" />
              Add a project
            </button>
          )}

          {filteredProjects.map((proj) => {
            const projApprovedHours = state.timesheets
              .filter((ts) => ts.projectId === proj.id && ts.status === 'Approved')
              .reduce((sum, ts) => sum + ts.hours, 0);
            const totalHoursAllocated = projectHourBudget(proj);
            const hoursPercent = totalHoursAllocated > 0
              ? Math.min(100, Math.round((projApprovedHours / totalHoursAllocated) * 100))
              : 0;

            return (
              <div
                key={proj.id}
                onClick={() => setSelectedProjectForDetails(proj)}
                role="button"
                tabIndex={0}
                aria-label={`Open project: ${proj.name}`}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedProjectForDetails(proj); } }}
                className="work-card work-project-card flex cursor-pointer flex-col gap-3 p-5"
              >
                <p className="work-project-code">{proj.code}</p>
                <div className="work-project-title">
                  <h3 className="truncate text-[15px] font-bold text-[var(--text-primary)]">{proj.name}</h3>
                  <span className={projectStatusChip(proj.status)}>{proj.status || 'In Progress'}</span>
                </div>
                <p className="line-clamp-2 text-[12px] text-[var(--text-secondary)]">
                  {proj.description || 'No description'}
                </p>
                <dl className="work-project-people">
                  <div><dt>Client</dt><dd>{proj.clientName || 'Internal'}</dd></div>
                  <div><dt>Project lead</dt><dd>{proj.managerName || '—'}</dd></div>
                </dl>
                <div className="space-y-1.5 border-t border-[var(--border-color)] pt-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-[var(--text-secondary)]">{projectDateLabel(proj)}</span>
                    <span className="font-mono text-[12px] font-semibold text-[var(--text-primary)]">
                      {projApprovedHours}h / {totalHoursAllocated > 0 ? `${totalHoursAllocated}h` : '—'}
                    </span>
                  </div>
                  <div className="work-project-meter h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface-subtle)]">
                    <div
                      className={`h-full rounded-full ${hoursPercent > 90 ? 'bg-amber-500' : 'bg-[var(--studio-navy)]'}`}
                      style={{ width: `${hoursPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Task Detail Slide-over Drawer */}
      {selectedTask && (() => {
        const taskSubtasks = selectedTask.subtasks || [];
        const completedSubtaskCount = taskSubtasks.filter((st) => st.completed).length;
        const canEditSelectedTask = canManageThisTask(selectedTask);
        const canAssignSelectedTask = canEditSelectedTask || openTaskAssignment;

        const openTimeLog = () => { setTaskLogHours('1.0'); setTaskLogDate(new Date().toISOString().split('T')[0]); setTaskLogDescription(''); setShowTaskLogTimeModal(true); };
        return <TaskPanel details title={selectedTask.title} description={selectedTask.projectName || 'General'} onClose={() => setSelectedTask(null)}>
          <div className="task-panel-body task-detail-body">
            <section className="task-workflow" aria-label="Workflow"><div className="task-mobile-workflow"><span className="task-current-status" data-status={normalizeTaskStatus(selectedTask.status)}>{normalizeTaskStatus(selectedTask.status)}</span><details><summary>Change status</summary><div>{(['To Do','In Progress','Review','Completed'] as const).map(status => <button key={status} type="button" aria-pressed={normalizeTaskStatus(selectedTask.status) === status} disabled={!canEditSelectedTask || (status === 'Completed' && normalizeTaskStatus(selectedTask.status) === 'Review' && !isSuperAdmin)} onClick={event => { handleUpdateTaskStatus(selectedTask.id,status); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{status === 'Completed' ? 'Done' : status}</button>)}</div></details></div><span className="task-section-label">Workflow</span><div className="task-status-options">
              {(['To Do','In Progress','Review','Completed'] as const).map(status => <button key={status} type="button" aria-pressed={normalizeTaskStatus(selectedTask.status) === status} disabled={!canEditSelectedTask || (status === 'Completed' && normalizeTaskStatus(selectedTask.status) === 'Review' && !isSuperAdmin)} onClick={() => handleUpdateTaskStatus(selectedTask.id,status)}>{status === 'Completed' ? 'Done' : status}</button>)}
            </div>{normalizeTaskStatus(selectedTask.status) === 'Review' && !isSuperAdmin && <p className="task-hint">Super Admin approval is required to complete this task.</p>}</section>
            <section className="task-overview">
              <div className="task-description"><h3>Description</h3>{canEditSelectedTask ? <textarea aria-label="Description" value={selectedTask.description || ''} placeholder="Add a description" rows={3} onChange={e => setSelectedTask(prev => prev ? { ...prev, description: e.target.value } : prev)} onBlur={e => saveTaskDescription(selectedTask, e.target.value)} /> : <p>{selectedTask.description || 'No description provided.'}</p>}</div>
              <div className="task-metadata">
                <div className="task-field"><label htmlFor="task-priority">Priority</label><select id="task-priority" className="task-priority-select" data-priority={priorityTone(selectedTask.priority)} value={selectedTask.priority} disabled={!canEditSelectedTask} onChange={e => saveTaskPriority(selectedTask,e.target.value as Task['priority'])}>{priorityOptions.map(priority => <option key={priority}>{priority}</option>)}</select></div>
                <TaskPeopleField value={taskAssigneeIds(selectedTask)} people={state.employees} disabled={!canAssignSelectedTask} onChange={ids => saveTaskAssignees(selectedTask,ids)} />
                <div className="task-field task-due-field"><label htmlFor="task-due-date">Due date</label><div className="task-due-line"><DateInput id="task-due-date" value={selectedTask.dueDate?.slice(0,10) || ''} disabled={!canEditSelectedTask} onChange={e => e.target.value && saveTaskDueDate(selectedTask,e.target.value)} />{canEditSelectedTask && selectedTask.dueDate && <button type="button" className="task-text-button" onClick={() => saveTaskDueDate(selectedTask,'')}>Clear date</button>}</div>{isTaskOverdue(selectedTask) && <p className="task-overdue">Overdue</p>}</div>
                {selectedTask.recurrenceSeriesId && <fieldset className="task-recurrence"><legend>{recurrenceLabel(selectedTask.recurrenceRule) || 'Repeats'}</legend><label><input type="radio" name="due-scope" checked={editDueScope === 'occurrence'} onChange={() => setEditDueScope('occurrence')} />This occurrence</label><label><input type="radio" name="due-scope" checked={editDueScope === 'future'} onChange={() => setEditDueScope('future')} />This and future</label></fieldset>}
                <div className="task-mobile-time"><span>Time tracked</span><span>{formatHM(getTaskTotalSeconds(selectedTask))}</span></div>
              </div>
            </section>
            <section className="task-subtasks"><h3>Subtasks · {completedSubtaskCount} of {taskSubtasks.length} complete</h3><div className="task-checklist">
              {taskSubtasks.map(subtask => <div key={subtask.id}><label><input type="checkbox" checked={subtask.completed} onChange={() => handleToggleSubtask(selectedTask.id,subtask.id)} /><span>{subtask.title}</span></label><button type="button" className="task-icon-button" aria-label={'Delete subtask ' + subtask.title} onClick={() => handleDeleteSubtask(selectedTask.id,subtask.id)}><Trash2 size={14} /></button></div>)}
              </div><div className="task-add-subtask"><input aria-label="New subtask" placeholder="Add a subtask" value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)} onKeyDown={e => { if(e.key === 'Enter'){ e.preventDefault(); handleAddSubtask(selectedTask.id); } }} /><button type="button" onClick={() => handleAddSubtask(selectedTask.id)}>Add</button></div>
            </section>
            <section className="task-time"><div><h3>Time tracked</h3><strong>{formatHM(getTaskTotalSeconds(selectedTask))}</strong>{selectedTask.isTimerRunning && <span className="task-hint"> · Running</span>}</div><div className="task-time-actions">
              {selectedTask.isTimerRunning || normalizeTaskStatus(selectedTask.status) === 'In Progress' ? <button type="button" onClick={() => handleToggleTimer(selectedTask.id)}>{selectedTask.isTimerRunning ? 'Pause' : 'Resume'}</button> : normalizeTaskStatus(selectedTask.status) === 'Completed' ? <span>Completed</span> : <button type="button" onClick={() => handleUpdateTaskStatus(selectedTask.id,'In Progress')}>Start working</button>}
              <button type="button" className="task-desktop-log" onClick={openTimeLog}>Log time</button></div>
            </section>
            <section className="task-attachments"><div className="task-attachments-heading"><h3>Attachments · {resolveTaskAttachments(selectedTask).length}</h3><div><button type="button" disabled={!canEditSelectedTask} onClick={() => setShowAttachDriveModal(true)}>Add from Drive</button><button type="button" disabled={!canEditSelectedTask} onClick={() => setShowUploadAttachModal(true)}>Upload</button></div></div><div className="task-file-list">
              {resolveTaskAttachments(selectedTask).length ? resolveTaskAttachments(selectedTask).map(doc => <article key={doc.id} className="task-file"><div className="task-file-identity"><span className="task-file-type">{doc.name.split('.').pop()?.slice(0,3).toUpperCase() || 'FILE'}</span><div><h4>{doc.name}</h4><p>{[doc.size,doc.owner].filter(Boolean).join(' · ') || 'Task attachment'}</p></div></div><div className="task-file-actions">{doc.s3Key && <button type="button" onClick={() => handleDownloadAttachment(doc)}>Download</button>}{canEditSelectedTask && <button type="button" className="task-text-button" onClick={() => handleRemoveAttachment(doc.id)}>Remove</button>}</div></article>) : <p className="task-hint">No files yet. Upload one or attach from Drive.</p>}
            </div></section>
          </div>
          <footer className="task-panel-footer task-detail-footer">{canEditSelectedTask && <button type="button" className="task-danger" onClick={() => handleDeleteTask(selectedTask.id)}>Delete task</button>}<button type="button" className="task-primary task-mobile-log" onClick={openTimeLog}>Log time</button></footer>
        </TaskPanel>;
      })()}

      {/* Start Task & Time Tracking Confirmation Modal */}
      {pendingTransitionTask && (() => {
        const task = pendingTransitionTask.task;
        const assigneeId = task.assigneeId;
        const assigneeName = task.assigneeName || 'Unassigned';

        // Any open session today counts. The first row may be an earlier checkout.
        const isCheckedIn = isAnyAssigneeClockedIn(task);
        const isCurrentAssignee = isTaskAssignee(task, state.currentPersona?.id, state.currentPersona?.name);

        // Check if assignee has another active running task
        const otherRunningTask = state.tasks.find(
          (t) =>
            t.id !== task.id &&
            (t.assigneeId === assigneeId || (assigneeName && t.assigneeName === assigneeName)) &&
            t.status === 'In Progress' &&
            t.isTimerRunning
        );

        return (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl p-7 border border-slate-100 text-slate-900 animate-in zoom-in-95 duration-200 space-y-6">
              {/* Modal Header & Close */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-lg font-bold text-slate-900">Move to In Progress</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Choose whether to start live time tracking</p>
                </div>
                <button
                  onClick={() => setPendingTransitionTask(null)}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Task Details - Clean typography, proper spacing, no background box */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--studio-navy)] bg-blue-50 px-2 py-0.5 rounded-md">
                    {task.projectName || 'General Project'}
                  </span>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-xs text-slate-500 font-medium">{assigneeName}</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  {task.title}
                </h3>
              </div>

              {/* Other Running Task Notice (if any) */}
              {otherRunningTask && isCheckedIn && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
                  <Clock className="h-4 w-4 text-[var(--studio-navy)] shrink-0 mt-0.5" />
                  <span>
                    &quot;{otherRunningTask.title}&quot; is currently tracking time. Starting this timer will automatically pause the previous task.
                  </span>
                </div>
              )}

              {/* If Not Checked In: Clear attendance required callout */}
              {!isCheckedIn && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5">Attendance Clock-In Required</span>
                    <span>
                      {isCurrentAssignee
                        ? "You are not clocked in today. You must clock in to start working on this task."
                        : `${assigneeName} is not clocked in today. Tasks can only be moved to In Progress when the assignee is clocked in.`}
                    </span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                {isCheckedIn ? (
                  <button
                    type="button"
                    onClick={() => executeTaskTransition(task.id, 'In Progress', true)}
                    className="w-full py-2.5 rounded-xl bg-[var(--studio-navy)] hover:bg-[var(--studio-navy-hover)] text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all active:scale-[0.99]"
                  >
                    <Play className="h-3.5 w-3.5 fill-current" />
                    <span>Start Tracking</span>
                  </button>
                ) : (
                  <>
                    {isCurrentAssignee && (
                      <button
                        type="button"
                        onClick={() => executeTaskTransition(task.id, 'In Progress', true, true)}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all active:scale-[0.99]"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        <span>Clock In & Move to In Progress</span>
                      </button>
                    )}
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setPendingTransitionTask(null)}
                  className="w-full py-2 rounded-xl text-slate-400 hover:text-slate-700 text-xs font-semibold cursor-pointer transition-colors text-center"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Attach from Drive */}
      {showAttachDriveModal && selectedTask && (() => {
        const attachedIds = new Set(resolveTaskAttachments(selectedTask).map((doc) => doc.id));
        const catalog: Array<DriveItem | TaskAttachment> = [
          ...state.driveItems.filter((item) => item.type !== 'folder'),
          ...state.tasks.flatMap((task) => resolveTaskAttachments(task)),
        ];
        const unique = new Map<string, DriveItem | TaskAttachment>();
        catalog.forEach((item) => {
          if (item.id && !unique.has(item.id)) unique.set(item.id, item);
        });
        const query = attachSearchQuery.trim().toLowerCase();
        const options = Array.from(unique.values()).filter((item) => {
          if (attachedIds.has(item.id)) return false;
          if (!query) return true;
          return item.name.toLowerCase().includes(query) || String((item as DriveItem).owner || (item as TaskAttachment).owner || '').toLowerCase().includes(query);
        });

        return (
          <SlideOverDrawer
            title="Attach from Drive"
            description="Choose a file already in the workspace"
            zClass="z-70"
            onClose={() => {
              setShowAttachDriveModal(false);
              setAttachSearchQuery('');
            }}
          >
              <div className={slideOverBodyClass}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={attachSearchQuery}
                  onChange={(e) => setAttachSearchQuery(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500"
                />
              </div>

              <div className="mt-3 max-h-72 overflow-y-auto space-y-1.5">
                {options.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center">
                    <p className="text-xs font-semibold text-slate-600">No Drive files to attach</p>
                    <p className="text-[11px] text-slate-400 mt-1">Upload a file to this task, or add documents in Drive first.</p>
                  </div>
                ) : (
                  options.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleAttachExistingDoc(item)}
                      className="w-full flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2.5 text-left cursor-pointer"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-800 truncate">{item.name}</span>
                          <span className="block text-[10px] text-slate-400 truncate">
                            {[item.size, (item as DriveItem).owner || (item as TaskAttachment).owner].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--studio-navy)] shrink-0">Attach</span>
                    </button>
                  ))
                )}
              </div>
              </div>
          </SlideOverDrawer>
        );
      })()}

      {/* Upload and attach */}
      {showUploadAttachModal && selectedTask && (
        <SlideOverDrawer
          title="Upload Document"
          description={`Attach a file to ${selectedTask.title}`}
          zClass="z-70"
          onClose={() => {
            setShowUploadAttachModal(false);
            setPendingAttachFile(null);
          }}
        >
            <form onSubmit={handleUploadAndAttach} className="flex-1 flex flex-col justify-between overflow-hidden">
              <div className={slideOverBodyClass}>
              <input
                ref={attachFileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => setPendingAttachFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => attachFileInputRef.current?.click()}
                className="w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 px-4 py-6 text-center cursor-pointer"
              >
                <Upload className="h-6 w-6 text-[var(--studio-navy)] mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-800">
                  {pendingAttachFile ? pendingAttachFile.name : 'Choose a file to upload'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {pendingAttachFile ? formatFileSize(pendingAttachFile.size) || 'Selected' : 'PDF, DOCX, XLSX, images, and ZIP'}
                </p>
              </button>

              </div>
              <div className={slideOverFooterClass}>
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadAttachModal(false);
                    setPendingAttachFile(null);
                  }}
                  className={slideOverCancelClass}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!pendingAttachFile || isAttachingDoc}
                  className={slideOverPrimaryClass}
                >
                  {isAttachingDoc ? 'Uploading...' : 'Upload & Attach'}
                </button>
              </div>
            </form>
        </SlideOverDrawer>
      )}

      {/* Figma: centered desktop 74:2270; mobile 280:9758. */}
      {showTaskLogTimeModal && selectedTask && <TaskPanel centered title="Log time" description={selectedTask.title} onClose={() => setShowTaskLogTimeModal(false)}>
        <form onSubmit={handleTaskQuickLogTime} className="task-panel-form task-log-form"><div className="task-panel-body">
          <div className="task-log-date-hours">
            <div className="task-field task-log-hours"><label htmlFor="task-log-hours">Hours *</label><input id="task-log-hours" type="number" step="any" min="0.1" max="24" value={taskLogHours} onChange={e => setTaskLogHours(e.target.value)} required /></div>
            <div className="task-field task-log-date"><label htmlFor="task-log-date">Work date *</label><DateInput id="task-log-date" max={todayStr} value={taskLogDate} onChange={e => setTaskLogDate(e.target.value)} required /><span className="task-hint">Work date cannot be in the future.</span></div>
          </div>
          <div className="task-log-context"><div className="task-field"><label htmlFor="task-log-project">Project</label><input id="task-log-project" value={selectedTask.projectName || 'General'} readOnly /></div><div className="task-field"><label htmlFor="task-log-task">Task</label><input id="task-log-task" value={selectedTask.title} readOnly /></div></div>
          <div className="task-field"><label htmlFor="task-log-category">Category</label><select id="task-log-category" value={taskLogCategory} onChange={e => setTaskLogCategory(e.target.value as typeof taskLogCategory)}><option value="Development">Development</option><option value="Code Review">Code Review</option><option value="Testing">Testing & QA</option><option value="Design">Design & UI/UX</option><option value="Meeting">Meeting</option></select></div>
          <div className="task-field"><label htmlFor="task-log-notes">Notes</label><textarea id="task-log-notes" rows={2} value={taskLogDescription} onChange={e => setTaskLogDescription(e.target.value)} placeholder="Add a note about your work." /></div>
          <div className="task-billable"><label htmlFor="task-log-billable">Billable work</label><input id="task-log-billable" type="checkbox" role="switch" checked={taskLogBillable} onChange={e => setTaskLogBillable(e.target.checked)} /></div>
          <p className="task-log-explanation task-hint">{taskLogDate < todayStr ? 'Past work dates are submitted for regularization.' : 'This creates a submitted timesheet and updates task time.'}</p>
        </div><footer className="task-panel-footer"><button type="button" onClick={() => setShowTaskLogTimeModal(false)}>Cancel</button><button type="submit" className="task-primary" disabled={taskLogDate > todayStr}>{taskLogDate > todayStr ? 'Future date not allowed' : taskLogDate < todayStr ? 'Apply for regularization' : 'Save time'}</button></footer></form>
      </TaskPanel>}

      {/* Figma: desktop 71:2787; mobile 280:9553. */}
      {showCreateTaskModal && (
        <TaskPanel title="Add a task" description="Add the details needed for your team." onClose={() => setShowCreateTaskModal(false)}>
          <form onSubmit={handleCreateTask} className="task-panel-form">
            <div className="task-panel-body">
              <div className="task-field"><label htmlFor="new-task-title">Task title *</label><input id="new-task-title" required placeholder="What needs to be done?" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} />
              </div>
              <div className="task-field"><label htmlFor="new-task-project">Project</label><select id="new-task-project" value={newTaskProj} onChange={e => setNewTaskProj(e.target.value)}>
                  <option value="">General / Standalone</option>
                  {activeProjects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </div>
              {canPickAssignees ? <TaskPeopleField value={newTaskAssignees} people={assignableEmployees} onChange={ids => { setNewTaskAssignees(ids); setNewTaskAssignee(ids[0] || ''); }} /> : <div className="task-field"><span>Assignees</span><div className="task-readonly">{state.currentPersona?.name || 'You'}</div></div>}
              <div className="task-priority-date">
                <div className="task-field"><label htmlFor="new-task-priority">Priority</label><select id="new-task-priority" className="task-priority-select" data-priority={priorityTone(newTaskPriority)} value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value as Task['priority'])}>{priorityOptions.map(priority => <option key={priority}>{priority}</option>)}</select>
                </div>
                <div className="task-field"><label htmlFor="new-task-due">Due date</label><DateInput id="new-task-due" value={newTaskDueDate} onChange={e => setNewTaskDueDate(e.target.value)} />
                </div>
              </div>
              <div className="task-field"><label htmlFor="new-task-repeat">Repeat</label><select id="new-task-repeat" value={newTaskRepeat} onChange={e => setNewTaskRepeat(e.target.value as typeof newTaskRepeat)}>
                  <option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Every month</option>
                </select>
              </div>
              {newTaskRepeat !== 'none' && <div className="task-extra-fields">
                <div className="task-field"><label htmlFor="new-task-repeat-end">Repeat until</label><DateInput id="new-task-repeat-end" value={newTaskRecurrenceEnd} onChange={e => setNewTaskRecurrenceEnd(e.target.value)} /></div>
                {(newTaskRepeat === 'weekly' || newTaskRepeat === 'biweekly') && <div className="task-field"><label htmlFor="new-task-weekday">Weekday</label><select id="new-task-weekday" value={newTaskWeekday} onChange={e => setNewTaskWeekday(Number(e.target.value))}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <option key={day} value={index}>{day}</option>)}</select></div>}
              </div>}
              <div className="task-field"><label htmlFor="new-task-description">Description</label><textarea id="new-task-description" value={newTaskDescription} onChange={e => setNewTaskDescription(e.target.value)} placeholder="Add the details your team needs." rows={3} />
              </div>
              <div className="task-billable">
                <label htmlFor="new-task-billable">Billable task</label>
                <input id="new-task-billable" type="checkbox" role="switch" checked={hasBillableClients && newTaskBillable} disabled={!hasBillableClients} aria-describedby={!hasBillableClients ? 'task-billing-help' : undefined} onChange={e => setNewTaskBillable(e.target.checked)} />
              </div>
              {!hasBillableClients && <p id="task-billing-help" className="task-hint">Add a billable client to enable billing.</p>}
              {hasBillableClients && newTaskBillable && <div className="task-extra-fields">
                <div className="task-field"><label htmlFor="new-task-billing-type">Billing type</label><select id="new-task-billing-type" value={newTaskBillingType} onChange={e => setNewTaskBillingType(e.target.value as 'deliverable' | 'hourly')}><option value="deliverable">Fixed deliverable price</option><option value="hourly">Hourly</option></select></div>
                <div className="task-field"><label htmlFor="new-task-client">Charge to client</label><select id="new-task-client" value={newTaskClientId} onChange={e => setNewTaskClientId(e.target.value)}><option value="">Project default</option>{billingClients.map(client => <option key={client.id} value={client.id}>{client.company_name || client.companyName || client.name}</option>)}</select></div>
                <div className="task-field"><label htmlFor="new-task-price">{newTaskBillingType === 'deliverable' ? 'Fixed price' : 'Hourly rate'}</label><input id="new-task-price" type="number" min="0" step="0.01" placeholder="0.00" value={newTaskPrice} onChange={e => setNewTaskPrice(e.target.value)} /></div>
              </div>}
            </div>
            <footer className="task-panel-footer"><button type="button" onClick={() => setShowCreateTaskModal(false)}>Cancel</button><button type="submit" className="task-primary" disabled={isSaving}>{isSaving ? 'Creating…' : 'Create task'}</button></footer>
          </form>
        </TaskPanel>
      )}

      {/* Figma: desktop 71:3020; mobile 280:9612. */}
      {showCreateProjectModal && <TaskPanel title="Create a project" description="Add the details needed for your team." onClose={() => setShowCreateProjectModal(false)}>
        <form onSubmit={handleCreateProject} className="task-panel-form"><div className="task-panel-body project-create-body">
          <div className="task-field project-name"><label htmlFor="new-project-name">Project name *</label><input id="new-project-name" required value={newProjName} onChange={e => setNewProjName(e.target.value)} placeholder="Name your project" /></div>
          <div className="task-field project-code"><label htmlFor="new-project-code">Short code</label><input id="new-project-code" value={newProjCode} onChange={e => setNewProjCode(e.target.value)} placeholder={'PRJ-' + String(state.projects.length + 1).padStart(3,'0')} /></div>
          <div className="task-field project-category"><label htmlFor="new-project-category">Category</label><select id="new-project-category" value={newProjCategory} onChange={e => setNewProjCategory(e.target.value)}><option value="General">General</option><option value="Development">Development</option><option value="Design">Design & UI/UX</option><option value="DevOps">DevOps & Cloud</option><option value="Security">Security & Audit</option><option value="Marketing">Marketing</option></select></div>
          <div className="task-field project-client"><label htmlFor="new-project-client">Client</label><select id="new-project-client" value={newProjClientId} onChange={e => { const id=e.target.value;setNewProjClientId(id);const client=billingClients.find(c=>c.id===id);setNewProjClient(client?.company_name || client?.companyName || client?.name || ''); }}><option value="">Internal / no client</option>{billingClients.map(client => <option key={client.id} value={client.id}>{client.company_name || client.companyName || client.name}</option>)}</select></div>
          <div className="task-field project-lead"><label htmlFor="new-project-lead">Project lead</label><select id="new-project-lead" value={newProjManagerId} onChange={e => setNewProjManagerId(e.target.value)}>{state.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></div>
          <div className="task-field project-status"><label htmlFor="new-project-status">Status</label><select id="new-project-status" value={newProjStatus} onChange={e => setNewProjStatus(e.target.value as Project['status'])}>{['Planning','In Progress','On Hold','Completed'].map(status => <option key={status}>{status}</option>)}</select></div>
          <div className="task-field project-budget"><label htmlFor="new-project-budget">Budget hours</label><input id="new-project-budget" type="number" min="1" value={newProjTotalHours} onChange={e => setNewProjTotalHours(e.target.value)} placeholder="e.g. 250" /></div>
          <div className="task-project-dates"><div className="task-field"><label htmlFor="new-proj-start">Start date</label><DateInput id="new-proj-start" value={newProjStartDate} onChange={e => setNewProjStartDate(e.target.value)} /></div><div className="task-field"><label htmlFor="new-proj-end">End date</label><DateInput id="new-proj-end" value={newProjEndDate} onChange={e => setNewProjEndDate(e.target.value)} /></div></div>
          <div className="task-field project-overview"><label htmlFor="new-project-overview">Overview</label><textarea id="new-project-overview" rows={3} value={newProjDescription} onChange={e => setNewProjDescription(e.target.value)} placeholder="Describe the project goals." /></div>
          <div className="task-field project-priority"><label htmlFor="new-project-priority">Priority</label><select id="new-project-priority" className="task-priority-select" data-priority={priorityTone(newProjPriority)} value={newProjPriority} onChange={e => setNewProjPriority(e.target.value as typeof newProjPriority)}>{priorityOptions.map(priority => <option key={priority}>{priority}</option>)}</select></div>
        </div><footer className="task-panel-footer"><button type="button" onClick={() => setShowCreateProjectModal(false)}>Cancel</button><button type="submit" className="task-primary" disabled={isSaving}>{isSaving ? 'Creating…' : 'Create project'}</button></footer></form>
      </TaskPanel>}

      {/* Project Details & Admin Approval Slide-over Drawer */}
      {selectedProjectForDetails && (() => {
        const p = selectedProjectForDetails;
        const projectTasks = state.tasks.filter(
          (t) => t.projectId === p.id && !isTestEntity(t.title) && canManageThisTask(t)
        );
        const projectTimesheets = state.timesheets.filter(
          (ts) => ts.projectId === p.id && !isTestEntity(ts.description)
        );
        const approvedHours = projectTimesheets
          .filter((ts) => ts.status === 'Approved')
          .reduce((sum, ts) => sum + ts.hours, 0);
        const totalBudgetHours = projectHourBudget(p);
        const shownBudget = projectEditDraft
          ? Math.max(0, Number(projectEditDraft.totalWorkHours) || 0)
          : totalBudgetHours;
        const hoursPercent = shownBudget > 0 ? Math.min(100, Math.round((approvedHours / shownBudget) * 100)) : 0;
        const canEditProject = canManageThisProject(p);
        const categoryChoices = PROJECT_CATEGORY_OPTIONS.some(([value]) => value === (projectEditDraft?.category || ''))
          ? PROJECT_CATEGORY_OPTIONS
          : ([[projectEditDraft?.category || 'General', projectEditDraft?.category || 'General'], ...PROJECT_CATEGORY_OPTIONS] as Array<[string, string]>);

        return (
          <div className="work-drawer-overlay fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
            <div ref={projectDetailsRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Project details" data-drawer-kind="detail" className={`${detailStyles.detail} ${drawerStyles.panel} work-drawer relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900`}>
              {/* Drawer Header */}
              <div className={`${detailStyles.header} p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-start justify-between bg-white shrink-0 gap-2`}>
                <div className="min-w-0 flex-1 pr-2">
                  {projectEditDraft ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          value={projectEditDraft.code}
                          onChange={(e) => setProjectEditDraft({ ...projectEditDraft, code: e.target.value.toUpperCase() })}
                          aria-label="Project code"
                          className="w-28 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--studio-navy)] outline-none focus:border-slate-400"
                        />
                        <select
                          value={projectEditDraft.status}
                          onChange={(e) => setProjectEditDraft({ ...projectEditDraft, status: e.target.value as Project['status'] })}
                          aria-label="Status"
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-slate-400"
                        >
                          {PROJECT_STATUSES.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                        <span className={`work-chip work-chip-${priorityTone(projectEditDraft.priority)}`}>{projectEditDraft.priority}</span>
                      </div>
                      <input
                        value={projectEditDraft.name}
                        onChange={(e) => setProjectEditDraft({ ...projectEditDraft, name: e.target.value })}
                        aria-label="Project name"
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-lg font-bold text-slate-900 outline-none focus:border-slate-400"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[11px] font-bold text-[var(--studio-navy)] uppercase tracking-wider block">
                          {p.code}
                        </span>
                        <span className={projectStatusChip(p.status)}>{p.status || 'In Progress'}</span>
                        <span className={`work-chip work-chip-${priorityTone(p.priority || 'Medium')}`}>{p.priority || 'Medium'}</span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{p.name}</h3>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canEditProject && !projectEditDraft && (
                    <button
                      type="button"
                      onClick={() => openProjectEditor(p)}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[var(--studio-navy)] font-semibold text-xs cursor-pointer"
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Close project details"
                    onClick={() => setSelectedProjectForDetails(null)}
                    className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors shrink-0"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Drawer Body */}
              <div className={`${detailStyles.body} p-4 sm:p-6 sm:px-8 space-y-5 sm:space-y-6 flex-1 overflow-y-auto custom-scrollbar bg-white text-xs`}>
                {/* Work Hours Budgeting by Admin/HR */}
                <div className={`${detailStyles.hours} p-4 sm:p-5 border border-slate-200 bg-slate-50/50 space-y-3`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-[var(--studio-navy)]" />
                        {mobileViewport ? 'Work hours' : 'Project Work Hours Allocation'}
                      </span>
                    </div>

                    {canEditProject && !isEditingWorkHours && !projectEditDraft && (
                      <button
                        onClick={() => {
                          setEditWorkHoursValue(totalBudgetHours > 0 ? String(totalBudgetHours) : '');
                          setIsEditingWorkHours(true);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-[11px] cursor-pointer"
                      >
                        Edit Hours
                      </button>
                    )}
                  </div>

                  {isEditingWorkHours ? (
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={editWorkHoursValue}
                        onChange={(e) => setEditWorkHoursValue(e.target.value)}
                        className="w-28 sm:w-32 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono font-bold text-slate-900 text-xs outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => handleUpdateProjectWorkHours(p.id, parseFloat(editWorkHoursValue) || 0)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--studio-navy)] text-white font-bold text-xs cursor-pointer hover:bg-[var(--studio-navy-hover)]"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setIsEditingWorkHours(false)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className={`${detailStyles.hoursSummary} flex items-center justify-between pt-1`}>
                      <div>
                        <span className={`${detailStyles.statLabel} text-[10px] uppercase font-bold text-slate-400 block`}>{mobileViewport ? 'Allocated' : 'Total Work Hours Set'}</span>
                        {projectEditDraft ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={projectEditDraft.totalWorkHours}
                            onChange={(e) => setProjectEditDraft({ ...projectEditDraft, totalWorkHours: e.target.value })}
                            placeholder="Not set"
                            aria-label="Total work hours"
                            className="mt-1 w-28 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono font-bold text-slate-900 text-xs outline-none focus:border-slate-400"
                          />
                        ) : (
                          <span className={`${detailStyles.statValue} text-base ${mobileViewport ? '' : 'font-mono'} font-bold text-[var(--studio-navy)]`}>
                            {totalBudgetHours > 0 ? `${totalBudgetHours} hrs` : 'Not set'}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`${detailStyles.statLabel} text-[10px] uppercase font-bold text-slate-400 block`}>{mobileViewport ? 'Logged' : 'Hours Consumed'}</span>
                        <span className={`${detailStyles.statValue} text-base ${mobileViewport ? '' : 'font-mono'} font-bold text-slate-800`}>
                          {approvedHours.toFixed(1)} {mobileViewport ? 'h' : `hrs (${hoursPercent}%)`}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden" role="progressbar" aria-label="Allocated project hours used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hoursPercent} aria-valuetext={shownBudget > 0 ? `${approvedHours.toFixed(1)} of ${shownBudget} hours used` : 'No work-hour budget set'}>
                    <div
                      className={`h-full transition-all duration-300 ${hoursPercent >= 100 ? 'bg-rose-500' : hoursPercent >= 80 ? 'bg-amber-500' : 'bg-[var(--studio-navy)]'
                        }`}
                      style={{ width: `${hoursPercent}%` }}
                    />
                  </div>
                  {mobileViewport && <p className={detailStyles.hoursNote}>{shownBudget > 0 ? `${hoursPercent}% of allocated hours used` : 'No work-hour budget set'}</p>}
                </div>

                {/* Project Description */}
                <div className={detailStyles.description}>
                  <span className={`${detailStyles.sectionTitle} text-[10px] uppercase font-bold text-slate-400 block mb-1`}>Description</span>
                  {projectEditDraft ? (
                    <textarea
                      value={projectEditDraft.description}
                      onChange={(e) => setProjectEditDraft({ ...projectEditDraft, description: e.target.value })}
                      rows={3}
                      aria-label="Description"
                      className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-xs sm:text-sm text-slate-800 outline-none focus:border-slate-400 resize-none"
                    />
                  ) : (
                    <p className="text-slate-700 bg-slate-50 p-3.5 sm:p-4 border border-slate-200 leading-relaxed text-xs sm:text-sm">
                      {p.description || 'No description'}
                    </p>
                  )}
                </div>

                {/* Project Metadata Grid */}
                {projectEditDraft ? (
                  <div className={`${detailStyles.editFields} grid grid-cols-2 gap-2.5 sm:gap-3`}>
                    <label className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Client</span>
                      <select
                        value={projectEditDraft.clientId}
                        onChange={(e) => setProjectEditDraft({ ...projectEditDraft, clientId: e.target.value })}
                        className={projectFieldClass}
                      >
                        <option value="">Internal</option>
                        {projectEditDraft.clientId && !billingClients.some((client) => client.id === projectEditDraft.clientId) && (
                          <option value={projectEditDraft.clientId}>{p.clientName || 'Current client'}</option>
                        )}
                        {billingClients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.company_name || client.companyName || client.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Category</span>
                      <select
                        value={projectEditDraft.category}
                        onChange={(e) => setProjectEditDraft({ ...projectEditDraft, category: e.target.value })}
                        className={projectFieldClass}
                      >
                        {categoryChoices.map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Lead</span>
                      <select
                        value={projectEditDraft.managerId}
                        onChange={(e) => setProjectEditDraft({ ...projectEditDraft, managerId: e.target.value })}
                        className={projectFieldClass}
                      >
                        <option value="">Unassigned</option>
                        {projectEditDraft.managerId && !state.employees.some((emp) => emp.id === projectEditDraft.managerId) && (
                          <option value={projectEditDraft.managerId}>{p.managerName || 'Current lead'}</option>
                        )}
                        {state.employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Priority</span>
                      <select
                        value={projectEditDraft.priority}
                        onChange={(e) => setProjectEditDraft({ ...projectEditDraft, priority: e.target.value as Project['priority'] })}
                        className={projectFieldClass}
                      >
                        {PROJECT_PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>{priority}</option>
                        ))}
                      </select>
                    </label>
                    <label className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Start</span>
                      <DateInput
                        value={projectEditDraft.startDate}
                        onChange={(e) => setProjectEditDraft({ ...projectEditDraft, startDate: e.target.value })}
                        aria-label="Start date"
                        className={projectFieldClass}
                      />
                    </label>
                    <label className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">End</span>
                      <DateInput
                        value={projectEditDraft.endDate}
                        onChange={(e) => setProjectEditDraft({ ...projectEditDraft, endDate: e.target.value })}
                        aria-label="End date"
                        className={projectFieldClass}
                      />
                    </label>
                  </div>
                ) : (
                  <div className={`${detailStyles.metadata} grid grid-cols-2 gap-2.5 sm:gap-3`}>
                    {mobileViewport && <h4 className={detailStyles.sectionTitle}>Project information</h4>}
                    {[
                      ['Client', p.clientName || 'Internal'],
                      ['Category', p.category || 'General'],
                      ['Lead', p.managerName || '—'],
                      ['Priority', p.priority || 'Medium'],
                      ['Start', p.startDate ? mobileViewport ? new Date(String(p.startDate).slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : String(p.startDate).slice(0, 10) : '-'],
                      ['End', p.endDate ? mobileViewport ? new Date(String(p.endDate).slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : String(p.endDate).slice(0, 10) : '-'],
                    ].map(([label, value]) => (
                      <div key={label} className={`${detailStyles.metadataItem} p-3 sm:p-3.5 border border-slate-200 bg-white min-w-0 overflow-hidden`}>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">{label}</span>
                        <span className="text-xs font-bold text-slate-800 block truncate">{value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {canEditProject && (
                <div className={`${detailStyles.billing} p-4 sm:p-5 border border-slate-200 bg-white space-y-3`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">Bill client</span>
                    <Link href="/payroll/billable?tab=unbilled" className="text-[11px] font-semibold text-[var(--studio-navy)]">
                      See all unbilled
                    </Link>
                  </div>
                  <p className="text-[11px] text-slate-500">{p.clientName || 'No client assigned'}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={billingModeDraft}
                      onChange={(e) => setBillingModeDraft(e.target.value as 'deliverable' | 'hourly')}
                      className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium text-slate-800"
                    >
                      <option value="deliverable">Deliverable fees</option>
                      <option value="hourly">Hourly</option>
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Hourly rate"
                      value={hourlyRateDraft}
                      onChange={(e) => setHourlyRateDraft(e.target.value)}
                      className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-medium text-slate-800"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={saveProjectBilling}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Save billing
                  </button>
                  {billLines.length === 0 ? (
                    <p className="text-[11px] text-slate-500">
                      {billingModeDraft === 'hourly'
                        ? 'No approved billable timesheets are waiting to be invoiced.'
                        : 'No completed billable tasks are waiting to be invoiced.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {billLines.map((line, index) => (
                        <div key={line.key} className={`${detailStyles.billLine} grid grid-cols-[auto_1fr_4.5rem_5rem_auto] gap-2 items-center`}>
                          <input
                            type="checkbox"
                            checked={line.included}
                            onChange={(e) => setBillLines((prev) => prev.map((row, i) => i === index ? { ...row, included: e.target.checked } : row))}
                          />
                          <span className="text-[11px] text-slate-700 truncate">{line.description}</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.quantity}
                            onChange={(e) => setBillLines((prev) => prev.map((row, i) => i === index ? { ...row, quantity: Number(e.target.value) || 0 } : row))}
                            className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px]"
                          />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => setBillLines((prev) => prev.map((row, i) => i === index ? { ...row, unitPrice: Number(e.target.value) || 0 } : row))}
                            className="rounded-md border border-slate-200 px-1.5 py-1 text-[11px]"
                          />
                          {line.sourceTaskId ? (
                            <button
                              type="button"
                              onClick={() => void deleteUnbilledProjectTask(line)}
                              className="text-[11px] font-semibold text-rose-700 hover:underline"
                            >
                              Delete
                            </button>
                          ) : (
                            <span />
                          )}
                        </div>
                      ))}
                      <div className="text-[11px] text-slate-600 font-medium">
                        {(() => {
                          const subtotal = billLines.filter((line) => line.included).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
                          const gst = subtotal * 0.18;
                          return `Subtotal ${subtotal.toFixed(2)} · GST 18% ${gst.toFixed(2)} · Total ${(subtotal + gst).toFixed(2)}`;
                        })()}
                      </div>
                      <button
                        type="button"
                        onClick={createDraftInvoice}
                        className="px-3 py-1.5 rounded-lg bg-[var(--studio-navy)] text-white text-xs font-semibold hover:bg-[var(--studio-navy-hover)]"
                      >
                        Create draft invoice
                      </button>
                    </div>
                  )}
                  {projectInvoices.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-slate-100">
                      {projectInvoices.map((inv) => (
                        <div key={inv.id} className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-semibold text-slate-800">{inv.invoice_number}</span>
                          <span className="text-slate-500">{Number(inv.total_amount || 0).toFixed(2)} · {inv.status}</span>
                          {String(inv.status).toLowerCase() === 'draft' && (
                            <button
                              type="button"
                              onClick={() => sendProjectInvoice(inv.id)}
                              className="text-[var(--studio-navy)] font-semibold"
                            >
                              Send
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}

                {/* Project Tasks List in this Workspace */}
                <div className={`${detailStyles.deliverables} space-y-3`}>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[var(--studio-navy)]" />
                      <span>{mobileViewport ? 'Project tasks' : 'Workspace Deliverables'} ({projectTasks.length})</span>
                    </label>
                  </div>

                  {projectTasks.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      No tasks yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projectTasks.map((t) => (
                        <button
                          type="button"
                          key={t.id}
                          onClick={() => {
                            setSelectedProjectForDetails(null);
                            setSelectedTask(t);
                          }}
                          className={`${detailStyles.deliverableRow} w-full text-left p-3 sm:p-3.5 border border-slate-200 bg-white hover:border-blue-400 transition-all flex items-center justify-between cursor-pointer shadow-2xs gap-2 min-w-0`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-slate-800 block truncate">{t.title}</span>
                            <span className="text-[11px] text-slate-400 block truncate">{t.assigneeName} • {t.status}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono text-slate-600 text-xs flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              {formatHM(getTaskTotalSeconds(t))}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className={`${detailStyles.footer} p-4 sm:p-5 sm:px-8 border-t border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0 pb-7 sm:pb-5`}>
                {projectEditDraft ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setProjectEditDraft(null)}
                      disabled={isSaving}
                      className="flex-1 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 cursor-pointer transition-colors shadow-2xs text-center disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveProjectDetails()}
                      disabled={isSaving}
                      className="flex-1 py-2.5 sm:py-3 rounded-xl bg-[var(--studio-navy)] hover:bg-[var(--studio-navy-hover)] text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99] text-center disabled:opacity-60"
                    >
                      {isSaving ? 'Saving…' : 'Save changes'}
                    </button>
                  </>
                ) : (
                  <>
                    {canEditProject && (
                      <button
                        type="button"
                        onClick={() => setPendingDeleteProject(p)}
                        className="py-2.5 sm:py-3 px-4 rounded-xl border border-rose-200 bg-white hover:bg-rose-50 text-sm font-semibold text-rose-700 cursor-pointer transition-colors"
                      >
                        Delete
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectForDetails(null);
                        handleOpenCreateTaskModal(p.id);
                      }}
                      className="flex-1 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 cursor-pointer transition-colors shadow-2xs text-center"
                    >
                      Add task
                    </button>
                    <button
                      onClick={() => setSelectedProjectForDetails(null)}
                      className="flex-1 py-2.5 sm:py-3 rounded-xl bg-[var(--studio-navy)] hover:bg-[var(--studio-navy-hover)] text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99] text-center"
                    >
                      Close
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {pendingDeleteProject && (
        <ConfirmDialog
          title={`Delete ${pendingDeleteProject.name}?`}
          description="Its tasks and time logs will be removed. Invoices stay, unlinked from this project."
          confirmLabel="Delete project"
          busy={isSaving}
          busyLabel="Deleting…"
          onCancel={() => setPendingDeleteProject(null)}
          onConfirm={() => void handleDeleteProject(pendingDeleteProject)}
        />
      )}

      {pendingDeleteTask && (
        <ConfirmDialog
          title={`Delete “${pendingDeleteTask.title}”?`}
          description="This task and its time logs will be removed. This cannot be undone."
          confirmLabel="Delete task"
          busy={isSaving}
          busyLabel="Deleting…"
          onCancel={() => setPendingDeleteTask(null)}
          onConfirm={() => void confirmDeleteTask()}
        />
      )}

      {pendingUnbilledDelete && (
        <ConfirmDialog
          title={`Delete “${pendingUnbilledDelete.description}”?`}
          description="This unbilled task will be removed. This cannot be undone."
          confirmLabel="Delete task"
          busy={isSaving}
          busyLabel="Deleting…"
          onCancel={() => setPendingUnbilledDelete(null)}
          onConfirm={() => void confirmDeleteUnbilledProjectTask()}
        />
      )}

      {/* Denial Reason Modal */}
      {showDenyReasonModal && (
        <SlideOverDrawer title="Deny Project Workspace" zClass="z-60" onClose={() => setShowDenyReasonModal(null)}>
            <div className={slideOverBodyClass}>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Reason for Denial / Feedback</label>
                <textarea
                  value={denyReasonText}
                  onChange={(e) => setDenyReasonText(e.target.value)}
                  placeholder="e.g. Budget/Hours exceed current sprint allocation, please revise..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-rose-400 resize-none"
                />
              </div>

            </div>
            <div className={slideOverFooterClass}>
                <button
                  type="button"
                  onClick={() => setShowDenyReasonModal(null)}
                  className={slideOverCancelClass}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDenyProject(showDenyReasonModal, denyReasonText)}
                  className={`${slideOverPrimaryClass} bg-rose-600 hover:bg-rose-700 shadow-none`}
                >
                  Confirm Denial
                </button>
            </div>
        </SlideOverDrawer>
      )}

      {confirmRejectTaskId && (
        <ConfirmDialog
          title="Are you sure you want to reject?"
          description="This task will be moved to Review status."
          confirmLabel="Yes, Reject"
          onCancel={() => setConfirmRejectTaskId(null)}
          onConfirm={() => {
            handleRejectTask(confirmRejectTaskId);
            setConfirmRejectTaskId(null);
          }}
        />
      )}
    </div>
  );
};
