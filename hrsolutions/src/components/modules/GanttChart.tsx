'use client';

import { api } from '../../services/apiClient';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronRight,
  ChevronDown,
  Clock,
  User,
  Plus,
  Filter,
  Layers,
  Sparkles,
  Link as LinkIcon,
  Milestone,
  CheckCircle2,
  AlertCircle,
  Move,
  Info,
  Sliders,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Check,
  X,
  Edit2,
  Trash2,
  Flag,
} from 'lucide-react';
import { AppState } from '../../services/store';
import { Task, Project } from '../../types';

interface GanttChartProps {
  state: AppState;
  selectedProjectId: string;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

type ZoomLevel = 'days' | 'weeks' | 'months';

// Helper date utilities
const parseDate = (dateStr: string): Date => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date();
  return d;
};

const formatDate = (date: Date): string => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const getDaysDifference = (d1: Date, d2: Date): number => {
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

export const GanttChart: React.FC<GanttChartProps> = ({
  state,
  selectedProjectId,
  onUpdateState,
}) => {
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('weeks');
  const [isSaving, setIsSaving] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [showDependencies, setShowDependencies] = useState(true);
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [onlyMilestones, setOnlyMilestones] = useState(false);
  
  // Drag-and-drop state
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragType, setDragType] = useState<'move' | 'resize-start' | 'resize-end' | 'progress' | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [initialTaskDates, setInitialTaskDates] = useState<{ start: string; due: string; progress: number } | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  
  // Task Editing Modal
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showAddTaskModal, setShowAddTaskModal] = useState<boolean>(false);
  const [targetProjectIdForNewTask, setTargetProjectIdForNewTask] = useState<string>('');

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Filter projects & tasks
  const filteredProjects = useMemo(() => {
    if (selectedProjectId === 'All') return state.projects;
    return state.projects.filter((p) => p.id === selectedProjectId);
  }, [state.projects, selectedProjectId]);

  const filteredTasks = useMemo(() => {
    return state.tasks.filter((t) => {
      const matchProject = selectedProjectId === 'All' || t.projectId === selectedProjectId;
      const matchStatus = filterStatus === 'All' || t.status === filterStatus;
      const matchSearch =
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.assigneeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.projectName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchMilestone = !onlyMilestones || !!t.isMilestone;
      return matchProject && matchStatus && matchSearch && matchMilestone;
    });
  }, [state.tasks, selectedProjectId, filterStatus, searchQuery, onlyMilestones]);

  // Determine timeline boundary dates
  const { minDate, maxDate, totalDays, datesArray } = useMemo(() => {
    const now = new Date();
    let min = new Date(now.getFullYear(), now.getMonth(), 1);
    let max = new Date(now.getFullYear(), now.getMonth() + 3, 0);

    filteredProjects.forEach((p) => {
      const pStart = parseDate(p.startDate);
      const pEnd = parseDate(p.endDate);
      if (pStart < min) min = pStart;
      if (pEnd > max) max = pEnd;
    });

    filteredTasks.forEach((t) => {
      const tStart = parseDate(t.startDate);
      const tEnd = parseDate(t.dueDate);
      if (tStart < min) min = tStart;
      if (tEnd > max) max = tEnd;
    });

    // Add padding days
    min = addDays(min, -5);
    max = addDays(max, 10);

    const total = Math.max(30, getDaysDifference(min, max));
    const dates: Date[] = [];
    for (let i = 0; i <= total; i++) {
      dates.push(addDays(min, i));
    }

    return { minDate: min, maxDate: max, totalDays: total, datesArray: dates };
  }, [filteredProjects, filteredTasks]);

  // Pixel column width per day based on Zoom Level
  const colWidth = useMemo(() => {
    if (zoomLevel === 'days') return 36;
    if (zoomLevel === 'weeks') return 18; // ~126px per week
    return 8; // ~240px per month
  }, [zoomLevel]);

  const timelineWidth = totalDays * colWidth;

  // Convert Date to Pixel X Offset
  const dateToX = (dateStr: string) => {
    const d = parseDate(dateStr);
    const diff = getDaysDifference(minDate, d);
    return Math.max(0, diff * colWidth);
  };

  const xToDateStr = (x: number): string => {
    const daysOffset = Math.round(x / colWidth);
    const newDate = addDays(minDate, daysOffset);
    return formatDate(newDate);
  };

  // Today marker line position
  const todayX = useMemo(() => {
    const today = new Date();
    const diff = getDaysDifference(minDate, today);
    return diff * colWidth;
  }, [minDate, colWidth]);

  // Calculate task positions & dimensions map for drawing SVG dependency connectors
  const taskPositions = useMemo(() => {
    const posMap: Record<string, { x: number; y: number; width: number; yCenter: number }> = {};
    let currentYIndex = 0;

    filteredProjects.forEach((proj) => {
      currentYIndex++; // Project row
      if (!collapsedProjects[proj.id]) {
        const projTasks = filteredTasks.filter((t) => t.projectId === proj.id);
        projTasks.forEach((task) => {
          const x = dateToX(task.startDate);
          const endX = dateToX(task.dueDate);
          const width = Math.max(colWidth, endX - x + colWidth);
          const y = currentYIndex * 48 + 12; // 48px row height, offset 12px
          posMap[task.id] = {
            x,
            y,
            width,
            yCenter: y + 12,
          };
          currentYIndex++;
        });
      }
    });

    return posMap;
  }, [filteredProjects, filteredTasks, collapsedProjects, dateToX, colWidth]);

  // Toggle Collapse
  const toggleProjectCollapse = (projId: string) => {
    setCollapsedProjects((prev) => ({ ...prev, [projId]: !prev[projId] }));
  };

  // Mouse Handlers for Drag-and-Drop Updates
  const handleMouseDown = (
    e: React.MouseEvent,
    task: Task,
    type: 'move' | 'resize-start' | 'resize-end' | 'progress'
  ) => {
    e.stopPropagation();
    setDraggingTaskId(task.id);
    setDragType(type);
    setDragStartX(e.clientX);
    const taskProg = task.progress ?? (task.status === 'Completed' ? 100 : task.status === 'In Progress' ? 50 : 0);
    setInitialTaskDates({ start: task.startDate, due: task.dueDate, progress: taskProg });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingTaskId || !dragType || !initialTaskDates) return;

      const deltaX = e.clientX - dragStartX;
      const daysDelta = Math.round(deltaX / colWidth);

      if (dragType === 'move') {
        const newStart = formatDate(addDays(parseDate(initialTaskDates.start), daysDelta));
        const newDue = formatDate(addDays(parseDate(initialTaskDates.due), daysDelta));
        updateTaskInMemory(draggingTaskId, { startDate: newStart, dueDate: newDue });
      } else if (dragType === 'resize-start') {
        const newStart = formatDate(addDays(parseDate(initialTaskDates.start), daysDelta));
        if (parseDate(newStart) <= parseDate(initialTaskDates.due)) {
          updateTaskInMemory(draggingTaskId, { startDate: newStart });
        }
      } else if (dragType === 'resize-end') {
        const newDue = formatDate(addDays(parseDate(initialTaskDates.due), daysDelta));
        if (parseDate(newDue) >= parseDate(initialTaskDates.start)) {
          updateTaskInMemory(draggingTaskId, { dueDate: newDue });
        }
      } else if (dragType === 'progress') {
        const taskPos = taskPositions[draggingTaskId];
        if (taskPos) {
          const currentX = e.clientX;
          // Calculate progress percentage based on mouse position relative to bar start
          const taskElemLeft = dragStartX - (taskPos.width * (initialTaskDates.progress / 100));
          const newWidth = currentX - taskElemLeft;
          let newProgress = Math.min(100, Math.max(0, Math.round((newWidth / taskPos.width) * 100)));
          updateTaskInMemory(draggingTaskId, {
            progress: newProgress,
            status: newProgress === 100 ? 'Completed' : newProgress > 0 ? 'In Progress' : 'To Do',
          });
        }
      }
    };

    const handleMouseUp = async () => {
      if (draggingTaskId) {
        setIsSaving(true);
        try {
          const updatedTask = state.tasks.find((t) => t.id === draggingTaskId);
          if (updatedTask) {
            await api.projects.updateTask(draggingTaskId, {
              status: updatedTask.status,
            });

            triggerToast(`Updated timeline & schedule for task!`);
            // Recalculate parent project overall progress & log audit event
            onUpdateState((prev) => {
              const taskInPrev = prev.tasks.find((t) => t.id === draggingTaskId);
              if (!taskInPrev) return prev;

              // Compute new project progress average
              const projTasks = prev.tasks.filter((t) => t.projectId === taskInPrev.projectId);
              const totalTasks = projTasks.length || 1;
              const completedCount = projTasks.filter((t) => t.status === 'Completed').length;
              const newProjProgress = Math.round((completedCount / totalTasks) * 100);

              return {
                ...prev,
                projects: prev.projects.map((p) =>
                  p.id === taskInPrev.projectId ? { ...p, progress: newProjProgress } : p
                ),
                auditLogs: [
                  {
                    id: `log_${Date.now()}`,
                    timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    user: prev.currentPersona.name,
                    action: 'GANTT_SCHEDULE_UPDATED',
                    entity: 'TaskSchedule',
                    entityId: taskInPrev.id,
                    ipAddress: '127.0.0.1',
                    details: `Updated Gantt schedule for task '${taskInPrev.title}' (Dates: ${taskInPrev.startDate} to ${taskInPrev.dueDate}, Progress: ${taskInPrev.progress || 0}%)`,
                  },
                  ...prev.auditLogs,
                ],
              };
            });
          }
        } catch (err) {
          console.error('Failed to update task schedule', err);
          alert('Failed to save task schedule update.');
        } finally {
          setIsSaving(false);
        }
      }
      setDraggingTaskId(null);
      setDragType(null);
      setInitialTaskDates(null);
    };

    if (draggingTaskId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingTaskId, dragType, dragStartX, initialTaskDates, colWidth, taskPositions]);

  const updateTaskInMemory = (taskId: string, changes: Partial<Task>) => {
    onUpdateState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, ...changes } : t)),
    }));
  };

  // Helper status color badges
  const getStatusColor = (status: Task['status'], isMilestone?: boolean) => {
    if (isMilestone) return 'bg-amber-500 border-amber-600 text-amber-950 shadow-md';
    switch (status) {
      case 'Completed':
        return 'bg-emerald-500 border-emerald-600 text-white';
      case 'In Progress':
        return 'bg-blue-600 border-blue-700 text-white';
      case 'Review':
        return 'bg-purple-600 border-purple-700 text-white';
      case 'Approved':
        return 'bg-teal-600 border-teal-700 text-white';
      case 'To Do':
        return 'bg-slate-400 border-slate-500 text-white';
      default:
        return 'bg-slate-300 border-slate-400 text-slate-800';
    }
  };

  // Save Task Edits from Modal
  const handleSaveTaskModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;
    
    setIsSaving(true);
    try {
      await api.projects.updateTask(editingTask.id, {
        title: editingTask.title,
        description: editingTask.description,
        status: editingTask.status,
        priority: editingTask.priority,
        assignedToEmployeeId: editingTask.assigneeId || undefined,
        assignedToEmployeeIds: editingTask.assigneeIds?.length ? editingTask.assigneeIds : editingTask.assigneeId ? [editingTask.assigneeId] : undefined,
        dueDate: editingTask.dueDate || undefined,
      });
      updateTaskInMemory(editingTask.id, editingTask);
      triggerToast(`Saved task details for '${editingTask.title}'`);
      setEditingTask(null);
    } catch (err) {
      console.error('Failed to update task', err);
      alert('Failed to save task edits.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-[#18181d] px-4 py-2.5 text-xs font-bold text-white shadow-2xl border border-[#282830] animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Gantt Control Toolbar */}
      <div className="rounded-xl border border-[#282830] bg-[#121214] p-4 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Zoom Controls */}
            <div className="flex items-center gap-1 bg-[#18181d] p-1 rounded-lg border border-[#282830]">
              <span className="text-[10px] font-extrabold uppercase px-2 text-[#9e9ea7]">Zoom:</span>
              {(['days', 'weeks', 'months'] as ZoomLevel[]).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setZoomLevel(lvl)}
                  className={`px-3 py-1 rounded-md text-xs font-bold capitalize transition-all cursor-pointer ${
                    zoomLevel === lvl
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-[#9e9ea7] hover:text-white'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks, assignees..."
                className="w-52 rounded-lg border border-[#282830] bg-[#18181d] px-3 py-1.5 text-xs font-medium text-white placeholder:text-[#686873] outline-none focus:border-blue-500"
              />
            </div>

            {/* Filter Status */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-[#282830] bg-[#18181d] px-3 py-1.5 text-xs font-semibold text-[#9e9ea7] hover:text-white outline-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Review">Review</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {/* Toggle Switches */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-[#9e9ea7] hover:text-white bg-[#18181d] px-3 py-1.5 rounded-lg border border-[#282830] cursor-pointer transition-all">
              <input
                type="checkbox"
                checked={showDependencies}
                onChange={(e) => setShowDependencies(e.target.checked)}
                className="rounded border-[#282830] bg-[#121214] text-blue-600 accent-blue-600 cursor-pointer"
              />
              <LinkIcon className="h-3.5 w-3.5 text-blue-400" /> Dependencies
            </label>

            <label className="flex items-center gap-1.5 text-xs font-bold text-[#9e9ea7] hover:text-white bg-[#18181d] px-3 py-1.5 rounded-lg border border-[#282830] cursor-pointer transition-all">
              <input
                type="checkbox"
                checked={onlyMilestones}
                onChange={(e) => setOnlyMilestones(e.target.checked)}
                className="rounded border-[#282830] bg-[#121214] text-amber-500 accent-amber-500 cursor-pointer"
              />
              <Milestone className="h-3.5 w-3.5 text-amber-400" /> Milestones Only
            </label>

            <label className="flex items-center gap-1.5 text-xs font-bold text-[#9e9ea7] hover:text-white bg-[#18181d] px-3 py-1.5 rounded-lg border border-[#282830] cursor-pointer transition-all">
              <input
                type="checkbox"
                checked={showCriticalPath}
                onChange={(e) => setShowCriticalPath(e.target.checked)}
                className="rounded border-[#282830] bg-[#121214] text-rose-500 accent-rose-500 cursor-pointer"
              />
              <span className="text-rose-400">⚡ Critical Path</span>
            </label>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-[#282830] text-[11px] text-[#9e9ea7] font-medium">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-bold text-white">Interactive Schedule:</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-xs bg-blue-600 inline-block"></span> Drag body to shift dates</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-xs bg-[#24242c] border border-[#383845] inline-block"></span> Drag edges to resize duration</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-xs bg-amber-500 inline-block"></span> Milestone Deliverable</span>
          </div>
          <div className="text-blue-400 font-bold">
            Showing {filteredTasks.length} tasks across {filteredProjects.length} projects
          </div>
        </div>
      </div>

      {/* Main Gantt Canvas Container */}
      <div
        ref={containerRef}
        className="rounded-xl border border-[#282830] bg-[#121214] shadow-sm overflow-hidden flex flex-col min-h-[500px]"
      >
        <div className="flex overflow-x-auto relative custom-scrollbar flex-1">
          {/* LEFT FIXED PANEL: Work Breakdown Structure (WBS) Table */}
          <div className="w-80 shrink-0 border-r border-[#282830] bg-[#121214] z-20 sticky left-0 shadow-md flex flex-col">
            {/* Header */}
            <div className="h-16 border-b border-[#282830] px-4 flex items-center justify-between bg-[#18181d] font-bold text-xs text-white">
              <span>Work Breakdown Structure (WBS)</span>
              <span className="text-[10px] text-[#9e9ea7] font-normal">Tasks & Schedule</span>
            </div>

            {/* Task Row Items */}
            <div className="divide-y divide-[#282830]">
              {filteredProjects.map((proj) => {
                const isCollapsed = collapsedProjects[proj.id];
                const projTasks = filteredTasks.filter((t) => t.projectId === proj.id);

                return (
                  <React.Fragment key={proj.id}>
                    {/* Project Header Row */}
                    <div className="h-12 px-3 bg-[#18181d] flex items-center justify-between font-bold text-xs text-white border-t border-b border-[#282830] hover:bg-[#202026] transition-colors">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          onClick={() => toggleProjectCollapse(proj.id)}
                          className="p-1 text-[#9e9ea7] hover:text-white rounded cursor-pointer"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>
                        <span className="truncate font-bold text-white" title={proj.name}>
                          {proj.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-950/50 px-2 py-0.5 rounded border border-blue-800/40">
                          {proj.progress}%
                        </span>
                      </div>
                    </div>

                    {/* Task Rows under Project */}
                    {!isCollapsed &&
                      projTasks.map((task) => {
                        const isHovered = hoveredTaskId === task.id;
                        const taskProg = task.progress ?? (task.status === 'Completed' ? 100 : task.status === 'In Progress' ? 50 : 0);

                        return (
                          <div
                            key={task.id}
                            onMouseEnter={() => setHoveredTaskId(task.id)}
                            onMouseLeave={() => setHoveredTaskId(null)}
                            className={`h-12 px-3 pl-8 flex items-center justify-between text-xs transition-colors border-b border-[#282830] ${
                              isHovered ? 'bg-[#18181d]' : 'bg-[#121214]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              {task.isMilestone ? (
                                <Milestone className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              ) : (
                                <span className={`h-2 w-2 rounded-full shrink-0 ${
                                  task.status === 'Completed' ? 'bg-emerald-400' : 'bg-blue-500'
                                }`} />
                              )}
                              <span className="font-semibold text-slate-200 truncate" title={task.title}>
                                {task.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] font-bold text-[#9e9ea7] tabular-nums">
                                {taskProg}%
                              </span>

                              <button
                                onClick={() => setEditingTask({ ...task })}
                                className="p-1.5 rounded-lg text-[#9e9ea7] hover:text-white hover:bg-[#282830] transition-all cursor-pointer"
                                title="Edit Schedule & Dependencies"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* RIGHT TIMELINE GRID CANVAS */}
          <div className="flex-1 overflow-x-auto relative bg-[#0f0f12]" style={{ minWidth: timelineWidth }}>
            {/* SVG Connector Overlay for Task Dependencies */}
            {showDependencies && (
              <svg
                className="absolute inset-0 pointer-events-none z-10"
                style={{ width: timelineWidth, height: '100%' }}
              >
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 3, 0 6" fill="#3b82f6" />
                  </marker>
                  <marker
                    id="arrowhead-critical"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 6 3, 0 6" fill="#f43f5e" />
                  </marker>
                </defs>

                {filteredTasks.map((task) => {
                  if (!task.dependencies || task.dependencies.length === 0) return null;
                  const targetPos = taskPositions[task.id];
                  if (!targetPos) return null;

                  return task.dependencies.map((depId) => {
                    const sourcePos = taskPositions[depId];
                    if (!sourcePos) return null;

                    const isCritical = showCriticalPath && (task.priority === 'Urgent' || task.priority === 'High');
                    const strokeColor = isCritical ? '#f43f5e' : '#3b82f6';
                    const marker = isCritical ? 'url(#arrowhead-critical)' : 'url(#arrowhead)';

                    // Curved bezier connection path
                    const startX = sourcePos.x + sourcePos.width;
                    const startY = sourcePos.yCenter;
                    const endX = targetPos.x;
                    const endY = targetPos.yCenter;

                    const controlX1 = startX + 20;
                    const controlX2 = endX - 20;

                    const pathData = `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;

                    return (
                      <path
                        key={`dep_${depId}_${task.id}`}
                        d={pathData}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={isCritical ? "2.5" : "1.8"}
                        strokeDasharray={isCritical ? "none" : "3,3"}
                        markerEnd={marker}
                        className="transition-all duration-300"
                      />
                    );
                  });
                })}
              </svg>
            )}

            {/* Timeline Header (Months / Days / Weeks Columns) */}
            <div className="h-16 border-b border-[#282830] bg-[#18181d] flex flex-col sticky top-0 z-20">
              <div className="h-8 border-b border-[#282830] flex items-center text-[10px] font-bold text-[#9e9ea7] uppercase tracking-wider px-2">
                {datesArray.filter((_, idx) => idx % (zoomLevel === 'days' ? 7 : 14) === 0).map((date, idx) => (
                  <div
                    key={idx}
                    className="shrink-0 border-r border-[#282830] px-3 font-bold text-white"
                    style={{ width: colWidth * (zoomLevel === 'days' ? 7 : 14) }}
                  >
                    {date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </div>
                ))}
              </div>

              <div className="h-8 flex items-center text-[10px] font-bold text-[#9e9ea7]">
                {datesArray.map((date, idx) => {
                  const isToday = formatDate(date) === formatDate(new Date());
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;

                  return (
                    <div
                      key={idx}
                      className={`shrink-0 border-r border-[#282830] h-full flex items-center justify-center ${
                        isToday
                          ? 'bg-blue-600 text-white font-bold'
                          : isWeekend
                          ? 'bg-[#101014] text-[#686873]'
                          : 'bg-[#141418] text-[#9e9ea7]'
                      }`}
                      style={{ width: colWidth }}
                    >
                      {zoomLevel === 'days' ? date.getDate() : idx % 7 === 0 ? `W${Math.ceil(idx / 7) + 1}` : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Today Red Marker Vertical Line */}
            {todayX >= 0 && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-30 pointer-events-none"
                style={{ left: todayX }}
              >
                <span className="absolute top-1 -left-6 bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase">
                  Today
                </span>
              </div>
            )}

            {/* Timeline Rows Container */}
            <div className="divide-y divide-[#282830]">
              {filteredProjects.map((proj) => {
                const isCollapsed = collapsedProjects[proj.id];
                const projTasks = filteredTasks.filter((t) => t.projectId === proj.id);

                const projX = dateToX(proj.startDate);
                const projEndX = dateToX(proj.endDate);
                const projWidth = Math.max(colWidth * 2, projEndX - projX);

                return (
                  <React.Fragment key={proj.id}>
                    {/* Project Level Bar Row */}
                    <div className="h-12 relative bg-[#141418]/60 border-t border-b border-[#282830] flex items-center">
                      <div
                        className="absolute h-6 rounded-lg bg-gradient-to-r from-blue-950 to-indigo-950 border border-blue-700/50 shadow-sm flex items-center px-3 text-white text-[10px] font-bold overflow-hidden"
                        style={{ left: projX, width: projWidth }}
                      >
                        <div
                          className="absolute top-0 bottom-0 left-0 bg-blue-500/30 rounded-lg"
                          style={{ width: `${proj.progress}%` }}
                        />
                        <span className="truncate z-10 flex items-center gap-1.5 text-white">
                          <Layers className="h-3 w-3 text-blue-400" />
                          {proj.name} ({proj.startDate} → {proj.endDate})
                        </span>
                      </div>
                    </div>

                    {/* Task Level Bars */}
                    {!isCollapsed &&
                      projTasks.map((task) => {
                        const isHovered = hoveredTaskId === task.id;
                        const taskX = dateToX(task.startDate);
                        const taskEndX = dateToX(task.dueDate);
                        const taskWidth = Math.max(colWidth, taskEndX - taskX + colWidth);
                        const taskProg = task.progress ?? (task.status === 'Completed' ? 100 : task.status === 'In Progress' ? 50 : 0);

                        return (
                          <div
                            key={task.id}
                              onMouseEnter={() => setHoveredTaskId(task.id)}
                              onMouseLeave={() => setHoveredTaskId(null)}
                              className={`h-12 relative border-b border-[#282830] transition-colors flex items-center ${
                                isHovered ? 'bg-[#18181d]' : 'bg-transparent'
                              }`}
                            >
                              {/* Task Bar Element */}
                              <div
                                onMouseDown={(e) => handleMouseDown(e, task, 'move')}
                                className={`absolute h-7 rounded-lg border shadow-sm flex items-center px-2 cursor-grab active:cursor-grabbing transition-all group ${getStatusColor(
                                  task.status,
                                  task.isMilestone
                                )} ${isHovered ? 'ring-2 ring-blue-400 shadow-md scale-102' : ''}`}
                                style={{ left: taskX, width: taskWidth }}
                              >
                                {/* Progress Fill Background Overlay */}
                                <div
                                  className="absolute top-0 bottom-0 left-0 bg-black/25 rounded-lg pointer-events-none"
                                  style={{ width: `${taskProg}%` }}
                                />

                                {/* Left Resize Drag Handle */}
                                <div
                                  onMouseDown={(e) => handleMouseDown(e, task, 'resize-start')}
                                  className="absolute left-0 top-0 bottom-0 w-2.5 cursor-ew-resize bg-black/30 hover:bg-black/50 rounded-l-lg z-20"
                                  title="Drag to adjust Start Date"
                                />

                                {/* Content Inside Bar */}
                                <div className="flex items-center justify-between w-full min-w-0 z-10 px-1">
                                  <span className="text-[10px] font-bold truncate flex items-center gap-1">
                                    {task.isMilestone && <Milestone className="h-3 w-3 text-amber-950 shrink-0" />}
                                    {task.title}
                                  </span>
                                  <span className="text-[9px] font-mono font-bold opacity-90 shrink-0 ml-1">
                                    {taskProg}%
                                  </span>
                                </div>

                                {/* Right Resize Drag Handle */}
                                <div
                                  onMouseDown={(e) => handleMouseDown(e, task, 'resize-end')}
                                  className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize bg-black/30 hover:bg-black/50 rounded-r-lg z-20"
                                  title="Drag to adjust Due Date"
                                />
                              </div>
                            </div>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Task Edit / Schedule Inspector Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-[#282830] bg-[#121214] p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between border-b border-[#282830] pb-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">
                  Update Schedule & Dependencies
                </h3>
              </div>
              <button
                onClick={() => setEditingTask(null)}
                className="text-[#9e9ea7] hover:text-white p-1 rounded-lg hover:bg-[#18181d] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTaskModal} className="space-y-4 text-xs font-semibold text-[#9e9ea7]">
              <div>
                <label className="block text-white font-bold mb-1">Task Title</label>
                <input
                  type="text"
                  value={editingTask.title}
                  onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2.5 font-medium text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white font-bold mb-1">Start Date</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={editingTask.startDate}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      setEditingTask({
                        ...editingTask,
                        startDate: newStart,
                        dueDate: editingTask.dueDate && editingTask.dueDate < newStart ? newStart : editingTask.dueDate,
                      });
                    }}
                    className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2.5 font-medium text-white outline-none focus:border-blue-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-white font-bold mb-1">Due Date</label>
                  <input
                    type="date"
                    min={editingTask.startDate || new Date().toISOString().split('T')[0]}
                    value={editingTask.dueDate}
                    onChange={(e) => setEditingTask({ ...editingTask, dueDate: e.target.value })}
                    className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2.5 font-medium text-white outline-none focus:border-blue-500 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-white font-bold">Completion Progress ({editingTask.progress || 0}%)</label>
                  <span className="text-[10px] font-bold text-blue-400">{editingTask.status}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={editingTask.progress || 0}
                  onChange={(e) => {
                    const p = parseInt(e.target.value);
                    setEditingTask({
                      ...editingTask,
                      progress: p,
                      status: p === 100 ? 'Completed' : p > 0 ? 'In Progress' : 'To Do',
                    });
                  }}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-950/20 border border-amber-900/40">
                <div className="flex items-center gap-2 text-amber-300">
                  <Milestone className="h-4 w-4 text-amber-400" />
                  <div>
                    <div className="font-bold text-white">Project Milestone Flag</div>
                    <div className="text-[10px] text-[#9e9ea7] font-medium">Mark this deliverable as a major release milestone</div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={!!editingTask.isMilestone}
                  onChange={(e) => setEditingTask({ ...editingTask, isMilestone: e.target.checked })}
                  className="h-4 w-4 rounded border-[#282830] bg-[#121214] text-amber-500 accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-white font-bold mb-1">Predecessor Dependencies (Must finish first)</label>
                <div className="max-h-32 overflow-y-auto border border-[#282830] rounded-xl p-2 space-y-1 bg-[#18181d] custom-scrollbar">
                  {state.tasks
                    .filter((t) => t.id !== editingTask.id && t.projectId === editingTask.projectId)
                    .map((t) => {
                      const isDep = (editingTask.dependencies || []).includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-[#202026] text-xs cursor-pointer transition-colors"
                        >
                          <span className="truncate font-medium text-slate-200">{t.title}</span>
                          <input
                            type="checkbox"
                            checked={isDep}
                            onChange={(e) => {
                              const currDeps = editingTask.dependencies || [];
                              const newDeps = e.target.checked
                                ? [...currDeps, t.id]
                                : currDeps.filter((id) => id !== t.id);
                              setEditingTask({ ...editingTask, dependencies: newDeps });
                            }}
                            className="rounded border-[#282830] bg-[#121214] text-blue-600 accent-blue-600 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-[#282830]">
                <button
                  type="button"
                  onClick={() => setEditingTask(null)}
                  className="rounded-lg border border-[#282830] px-4 py-2 font-bold text-[#9e9ea7] hover:text-white hover:bg-[#18181d] cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 hover:bg-blue-700 px-5 py-2 font-bold text-white shadow-md shadow-blue-600/25 active:scale-98 cursor-pointer transition-all"
                >
                  Save Schedule Updates
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
