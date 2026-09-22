'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderKanban,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Filter,
  User,
  Calendar,
  AlertCircle,
  MessageSquare,
  CheckSquare,
  MoreVertical,
  XCircle,
  ListFilter,
  Layers,
  Paperclip,
  FileText,
  Upload,
  Download,
  Trash2,
  Folder,
  ExternalLink,
  Briefcase,
  FolderPlus,
  X,
  Check,
  ShieldCheck,
  Bug,
  BookOpen,
  Sparkles,
  Flame,
  Play,
  Pause,
  LogIn,
} from 'lucide-react';
import { AppState, isTestEntity, normalizeTaskStatus, normalizeTaskPriority } from '../../services/store';
import { Task, Project, TimesheetEntry, AttendanceRecord } from '../../types';
import { api } from '../../services/apiClient';
import { TimesheetsModule } from './TimesheetsModule';
import { GanttChart } from './GanttChart';

interface ProjectsModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}


const AVATAR_COLORS = [
  'bg-blue-950/50 text-blue-300 border-blue-800/40',
  'bg-purple-950/50 text-purple-300 border-purple-800/40',
  'bg-amber-950/50 text-amber-300 border-amber-800/40',
  'bg-rose-950/50 text-rose-300 border-rose-800/40',
  'bg-cyan-950/50 text-cyan-300 border-cyan-800/40',
];

export const ProjectsModule: React.FC<ProjectsModuleProps> = ({ state, onUpdateState }) => {
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  const [activeTab, setActiveTab] = useState<'kanban' | 'backlog' | 'timesheets' | 'projects'>('kanban');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('All');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('All');
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedProjectForDetails, setSelectedProjectForDetails] = useState<Project | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [pendingTransitionTask, setPendingTransitionTask] = useState<{
    task: Task;
    targetStatus: 'In Progress';
    source: 'drag' | 'stepper' | 'button';
  } | null>(null);

  // Kanban Drag States
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const handleAddSubtask = async (taskId: string) => {
    if (!newSubtaskTitle.trim()) return;
    setIsSaving(true);
    try {
      const newSubtask = {
        id: `sub_${Date.now()}`,
        title: newSubtaskTitle.trim(),
        completed: false
      };
      
      // Update state immediately without API for subtasks since no endpoint exists yet
      onUpdateState((prev) => ({
        ...prev,
        tasks: prev.tasks.map(t => 
          t.id === taskId 
            ? { ...t, subtasks: [...(t.subtasks || []), newSubtask] }
            : t
        )
      }));
      setNewSubtaskTitle('');
    } catch (err) {
      console.error(err);
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

  // Check if an employee or current persona is currently clocked in today
  const isEmployeeClockedIn = (empId?: string, empName?: string) => {
    const targetId = empId || state.currentPersona?.id;
    const targetName = empName || state.currentPersona?.name;
    const todayStr = new Date().toISOString().split('T')[0];
    return state.attendance.some(
      (a) =>
        (a.employeeId === targetId || (targetName && a.employeeName.toLowerCase() === targetName.toLowerCase())) &&
        a.date === todayStr &&
        !!a.checkIn &&
        !a.checkOut
    );
  };

  // Project & Task Hours / Rejection States
  const [showDenyReasonModal, setShowDenyReasonModal] = useState<string | null>(null);
  const [denyReasonText, setDenyReasonText] = useState('');
  const [isEditingWorkHours, setIsEditingWorkHours] = useState(false);
  const [editWorkHoursValue, setEditWorkHoursValue] = useState('250');
  const [confirmRejectTaskId, setConfirmRejectTaskId] = useState<string | null>(null);

  // New Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProj, setNewTaskProj] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState(state.employees[0]?.id || '');
  const [newTaskPriority, setNewTaskPriority] = useState<'Low' | 'Medium' | 'High' | 'Urgent'>('High');
  const [newTaskDescription, setNewTaskDescription] = useState('');

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
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState<'pdf' | 'doc' | 'sheet' | 'image' | 'zip'>('pdf');
  const [newDocSize, setNewDocSize] = useState('2.5 MB');

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

  const assignableEmployees = (() => {
    const roster = state.employees || [];
    if (isSuperAdmin || isHR) return roster;

    const me = state.currentPersona;
    const myEmp = roster.find(
      (e) =>
        (me?.id && e.id === me.id) ||
        (me?.email && e.email?.toLowerCase() === me.email.toLowerCase())
    );
    const myId = myEmp?.id || me?.id || '';
    const myTeamId = myEmp?.teamId;
    const myDept = myEmp?.department || me?.department;

    const teammates = roster.filter((e) => {
      if (myId && e.id === myId) return true;
      if (myId && (e.managerId === myId || (e as any).reportingManagerId === myId)) return true;
      if (myTeamId && e.teamId && e.teamId === myTeamId) return true;
      if (myDept && e.department && e.department === myDept) return true;
      return false;
    });

    // Fall back to full roster if team graph isn't populated yet
    return teammates.length > 1 ? teammates : roster;
  })();

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

  const handleAttachExistingDoc = (docId: string) => {
    if (!selectedTask) return;
    const doc = state.driveItems.find((d) => d.id === docId);

    onUpdateState((prev) => ({
      ...prev,
      driveItems: prev.driveItems.map((item) =>
        item.id === docId
          ? {
            ...item,
            taskId: selectedTask.id,
            taskTitle: selectedTask.title,
            projectId: selectedTask.projectId,
            folderCategory: 'Projects',
          }
          : item
      ),
      tasks: prev.tasks.map((t) =>
        t.id === selectedTask.id
          ? {
            ...t,
            attachedDocIds: Array.from(new Set([...(t.attachedDocIds || []), docId])),
          }
          : t
      ),
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: state.currentPersona.name,
          action: 'TASK_DOCUMENT_ATTACHED',
          entity: 'Task',
          entityId: selectedTask.id,
          ipAddress: '106.51.72.18',
          details: `Attached document "${doc?.name || docId}" to task "${selectedTask.title}"`,
        },
        ...prev.auditLogs,
      ],
    }));

    setSelectedTask((prev) =>
      prev ? { ...prev, attachedDocIds: Array.from(new Set([...(prev.attachedDocIds || []), docId])) } : null
    );
    setShowAttachDriveModal(false);
  };

  const handleUploadAndAttach = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask || !newDocName.trim()) return;

    const newDocId = `doc_${Date.now()}`;
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    const newDriveDoc = {
      id: newDocId,
      name: newDocName.trim(),
      type: newDocType,
      size: newDocSize,
      owner: state.currentPersona.name,
      uploadedAt: nowStr,
      modifiedDate: nowStr,
      folderCategory: 'Projects' as const,
      tags: ['Deliverable', 'Attachment'],
      projectId: selectedTask.projectId,
      taskId: selectedTask.id,
      taskTitle: selectedTask.title,
      downloadUrl: '#',
    };

    onUpdateState((prev) => ({
      ...prev,
      driveItems: [newDriveDoc, ...prev.driveItems],
      tasks: prev.tasks.map((t) =>
        t.id === selectedTask.id
          ? {
            ...t,
            attachedDocIds: Array.from(new Set([...(t.attachedDocIds || []), newDocId])),
          }
          : t
      ),
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: state.currentPersona.name,
          action: 'DOCUMENT_UPLOADED_AND_ATTACHED',
          entity: 'DriveItem',
          entityId: newDocId,
          ipAddress: '106.51.72.18',
          details: `Uploaded & attached "${newDocName}" to task "${selectedTask.title}"`,
        },
        ...prev.auditLogs,
      ],
    }));

    setSelectedTask((prev) =>
      prev ? { ...prev, attachedDocIds: Array.from(new Set([...(prev.attachedDocIds || []), newDocId])) } : null
    );
    setShowUploadAttachModal(false);
    setNewDocName('');
  };

  const handleRemoveAttachment = (docId: string) => {
    if (!selectedTask) return;
    onUpdateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === selectedTask.id
          ? {
            ...t,
            attachedDocIds: (t.attachedDocIds || []).filter((id) => id !== docId),
          }
          : t
      ),
    }));

    setSelectedTask((prev) =>
      prev ? { ...prev, attachedDocIds: (prev.attachedDocIds || []).filter((id) => id !== docId) } : null
    );
  };

  const activeProjects = state.projects.filter(
    (p) => !isTestEntity(p.name) && !isTestEntity(p.code) && !isTestEntity(p.clientName)
  );

  // Jira Issue Type Badge Helper
  const getIssueTypeBadge = (type?: Task['issueType']) => {
    switch (type) {
      case 'Bug':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20" title="Bug / Issue">
            <Bug className="h-3 w-3 text-rose-500 shrink-0" />
            <span>BUG</span>
          </span>
        );
      case 'Story':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" title="User Story">
            <BookOpen className="h-3 w-3 text-emerald-500 shrink-0" />
            <span>STORY</span>
          </span>
        );
      case 'Improvement':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" title="Improvement">
            <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
            <span>IMP</span>
          </span>
        );
      case 'Task':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20" title="Task">
            <CheckSquare className="h-3 w-3 text-blue-500 shrink-0" />
            <span>TASK</span>
          </span>
        );
    }
  };

  // Jira Priority Badge Helper
  const getPriorityBadge = (priority: Task['priority']) => {
    switch (priority) {
      case 'Urgent':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400" title="Urgent Priority">
            <Flame className="h-3.5 w-3.5 text-rose-500" />
            <span className="text-[10px]">Urgent</span>
          </span>
        );
      case 'High':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400" title="High Priority">
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-[10px]">High</span>
          </span>
        );
      case 'Medium':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400" title="Medium Priority">
            <Clock className="h-3.5 w-3.5 text-blue-500" />
            <span className="text-[10px]">Medium</span>
          </span>
        );
      case 'Low':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400" title="Low Priority">
            <Check className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[10px]">Low</span>
          </span>
        );
    }
  };

  const notifyApiError = (message: string) => {
    setPermissionNotice(message);
    setTimeout(() => setPermissionNotice(null), 4500);
  };

  const persistTaskStatus = (
    taskId: string,
    nextStatus: Task['status'],
    previousStatus: Task['status']
  ) => {
    api.projects.updateTask(taskId, { status: nextStatus }).catch((err: any) => {
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

    // Regular employees can only drag their own tasks
    if (!isAdmin) {
      const isMyTask =
        task.assigneeId === state.currentPersona?.id ||
        (task.assigneeName || '').toLowerCase() === (state.currentPersona?.name || '').toLowerCase();
      if (!isMyTask) {
        e.preventDefault();
        setPermissionNotice('You can only move tasks assigned to you.');
        setTimeout(() => setPermissionNotice(null), 4000);
        return;
      }
    }

    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, colStatus: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColumn !== colStatus) {
      setDragOverColumn(colStatus);
    }
  };

  const handleDragLeave = (e: React.DragEvent, colStatus: string) => {
    if (dragOverColumn === colStatus) {
      setDragOverColumn(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetStatus: Task['status']) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDraggedTaskId(null);

    if (!taskId) return;

    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || normalizeTaskStatus(task.status) === targetStatus) return;

    // Regular employees can only move tasks assigned to them
    if (!isAdmin) {
      const isMyTask =
        task.assigneeId === state.currentPersona?.id ||
        (task.assigneeName || '').toLowerCase() === (state.currentPersona?.name || '').toLowerCase();
      if (!isMyTask) {
        setPermissionNotice('You can only move tasks assigned to you.');
        setTimeout(() => setPermissionNotice(null), 4000);
        return;
      }
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

      const isAssigneeClockedIn = isEmployeeClockedIn(task.assigneeId, task.assigneeName);
      if (!isAssigneeClockedIn) {
        setPermissionNotice(`Cannot move task to In Progress: ${task.assigneeName || 'The assignee'} is not clocked in today.`);
        setTimeout(() => setPermissionNotice(null), 5000);
        return;
      }

      setPendingTransitionTask({ task, targetStatus: 'In Progress', source: 'drag' });
      return;
    }

    const nowTime = Date.now();

    onUpdateState((prev) => {
      let updatedTimesheets = prev.timesheets;
      const updatedTasks = prev.tasks.map((t) => {
        if (t.id !== taskId) return t;

        let timeSpentSeconds = t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0);
        let isTimerRunning = t.isTimerRunning;
        let timerStartedAt = t.timerStartedAt;
        let elapsed = 0;

        if (normalizeTaskStatus(t.status) === 'In Progress') {
          if (isTimerRunning && timerStartedAt) {
            elapsed = Math.max(0, Math.floor((nowTime - timerStartedAt) / 1000));
            timeSpentSeconds += elapsed;
          }
          isTimerRunning = false;
          timerStartedAt = undefined;
        }

        const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));
        const elapsedHours = Number((elapsed / 3600).toFixed(2));

        if (normalizeTaskStatus(t.status) === 'In Progress' && targetStatus !== 'In Progress') {
          if (timeSpentSeconds < 600) {
            // Active work under 10 minutes: remove open work log from timesheets only (keep task on Kanban board)
            updatedTimesheets = updatedTimesheets.filter((ts) => !(ts.taskId === taskId && ts.date === todayStr && !ts.endTime));
          } else if (elapsed > 0) {
            updatedTimesheets = updatedTimesheets.map((ts) => {
              if (ts.taskId === taskId && ts.date === todayStr && !ts.endTime) {
                return {
                  ...ts,
                  hours: Number((ts.hours + elapsedHours).toFixed(2)),
                  endTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
                };
              }
              return ts;
            });
          }
        }

        return {
          ...t,
          status: targetStatus,
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
        tasks: updatedTasks,
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

    persistTaskStatus(taskId, targetStatus, task.status);
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
  const handleUpdateTaskStatus = (taskId: string, newStatus: Task['status']) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task || normalizeTaskStatus(task.status) === newStatus) return;

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

      const isAssigneeClockedIn = isEmployeeClockedIn(task.assigneeId, task.assigneeName);
      if (!isAssigneeClockedIn) {
        setPermissionNotice(`Cannot move task to In Progress: ${task.assigneeName || 'The assignee'} is not clocked in today.`);
        setTimeout(() => setPermissionNotice(null), 5000);
        return;
      }

      setPendingTransitionTask({ task, targetStatus: 'In Progress', source: 'stepper' });
      return;
    }

    const nowTime = Date.now();
    const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    persistTaskStatus(taskId, newStatus, task.status);
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
      let updatedTimesheets = prev.timesheets;
      const updatedTasks = prev.tasks.map((t) => {
        if (t.id !== taskId) return t;

        let timeSpentSeconds = t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0);
        let isTimerRunning = t.isTimerRunning;
        let timerStartedAt = t.timerStartedAt;
        let elapsed = 0;

        if (normalizeTaskStatus(t.status) === 'In Progress') {
          if (isTimerRunning && timerStartedAt) {
            elapsed = Math.max(0, Math.floor((nowTime - timerStartedAt) / 1000));
            timeSpentSeconds += elapsed;
          }
          isTimerRunning = false;
          timerStartedAt = undefined;
        }

        const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));
        const elapsedHours = Number((elapsed / 3600).toFixed(2));

        if (normalizeTaskStatus(t.status) === 'In Progress' && newStatus !== 'In Progress') {
          if (timeSpentSeconds < 600) {
            // Active work under 10 minutes: remove open work log from timesheets only (keep task on Kanban board)
            updatedTimesheets = updatedTimesheets.filter((ts) => !(ts.taskId === taskId && ts.date === todayStr && !ts.endTime));
          } else if (elapsed > 0) {
            updatedTimesheets = updatedTimesheets.map((ts) => {
              if (ts.taskId === taskId && ts.date === todayStr && !ts.endTime) {
                return {
                  ...ts,
                  hours: Number((ts.hours + elapsedHours).toFixed(2)),
                  endTime: nowStr,
                };
              }
              return ts;
            });
          }
        }

        return {
          ...t,
          status: newStatus,
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
  const executeTaskTransition = (
    taskId: string,
    targetStatus: Task['status'],
    startTimer: boolean,
    autoCheckIn: boolean = false
  ) => {
    const nowTime = Date.now();
    const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const targetTask = state.tasks.find((t) => t.id === taskId);

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
      } else if (autoCheckIn && !hasConfiguredOffice) {
        setPermissionNotice('Office Setup Required: Attendance is disabled because no office location has been configured in Settings.');
        setTimeout(() => setPermissionNotice(null), 5000);
        return prev;
      }

      const targetTask = prev.tasks.find((t) => t.id === taskId);

      // Enforce clock-in requirement for In Progress tasks
      if (targetStatus === 'In Progress' && !autoCheckIn) {
        const isAssigneeClockedIn = isEmployeeClockedIn(targetTask?.assigneeId, targetTask?.assigneeName);
        const isCurrentPersonaClockedIn = isEmployeeClockedIn(prev.currentPersona?.id, prev.currentPersona?.name);
        if (!isAssigneeClockedIn && !isCurrentPersonaClockedIn) {
          setPermissionNotice('You must clock in / check in attendance before moving tasks to In Progress.');
          setTimeout(() => setPermissionNotice(null), 5000);
          return prev;
        }
      }
      const assigneeId = targetTask?.assigneeId;
      const assigneeName = targetTask?.assigneeName;

      let updatedTimesheets = [...prev.timesheets];

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
          };
        }

        // Auto-pause any other task currently tracking for this assignee
        if (
          startTimer &&
          (t.assigneeId === assigneeId || (assigneeName && t.assigneeName === assigneeName)) &&
          normalizeTaskStatus(t.status) === 'In Progress' &&
          t.isTimerRunning
        ) {
          let elapsed = 0;
          if (timerStartedAt) {
            elapsed = Math.max(0, Math.floor((nowTime - timerStartedAt) / 1000));
            timeSpentSeconds += elapsed;
          }
          const pausedActualHours = Number((timeSpentSeconds / 3600).toFixed(2));
          const elapsedHours = Number((elapsed / 3600).toFixed(2));

          // Sync paused task to timesheets
          if (elapsed > 0) {
            updatedTimesheets = updatedTimesheets.map((ts) => {
              if (ts.taskId === t.id && ts.date === todayStr && !ts.endTime) {
                return {
                  ...ts,
                  hours: Number((ts.hours + elapsedHours).toFixed(2)),
                  endTime: nowStr,
                };
              }
              return ts;
            });
          }

          return {
            ...t,
            isTimerRunning: false,
            timerStartedAt: undefined,
            timeSpentSeconds,
            actualHours: pausedActualHours,
          };
        }

        return t;
      });

      // Auto-create or ensure TimesheetEntry exists for this task on today
      if (targetTask) {
        const existingTsIndex = updatedTimesheets.findIndex(
          (ts) => ts.taskId === taskId && ts.date === todayStr && !ts.endTime
        );
        if (existingTsIndex >= 0) {
          updatedTimesheets[existingTsIndex] = {
            ...updatedTimesheets[existingTsIndex],
            status: 'Review',
          };
        } else {
          const initialHours = Number(((targetTask?.timeSpentSeconds || 0) / 3600).toFixed(2)) || targetTask?.actualHours || 0;
          const newTs: TimesheetEntry = {
            id: `ts_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            employeeId: targetTask?.assigneeId || prev.currentPersona.id,
            employeeName: targetTask?.assigneeName || prev.currentPersona.name,
            projectId: targetTask?.projectId || '',
            projectName: targetTask?.projectName || 'General Project',
            taskId: targetTask?.id || taskId,
            taskTitle: targetTask?.title || 'Deliverable',
            date: todayStr,
            startTime: nowStr,
            hours: initialHours,
            billable: true,
            category: 'Development',
            description: `Live work log for ${targetTask?.title || 'task'}`,
            status: 'Review',
          };
          updatedTimesheets = [newTs, ...updatedTimesheets];
        }
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

    persistTaskStatus(taskId, targetStatus, targetTask?.status || 'To Do');

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
  const handleToggleTimer = (taskId: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;

    // If starting/resuming timer, verify attendance check-in
    if (!task.isTimerRunning) {
      const isAssigneeClockedIn = isEmployeeClockedIn(task.assigneeId, task.assigneeName);
      const isCurrentPersonaClockedIn = isEmployeeClockedIn(state.currentPersona?.id, state.currentPersona?.name);

      if (!isAssigneeClockedIn && !isCurrentPersonaClockedIn) {
        setPendingTransitionTask({ task, targetStatus: 'In Progress', source: 'button' });
        return;
      }
    }

    const nowTime = Date.now();
    const nowStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    onUpdateState((prev) => {
      let updatedTimesheets = [...prev.timesheets];

      const updatedTasks = prev.tasks.map((t) => {
        if (t.id !== taskId) return t;

        let timeSpentSeconds = t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0);
        let isTimerRunning = !t.isTimerRunning;
        let timerStartedAt = t.timerStartedAt;
        let elapsed = 0;

        if (isTimerRunning) {
          timerStartedAt = nowTime;
        } else {
          if (t.timerStartedAt) {
            elapsed = Math.max(0, Math.floor((nowTime - t.timerStartedAt) / 1000));
            timeSpentSeconds += elapsed;
          }
          timerStartedAt = undefined;
        }

        const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));
        const elapsedHours = Number((elapsed / 3600).toFixed(2));

        // When paused, sync to timesheets
        if (!isTimerRunning && elapsed > 0) {
          const existingTsIndex = updatedTimesheets.findIndex(
            (ts) => ts.taskId === taskId && ts.date === todayStr && !ts.endTime
          );
          if (existingTsIndex >= 0) {
            updatedTimesheets[existingTsIndex] = {
              ...updatedTimesheets[existingTsIndex],
              hours: Number((updatedTimesheets[existingTsIndex].hours + elapsedHours).toFixed(2)),
              endTime: nowStr,
            };
          }
        }

        return {
          ...t,
          timeSpentSeconds,
          timerStartedAt,
          isTimerRunning,
          actualHours,
        };
      });

      // If timer just started, ensure timesheet entry exists
      if (!task.isTimerRunning) {
        const existingTs = updatedTimesheets.find(
          (ts) => ts.taskId === taskId && ts.date === todayStr && !ts.endTime
        );
        if (!existingTs) {
          const initialHours = Number(((task.timeSpentSeconds || 0) / 3600).toFixed(2)) || task.actualHours || 0;
          const newTs: TimesheetEntry = {
            id: `ts_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            employeeId: task.assigneeId || prev.currentPersona.id,
            employeeName: task.assigneeName || prev.currentPersona.name,
            projectId: task.projectId || '',
            projectName: task.projectName || 'General Project',
            taskId: task.id,
            taskTitle: task.title,
            date: todayStr,
            startTime: nowStr,
            hours: initialHours,
            billable: true,
            category: 'Development',
            description: `Live work log for ${task.title}`,
            status: 'Review',
          };
          updatedTimesheets = [newTs, ...updatedTimesheets];
        }
      }

      return {
        ...prev,
        tasks: updatedTasks,
        timesheets: updatedTimesheets,
      };
    });

    setSelectedTask((prev) => {
      if (!prev || prev.id !== taskId) return prev;
      let timeSpentSeconds = prev.timeSpentSeconds || (prev.actualHours ? Math.round(prev.actualHours * 3600) : 0);
      let isTimerRunning = !prev.isTimerRunning;
      let timerStartedAt = prev.timerStartedAt;

      if (isTimerRunning) {
        timerStartedAt = nowTime;
      } else {
        if (prev.timerStartedAt) {
          const elapsed = Math.max(0, Math.floor((nowTime - prev.timerStartedAt) / 1000));
          timeSpentSeconds += elapsed;
        }
        timerStartedAt = undefined;
      }

      return {
        ...prev,
        timeSpentSeconds,
        timerStartedAt,
        isTimerRunning,
        actualHours: Number((timeSpentSeconds / 3600).toFixed(2)),
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
    onUpdateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => {
        if (t.id !== taskId) return t;
        const currentSubtasks = t.subtasks || [];
        const updated = currentSubtasks.map((st) => (st.id === subtaskId ? { ...st, completed: !st.completed } : st));
        return { ...t, subtasks: updated };
      }),
    }));

    setSelectedTask((prev) => {
      if (!prev || prev.id !== taskId) return prev;
      const currentSubtasks = prev.subtasks || [];
      const updated = currentSubtasks.map((st) => (st.id === subtaskId ? { ...st, completed: !st.completed } : st));
      return { ...prev, subtasks: updated };
    });
  };

  const handleCreateSubtask = async (taskId: string) => {
    if (!newSubtaskTitle.trim()) return;

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
        await api.projects.updateTask(taskId, { description: JSON.stringify(subtasks) });
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
    setIsSaving(true);
    try {
      const targetTask = state.tasks.find((t) => t.id === taskId);
      if (targetTask) {
        const subtasks = (targetTask.subtasks || []).filter((st) => st.id !== subtaskId);
        await api.projects.updateTask(taskId, { description: JSON.stringify(subtasks) });
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

  // Filtered Tasks
  const filteredTasks = state.tasks.filter((t) => {
    if (isTestEntity(t.title) || isTestEntity(t.description) || isTestEntity(t.projectName || '')) {
      return false;
    }

    // Role-based visibility: Regular employees only see their own assigned tasks
    if (!isAdmin) {
      const isMyTask =
        t.assigneeId === state.currentPersona?.id ||
        (t.assigneeName || '').toLowerCase() === (state.currentPersona?.name || '').toLowerCase();
      if (!isMyTask) return false;
    }

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
      t.assigneeName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesEmployee =
      !isAdmin
        ? true
        : selectedEmployeeId === 'All' ||
        t.assigneeId === selectedEmployeeId ||
        (t.assigneeName || '').toLowerCase() ===
        (state.employees.find((e) => e.id === selectedEmployeeId)?.name || '').toLowerCase();

    return matchesProj && matchesSearch && matchesEmployee;
  });

  const columns: Task['status'][] = ['To Do', 'In Progress', 'Review', 'Completed'];

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
    setNewTaskAssignee(defaultEmp?.id || state.currentPersona?.id || '');
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('High');
    setShowCreateTaskModal(true);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const today = new Date().toISOString().split('T')[0];
    const isStandalone = !newTaskProj || newTaskProj === 'standalone';
    const proj = !isStandalone ? state.projects.find((p) => p.id === newTaskProj) : undefined;
    const targetAssigneeId = isAdmin ? newTaskAssignee : (state.currentPersona?.id || state.employees[0]?.id || '');
    const emp =
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
        priority: newTaskPriority?.toLowerCase() as any,
        dueDate: today,
      });

      if (!taskRes.success) {
        throw new Error(taskRes.error?.message || 'Request failed');
      }

      const newTask: Task = {
        id: taskRes.data?.id || `task_${Date.now()}`,
        taskKey: taskRes.data?.task_key || `TSK-${String(state.tasks.length + 1).padStart(3, '0')}`,
        issueType: 'Task',
        projectId: isStandalone ? '' : proj?.id || '',
        projectName: isStandalone ? 'General' : proj?.name || 'General Project',
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || 'Sprint deliverable requirement.',
        assigneeId: emp?.id || state.currentPersona?.id || '',
        assigneeName: emp?.name || state.currentPersona?.name || 'Workspace Member',
        assigneeAvatar: emp?.avatar || state.currentPersona?.avatar || '',
        reporterName: state.currentPersona?.name || 'Admin',
        priority: newTaskPriority,
        status: 'To Do',
        startDate: today,
        actualHours: 0,
        timeSpentSeconds: 0,
        isTimerRunning: false,
        tags: [],
        subtasks: [],
        commentsCount: 0,
        attachedDocIds: [],
      };

      const newTimesheet: TimesheetEntry = {
        id: `ts_${Date.now()}_${newTask.id}`,
        employeeId: newTask.assigneeId,
        employeeName: newTask.assigneeName,
        projectId: newTask.projectId,
        projectName: newTask.projectName,
        taskId: newTask.id,
        taskTitle: newTask.title,
        date: today,
        hours: 0,
        description: newTask.description || newTask.title,
        billable: true,
        status: 'Submitted',
      };

      onUpdateState((prev) => ({
        ...prev,
        tasks: [newTask, ...prev.tasks],
        timesheets: [newTimesheet, ...prev.timesheets],
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
            message: `"${newTask.title}" assigned to ${newTask.assigneeName}.`,
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
    } catch (e) {
      console.error('Task creation failed', e);
      alert(`Could not create task in backend database: ${e instanceof Error ? e.message : 'Request failed'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const taskToDelete = state.tasks.find((t) => t.id === taskId);
    if (!taskToDelete) return;

    const confirmDelete = window.confirm(`Are you sure you want to delete task "${taskToDelete.title}"?`);
    if (!confirmDelete) return;

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

  const handleApproveTask = async (taskId: string) => {
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
    if (!isAdmin) {
      setPermissionNotice('Only Admins can create new projects.');
      setTimeout(() => setPermissionNotice(null), 4000);
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const defaultEnd = new Date();
    defaultEnd.setMonth(defaultEnd.getMonth() + 3);
    const defaultEndStr = defaultEnd.toISOString().split('T')[0];

    setNewProjName('');
    setNewProjCode(`PRJ-${String(state.projects.length + 1).padStart(3, '0')}`);
    setNewProjClient('');
    setNewProjDescription('');
    setNewProjTotalHours('250');
    setNewProjManagerId(state.employees[0]?.id || '');
    setNewProjTeamMembers([state.employees[0]?.id || '']);
    setNewProjStartDate(today);
    setNewProjEndDate(defaultEndStr);
    setNewProjCategory('General');
    setNewProjPriority('High');
    setShowCreateProjectModal(true);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;

    const today = new Date().toISOString().split('T')[0];
    const finalStartDate = newProjStartDate && newProjStartDate >= today ? newProjStartDate : today;
    const finalEndDate = newProjEndDate && newProjEndDate >= finalStartDate ? newProjEndDate : finalStartDate;

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
      const projRes = await api.projects.createProject({
        name: newProjName.trim(),
        code: code.toUpperCase(),
        description: newProjDescription.trim() || 'Enterprise project deliverable',
        clientName: newProjClient.trim() || 'Internal Core Deliverable',
        managerId: managerId,
        startDate: finalStartDate,
        endDate: finalEndDate,
      });

      if (!projRes.success) {
        throw new Error(projRes.error?.message || 'Request failed');
      }

      const newProject: Project = {
        id: projRes.data?.id || `proj_${Date.now()}`,
        name: newProjName.trim(),
        code: code.toUpperCase(),
        clientName: newProjClient.trim() || 'Internal Core Deliverable',
        description: newProjDescription.trim() || 'Enterprise project deliverable',
        managerId: managerId,
        managerName: managerName,
        teamMembers: newProjTeamMembers.length > 0 ? newProjTeamMembers : [managerId],
        startDate: finalStartDate,
        endDate: finalEndDate,
        dueDate: finalEndDate,
        budget: 0,
        totalWorkHours: parseFloat(newProjTotalHours) || 250,
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

  return (
    <div className="space-y-5 text-white">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">Tasks</h1>
        </div>

        {/* View Mode Switcher & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
          <div className="grid grid-cols-3 gap-1 bg-slate-100/90 p-1 rounded-xl shadow-2xs w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('kanban')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'kanban'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <FolderKanban className="h-3.5 w-3.5 shrink-0" />
              <span>Board</span>
            </button>
            <button
              onClick={() => setActiveTab('backlog')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'backlog'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <ListFilter className="h-3.5 w-3.5 shrink-0" />
              <span>List</span>
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'projects'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <Folder className="h-3.5 w-3.5 shrink-0" />
              <span>Overview</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isAdmin && (
              <button
                onClick={handleOpenCreateProjectModal}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition-all active:scale-95 cursor-pointer shadow-2xs"
              >
                <FolderPlus className="h-4 w-4 text-slate-500 stroke-[1.8]" />
                <span>Add Project</span>
              </button>
            )}

            <button
              onClick={() => handleOpenCreateTaskModal()}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <Plus className="h-4 w-4 stroke-[2.2]" /> Add Task
            </button>
          </div>
        </div>
      </div>

      {/* Super Admin Review Permission Notice Toast */}
      {permissionNotice && (
        <div className="fixed top-6 right-6 z-60 bg-rose-950/95 border border-rose-800 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span className="text-xs font-semibold">{permissionNotice}</span>
          <button onClick={() => setPermissionNotice(null)} className="text-rose-400 hover:text-white p-1 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Subheader: Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks or projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 transition-all"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1 sm:flex-none">
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:text-slate-900 focus:bg-white focus:border-blue-500 cursor-pointer"
            >
              <option value="All">All Projects</option>
              <option value="standalone">General / Standalone Tasks</option>
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
              ))}
            </select>

            {/* Employee Filter (Admin & HR Only) */}
            {isAdmin && (
              <select
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none hover:text-slate-900 focus:bg-white focus:border-blue-500 cursor-pointer"
              >
                <option value="All">All Employees</option>
                {state.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-500 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          <span className="text-xs text-slate-500 font-mono">
            {filteredTasks.length} tasks
          </span>
        </div>
      </div>

      {/* TAB 1: KANBAN BOARD WITH DRAG & DROP */}
      {activeTab === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto pb-4">
          {columns.map((col) => {
            const colTasks = filteredTasks.filter((t) => normalizeTaskStatus(t.status) === col);

            return (
              <div key={col} className="flex flex-col min-w-[260px] space-y-3">
                {/* Column Header */}
                <div className="flex items-center justify-between border border-slate-200 bg-white p-3 rounded-xl shadow-2xs">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">{col}</h3>
                  <span className="text-[11px] font-mono font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 border border-slate-200 rounded-full">
                    {colTasks.length}
                  </span>
                </div>

                <div
                  onDragOver={(e) => handleDragOver(e, col)}
                  onDragLeave={(e) => handleDragLeave(e, col)}
                  onDrop={(e) => handleDrop(e, col)}
                  className={`space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-280px)] custom-scrollbar pr-1 min-h-[140px] rounded-xl transition-all ${dragOverColumn === col ? 'bg-blue-50/80 border border-dashed border-blue-400' : ''
                    }`}
                >
                  {colTasks.length === 0 ? (
                    <div className="border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 rounded-xl bg-slate-50/50">
                      No tasks in {col}
                    </div>
                  ) : (
                    colTasks.map((task) => {
                      const isFeatured = task.id === selectedTask?.id;
                      const avatarStyle = getAssigneeAvatarStyle(task.assigneeName);
                      const initials = getInitials(task.assigneeName);
                      const taskApprovedHrs = state.timesheets
                        .filter((ts) => ts.taskId === task.id && ts.status === 'Approved')
                        .reduce((sum, ts) => sum + ts.hours, 0);

                      const isMyTask =
                        task.assigneeId === state.currentPersona?.id ||
                        (task.assigneeName || '').toLowerCase() === (state.currentPersona?.name || '').toLowerCase();
                      const canDrag = isAdmin || isMyTask;

                      const isBeingTracked =
                        normalizeTaskStatus(task.status) === 'In Progress' &&
                        (Boolean(task.isTimerRunning) || verifiedTrackingTaskIds.has(task.id) || Boolean(task.isTrackingVerified));

                      return (
                        <div
                          key={task.id}
                          draggable={canDrag}
                          onDragStart={(e) => handleDragStart(e, task.id)}
                          onClick={() => setSelectedTask(task)}
                          className={`group rounded-xl p-4 transition-all space-y-3 ${canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${
                            isBeingTracked
                              ? 'bg-white border-2 border-emerald-500 ring-2 ring-emerald-500/20 text-slate-900 shadow-sm'
                              : isFeatured
                              ? 'bg-white border border-blue-500 text-slate-900 shadow-md ring-1 ring-blue-500/30'
                              : 'bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 text-slate-900 shadow-2xs'
                          }`}
                        >
                          {/* Top: Project Name & Priority / Tracking Indicator */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 truncate max-w-[170px]">
                              <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0 stroke-[1.8]" />
                              <span className="truncate">{task.projectName || 'General'}</span>
                            </span>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${task.priority === 'Urgent'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : task.priority === 'High'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                                }`}>
                                {task.priority}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteTask(task.id, e)}
                                title="Delete Task"
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-0.5 rounded transition-all cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Title & Description */}
                          <div>
                            <h4 className="text-xs font-bold leading-snug text-slate-900 group-hover:text-blue-600 transition-colors">
                              {task.title}
                            </h4>
                            <p className="text-[11px] mt-1 line-clamp-2 text-slate-500">
                              {task.description || 'Sprint task deliverable.'}
                            </p>
                          </div>

                          {/* Footer: Avatar + Comments & Attachments + Live Timer */}
                          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className={`h-6 w-6 rounded-full border flex items-center justify-center text-[10px] font-bold shrink-0 ${avatarStyle}`}>
                                {initials}
                              </div>
                              <span className="text-[11px] text-slate-600 font-medium truncate max-w-[100px]">
                                {task.assigneeName}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 text-[11px] text-slate-500">
                              <span className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3 text-slate-400" /> {task.commentsCount || 0}
                              </span>
                              <span className="flex items-center gap-1">
                                <Paperclip className="h-3 w-3 text-slate-400" /> {(task.attachedDocIds || []).length || 0}
                              </span>
                              <span className="font-mono text-[11px] flex items-center gap-1 text-slate-500">
                                <Clock className="h-3 w-3 text-slate-400" />
                                {formatHM(getTaskTotalSeconds(task))}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: BACKLOG / LIST VIEW */}
      {activeTab === 'backlog' && (
        <div className="space-y-4">
          {/* Mobile Tasks Cards */}
          <div className="block md:hidden space-y-3">
            {filteredTasks.length === 0 ? (
              <div className="p-8 rounded-2xl border border-slate-200 bg-white text-center text-xs text-slate-400 font-semibold shadow-2xs">
                No tasks found. Click &quot;+ Add Task&quot; to get started.
              </div>
            ) : (
              filteredTasks.map((task) => {
                const isTaskTracking =
                  normalizeTaskStatus(task.status) === 'In Progress' &&
                  (Boolean(task.isTimerRunning) || verifiedTrackingTaskIds.has(task.id) || Boolean(task.isTrackingVerified));
                return (
                  <div
                    key={task.id}
                    className={`p-4 rounded-2xl bg-white shadow-2xs space-y-3 transition-all ${
                      isTaskTracking
                        ? 'border-2 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'border border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900">{task.title}</h4>
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{task.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide shrink-0 ${
                            normalizeTaskStatus(task.status) === 'Completed'
                              ? 'bg-[#E8F8F0] text-[#10B981]'
                              : normalizeTaskStatus(task.status) === 'In Progress'
                              ? 'bg-[#EBF3FE] text-[#3B82F6]'
                              : normalizeTaskStatus(task.status) === 'Review'
                              ? 'bg-[#F3EEFE] text-[#8B5CF6]'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {normalizeTaskStatus(task.status).toUpperCase()}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTask(task.id, e)}
                          title="Delete Task"
                          className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 inline-flex items-center gap-1">
                        <Layers className="h-3 w-3 text-slate-400 shrink-0 stroke-[1.8]" />
                        <span>{task.projectName || 'General'}</span>
                      </span>
                      <span
                        className={`rounded-lg px-2 py-0.5 text-[10px] font-bold ${
                          task.priority === 'Urgent'
                            ? 'bg-[#FEECEE] text-[#EF4444]'
                            : task.priority === 'High'
                            ? 'bg-[#FEF6E6] text-[#F59E0B]'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {task.priority.toUpperCase()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-5 w-5 rounded-full border flex items-center justify-center font-bold text-[9px] ${getAssigneeAvatarStyle(
                            task.assigneeName
                          )}`}
                        >
                          {getInitials(task.assigneeName)}
                        </div>
                        <span className="text-slate-800 text-[11px] font-medium">{task.assigneeName}</span>
                      </div>
                      <span className={`text-[11px] font-mono font-bold flex items-center gap-1.5 ${isTaskTracking ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {isTaskTracking && (
                          <span className="relative flex h-2 w-2 mr-0.5" title="Actively tracking (Verified with backend)">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        )}
                        <Clock className={`h-3 w-3 ${isTaskTracking ? 'text-emerald-600 stroke-[2.2]' : 'text-slate-400'}`} />
                        {formatHM(getTaskTotalSeconds(task))}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Backlog Table */}
          <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold text-[10px] uppercase">
                <tr>
                  <th className="px-4 py-3.5 text-slate-900 font-bold">Task Title</th>
                  <th className="px-4 py-3.5">Project</th>
                  <th className="px-4 py-3.5">Assignee</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Priority</th>
                  <th className="px-4 py-3.5">Time Tracked</th>
                  <th className="px-4 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-xs text-slate-400">
                      No tasks found. Click &quot;+ Add Task&quot; to get started.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => (
                    <tr key={task.id} className="hover:bg-slate-50 transition-colors">
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
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-5 w-5 rounded-full border flex items-center justify-center font-bold text-[9px] ${getAssigneeAvatarStyle(
                                task.assigneeName
                              )}`}
                            >
                              {getInitials(task.assigneeName)}
                            </div>
                            <span className="text-slate-900 font-medium">{task.assigneeName}</span>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${
                              normalizeTaskStatus(task.status) === 'Completed'
                                ? 'bg-[#E8F8F0] text-[#10B981]'
                                : normalizeTaskStatus(task.status) === 'In Progress'
                                  ? 'bg-[#EBF3FE] text-[#3B82F6]'
                                  : normalizeTaskStatus(task.status) === 'Review'
                                    ? 'bg-[#F3EEFE] text-[#8B5CF6]'
                                    : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {normalizeTaskStatus(task.status).toUpperCase()}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${
                              task.priority === 'Urgent'
                                ? 'bg-[#FEECEE] text-[#EF4444]'
                                : task.priority === 'High'
                                  ? 'bg-[#FEF6E6] text-[#F59E0B]'
                                  : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {task.priority.toUpperCase()}
                          </span>
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
                              className="rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 transition-all cursor-pointer"
                            >
                              Details
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteTask(task.id, e)}
                              title="Delete Task"
                              className="rounded-lg bg-slate-100 hover:bg-rose-600 hover:text-white border border-slate-200 p-1.5 text-xs text-slate-500 transition-all cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
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
      {activeTab === 'projects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Add Project Card (Admin Only) */}
          {isAdmin && (
            <button
              onClick={handleOpenCreateProjectModal}
              className="group flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-500 bg-white hover:bg-slate-50/50 transition-all text-center cursor-pointer min-h-[220px] shadow-2xs"
            >
              <div className="h-12 w-12 rounded-full bg-blue-50 border border-blue-200/60 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-xs">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors">Create New Project</span>
            </button>
          )}

          {activeProjects.map((proj) => {
            const projApprovedHours = state.timesheets
              .filter((ts) => ts.projectId === proj.id && ts.status === 'Approved')
              .reduce((sum, ts) => sum + ts.hours, 0);
            const totalHoursAllocated = proj.totalWorkHours || 250;
            const hoursPercent = Math.min(100, Math.round((projApprovedHours / totalHoursAllocated) * 100));

            return (
              <div
                key={proj.id}
                onClick={() => setSelectedProjectForDetails(proj)}
                className="rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#121214] p-5 space-y-4 hover:border-blue-500/50 transition-all shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between text-slate-900 dark:text-white group"
              >
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {proj.name}
                      </h3>
                      <span className="text-xs font-mono font-medium text-slate-400 dark:text-slate-500 shrink-0">
                        {proj.code}
                      </span>
                    </div>
                    {proj.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">
                        {proj.description}
                      </p>
                    )}
                  </div>

                  {/* Work Hours Budget & Timesheet Progress (Clean Inline, No Box) */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400 font-medium flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" /> Work Hours
                      </span>
                      <div className="text-right font-mono text-xs">
                        <span className="font-bold text-blue-600 dark:text-blue-400">{projApprovedHours}h</span>
                        <span className="text-slate-400 dark:text-slate-500 text-[11px]"> / {totalHoursAllocated}h</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${hoursPercent > 90 ? 'bg-amber-500' : 'bg-blue-600 dark:bg-blue-500'
                          }`}
                        style={{ width: `${hoursPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-slate-100 dark:border-[#282830] space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span>Lead: <strong className="text-slate-900 dark:text-white font-semibold">{proj.managerName}</strong></span>
                    <span>Category: <strong className="text-slate-900 dark:text-white font-semibold">{proj.category || 'General'}</strong></span>
                  </div>

                  {/* Action Bar: View Details */}
                  <div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProjectForDetails(proj);
                      }}
                      className="w-full py-2 rounded-xl border border-slate-200 dark:border-[#282830] bg-slate-50 hover:bg-slate-100 dark:bg-[#18181d] dark:hover:bg-[#222228] text-slate-700 dark:text-slate-200 font-semibold text-xs transition-all cursor-pointer text-center shadow-2xs"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task Detail Slide-over Drawer */}
      {selectedTask && (() => {
        const isTaskApproved = normalizeTaskStatus(selectedTask.status) === 'In Progress' || normalizeTaskStatus(selectedTask.status) === 'Completed';
        const canLogTime = isTaskApproved;
        const taskKey = getTaskKey(selectedTask);
        const isStandalone = !selectedTask.projectId || selectedTask.projectId === 'standalone' || selectedTask.projectId === 'general' || selectedTask.projectId === '';

        const taskTimesheets = state.timesheets.filter(
          (ts) => ts.taskId === selectedTask.id && !isTestEntity(ts.description) && !isTestEntity(ts.taskTitle)
        );
        const taskApprovedHours = taskTimesheets
          .filter((ts) => ts.status === 'Approved')
          .reduce((sum, ts) => sum + ts.hours, 0);
        const taskPendingHours = taskTimesheets
          .filter((ts) => ts.status === 'Submitted' || ts.status === 'Draft')
          .reduce((sum, ts) => sum + ts.hours, 0);
        const pendingLogs = taskTimesheets.filter((ts) => ts.status === 'Submitted' || ts.status === 'Draft');

        const taskSubtasks = selectedTask.subtasks || [];
        const completedSubtaskCount = taskSubtasks.filter((st) => st.completed).length;

        return (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900">
              {/* Drawer Header */}
              <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-start justify-between bg-white shrink-0 gap-3">
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 truncate max-w-[220px]">
                      <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0 stroke-[1.8]" />
                      <span className="truncate">{selectedTask.projectName || 'General'}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 shrink-0">
                      {normalizeTaskStatus(selectedTask.status)}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug break-words">
                    {selectedTask.title}
                  </h3>
                </div>
                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                  <button
                    type="button"
                    onClick={(e) => handleDeleteTask(selectedTask.id, e)}
                    title="Delete Task"
                    className="text-slate-400 hover:text-rose-600 p-2 cursor-pointer rounded-xl hover:bg-rose-50 transition-colors"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => setSelectedTask(null)}
                    className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Drawer Body */}
              <div className="p-4 sm:p-6 sm:px-8 space-y-5 sm:space-y-6 flex-1 overflow-y-auto custom-scrollbar bg-white">
                {/* Modern Workflow Status Segmented Stepper */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <label className="text-xs font-semibold text-slate-700">Workflow Status</label>
                    {normalizeTaskStatus(selectedTask.status) === 'Review' && !isSuperAdmin && (
                      <span className="text-[10px] sm:text-[11px] text-amber-600 font-medium flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        <AlertCircle className="h-3 w-3 shrink-0" /> Requires Super Admin to complete
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-slate-100 border border-slate-200">
                    {(['To Do', 'In Progress', 'Review', 'Completed'] as const).map((st) => {
                      const isActive = normalizeTaskStatus(selectedTask.status) === st;
                      const isReviewCompletedLocked = st === 'Completed' && normalizeTaskStatus(selectedTask.status) === 'Review' && !isSuperAdmin;

                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={isReviewCompletedLocked}
                          onClick={() => handleUpdateTaskStatus(selectedTask.id, st)}
                          className={`py-2 px-1 sm:px-2 rounded-lg text-[11px] sm:text-xs font-bold transition-all text-center flex items-center justify-center cursor-pointer truncate ${isActive
                            ? 'bg-blue-600 text-white shadow-xs'
                            : isReviewCompletedLocked
                              ? 'text-slate-300 cursor-not-allowed opacity-50'
                              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                            }`}
                          title={isReviewCompletedLocked ? 'Super Admin approval required' : `Move to ${st}`}
                        >
                          <span className="truncate">{st === 'Completed' ? 'Done' : st}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-2">Description & Deliverables</label>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 sm:p-4 text-xs sm:text-sm text-slate-700 leading-relaxed break-words">
                    {selectedTask.description || 'No detailed description provided for this deliverable.'}
                  </div>
                </div>

                {/* Subtasks Checklist Manager */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <CheckSquare className="h-3.5 w-3.5 text-blue-600" />
                      <span>Subtasks Checklist ({completedSubtaskCount}/{taskSubtasks.length})</span>
                    </label>
                  </div>

                  {/* Subtask Items */}
                  <div className="space-y-2">
                    {taskSubtasks.map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center justify-between p-2.5 sm:p-3 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-slate-50 transition-colors gap-2"
                      >
                        <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={st.completed}
                            onChange={() => handleToggleSubtask(selectedTask.id, st.id)}
                            className="h-4 w-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                          />
                          <span className={`text-xs font-medium truncate ${st.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {st.title}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleDeleteSubtask(selectedTask.id, st.id)}
                          className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    {/* Add Subtask Form */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Add a step or acceptance criterion..."
                        value={newSubtaskTitle}
                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubtask(selectedTask.id);
                          }
                        }}
                        className="flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddSubtask(selectedTask.id)}
                        className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 text-xs font-semibold cursor-pointer transition-colors shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Task Meta Stats Grid */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0 overflow-hidden">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Workspace</span>
                    <span className="text-xs font-bold text-blue-600 block truncate" title={selectedTask.projectName || 'General'}>
                      {selectedTask.projectName || 'General'}
                    </span>
                  </div>
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0 overflow-hidden">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Priority</span>
                    <span className={`text-xs font-bold block ${selectedTask.priority === 'Urgent'
                      ? 'text-rose-600'
                      : selectedTask.priority === 'High'
                        ? 'text-amber-600'
                        : 'text-slate-700'
                      }`}>
                      {selectedTask.priority}
                    </span>
                  </div>
                </div>

                {/* Assignee */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Assigned Member</label>
                  <div className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-medium text-slate-800 bg-white flex items-center gap-2">
                    <User className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">{selectedTask.assigneeName}</span>
                  </div>
                </div>

                {/* Live Time Tracking Section (No set work / estimated hours) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Time Tracked</label>
                    <button
                      onClick={() => {
                        setTaskLogHours('1.0');
                        setTaskLogDate(new Date().toISOString().split('T')[0]);
                        setTaskLogDescription('');
                        setShowTaskLogTimeModal(true);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer border border-slate-200 flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" /> Log Time
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-200 p-3.5 sm:p-4 bg-slate-50/70">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Time</span>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xl font-bold font-mono text-slate-900">
                            {formatHM(getTaskTotalSeconds(selectedTask))}
                          </span>
                          {selectedTask.isTimerRunning && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 animate-pulse">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
                              Running
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Timer Actions */}
                      <div className="flex items-center gap-1.5">
                        {selectedTask.isTimerRunning ? (
                          <button
                            type="button"
                            onClick={() => handleToggleTimer(selectedTask.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <Pause className="h-3.5 w-3.5 fill-current" />
                            <span>Pause</span>
                          </button>
                        ) : normalizeTaskStatus(selectedTask.status) === 'In Progress' ? (
                          <button
                            type="button"
                            onClick={() => handleToggleTimer(selectedTask.id)}
                            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>Resume</span>
                          </button>
                        ) : normalizeTaskStatus(selectedTask.status) === 'Completed' ? (
                          <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5">
                            <Check className="h-3.5 w-3.5 stroke-[2.5]" /> Completed
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleUpdateTaskStatus(selectedTask.id, 'In Progress')}
                            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                            <span>Start Working</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Attached Documents */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                      <span>Attached Documents ({(selectedTask.attachedDocIds || []).length})</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowAttachDriveModal(true)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer transition-colors shadow-2xs"
                      >
                        + Drive
                      </button>
                      <button
                        onClick={() => setShowUploadAttachModal(true)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition-colors shadow-2xs"
                      >
                        Upload
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 sm:p-5 sm:px-8 border-t border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0 pb-7 sm:pb-5">
                <button
                  type="button"
                  onClick={() => handleDeleteTask(selectedTask.id)}
                  className="py-2.5 px-3.5 sm:px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 font-semibold text-xs cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Task</span>
                </button>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="flex-1 sm:flex-none sm:w-28 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs cursor-pointer transition-all shadow-2xs text-center"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Start Task & Time Tracking Confirmation Modal */}
      {pendingTransitionTask && (() => {
        const task = pendingTransitionTask.task;
        const assigneeId = task.assigneeId;
        const assigneeName = task.assigneeName || 'Unassigned';

        // Find attendance record for assignee
        const todayStrVal = new Date().toISOString().split('T')[0];
        const attendanceRecord = state.attendance.find(
          (a) =>
            (a.employeeId === assigneeId || (assigneeName && a.employeeName.toLowerCase() === assigneeName.toLowerCase())) &&
            a.date === todayStrVal &&
            !!a.checkIn
        );
        const isCheckedIn = !!attendanceRecord && !attendanceRecord.checkOut;
        const isCheckedOut = !!attendanceRecord?.checkOut;
        const isCurrentAssignee = state.currentPersona?.id === assigneeId || state.currentPersona?.name === assigneeName;

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
                  <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
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
                  <Clock className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
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
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all active:scale-[0.99]"
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

      {/* Quick Log Time Modal */}
      {showTaskLogTimeModal && selectedTask && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-100 text-slate-900 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h4 className="text-lg font-bold text-slate-900">Log Time on Task</h4>
                <p className="text-xs text-slate-500 truncate max-w-[280px]">{selectedTask.title}</p>
              </div>
              <button
                onClick={() => setShowTaskLogTimeModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleTaskQuickLogTime} className="space-y-4 pt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Hours Spent *</label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    max="24"
                    value={taskLogHours}
                    onChange={(e) => setTaskLogHours(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono font-bold text-blue-600 outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Work Date *</label>
                  <input
                    type="date"
                    max={todayStr}
                    value={taskLogDate}
                    onChange={(e) => setTaskLogDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 [color-scheme:light] cursor-pointer"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Category</label>
                <select
                  value={taskLogCategory}
                  onChange={(e) => setTaskLogCategory(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="Development">Development</option>
                  <option value="Code Review">Code Review</option>
                  <option value="Testing">Testing & QA</option>
                  <option value="Design">Design & UI/UX</option>
                  <option value="Meeting">Meeting</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Work Notes / Accomplishment</label>
                <textarea
                  value={taskLogDescription}
                  onChange={(e) => setTaskLogDescription(e.target.value)}
                  placeholder="Summary of commits, PRs, or work accomplished..."
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-blue-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setTaskLogBillable(!taskLogBillable)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${taskLogBillable ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                >
                  {taskLogBillable ? 'Billable' : 'Non-Billable'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTaskLogTimeModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={taskLogDate > todayStr}
                    className={`px-5 py-2 rounded-xl text-white font-bold shadow-sm transition-colors ${taskLogDate > todayStr
                        ? 'bg-slate-300 cursor-not-allowed'
                        : taskLogDate < todayStr
                          ? 'bg-amber-600 hover:bg-amber-700 cursor-pointer'
                          : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                      }`}
                  >
                    {taskLogDate > todayStr ? 'Future Date Not Allowed' : taskLogDate < todayStr ? 'Apply for Regularization' : 'Save Time'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Task Slide-over Drawer */}
      {showCreateTaskModal && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900">
            {/* Drawer Header */}
            <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Add New Task</h3>
              <button
                onClick={() => setShowCreateTaskModal(false)}
                className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleCreateTask} className="flex-1 flex flex-col justify-between overflow-hidden bg-white">
              <div className="p-4 sm:p-6 sm:px-8 space-y-4 sm:space-y-5 overflow-y-auto custom-scrollbar text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">
                    Task Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Implement user authentication flow"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">
                    Project Workspace
                  </label>
                  <select
                    value={newTaskProj}
                    onChange={(e) => setNewTaskProj(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                  >
                    <option value="">General / Standalone</option>
                    <optgroup label="Active Projects">
                      {activeProjects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                {isAdmin ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">
                      Assignee Member <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={newTaskAssignee}
                      onChange={(e) => setNewTaskAssignee(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                    >
                      {assignableEmployees.map((e) => (
                        <option key={e.id} value={e.id} className="bg-white text-slate-800">
                          {e.name} ({e.designation})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">
                      Assignee Member
                    </label>
                    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 font-medium flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400" />
                        <span>{state.currentPersona?.name || 'Rajesh Sharma'}</span>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                        Assigned to You
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Priority Level</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                  >
                    <option value="Low" className="bg-white text-slate-800">Low Priority</option>
                    <option value="Medium" className="bg-white text-slate-800">Medium Priority</option>
                    <option value="High" className="bg-white text-slate-800">High Priority</option>
                    <option value="Urgent" className="bg-white text-slate-800">Urgent Priority</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Description & Deliverables</label>
                  <textarea
                    value={newTaskDescription}
                    onChange={(e) => setNewTaskDescription(e.target.value)}
                    placeholder="Provide deliverables details..."
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all resize-none"
                  />
                </div>
              </div>

              {/* Drawer Form Footer */}
              <div className="p-4 sm:p-5 sm:px-8 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0 pb-7 sm:pb-5">
                <button
                  type="button"
                  onClick={() => setShowCreateTaskModal(false)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 cursor-pointer transition-colors shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 sm:py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99]"
                >
                  Add Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Project Slide-over Drawer */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900">
            {/* Drawer Header */}
            <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Add New Project</h3>
              <button
                onClick={() => setShowCreateProjectModal(false)}
                className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleCreateProject} className="flex-1 flex flex-col justify-between overflow-hidden bg-white">
              <div className="p-4 sm:p-6 sm:px-8 space-y-4 sm:space-y-5 overflow-y-auto custom-scrollbar text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">
                    Project Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. NextGen Mobile Banking Suite"
                    value={newProjName}
                    onChange={(e) => setNewProjName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Project Code</label>
                    <input
                      type="text"
                      placeholder={`PRJ-${String(state.projects.length + 1).padStart(3, '0')}`}
                      value={newProjCode}
                      onChange={(e) => setNewProjCode(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm font-mono uppercase text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Category</label>
                    <select
                      value={newProjCategory}
                      onChange={(e) => setNewProjCategory(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                    >
                      <option value="General" className="bg-white text-slate-800">General</option>
                      <option value="Development" className="bg-white text-slate-800">Development</option>
                      <option value="Design" className="bg-white text-slate-800">Design & UI/UX</option>
                      <option value="DevOps" className="bg-white text-slate-800">DevOps & Cloud</option>
                      <option value="Security" className="bg-white text-slate-800">Security & Audit</option>
                      <option value="Marketing" className="bg-white text-slate-800">Marketing</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Client / Customer Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Apex Global Enterprises"
                    value={newProjClient}
                    onChange={(e) => setNewProjClient(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Total Budget Hours</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 250"
                      value={newProjTotalHours}
                      onChange={(e) => setNewProjTotalHours(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Priority</label>
                    <select
                      value={newProjPriority}
                      onChange={(e) => setNewProjPriority(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                    >
                      <option value="Low" className="bg-white text-slate-800">Low</option>
                      <option value="Medium" className="bg-white text-slate-800">Medium</option>
                      <option value="High" className="bg-white text-slate-800">High</option>
                      <option value="Urgent" className="bg-white text-slate-800">Urgent</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5 sm:mb-2">Project Overview & Objectives</label>
                  <textarea
                    value={newProjDescription}
                    onChange={(e) => setNewProjDescription(e.target.value)}
                    placeholder="Outline key deliverables, client expectations, and milestone checkpoints..."
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 sm:px-4 py-2.5 sm:py-3 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all resize-none"
                  />
                </div>
              </div>

              {/* Drawer Form Footer */}
              <div className="p-4 sm:p-5 sm:px-8 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0 pb-7 sm:pb-5">
                <button
                  type="button"
                  onClick={() => setShowCreateProjectModal(false)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 cursor-pointer transition-colors shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 sm:py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99]"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project Details & Admin Approval Slide-over Drawer */}
      {selectedProjectForDetails && (() => {
        const p = selectedProjectForDetails;
        const projectTasks = state.tasks.filter((t) => t.projectId === p.id && !isTestEntity(t.title));
        const projectTimesheets = state.timesheets.filter(
          (ts) => ts.projectId === p.id && !isTestEntity(ts.description)
        );
        const approvedHours = projectTimesheets
          .filter((ts) => ts.status === 'Approved')
          .reduce((sum, ts) => sum + ts.hours, 0);
        const totalBudgetHours = p.totalWorkHours || 250;
        const isPending = p.approvalStatus === 'Pending' || p.status === 'Pending Approval';
        const isDenied = p.approvalStatus === 'Denied' || p.status === 'Denied';
        const isApproved = p.approvalStatus === 'Approved' || (!isPending && !isDenied);
        const hoursPercent = Math.min(100, Math.round((approvedHours / totalBudgetHours) * 100));

        return (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900">
              {/* Drawer Header */}
              <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[11px] font-bold text-blue-600 uppercase tracking-wider block">
                      {p.code}
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border bg-emerald-50 border-emerald-200 text-emerald-700">
                      {p.status || 'In Progress'}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{p.name}</h3>
                </div>
                <button
                  onClick={() => setSelectedProjectForDetails(null)}
                  className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="p-4 sm:p-6 sm:px-8 space-y-5 sm:space-y-6 flex-1 overflow-y-auto custom-scrollbar bg-white text-xs">
                {/* Work Hours Budgeting by Admin/HR */}
                <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-blue-600" />
                        Project Work Hours Allocation
                      </span>
                    </div>

                    {isAdmin && !isEditingWorkHours && (
                      <button
                        onClick={() => {
                          setEditWorkHoursValue(String(p.totalWorkHours || 250));
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
                        onClick={() => handleUpdateProjectWorkHours(p.id, parseFloat(editWorkHoursValue) || 250)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold text-xs cursor-pointer hover:bg-blue-700"
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
                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Work Hours Set</span>
                        <span className="text-base font-mono font-bold text-blue-600">
                          {p.totalWorkHours || 250} hrs
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Hours Consumed</span>
                        <span className="text-base font-mono font-bold text-slate-800">
                          {approvedHours.toFixed(1)} hrs ({hoursPercent}%)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${hoursPercent >= 100 ? 'bg-rose-500' : hoursPercent >= 80 ? 'bg-amber-500' : 'bg-blue-600'
                        }`}
                      style={{ width: `${hoursPercent}%` }}
                    />
                  </div>
                </div>

                {/* Project Description */}
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Description</span>
                  <p className="text-slate-700 bg-slate-50 p-3.5 sm:p-4 rounded-xl border border-slate-200 leading-relaxed text-xs sm:text-sm">
                    {p.description || 'No detailed overview provided for this project workspace.'}
                  </p>
                </div>

                {/* Project Metadata Grid */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0 overflow-hidden">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Category</span>
                    <span className="text-xs font-bold text-slate-800 block truncate">{p.category || 'General'}</span>
                  </div>
                  <div className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white min-w-0 overflow-hidden">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Client</span>
                    <span className="text-xs font-bold text-slate-800 block truncate">{p.clientName || 'Internal Project'}</span>
                  </div>
                </div>

                {/* Project Tasks List in this Workspace */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-blue-600" />
                      <span>Workspace Deliverables ({projectTasks.length})</span>
                    </label>
                  </div>

                  {projectTasks.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      No deliverables added to this project yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projectTasks.map((t) => (
                        <div
                          key={t.id}
                          onClick={() => {
                            setSelectedProjectForDetails(null);
                            setSelectedTask(t);
                          }}
                          className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white hover:border-blue-400 transition-all flex items-center justify-between cursor-pointer shadow-2xs gap-2 min-w-0"
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
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-4 sm:p-5 sm:px-8 border-t border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0 pb-7 sm:pb-5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProjectForDetails(null);
                    handleOpenCreateTaskModal(p.id);
                  }}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 cursor-pointer transition-colors shadow-2xs text-center"
                >
                  + Add Deliverable
                </button>
                <button
                  onClick={() => setSelectedProjectForDetails(null)}
                  className="flex-1 py-2.5 sm:py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99] text-center"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Denial Reason Modal */}
      {showDenyReasonModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-100 text-slate-900 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h4 className="text-base font-bold text-slate-900">Deny Project Workspace</h4>
              <button
                onClick={() => setShowDenyReasonModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDenyReasonModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDenyProject(showDenyReasonModal, denyReasonText)}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-sm cursor-pointer"
                >
                  Confirm Denial
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Reject Task Modal */}
      {confirmRejectTaskId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200 text-slate-900">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">Are you sure you want to reject?</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
              This task will be moved to Review status.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRejectTaskId(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs cursor-pointer transition-all shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleRejectTask(confirmRejectTaskId);
                  setConfirmRejectTaskId(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs cursor-pointer shadow-sm transition-all"
              >
                Yes, Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
