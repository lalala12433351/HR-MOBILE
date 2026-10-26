'use client';
import { DateInput } from '@/components/common/DateInput';

import { api } from '../../services/apiClient';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  DollarSign,
  Tag,
  Search,
  Check,
  Zap,
  MoreVertical,
  X,
  FileText,
  Briefcase,
  Layers,
  Sparkles,
  Edit3,
  Trash2,
  Globe,
  Sun,
  Moon,
  GripVertical,
  Move,
} from 'lucide-react';
import { AppState, isTestEntity } from '../../services/store';
import { TimesheetEntry } from '../../types';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface GoogleCalendarTimesheetProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  selectedProjectId?: string;
}

// Convert "HH:MM" string (24h or 12h) to total minutes from midnight
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60; // default 09:00 AM = 540 mins

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

// Format minutes from midnight to "09:00 AM" or "21:00"
function formatMinutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export const GoogleCalendarTimesheet: React.FC<GoogleCalendarTimesheetProps> = ({
  state,
  onUpdateState,
  selectedProjectId = 'All',
}) => {
  // Role Detection: Personal for user/employee, All members for HR, Everything for Admin
  const userRole = state.currentPersona?.role;
  const isEmployee = userRole === 'employee' || userRole === 'faculty';
  const isHR = userRole === 'hr_manager';
  const isAdmin = userRole === 'super_admin' || userRole === 'admin' || userRole === 'project_manager' || userRole === 'sales_manager';

  // View Mode: 'day' | 'list' (Weekly view removed)
  const [calMode, setCalMode] = useState<'day' | 'list'>('day');

  // Selected Date (YYYY-MM-DD)
  const [currentDateStr, setCurrentDateStr] = useState<string>(new Date().toISOString().substring(0, 10));

  // 24 Hour view vs 12 Hour Business Hours view
  const [full24h, setFull24h] = useState<boolean>(true);

  // Selected Employee filter: default to personal for employee, 'All' for HR / Admin
  const [selectedEmpId, setSelectedEmpId] = useState<string>(
    isEmployee ? state.currentPersona?.id || 'All' : 'All'
  );
  const [selectedProjId, setSelectedProjId] = useState<string>(selectedProjectId);

  // Drag & Drop State for Rescheduling Time Blocks
  const [draggedEntryId, setDraggedEntryId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<{ dateStr: string; hourNum: number } | null>(null);
  const [dragToast, setDragToast] = useState<string | null>(null);

  // Search & Status filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  // Drag and Drop Event Handlers
  const handleDragStart = (e: React.DragEvent, entry: TimesheetEntry) => {
    e.dataTransfer.setData('text/plain', entry.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedEntryId(entry.id);
  };

  const handleDragOverSlot = (e: React.DragEvent, dateStr: string, hourNum: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverSlot?.dateStr !== dateStr || dragOverSlot?.hourNum !== hourNum) {
      setDragOverSlot({ dateStr, hourNum });
    }
  };
  const handleDragLeaveSlot = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSlot(null);
  };

  const handleDropOnSlot = async (targetDateStr: string, targetHourNum: number) => {
    setDragOverSlot(null);
    if (!draggedEntryId) return;

    const entry = state.timesheets.find((t) => t.id === draggedEntryId);
    if (!entry) return;

    // Calculate current duration in minutes
    const startMins = parseTimeToMinutes(entry.startTime || '09:00 AM');
    let endMins = parseTimeToMinutes(entry.endTime || '11:00 AM');
    if (endMins <= startMins) endMins += 24 * 60;
    const durationMins = Math.max(30, endMins - startMins);

    const newStartMins = targetHourNum * 60;
    const newEndMins = newStartMins + durationMins;

    const newStartFormatted = formatMinutesToTime(newStartMins);
    const newEndFormatted = formatMinutesToTime(newEndMins);
    const newHours = parseFloat((durationMins / 60).toFixed(1));

    setIsSaving(true);
    try {
      await api.projects.updateTimesheet(entry.id, {
        date: targetDateStr,
        startTime: newStartFormatted,
        endTime: newEndFormatted,
        hoursSpent: newHours,
      });

      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.map((t) =>
          t.id === entry.id
            ? {
                ...t,
                date: targetDateStr,
                startTime: newStartFormatted,
                endTime: newEndFormatted,
                hours: newHours,
              }
            : t
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'DRAGGED_TIMESHEET_TIME_ADJUSTMENT',
            entity: 'TimesheetEntry',
            entityId: entry.id,
            ipAddress: '127.0.0.1',
            details: `Drag & drop adjustment: Relocated work block "${entry.taskTitle}" to ${targetDateStr} (${newStartFormatted} - ${newEndFormatted})`,
          },
          ...prev.auditLogs,
        ],
      }));

      setDragToast(`Rescheduled "${entry.taskTitle}" to ${targetDateStr} (${newStartFormatted} - ${newEndFormatted})`);
      setTimeout(() => {
        setDragToast(null);
      }, 4000);

      setDraggedEntryId(null);
    } catch (err) {
      console.error('Failed to reschedule timesheet', err);
      alert('Failed to reschedule timesheet block.');
    } finally {
      setIsSaving(false);
    }
  };

  // Event Details Popover Modal
  const [selectedEntry, setSelectedEntry] = useState<TimesheetEntry | null>(null);

  // Edit Mode for Existing Entry
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // New / Edit Work Log Modal
  const [showLogModal, setShowLogModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteEntryId, setPendingDeleteEntryId] = useState<string | null>(null);
  const [logProjId, setLogProjId] = useState(state.projects[0]?.id || '');
  const [isCustomTask, setIsCustomTask] = useState(true); // Default to custom task input for maximum flexibility!
  const [logTaskId, setLogTaskId] = useState(state.tasks[0]?.id || '');
  const [customTaskTitle, setCustomTaskTitle] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().substring(0, 10));
  const [logStartTime, setLogStartTime] = useState('09:00');
  const [logEndTime, setLogEndTime] = useState('11:00');
  const [logHours, setLogHours] = useState('2.0');
  const [logCategory, setLogCategory] = useState<TimesheetEntry['category']>('Development');
  const [logBillable, setLogBillable] = useState(true);
  const [logDescription, setLogDescription] = useState('');

  // Ref to auto-scroll the time grid container to 8 AM on load
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Bounds for grid: 24h (0..24) vs Business Hours (8..20)
  const START_HOUR = full24h ? 0 : 8;
  const END_HOUR = full24h ? 24 : 20;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const HOUR_HEIGHT = 60; // 60px per hour

  // Scroll to 8 AM on initial render or view change
  useEffect(() => {
    if (scrollContainerRef.current) {
      const scrollTarget = full24h ? 8 * HOUR_HEIGHT : 0;
      scrollContainerRef.current.scrollTop = scrollTarget;
    }
  }, [full24h, calMode]);

  // Quick date selector pills for modal around current date
  const quickDatePills = useMemo(() => {
    const curDate = new Date(currentDateStr);
    const dayOfWeek = curDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const days: { dateStr: string; dayName: string; dayNum: number; isToday: boolean }[] = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(curDate);
      d.setDate(curDate.getDate() + mondayOffset + i);
      const iso = d.toISOString().split('T')[0];
      days.push({
        dateStr: iso,
        dayName: dayNames[i],
        dayNum: d.getDate(),
        isToday: iso === new Date().toISOString().substring(0, 10),
      });
    }
    return days;
  }, [currentDateStr]);

  // Navigate Date (Day by Day)
  const handlePrev = () => {
    const d = new Date(currentDateStr);
    d.setDate(d.getDate() - 1);
    setCurrentDateStr(d.toISOString().split('T')[0]);
  };

  const handleNext = () => {
    const d = new Date(currentDateStr);
    d.setDate(d.getDate() + 1);
    setCurrentDateStr(d.toISOString().split('T')[0]);
  };

  const handleToday = () => {
    setCurrentDateStr(new Date().toISOString().substring(0, 10));
  };

  // Open Log Modal pre-filled for ANY clicked time slot
  const handleSlotClick = (dateStr: string, hourNum: number) => {
    const startStr = `${String(hourNum).padStart(2, '0')}:00`;
    const endStr = `${String((hourNum + 1) % 24).padStart(2, '0')}:00`;
    setEditingEntryId(null);
    setLogDate(dateStr);
    setLogStartTime(startStr);
    setLogEndTime(endStr);
    setLogHours('1.0');
    setCustomTaskTitle('');
    setIsCustomTask(true);
    setLogDescription('');
    setShowLogModal(true);
  };

  // Auto calculate hours from start/end times
  const handleTimeChange = (sTime: string, eTime: string) => {
    setLogStartTime(sTime);
    setLogEndTime(eTime);
    const [sH, sM] = sTime.split(':').map(Number);
    const [eH, eM] = eTime.split(':').map(Number);
    if (!isNaN(sH) && !isNaN(eH)) {
      const startMins = sH * 60 + (sM || 0);
      let endMins = eH * 60 + (eM || 0);
      // Handle overnight shift (e.g. 11 PM to 2 AM)
      if (endMins <= startMins) {
        endMins += 24 * 60;
      }
      const diff = endMins - startMins;
      if (diff > 0) {
        setLogHours((diff / 60).toFixed(1));
      }
    }
  };

  // Filtered Timesheets: Personal for Employee, All Members for HR, Everything for Admin
  const filteredTimesheets = useMemo(() => {
    return state.timesheets.filter((ts) => {
      if (isTestEntity(ts.taskTitle) || isTestEntity(ts.projectName) || isTestEntity(ts.description)) {
        return false;
      }
      // 1. Role-based Member Scope
      if (isEmployee) {
        // Personal only for regular user / employee
        const matchSelf =
          ts.employeeId === state.currentPersona?.id ||
          ts.employeeName === state.currentPersona?.name;
        if (!matchSelf) return false;
      } else if (isHR) {
        // All members for HR: can view any member or all members
        if (selectedEmpId !== 'All' && ts.employeeId !== selectedEmpId) return false;
      } else {
        // Admin has access to everything
        if (selectedEmpId !== 'All' && ts.employeeId !== selectedEmpId) return false;
      }

      // 2. Project filter
      const matchProj = selectedProjId === 'All' || ts.projectId === selectedProjId;

      // 3. Status filter
      const matchStatus = filterStatus === 'All' || ts.status === filterStatus;

      // 4. Search query
      const matchQuery =
        !searchQuery ||
        ts.taskTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ts.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ts.description.toLowerCase().includes(searchQuery.toLowerCase());

      return matchProj && matchStatus && matchQuery;
    });
  }, [
    state.timesheets,
    state.currentPersona,
    isEmployee,
    isHR,
    isAdmin,
    selectedEmpId,
    selectedProjId,
    filterStatus,
    searchQuery,
  ]);

  // Prepare Edit Entry
  const handleStartEdit = (entry: TimesheetEntry) => {
    setEditingEntryId(entry.id);
    setLogProjId(entry.projectId);
    setLogTaskId(entry.taskId || '');
    setCustomTaskTitle(entry.taskTitle);
    setIsCustomTask(!state.tasks.some((t) => t.id === entry.taskId));
    setLogDate(entry.date);
    setLogStartTime(entry.startTime || '09:00');
    setLogEndTime(entry.endTime || '11:00');
    setLogHours(entry.hours.toString());
    setLogCategory(entry.category || 'Development');
    setLogBillable(entry.billable);
    setLogDescription(entry.description);
    setSelectedEntry(null);
    setShowLogModal(true);
  };

  // Delete Work Log
  const handleDeleteEntry = (entryId: string) => {
    setPendingDeleteEntryId(entryId);
  };

  const confirmDeleteEntry = async () => {
    const entryId = pendingDeleteEntryId;
    if (!entryId) return;
    setIsSaving(true);
    try {
      await api.projects.deleteTimesheet(entryId);
      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.filter((t) => t.id !== entryId),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'DELETED_WORK_LOG',
            entity: 'TimesheetEntry',
            entityId: entryId,
            ipAddress: '127.0.0.1',
            details: `Deleted Timesheet Entry ${entryId}`,
          },
          ...prev.auditLogs,
        ],
      }));
      setSelectedEntry(null);
      setPendingDeleteEntryId(null);
    } catch (err) {
      console.error('Failed to delete timesheet', err);
      alert('Failed to delete timesheet block.');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit New or Edited Work Log
  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const proj = state.projects.find((p) => p.id === logProjId);
    const selectedTask = state.tasks.find((t) => t.id === logTaskId);
    const hoursNum = parseFloat(logHours) || 1.0;

    const finalTitle = isCustomTask
      ? customTaskTitle || 'Custom Work Entry'
      : selectedTask?.title || 'General Task Work';

    setIsSaving(true);
    try {
      if (editingEntryId) {
        // UPDATE EXISTING ENTRY
        await api.projects.updateTimesheet(editingEntryId, {
          hoursSpent: hoursNum,
          description: logDescription || 'Updated work event',
        });
        
        onUpdateState((prev) => ({
          ...prev,
          timesheets: prev.timesheets.map((t) =>
            t.id === editingEntryId
              ? {
                  ...t,
                  projectId: logProjId,
                  projectName: proj?.name || 'Core Platform',
                  taskId: isCustomTask ? `task_custom_${Date.now()}` : logTaskId,
                  taskTitle: finalTitle,
                  date: logDate,
                  startTime: logStartTime,
                  endTime: logEndTime,
                  hours: hoursNum,
                  billable: logBillable,
                  category: logCategory,
                  description: logDescription || 'Updated work event',
                }
              : t
          ),
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'EDITED_WORK_LOG',
              entity: 'TimesheetEntry',
              entityId: editingEntryId,
              ipAddress: '127.0.0.1',
              details: `Updated Work Log: ${finalTitle} (${logStartTime}-${logEndTime}) on ${logDate}`,
            },
            ...prev.auditLogs,
          ],
        }));
      } else {
        // CREATE NEW ENTRY AT ANY TIME
        const taskId = isCustomTask ? `task_custom_${Date.now()}` : logTaskId;
        
        await api.projects.logTimesheet({
          projectId: logProjId === 'standalone' ? '' : logProjId,
          taskId: taskId,
          employeeId: state.currentPersona.id,
          workDate: logDate,
          hoursSpent: hoursNum,
          description: logDescription || 'Logged work event'
        });

        const newEntry: TimesheetEntry = {
          id: `ts_${Date.now()}`,
          employeeId: state.currentPersona.id,
          employeeName: state.currentPersona.name,
          projectId: logProjId,
          projectName: proj?.name || 'Core BOS Platform',
          taskId: taskId,
          taskTitle: finalTitle,
          date: logDate,
          startTime: logStartTime,
          endTime: logEndTime,
          hours: hoursNum,
          billable: logBillable,
          category: logCategory,
          description: logDescription || 'Logged work event',
          status: state.currentPersona.role === 'super_admin' ? 'Approved' : 'Submitted',
        };

        onUpdateState((prev) => ({
          ...prev,
          timesheets: [newEntry, ...prev.timesheets],
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'LOGGED_ANYTIME_WORK',
              entity: 'TimesheetEntry',
              entityId: newEntry.id,
              ipAddress: '127.0.0.1',
              details: `Google Calendar Work Event: ${hoursNum}h on "${finalTitle}" (${logStartTime}-${logEndTime}) on ${logDate}`,
            },
            ...prev.auditLogs,
          ],
        }));
      }

      setShowLogModal(false);
      setEditingEntryId(null);
      setCustomTaskTitle('');
      setLogDescription('');
    } catch (err) {
      console.error('Failed to log time', err);
      alert('Failed to log time to backend.');
    } finally {
      setIsSaving(false);
    }
  };

  // Status Change (Approve / Reject)
  const handleStatusChange = async (entry: TimesheetEntry, newStatus: TimesheetEntry['status']) => {
    setIsSaving(true);
    try {
      await api.projects.updateTimesheet(entry.id, {
        status: newStatus,
        approvedBy: newStatus === 'Approved' ? state.currentPersona.name : undefined,
      });

      onUpdateState((prev) => ({
        ...prev,
        timesheets: prev.timesheets.map((t) =>
          t.id === entry.id
            ? {
                ...t,
                status: newStatus,
                approvedBy: newStatus === 'Approved' ? prev.currentPersona.name : t.approvedBy,
              }
            : t
        ),
      }));
      if (selectedEntry?.id === entry.id) {
        setSelectedEntry({ ...entry, status: newStatus });
      }
    } catch (err) {
      console.error('Failed to change timesheet status', err);
      alert('Failed to change timesheet status.');
    } finally {
      setIsSaving(false);
    }
  };

  // Google Calendar Authentic Color Scheme for Event Blocks
  const getCategoryStyles = (category?: string) => {
    switch (category) {
      case 'Development':
        // Peacock Blue (#039be5)
        return 'bg-[#039be5]/20 text-white border border-[#039be5]/60 border-l-4 border-l-[#039be5] hover:bg-[#039be5]/30';
      case 'Testing':
        // Sage Green (#33b679)
        return 'bg-[#33b679]/20 text-white border border-[#33b679]/60 border-l-4 border-l-[#33b679] hover:bg-[#33b679]/30';
      case 'Code Review':
        // Ocean Blue (#0284c7)
        return 'bg-[#0284c7]/20 text-white border border-[#0284c7]/60 border-l-4 border-l-[#0284c7] hover:bg-[#0284c7]/30';
      case 'Design':
        // Banana Yellow (#f6bf26)
        return 'bg-[#f6bf26]/20 text-white border border-[#f6bf26]/60 border-l-4 border-l-[#f6bf26] hover:bg-[#f6bf26]/30';
      case 'Meeting':
        // Cobalt / Google Blue (#1a73e8)
        return 'bg-[#1a73e8]/20 text-white border border-[#1a73e8]/60 border-l-4 border-l-[#1a73e8] hover:bg-[#1a73e8]/30';
      case 'Documentation':
        // Tangerine Orange (#f4511e)
        return 'bg-[#f4511e]/20 text-white border border-[#f4511e]/60 border-l-4 border-l-[#f4511e] hover:bg-[#f4511e]/30';
      case 'Bug Fix':
        // Flamingo Red (#e67c73)
        return 'bg-[#e67c73]/20 text-white border border-[#e67c73]/60 border-l-4 border-l-[#e67c73] hover:bg-[#e67c73]/30';
      default:
        // Graphite Slate (#616161)
        return 'bg-[#616161]/20 text-white border border-[#616161]/60 border-l-4 border-l-[#616161] hover:bg-[#616161]/30';
    }
  };

  const getCategoryTextColor = (category?: string) => {
    switch (category) {
      case 'Development':
        return 'text-[#38bdf8]';
      case 'Testing':
        return 'text-[#4ade80]';
      case 'Code Review':
        return 'text-[#7dd3fc]';
      case 'Design':
        return 'text-[#fde047]';
      case 'Meeting':
        return 'text-[#60a5fa]';
      case 'Documentation':
        return 'text-[#fb923c]';
      case 'Bug Fix':
        return 'text-[#f87171]';
      default:
        return 'text-[#94a3b8]';
    }
  };

  // Generate 24-hour or 12-hour slots array
  const hoursArray = useMemo(() => {
    const list = [];
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const timeLabel = formatMinutesToTime(h * 60);
      list.push({ hourNum: h, label: timeLabel });
    }
    return list;
  }, [START_HOUR, END_HOUR]);

  return (
    <div className="space-y-4">
      {/* TOP NOTIFICATION & SCOPE BANNER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#282830] pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center font-bold">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Google Calendar Timesheet</span>
              <span className="bg-blue-950/40 text-blue-300 border border-blue-800/40 text-[10px] font-bold px-2 py-0.5 rounded-lg font-mono">
                {isEmployee ? 'Personal Scope' : isHR ? 'All Members (HR)' : 'Full Access (Admin)'}
              </span>
            </div>
            <p className="text-[11px] text-[#9e9ea7] mt-0.5">
              {isEmployee
                ? 'Your personal scheduled work sessions and tasks. Click any slot or drag blocks to adjust.'
                : isHR
                ? 'Review and manage daily timesheets for all company members and teams.'
                : 'Enterprise organization-wide timesheet command and work log allocation.'}
            </p>
          </div>
        </div>

        {/* Role-Specific Quick Scope Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {isEmployee ? (
            <div className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-blue-950/40 border border-blue-800/40 text-blue-300 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-blue-400" />
              <span>Personal: {state.currentPersona.name}</span>
            </div>
          ) : (
            <>
              <button
                onClick={() => setSelectedEmpId(state.currentPersona.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  selectedEmpId === state.currentPersona.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-[#18181d] text-[#9e9ea7] border-[#282830] hover:text-white'
                }`}
              >
                👤 My Time
              </button>
              <button
                onClick={() => setSelectedEmpId('All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                  selectedEmpId === 'All'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-[#18181d] text-[#9e9ea7] border-[#282830] hover:text-white'
                }`}
              >
                {isHR ? '👥 All Members (HR)' : '👑 Everything (Admin)'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* GOOGLE CALENDAR HEADER BAR */}
      <div className="rounded-lg border border-[#282830] bg-[#121214] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Navigation & Date Title */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToday}
              className="rounded-lg border border-[#282830] bg-[#18181d] px-3.5 py-1.5 text-xs font-bold text-white hover:border-blue-500 transition-all cursor-pointer"
            >
              Today
            </button>

            <div className="flex items-center gap-1 rounded-lg border border-[#282830] bg-[#18181d] p-1">
              <button
                onClick={handlePrev}
                className="rounded-lg p-1 text-[#9e9ea7] hover:bg-[#222228] hover:text-white transition-all cursor-pointer"
                title="Previous Day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={handleNext}
                className="rounded-lg p-1 text-[#9e9ea7] hover:bg-[#222228] hover:text-white transition-all cursor-pointer"
                title="Next Day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-blue-400" />
            <span>
              {new Date(currentDateStr).toLocaleDateString('en-GB', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </h2>
        </div>

        {/* Right View Switchers & Add Work Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 24-Hour Timeline Toggle */}
          <button
            onClick={() => setFull24h(!full24h)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
              full24h
                ? 'bg-blue-950/40 text-blue-300 border-blue-800/40'
                : 'bg-[#18181d] text-[#9e9ea7] border-[#282830] hover:text-white'
            }`}
            title="Toggle between full 24-hour day (12 AM - 12 AM) and standard business hours (8 AM - 8 PM)"
          >
            {full24h ? <Moon className="h-3.5 w-3.5 text-blue-400" /> : <Sun className="h-3.5 w-3.5 text-blue-400" />}
            <span>{full24h ? '24-Hour Full Grid' : '8 AM - 8 PM Work Hours'}</span>
          </button>

          {/* View Mode Buttons (Day & Agenda List) */}
          <div className="flex items-center rounded-lg bg-[#18181d] p-1 text-xs font-bold border border-[#282830]">
            <button
              onClick={() => setCalMode('day')}
              className={`rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                calMode === 'day'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-[#9e9ea7] hover:text-white'
              }`}
            >
              Day View
            </button>
            <button
              onClick={() => setCalMode('list')}
              className={`rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                calMode === 'list'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-[#9e9ea7] hover:text-white'
              }`}
            >
              Agenda List
            </button>
          </div>

          {/* Add Work Event Button */}
          <button
            onClick={() => {
              setEditingEntryId(null);
              setLogDate(currentDateStr);
              setCustomTaskTitle('');
              setIsCustomTask(true);
              setLogStartTime('09:00');
              setLogEndTime('10:00');
              setLogHours('1.0');
              setShowLogModal(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>+ Log Work Time</span>
          </button>
        </div>
      </div>

      {/* MAIN LAYOUT: SIDEBAR + CALENDAR GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* LEFT SIDEBAR: MINI CALENDAR & FILTERS */}
        <div className="space-y-4 lg:col-span-1">
          {/* Mini Month Picker & Quick Tip Card */}
          <div className="rounded-lg border border-[#282830] bg-[#121214] p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-[#282830] pb-2">
              <span className="text-xs font-bold uppercase tracking-widest text-white">
                {new Date(currentDateStr).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </span>
              <span className="text-[10px] font-bold text-blue-400 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded-lg font-mono">
                IST Timezone
              </span>
            </div>

            {/* Mini Calendar 7x5 Grid */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                <div key={idx} className="text-[#686873] py-1">
                  {day}
                </div>
              ))}
              {Array.from({ length: 31 }).map((_, i) => {
                const dayNum = i + 1;
                const cur = new Date(currentDateStr);
                const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const isSelected = dateStr === currentDateStr;
                const isToday = dateStr === new Date().toISOString().substring(0, 10);

                return (
                  <button
                    key={dayNum}
                    onClick={() => setCurrentDateStr(dateStr)}
                    className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold'
                        : isToday
                        ? 'bg-blue-950/40 text-blue-300 border border-blue-800/40 font-bold'
                        : 'text-slate-300 hover:bg-[#18181d] hover:text-white'
                    }`}
                  >
                    {dayNum}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role-Specific Filter Panel */}
          <div className="rounded-lg border border-[#282830] bg-[#121214] p-4 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white flex items-center gap-1.5">
              <Filter className="h-4 w-4 text-blue-400" /> Filters & Categories
            </h3>

            {/* Scope Selector based on User Role */}
            {isEmployee ? (
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-[#9e9ea7]">Timesheet Scope</label>
                <div className="p-2.5 bg-[#18181d] border border-blue-500/40 text-xs font-bold text-blue-300 flex items-center gap-2">
                  <User className="h-4 w-4 text-blue-400" />
                  <span>Personal Work Logs ({state.currentPersona?.name})</span>
                </div>
              </div>
            ) : isHR ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-[#9e9ea7]">Member Timesheets</label>
                  <span className="text-[10px] font-bold text-blue-400">All Members (HR)</span>
                </div>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 text-xs font-bold text-white outline-none focus:border-[var(--primary-blue)]"
                >
                  <option value="All">👥 All Company Members ({state.employees.length})</option>
                  {state.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.department})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-[#9e9ea7]">Organization Scope</label>
                  <span className="text-[10px] font-bold text-blue-400">Full Access (Admin)</span>
                </div>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 text-xs font-bold text-white outline-none focus:border-[var(--primary-blue)]"
                >
                  <option value="All">👑 Organization-Wide ({state.employees.length} Members)</option>
                  {state.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.department})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Project Selector */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-[#9e9ea7]">Project Filter</label>
              <select
                value={selectedProjId}
                onChange={(e) => setSelectedProjId(e.target.value)}
                className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 text-xs font-bold text-white outline-none focus:border-[var(--primary-blue)]"
              >
                <option value="All">📁 All Projects</option>
                {state.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Google Calendar Categories Legend */}
            <div className="pt-2 border-t border-[#282830] space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#686873]">
                Work Categories Legend
              </p>
              <div className="space-y-1.5 text-[11px] font-bold">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-lg bg-[#039be5]" />
                  <span className="text-slate-200">Development (Peacock)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-lg bg-[#33b679]" />
                  <span className="text-slate-200">Testing & QA (Sage)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-lg bg-[#0284c7]" />
                  <span className="text-slate-200">Code Review (Ocean Blue)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-lg bg-[#f6bf26]" />
                  <span className="text-slate-200">Design & UI (Banana)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-lg bg-[#1a73e8]" />
                  <span className="text-slate-200">Meetings & Sync (Cobalt Blue)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-lg bg-[#f4511e]" />
                  <span className="text-slate-200">Documentation (Tangerine)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-lg bg-[#e67c73]" />
                  <span className="text-slate-200">Bug Fix (Flamingo)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT MAIN AREA: GOOGLE CALENDAR TIME GRID */}
        <div className="lg:col-span-3 space-y-4">
          {calMode !== 'list' ? (
            <div className="rounded-lg border border-[#282830] bg-[#121214] overflow-hidden">
              {/* SINGLE DAY TIMELINE HEADER */}
              <div className="border-b border-[#282830] bg-[#18181d] p-3.5 text-left sticky top-0 z-20">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-[#9e9ea7] uppercase tracking-wider">
                      {new Date(currentDateStr).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    <h4 className="text-sm font-bold text-white mt-0.5">
                      {isEmployee
                        ? `Personal Schedule • ${state.currentPersona?.name}`
                        : isHR
                        ? selectedEmpId === 'All'
                          ? 'All Company Members Daily Timesheet'
                          : `${state.employees.find((e) => e.id === selectedEmpId)?.name || 'Member'} Timesheet`
                        : selectedEmpId === 'All'
                        ? 'Enterprise Timesheet & Work Allocation'
                        : `${state.employees.find((e) => e.id === selectedEmpId)?.name || 'Member'} Timesheet`}
                    </h4>
                  </div>
                  <span className="bg-blue-950/50 border border-blue-800/50 text-blue-300 text-xs font-bold px-2.5 py-1 rounded-lg font-mono">
                    {filteredTimesheets.filter((t) => t.date === currentDateStr).length} Events Today
                  </span>
                </div>
              </div>

              {/* VERTICAL TIME GRID CANVAS WITH SMOOTH SCROLLING */}
              <div
                ref={scrollContainerRef}
                className="relative overflow-y-auto max-h-[640px] border-b border-[#282830]"
                style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
              >
                {/* Horizontal Hour Slot Lines */}
                {hoursArray.map((hourObj, index) => {
                  const isTarget =
                    dragOverSlot?.dateStr === currentDateStr && dragOverSlot?.hourNum === hourObj.hourNum;

                  return (
                    <div
                      key={hourObj.hourNum}
                      style={{
                        top: `${index * HOUR_HEIGHT}px`,
                        height: `${HOUR_HEIGHT}px`,
                      }}
                      className="absolute inset-x-0 border-b border-[#282830]/60 flex items-start group pointer-events-none"
                    >
                      {/* Time Label Column */}
                      <div className="w-1/8 text-right pr-3 -mt-2 text-[10px] font-bold text-[#686873] font-mono pointer-events-auto">
                        {hourObj.label}
                      </div>

                      {/* Full Width Day Time Slot Column */}
                      <div className="w-7/8 h-full border-l border-[#282830] pointer-events-auto">
                        <div
                          onClick={() => handleSlotClick(currentDateStr, hourObj.hourNum)}
                          onDragOver={(e) => handleDragOverSlot(e, currentDateStr, hourObj.hourNum)}
                          onDragLeave={handleDragLeaveSlot}
                          onDrop={() => handleDropOnSlot(currentDateStr, hourObj.hourNum)}
                          className={`h-full w-full hover:bg-[#18181d] cursor-pointer transition-all relative flex items-center justify-center group/slot ${
                            isTarget
                              ? 'bg-blue-950/80 ring-2 ring-blue-500 ring-inset font-bold text-white'
                              : ''
                          }`}
                          title={`Click to log work or drop dragged block at ${hourObj.label} on ${currentDateStr}`}
                        >
                          {isTarget ? (
                            <span className="bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-lg animate-pulse flex items-center gap-1">
                              <Move className="h-3 w-3" /> Drop Work Block
                            </span>
                          ) : (
                            <span className="opacity-0 group-hover/slot:opacity-100 bg-blue-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-lg transition-opacity pointer-events-none">
                              + Add Work at {hourObj.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* INDIGO CURRENT TIME INDICATOR LINE (if viewing today) */}
                {currentDateStr === new Date().toISOString().substring(0, 10) && (
                  <div
                    style={{
                      top: `${(17.75 - START_HOUR) * HOUR_HEIGHT}px`, // ~05:45 PM
                    }}
                    className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                  >
                    <div className="h-2.5 w-2.5 rounded-lg bg-blue-500 -ml-1.5 animate-pulse" />
                    <div className="h-[1.5px] w-full bg-blue-500/80" />
                    <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-lg font-mono mr-2">
                      NOW
                    </span>
                  </div>
                )}

                {/* CALENDAR EVENT CARDS (OVERLAID AT EXACT TIME OFFSETS) */}
                {filteredTimesheets.map((entry) => {
                  if (entry.date !== currentDateStr) return null;

                  // Parse start & end times to calculate CSS top & height
                  const startMins = parseTimeToMinutes(entry.startTime || '09:00 AM');
                  let endMins = parseTimeToMinutes(
                    entry.endTime || `${Math.min(23, Math.floor(startMins / 60) + Math.ceil(entry.hours))}:00`
                  );

                  if (endMins <= startMins) {
                    endMins += 24 * 60; // Overnight
                  }

                  const startOffsetMins = Math.max(0, startMins - START_HOUR * 60);
                  const durationMins = Math.max(30, endMins - startMins);

                  const topPx = (startOffsetMins / 60) * HOUR_HEIGHT;
                  const heightPx = (durationMins / 60) * HOUR_HEIGHT;

                  const isDragging = draggedEntryId === entry.id;

                  return (
                    <div
                      key={entry.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, entry)}
                      onDragEnd={() => {
                        setDraggedEntryId(null);
                        setDragOverSlot(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedEntry(entry);
                      }}
                      style={{
                        top: `${topPx}px`,
                        height: `${heightPx}px`,
                        left: '14%',
                        width: '84%',
                      }}
                      className={`absolute z-10 rounded-lg p-3 transition-all cursor-grab active:cursor-grabbing overflow-hidden group ${getCategoryStyles(
                        entry.category
                      )} ${
                        isDragging
                          ? 'opacity-40 ring-2 ring-blue-500'
                          : 'hover:border-blue-400'
                      }`}
                      title="Drag block to move time slot across hours, or click to view details"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 truncate">
                          <GripVertical className="h-3.5 w-3.5 text-[#9e9ea7] group-hover:text-white shrink-0 cursor-grab" />
                          <span className={`font-mono text-[10px] font-bold uppercase truncate ${getCategoryTextColor(entry.category)}`}>
                            {entry.startTime || '09:00'} - {entry.endTime || '11:00'} ({entry.hours} hrs)
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {entry.billable && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-black/40 px-1.5 py-0.5 border border-white/20">
                              <DollarSign className="h-3 w-3" /> Billable
                            </span>
                          )}
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[#121214] border border-[#282830] text-slate-300">
                            {entry.status}
                          </span>
                        </div>
                      </div>

                      <p className="font-bold text-xs truncate leading-tight mt-1 text-white">
                        {entry.taskTitle}
                      </p>

                      <div className="flex items-center gap-2 text-[11px] opacity-90 truncate mt-1 text-[#9e9ea7]">
                        <span className="font-semibold text-slate-200">{entry.projectName}</span> •{' '}
                        <span>{entry.employeeName}</span> •{' '}
                        <span className="text-[var(--text-muted)]">{entry.description}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* LIST AGENDA VIEW */
            <div className="bg-[#121214] rounded-lg border border-[#282830] overflow-hidden">
              <div className="p-4 border-b border-[#282830] flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Timesheet Work Events Agenda</h3>
                <span className="text-xs font-semibold text-[#9e9ea7]">{filteredTimesheets.length} Logs</span>
              </div>

              <div className="divide-y divide-[#282830] font-medium text-xs">
                {filteredTimesheets.map((entry) => (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="p-4 hover:bg-[#18181d] transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-lg font-mono font-bold flex items-center justify-center shrink-0 border ${getCategoryStyles(entry.category)}`}>
                        {entry.hours}h
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-sm">{entry.taskTitle}</span>
                          <span className="rounded-lg bg-[#18181d] border border-[#282830] text-blue-400 text-[10px] font-bold px-2 py-0.5">
                            {entry.projectName}
                          </span>
                        </div>
                        <p className="text-[#9e9ea7] text-xs mt-0.5">{entry.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-right">
                        <p className="font-bold text-white">{entry.date}</p>
                        <p className={`font-mono text-[11px] font-bold ${getCategoryTextColor(entry.category)}`}>
                          {entry.startTime} - {entry.endTime}
                        </p>
                      </div>

                      <span
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-bold border ${
                          entry.status === 'Approved'
                            ? 'bg-blue-950/40 text-blue-300 border-blue-800/40'
                            : 'bg-[#18181d] text-[#9e9ea7] border-[#282830]'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* INSPECT EVENT DETAILS POPOVER */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative w-full max-w-lg rounded-lg border border-[#282830] bg-[#121214] p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-[#282830] pb-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Work Event Timesheet Entry</h3>
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-[#9e9ea7] hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between bg-[#18181d] p-3 rounded-lg border border-[#282830]">
                <div>
                  <p className="text-[10px] font-bold text-blue-400 uppercase">Task Title</p>
                  <p className="text-sm font-bold text-white">{selectedEntry.taskTitle}</p>
                  <p className="text-xs text-[#9e9ea7] font-semibold">{selectedEntry.projectName}</p>
                </div>
                <div className="text-right">
                  <span className="font-mono text-base font-bold text-blue-400">
                    {selectedEntry.hours} hrs
                  </span>
                  <p className="text-[10px] font-bold text-[#686873] font-mono">
                    {selectedEntry.startTime} - {selectedEntry.endTime} ({selectedEntry.date})
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#18181d] p-2.5 rounded-lg border border-[#282830]">
                  <p className="text-[10px] font-bold text-[#686873] uppercase">Logged By</p>
                  <p className="font-bold text-white mt-0.5">{selectedEntry.employeeName}</p>
                </div>

                <div className="bg-[#18181d] p-2.5 rounded-lg border border-[#282830]">
                  <p className="text-[10px] font-bold text-[#686873] uppercase">Category & Billability</p>
                  <p className="font-bold text-white mt-0.5">
                    {selectedEntry.category || 'Development'} •{' '}
                    <span className={selectedEntry.billable ? 'text-blue-400 font-bold' : 'text-[#9e9ea7]'}>
                      {selectedEntry.billable ? 'Billable' : 'Non-Billable'}
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-bold text-[#686873] uppercase mb-1">Work Description</p>
                <p className="bg-[#18181d] p-3 rounded-lg border border-[#282830] text-slate-300 font-medium">
                  {selectedEntry.description || 'No additional notes logged.'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#282830]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleStartEdit(selectedEntry)}
                    className="flex items-center gap-1.5 rounded-lg border border-[#282830] bg-[#18181d] hover:border-blue-500 text-white font-bold px-3 py-1.5 text-xs cursor-pointer transition-all"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-blue-400" />
                    <span>Edit Work</span>
                  </button>
                  <button
                    onClick={() => handleDeleteEntry(selectedEntry.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-[#282830] bg-[#18181d] hover:bg-[#222228] text-[#9e9ea7] hover:text-white font-bold px-3 py-1.5 text-xs cursor-pointer transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete</span>
                  </button>
                </div>

                {selectedEntry.status === 'Submitted' &&
                (state.currentPersona.role === 'super_admin' ||
                  state.currentPersona.role === 'project_manager' ||
                  state.currentPersona.role === 'hr_manager') ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStatusChange(selectedEntry, 'Approved')}
                      className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 text-xs cursor-pointer transition-all"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleStatusChange(selectedEntry, 'Rejected')}
                      className="rounded-lg bg-[#18181d] border border-[#282830] hover:bg-[#222228] text-[#9e9ea7] hover:text-white font-bold px-3 py-1.5 text-xs cursor-pointer transition-all"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedEntry(null)}
                    className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-1.5 text-xs cursor-pointer transition-all"
                  >
                    Close
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE OR EDIT WORK EVENT MODAL (ANY WORK AT ANY TIME) */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative w-full max-w-md rounded-lg border border-[#282830] bg-[#121214] p-6 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-[#282830] pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">
                  {editingEntryId ? 'Edit Work Event' : 'Add Any Work at Any Time'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowLogModal(false);
                  setEditingEntryId(null);
                }}
                className="text-[#9e9ea7] hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleLogSubmit} className="space-y-3 text-xs">
              {/* Task Selector Mode: Custom Title vs Existing Jira Task */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-[#9e9ea7]">Work Title Type</label>
                <div className="grid grid-cols-2 gap-2 bg-[#18181d] p-1 rounded-lg border border-[#282830] text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setIsCustomTask(true)}
                    className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                      isCustomTask
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-[#9e9ea7] hover:text-white'
                    }`}
                  >
                    ✏️ Custom Work Title
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCustomTask(false)}
                    className={`py-1.5 rounded-lg transition-all cursor-pointer ${
                      !isCustomTask
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-[#9e9ea7] hover:text-white'
                    }`}
                  >
                    📌 Existing Jira Task
                  </button>
                </div>
              </div>

              {/* Work Title Input */}
              {isCustomTask ? (
                <div>
                  <label className="block font-semibold text-[#9e9ea7] mb-1">
                    Custom Work Name / Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ad-hoc Client Call, Late-Night Server Deploy, Architecture Review"
                    value={customTaskTitle}
                    onChange={(e) => setCustomTaskTitle(e.target.value)}
                    className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 font-bold text-white outline-none focus:border-[var(--primary-blue)]"
                  />
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-[#9e9ea7] mb-1">Select Jira Task</label>
                  <select
                    value={logTaskId}
                    onChange={(e) => setLogTaskId(e.target.value)}
                    className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 font-semibold text-white outline-none focus:border-[var(--primary-blue)]"
                  >
                    {state.tasks
                      .filter((t) => logProjId === 'All' || t.projectId === logProjId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Project Selection */}
              <div>
                <label className="block font-semibold text-[#9e9ea7] mb-1">Project</label>
                <select
                  value={logProjId}
                  onChange={(e) => {
                    setLogProjId(e.target.value);
                    const pTasks = state.tasks.filter((t) => t.projectId === e.target.value);
                    if (pTasks[0]) setLogTaskId(pTasks[0].id);
                  }}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 font-semibold text-white outline-none focus:border-[var(--primary-blue)]"
                >
                  {state.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date Input with Particular Day Selection */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-[#9e9ea7]">Work Date</label>
                  <span className="bg-blue-950/40 border border-blue-800/40 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-lg font-mono">
                    Selected Day: {logDate === new Date().toISOString().substring(0, 10) ? 'Today' : logDate}
                  </span>
                </div>
                <DateInput required value={logDate} onChange={(e) => setLogDate(e.target.value)}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 font-bold text-white outline-none focus:border-[var(--primary-blue)]"
                />

                {/* Quick Particular Day Selection Pills */}
                <div className="mt-2 flex items-center gap-1 overflow-x-auto pb-1">
                  {quickDatePills.map((d) => (
                    <button
                      key={d.dateStr}
                      type="button"
                      onClick={() => setLogDate(d.dateStr)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-all border cursor-pointer ${
                        logDate === d.dateStr
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-[#18181d] text-[#9e9ea7] border-[#282830] hover:text-white'
                      }`}
                    >
                      {d.dayName} {d.dayNum} {d.isToday ? '★' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start & End Time Block for Any Hour Slot */}
              <div className="grid grid-cols-3 gap-2 bg-[#18181d] p-3 rounded-lg border border-[#282830]">
                <div>
                  <label className="block font-bold text-blue-400 text-[10px] uppercase mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={logStartTime}
                    onChange={(e) => handleTimeChange(e.target.value, logEndTime)}
                    className="w-full rounded-lg border border-[#282830] bg-[#121214] p-1.5 font-mono text-xs font-bold text-white outline-none focus:border-[var(--primary-blue)]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-blue-400 text-[10px] uppercase mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={logEndTime}
                    onChange={(e) => handleTimeChange(logStartTime, e.target.value)}
                    className="w-full rounded-lg border border-[#282830] bg-[#121214] p-1.5 font-mono text-xs font-bold text-white outline-none focus:border-[var(--primary-blue)]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-blue-400 text-[10px] uppercase mb-1">
                    Total Hours
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.25"
                    max="24"
                    required
                    value={logHours}
                    onChange={(e) => setLogHours(e.target.value)}
                    className="w-full rounded-lg border border-[#282830] bg-[#121214] p-1.5 font-mono text-xs font-bold text-blue-400 outline-none focus:border-[var(--primary-blue)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1">
                    <label className="block font-semibold text-[#9e9ea7]">Category</label>
                  </div>
                  <select
                    value={logCategory}
                    onChange={(e) => setLogCategory(e.target.value as any)}
                    className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 font-bold text-white outline-none focus:border-[var(--primary-blue)]"
                  >
                    {state.customOptions.timesheetCategories.map((tc) => (
                      <option key={tc.id} value={tc.name}>
                        {tc.name} ({tc.billableDefault ? 'Billable' : 'Non-Billable'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-[#9e9ea7]">
                    <input
                      type="checkbox"
                      checked={logBillable}
                      onChange={(e) => setLogBillable(e.target.checked)}
                      className="rounded-lg text-blue-600 accent-blue-600 h-4 w-4"
                    />
                    <span>Billable Work</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#9e9ea7] mb-1">
                  Work Log Description
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Describe code written, APIs tested, or client discussion..."
                  value={logDescription}
                  onChange={(e) => setLogDescription(e.target.value)}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 font-medium text-white outline-none focus:border-[var(--primary-blue)]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#282830]">
                <button
                  type="button"
                  onClick={() => {
                    setShowLogModal(false);
                    setEditingEntryId(null);
                  }}
                  className="rounded-lg border border-[#282830] px-4 py-2 font-bold text-[#9e9ea7] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 font-bold text-white transition-all cursor-pointer"
                >
                  {editingEntryId ? 'Update Work Event' : 'Save Work Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingDeleteEntryId && (
        <ConfirmDialog
          title="Delete this work log?"
          description="This work log event will be removed. This cannot be undone."
          confirmLabel="Delete work log"
          busy={isSaving}
          busyLabel="Deleting…"
          onCancel={() => setPendingDeleteEntryId(null)}
          onConfirm={() => void confirmDeleteEntry()}
        />
      )}

      {/* DRAG AND DROP SUCCESS TOAST */}
      {dragToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#121214] text-white font-bold text-xs px-4 py-3 rounded-lg shadow-2xl border border-[#282830] flex items-center gap-2.5 animate-in slide-in-from-bottom-2 duration-200">
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span>{dragToast}</span>
          <button onClick={() => setDragToast(null)} className="ml-2 text-[#9e9ea7] hover:text-white cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
