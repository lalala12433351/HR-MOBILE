'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Coffee,
  Sun,
  Edit2,
  Trash2,
  Check,
  X,
  Printer,
  Sparkles,
  Search,
  MoreVertical,
  Repeat,
  MapPin,
  User,
  ShieldAlert,
  SlidersHorizontal,
  BookOpen,
  GraduationCap,
  Calculator,
  BarChart3,
  Briefcase,
  Layers,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AppState } from '../../../services/store';
import { TimetableSlot } from '../../../types';
import { api } from '../../../services/apiClient';

interface StudentTimetableModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onTriggerToast?: (message: string, type?: 'success' | 'info' | 'warning') => void;
}

const WORKING_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
type DayOfWeek = typeof WORKING_DAYS[number];

// Preset Solid Color Themes matching rich Google Calendar aesthetics with high-contrast white text
const COLOR_VARIANTS: Record<
  string,
  {
    bg: string;
    hoverBg: string;
    border: string;
    badgeBg: string;
  }
> = {
  blue: {
    bg: 'bg-blue-600',
    hoverBg: 'hover:bg-blue-700',
    border: 'border-blue-700/60',
    badgeBg: 'bg-white/25 text-white',
  },
  indigo: {
    bg: 'bg-indigo-600',
    hoverBg: 'hover:bg-indigo-700',
    border: 'border-indigo-700/60',
    badgeBg: 'bg-white/25 text-white',
  },
  purple: {
    bg: 'bg-purple-600',
    hoverBg: 'hover:bg-purple-700',
    border: 'border-purple-700/60',
    badgeBg: 'bg-white/25 text-white',
  },
  emerald: {
    bg: 'bg-emerald-600',
    hoverBg: 'hover:bg-emerald-700',
    border: 'border-emerald-700/60',
    badgeBg: 'bg-white/25 text-white',
  },
  amber: {
    bg: 'bg-amber-600',
    hoverBg: 'hover:bg-amber-700',
    border: 'border-amber-700/60',
    badgeBg: 'bg-white/25 text-white',
  },
  cyan: {
    bg: 'bg-cyan-600',
    hoverBg: 'hover:bg-cyan-700',
    border: 'border-cyan-700/60',
    badgeBg: 'bg-white/25 text-white',
  },
  rose: {
    bg: 'bg-rose-600',
    hoverBg: 'hover:bg-rose-700',
    border: 'border-rose-700/60',
    badgeBg: 'bg-white/25 text-white',
  },
  slate: {
    bg: 'bg-slate-700',
    hoverBg: 'hover:bg-slate-800',
    border: 'border-slate-800/60',
    badgeBg: 'bg-white/25 text-white',
  },
};

// Convert "HH:MM" into total minutes from midnight
function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 9 * 60; // 09:00
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

// Format minutes from midnight to "09:00 AM"
function formatMinutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${String(displayH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Format 24h string "08:30" to "08:30 AM"
function formatTime12h(timeStr: string): string {
  if (!timeStr) return '';
  return formatMinutesToTime(parseTimeToMinutes(timeStr));
}

// Helper to compute collision-free layout lanes for slots on a given day with transitive cluster merging
function computeDaySlotLayouts(slots: TimetableSlot[]) {
  if (!slots || slots.length === 0) return [];

  const parsed = slots
    .map((slot) => {
      const startM = parseTimeToMinutes(slot.startTime);
      const endM = parseTimeToMinutes(slot.endTime);
      return {
        slot,
        startM,
        endM: endM > startM ? endM : startM + 60,
      };
    })
    .sort((a, b) => a.startM - b.startM || a.endM - b.endM);

  // Group into connected components (clusters of overlapping intervals)
  const clusters: typeof parsed[] = [];

  parsed.forEach((item) => {
    const matchingIndices: number[] = [];
    clusters.forEach((cluster, idx) => {
      if (cluster.some((c) => item.startM < c.endM && item.endM > c.startM)) {
        matchingIndices.push(idx);
      }
    });

    if (matchingIndices.length === 0) {
      clusters.push([item]);
    } else if (matchingIndices.length === 1) {
      clusters[matchingIndices[0]].push(item);
    } else {
      // Merge multiple connected clusters
      const merged: typeof parsed = [item];
      for (let i = matchingIndices.length - 1; i >= 0; i--) {
        const clusterIndex = matchingIndices[i];
        merged.push(...clusters[clusterIndex]);
        clusters.splice(clusterIndex, 1);
      }
      clusters.push(merged);
    }
  });

  const result: { slot: TimetableSlot; lane: number; totalLanes: number }[] = [];

  clusters.forEach((cluster) => {
    cluster.sort((a, b) => a.startM - b.startM || a.endM - b.endM);
    const laneEndTimes: number[] = [];
    const assignments: { slot: TimetableSlot; lane: number }[] = [];

    cluster.forEach((item) => {
      let assignedLane = -1;
      for (let i = 0; i < laneEndTimes.length; i++) {
        if (laneEndTimes[i] <= item.startM) {
          assignedLane = i;
          laneEndTimes[i] = item.endM;
          break;
        }
      }
      if (assignedLane === -1) {
        assignedLane = laneEndTimes.length;
        laneEndTimes.push(item.endM);
      }
      assignments.push({ slot: item.slot, lane: assignedLane });
    });

    const totalLanes = Math.max(1, laneEndTimes.length);
    assignments.forEach((a) => {
      result.push({
        slot: a.slot,
        lane: a.lane,
        totalLanes,
      });
    });
  });

  return result;
}

// Standard break presets for quick addition
const COMMON_BREAK_PRESETS = [
  { title: 'Morning Recess', startTime: '10:35', endTime: '11:00', color: 'amber' },
  { title: 'Lunch Break', startTime: '12:00', endTime: '12:45', color: 'amber' },
  { title: 'Afternoon Refreshment', startTime: '14:30', endTime: '14:45', color: 'amber' },
  { title: 'Morning Assembly', startTime: '08:00', endTime: '08:30', color: 'blue' },
];

// Default timetable slots (strictly empty, no preloaded mock data)
const DEFAULT_INITIAL_SLOTS: TimetableSlot[] = [];

export const StudentTimetableModule: React.FC<StudentTimetableModuleProps> = ({
  state,
  onUpdateState,
  onTriggerToast,
}) => {
  const isStudent = state.currentPersona?.role === 'student';
  const isFacultyRole = state.currentPersona?.role === 'faculty';

  // Configured Academic Batches (Strictly zero preloaded mock data)
  const configuredBatches = useMemo(() => {
    const list = state.customOptions?.academicBatches;
    if (Array.isArray(list)) {
      return list;
    }
    return [];
  }, [state.customOptions?.academicBatches]);


  // Timetable Slots from Store or default (empty array, strictly zero preloaded fake data)
  const timetableSlots = useMemo<TimetableSlot[]>(() => {
    const stored = state.customOptions?.timetableSlots;
    if (Array.isArray(stored)) {
      return stored;
    }
    return DEFAULT_INITIAL_SLOTS;
  }, [state.customOptions?.timetableSlots]);

  // List of all faculty teachers available across staff and timetable slots
  const availableFaculty = useMemo(() => {
    const list: { id: string; name: string; designation: string }[] = [];
    const seen = new Set<string>();

    (state.employees || []).forEach((emp) => {
      if (emp.name && !seen.has(emp.name)) {
        seen.add(emp.name);
        list.push({
          id: emp.id,
          name: emp.name,
          designation: emp.designation || 'Faculty Teacher',
        });
      }
    });

    timetableSlots.forEach((slot) => {
      if (slot.facultyName && !seen.has(slot.facultyName)) {
        seen.add(slot.facultyName);
        list.push({
          id: `fac_${slot.facultyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          name: slot.facultyName,
          designation: 'Faculty Teacher',
        });
      }
    });

    if (list.length === 0) {
      list.push({ id: 'fac_general', name: 'Faculty Member', designation: 'Faculty Teacher' });
    }

    return list;
  }, [state.employees, timetableSlots]);

  // Schedule Selector: `batch:${batchId}` or `teacher:${teacherName}`
  const [selectedScheduleKey, setSelectedScheduleKey] = useState<string>(() => {
    if (isFacultyRole && state.currentPersona?.name) {
      return `teacher:${state.currentPersona.name}`;
    }
    return configuredBatches[0]?.id ? `batch:${configuredBatches[0].id}` : '';
  });

  useEffect(() => {
    if (!selectedScheduleKey && configuredBatches.length > 0) {
      setSelectedScheduleKey(`batch:${configuredBatches[0].id}`);
    }
  }, [configuredBatches, selectedScheduleKey]);

  const isTeacherSchedule = selectedScheduleKey.startsWith('teacher:');
  const selectedTeacherName = isTeacherSchedule ? selectedScheduleKey.replace('teacher:', '') : '';
  const selectedBatchId = !isTeacherSchedule
    ? selectedScheduleKey.replace('batch:', '')
    : (configuredBatches[0]?.id || '');

  // If student is logged in, auto-select their enrolled batch
  const currentStudent = useMemo(() => {
    if (!isStudent) return null;
    return (
      state.students?.find(
        (s) => s.id === state.currentPersona?.id || s.email === state.currentPersona?.email
      ) || null
    );
  }, [isStudent, state.students, state.currentPersona]);

  useEffect(() => {
    if (currentStudent) {
      if (currentStudent.batchId) {
        setSelectedScheduleKey(`batch:${currentStudent.batchId}`);
      } else if (currentStudent.grade) {
        const match = configuredBatches.find(
          (b) =>
            b.grade.toLowerCase() === currentStudent.grade?.toLowerCase() &&
            (!currentStudent.section || b.section.toLowerCase() === currentStudent.section?.toLowerCase())
        );
        if (match) setSelectedScheduleKey(`batch:${match.id}`);
      }
    }
  }, [currentStudent, configuredBatches]);

  // View Mode: 'matrix' (Period Grid Matrix) | 'timeline' (Continuous Hourly Timeline) | 'day' (Single Day timeline) | 'list' (Agenda)
  const [viewMode, setViewMode] = useState<'matrix' | 'timeline' | 'day' | 'list'>('matrix');
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>('Monday');

  // Working day columns in current schedule
  const [includeSaturday, setIncludeSaturday] = useState(false);
  const activeDays: DayOfWeek[] = useMemo(() => {
    return includeSaturday ? [...WORKING_DAYS] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  }, [includeSaturday]);

  // Stepper handlers for smooth mobile day switching
  const handlePrevDay = () => {
    const currentIndex = activeDays.indexOf(selectedDay);
    if (currentIndex > 0) {
      setSelectedDay(activeDays[currentIndex - 1]);
    } else {
      setSelectedDay(activeDays[activeDays.length - 1]);
    }
  };

  const handleNextDay = () => {
    const currentIndex = activeDays.indexOf(selectedDay);
    if (currentIndex < activeDays.length - 1) {
      setSelectedDay(activeDays[currentIndex + 1]);
    } else {
      setSelectedDay(activeDays[0]);
    }
  };

  // Displayed Slots for Selected Batch or Selected Teacher
  const displayedSlots = useMemo(() => {
    if (isTeacherSchedule) {
      return timetableSlots.filter(
        (slot) => slot.type === 'class' && slot.facultyName === selectedTeacherName
      );
    }
    return timetableSlots.filter((slot) => slot.batchId === selectedBatchId);
  }, [timetableSlots, isTeacherSchedule, selectedTeacherName, selectedBatchId]);

  // Unique Synced Weekly Breaks for the selected batch
  const weeklyRecurringBreaks = useMemo(() => {
    const breaksMap = new Map<string, TimetableSlot>();
    displayedSlots
      .filter((s) => s.type === 'break' && (s.syncGroupId || s.isRecurringDaily))
      .forEach((s) => {
        const key = s.syncGroupId || `${s.title}_${s.startTime}_${s.endTime}`;
        if (!breaksMap.has(key)) {
          breaksMap.set(key, s);
        }
      });
    return Array.from(breaksMap.values());
  }, [displayedSlots]);

  // ─── DYNAMIC PERIOD & BREAK INTERVALS (For Structured Period Grid) ───
  const periodIntervals = useMemo(() => {
    const slots = displayedSlots;

    // Collect all breaks
    const breaksList: TimetableSlot[] = [];
    const seenBreaks = new Set<string>();
    slots
      .filter((s) => s.type === 'break')
      .forEach((b) => {
        const key = `${b.startTime}_${b.endTime}`;
        if (!seenBreaks.has(key)) {
          seenBreaks.add(key);
          breaksList.push(b);
        }
      });

    // Collect all class time intervals
    const classTimes: { startTime: string; endTime: string; startM: number; endM: number }[] = [];
    const seenClassTimes = new Set<string>();
    slots
      .filter((s) => s.type === 'class')
      .forEach((c) => {
        const key = `${c.startTime}_${c.endTime}`;
        if (!seenClassTimes.has(key)) {
          seenClassTimes.add(key);
          const startM = parseTimeToMinutes(c.startTime);
          const endM = parseTimeToMinutes(c.endTime);
          classTimes.push({
            startTime: c.startTime,
            endTime: endM > startM ? c.endTime : formatMinutesToTime(startM + 60),
            startM,
            endM: endM > startM ? endM : startM + 60,
          });
        }
      });

    const combined: {
      id: string;
      type: 'class' | 'break';
      title?: string;
      startTime: string;
      endTime: string;
      startM: number;
      endM: number;
      durationM: number;
      syncGroupId?: string;
      color?: string;
    }[] = [];

    breaksList.forEach((b) => {
      const startM = parseTimeToMinutes(b.startTime);
      const endM = parseTimeToMinutes(b.endTime);
      combined.push({
        id: b.syncGroupId || `brk_${b.startTime}_${b.endTime}`,
        type: 'break',
        title: b.title || 'Break',
        startTime: b.startTime,
        endTime: b.endTime,
        startM,
        endM,
        durationM: Math.max(15, endM - startM),
        syncGroupId: b.syncGroupId,
        color: b.color || 'amber',
      });
    });

    classTimes.forEach((c) => {
      combined.push({
        id: `cls_${c.startTime}_${c.endTime}`,
        type: 'class',
        startTime: c.startTime,
        endTime: c.endTime,
        startM: c.startM,
        endM: c.endM,
        durationM: Math.max(30, c.endM - c.startM),
      });
    });

    combined.sort((a, b) => a.startM - b.startM || a.endM - b.endM);

    if (combined.length === 0) {
      return [
        { id: 'p1', type: 'class' as const, startTime: '08:30', endTime: '09:30', startM: 510, endM: 570, durationM: 60, periodLabel: 'Period 1' },
        { id: 'p2', type: 'class' as const, startTime: '09:30', endTime: '10:30', startM: 570, endM: 630, durationM: 60, periodLabel: 'Period 2' },
        { id: 'p3', type: 'class' as const, startTime: '10:30', endTime: '11:30', startM: 630, endM: 690, durationM: 60, periodLabel: 'Period 3' },
        { id: 'p4', type: 'class' as const, startTime: '11:30', endTime: '12:30', startM: 690, endM: 750, durationM: 60, periodLabel: 'Period 4' },
        { id: 'p5', type: 'class' as const, startTime: '12:30', endTime: '13:30', startM: 750, endM: 810, durationM: 60, periodLabel: 'Period 5' },
        { id: 'p6', type: 'class' as const, startTime: '13:30', endTime: '14:30', startM: 810, endM: 870, durationM: 60, periodLabel: 'Period 6' },
      ];
    }

    let classCount = 0;
    return combined.map((item) => {
      if (item.type === 'class') {
        classCount += 1;
        return {
          ...item,
          periodLabel: `Period ${classCount}`,
        };
      }
      return {
        ...item,
        periodLabel: item.title || 'Break',
      };
    });
  }, [displayedSlots]);

  // Slot Edit / Create Modal State
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [showManageBreaksModal, setShowManageBreaksModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [modalSlotType, setModalSlotType] = useState<'class' | 'break'>('class');

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formSubjectCode, setFormSubjectCode] = useState('');
  const [formFacultyName, setFormFacultyName] = useState('');
  const [formRoom, setFormRoom] = useState('Room 301');
  const [formDay, setFormDay] = useState<DayOfWeek>('Monday');
  const [formStartTime, setFormStartTime] = useState('08:30');
  const [formEndTime, setFormEndTime] = useState('09:30');
  const [formColor, setFormColor] = useState('blue');
  const [formApplyAcrossWeek, setFormApplyAcrossWeek] = useState(true);

  // Time grid parameters: 08:00 AM to 05:00 PM (9 hours)
  const START_HOUR = 8;
  const END_HOUR = 17;
  const START_MINS = START_HOUR * 60; // 480
  const TOTAL_HOURS = END_HOUR - START_HOUR; // 9 hours
  const HOUR_WIDTH_PX = 138; // Proportional horizontal pixel width per hour
  const ROW_HEIGHT_PX = 88; // Height in px per day row

  const selectedBatchObj = useMemo(() => {
    return (
      configuredBatches.find((b) => b.id === selectedBatchId) || {
        id: selectedBatchId,
        grade: '',
        section: '',
        startTime: '08:30',
        endTime: '15:30',
      }
    );
  }, [configuredBatches, selectedBatchId]);

  // Open Create Slot Modal with accurate 1-hour/30-min auto end-time calculation
  const handleOpenCreateModal = (type: 'class' | 'break', defaultDay?: DayOfWeek, defaultStart?: string) => {
    if (isStudent) return; // Students have read-only access
    setEditingSlot(null);
    setModalSlotType(type);
    setFormDay(defaultDay || selectedDay);

    const startStr = defaultStart || '09:00';
    setFormStartTime(startStr);

    const startMinutes = parseTimeToMinutes(startStr);
    const duration = type === 'break' ? 30 : 60; // Adds 1 full hour for class, 30 min for break
    const endMinutes = startMinutes + duration;
    const endH = Math.floor(endMinutes / 60) % 24;
    const endM = endMinutes % 60;
    const computedEnd = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    setFormEndTime(computedEnd);

    if (type === 'break') {
      setFormTitle('Lunch Break');
      setFormSubjectCode('');
      setFormFacultyName('');
      setFormRoom('');
      setFormColor('amber');
      setFormApplyAcrossWeek(true); // Default to consistent across week
    } else {
      setFormTitle('');
      setFormSubjectCode('');
      setFormFacultyName(isTeacherSchedule ? selectedTeacherName : state.employees[0]?.name || '');
      setFormRoom('Room 301');
      setFormColor('blue');
      setFormApplyAcrossWeek(false);
    }

    setShowSlotModal(true);
  };

  // Open Edit Slot Modal
  const handleOpenEditModal = (slot: TimetableSlot) => {
    if (isStudent) return; // Students have read-only access
    setEditingSlot(slot);
    setModalSlotType(slot.type === 'break' ? 'break' : 'class');
    setFormTitle(slot.title);
    setFormSubjectCode(slot.subjectCode || '');
    setFormFacultyName(slot.facultyName || '');
    setFormRoom(slot.room || '');
    setFormDay(slot.dayOfWeek as DayOfWeek);
    setFormStartTime(slot.startTime);
    setFormEndTime(slot.endTime);
    setFormColor(slot.color || (slot.type === 'break' ? 'amber' : 'blue'));
    setFormApplyAcrossWeek(Boolean(slot.isRecurringDaily || slot.syncGroupId || slot.type === 'break'));
    setShowSlotModal(true);
  };

  // Auto-adjust end time whenever user modifies start time in form
  const handleStartTimeChange = (newStart: string) => {
    setFormStartTime(newStart);
    const startM = parseTimeToMinutes(newStart);
    const endM = parseTimeToMinutes(formEndTime);
    if (endM <= startM) {
      const duration = modalSlotType === 'break' ? 30 : 60;
      const newEndM = startM + duration;
      const endH = Math.floor(newEndM / 60) % 24;
      const endMin = newEndM % 60;
      setFormEndTime(`${String(endH).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`);
    }
  };

  // Quick Add Preset Break across entire week
  const handleQuickAddPresetBreak = async (preset: { title: string; startTime: string; endTime: string; color: string }) => {
    if (isStudent) return;
    const currentSlots = Array.isArray(state.customOptions?.timetableSlots)
      ? state.customOptions.timetableSlots
      : DEFAULT_INITIAL_SLOTS;

    const syncGroupId = `break_${preset.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`;
    const newSlots: TimetableSlot[] = activeDays.map((d) => ({
      id: `slot_${Date.now()}_${d}_${Math.floor(Math.random() * 1000)}`,
      batchId: selectedBatchId,
      dayOfWeek: d,
      type: 'break',
      title: preset.title,
      startTime: preset.startTime,
      endTime: preset.endTime,
      color: preset.color,
      isRecurringDaily: true,
      syncGroupId,
    }));

    const res = await api.institute.bulkSyncTimetableSlots([...currentSlots, ...newSlots]);
    if (!res.success) {
      if (onTriggerToast) {
        onTriggerToast(res.error?.message || 'Failed to sync timetable preset on server', 'warning');
      }
      return;
    }

    onUpdateState((prev) => ({
      ...prev,
      customOptions: {
        ...prev.customOptions,
        timetableSlots: [...currentSlots, ...newSlots],
      },
    }));

    if (onTriggerToast) {
      onTriggerToast(`Added "${preset.title}" across Mon–Fri schedule!`, 'success');
    }
  };

  // Delete all slots in a synced group
  const handleDeleteSyncedGroup = async (syncGroupId: string, title?: string) => {
    if (isStudent) return;
    const currentSlots = Array.isArray(state.customOptions?.timetableSlots)
      ? state.customOptions.timetableSlots
      : DEFAULT_INITIAL_SLOTS;

    const updatedSlots = currentSlots.filter(
      (s) => !(s.batchId === selectedBatchId && s.syncGroupId === syncGroupId)
    );

    const res = await api.institute.bulkSyncTimetableSlots(updatedSlots);
    if (!res.success) {
      if (onTriggerToast) {
        onTriggerToast(res.error?.message || 'Failed to remove timetable break on server', 'warning');
      }
      return;
    }

    onUpdateState((prev) => ({
      ...prev,
      customOptions: {
        ...prev.customOptions,
        timetableSlots: updatedSlots,
      },
    }));

    if (onTriggerToast) {
      onTriggerToast(`Removed "${title || 'Break'}" across all working days.`, 'info');
    }
  };

  // Save Slot (Create or Edit)
  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStudent) return;
    if (!formTitle.trim()) return;

    const startM = parseTimeToMinutes(formStartTime);
    const endM = parseTimeToMinutes(formEndTime);
    if (endM <= startM) {
      alert('End time must be after start time.');
      return;
    }

    const currentSlots = Array.isArray(state.customOptions?.timetableSlots)
      ? state.customOptions.timetableSlots
      : DEFAULT_INITIAL_SLOTS;

    let updatedSlots = [...currentSlots];
    const syncGroup =
      editingSlot?.syncGroupId || (formApplyAcrossWeek ? `sync_${formTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}` : undefined);

    if (editingSlot) {
      if (formApplyAcrossWeek) {
        // Update all slots in the same sync group across all working days consistently
        const targetSyncId = editingSlot.syncGroupId || syncGroup;
        const daysToApply = activeDays;

        // Remove old synced group slots or this slot for this batch
        updatedSlots = updatedSlots.filter(
          (s) => !(s.batchId === selectedBatchId && (s.syncGroupId === targetSyncId || s.id === editingSlot.id))
        );

        // Re-generate consistent slots for all active days
        daysToApply.forEach((d) => {
          updatedSlots.push({
            id: `slot_${Date.now()}_${d}_${Math.floor(Math.random() * 1000)}`,
            batchId: selectedBatchId,
            dayOfWeek: d,
            type: modalSlotType,
            title: formTitle.trim(),
            subjectCode: modalSlotType === 'class' ? formSubjectCode.trim() : undefined,
            facultyName: modalSlotType === 'class' ? formFacultyName : undefined,
            room: modalSlotType === 'class' ? formRoom.trim() : undefined,
            startTime: formStartTime,
            endTime: formEndTime,
            color: formColor,
            isRecurringDaily: true,
            syncGroupId: targetSyncId,
          });
        });
      } else {
        // Single slot edit (detach from sync group if editing only this day)
        updatedSlots = updatedSlots.map((s) => {
          if (s.id === editingSlot.id) {
            return {
              ...s,
              title: formTitle.trim(),
              type: modalSlotType,
              subjectCode: modalSlotType === 'class' ? formSubjectCode.trim() : undefined,
              facultyName: modalSlotType === 'class' ? formFacultyName : undefined,
              room: modalSlotType === 'class' ? formRoom.trim() : undefined,
              dayOfWeek: formDay,
              startTime: formStartTime,
              endTime: formEndTime,
              color: formColor,
              isRecurringDaily: false,
              syncGroupId: undefined,
            };
          }
          return s;
        });
      }
    } else {
      // New Slot Creation
      if (formApplyAcrossWeek) {
        // Create consistently across all active working days in week
        activeDays.forEach((d) => {
          updatedSlots.push({
            id: `slot_${Date.now()}_${d}_${Math.floor(Math.random() * 1000)}`,
            batchId: selectedBatchId,
            dayOfWeek: d,
            type: modalSlotType,
            title: formTitle.trim(),
            subjectCode: modalSlotType === 'class' ? formSubjectCode.trim() : undefined,
            facultyName: modalSlotType === 'class' ? formFacultyName : undefined,
            room: modalSlotType === 'class' ? formRoom.trim() : undefined,
            startTime: formStartTime,
            endTime: formEndTime,
            color: formColor,
            isRecurringDaily: true,
            syncGroupId: syncGroup,
          });
        });
      } else {
        // Single day slot creation
        updatedSlots.push({
          id: `slot_${Date.now()}`,
          batchId: selectedBatchId,
          dayOfWeek: formDay,
          type: modalSlotType,
          title: formTitle.trim(),
          subjectCode: modalSlotType === 'class' ? formSubjectCode.trim() : undefined,
          facultyName: modalSlotType === 'class' ? formFacultyName : undefined,
          room: modalSlotType === 'class' ? formRoom.trim() : undefined,
          startTime: formStartTime,
          endTime: formEndTime,
          color: formColor,
          isRecurringDaily: false,
        });
      }
    }

    const res = await api.institute.bulkSyncTimetableSlots(updatedSlots);
    if (!res.success) {
      if (onTriggerToast) {
        onTriggerToast(res.error?.message || 'Failed to save timetable slot on server', 'warning');
      }
      return;
    }

    onUpdateState((prev) => ({
      ...prev,
      customOptions: {
        ...prev.customOptions,
        timetableSlots: updatedSlots,
      },
    }));

    setShowSlotModal(false);
    if (onTriggerToast) {
      onTriggerToast(
        modalSlotType === 'break'
          ? formApplyAcrossWeek
            ? 'Break synchronized consistently across all working days!'
            : `Break scheduled for ${formDay}.`
          : 'Class period scheduled successfully.',
        'success'
      );
    }
  };

  // Delete Slot Handler
  const handleDeleteSlot = async (slot: TimetableSlot, deleteAllSynced: boolean = false) => {
    if (isStudent) return;
    const currentSlots = Array.isArray(state.customOptions?.timetableSlots)
      ? state.customOptions.timetableSlots
      : DEFAULT_INITIAL_SLOTS;

    let updatedSlots = [...currentSlots];
    if (deleteAllSynced && slot.syncGroupId) {
      updatedSlots = updatedSlots.filter(
        (s) => !(s.batchId === selectedBatchId && s.syncGroupId === slot.syncGroupId)
      );
    } else {
      updatedSlots = updatedSlots.filter((s) => s.id !== slot.id);
    }

    if (slot.id) {
      const delRes = await api.institute.deleteTimetableSlot(slot.id, Boolean(deleteAllSynced && slot.syncGroupId));
      if (!delRes.success) {
        const bulkRes = await api.institute.bulkSyncTimetableSlots(updatedSlots);
        if (!bulkRes.success) {
          if (onTriggerToast) {
            onTriggerToast(bulkRes.error?.message || 'Failed to delete timetable slot on server', 'warning');
          }
          return;
        }
      }
    }

    onUpdateState((prev) => ({
      ...prev,
      customOptions: {
        ...prev.customOptions,
        timetableSlots: updatedSlots,
      },
    }));

    setShowSlotModal(false);
    if (onTriggerToast) {
      onTriggerToast(
        deleteAllSynced
          ? 'Removed break across entire week schedule.'
          : 'Schedule slot removed.',
        'info'
      );
    }
  };

  return (
    <div className="space-y-4 text-slate-900 font-sans">
      {/* ─── 1. TOP TOOLBAR: TITLE, BATCH / TEACHER SELECTOR, VIEW MODES & ACTIONS ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-1">
        {/* Left: Title & Entity Selector (Batches vs Teachers) */}
        <div className="flex items-center justify-between sm:justify-start flex-wrap gap-2.5">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
            {isStudent
              ? 'My Timetable'
              : isTeacherSchedule
              ? 'Teacher Schedule'
              : 'Class Timetable'}
          </h2>

          {!isStudent && (
            <select
              value={selectedScheduleKey}
              onChange={(e) => setSelectedScheduleKey(e.target.value)}
              className="h-8.5 max-w-[240px] sm:max-w-none rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 px-3 pr-8 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 cursor-pointer transition-all shadow-2xs truncate"
            >
              <optgroup label="Academic Batches">
                {configuredBatches.length === 0 ? (
                  <option value="" disabled>
                    No Batches Configured Yet
                  </option>
                ) : (
                  configuredBatches.map((b) => (
                    <option key={b.id} value={`batch:${b.id}`}>
                      {b.grade}{b.section ? ` — Section ${b.section}` : ''}
                    </option>
                  ))
                )}
              </optgroup>
              {availableFaculty.length > 0 && (
                <optgroup label="Faculty Teachers">
                  {availableFaculty.map((f) => (
                    <option key={f.id} value={`teacher:${f.name}`}>
                      {f.name} ({f.designation})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
        </div>

        {/* Right: View Modes & Action Buttons */}
        <div className="flex items-center flex-wrap sm:flex-nowrap gap-2 justify-between lg:justify-end">
          {/* View Mode Toggle Group */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 overflow-x-auto no-scrollbar max-w-full">
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'matrix'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Period Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'timeline'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hourly Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'day'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Day Timeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                viewMode === 'list'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Class List
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Manage Weekly Breaks Button (Batch Mode Only) */}
            {!isStudent && !isTeacherSchedule && (
              <button
                type="button"
                onClick={() => setShowManageBreaksModal(true)}
                className="h-8.5 px-2.5 sm:px-3 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100/80 text-amber-900 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
              >
                <Coffee className="h-3.5 w-3.5 text-amber-700" />
                <span className="hidden sm:inline">Breaks</span>
                <span>({weeklyRecurringBreaks.length})</span>
              </button>
            )}

            {/* Add Break Button (Batch Mode Only) */}
            {!isStudent && !isTeacherSchedule && (
              <button
                type="button"
                onClick={() => handleOpenCreateModal('break')}
                className="h-8.5 px-2.5 sm:px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-2xs"
              >
                <Plus className="h-3.5 w-3.5 text-slate-400" />
                <span>Break</span>
              </button>
            )}

            {/* Add Class Period Button */}
            {!isStudent && (
              <button
                type="button"
                onClick={() => handleOpenCreateModal('class')}
                className="h-8.5 px-3 sm:px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-xs shadow-blue-600/20 active:scale-98 shrink-0"
              >
                <Plus className="h-4 w-4 stroke-[2.2]" />
                <span>Add Period</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── 3A. ADAPTIVE PERIOD GRID VIEW (PERIODS ON TOP, ZERO OVERLAP & FULL BREAK PILLARS) ─── */}
      {viewMode === 'matrix' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="overflow-x-auto custom-scrollbar">
            <div className="min-w-[780px] sm:min-w-[960px]">
              {/* Header: Period & Break Intervals */}
              <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-30 font-bold text-xs text-slate-700">
                {/* Left Day Cell */}
                <div className="w-[84px] sm:w-[120px] min-w-[84px] sm:min-w-[120px] p-2 sm:p-3 text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-center border-r border-slate-200 sticky left-0 bg-slate-50 z-30 shadow-xs">
                  Day / Per
                </div>

                {/* Interval Columns */}
                {periodIntervals.map((interval) => {
                  if (interval.type === 'break') {
                    return (
                      <div
                        key={interval.id}
                        className="w-[110px] sm:w-[130px] min-w-[110px] sm:min-w-[130px] p-2 sm:p-3 text-center bg-amber-50/90 border-r border-amber-200/80 flex flex-col items-center justify-center gap-0.5 shrink-0"
                      >
                        <span className="text-[11px] sm:text-xs font-bold text-amber-950 truncate max-w-full">{interval.title}</span>
                        <span className="text-[9px] sm:text-[10px] font-mono text-amber-800 font-semibold">
                          {formatTime12h(interval.startTime)} – {formatTime12h(interval.endTime)}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={interval.id}
                      className="min-w-[135px] sm:min-w-[170px] flex-1 p-2 sm:p-3 text-center bg-slate-50 border-r border-slate-200 flex flex-col items-center justify-center gap-0.5 shrink-0"
                    >
                      <span className="text-[11px] sm:text-xs font-bold text-slate-800">{interval.periodLabel}</span>
                      <span className="text-[9px] sm:text-[10px] font-mono text-slate-500 font-medium">
                        {formatTime12h(interval.startTime)} – {formatTime12h(interval.endTime)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Day Rows */}
              <div className="divide-y divide-slate-200">
                {activeDays.map((day) => {
                  const daySlots = displayedSlots.filter((s) => s.dayOfWeek === day);
                  const classCount = daySlots.filter((s) => s.type === 'class').length;

                  return (
                    <div key={day} className="flex min-h-[90px] sm:min-h-[96px] relative hover:bg-slate-50/20 transition-colors">
                      {/* Left Sticky Day Label */}
                      <div className="w-[84px] sm:w-[120px] min-w-[84px] sm:min-w-[120px] p-2 sm:p-3 border-r border-slate-200 bg-white sticky left-0 z-20 flex flex-col justify-center items-start shadow-xs">
                        <span className="text-xs font-bold text-slate-900">
                          <span className="sm:hidden">{day.slice(0, 3)}</span>
                          <span className="hidden sm:inline">{day}</span>
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-medium text-slate-400 font-mono">
                          {classCount} {classCount === 1 ? 'Period' : 'Periods'}
                        </span>
                      </div>

                      {/* Interval Cells across Day */}
                      {periodIntervals.map((interval) => {
                        if (interval.type === 'break') {
                          // Break Column Cell
                          const dayBreak =
                            daySlots.find(
                              (s) =>
                                s.type === 'break' &&
                                (s.syncGroupId === interval.syncGroupId ||
                                  (s.startTime === interval.startTime && s.endTime === interval.endTime))
                            ) ||
                            displayedSlots.find(
                              (s) =>
                                s.type === 'break' &&
                                (s.isRecurringDaily || s.syncGroupId) &&
                                (s.syncGroupId === interval.syncGroupId ||
                                  (s.startTime === interval.startTime && s.endTime === interval.endTime))
                            );

                          return (
                            <div
                              key={interval.id}
                              onClick={() => {
                                if (dayBreak) {
                                  handleOpenEditModal(dayBreak);
                                } else if (!isStudent) {
                                  handleOpenCreateModal('break', day, interval.startTime);
                                }
                              }}
                              className={`w-[110px] sm:w-[130px] min-w-[110px] sm:min-w-[130px] bg-amber-50/60 hover:bg-amber-100/70 border-r border-amber-200/80 p-2 sm:p-2.5 flex flex-col items-center justify-center text-center gap-1 transition-all ${
                                !isStudent ? 'cursor-pointer' : 'cursor-default'
                              } shrink-0`}
                              title={`${interval.title} (${formatTime12h(interval.startTime)} – ${formatTime12h(interval.endTime)})`}
                            >
                              <span className="text-[11px] sm:text-xs font-bold text-amber-950 block truncate max-w-full px-0.5 leading-tight">
                                {interval.title}
                              </span>
                              <span className="text-[9px] sm:text-[10px] font-mono text-amber-800 font-bold bg-white/90 border border-amber-200/70 px-1.5 sm:px-2 py-0.5 rounded-md leading-none shadow-2xs">
                                {interval.durationM}m
                              </span>
                            </div>
                          );
                        }

                        // Class Period Cell
                        const matchingSlots = daySlots.filter(
                          (s) =>
                            s.type === 'class' &&
                            (s.startTime === interval.startTime ||
                              (parseTimeToMinutes(s.startTime) < interval.endM &&
                                parseTimeToMinutes(s.endTime) > interval.startM))
                        );

                        if (matchingSlots.length > 0) {
                          return (
                            <div
                              key={interval.id}
                              className="min-w-[135px] sm:min-w-[170px] flex-1 p-1.5 sm:p-2 border-r border-slate-200 flex flex-col justify-center gap-1.5 shrink-0 bg-white"
                            >
                              {matchingSlots.map((slot) => {
                                const colorTheme = COLOR_VARIANTS[slot.color || 'blue'] || COLOR_VARIANTS.blue;
                                return (
                                  <div
                                    key={slot.id}
                                    onClick={() => handleOpenEditModal(slot)}
                                    className={`p-2 sm:p-2.5 rounded-xl ${colorTheme.bg} ${colorTheme.hoverBg} border ${colorTheme.border} text-white shadow-2xs hover:shadow-xs transition-all ${
                                      !isStudent ? 'cursor-pointer' : 'cursor-default'
                                    } flex flex-col justify-between gap-1.5`}
                                  >
                                    {/* Subject Title & Code */}
                                    <div className="flex items-start justify-between gap-1">
                                      <h4 className="text-[11px] sm:text-xs font-bold text-white truncate leading-snug">
                                        {slot.title}
                                      </h4>
                                      {slot.subjectCode && (
                                        <span
                                          className="text-[9px] font-mono font-bold bg-white/25 text-white backdrop-blur-xs px-1.5 py-0.5 rounded shrink-0 shadow-2xs"
                                        >
                                          {slot.subjectCode}
                                        </span>
                                      )}
                                    </div>

                                    {/* Faculty & Room Footer */}
                                    <div className="flex items-center justify-between gap-1 pt-0.5 text-[10px] text-white/90 font-medium">
                                      <div className="flex items-center gap-1 truncate min-w-0">
                                        {slot.facultyName ? (
                                          <>
                                            <User className="h-3 w-3 text-white/80 shrink-0" />
                                            <span className="truncate text-white/95">{slot.facultyName}</span>
                                          </>
                                        ) : (
                                          <span className="text-white/75">Academic</span>
                                        )}
                                      </div>
                                      {slot.room && (
                                        <span className="bg-white/95 text-slate-900 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 shadow-2xs">
                                          {slot.room}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        // Empty Period Cell
                        return (
                          <div
                            key={interval.id}
                            onClick={() => {
                              if (!isStudent) handleOpenCreateModal('class', day, interval.startTime);
                            }}
                            className={`min-w-[135px] sm:min-w-[170px] flex-1 p-2 border-r border-slate-200 flex items-center justify-center bg-slate-50/20 hover:bg-blue-50/40 transition-all ${
                              !isStudent ? 'cursor-pointer group' : 'cursor-default'
                            } shrink-0`}
                          >
                            {!isStudent && (
                              <span className="text-[11px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100">
                                <Plus className="h-3.5 w-3.5" /> Add Class
                              </span>
                            )}
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

      {/* ─── 3B. CONTINUOUS HOURLY TIMELINE VIEW ─── */}
      {viewMode === 'timeline' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="overflow-x-auto custom-scrollbar">
            <div className="min-w-[1000px]">
              {/* Top Header: Time Intervals */}
              <div className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-30 font-bold text-xs text-slate-700">
                <div className="w-[84px] sm:w-[130px] min-w-[84px] sm:min-w-[130px] p-2 sm:p-3 text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-center border-r border-slate-200 sticky left-0 bg-slate-50 z-30 shadow-xs">
                  Day / Time
                </div>

                <div className="flex relative" style={{ width: `${TOTAL_HOURS * HOUR_WIDTH_PX}px` }}>
                  {Array.from({ length: TOTAL_HOURS }).map((_, hourIdx) => {
                    const hourNum = START_HOUR + hourIdx;
                    const timeLabel = formatMinutesToTime(hourNum * 60);
                    return (
                      <div
                        key={hourIdx}
                        style={{ width: `${HOUR_WIDTH_PX}px` }}
                        className="p-3 text-center border-r border-slate-200 text-[11px] font-mono font-bold text-slate-600 shrink-0"
                      >
                        {timeLabel}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Body: Day Rows */}
              <div className="divide-y divide-slate-200">
                {activeDays.map((day) => {
                  const daySlots = displayedSlots.filter((s) => s.dayOfWeek === day);
                  const classCount = daySlots.filter((s) => s.type === 'class').length;
                  const layoutSlots = computeDaySlotLayouts(daySlots);
                  const maxLanes = Math.max(1, ...layoutSlots.map((s) => s.totalLanes));
                  const dayRowHeight = Math.max(92, maxLanes * 50);

                  return (
                    <div
                      key={day}
                      className="flex relative hover:bg-slate-50/30 transition-colors"
                      style={{ height: `${dayRowHeight}px` }}
                    >
                      <div className="w-[84px] sm:w-[130px] min-w-[84px] sm:min-w-[130px] p-2 sm:p-3 border-r border-slate-200 bg-white sticky left-0 z-20 flex flex-col justify-center items-start shadow-xs">
                        <span className="text-xs font-bold text-slate-900">
                          <span className="sm:hidden">{day.slice(0, 3)}</span>
                          <span className="hidden sm:inline">{day}</span>
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-medium text-slate-400 font-mono">
                          {classCount} {classCount === 1 ? 'Period' : 'Periods'}
                        </span>
                      </div>

                      <div
                        className="relative h-full"
                        style={{ width: `${TOTAL_HOURS * HOUR_WIDTH_PX}px` }}
                        onClick={(e) => {
                          if (isStudent) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const clickX = e.clientX - rect.left;
                          const clickedHour = Math.floor(clickX / HOUR_WIDTH_PX) + START_HOUR;
                          const startStr = `${String(clickedHour).padStart(2, '0')}:00`;
                          handleOpenCreateModal('class', day, startStr);
                        }}
                      >
                        {Array.from({ length: TOTAL_HOURS }).map((_, hIdx) => (
                          <div
                            key={hIdx}
                            className="absolute top-0 bottom-0 border-r border-slate-100 pointer-events-none"
                            style={{
                              left: `${hIdx * HOUR_WIDTH_PX}px`,
                              width: `${HOUR_WIDTH_PX}px`,
                            }}
                          />
                        ))}

                        {layoutSlots.map(({ slot, lane, totalLanes }) => {
                          const startM = parseTimeToMinutes(slot.startTime);
                          const endM = parseTimeToMinutes(slot.endTime);
                          const durationM = Math.max(25, endM - startM);

                          const leftPx = Math.max(0, ((startM - START_MINS) / 60) * HOUR_WIDTH_PX);
                          const widthPx = Math.max(56, (durationM / 60) * HOUR_WIDTH_PX - 6);
                          const colorTheme = COLOR_VARIANTS[slot.color || 'blue'] || COLOR_VARIANTS.blue;

                          const availableHeight = dayRowHeight - 12;
                          const laneHeight = availableHeight / totalLanes;
                          const topPx = 6 + lane * laneHeight;
                          const heightPx = Math.max(28, laneHeight - 3);

                          if (slot.type === 'break') {
                            const isCompact = widthPx < 85 || totalLanes > 1 || heightPx <= 44;
                            return (
                              <div
                                key={slot.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditModal(slot);
                                }}
                                title={`${slot.title} (${formatTime12h(slot.startTime)} – ${formatTime12h(slot.endTime)})${slot.syncGroupId ? ' • Mon–Fri' : ''}`}
                                style={{
                                  left: `${leftPx}px`,
                                  width: `${widthPx}px`,
                                  top: `${topPx}px`,
                                  height: `${heightPx}px`,
                                }}
                                className={`absolute rounded-xl border border-amber-200/90 bg-amber-50/90 hover:bg-amber-100/90 hover:border-amber-300 px-2.5 py-1 flex items-center justify-between gap-1.5 shadow-2xs ${
                                  !isStudent ? 'cursor-pointer' : 'cursor-default'
                                } transition-all z-10 text-amber-950 overflow-hidden`}
                              >
                                <div className="flex items-center min-w-0">
                                  <span className="text-[11px] font-bold text-amber-950 truncate leading-none">
                                    {slot.title}
                                  </span>
                                </div>
                                {!isCompact && (
                                  <span className="text-[10px] font-mono text-amber-800 font-bold shrink-0 leading-none">
                                    {formatTime12h(slot.startTime)}
                                  </span>
                                )}
                              </div>
                            );
                          }

                          const isCompact = totalLanes > 1 || heightPx <= 44;

                          return (
                            <div
                              key={slot.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(slot);
                              }}
                              title={`${slot.title} (${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)})`}
                              style={{
                                left: `${leftPx}px`,
                                width: `${widthPx}px`,
                                top: `${topPx}px`,
                                height: `${heightPx}px`,
                              }}
                              className={`absolute rounded-xl ${colorTheme.bg} ${colorTheme.hoverBg} border ${colorTheme.border} text-white p-2 flex flex-col justify-between shadow-2xs hover:shadow-xs transition-all z-10 overflow-hidden ${
                                !isStudent ? 'cursor-pointer' : 'cursor-default'
                              }`}
                            >
                              {isCompact ? (
                                <div className="flex items-center justify-between gap-1.5 w-full h-full">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="text-xs font-bold text-white truncate leading-none">
                                      {slot.title}
                                    </span>
                                    {slot.facultyName && (
                                      <span className="text-[10px] text-white/80 font-medium truncate hidden sm:inline leading-none">
                                        • {slot.facultyName}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {slot.subjectCode && (
                                      <span
                                        className="text-[9px] font-mono font-bold bg-white/25 text-white px-1.5 py-0.5 rounded leading-none shadow-2xs"
                                      >
                                        {slot.subjectCode}
                                      </span>
                                    )}
                                    {slot.room && (
                                      <span className="text-[9px] font-bold bg-white/95 text-slate-900 px-1.5 py-0.5 rounded leading-none shadow-2xs">
                                        {slot.room}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="min-w-0">
                                    <div className="flex items-start justify-between gap-1">
                                      <h4 className="text-xs font-bold text-white truncate leading-snug">
                                        {slot.title}
                                      </h4>
                                      {slot.subjectCode && (
                                        <span
                                          className="text-[9px] font-mono font-bold bg-white/25 text-white px-1.5 py-0.5 rounded shrink-0 shadow-2xs"
                                        >
                                          {slot.subjectCode}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-1 pt-1 text-[11px] text-white/90 font-medium">
                                    <div className="flex items-center gap-1 truncate min-w-0">
                                      {slot.facultyName ? (
                                        <>
                                          <User className="h-3 w-3 text-white/80 shrink-0" />
                                          <span className="truncate text-white/95">{slot.facultyName}</span>
                                        </>
                                      ) : (
                                        <span className="text-white/75 text-[10px]">Academic Period</span>
                                      )}
                                    </div>
                                    {slot.room && (
                                      <span className="bg-white/95 text-slate-900 px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 shadow-2xs">
                                        {slot.room}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── 4. DAY TIMELINE VIEW ─── */}
      {viewMode === 'day' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-5 space-y-4">
          {/* Day Switcher Tabs with Stepper Arrows */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={handlePrevDay}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer transition-colors shadow-2xs shrink-0"
                title="Previous Day"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[210px] sm:max-w-none">
                {activeDays.map((d) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDay(d)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                      selectedDay === d
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    <span className="sm:hidden">{d.slice(0, 3)}</span>
                    <span className="hidden sm:inline">{d}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleNextDay}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer transition-colors shadow-2xs shrink-0"
                title="Next Day"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {!isStudent && (
              <button
                onClick={() => handleOpenCreateModal('class', selectedDay)}
                className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1 cursor-pointer border border-blue-200 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">+ Add to {selectedDay}</span>
                <span className="sm:hidden">+ Add</span>
              </button>
            )}
          </div>

          {/* Timeline Cards for Selected Day */}
          {(() => {
            const currentDaySlots = displayedSlots
              .filter((s) => s.dayOfWeek === selectedDay)
              .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

            if (currentDaySlots.length === 0) {
              return (
                <div className="py-12 sm:py-16 text-center text-slate-400 space-y-2">
                  <BookOpen className="h-10 w-10 mx-auto text-slate-300 stroke-[1.5]" />
                  <p className="text-sm font-bold text-slate-700">No classes scheduled on {selectedDay}</p>
                  <p className="text-xs text-slate-400">
                    {!isStudent ? `Click "+ Add" above to schedule a class period or break.` : 'No scheduled periods for this day.'}
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-2.5 sm:space-y-3">
                {currentDaySlots.map((slot) => {
                  const colorTheme = COLOR_VARIANTS[slot.color || 'blue'] || COLOR_VARIANTS.blue;

                  if (slot.type === 'break') {
                    return (
                      <div
                        key={slot.id}
                        onClick={() => handleOpenEditModal(slot)}
                        className={`p-3.5 sm:p-4 rounded-xl border border-amber-200 bg-amber-50/60 flex items-center justify-between gap-3 ${!isStudent ? 'cursor-pointer hover:border-amber-400' : 'cursor-default'} transition-all`}
                      >
                        <div className="flex flex-col justify-center min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-amber-950 truncate">{slot.title}</h4>
                          <span className="text-[11px] sm:text-xs text-amber-800 font-mono mt-0.5">
                            {formatTime12h(slot.startTime)} — {formatTime12h(slot.endTime)}
                          </span>
                        </div>

                        {slot.syncGroupId && (
                          <span className="text-[10px] sm:text-[11px] font-semibold text-amber-800 bg-white/80 border border-amber-200 px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0">
                            <Repeat className="h-3 w-3" /> Mon–Fri
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={slot.id}
                      onClick={() => handleOpenEditModal(slot)}
                      className={`p-3.5 sm:p-4 rounded-xl ${colorTheme.bg} ${colorTheme.hoverBg} border ${colorTheme.border} text-white shadow-2xs hover:shadow-xs transition-all ${!isStudent ? 'cursor-pointer' : 'cursor-default'} flex flex-col sm:flex-row sm:items-center justify-between gap-2.5`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-white/20 text-white font-bold text-xs flex items-center justify-center shadow-2xs backdrop-blur-xs shrink-0">
                          {slot.subjectCode || '—'}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">{slot.title}</h4>
                          <div className="flex items-center gap-2 text-xs mt-0.5 text-white/90 flex-wrap">
                            <span className="font-medium truncate">{slot.facultyName || '—'}</span>
                            {slot.room && (
                              <>
                                <span className="text-white/40">•</span>
                                <span className="bg-white/20 text-white px-1.5 py-0.5 rounded text-[10px] font-bold">{slot.room}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:block justify-end shrink-0">
                        <span className="text-[11px] sm:text-xs font-mono font-bold text-white bg-white/20 border border-white/30 px-2 sm:px-2.5 py-1 rounded-lg shadow-2xs backdrop-blur-xs">
                          {formatTime12h(slot.startTime)} — {formatTime12h(slot.endTime)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── 5. CLASS LIST & AGENDA VIEW ─── */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              Weekly Schedule ({displayedSlots.length} Total Periods)
            </h3>
            <button
              onClick={() => window.print()}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Print Timetable</span>
              <span className="sm:hidden">Print</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {activeDays.map((day) => {
              const daySlots = displayedSlots
                .filter((s) => s.dayOfWeek === day)
                .sort((a, b) => parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime));

              return (
                <div key={day} className="p-3.5 sm:p-5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-bold text-blue-900">{day}</span>
                    <span className="text-[11px] sm:text-xs font-semibold text-slate-400">
                      {daySlots.length} {daySlots.length === 1 ? 'Period' : 'Periods'}
                    </span>
                  </div>

                  {daySlots.length === 0 ? (
                    <p className="text-xs text-slate-400">No scheduled periods.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 sm:gap-2.5">
                      {daySlots.map((slot) => {
                        const colorTheme = COLOR_VARIANTS[slot.color || 'blue'] || COLOR_VARIANTS.blue;
                        return (
                          <div
                            key={slot.id}
                            onClick={() => handleOpenEditModal(slot)}
                            className={`p-3 rounded-xl ${colorTheme.bg} ${colorTheme.hoverBg} border ${colorTheme.border} text-white hover:shadow-md transition-all ${!isStudent ? 'cursor-pointer' : 'cursor-default'} shadow-2xs`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold text-white truncate">{slot.title}</span>
                              <span className="text-[10px] font-mono text-white/90 font-bold shrink-0 bg-white/20 px-1.5 py-0.5 rounded">
                                {formatTime12h(slot.startTime)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-white/90 mt-1.5">
                              <span className="truncate text-white/90">{slot.facultyName || '—'}</span>
                              <span className="font-semibold bg-white/20 px-1.5 py-0.5 rounded text-[10px] text-white">{slot.room || ''}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* ─── 6. MANAGE WEEKLY BREAKS MODAL ─── */}
      {showManageBreaksModal && !isStudent && (
        <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-xl bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Coffee className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Weekly Break Schedule
                  </h3>
                  <span className="text-xs text-slate-500">
                    Consistent daily intervals for {selectedBatchObj.grade}{selectedBatchObj.section ? ` — Section ${selectedBatchObj.section}` : ''}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowManageBreaksModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar space-y-6 text-xs">
              {/* Active Synced Breaks List */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Active Recurring Breaks (Mon–Fri)
                </h4>

                {weeklyRecurringBreaks.length === 0 ? (
                  <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-700">No recurring breaks configured.</p>
                    <p className="text-[11px]">Use the quick presets below to add standard recess or lunch times.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {weeklyRecurringBreaks.map((b) => (
                      <div
                        key={b.id}
                        className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-8 w-8 rounded-lg bg-amber-200 text-amber-900 flex items-center justify-center font-bold shrink-0">
                            <Coffee className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-amber-950 block truncate">{b.title}</span>
                            <span className="font-mono text-[11px] text-amber-800">
                              {formatTime12h(b.startTime)} — {formatTime12h(b.endTime)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setShowManageBreaksModal(false);
                              handleOpenEditModal(b);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold text-xs cursor-pointer flex items-center gap-1 shadow-2xs"
                          >
                            <Edit2 className="h-3 w-3" /> <span className="hidden sm:inline">Edit Timing</span>
                          </button>
                          {b.syncGroupId && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSyncedGroup(b.syncGroupId!, b.title)}
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 cursor-pointer"
                              title="Delete break across all working days"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Add Presets */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Quick Add Standard Break Presets
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {COMMON_BREAK_PRESETS.map((preset) => (
                    <button
                      key={preset.title}
                      type="button"
                      onClick={() => handleQuickAddPresetBreak(preset)}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-amber-50/50 hover:border-amber-300 text-left transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div>
                        <span className="font-bold text-slate-800 group-hover:text-amber-950 block">
                          {preset.title}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {formatTime12h(preset.startTime)} - {formatTime12h(preset.endTime)}
                        </span>
                      </div>
                      <Plus className="h-4 w-4 text-slate-400 group-hover:text-amber-700 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setShowManageBreaksModal(false)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-2xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── 8. SLOT CREATION & EDIT MODAL ─── */}
      {showSlotModal && !isStudent && (
        <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {editingSlot
                    ? `Edit ${editingSlot.type === 'break' ? 'Break Interval' : 'Class Period'}`
                    : `Schedule ${modalSlotType === 'break' ? 'Break Interval' : 'Class Period'}`}
                </h3>
                <span className="text-xs text-slate-500">
                  {selectedBatchObj.grade}{selectedBatchObj.section ? ` — Section ${selectedBatchObj.section}` : ''}
                </span>
              </div>
              <button
                onClick={() => setShowSlotModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveSlot} className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4 text-xs">
              {/* Type Switcher: Class Period vs Break Interval */}
              {!editingSlot && (
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setModalSlotType('class');
                      setFormApplyAcrossWeek(false);
                    }}
                    className={`py-2 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      modalSlotType === 'class' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BookOpen className="h-3.5 w-3.5" /> Class Period
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalSlotType('break');
                      setFormTitle('Lunch Break');
                      setFormColor('amber');
                      setFormApplyAcrossWeek(true);
                    }}
                    className={`py-2 rounded-lg font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      modalSlotType === 'break' ? 'bg-amber-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Coffee className="h-3.5 w-3.5" /> Break / Recess
                  </button>
                </div>
              )}

              {/* Title / Subject */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  {modalSlotType === 'break' ? 'Break Title *' : 'Subject / Class Title *'}
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={modalSlotType === 'break' ? 'e.g. Lunch Break, Morning Recess' : 'e.g. Advanced Mathematics, Physics Lab'}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-xs text-slate-900 font-medium outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>

              {/* Break Consistency Option: Apply / Edit across all working days */}
              {modalSlotType === 'break' && (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 space-y-2">
                  <div className="font-bold text-amber-950 text-xs">Break Scope Across Week:</div>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="breakScope"
                        checked={formApplyAcrossWeek}
                        onChange={() => setFormApplyAcrossWeek(true)}
                        className="h-4 w-4 text-amber-600 border-amber-300 focus:ring-0 cursor-pointer mt-0.5"
                      />
                      <div>
                        <span className="font-bold text-amber-950 block">
                          Every Working Day (Mon–Fri)
                        </span>
                        <span className="text-[11px] text-amber-800 font-medium block">
                          Keeps recess or lunch timings uniform throughout the weekly schedule.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input
                        type="radio"
                        name="breakScope"
                        checked={!formApplyAcrossWeek}
                        onChange={() => setFormApplyAcrossWeek(false)}
                        className="h-4 w-4 text-amber-600 border-amber-300 focus:ring-0 cursor-pointer mt-0.5"
                      />
                      <div>
                        <span className="font-bold text-amber-950 block">
                          Specific Day Only ({formDay})
                        </span>
                        <span className="text-[11px] text-amber-800 font-medium block">
                          Only schedule or edit this break on {formDay}.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Class Specific Fields: Subject Code & Faculty Teacher */}
              {modalSlotType === 'class' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">Subject Code (Optional)</label>
                    <input
                      type="text"
                      value={formSubjectCode}
                      onChange={(e) => setFormSubjectCode(e.target.value)}
                      placeholder="e.g. MTH-101"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-xs text-slate-900 font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">Classroom / Lab</label>
                    <input
                      type="text"
                      value={formRoom}
                      onChange={(e) => setFormRoom(e.target.value)}
                      placeholder="e.g. Room 301, Lab A"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-xs text-slate-900 outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              {modalSlotType === 'class' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Assigned Teacher / Faculty</label>
                  <select
                    value={formFacultyName}
                    onChange={(e) => setFormFacultyName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-xs text-slate-900 outline-none focus:border-blue-600 cursor-pointer font-medium"
                  >
                    <option value="">Select Faculty</option>
                    {(state.employees || []).map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}{emp.designation ? ` (${emp.designation})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Day of the Week (Active when not applying across week) */}
              {(!formApplyAcrossWeek || modalSlotType === 'class') && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Day of Week</label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value as DayOfWeek)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base sm:text-xs text-slate-900 outline-none focus:border-blue-600 cursor-pointer font-medium"
                  >
                    {activeDays.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Start & End Time with Synchronized Calculation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={formStartTime}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-base sm:text-xs font-mono text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1.5">End Time *</label>
                  <input
                    type="time"
                    required
                    value={formEndTime}
                    onChange={(e) => setFormEndTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-base sm:text-xs font-mono text-slate-900 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Smart Break Conflict Warning & Auto-Snap Helper */}
              {modalSlotType === 'class' && (() => {
                const startM = parseTimeToMinutes(formStartTime);
                const endM = parseTimeToMinutes(formEndTime);
                const overlappingBreak = displayedSlots.find(
                  (s) =>
                    s.type === 'break' &&
                    (s.dayOfWeek === formDay || s.isRecurringDaily || s.syncGroupId) &&
                    startM < parseTimeToMinutes(s.endTime) &&
                    endM > parseTimeToMinutes(s.startTime)
                );

                if (!overlappingBreak) return null;

                return (
                  <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-950 shadow-2xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Coffee className="h-4 w-4 text-amber-700 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-bold block truncate">
                          Overlaps with {overlappingBreak.title} ({formatTime12h(overlappingBreak.startTime)} – {formatTime12h(overlappingBreak.endTime)})
                        </span>
                        <span className="text-[11px] text-amber-800 block">
                          Tip: Schedule this class after the break interval.
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleStartTimeChange(overlappingBreak.endTime)}
                      className="px-2.5 py-1.5 rounded-lg bg-amber-200/90 hover:bg-amber-300 text-amber-950 font-bold text-[11px] cursor-pointer shrink-0 transition-colors shadow-2xs self-end sm:self-auto"
                    >
                      Snap to {formatTime12h(overlappingBreak.endTime)}
                    </button>
                  </div>
                );
              })()}

              {/* Color Swatch */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">Card Color Accent</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.keys(COLOR_VARIANTS).map((cKey) => {
                    const c = COLOR_VARIANTS[cKey];
                    return (
                      <button
                        key={cKey}
                        type="button"
                        onClick={() => setFormColor(cKey)}
                        className={`h-7 w-7 rounded-full ${c.bg} cursor-pointer transition-transform flex items-center justify-center text-white ${
                          formColor === cKey ? 'scale-110 ring-2 ring-blue-500 ring-offset-2' : 'hover:scale-105 opacity-80'
                        }`}
                      >
                        {formColor === cKey && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                {editingSlot ? (
                  <div className="flex items-center gap-2">
                    {editingSlot.syncGroupId ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(editingSlot, true)}
                        className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5"
                        title="Delete this break from all working days in this batch"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete (All Days)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDeleteSlot(editingSlot, false)}
                        className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-600 font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSlotModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs cursor-pointer transition-colors shadow-2xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-98"
                  >
                    {editingSlot ? 'Save Changes' : 'Schedule Slot'}
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
