'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  GraduationCap,
  Search,
  Plus,
  Download,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Eye,
  Mail,
  Phone,
  Users,
  X,
  Send,
  CalendarCheck,
  Building2,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  Shield,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { Student } from '../../types';
import { AppState } from '../../services/store';
import { api } from '../../services/apiClient';
import { UserAvatar } from '../common/UserAvatar';
import { StudentProfileCardModal } from './students/StudentProfileCardModal';
import { StudentAttendanceLogModal } from './students/StudentAttendanceLogModal';
import { StudentTimetableModule } from './students/StudentTimetableModule';
import { SetupPromptModal } from './dashboard/SetupPromptModal';

interface StudentDirectoryModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

// Avatar palette for initial badges
const AVATAR_PALETTE = [
  { bg: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  { bg: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  { bg: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  { bg: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
  { bg: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  { bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
];

const getStudentAvatarStyle = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
};

const getInitials = (name: string): string => {
  if (!name) return 'ST';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const formatTime12h = (t?: string) => {
  if (!t) return '—';
  if (t.includes('AM') || t.includes('PM')) return t;
  const parts = t.split(':');
  if (parts.length < 2) return t;
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return t;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${parts[1].slice(0, 2)} ${ampm}`;
};

export const StudentDirectoryModule: React.FC<StudentDirectoryModuleProps> = ({
  state,
  onUpdateState,
}) => {
  const isSuperAdmin = state.currentPersona.role === 'super_admin' || state.currentPersona.role === 'admin';
  const isHR = state.currentPersona.role === 'hr_manager';
  const isFaculty = state.currentPersona.role === 'faculty';
  const isStudent = state.currentPersona.role === 'student';
  const canManageStudents = (isSuperAdmin || isHR || isFaculty) && !isStudent;

  const [activeTab, setActiveTab] = useState<'roster' | 'overview' | 'timetable'>('roster');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 8;

  // Add Student Drawer State
  const [showAddStudentDrawer, setShowAddStudentDrawer] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentRollNo, setNewStudentRollNo] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentGrade, setNewStudentGrade] = useState('');
  const [newStudentSection, setNewStudentSection] = useState('');
  const [newStudentGuardian, setNewStudentGuardian] = useState('');
  const [newStudentGuardianPhone, setNewStudentGuardianPhone] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [showInlineAddBatch, setShowInlineAddBatch] = useState(false);
  const [quickBatchGrade, setQuickBatchGrade] = useState('');
  const [quickBatchSection, setQuickBatchSection] = useState('');
  const [quickBatchStart, setQuickBatchStart] = useState('08:30');
  const [quickBatchEnd, setQuickBatchEnd] = useState('15:30');
  const [quickBatchError, setQuickBatchError] = useState('');
  const [addStudentError, setAddStudentError] = useState('');
  const [isSubmittingStudent, setIsSubmittingStudent] = useState(false);

  // Configured Academic Batches
  const configuredBatches = useMemo(() => {
    return Array.isArray(state.customOptions?.academicBatches)
      ? state.customOptions.academicBatches
      : [];
  }, [state.customOptions?.academicBatches]);

  // Selected Batch
  const selectedBatch = useMemo(() => {
    if (selectedBatchId) {
      return configuredBatches.find((b) => b.id === selectedBatchId);
    }
    if (newStudentGrade) {
      return configuredBatches.find(
        (b) =>
          b.grade.toLowerCase() === newStudentGrade.toLowerCase() &&
          (!newStudentSection || (b.section || '').toLowerCase() === newStudentSection.toLowerCase())
      );
    }
    return null;
  }, [selectedBatchId, newStudentGrade, newStudentSection, configuredBatches]);

  // Selected Student Detail Modal
  const [inspectedStudent, setInspectedStudent] = useState<Student | null>(null);
  const [attendanceStudent, setAttendanceStudent] = useState<Student | null>(null);

  const handleUpdateStudent = async (updatedStudent: Student) => {
    const res = await api.institute.updateStudent(updatedStudent.id, {
      name: updatedStudent.name,
      email: updatedStudent.email,
      phone: updatedStudent.phone,
      rollNumber: updatedStudent.rollNumber,
      grade: updatedStudent.grade,
      section: updatedStudent.section,
      guardianName: updatedStudent.guardianName,
      guardianPhone: updatedStudent.guardianPhone,
      status: updatedStudent.status,
      avatar: updatedStudent.avatar,
    });

    if (!res.success) {
      alert(`Failed to update student on server: ${res.error?.message || 'Unknown error'}`);
      return;
    }

    onUpdateState((prev) => ({
      ...prev,
      students: (prev.students || []).map((s) => (s.id === updatedStudent.id ? updatedStudent : s)),
    }));
    setInspectedStudent(updatedStudent);
  };

  // Student list from store
  const allStudentsList = useMemo(() => {
    return Array.isArray(state.students) ? state.students : [];
  }, [state.students]);

  // Minimum attendance threshold from customizable options
  const minAttendanceThreshold = state.customOptions?.academicSettings?.minimumAttendanceThreshold ?? 75;

  // Compute live attendance rate and defaulter status for each student
  const studentAttendanceStatsMap = useMemo(() => {
    const map = new Map<string, { totalDays: number; attendedDays: number; rate: number; isBelow: boolean }>();
    const att = state.attendance || [];
    allStudentsList.forEach((stud) => {
      const logs = att.filter(
        (a) =>
          a.employeeId === stud.id ||
          a.employeeId === stud.studentId ||
          (a.employeeName && a.employeeName.toLowerCase() === stud.name.toLowerCase())
      );
      const totalDays = logs.length;
      const attendedDays = logs.filter((l) => l.status === 'Present' || l.status === 'Late').length;
      const rate = totalDays > 0 ? Math.round((attendedDays / totalDays) * 100) : 0;
      const isBelow = (state.customOptions?.academicSettings?.enableLowAttendanceWarning ?? true) && totalDays > 0 && rate < minAttendanceThreshold;
      map.set(stud.id, { totalDays, attendedDays, rate, isBelow });
    });
    return map;
  }, [allStudentsList, state.attendance, minAttendanceThreshold, state.customOptions?.academicSettings?.enableLowAttendanceWarning]);

  // Extract unique grades strictly from configured batches (with fallback to existing students if present)
  const uniqueGrades = useMemo(() => {
    const grades = new Set<string>();
    configuredBatches.forEach((b) => {
      if (b.grade && b.grade.trim()) grades.add(b.grade.trim());
    });
    allStudentsList.forEach((s) => {
      if (s.grade && s.grade.trim()) {
        const cleanGrade = s.grade.split(/\s*[-•]\s*/)[0].trim();
        if (cleanGrade) grades.add(cleanGrade);
      }
    });
    return Array.from(grades);
  }, [configuredBatches, allStudentsList]);

  // Extract unique sections
  const uniqueSections = useMemo(() => {
    const sections = new Set<string>();
    configuredBatches.forEach((b) => {
      if (b.section && b.section.trim()) sections.add(b.section.trim());
    });
    allStudentsList.forEach((s) => {
      if (s.section && s.section.trim()) sections.add(s.section.trim());
    });
    return Array.from(sections);
  }, [configuredBatches, allStudentsList]);

  // Extract sections available for the selected grade from configured batches
  const availableSectionsForGrade = useMemo(() => {
    const sections = new Set<string>();
    if (newStudentGrade) {
      const matches = configuredBatches.filter(
        (b) => b.grade.toLowerCase() === newStudentGrade.toLowerCase()
      );
      matches.forEach((b) => {
        if (b.section && b.section.trim()) sections.add(b.section.trim());
      });
      return Array.from(sections);
    }
    return uniqueSections;
  }, [newStudentGrade, configuredBatches, uniqueSections]);

  const handleSelectGrade = (gradeVal: string) => {
    setNewStudentGrade(gradeVal);
    const matchingBatches = configuredBatches.filter(
      (b) => b.grade.toLowerCase() === gradeVal.toLowerCase()
    );
    if (matchingBatches.length > 0) {
      const firstSection = matchingBatches[0].section || '';
      setNewStudentSection(firstSection);
      setSelectedBatchId(matchingBatches[0].id);
    } else {
      setNewStudentSection('');
      setSelectedBatchId('');
    }
  };

  const handleSelectSection = (secVal: string) => {
    setNewStudentSection(secVal);
    const match = configuredBatches.find(
      (b) =>
        b.grade.toLowerCase() === newStudentGrade.toLowerCase() &&
        (b.section || '').toLowerCase() === secVal.toLowerCase()
    );
    if (match) {
      setSelectedBatchId(match.id);
    }
  };

  const handleCreateQuickBatch = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!quickBatchGrade.trim()) {
      setQuickBatchError('Please enter a Grade / Class (e.g. Grade 10)');
      return;
    }
    setQuickBatchError('');
    const newB = {
      id: `b_${Date.now()}`,
      grade: quickBatchGrade.trim(),
      section: quickBatchSection.trim(),
      startTime: quickBatchStart || '08:30',
      endTime: quickBatchEnd || '15:30',
      graceMinutes: 15,
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    };

    const res = await api.institute.createBatch(newB);
    if (!res.success) {
      setQuickBatchError(res.error?.message || 'Could not create batch on server database.');
      return;
    }

    const savedBatch = res.data || newB;
    const nextBatches = [...configuredBatches, savedBatch];
    onUpdateState((prev) => ({
      ...prev,
      customOptions: {
        ...prev.customOptions,
        academicBatches: nextBatches,
      },
    }));

    setSelectedBatchId(savedBatch.id);
    setNewStudentGrade(savedBatch.grade);
    setNewStudentSection(savedBatch.section);
    setShowInlineAddBatch(false);
    setQuickBatchGrade('');
    setQuickBatchSection('');
    setQuickBatchStart('08:30');
    setQuickBatchEnd('15:30');
  };

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return allStudentsList.filter((s) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.rollNumber.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.guardianName && s.guardianName.toLowerCase().includes(q)) ||
        (s.guardianPhone && s.guardianPhone.toLowerCase().includes(q));

      const matchesGrade =
        gradeFilter === 'All' ||
        !gradeFilter ||
        s.grade === gradeFilter ||
        (s.grade && s.grade.toLowerCase() === gradeFilter.toLowerCase()) ||
        (s.grade && s.grade.toLowerCase().startsWith(gradeFilter.toLowerCase() + ' ')) ||
        (s.grade && s.grade.toLowerCase().startsWith(gradeFilter.toLowerCase() + ' -')) ||
        (s.grade && s.grade.toLowerCase().startsWith(gradeFilter.toLowerCase() + ' •'));

      const matchesStatus =
        statusFilter === 'All' ||
        s.status === statusFilter;

      return matchesSearch && matchesGrade && matchesStatus;
    });
  }, [allStudentsList, searchQuery, gradeFilter, statusFilter]);

  const totalPages = Math.ceil(filteredStudents.length / rowsPerPage) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredStudents.slice(start, start + rowsPerPage);
  }, [filteredStudents, currentPage, rowsPerPage]);

  const toggleSelectAll = () => {
    if (selectedStudentIds.length === paginatedStudents.length && paginatedStudents.length > 0) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(paginatedStudents.map((s) => s.id));
    }
  };

  const toggleSelectStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // CSV Export
  const handleDownloadCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Student ID,Roll Number,Full Name,Email,Grade / Section,Guardian Name,Guardian Phone,Status']
        .concat(
          filteredStudents.map(
            (s) =>
              `"${s.studentId}","${s.rollNumber}","${s.name}","${s.email}","${s.grade}","${s.guardianName || ''}","${s.guardianPhone || ''}","${s.status}"`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `student_directory_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add Student Handler
  const handleAddStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentRollNo.trim()) return;

    setAddStudentError('');
    setIsSubmittingStudent(true);

    const roll = newStudentRollNo.trim();
    const cleanName = newStudentName.trim();
    const cleanEmail =
      newStudentEmail.trim() ||
      `${cleanName.toLowerCase().replace(/\s+/g, '.')}@school.edu`;
    const matchedBatch = state.customOptions?.academicBatches?.find(
      (b) => b.id === selectedBatchId
    ) || state.customOptions?.academicBatches?.find(
      (b) => b.grade.toLowerCase() === newStudentGrade.toLowerCase() && (!newStudentSection || (b.section || '').toLowerCase() === newStudentSection.toLowerCase())
    ) || state.customOptions?.academicBatches?.find(
      (b) => b.grade.toLowerCase() === newStudentGrade.toLowerCase() || newStudentGrade.toLowerCase().includes(b.grade.toLowerCase())
    );

    const newStudent: Student = {
      id: `stud_${Date.now()}`,
      studentId: `STU-${1000 + allStudentsList.length + 1}`,
      name: cleanName,
      email: cleanEmail,
      rollNumber: roll,
      grade: newStudentGrade,
      section: newStudentSection,
      avatar: '',
      phone: newStudentPhone.trim() || '',
      guardianName: newStudentGuardian.trim() || '',
      guardianPhone: newStudentGuardianPhone.trim() || '',
      status: 'Active',
      shiftTiming: {
        startTime: matchedBatch?.startTime || '08:30',
        endTime: matchedBatch?.endTime || '15:30',
        shiftName: matchedBatch
          ? `${matchedBatch.grade}${matchedBatch.section ? ' - ' + matchedBatch.section : ''}`
          : `${newStudentGrade}${newStudentSection ? ' - ' + newStudentSection : ''}` || 'Standard Class',
        graceMinutes: matchedBatch?.graceMinutes || 15,
      },
    };

    try {
      const res = await api.institute.createStudent({
        studentId: newStudent.studentId,
        name: newStudent.name,
        email: newStudent.email,
        rollNumber: newStudent.rollNumber,
        grade: newStudent.grade,
        section: newStudent.section,
        batchId: selectedBatchId || matchedBatch?.id,
        phone: newStudent.phone,
        guardianName: newStudent.guardianName,
        guardianPhone: newStudent.guardianPhone,
        status: newStudent.status,
      });

      if (!res.success) {
        setAddStudentError(res.error?.message || 'Could not enroll student on server database.');
        setIsSubmittingStudent(false);
        return;
      }

      onUpdateState((prev) => ({
        ...prev,
        students: [newStudent, ...(prev.students || [])],
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'ADDED_STUDENT',
            entity: 'Student',
            entityId: newStudent.id,
            ipAddress: '106.51.72.18',
            details: `Enrolled student ${newStudent.name} (${newStudent.rollNumber}). Roll number is login password.`,
          },
          ...prev.auditLogs,
        ],
        notifications: [
          {
            id: `notif_${Date.now()}`,
            title: 'Student Enrolled',
            message: `${newStudent.name} enrolled into ${newStudent.grade}. Login Password is Roll Number (${newStudent.rollNumber}).`,
            timestamp: 'Just now',
            category: 'HR' as const,
            priority: 'low' as const,
            read: false,
            linkModule: 'HR',
            linkTab: 'students',
            actorName: state.currentPersona.name,
            actionLabel: 'View Directory',
          },
          ...prev.notifications,
        ],
      }));

      setShowAddStudentDrawer(false);
      setShowInlineAddBatch(false);
      setSelectedBatchId('');
      setNewStudentName('');
      setNewStudentRollNo('');
      setNewStudentEmail('');
      setNewStudentGrade('');
      setNewStudentSection('');
      setNewStudentGuardian('');
      setNewStudentGuardianPhone('');
      setNewStudentPhone('');
    } catch (err: any) {
      setAddStudentError(err?.message || 'Server error while adding student.');
    } finally {
      setIsSubmittingStudent(false);
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            Active
          </span>
        );
      case 'on leave':
        return (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
            On Leave
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
            Suspended
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            Active
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* Header & Title Actions (Transparent Header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">Student Directory</h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Manage academic batches, student rosters, parent contacts, and daily attendance logs
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManageStudents && (
            <Link
              href="/setup-students"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-600" /> Setup Wizard
            </Link>
          )}

          <button
            onClick={handleDownloadCSV}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white hover:bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition-all cursor-pointer shadow-2xs"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export CSV
          </button>

          {canManageStudents && (
            <button
              onClick={() => setShowAddStudentDrawer(true)}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white transition-all cursor-pointer shadow-xs active:scale-98"
            >
              <Plus className="h-3.5 w-3.5" /> Add Student
            </button>
          )}
        </div>
      </div>

      {/* Setup Prompt Box (When students or batches have not been set up) */}
      <SetupPromptModal forceType="student" />

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-pan-x py-1 w-full">
        <button
          onClick={() => setActiveTab('roster')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'roster'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-2xs'
          }`}
        >
          <Users className={`h-4 w-4 shrink-0 ${activeTab === 'roster' ? 'text-white' : 'text-slate-500'}`} />
          <span>Students Roster ({allStudentsList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-2xs'
          }`}
        >
          <BookOpen className={`h-4 w-4 shrink-0 ${activeTab === 'overview' ? 'text-white' : 'text-slate-500'}`} />
          <span>Grades & Academic Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('timetable')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
            activeTab === 'timetable'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 shadow-2xs'
          }`}
        >
          <Calendar className={`h-4 w-4 shrink-0 ${activeTab === 'timetable' ? 'text-white' : 'text-slate-500'}`} />
          <span>Batch Timetables & Schedules</span>
        </button>
      </div>

      {/* TAB 3: BATCH TIMETABLES & SCHEDULES (GOOGLE CALENDAR UI) */}
      {activeTab === 'timetable' && (
        <StudentTimetableModule state={state} onUpdateState={onUpdateState} />
      )}

      {/* Empty State when no students exist and on roster/overview tabs */}
      {activeTab !== 'timetable' && allStudentsList.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center space-y-4 shadow-2xs">
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-lg font-bold text-slate-900">No Students Enrolled Yet</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Enroll students and manage academic rosters directly using the Add Student modal.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
            <button
              onClick={() => setShowAddStudentDrawer(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 active:scale-98 cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Enroll New Student
            </button>
          </div>
        </div>
      ) : activeTab !== 'timetable' && (
        <>

          {/* Search & Filter Strip */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            {/* Search Input */}
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search student by name, roll no..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3.5 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 transition-all"
              />
            </div>

            {/* Dropdown Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full md:w-auto">
              {/* Grade Selector */}
              <select
                value={gradeFilter}
                onChange={(e) => {
                  setGradeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-blue-500 cursor-pointer"
              >
                <option value="All">All Grades & Sections</option>
                {uniqueGrades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              {/* Status Selector */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-blue-500 cursor-pointer"
              >
                <option value="All">All Status</option>
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* TAB 1: ROSTER TABLE */}
          {activeTab === 'roster' && (
            <div className="space-y-4 animate-fade-in">
              {/* Mobile Responsive Student Cards */}
              <div className="block md:hidden space-y-3">
                {paginatedStudents.length === 0 ? (
                  <div className="p-8 rounded-2xl border border-slate-200 bg-white text-center text-xs text-slate-400 font-semibold shadow-2xs">
                    No students match the specified filters.
                  </div>
                ) : (
                  paginatedStudents.map((stud) => {
                    const isSelected = selectedStudentIds.includes(stud.id);
                    const initials = getInitials(stud.name);
                    const avatarStyle = getStudentAvatarStyle(stud.name);
                    const attStat = studentAttendanceStatsMap.get(stud.id) || { totalDays: 0, attendedDays: 0, rate: 0, isBelow: false };

                    return (
                      <div
                        key={stud.id}
                        className={`p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3 cursor-pointer hover:border-blue-300 transition-all ${
                          isSelected ? 'ring-2 ring-blue-500 bg-blue-50/20' : ''
                        }`}
                        onClick={() => setInspectedStudent(stud)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar
                              src={stud.avatar}
                              name={stud.name}
                              className="h-10 w-10 text-xs shrink-0 ring-1 ring-slate-200/80"
                            />
                            <div className="min-w-0">
                              <h3 className="font-bold text-sm text-slate-900 truncate hover:text-blue-600">{stud.name}</h3>
                              <p className="text-xs text-slate-500 truncate">{stud.grade || '—'}{stud.section && !(stud.grade || '').includes(stud.section) ? ` • Sec ${stud.section}` : ''} • Roll #{stud.rollNumber}</p>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {renderStatusBadge(stud.status || 'Active')}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                          <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 font-medium text-[11px] text-slate-700">
                            Guardian: {stud.guardianName || '—'}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className={`px-2 py-0.5 rounded-lg font-bold text-[11px] ${attStat.isBelow ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-slate-100 text-slate-700'}`}>
                              Att: {attStat.rate}%
                            </span>
                            {attStat.isBelow && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> &lt; 75% At-Risk
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAttendanceStudent(stud);
                            }}
                            className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800"
                          >
                            <CalendarCheck className="h-3.5 w-3.5" /> Attendance Log
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectedStudent(stud);
                            }}
                            className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700"
                          >
                            <Eye className="h-3.5 w-3.5" /> View Profile
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Roster Table */}
              <div className="hidden md:block rounded-xl border border-slate-200 bg-white overflow-x-auto custom-scrollbar touch-pan-x shadow-2xs">
                <table className="w-full text-left text-xs border-collapse min-w-[720px]">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold text-[10px] uppercase">
                    <tr>
                      {canManageStudents && (
                        <th className="p-3.5 w-10">
                          <button
                            onClick={toggleSelectAll}
                            className="text-slate-400 hover:text-slate-600 flex items-center cursor-pointer"
                          >
                            {selectedStudentIds.length > 0 && selectedStudentIds.length === paginatedStudents.length ? (
                              <CheckSquare className="h-4 w-4 text-blue-600" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </button>
                        </th>
                      )}
                      <th className="p-3.5 text-slate-900 font-bold">Student Name ▾</th>
                      <th className="p-3.5">Roll Number / Login Pass ▾</th>
                      <th className="p-3.5">Grade / Section ▾</th>
                      <th className="p-3.5">Attendance Rate ▾</th>
                      <th className="p-3.5">Parent / Guardian ▾</th>
                      <th className="p-3.5">Guardian Phone ▾</th>
                      <th className="p-3.5">Status ▾</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium text-slate-700 divide-y divide-slate-100">
                    {paginatedStudents.length === 0 ? (
                      <tr>
                        <td colSpan={canManageStudents ? 9 : 8} className="p-8 text-center text-xs text-slate-400">
                          No students match the specified filters. Click &ldquo;+ Add Student&rdquo; to add new entries.
                        </td>
                      </tr>
                    ) : (
                      paginatedStudents.map((stud) => {
                        const isSelected = selectedStudentIds.includes(stud.id);
                        const initials = getInitials(stud.name);
                        const avatarStyle = getStudentAvatarStyle(stud.name);

                        return (
                          <tr
                            key={stud.id}
                            className={`hover:bg-slate-50 transition-colors ${isSelected ? 'bg-blue-50/60' : ''
                              }`}
                          >
                            {/* Checkbox */}
                            {canManageStudents && (
                              <td className="p-3.5">
                                <button
                                  onClick={() => toggleSelectStudent(stud.id)}
                                  className="text-slate-400 hover:text-slate-600 flex items-center cursor-pointer"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="h-4 w-4 text-blue-600" />
                                  ) : (
                                    <Square className="h-4 w-4" />
                                  )}
                                </button>
                              </td>
                            )}

                            {/* Student Name & Email */}
                            <td className="p-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <UserAvatar
                                  src={stud.avatar}
                                  name={stud.name}
                                  className="h-9 w-9 text-xs shrink-0 ring-1 ring-slate-200/80"
                                />
                                <div>
                                  <p
                                    onClick={() => setInspectedStudent(stud)}
                                    className="font-bold text-slate-900 hover:text-blue-600 cursor-pointer transition-colors"
                                  >
                                    {stud.name}
                                  </p>
                                  <p className="text-[11px] text-slate-500 font-mono">{stud.email}</p>
                                </div>
                              </div>
                            </td>

                            {/* Roll Number */}
                            <td className="p-3.5 font-mono whitespace-nowrap">
                              <span className="bg-slate-100 px-2.5 py-1 rounded border border-slate-200 text-blue-700 font-bold text-xs">
                                {stud.rollNumber}
                              </span>
                            </td>

                            {/* Grade / Section */}
                            <td className="p-3.5 text-slate-700 whitespace-nowrap">
                              {stud.grade ? `${stud.grade}${stud.section && !stud.grade.includes(stud.section) ? ` • Sec ${stud.section}` : ''}` : '—'}
                            </td>

                            {/* Attendance Rate & Warning Badge */}
                            <td className="p-3.5 whitespace-nowrap">
                              {(() => {
                                const attStat = studentAttendanceStatsMap.get(stud.id) || { totalDays: 0, attendedDays: 0, rate: 0, isBelow: false };
                                return (
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-bold text-xs ${attStat.isBelow ? 'text-amber-800' : 'text-slate-800'}`}>
                                      {attStat.rate}%
                                    </span>
                                    {attStat.isBelow && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs" title={`Cumulative attendance is below the mandatory ${minAttendanceThreshold}% policy`}>
                                        <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" /> &lt; 75% At-Risk
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}
                            </td>

                            {/* Guardian Name */}
                            <td className="p-3.5 text-slate-700 whitespace-nowrap">
                              {stud.guardianName || '—'}
                            </td>

                            {/* Guardian Phone */}
                            <td className="p-3.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                              {stud.guardianPhone || stud.phone || '—'}
                            </td>

                            {/* Status */}
                            <td className="p-3.5 whitespace-nowrap">
                              {renderStatusBadge(stud.status || 'Active')}
                            </td>

                            {/* Actions */}
                            <td className="p-3.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setAttendanceStudent(stud)}
                                  title="View Student Attendance Log"
                                  className="h-7 px-2.5 flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 hover:bg-teal-600 hover:text-white text-teal-700 text-[11px] font-bold transition-all cursor-pointer shadow-2xs"
                                >
                                  <CalendarCheck className="h-3.5 w-3.5" /> Attendance
                                </button>

                                <button
                                  type="button"
                                  onClick={() => setInspectedStudent(stud)}
                                  title="Inspect Student Profile"
                                  className="h-7 w-7 flex items-center justify-center rounded-md border border-slate-200 bg-slate-50 hover:bg-blue-600 hover:text-white text-blue-600 transition-all cursor-pointer shadow-2xs"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                {/* Bottom Pagination Bar */}
                <div className="p-3.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="h-7 w-7 flex items-center justify-center border border-slate-200 rounded-md disabled:opacity-30 hover:bg-slate-100 text-slate-700 cursor-pointer"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    {Array.from({ length: Math.min(3, totalPages) }).map((_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`h-7 w-7 flex items-center justify-center rounded-md font-bold text-xs cursor-pointer ${currentPage === pageNum
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    {totalPages > 3 && <span className="px-1 text-slate-400">...</span>}
                    {totalPages > 3 && (
                      <button
                        onClick={() => setCurrentPage(totalPages)}
                        className="h-7 w-7 flex items-center justify-center border border-slate-200 rounded-md text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        {totalPages}
                      </button>
                    )}
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="h-7 w-7 flex items-center justify-center border border-slate-200 rounded-md disabled:opacity-30 hover:bg-slate-100 text-slate-700 cursor-pointer"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="text-[11px]">
                    Showing {Math.min((currentPage - 1) * rowsPerPage + 1, filteredStudents.length)} to{' '}
                    {Math.min(currentPage * rowsPerPage, filteredStudents.length)} of {filteredStudents.length} students
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: REWORKED ACADEMIC GRADES & OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fade-in">
              {/* Executive Academic Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-white border border-slate-200 p-4.5 rounded-xl shadow-2xs">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Enrolled</p>
                  <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{allStudentsList.length}</h3>
                </div>

                <div className="bg-white border border-slate-200 p-4.5 rounded-xl shadow-2xs">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Attendance</p>
                  <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">
                    {allStudentsList.filter((s) => s.status === 'Active').length}
                  </h3>
                </div>

                <div className="bg-white border border-slate-200 p-4.5 rounded-xl shadow-2xs">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">On Leave / Absent</p>
                  <h3 className="text-2xl font-extrabold text-rose-600 mt-1">
                    {allStudentsList.filter((s) => s.status === 'On Leave').length}
                  </h3>
                </div>

                <div className="bg-white border border-slate-200 p-4.5 rounded-xl shadow-2xs">
                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Guardian Reach</p>
                  <h3 className="text-2xl font-extrabold text-purple-600 mt-1">
                    {allStudentsList.length > 0
                      ? `${Math.round((allStudentsList.filter((s) => s.guardianPhone && s.guardianPhone !== '—').length / allStudentsList.length) * 100)}%`
                      : '100%'}
                  </h3>
                </div>
              </div>

              {/* Grade Rosters Summary Table */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                <div className="p-4 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900">Grade Roster & Class Distribution</h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold text-[10px] uppercase">
                      <tr>
                        <th className="p-3.5 text-slate-900 font-bold">Academic Grade</th>
                        <th className="p-3.5">Total Enrolled</th>
                        <th className="p-3.5">Active In Class</th>
                        <th className="p-3.5">On Leave</th>
                        <th className="p-3.5">Attendance Health</th>
                        <th className="p-3.5 text-right">Quick Drilldown</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {uniqueGrades.map((grade) => {
                        const studentsInGrade = allStudentsList.filter(
                          (s) =>
                            s.grade === grade ||
                            (s.grade && s.grade.toLowerCase() === grade.toLowerCase()) ||
                            (s.grade && s.grade.toLowerCase().startsWith(grade.toLowerCase() + ' ')) ||
                            (s.grade && s.grade.toLowerCase().startsWith(grade.toLowerCase() + ' -')) ||
                            (s.grade && s.grade.toLowerCase().startsWith(grade.toLowerCase() + ' •'))
                        );
                        const activeCount = studentsInGrade.filter((s) => s.status === 'Active').length;
                        const onLeaveCount = studentsInGrade.filter((s) => s.status === 'On Leave').length;
                        const rate = studentsInGrade.length > 0 ? Math.round((activeCount / studentsInGrade.length) * 100) : 0;

                        return (
                          <tr key={grade} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3.5 whitespace-nowrap">
                              <span className="font-bold text-slate-900">{grade}</span>
                            </td>

                            <td className="p-3.5 whitespace-nowrap font-mono text-slate-900 font-bold">
                              {studentsInGrade.length} students
                            </td>

                            <td className="p-3.5 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 text-emerald-600 font-semibold font-mono">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                {activeCount} active
                              </span>
                            </td>

                            <td className="p-3.5 whitespace-nowrap">
                              <span className="text-slate-500 font-mono">
                                {onLeaveCount > 0 ? `${onLeaveCount} on leave` : '0 on leave'}
                              </span>
                            </td>

                            <td className="p-3.5 whitespace-nowrap">
                              <div className="flex items-center gap-3 w-40">
                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                  <div
                                    className="h-full bg-blue-600 rounded-full"
                                    style={{ width: `${rate}%` }}
                                  />
                                </div>
                                <span className="text-xs font-bold text-slate-900 font-mono">{rate}%</span>
                              </div>
                            </td>

                            <td className="p-3.5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setGradeFilter(grade);
                                  setActiveTab('roster');
                                }}
                                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                              >
                                View Roster <ArrowRight className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Slide-Over Drawer: Add New Student */}
      {showAddStudentDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="relative w-full max-w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-scale-up text-slate-900">
            {/* Header */}
            <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0 gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">Enroll New Student</h3>
                <p className="text-xs text-slate-500 mt-0.5 break-words">
                  Roll Number acts as the login password for the student portal.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStudentDrawer(false)}
                className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleAddStudentSubmit} className="flex-1 flex flex-col justify-between overflow-hidden bg-white">
              <div className="p-4 sm:p-6 sm:px-8 space-y-4 overflow-y-auto custom-scrollbar text-xs">
                {addStudentError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center justify-between gap-2">
                    <span>{addStudentError}</span>
                    <button type="button" onClick={() => setAddStudentError('')} className="text-rose-500 hover:text-rose-800 cursor-pointer">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Student Full Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aarav Sharma"
                    value={newStudentName}
                    onChange={(e) => {
                      setNewStudentName(e.target.value);
                      if (!newStudentEmail && e.target.value.trim()) {
                        setNewStudentEmail(`${e.target.value.trim().toLowerCase().replace(/\s+/g, '.')}@school.edu`);
                      }
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 font-medium outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Roll Number / Password <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10A-01"
                      value={newStudentRollNo}
                      onChange={(e) => setNewStudentRollNo(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-mono font-bold text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Student Email
                    </label>
                    <input
                      type="email"
                      placeholder="student@school.edu"
                      value={newStudentEmail}
                      onChange={(e) => setNewStudentEmail(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 font-medium outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                    />
                  </div>
                </div>

                {/* Academic Batch / Grade & Section Selection */}
                {configuredBatches.length > 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-slate-800">
                        Academic Batch <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowInlineAddBatch((prev) => !prev)}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                      >
                        {showInlineAddBatch ? 'Cancel' : '+ Add New Batch'}
                      </button>
                    </div>

                    {showInlineAddBatch ? (
                      <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/50 space-y-3">
                        <div className="text-xs font-bold text-blue-950">Add New Academic Batch</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-semibold text-slate-700">Grade / Class *</label>
                              <div className="flex items-center gap-1">
                                {['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => {
                                      setQuickBatchGrade(preset);
                                      if (quickBatchError) setQuickBatchError('');
                                    }}
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-white border border-slate-200 hover:bg-blue-100 hover:text-blue-700 text-slate-600 cursor-pointer transition-colors"
                                  >
                                    {preset.replace('Grade ', 'G')}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <input
                              type="text"
                              placeholder="e.g. Grade 10"
                              value={quickBatchGrade}
                              onChange={(e) => {
                                setQuickBatchGrade(e.target.value);
                                if (quickBatchError) setQuickBatchError('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCreateQuickBatch();
                                }
                              }}
                              className={`w-full rounded-lg border bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none transition-all ${
                                quickBatchError
                                  ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-200'
                                  : 'border-slate-200 focus:border-blue-600'
                              }`}
                            />
                            {quickBatchError && (
                              <p className="text-[11px] text-rose-600 font-medium mt-1">{quickBatchError}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Section</label>
                            <input
                              type="text"
                              placeholder="e.g. A"
                              value={quickBatchSection}
                              onChange={(e) => setQuickBatchSection(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCreateQuickBatch();
                                }
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Shift Start</label>
                            <input
                              type="time"
                              value={quickBatchStart}
                              onChange={(e) => setQuickBatchStart(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCreateQuickBatch();
                                }
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 transition-all cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Shift End</label>
                            <input
                              type="time"
                              value={quickBatchEnd}
                              onChange={(e) => setQuickBatchEnd(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCreateQuickBatch();
                                }
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 transition-all cursor-pointer"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowInlineAddBatch(false);
                              setQuickBatchError('');
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateQuickBatch}
                            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs cursor-pointer transition-all active:scale-98"
                          >
                            Create & Select Batch
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Grade / Class</label>
                          <div className="relative">
                            <select
                              value={newStudentGrade}
                              onChange={(e) => handleSelectGrade(e.target.value)}
                              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-9 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all cursor-pointer"
                              required
                            >
                              <option value="">Select Grade / Class</option>
                              {uniqueGrades.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">Section</label>
                          <div className="relative">
                            <select
                              value={newStudentSection}
                              onChange={(e) => handleSelectSection(e.target.value)}
                              disabled={!newStudentGrade}
                              className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 pr-9 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all cursor-pointer disabled:bg-slate-50 disabled:text-slate-400"
                            >
                              <option value="">Select Section (Optional)</option>
                              {availableSectionsForGrade.map((s) => (
                                <option key={s} value={s}>
                                  Section {s}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedBatch && (
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
                        <span className="font-semibold text-slate-900">
                          {selectedBatch.grade}{selectedBatch.section ? ` — Section ${selectedBatch.section}` : ''}
                        </span>
                        <span className="font-mono text-slate-500 text-[11px]">
                          Shift: {formatTime12h(selectedBatch.startTime || '08:30')} — {formatTime12h(selectedBatch.endTime || '15:30')}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/70 text-slate-800 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-bold text-amber-900">No Academic Batches Configured</h4>
                        <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                          Students must be enrolled according to your institution&apos;s set batches. Please configure your first batch below.
                        </p>
                      </div>
                      {!showInlineAddBatch && (
                        <button
                          type="button"
                          onClick={() => setShowInlineAddBatch(true)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
                        >
                          + Add First Batch
                        </button>
                      )}
                    </div>

                    {showInlineAddBatch && (
                      <div className="p-4 rounded-xl border border-blue-200 bg-white space-y-3 mt-2">
                        <div className="text-xs font-bold text-slate-900">Configure Academic Batch</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[11px] font-semibold text-slate-700">Grade / Class *</label>
                              <div className="flex items-center gap-1">
                                {['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => {
                                      setQuickBatchGrade(preset);
                                      if (quickBatchError) setQuickBatchError('');
                                    }}
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-600 cursor-pointer transition-colors"
                                  >
                                    {preset.replace('Grade ', 'G')}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <input
                              type="text"
                              placeholder="e.g. Grade 10"
                              value={quickBatchGrade}
                              onChange={(e) => {
                                setQuickBatchGrade(e.target.value);
                                if (quickBatchError) setQuickBatchError('');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCreateQuickBatch();
                                }
                              }}
                              className={`w-full rounded-xl border bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none transition-all ${
                                quickBatchError
                                  ? 'border-rose-400 focus:border-rose-600 ring-1 ring-rose-200'
                                  : 'border-slate-200 focus:border-blue-600'
                              }`}
                            />
                            {quickBatchError && (
                              <p className="text-[11px] text-rose-600 font-medium mt-1">{quickBatchError}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Section</label>
                            <input
                              type="text"
                              placeholder="e.g. A"
                              value={quickBatchSection}
                              onChange={(e) => setQuickBatchSection(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCreateQuickBatch();
                                }
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Shift Start</label>
                            <input
                              type="time"
                              value={quickBatchStart}
                              onChange={(e) => setQuickBatchStart(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCreateQuickBatch();
                                }
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 transition-all cursor-pointer"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Shift End</label>
                            <input
                              type="time"
                              value={quickBatchEnd}
                              onChange={(e) => setQuickBatchEnd(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleCreateQuickBatch();
                                }
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 transition-all cursor-pointer"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setShowInlineAddBatch(false);
                              setQuickBatchError('');
                            }}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateQuickBatch}
                            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs cursor-pointer transition-all active:scale-98"
                          >
                            Create & Select Batch
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Parent / Guardian Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Rajesh Sharma"
                      value={newStudentGuardian}
                      onChange={(e) => setNewStudentGuardian(e.target.value)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 font-medium outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Guardian Contact Phone
                    </label>
                    <input
                      type="tel"
                      maxLength={10}
                      placeholder="e.g. 9845012345 (10 Digits)"
                      value={newStudentGuardianPhone}
                      onChange={(e) => setNewStudentGuardianPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-900 placeholder-slate-400 font-mono outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 sm:p-6 sm:px-8 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0 pb-7 sm:pb-6">
                <button
                  type="button"
                  onClick={() => setShowAddStudentDrawer(false)}
                  className="flex-1 py-3 sm:py-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStudent}
                  className="flex-2 py-3 sm:py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-bold cursor-pointer shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>{isSubmittingStudent ? 'Enrolling...' : 'Enroll Student'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Student Profile Modal (Matching Staff Profile Card UI with Edit & Photo Upload) */}
      <StudentProfileCardModal
        isOpen={!!inspectedStudent}
        onClose={() => setInspectedStudent(null)}
        student={inspectedStudent}
        attendanceRecords={state.attendance || []}
        onUpdateStudent={handleUpdateStudent}
        academicBatches={configuredBatches}
      />

      {/* Student Attendance Log Modal */}
      {attendanceStudent && (
        <StudentAttendanceLogModal
          isOpen={!!attendanceStudent}
          onClose={() => setAttendanceStudent(null)}
          student={attendanceStudent}
          attendanceRecords={state.attendance || []}
          minThreshold={minAttendanceThreshold}
          warningMessage={state.customOptions?.academicSettings?.warningMessage}
        />
      )}
    </div>
  );
};
