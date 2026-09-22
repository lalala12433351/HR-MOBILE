'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Clock,
  MapPin,
  Info,
  Calendar as CalendarIcon,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  User,
  Search,
  Filter,
  Plus,
  Compass,
  Globe,
  FileText,
  Building2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Navigation,
  Radio,
  Coffee,
  Utensils,
  ShieldCheck,
  Smartphone,
  Activity,
  Wifi,
  RefreshCw,
  Layers,
  CreditCard,
  ScanFace,
  LogIn,
  LogOut,
  Timer,
  Check,
  Camera,
  CameraOff,
  RefreshCcw,
  ImageOff,
  Pencil,
  Users,
  FileCheck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Settings,
  Send,
  Sparkles,
  Paperclip,
  Briefcase,
  Printer,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AppState } from '../../services/store';
import { AttendanceRecord, AttendanceRegularization, Employee, LeaveRequest } from '../../types';
import { AttendanceSettingsView } from './AttendanceSettingsView';
import { HolidayCalendarView } from './attendance/HolidayCalendarView';
import { AttendanceReportsModal } from './attendance/AttendanceReportsModal';
import { AttendanceStatCards } from './attendance/AttendanceStatCards';
import { AttendanceFilterToolbar } from './attendance/AttendanceFilterToolbar';
import { AttendanceOverviewChart } from './attendance/AttendanceOverviewChart';
import { AttendanceStatusPill } from './attendance/AttendanceStatusPill';
import {
  ATT_BTN_PRIMARY,
  ATT_BTN_SECONDARY,
  ATT_CARD,
  ATT_PAGE_META,
  ATT_PAGE_TITLE,
  ATT_SECTION_SUB,
  ATT_SECTION_TITLE,
  ATT_SUBNAV_ACTIVE,
  ATT_SUBNAV_BASE,
  ATT_SUBNAV_IDLE,
  ATT_TABLE_HEAD,
  ATT_TABLE_SHELL,
} from './attendance/attendanceUi';
import { UserAvatar } from '../common/UserAvatar';
import { PunchLocationLeafletMap } from '../common/PunchLocationLeafletMap';
import { api } from '../../services/apiClient';
import { isInstitutionMode } from '@/utils/organizationMode';
import { getCurrentPosition, getSelfieStream, captureSelfiePhoto, isNativePlatform } from '@/lib/native';

import {
  isExecutiveOrAdmin,
  isManagerPersona,
  getTeamEmployees,
  getTeamLeaves,
  canApproveLeave,
  canApproveRegularization,
  isDirectReport,
} from '../../utils/teamAccess';
import {
  formatLeaveDays,
  getEffectiveLeaveQuotas,
  isEmployeeInProbation,
  isPaidLeaveType,
  validateLeaveApproval,
} from '../../utils/leaveRules';

interface KekaAttendanceModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onCheckInAttendance?: () => void;
  onSelectEmployee?: (employee: Employee) => void;
  targetEmployeeId?: string;
  targetEmployee?: Employee;
  initialSubTab?: 'my_attendance' | 'team_attendance' | 'leaves' | 'regularizations' | 'holidays' | 'settings';
  initialOpenApplyModal?: boolean;
  mode?: 'staff' | 'student';
}

type TeamStatusType = 'on_time' | 'late' | 'logged_out' | 'not_in_yet' | 'time_off';
type TeamGeoLabel = 'within' | 'outside' | 'remote' | 'none' | 'no_punch';

/** Match daily attendance to a team member by stable IDs only (never by name). */
function findAttendanceForEmployee(
  attendance: AttendanceRecord[],
  emp: { id: string; employeeId?: string },
  date: string,
  todayIso?: string
): AttendanceRecord | undefined {
  return attendance.find((a) => {
    const idMatch =
      a.employeeId === emp.id ||
      (!!emp.employeeId && a.employeeId === emp.employeeId);
    if (!idMatch) return false;
    if (a.date === date) return true;
    if (todayIso && date === todayIso && a.date === todayIso) return true;
    return false;
  });
}

function resolveTeamGeoLabel(att?: AttendanceRecord | null): TeamGeoLabel {
  if (!att?.checkIn) return 'no_punch';
  const loc = String(att.locationName || '').toLowerCase();
  const device = String(att.device || '').toLowerCase();
  if (
    loc.includes('remote') ||
    loc.includes('wfh') ||
    loc.includes('home') ||
    device.includes('remote') ||
    device.includes('out of geofence')
  ) {
    return 'remote';
  }
  const lat = Number(att.latitude);
  const lng = Number(att.longitude);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  if (!hasCoords) return 'none';
  if (att.isWithinGeofence === false) return 'outside';
  return 'within';
}

function hasValidOfficeCoordinates(officeLocation?: {
  latitude?: number | null;
  longitude?: number | null;
} | null): boolean {
  const lat = Number(officeLocation?.latitude);
  const lng = Number(officeLocation?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0;
}

function TeamStatusBadge({
  statusType,
  isStudentMode,
}: {
  statusType: TeamStatusType;
  isStudentMode: boolean;
}) {
  if (statusType === 'on_time') {
    return (
      <AttendanceStatusPill
        kind={isStudentMode ? 'present' : 'on_time'}
        label={isStudentMode ? 'Present' : 'Logged In'}
      />
    );
  }
  if (statusType === 'logged_out') {
    return (
      <AttendanceStatusPill
        kind="logged_out"
        label={isStudentMode ? 'Present' : 'Logged Out'}
      />
    );
  }
  if (statusType === 'late') {
    return <AttendanceStatusPill kind="late" label="Late" />;
  }
  if (statusType === 'time_off') {
    return (
      <AttendanceStatusPill
        kind="on_leave"
        label={isStudentMode ? 'On Leave' : 'Time Off'}
      />
    );
  }
  return (
    <AttendanceStatusPill
      kind="absent"
      label={isStudentMode ? 'Absent' : 'Not Checked In'}
    />
  );
}

function TeamGeoBadge({ geoLabel }: { geoLabel: TeamGeoLabel }) {
  if (geoLabel === 'no_punch') {
    return <span className="text-xs text-slate-400">-</span>;
  }
  if (geoLabel === 'within') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80"
        title="Within office geofence"
      >
        <MapPin className="h-3 w-3" /> Within
      </span>
    );
  }
  if (geoLabel === 'outside') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80"
        title="Outside office geofence"
      >
        <MapPin className="h-3 w-3" /> Outside
      </span>
    );
  }
  if (geoLabel === 'remote') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200/80"
        title="Remote / WFH punch"
      >
        <Globe className="h-3 w-3" /> Remote
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-50 text-slate-600 border border-slate-200/80"
      title="No GPS coordinates on punch"
    >
      <MapPin className="h-3 w-3" /> No GPS
    </span>
  );
}

function to24HourTime(timeStr?: string): string {
  if (!timeStr || timeStr === '—' || timeStr.includes('--:--')) return '';
  const clean = timeStr.replace(/\s*\(GMT[^\)]*\)/gi, '').trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) {
    if (/^\d{2}:\d{2}$/.test(clean)) return clean;
    return '';
  }
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const meridian = match[4]?.toUpperCase();
  if (meridian === 'PM' && hours < 12) hours += 12;
  if (meridian === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function to12HourTime(timeStr?: string): string {
  if (!timeStr) return '';
  const clean = timeStr.trim();
  if (clean.toUpperCase().includes('AM') || clean.toUpperCase().includes('PM')) {
    return clean;
  }
  const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return clean;
  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const seconds = match[3] || '00';
  const meridian = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${meridian}`;
}

function to12HourClockTime(timeStr?: string): string {
  return to12HourTime(timeStr).replace(/:(\d{2}):\d{2}\s/, ':$1 ');
}

function toLocalISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const calculateWorkedHours = (checkIn?: string, checkOut?: string) => {
  if (!checkIn || !checkOut) return 0;
  try {
    const inTime = new Date(`1970-01-01T${checkIn}:00Z`);
    const outTime = new Date(`1970-01-01T${checkOut}:00Z`);
    const diff = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
    return diff > 0 ? parseFloat(diff.toFixed(2)) : 0;
  } catch {
    return 0;
  }
};

export const KekaAttendanceModule: React.FC<KekaAttendanceModuleProps> = ({
  state,
  onUpdateState,
  onCheckInAttendance,
  onSelectEmployee,
  targetEmployeeId,
  targetEmployee,
  initialSubTab,
  initialOpenApplyModal,
  mode,
}) => {
  const router = useRouter();
  const isStudentMode = mode === 'student';

  const isSuperAdmin = state.currentPersona.role === 'super_admin' || state.currentPersona.role === 'admin';
  const isHR = state.currentPersona.role === 'hr_manager';
  const isManager = isManagerPersona(state.currentPersona, state.employees);
  const isInstitution = isInstitutionMode(state.organization, state.currentPersona) || isStudentMode;
  const isUserView = !isSuperAdmin && !isHR && !isManager && !isStudentMode;

  const handleEmployeeClick = (empIdOrEmp: string | Employee | { id: string; name: string }) => {
    let emp: Employee | undefined;
    if (typeof empIdOrEmp === 'object' && 'employeeId' in empIdOrEmp && 'department' in empIdOrEmp) {
      emp = empIdOrEmp as Employee;
    } else {
      const idOrName = typeof empIdOrEmp === 'string' ? empIdOrEmp : empIdOrEmp.id;
      const name = typeof empIdOrEmp === 'object' ? empIdOrEmp.name : empIdOrEmp;
      emp = state.employees.find(
        (e) => e.id === idOrName || e.employeeId === idOrName || e.name.toLowerCase() === (name || '').toLowerCase()
      );
    }

    if (emp) {
      const todayIso = teamAttendanceDate || new Date().toISOString().split('T')[0];
      const att = state.attendance.find((a) => a.employeeId === emp?.id && a.date === todayIso);
      const targetAtt: AttendanceRecord = att || {
        id: `att_${Date.now()}_${emp.id}`,
        employeeId: emp.id,
        employeeName: emp.name,
        avatar: emp.avatar || '',
        date: todayIso,
        checkIn: '',
        status: 'Absent',
        workingHours: 0,
        breakHours: 0,
        locationName: 'Not Checked In',
        latitude: state.organization?.officeLocation?.latitude || 0,
        longitude: state.organization?.officeLocation?.longitude || 0,
        isWithinGeofence: true,
        ipAddress: '-',
        device: 'Web App',
      };
      handleOpenEditAttendance(targetAtt);
    }
  };

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

  const teamMembers: Employee[] = useMemo(() => {
    if (isStudentMode) {
      const studentList = Array.isArray(state.students) ? state.students : [];
      return studentList.map((s) => ({
        id: s.id || s.studentId,
        name: s.name,
        employeeId: s.studentId,
        designation: `${s.grade}${s.section ? ` (${s.section})` : ''}`,
        department: 'Students' as any,
        avatar: s.avatar,
        salaryType: undefined,
        shiftTiming: s.shiftTiming,
        hourlyRate: undefined,
      })) as unknown as Employee[];
    }
    if (isSuperAdmin || isHR) return state.employees;
    if (isManager) return accessibleEmployees;
    return [
      state.employees.find((e) => e.id === state.currentPersona.id) || ({
        id: state.currentPersona.id,
        name: state.currentPersona.name,
        employeeId: 'EMP-001',
        designation: state.currentPersona.designation,
        department: state.currentPersona.department,
        avatar: state.currentPersona.avatar,
        shiftTiming: (state.currentPersona as any)?.shiftTiming,
        salaryType: (state.currentPersona as any)?.salaryType,
        hourlyRate: (state.currentPersona as any)?.hourlyRate,
      } as unknown as Employee),
    ];
  }, [isStudentMode, state.students, isSuperAdmin, isHR, isManager, state.employees, accessibleEmployees, state.currentPersona]);

  const teamAttendanceRecords = useMemo(() => {
    if (isStudentMode) {
      const studentNames = new Set(teamMembers.map((m) => m.name.toLowerCase()));
      const studentIds = new Set(teamMembers.map((m) => m.id));
      return state.attendance.filter(
        (a) =>
          studentIds.has(a.employeeId) ||
          (a.employeeName && studentNames.has(a.employeeName.toLowerCase())) ||
          a.employeeId === state.currentPersona.id ||
          (a.employeeName && a.employeeName.toLowerCase().includes('aarav sharma'))
      );
    }
    if (isSuperAdmin || isHR) return state.attendance;
    if (isManager) {
      return state.attendance.filter(
        (a) =>
          accessibleEmpIds.has(a.employeeId) ||
          (a.employeeName && accessibleEmpNames.has(a.employeeName.toLowerCase())) ||
          a.employeeId === state.currentPersona.id
      );
    }
    return state.attendance.filter(
      (a) =>
        a.employeeId === state.currentPersona.id ||
        (a.employeeName && a.employeeName.toLowerCase() === state.currentPersona.name.toLowerCase())
    );
  }, [isStudentMode, teamMembers, state.attendance, isSuperAdmin, isHR, isManager, accessibleEmpIds, accessibleEmpNames, state.currentPersona]);

  const isStudentLogin = state.currentPersona.role === 'student';

  const defaultSubTab = (initialOpenApplyModal ? 'leaves' : initialSubTab) || (isStudentLogin ? 'my_attendance' : isStudentMode ? 'team_attendance' : 'my_attendance');
  const [subTab, setSubTab] = useState<'my_attendance' | 'team_attendance' | 'leaves' | 'regularizations' | 'holidays' | 'settings'>(defaultSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  useEffect(() => {
    if (initialOpenApplyModal) {
      setShowApplyLeaveModal(true);
      setSubTab('leaves');
    }
  }, [initialOpenApplyModal]);

  useEffect(() => {
    if (state.currentPersona.role === 'student') {
      if (subTab !== 'my_attendance') {
        setSubTab('my_attendance');
      }
    } else if (
      isStudentMode &&
      (subTab === 'leaves' || subTab === 'regularizations' || subTab === 'my_attendance')
    ) {
      setSubTab('team_attendance');
    }
  }, [isStudentMode, state.currentPersona.role, subTab]);

  // Security guard: Non-Admin/HR personas (including Managers) cannot access settings
  useEffect(() => {
    if (!isSuperAdmin && !isHR && subTab === 'settings') {
      setSubTab(isStudentMode ? 'team_attendance' : 'my_attendance');
    }
  }, [isSuperAdmin, isHR, subTab, isStudentMode]);

  // Reports Modal State
  const [showReportsModal, setShowReportsModal] = useState<boolean>(false);
  const [reportsModalInitialType, setReportsModalInitialType] = useState<'daily' | 'monthly' | 'leaves' | 'roster'>('daily');

  // Leave Management State
  const [showApplyLeaveModal, setShowApplyLeaveModal] = useState(!!initialOpenApplyModal);
  const [isSaving, setIsSaving] = useState(false);
  const [leaveType, setLeaveType] = useState<
    'Casual Leave' | 'Sick Leave' | 'Earned Leave' | 'Work From Home' | 'Unpaid Leave'
  >('Casual Leave');
  const [dayMode, setDayMode] = useState<'single' | 'half' | 'multi'>('single');
  const [halfSession, setHalfSession] = useState<'First Half (Morning)' | 'Second Half (Afternoon)'>('First Half (Morning)');
  const [singleDate, setSingleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveHandover, setLeaveHandover] = useState('');
  const [leaveAttachment, setLeaveAttachment] = useState('');
  const [selectedLeaveEmpId, setSelectedLeaveEmpId] = useState(state.currentPersona.id);
  const [leaveFilterStatus, setLeaveFilterStatus] = useState<string>('All');
  const [leaveSearchQuery, setLeaveSearchQuery] = useState<string>('');

  // Target Employee for Leave Quotas
  const activeSubjectId = targetEmployeeId || targetEmployee?.id || state.currentPersona.id;
  const activeSubjectName = targetEmployee?.name || state.currentPersona.name;

  const targetEmpLeaves = useMemo(() => {
    return (state.leaves || []).filter(
      (l) => l.employeeId === activeSubjectId || (l.employeeName && l.employeeName.toLowerCase() === activeSubjectName.toLowerCase())
    );
  }, [state.leaves, activeSubjectId, activeSubjectName]);

  const targetEmployeeObj = (state.employees || []).find(
    (e) => e.id === activeSubjectId || (e.name && e.name.toLowerCase() === activeSubjectName.toLowerCase())
  ) || state.currentPersona;

  const effectiveQuotas = useMemo(() => {
    return getEffectiveLeaveQuotas(targetEmployeeObj, state.customOptions?.leaveSettings, state.customOptions?.probationSettings);
  }, [targetEmployeeObj, state.customOptions?.leaveSettings, state.customOptions?.probationSettings]);

  const isTargetInProbation = effectiveQuotas.inProbation;

  const casualQuota = formatLeaveDays(effectiveQuotas.effectiveQuotas.casualLeave);
  const sickQuota = formatLeaveDays(effectiveQuotas.effectiveQuotas.sickLeave);
  const earnedQuota = formatLeaveDays(effectiveQuotas.effectiveQuotas.earnedLeave);
  const wfhQuota = formatLeaveDays(effectiveQuotas.effectiveQuotas.compOff);

  const casualUsed = formatLeaveDays(targetEmpLeaves
    .filter((l) => l.leaveType === 'Casual Leave' && l.status !== 'Rejected' && l.status !== 'Cancelled')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const casualPending = formatLeaveDays(targetEmpLeaves
    .filter((l) => l.leaveType === 'Casual Leave' && l.status === 'Pending')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const casualLeft = formatLeaveDays(
    effectiveQuotas.balancesFromServer
      ? casualQuota
      : Math.max(0, casualQuota - casualUsed)
  );

  const sickUsed = formatLeaveDays(targetEmpLeaves
    .filter((l) => l.leaveType === 'Sick Leave' && l.status !== 'Rejected' && l.status !== 'Cancelled')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const sickPending = formatLeaveDays(targetEmpLeaves
    .filter((l) => l.leaveType === 'Sick Leave' && l.status === 'Pending')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const sickLeft = formatLeaveDays(
    effectiveQuotas.balancesFromServer ? sickQuota : Math.max(0, sickQuota - sickUsed)
  );

  const earnedUsed = formatLeaveDays(targetEmpLeaves
    .filter((l) => ((l.leaveType as string) === 'Earned Leave' || (l.leaveType as string) === 'Earned / Privilege') && l.status !== 'Rejected' && l.status !== 'Cancelled')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const earnedPending = formatLeaveDays(targetEmpLeaves
    .filter((l) => ((l.leaveType as string) === 'Earned Leave' || (l.leaveType as string) === 'Earned / Privilege') && l.status === 'Pending')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const earnedLeft = formatLeaveDays(
    effectiveQuotas.balancesFromServer ? earnedQuota : Math.max(0, earnedQuota - earnedUsed)
  );

  const wfhUsed = formatLeaveDays(targetEmpLeaves
    .filter((l) => l.leaveType === 'Work From Home' && l.status !== 'Rejected' && l.status !== 'Cancelled')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const wfhPending = formatLeaveDays(targetEmpLeaves
    .filter((l) => l.leaveType === 'Work From Home' && l.status === 'Pending')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const wfhLeft = formatLeaveDays(
    effectiveQuotas.balancesFromServer ? wfhQuota : Math.max(0, wfhQuota - wfhUsed)
  );

  // Dynamic modal employee leaves and quotas
  const isManagerUser = isManager && !isSuperAdmin && !isHR;
  
  // Direct reports for manager (strictly excluding CEO/Super Admin/executives)
  const managerDirectReports = useMemo(() => {
    if (!isManagerUser) return [];
    return state.employees.filter((emp) => isDirectReport(emp, state.currentPersona));
  }, [isManagerUser, state.employees, state.currentPersona]);

  const modalTargetEmpId = selectedLeaveEmpId || state.currentPersona.id;
  const modalTargetEmp = useMemo(() => {
    if (modalTargetEmpId === state.currentPersona.id) {
      return state.employees.find((e) => e.id === state.currentPersona.id || e.employeeId === state.currentPersona.id) || {
        id: state.currentPersona.id,
        employeeId: state.currentPersona.id,
        name: state.currentPersona.name,
        designation: state.currentPersona.designation || state.currentPersona.role,
        department: state.currentPersona.department,
        avatar: state.currentPersona.avatar,
        role: state.currentPersona.role,
      };
    }
    return state.employees.find((e) => e.id === modalTargetEmpId || e.employeeId === modalTargetEmpId) || {
      id: state.currentPersona.id,
      employeeId: state.currentPersona.id,
      name: state.currentPersona.name,
      designation: state.currentPersona.designation || state.currentPersona.role,
      department: state.currentPersona.department,
      avatar: state.currentPersona.avatar,
      role: state.currentPersona.role,
    };
  }, [state.employees, modalTargetEmpId, state.currentPersona]);

  const modalTargetQuotas = useMemo(() => {
    return getEffectiveLeaveQuotas(
      modalTargetEmp,
      state.customOptions?.leaveSettings,
      state.customOptions?.probationSettings
    );
  }, [modalTargetEmp, state.customOptions?.leaveSettings, state.customOptions?.probationSettings]);

  const modalIsProbation = modalTargetQuotas.inProbation;

  const modalEmpLeaves = useMemo(() => {
    return (state.leaves || []).filter(
      (l) => l.employeeId === modalTargetEmpId || (l.employeeName && modalTargetEmp?.name && l.employeeName.toLowerCase() === modalTargetEmp.name.toLowerCase())
    );
  }, [state.leaves, modalTargetEmpId, modalTargetEmp]);

  const modalCasualUsed = formatLeaveDays(modalEmpLeaves
    .filter((l) => l.leaveType === 'Casual Leave' && l.status !== 'Rejected' && l.status !== 'Cancelled')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const modalCasualLeft = modalIsProbation
    ? 0
    : formatLeaveDays(
        modalTargetQuotas.balancesFromServer
          ? modalTargetQuotas.effectiveQuotas.casualLeave
          : Math.max(0, modalTargetQuotas.effectiveQuotas.casualLeave - modalCasualUsed)
      );

  const modalSickUsed = formatLeaveDays(modalEmpLeaves
    .filter((l) => l.leaveType === 'Sick Leave' && l.status !== 'Rejected' && l.status !== 'Cancelled')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const modalSickLeft = modalIsProbation
    ? 0
    : formatLeaveDays(
        modalTargetQuotas.balancesFromServer
          ? modalTargetQuotas.effectiveQuotas.sickLeave
          : Math.max(0, modalTargetQuotas.effectiveQuotas.sickLeave - modalSickUsed)
      );

  const modalEarnedUsed = formatLeaveDays(modalEmpLeaves
    .filter((l) => ((l.leaveType as string) === 'Earned Leave' || (l.leaveType as string) === 'Earned / Privilege') && l.status !== 'Rejected' && l.status !== 'Cancelled')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const modalEarnedLeft = modalIsProbation
    ? 0
    : formatLeaveDays(
        modalTargetQuotas.balancesFromServer
          ? modalTargetQuotas.effectiveQuotas.earnedLeave
          : Math.max(0, modalTargetQuotas.effectiveQuotas.earnedLeave - modalEarnedUsed)
      );

  const modalWfhUsed = formatLeaveDays(modalEmpLeaves
    .filter((l) => l.leaveType === 'Work From Home' && l.status !== 'Rejected' && l.status !== 'Cancelled')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const modalWfhLeft = modalIsProbation
    ? 0
    : formatLeaveDays(
        modalTargetQuotas.balancesFromServer
          ? modalTargetQuotas.effectiveQuotas.compOff
          : Math.max(0, modalTargetQuotas.effectiveQuotas.compOff - modalWfhUsed)
      );

  // Auto-switch to Unpaid Leave whenever an employee on probation is targeted
  useEffect(() => {
    if (modalIsProbation) {
      setLeaveType('Unpaid Leave');
    }
  }, [modalIsProbation, modalTargetEmpId]);

  const computedLeaveDays = useMemo(() => {
    if (dayMode === 'half') return 0.5;
    if (dayMode === 'single') return 1;
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
    const diffTime = e.getTime() - s.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 1;
  }, [dayMode, startDate, endDate]);

  const pendingLeavesCount = useMemo(() => {
    if (isSuperAdmin || isHR) {
      return (state.leaves || []).filter((l) => l.status === 'Pending').length;
    }
    if (isManager) {
      return (state.leaves || []).filter(
        (l) => l.status === 'Pending' && (accessibleEmpIds.has(l.employeeId) || l.employeeId === state.currentPersona.id)
      ).length;
    }
    return (state.leaves || []).filter(
      (l) => l.status === 'Pending' && (l.employeeId === state.currentPersona.id || l.employeeName === state.currentPersona.name)
    ).length;
  }, [state.leaves, isSuperAdmin, isHR, isManager, accessibleEmpIds, state.currentPersona]);

  const [probationBlockModal, setProbationBlockModal] = useState<{
    leave: LeaveRequest;
    employee?: Employee;
  } | null>(null);

  const handleApproveLeave = async (id: string, approved: boolean) => {
    const targetLeave = state.leaves.find((l) => l.id === id);
    if (!targetLeave) return;

    // Strict role check: Managers can ONLY approve leaves for direct reports (NEVER for CEO/Execs)
    if (!canApproveLeave(state.currentPersona, targetLeave, state.employees)) {
      alert('Permission denied: You can only approve leaves for your direct reports. CEO and executive leaves cannot be modified.');
      return;
    }

    if (approved) {
      const targetEmp = state.employees.find(
        (e) => e.id === targetLeave.employeeId || (e.name && e.name.toLowerCase() === targetLeave.employeeName.toLowerCase())
      );
      const validation = validateLeaveApproval(targetLeave, targetEmp, state.customOptions?.probationSettings);
      if (!validation.canApproveAsPaid) {
        setProbationBlockModal({ leave: targetLeave, employee: targetEmp });
        return;
      }
    }

    // Direct backend API decision
    const decRes = await api.attendance.decideLeave(id, {
      status: approved ? 'approved' : 'rejected',
      decisionNotes: approved ? 'Approved' : 'Rejected',
    });

    if (!decRes.success) {
      alert(`Could not process leave decision in backend: ${decRes.error?.message || 'Request failed'}`);
      return;
    }

    onUpdateState((prev) => ({
      ...prev,
      leaves: prev.leaves.map((l) =>
        l.id === id
          ? {
              ...l,
              status: approved ? 'Approved' : 'Rejected',
              approvedBy: state.currentPersona.name,
            }
          : l
      ),
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: state.currentPersona.name,
          action: approved ? 'APPROVED_LEAVE' : 'REJECTED_LEAVE',
          entity: 'LeaveRequest',
          entityId: id,
          ipAddress: '106.51.72.18',
          details: `${approved ? 'Approved' : 'Rejected'} leave request ${id}`,
        },
        ...prev.auditLogs,
      ],
      notifications: [
        {
          id: `notif_${Date.now()}`,
          title: approved ? 'Leave Request Approved' : 'Leave Request Rejected',
          message: `${prev.leaves.find((l) => l.id === id)?.employeeName || 'Employee'}'s ${prev.leaves.find((l) => l.id === id)?.leaveType || 'leave'} request has been ${approved ? 'approved' : 'rejected'}.`,
          timestamp: 'Just now',
          category: 'Approvals' as const,
          priority: 'high' as const,
          read: false,
          linkModule: 'attendance',
          linkTab: 'leaves',
          actionLabel: 'View Leaves',
        },
        ...prev.notifications,
      ],
    }));
  };

  const handleApproveAsUnpaid = async (id: string) => {
    const targetLeave = state.leaves.find((l) => l.id === id);
    if (!targetLeave) return;

    if (!canApproveLeave(state.currentPersona, targetLeave, state.employees)) {
      alert('Permission denied: You can only approve leaves for your direct reports.');
      return;
    }

    setIsSaving(true);
    try {
      await api.attendance.updateLeaveStatus(id, {
        status: 'Approved',
        approvedBy: state.currentPersona.name,
        leaveType: 'unpaid',
        approveAsLop: true,
      });
      onUpdateState((prev) => ({
        ...prev,
        leaves: prev.leaves.map((l) =>
          l.id === id ? { ...l, status: 'Approved', leaveType: 'Loss of Pay', isPaid: false, approvedBy: state.currentPersona.name } : l
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'LEAVE_APPROVED_UNPAID',
            entity: 'LeaveRequest',
            entityId: id,
            ipAddress: '106.51.72.18',
            details: `Leave request ${id} approved as Loss of Pay.`,
          },
          ...prev.auditLogs,
        ],
        notifications: [
          {
            id: `notif_${Date.now()}`,
            title: `Leave Request Approved (Unpaid)`,
            message: `Leave request for ${targetLeave.startDate} has been approved as Loss of Pay.`,
            timestamp: 'Just now',
            category: 'Approvals' as const,
            priority: 'high' as const,
            read: false,
            linkModule: 'attendance',
            linkTab: 'leaves',
            actorName: state.currentPersona.name,
            actorAvatar: state.currentPersona.avatar,
            actionLabel: 'View Details',
          },
          ...prev.notifications,
        ],
      }));
    } catch (err) {
      console.error('Failed to update leave', err);
      alert('Failed to update leave status');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveLeaveAsLop = async (id: string, isLop: boolean = false) => {
    setIsSaving(true);
    try {
      await api.attendance.updateLeaveStatus(id, {
        status: 'Approved',
        approvedBy: state.currentPersona.name,
        ...(isLop ? { leaveType: 'unpaid' as const, approveAsLop: true } : {}),
      });
      
      onUpdateState((prev) => ({
        ...prev,
        leaves: prev.leaves.map((l) =>
          l.id === id
            ? {
                ...l,
                status: 'Approved',
                approvedBy: state.currentPersona.name,
                ...(isLop ? { leaveType: 'Loss of Pay', isPaid: false } : {}),
              }
            : l
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'APPROVED_LEAVE',
            entity: 'LeaveRequest',
            entityId: id,
            ipAddress: '106.51.72.18',
            details: `Approved leave request for ${prev.leaves.find((l) => l.id === id)?.employeeName || 'employee'}${isLop ? ' as Loss of Pay' : ''}`,
          },
          ...prev.auditLogs,
        ],
      }));
    } catch (err) {
      console.error('Failed to approve leave', err);
      alert('Failed to approve leave');
    } finally {
      setIsSaving(false);
    }
    setProbationBlockModal(null);
  };

  const handleApproveAllPending = async () => {
    const pendingLeaves = state.leaves.filter((l) => l.status === 'Pending');
    if (pendingLeaves.length === 0) return;
    
    setIsSaving(true);
    try {
      await api.attendance.bulkUpdateLeaveStatus({
        leaveIds: pendingLeaves.map((l) => l.id),
        status: 'Approved',
        approvedBy: state.currentPersona.name,
      });

      onUpdateState((prev) => ({
        ...prev,
        leaves: prev.leaves.map((l) => {
          if (l.status !== 'Pending') return l;
          const emp = prev.employees.find((e) => e.id === l.employeeId || (e.name && e.name.toLowerCase() === l.employeeName.toLowerCase()));
          const inProbation = isEmployeeInProbation(emp, prev.customOptions?.probationSettings);
          const isPaid = isPaidLeaveType(l.leaveType, l.isPaid);
          if (inProbation && isPaid) {
            return {
              ...l,
              leaveType: 'Loss of Pay',
              isPaid: false,
              status: 'Approved',
              approvedBy: `${state.currentPersona.name} (Approved as LOP - Probation Policy)`,
            };
          }
          return { ...l, status: 'Approved', approvedBy: state.currentPersona.name };
        }),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'APPROVED_ALL_LEAVES',
            entity: 'LeaveRequest',
            entityId: 'ALL_PENDING',
            ipAddress: '106.51.72.18',
            details: 'Approved pending leave requests (probation converted to LOP per policy)',
          },
          ...prev.auditLogs,
        ],
      }));
    } catch (err) {
      console.error('Failed to approve all leaves', err);
      alert('Failed to approve all pending leaves');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelLeave = async (id: string) => {
    setIsSaving(true);
    try {
      await api.attendance.deleteLeave(id);
      
      onUpdateState((prev) => ({
        ...prev,
        leaves: prev.leaves.filter((l) => l.id !== id),
      }));
    } catch (err) {
      console.error('Failed to cancel leave', err);
      alert('Failed to cancel leave');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveReason.trim()) return;

    // Resolve target employee:
    // HR/Admin can log for anyone. Manager can log for self or direct reports. Employee can only log for self.
    const targetEmp = isSuperAdmin || isHR
      ? (state.employees.find((e) => e.id === selectedLeaveEmpId || e.employeeId === selectedLeaveEmpId) || state.employees.find((e) => e.id === state.currentPersona.id) || state.employees[0])
      : isManagerUser
      ? (selectedLeaveEmpId && selectedLeaveEmpId !== state.currentPersona.id
          ? (managerDirectReports.find((e) => e.id === selectedLeaveEmpId || e.employeeId === selectedLeaveEmpId) || state.employees.find((e) => e.id === state.currentPersona.id))
          : (state.employees.find((e) => e.id === state.currentPersona.id || e.employeeId === state.currentPersona.id)))
      : state.employees.find((e) => e.id === state.currentPersona.id || e.employeeId === state.currentPersona.id) || {
          id: state.currentPersona.id,
          employeeId: state.currentPersona.id,
          name: state.currentPersona.name,
          department: state.currentPersona.department,
          avatar: state.currentPersona.avatar,
        };

    const resolvedEmp = targetEmp || {
      id: state.currentPersona.id,
      employeeId: state.currentPersona.id,
      name: state.currentPersona.name,
      department: state.currentPersona.department,
      avatar: state.currentPersona.avatar,
    };

    const inProbation = isEmployeeInProbation(resolvedEmp as any, state.customOptions?.probationSettings);
    const isPaid = isPaidLeaveType(leaveType);
    const finalLeaveType = inProbation && isPaid ? 'Loss of Pay' : leaveType;
    const finalIsPaid = inProbation && isPaid ? false : isPaid;

    const finalStartDate = dayMode === 'multi' ? startDate : singleDate;
    const finalEndDate = dayMode === 'multi' ? endDate : singleDate;
    const reasonPrefix = dayMode === 'half' ? `[${halfSession}] ` : '';
    const finalReason = `${reasonPrefix}${leaveReason.trim()}`;

    const mappedLeaveType = (finalLeaveType.toLowerCase().includes('sick')
      ? 'sick'
      : finalLeaveType.toLowerCase().includes('earned')
      ? 'earned'
      : finalLeaveType.toLowerCase().includes('unpaid') || finalLeaveType.toLowerCase().includes('loss')
      ? 'unpaid'
      : finalLeaveType.toLowerCase().includes('home') || finalLeaveType.toLowerCase().includes('wfh')
      ? 'wfh'
      : 'casual') as any;

    setIsSaving(true);
    try {
      const targetEmpId = (targetEmp as any).id || (targetEmp as any).employeeId || state.currentPersona.id;
      const leaveRes = await api.attendance.requestLeave({
        employeeId: targetEmpId,
        leaveType: mappedLeaveType,
        startDate: finalStartDate,
        endDate: finalEndDate,
        daysCount: computedLeaveDays,
        reason: inProbation && isPaid 
          ? `[Probation LOP] ${leaveHandover ? `${finalReason} (Covered by: ${leaveHandover})` : finalReason}`
          : leaveHandover ? `${finalReason} (Covered by: ${leaveHandover})` : finalReason,
      });

      if (!leaveRes.success) {
        alert(`Could not submit leave request to backend: ${leaveRes.error?.message || 'Request failed'}`);
        setIsSaving(false);
        return;
      }

    const newLeave: LeaveRequest = {
      id: leaveRes.data?.id || `lve_${Date.now()}`,
      employeeId: targetEmpId,
      employeeName: targetEmp.name,
      department: (targetEmp.department as any) || 'Development',
      leaveType: finalLeaveType,
      startDate: finalStartDate,
      endDate: finalEndDate,
      daysCount: computedLeaveDays,
      reason: inProbation && isPaid 
        ? `[Probation LOP] ${leaveHandover ? `${finalReason} (Covered by: ${leaveHandover})` : finalReason}`
        : leaveHandover ? `${finalReason} (Covered by: ${leaveHandover})` : finalReason,
      status: 'Pending',
      appliedOn: new Date().toISOString().split('T')[0],
      isPaid: finalIsPaid,
      isProbationLeave: inProbation,
    };

    onUpdateState((prev) => ({
      ...prev,
      leaves: [newLeave, ...prev.leaves],
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: state.currentPersona.name,
          action: !isUserView ? 'LOGGED_LEAVE_FOR_EMPLOYEE' : 'APPLIED_LEAVE',
          entity: 'LeaveRequest',
          entityId: newLeave.id,
          ipAddress: '106.51.72.18',
          details: `${!isUserView ? `Logged leave for ${targetEmp.name}` : 'Applied for leave'}: ${computedLeaveDays} day(s) of ${leaveType}`,
        },
        ...prev.auditLogs,
      ],
      notifications: [
        {
          id: `notif_${Date.now()}`,
          title: 'New Leave Request Submitted',
          message: `${newLeave.employeeName} submitted a ${newLeave.leaveType} request for ${newLeave.daysCount} day(s) (${newLeave.startDate}).`,
          timestamp: 'Just now',
          category: 'Approvals' as const,
          priority: 'high' as const,
          read: false,
          linkModule: 'attendance',
          linkTab: 'leaves',
          actorName: newLeave.employeeName,
          actionLabel: 'Review Request',
        },
        ...prev.notifications,
      ],
    }));

      setShowApplyLeaveModal(false);
      setLeaveReason('');
      setLeaveHandover('');
      setLeaveAttachment('');
    } catch (err) {
      console.error('Failed to submit leave request', err);
      alert('Failed to submit leave request');
    } finally {
      setIsSaving(false);
    }
  };
  const [teamAttendanceDate, setTeamAttendanceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [teamTabFilter, setTeamTabFilter] = useState<'All' | 'Checked In' | 'Late' | 'Not Checked In' | 'Hourly'>('All');
  const [teamStatusFilter, setTeamStatusFilter] = useState<'all' | 'on_time' | 'late' | 'not_in_yet' | 'time_off'>('all');
  const [teamBatchFilter, setTeamBatchFilter] = useState<string>('All');
  const [teamGroupByBatch, setTeamGroupByBatch] = useState<boolean>(true);
  const [teamSearchQuery, setTeamSearchQuery] = useState('');
  const [teamSortField, setTeamSortField] = useState<'employee' | 'roles' | 'batch' | 'firstPunch' | 'lastPunch' | 'workingHours' | 'breakHours' | 'status' | 'attendanceRate'>('employee');
  const [teamSortDirection, setTeamSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleToggleSort = (field: 'employee' | 'roles' | 'batch' | 'firstPunch' | 'lastPunch' | 'workingHours' | 'breakHours' | 'status' | 'attendanceRate') => {
    if (teamSortField === field) {
      setTeamSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setTeamSortField(field);
      setTeamSortDirection('asc');
    }
  };

  const uniqueBatches = useMemo(() => {
    const set = new Set<string>();
    teamMembers.forEach((m) => {
      if (m.designation) set.add(m.designation);
    });
    return Array.from(set).sort();
  }, [teamMembers]);

  // Aggregate attendance status for each team member on teamAttendanceDate
  const teamAttendanceStats = useMemo(() => {
    const totalEmployees = teamMembers.length;
    let currentlyWorking = 0;
    let onTime = 0;
    let late = 0;
    let onBreak = 0;
    let timeOff = 0;
    let notInYet = 0;

    const todayIso = new Date().toISOString().split('T')[0];

    const enrichedRecords = teamMembers.map((emp) => {
      const att = findAttendanceForEmployee(
        state.attendance,
        emp,
        teamAttendanceDate,
        todayIso
      );

      // Check if on leave (ID match only)
      const leave = (state.leaves || []).find(
        (l) =>
          (l.employeeId === emp.id ||
            (!!emp.employeeId && l.employeeId === emp.employeeId)) &&
          l.status === 'Approved'
      );

      const isCheckedIn = !!att?.checkIn;
      const isCheckedOut = !!att?.checkOut;

      let statusType: TeamStatusType = 'not_in_yet';

      // Detect if working hourly
      const isHourlyWorker = emp.salaryType === 'hourly' || emp.shiftTiming?.isHourlyShift;
      const hourlyRate = emp.hourlyRate || emp.shiftTiming?.hourlyRate || 650;

      if (leave || att?.status === 'On Leave') {
        statusType = 'time_off';
        timeOff++;
      } else if (att?.status === 'Absent') {
        statusType = 'not_in_yet';
        notInYet++;
      } else if (isCheckedIn && isCheckedOut) {
        statusType = 'logged_out';
        if (att?.status === 'Late' && !isHourlyWorker) {
          late++;
        } else {
          onTime++;
        }
      } else if (isCheckedIn) {
        currentlyWorking++;
        // Hourly workers operate on flexible hours and are not penalized as Late
        if (att?.status === 'Late' && !isHourlyWorker) {
          statusType = 'late';
          late++;
        } else {
          statusType = 'on_time';
          onTime++;
        }
      } else {
        statusType = 'not_in_yet';
        notInYet++;
      }

      // Format first punch and last punch
      const firstPunch = att?.checkIn ? att.checkIn.replace(/\s*\(GMT[^\)]*\)/gi, '').trim() : '--:--';
      const lastPunch = att?.checkOut
        ? att.checkOut.replace(/\s*\(GMT[^\)]*\)/gi, '').trim()
        : isCheckedIn
          ? '--:--'
          : '-';
      const workingHours = typeof att?.workingHours === 'number' ? att.workingHours : 0;
      const hoursFormatted = isCheckedIn
        ? `${String(Math.floor(workingHours)).padStart(2, '0')}h ${String(Math.round((workingHours % 1) * 60)).padStart(2, '0')}m`
        : '-';
      const breakHours =
        typeof att?.breakHours === 'number' && att.breakHours > 0
          ? `${String(Math.floor(att.breakHours)).padStart(2, '0')}h ${String(Math.round((att.breakHours % 1) * 60)).padStart(2, '0')}m`
          : '-';
      const regularHours = isHourlyWorker ? Math.min(workingHours, 8) : workingHours;
      const overtimeHours = isHourlyWorker
        ? Math.max(0, Number((workingHours - 8).toFixed(1)))
        : workingHours > 8.5
          ? Number((workingHours - 8).toFixed(1))
          : 0;
      const overtimeFormatted =
        overtimeHours > 0
          ? `${String(Math.floor(overtimeHours)).padStart(2, '0')}h ${String(Math.round((overtimeHours % 1) * 60)).padStart(2, '0')}m`
          : '-';
      const earnedToday = isHourlyWorker
        ? Math.round(regularHours * hourlyRate + overtimeHours * hourlyRate * 1.5)
        : 0;
      const isWarning = isCheckedIn && workingHours > 0 && workingHours < 4 && !isHourlyWorker;

      // Cumulative student attendance rate (ID match only)
      const studentLogs = isStudentMode
        ? state.attendance.filter(
            (a) => a.employeeId === emp.id || (!!emp.employeeId && a.employeeId === emp.employeeId)
          )
        : [];

      // Check if today's date is already recorded in studentLogs
      const hasTodayLog = studentLogs.some((l) => l.date === teamAttendanceDate);
      let totalDays = studentLogs.length;
      let attendedDays = studentLogs.filter((l) => l.status === 'Present' || l.status === 'Late').length;

      if (!hasTodayLog) {
        totalDays += 1;
        if (
          isCheckedIn &&
          (att?.status === 'Present' ||
            att?.status === 'Late' ||
            statusType === 'on_time' ||
            statusType === 'late' ||
            statusType === 'logged_out')
        ) {
          attendedDays += 1;
        }
      }

      const cumulativeAttendanceRate =
        totalDays > 0 ? Math.round((attendedDays / totalDays) * 100) : isCheckedIn ? 100 : 0;
      const minThreshold = state.customOptions?.academicSettings?.minimumAttendanceThreshold ?? 75;
      const isBelowThreshold =
        isStudentMode &&
        (state.customOptions?.academicSettings?.enableLowAttendanceWarning ?? true) &&
        cumulativeAttendanceRate < minThreshold;

      const shiftName = isHourlyWorker
        ? 'Hourly / Flexible'
        : emp.shiftTiming?.shiftName || 'Unassigned';
      const shiftKind = isHourlyWorker
        ? 'Hourly'
        : !emp.shiftTiming?.shiftName
          ? null
          : emp.shiftTiming.startTime === 'Flexible' || emp.shiftTiming.endTime === 'Flexible'
            ? 'Flexible'
            : 'Fixed';

      const geoLabel = resolveTeamGeoLabel(att);

      return {
        emp,
        att,
        statusType,
        firstPunch,
        lastPunch,
        workingHours,
        hoursFormatted,
        breakHours,
        regularHours,
        overtimeHours,
        overtimeFormatted,
        isWarning,
        shift: shiftName,
        shiftKind,
        geoLabel,
        isHourlyWorker,
        hourlyRate,
        earnedToday,
        cumulativeAttendanceRate,
        isBelowThreshold,
        totalHistoricalDays: totalDays,
        attendedHistoricalDays: attendedDays,
      };
    });

    const hourlyCount = teamMembers.filter(
      (e) => e.salaryType === 'hourly' || e.shiftTiming?.isHourlyShift
    ).length;

    return {
      totalEmployees,
      currentlyWorking,
      onTime,
      late,
      onBreak,
      timeOff,
      notInYet,
      hourlyCount,
      enrichedRecords,
    };
  }, [teamMembers, state.attendance, state.leaves, teamAttendanceDate, isStudentMode, state.customOptions?.academicSettings]);

  const teamOverviewChartData = useMemo(() => {
    const months: { label: string; present: number; onLeave: number; absent: number }[] = [];
    const now = new Date();
    const currentY = now.getFullYear();
    const currentM = now.getMonth();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const label = d.toLocaleString('en-US', { month: 'short' });
      let present = 0;
      let onLeave = 0;
      let absent = 0;
      state.attendance.forEach((a) => {
        const ad = new Date(a.date);
        if (ad.getFullYear() !== y || ad.getMonth() !== m) return;
        const st = String(a.status || '').toLowerCase();
        if (st.includes('leave')) onLeave += 1;
        else if (st.includes('absent')) absent += 1;
        else if (a.checkIn || st.includes('present') || st.includes('late') || st.includes('wfh')) {
          present += 1;
        } else absent += 1;
      });
      // Only seed the current month when history is sparse — avoid painting every empty month as 100% absent
      if (present + onLeave + absent === 0 && y === currentY && m === currentM) {
        const total = Math.max(1, teamAttendanceStats.totalEmployees);
        present = Math.max(0, total - teamAttendanceStats.timeOff - teamAttendanceStats.notInYet);
        onLeave = teamAttendanceStats.timeOff;
        absent = teamAttendanceStats.notInYet;
      }
      months.push({ label, present, onLeave, absent });
    }
    return months;
  }, [
    state.attendance,
    teamAttendanceStats.totalEmployees,
    teamAttendanceStats.timeOff,
    teamAttendanceStats.notInYet,
  ]);

  const filteredTeamRecords = useMemo(() => {
    const list = teamAttendanceStats.enrichedRecords.filter((rec) => {
      // Batch Filter
      if (teamBatchFilter !== 'All' && rec.emp.designation !== teamBatchFilter) {
        return false;
      }

      // Tab Filter: All, Checked In, Late, Not Checked In, Hourly
      if (teamTabFilter === 'Checked In') {
        if (
          rec.statusType !== 'on_time' &&
          rec.statusType !== 'late' &&
          rec.statusType !== 'logged_out'
        ) {
          return false;
        }
      } else if (teamTabFilter === 'Late') {
        if (rec.statusType !== 'late' && !(rec.statusType === 'logged_out' && rec.att?.status === 'Late')) {
          return false;
        }
      } else if (teamTabFilter === 'Not Checked In') {
        if (rec.statusType !== 'not_in_yet') return false;
      } else if (teamTabFilter === 'Hourly') {
        if (!rec.isHourlyWorker) return false;
      }

      // Status Filter
      if (teamStatusFilter === 'on_time') {
        if (rec.statusType !== 'on_time' && rec.statusType !== 'logged_out') return false;
        if (rec.statusType === 'logged_out' && rec.att?.status === 'Late') return false;
      } else if (teamStatusFilter === 'late') {
        if (rec.statusType !== 'late' && !(rec.statusType === 'logged_out' && rec.att?.status === 'Late')) {
          return false;
        }
      } else if (teamStatusFilter === 'not_in_yet') {
        if (rec.statusType !== 'not_in_yet') return false;
      } else if (teamStatusFilter === 'time_off') {
        if (rec.statusType !== 'time_off') return false;
      }

      // Search Query
      if (teamSearchQuery.trim()) {
        const q = teamSearchQuery.toLowerCase();
        return (
          rec.emp.name.toLowerCase().includes(q) ||
          (rec.emp.designation && rec.emp.designation.toLowerCase().includes(q)) ||
          (rec.emp.employeeId && rec.emp.employeeId.toLowerCase().includes(q))
        );
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (teamSortField) {
        case 'employee':
          cmp = a.emp.name.localeCompare(b.emp.name);
          break;
        case 'roles':
        case 'batch':
          cmp = (a.emp.designation || '').localeCompare(b.emp.designation || '');
          break;
        case 'attendanceRate':
          cmp = (a.cumulativeAttendanceRate || 100) - (b.cumulativeAttendanceRate || 100);
          break;
        case 'firstPunch':
          cmp = (a.firstPunch || '').localeCompare(b.firstPunch || '');
          break;
        case 'lastPunch':
          cmp = (a.lastPunch || '').localeCompare(b.lastPunch || '');
          break;
        case 'workingHours':
          cmp = (a.workingHours || 0) - (b.workingHours || 0);
          break;
        case 'breakHours':
          cmp = (a.att?.breakHours || 0) - (b.att?.breakHours || 0);
          break;
        case 'status':
          cmp = a.statusType.localeCompare(b.statusType);
          break;
        default:
          cmp = 0;
      }
      return teamSortDirection === 'asc' ? cmp : -cmp;
    });
  }, [teamAttendanceStats.enrichedRecords, teamBatchFilter, teamTabFilter, teamStatusFilter, teamSearchQuery, teamSortField, teamSortDirection]);

  const groupedBatches = useMemo(() => {
    const groups: {
      batchName: string;
      records: typeof filteredTeamRecords;
      totalEnrolled: number;
      activeCount: number;
      lateCount: number;
      absentCount: number;
      rate: number;
    }[] = [];

    const batchMap = new Map<string, typeof filteredTeamRecords>();
    filteredTeamRecords.forEach((rec) => {
      const bName = rec.emp.designation || (isStudentMode ? 'Unassigned Batch' : 'General Shift');
      if (!batchMap.has(bName)) {
        batchMap.set(bName, []);
      }
      batchMap.get(bName)!.push(rec);
    });

    batchMap.forEach((records, batchName) => {
      const totalEnrolled = records.length;
      const activeCount = records.filter(
        (r) =>
          r.statusType === 'on_time' ||
          (r.statusType === 'logged_out' && r.att?.status !== 'Late')
      ).length;
      const lateCount = records.filter(
        (r) => r.statusType === 'late' || (r.statusType === 'logged_out' && r.att?.status === 'Late')
      ).length;
      const absentCount = records.filter((r) => r.statusType === 'not_in_yet' || r.statusType === 'time_off').length;
      const rate = totalEnrolled > 0 ? Math.round(((activeCount + lateCount) / totalEnrolled) * 100) : 0;
      groups.push({
        batchName,
        records,
        totalEnrolled,
        activeCount,
        lateCount,
        absentCount,
        rate,
      });
    });

    return groups.sort((a, b) => a.batchName.localeCompare(b.batchName));
  }, [filteredTeamRecords, isStudentMode]);

  const pendingRegCount = useMemo(() => {
    return (isSuperAdmin || isHR
      ? state.regularizations
      : state.regularizations.filter(
          (r) =>
            r.employeeId === state.currentPersona.id ||
            accessibleEmpIds.has(r.employeeId) ||
            canApproveRegularization(state.currentPersona, r, state.employees)
        )
    ).filter((r) => r.status === 'Pending').length;
  }, [isSuperAdmin, isHR, state.regularizations, state.currentPersona, accessibleEmpIds, state.employees]);

  const handleApproveRegularization = async (regId: string, approved: boolean) => {
    const reg = state.regularizations.find((r) => r.id === regId);
    if (!reg) return;
    
    setIsSaving(true);
    try {
      await api.attendance.updateRegularizationStatus(regId, {
        status: approved ? 'Approved' : 'Rejected',
        approvedBy: state.currentPersona.name,
      });

      onUpdateState((prev) => ({
        ...prev,
        regularizations: prev.regularizations.map((r) =>
          r.id === regId
            ? { ...r, status: approved ? 'Approved' : 'Rejected', approvedBy: state.currentPersona.name }
            : r
        ),
      }));

      // Update actual attendance record if approved
      if (approved && reg) {
        onUpdateState((prev) => ({
          ...prev,
          attendance: prev.attendance.map((a) => {
            if (
              (a.employeeId === reg.employeeId || a.employeeName === reg.employeeName) &&
              a.date === reg.date
            ) {
              const u = { ...a };
              if (reg.requestedCheckIn) u.checkIn = reg.requestedCheckIn;
              if (reg.requestedCheckOut) u.checkOut = reg.requestedCheckOut;
              u.status = 'Present';
              u.workingHours = calculateWorkedHours(u.checkIn, u.checkOut || undefined);
              return u;
            }
            return a;
          }),
        }));
      }
    } catch (err) {
      console.error('Failed to update regularization status', err);
      alert('Failed to update regularization status');
    } finally {
      setIsSaving(false);
    }
  };

  // Hydration protection & Real-time Clock State
  const [isMounted, setIsMounted] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    setIsMounted(true);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Today's Record for Current Persona (matched to active date)
  const todayIsoStr = new Date().toISOString().split('T')[0];
  const myTodayRecord = state.attendance.find(
    (a) =>
      (a.employeeId === state.currentPersona.id ||
        (a.employeeName &&
          a.employeeName.toLowerCase() === state.currentPersona.name?.toLowerCase())) &&
      a.date === todayIsoStr
  );
  const isCheckedIn = !!myTodayRecord && !!myTodayRecord.checkIn;
  const isCheckedOut = isCheckedIn && !!myTodayRecord?.checkOut;
  const hasConfiguredOffice = useMemo(() => {
    const records = Array.isArray(state.customOptions?.officeRecords)
      ? state.customOptions.officeRecords
      : [];
    if (records.some((r) => hasValidOfficeCoordinates(r))) return true;
    const customOffices = Array.isArray(state.customOptions?.offices)
      ? state.customOptions.offices.filter(
          (o) => o && o.trim() !== '' && o !== 'Corporate Headquarters' && o !== 'Office Location'
        )
      : [];
    const orgAddress = state.organization?.officeLocation?.address?.trim() || '';
    const hasOrgOffice =
      orgAddress !== '' &&
      orgAddress !== 'Corporate Headquarters' &&
      orgAddress !== 'Office Location' &&
      hasValidOfficeCoordinates(state.organization?.officeLocation);
    return customOffices.length > 0 || hasOrgOffice;
  }, [state.customOptions?.offices, state.customOptions?.officeRecords, state.organization?.officeLocation]);

  /** Real office GPS — resolved per selected office after officeRecords are built. */
  const isAttendanceConfigured = hasConfiguredOffice && (state.customOptions?.attendanceSettings?.isConfigured ?? true);

  // Dynamically resolve shift/batch for current logged-in user or student
  const userShiftTiming = useMemo(() => {
    // 1. Direct persona shift timing
    if ((state.currentPersona as any)?.shiftTiming?.startTime) {
      return (state.currentPersona as any).shiftTiming;
    }
    // 2. Employee record matching persona
    const currentEmp = state.employees?.find(
      (e) => e.id === state.currentPersona.id || (e.email && e.email.toLowerCase() === state.currentPersona.email.toLowerCase())
    );
    if (currentEmp?.salaryType === 'hourly' || currentEmp?.shiftTiming?.isHourlyShift) {
      return {
        shiftId: 'sh-hourly',
        shiftName: 'Hourly / Flexible Shift',
        startTime: 'Flexible',
        endTime: 'Flexible',
        graceMinutes: 0,
        isHourlyShift: true,
        hourlyRate: currentEmp.hourlyRate || 650,
      };
    }
    if (currentEmp?.shiftTiming?.startTime) {
      return currentEmp.shiftTiming;
    }
    // 3. Student record matching persona
    if (isStudentMode) {
      const currentStud = state.students?.find(
        (s) =>
          s.id === state.currentPersona.id ||
          s.studentId === state.currentPersona.id ||
          (s.email && s.email.toLowerCase() === state.currentPersona.email.toLowerCase()) ||
          (s.name && s.name.toLowerCase() === state.currentPersona.name.toLowerCase())
      );
      if (currentStud?.shiftTiming?.startTime) {
        return currentStud.shiftTiming;
      }
      // Check if student's grade matches an academicBatch in state.customOptions.academicBatches
      const matchedBatch = state.customOptions?.academicBatches?.find(
        (b) =>
          currentStud?.grade &&
          (b.grade.toLowerCase() === currentStud.grade.toLowerCase() ||
            currentStud.grade.toLowerCase().includes(b.grade.toLowerCase()))
      );
      if (matchedBatch?.startTime) {
        return {
          startTime: matchedBatch.startTime,
          endTime: matchedBatch.endTime,
          shiftName: `${matchedBatch.grade} ${matchedBatch.section}`,
        };
      }
    }
    return null;
  }, [state.currentPersona, state.employees, state.students, isStudentMode, state.customOptions?.academicBatches]);

  // Dynamic Settings from Store / User Shift
  const isUserHourlyWorker = userShiftTiming?.isHourlyShift ?? false;
  const userHourlyRate = userShiftTiming?.hourlyRate || 650;

  const configuredShiftStart =
    userShiftTiming?.startTime ||
    state.customOptions?.attendanceSettings?.workDayStartTime ||
    state.customOptions?.attendancePolicies?.workDayStartTime ||
    (isStudentMode ? '08:30 AM' : '09:00 AM');

  const configuredShiftEnd =
    userShiftTiming?.endTime ||
    state.customOptions?.attendanceSettings?.workDayEndTime ||
    state.customOptions?.attendancePolicies?.workDayEndTime ||
    (isStudentMode ? '03:30 PM' : '06:00 PM');

  const activeShiftName =
    userShiftTiming?.shiftName ||
    (isStudentMode ? (state.currentPersona.designation || 'Class Today') : 'General Shift');

  const officeRecords = useMemo(() => {
    const records = Array.isArray(state.customOptions?.officeRecords)
      ? state.customOptions.officeRecords
      : [];
    if (records.length > 0) return records;
    // Fallback: synthesize from name list + primary org location
    const names = Array.isArray(state.customOptions?.offices) ? state.customOptions.offices : [];
    const primary = state.organization?.officeLocation;
    return names
      .filter(
        (o) =>
          o &&
          typeof o === 'string' &&
          o.trim() !== '' &&
          o !== 'Global Headquarters' &&
          o !== 'Corporate Headquarters' &&
          o !== 'Office Location'
      )
      .map((name, idx) => ({
        id: `name:${name}`,
        name: name.trim(),
        address: primary?.address || name.trim(),
        latitude: idx === 0 && primary ? Number(primary.latitude) || 0 : 0,
        longitude: idx === 0 && primary ? Number(primary.longitude) || 0 : 0,
        radiusMeters: primary?.allowedRadiusMeters || 250,
      }));
  }, [state.customOptions?.officeRecords, state.customOptions?.offices, state.organization?.officeLocation]);

  const includeSaturday = state.customOptions?.attendanceSettings?.includeSaturdayInWorkHours ?? false;
  const workDaysInWeek = includeSaturday ? 6 : 5;

  // Available offices: employee's assigned offices, else all org offices
  const availableOffices = useMemo(() => {
    const allNames = officeRecords
      .map((o) => o.name?.trim())
      .filter(
        (o) =>
          o &&
          o !== 'Global Headquarters' &&
          o !== 'Corporate Headquarters' &&
          o !== 'Office Location'
      ) as string[];

    const persona = state.currentPersona as any;
    const emp =
      state.employees?.find((e) => e.id === persona?.id || e.employeeId === persona?.employeeId) ||
      null;

    const assignedNames: string[] = [];
    if (emp?.offices && emp.offices.length > 0) {
      for (const o of emp.offices) {
        if (o?.name?.trim()) assignedNames.push(o.name.trim());
      }
    } else if (emp?.officeIds && emp.officeIds.length > 0) {
      for (const oid of emp.officeIds) {
        const rec = officeRecords.find((r) => r.id === oid);
        if (rec?.name) assignedNames.push(rec.name);
      }
    } else if (emp?.officeName || emp?.location) {
      const n = String(emp.officeName || emp.location).trim();
      if (n) assignedNames.push(n);
    } else if (persona?.officeName || persona?.location) {
      const n = String(persona.officeName || persona.location).trim();
      if (n) assignedNames.push(n);
    }

    if (assignedNames.length > 0) {
      const filtered = allNames.filter((n) =>
        assignedNames.some((a) => a.toLowerCase() === n.toLowerCase())
      );
      if (filtered.length > 0) return Array.from(new Set(filtered));
    }

    if (allNames.length > 0) return Array.from(new Set(allNames));

    const orgAddress = state.organization?.officeLocation?.address?.trim() || '';
    if (
      orgAddress !== '' &&
      orgAddress !== 'Global Headquarters' &&
      orgAddress !== 'Corporate Headquarters' &&
      orgAddress !== 'Office Location' &&
      hasValidOfficeCoordinates(state.organization?.officeLocation)
    ) {
      return [orgAddress];
    }
    return [];
  }, [
    officeRecords,
    state.currentPersona,
    state.employees,
    state.organization?.officeLocation,
  ]);

  // Selected Location (office name or 'wfh')
  const [selectedLocation, setSelectedLocation] = useState<string>(() => {
    if (state.customOptions?.offices && state.customOptions.offices.length > 0) {
      return state.customOptions.offices[0];
    }
    const orgAddress = state.organization?.officeLocation?.address?.trim() || '';
    if (orgAddress && orgAddress !== 'Corporate Headquarters' && orgAddress !== 'Office Location') {
      return orgAddress;
    }
    return '';
  });

  useEffect(() => {
    if (selectedLocation === 'wfh') {
      return;
    }
    if (availableOffices.length > 0 && (!selectedLocation || selectedLocation === 'office' || !availableOffices.includes(selectedLocation))) {
      setSelectedLocation(availableOffices[0]);
    } else if (availableOffices.length === 0) {
      setSelectedLocation('');
    }
  }, [availableOffices, selectedLocation]);

  const selectedOfficeRecord = useMemo(() => {
    if (!selectedLocation || selectedLocation === 'wfh') return null;
    return (
      officeRecords.find((o) => o.name?.trim().toLowerCase() === selectedLocation.trim().toLowerCase()) ||
      null
    );
  }, [officeRecords, selectedLocation]);

  const configuredGeofenceRadius = Math.min(
    1000,
    selectedOfficeRecord?.radiusMeters ||
      state.organization?.officeLocation?.allowedRadiusMeters ||
      state.customOptions?.attendanceSettings?.geofenceRadiusMeters ||
      state.customOptions?.attendancePolicies?.geofenceRadiusMeters ||
      250
  );

  const isGeofenceOptional = useMemo(() => {
    const attSettings = (state.customOptions?.attendanceSettings || {}) as any;
    const attPolicies = (state.customOptions?.attendancePolicies || {}) as any;

    if (attSettings?.requireLocationGPS === false || attPolicies?.requireLocationGPS === false) return true;
    if (attSettings?.geofenceEnabled === false || attPolicies?.geofenceEnabled === false) return true;
    if (attSettings?.requireGPS === false || attPolicies?.requireGPS === false) return true;
    if (attSettings?.geofencePolicy === 'Optional' || attSettings?.geofencePolicy === 'Disabled') return true;
    if (attSettings?.outOfRadiusAction === 'Allow') return true;

    // Per-selected-office policy (not "any Inactive disables all")
    if (selectedOfficeRecord) {
      const officePolicies = Array.isArray(attSettings?.officeGeofencePolicies)
        ? attSettings.officeGeofencePolicies
        : [];
      const match = officePolicies.find(
        (o: any) =>
          o &&
          typeof o === 'object' &&
          (o.id === selectedOfficeRecord.id ||
            String(o.name || '').trim().toLowerCase() === selectedOfficeRecord.name.trim().toLowerCase())
      );
      if (match && (match.geofencingStatus === 'Inactive' || match.geofencingStatus === 'Optional')) {
        return true;
      }
      const officeGeoStatus = (selectedOfficeRecord as { geofencingStatus?: string }).geofencingStatus;
      if (officeGeoStatus === 'Inactive' || officeGeoStatus === 'Optional') {
        return true;
      }
    }

    return false;
  }, [state.customOptions, selectedOfficeRecord]);

  const hasConfiguredOfficeCoords = useMemo(() => {
    if (selectedOfficeRecord) {
      return hasValidOfficeCoordinates(selectedOfficeRecord);
    }
    return hasValidOfficeCoordinates(state.organization?.officeLocation);
  }, [selectedOfficeRecord, state.organization?.officeLocation]);

  const activeOfficeDisplayName = useMemo(() => {
    if (selectedLocation === 'wfh') return isStudentMode ? 'Remote Study (Home)' : 'Remote (Home Office)';
    if (selectedLocation && selectedLocation !== 'office' && selectedLocation !== '') return selectedLocation;
    return availableOffices[0] || (hasConfiguredOffice ? (state.organization?.officeLocation?.address || (isStudentMode ? 'Campus Wing' : 'Primary Office')) : (isStudentMode ? 'No Campus Setup' : 'No Office Setup'));
  }, [isStudentMode, selectedLocation, availableOffices, hasConfiguredOffice, state.organization?.officeLocation?.address]);

  const activeOfficeLat = hasConfiguredOfficeCoords
    ? Number(selectedOfficeRecord?.latitude ?? state.organization?.officeLocation?.latitude ?? 0)
    : 0;
  const activeOfficeLng = hasConfiguredOfficeCoords
    ? Number(selectedOfficeRecord?.longitude ?? state.organization?.officeLocation?.longitude ?? 0)
    : 0;

  const selectedOfficeIdForPunch =
    selectedOfficeRecord && !String(selectedOfficeRecord.id).startsWith('name:')
      ? selectedOfficeRecord.id
      : undefined;

  // Break & Shift States
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakType, setBreakType] = useState<'Lunch' | 'Tea' | 'General'>('Lunch');
  const [breakSeconds, setBreakSeconds] = useState(1800); // 30m

  // GPS & Geofencing States
  const [isPingingGps, setIsPingingGps] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(3.2);
  const [geofenceDistanceMeters, setGeofenceDistanceMeters] = useState(38);
  const [pingToast, setPingToast] = useState<string | null>(null);

  // Clock Out Modal State
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [clockOutNotes, setClockOutNotes] = useState('');

  // Confirm Punch Location Modal State (map → camera, or geofence warning)
  const [showPunchLocationModal, setShowPunchLocationModal] = useState(false);
  const [punchStep, setPunchStep] = useState<'map' | 'confirm_out_radius'>('map');
  const [punchAddress, setPunchAddress] = useState('Acquiring device GPS location...');
  const [currentLat, setCurrentLat] = useState(activeOfficeLat);
  const [currentLng, setCurrentLng] = useState(activeOfficeLng);
  const [isLocating, setIsLocating] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'locating' | 'granted' | 'denied'>('locating');
  const [hasDeviceGpsLocation, setHasDeviceGpsLocation] = useState(false);
  const [isInsideRadius, setIsInsideRadius] = useState(true);
  const [simulatedDistance, setSimulatedDistance] = useState(0);
  const [mapZoom, setMapZoom] = useState(1);

  // Selfie Camera Modal State
  const [showSelfieModal, setShowSelfieModal] = useState(false);
  const [selfieAsRemote, setSelfieAsRemote] = useState(false);
  const [capturedSelfie, setCapturedSelfie] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [isFlashing, setIsFlashing] = useState(false);
  const [selectedAttendancePhotoRecord, setSelectedAttendancePhotoRecord] = useState<AttendanceRecord | null>(null);
  const [editingAttendanceRecord, setEditingAttendanceRecord] = useState<AttendanceRecord | null>(null);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editWorkingHours, setEditWorkingHours] = useState(8);
  const [editStatus, setEditStatus] = useState<AttendanceRecord['status']>('Present');

  // Time parsing and duration helpers
  const parseTimeToMin = (timeStr: string): number | null => {
    if (!timeStr) return null;
    const clean = timeStr.replace(/\s*\(GMT[^\)]*\)/gi, '').trim();
    const match = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return null;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const mer = match[4]?.toUpperCase();
    if (mer === 'PM' && h < 12) h += 12;
    if (mer === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };

  const calcHours = (inStr: string, outStr: string): number => {
    const inM = parseTimeToMin(inStr);
    const outM = parseTimeToMin(outStr);
    if (inM === null || outM === null) return 0;
    let diff = outM - inM;
    if (diff < 0) diff += 24 * 60;
    return parseFloat((diff / 60).toFixed(2));
  };

  const handleTimeChange = (newIn: string, newOut: string) => {
    setEditCheckIn(newIn);
    setEditCheckOut(newOut);
    if (newIn && newOut) {
      const calculated = calcHours(newIn, newOut);
      setEditWorkingHours(calculated);
      // Automatically adjust status if currently Absent or default
      if (editStatus === 'Absent' || editStatus === 'Present' || editStatus === 'Half Day') {
        if (calculated >= 7.5) {
          setEditStatus('Present');
        } else if (calculated >= 3.5) {
          setEditStatus('Half Day');
        } else if (calculated > 0) {
          setEditStatus('Present');
        }
      }
    }
  };

  const cleanTimeString = (val?: string): string => {
    if (!val) return '';
    const match = val.match(/^(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i);
    return match ? match[1].trim() : val.replace(/[^0-9:a-zA-Z\s]/g, '').trim();
  };

  const handleOpenEditAttendance = (att: AttendanceRecord) => {
    setEditingAttendanceRecord(att);
    const rawIn = att.checkIn ? att.checkIn.replace(/\s*\(GMT[^\)]*\)/gi, '').trim() : '';
    const rawOut = att.checkOut ? att.checkOut.replace(/\s*\(GMT[^\)]*\)/gi, '').trim() : '';
    const cleanedIn = cleanTimeString(rawIn);
    const cleanedOut = cleanTimeString(rawOut);
    setEditCheckIn(cleanedIn);
    setEditCheckOut(cleanedOut);
    const hours = (cleanedIn && cleanedOut) ? calcHours(cleanedIn, cleanedOut) : (att.workingHours || 0);
    setEditWorkingHours(hours);
    if (cleanedIn) {
      setEditStatus(att.status && att.status !== 'Absent' ? att.status : (hours >= 7.5 ? 'Present' : hours >= 4 ? 'Half Day' : 'Present'));
    } else {
      setEditStatus(att.status || 'Absent');
    }
  };

  const handleSaveAttendanceRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAttendanceRecord) return;

    setIsSaving(true);
    try {
      const payload = {
        employeeId: editingAttendanceRecord.employeeId,
        date: editingAttendanceRecord.date,
        checkIn: editCheckIn,
        checkOut: editCheckOut.trim() || undefined,
        status: editStatus,
        workingHours: Number(editWorkingHours) || 8,
        breakHours: editingAttendanceRecord.breakHours || 0,
        notes: (editingAttendanceRecord as any).notes,
      };

      await api.attendance.updateAttendanceRecord(editingAttendanceRecord.id, payload);

      onUpdateState((prev) => ({
        ...prev,
        attendance: prev.attendance.map((a) =>
          a.id === editingAttendanceRecord.id
            ? { ...a, ...payload }
            : a
        ),
        tasks: editCheckOut.trim()
          ? prev.tasks.map((t) => {
              const isEmp =
                t.assigneeId === editingAttendanceRecord.employeeId ||
                (t.assigneeName && t.assigneeName.toLowerCase() === editingAttendanceRecord.employeeName.toLowerCase());
              if (isEmp && t.status === 'In Progress') {
                return {
                  ...t,
                  status: 'To Do' as const,
                  isTimerRunning: false,
                  timerStartedAt: undefined,
                };
              }
              return t;
            })
          : prev.tasks,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'ATTENDANCE_EDITED_BY_HR',
            entity: 'AttendanceRecord',
            entityId: editingAttendanceRecord.id,
            ipAddress: '106.51.72.18',
            details: `Edited attendance times for ${editingAttendanceRecord.employeeName}: Check-In [${editCheckIn}], Check-Out [${editCheckOut || 'None'}], Hours [${editWorkingHours}h]`,
          },
          ...prev.auditLogs,
        ],
      }));
      setEditingAttendanceRecord(null);
      setPingToast(`Attendance updated for ${editingAttendanceRecord.employeeName}`);
      setTimeout(() => setPingToast(null), 3000);
    } catch (err) {
      console.error('Failed to update attendance record', err);
      alert('Failed to update attendance record');
    } finally {
      setIsSaving(false);
    }
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Regularization Modal State
  const [showRegModal, setShowRegModal] = useState(false);
  const [regDate, setRegDate] = useState(() => toLocalISODate());
  const [regInTime, setRegInTime] = useState(configuredShiftStart);
  const [regOutTime, setRegOutTime] = useState(configuredShiftEnd);
  const [regReason, setRegReason] = useState<AttendanceRegularization['reason']>('Client Visit');
  const [regRemarks, setRegRemarks] = useState('');

  const openRegModal = () => {
    setRegDate(toLocalISODate());
    setRegInTime(configuredShiftStart);
    setRegOutTime(configuredShiftEnd);
    setRegRemarks('');
    setShowRegModal(true);
  };

  // Table Filters
  const [dateRangeFilter, setDateRangeFilter] = useState('Current Month');
  const [recordFilter, setRecordFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(6);

  // Live Clock & Time Parsing Utilities
  const currentTimeFormatted = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const formatTimer = (totalSecs: number) => {
    const safeSecs = Math.max(0, Math.floor(totalSecs));
    const h = Math.floor(safeSecs / 3600);
    const m = Math.floor((safeSecs % 3600) / 60);
    const s = safeSecs % 60;
    return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  };

  // Helper to parse time strings (e.g., "09:30:15 AM (GMT+5:30)", "9:30 AM", "14:30:00") into a Date object on reference date
  const parseTimeToTodayDate = useCallback((timeStr?: string, refDate: Date = new Date()): Date | null => {
    if (!timeStr || timeStr === '—' || timeStr.includes('--:--')) return null;

    const cleanStr = timeStr.replace(/\s*\(GMT[^\)]*\)/gi, '').trim();
    const match = cleanStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if (!match) return null;

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = match[3] ? parseInt(match[3], 10) : 0;
    const meridian = match[4]?.toUpperCase();

    if (meridian === 'PM' && hours < 12) {
      hours += 12;
    } else if (meridian === 'AM' && hours === 12) {
      hours = 0;
    }

    const d = new Date(refDate);
    d.setHours(hours, minutes, seconds, 0);
    return d;
  }, []);

  // Computed Check-In & Check-Out Dates
  const checkInDate = useMemo(() => {
    return parseTimeToTodayDate(myTodayRecord?.checkIn, now);
  }, [myTodayRecord?.checkIn, now, parseTimeToTodayDate]);

  const checkOutDate = useMemo(() => {
    return parseTimeToTodayDate(myTodayRecord?.checkOut, now);
  }, [myTodayRecord?.checkOut, now, parseTimeToTodayDate]);

  // Dynamically calculate elapsed working seconds: (now - clockInTime)
  const currentElapsedSeconds = useMemo(() => {
    if (!isCheckedIn) return 0;
    if (isCheckedOut) {
      if (checkInDate && checkOutDate) {
        return Math.max(0, Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / 1000));
      }
      return Math.round((myTodayRecord?.workingHours || 8) * 3600);
    }
    if (checkInDate) {
      const diff = Math.max(0, Math.floor((now.getTime() - checkInDate.getTime()) / 1000));
      return Math.max(0, diff - (isOnBreak ? breakSeconds : 0));
    }
    return 0;
  }, [isCheckedIn, isCheckedOut, checkInDate, checkOutDate, now, isOnBreak, breakSeconds, myTodayRecord?.workingHours]);



  // Toggle Break Action
  const persistPunch = async (opts: {
    punchType: 'check_in' | 'check_out';
    deviceInfo?: string;
    status?: AttendanceRecord['status'];
    checkInTime?: string;
    checkOutTime?: string;
  }) => {
    const today = new Date().toISOString().split('T')[0];
    const useStudentApi = isStudentMode || state.currentPersona.role === 'student';
    if (useStudentApi) {
      const existing = state.attendance.find(
        (a) => a.employeeId === state.currentPersona.id && a.date === today
      );
      const rawStatus = opts.status || (opts.punchType === 'check_in' ? 'Present' : existing?.status || 'Present');
      const status =
        rawStatus === 'Work From Home' || rawStatus === 'On Leave' ? 'Present' : rawStatus;
      return api.institute.recordStudentAttendance({
        studentId: state.currentPersona.id,
        attendanceDate: today,
        status: status as 'Present' | 'Absent' | 'Late' | 'Half Day' | 'Excused',
        checkInTime:
          opts.punchType === 'check_in'
            ? opts.checkInTime
            : opts.checkInTime || existing?.checkIn || undefined,
        checkOutTime:
          opts.punchType === 'check_out'
            ? opts.checkOutTime
            : opts.checkOutTime || existing?.checkOut || undefined,
        remarks: opts.deviceInfo,
      });
    }
    return api.attendance.recordPunch({
      employeeId: state.currentPersona.id,
      punchType: opts.punchType,
      officeId: selectedLocation !== 'wfh' ? selectedOfficeIdForPunch : undefined,
      latitude: currentLat,
      longitude: currentLng,
      deviceInfo: opts.deviceInfo,
    });
  };

  const handleToggleBreak = async (type: 'Lunch' | 'Tea') => {
    setIsSaving(true);
    try {
      await api.attendance.toggleBreak({ employeeId: state.currentPersona.id, isOnBreak: !isOnBreak });
      if (isOnBreak) {
        setIsOnBreak(false);
        setPingToast(`Resumed from ${breakType} Break`);
      } else {
        setIsOnBreak(true);
        setBreakType(type);
        setPingToast(`Started ${type} Break`);
      }
      setTimeout(() => setPingToast(null), 3000);
    } catch (err) {
      console.error('Failed to toggle break', err);
      alert('Failed to toggle break');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Clock In: starts counting time from current clock in time
  const handleCheckIn = async () => {
    if (!hasConfiguredOffice) {
      setPingToast('⚠️ Attendance Disabled: No office location has been set up. Please configure an office in Settings first.');
      setTimeout(() => setPingToast(null), 4000);
      return;
    }

    setIsSaving(true);
    try {
      const punchRes = await persistPunch({
        punchType: 'check_in',
        deviceInfo: 'Web GPS Verified',
        checkInTime: now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
      });

      if (!punchRes.success) {
        alert(`Check-in failed on backend: ${punchRes.error?.message || 'Request failed'}`);
        setIsSaving(false);
        return;
      }

    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const todayIsoDate = new Date().toISOString().split('T')[0];
    const newRecord: AttendanceRecord = {
      id: punchRes.data?.id || `att_${Date.now()}`,
      employeeId: state.currentPersona.id,
      employeeName: state.currentPersona.name,
      avatar: state.currentPersona.avatar,
      date: todayIsoDate,
      checkIn: timeStr,
      checkOut: undefined,
      status: 'Present',
      locationName: activeOfficeDisplayName,
      latitude: currentLat,
      longitude: currentLng,
      isWithinGeofence: selectedLocation !== 'wfh',
      ipAddress: '106.51.72.18',
      device: 'Web GPS Verified',
      workingHours: 0,
      breakHours: 0,
    };

    onUpdateState((prev) => ({
      ...prev,
      attendance: [
        newRecord,
        ...prev.attendance.filter(
          (a) => !(a.employeeId === state.currentPersona.id && a.date === todayIsoDate)
        ),
      ],
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: state.currentPersona.name,
          action: 'ATTENDANCE_CHECK_IN',
          entity: 'AttendanceRecord',
          entityId: newRecord.id,
          ipAddress: '106.51.72.18',
          details: `Checked in at ${timeStr} from ${newRecord.locationName}.`,
        },
        ...prev.auditLogs,
      ],
      notifications: [
        {
          id: `notif_${Date.now()}`,
          title: 'Shift Clock-In Verified',
          message: `Shift check-in recorded at ${timeStr} (${activeOfficeDisplayName}).`,
          timestamp: 'Just now',
          category: 'Attendance' as const,
          priority: 'low' as const,
          read: false,
          linkModule: 'attendance',
          linkTab: 'my_attendance',
          actionLabel: 'View Attendance',
        },
        ...prev.notifications,
      ],
    }));

      setPingToast(`Checked In at ${timeStr} (${activeOfficeDisplayName})`);
      setTimeout(() => setPingToast(null), 3000);
    } catch (err) {
      console.error('Failed to check in', err);
      alert('Failed to check in');
    } finally {
      setIsSaving(false);
    }
  };

  // Shift Calculations
  const targetWorkSeconds = 8 * 3600; // 8 hours
  const shiftProgressPercent = Math.min(100, Math.round((currentElapsedSeconds / targetWorkSeconds) * 100));
  const isOvertime = currentElapsedSeconds >= targetWorkSeconds;
  const diffSeconds = Math.abs(currentElapsedSeconds - targetWorkSeconds);
  const diffHours = Math.floor(diffSeconds / 3600);
  const diffMins = Math.floor((diffSeconds % 3600) / 60);

  // Handle Clock Out from Modal
  const handleConfirmClockOut = async () => {
    setIsSaving(true);
    try {
      const punchRes = await persistPunch({
        punchType: 'check_out',
        deviceInfo: 'Web GPS Verified',
        checkOutTime: now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
      });

      if (!punchRes.success) {
        alert(`Clock-out failed on backend: ${punchRes.error?.message || 'Request failed'}`);
        setIsSaving(false);
        return;
      }

    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const workedHoursVal = Math.max(0.01, Number((currentElapsedSeconds / 3600).toFixed(2)));

    const nowTime = Date.now();
    const todayStr = new Date().toISOString().split('T')[0];

    onUpdateState((prev) => {
      let updatedTimesheets = [...prev.timesheets];

        const updatedTasks = prev.tasks.map((t) => {
          const isMyTask =
            t.assigneeId === prev.currentPersona.id ||
            (t.assigneeName && t.assigneeName.toLowerCase() === prev.currentPersona.name.toLowerCase());

          if (isMyTask && t.status === 'In Progress' && t.isTimerRunning && t.timerStartedAt) {
            let timeSpentSeconds = t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0);
            const elapsed = Math.max(0, Math.floor((nowTime - t.timerStartedAt) / 1000));
            timeSpentSeconds += elapsed;
            const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));
            const elapsedHours = Number((elapsed / 3600).toFixed(2));

            // Sync open timesheet with the elapsed session
            updatedTimesheets = updatedTimesheets.map((ts) => {
              if (
                ts.taskId === t.id &&
                ts.date === todayStr &&
                !ts.endTime
              ) {
                return {
                  ...ts,
                  hours: Number((ts.hours + elapsedHours).toFixed(2)),
                  endTime: timeStr,
                };
              }
              return ts;
            });

            return {
              ...t,
              isTimerRunning: false,
              timerStartedAt: undefined,
              timeSpentSeconds,
              actualHours,
            };
          }
          return t;
        });

      return {
        ...prev,
        attendance: prev.attendance.map((a) => {
          if (
            (a.employeeId === prev.currentPersona.id || a.employeeName === prev.currentPersona.name) &&
            a.date === todayStr
          ) {
            return {
              ...a,
              checkOut: timeStr,
              workingHours: workedHoursVal,
            };
          }
          return a;
        }),
        tasks: updatedTasks,
        timesheets: updatedTimesheets,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'ATTENDANCE_CHECK_OUT',
            entity: 'AttendanceRecord',
            entityId: myTodayRecord?.id || 'att_today',
            ipAddress: '106.51.72.18',
            details: `Checked out at ${timeStr}. Logged: ${workedHoursVal}h. Active tasks moved from In Progress back to To Do. Notes: ${clockOutNotes || 'None'}`,
          },
          ...prev.auditLogs,
        ],
        notifications: [
          {
            id: `notif_${Date.now()}`,
            title: 'Shift Clock-Out Logged',
            message: `Checked out at ${timeStr} (${workedHoursVal} hrs). Active in-progress tasks moved back to To Do.`,
            timestamp: 'Just now',
            category: 'Attendance' as const,
            priority: 'medium' as const,
            read: false,
            linkModule: 'Projects',
            actionLabel: 'View Tasks',
          },
          ...prev.notifications,
        ],
      };
    });

      setShowClockOutModal(false);
      setClockOutNotes('');

      setPingToast(`Clocked Out successfully at ${timeStr}`);
      setTimeout(() => setPingToast(null), 3000);
    } catch (err) {
      console.error('Failed to clock out', err);
      alert('Failed to clock out');
    } finally {
      setIsSaving(false);
    }
  };

  // Re-open/resume shift from Completed state
  const handleResetOrResumeShift = async () => {
    setIsSaving(true);
    try {
      await persistPunch({
        punchType: 'check_in',
        deviceInfo: 'Web GPS Verified',
        checkInTime: now.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
      });
      
      const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
      const todayStr = new Date().toISOString().split('T')[0];
      onUpdateState((prev) => ({
        ...prev,
        attendance: prev.attendance.map((a) => {
          if ((a.employeeId === state.currentPersona.id || a.employeeName === state.currentPersona.name) && a.date === todayStr) {
            return {
              ...a,
              checkIn: timeStr,
              checkOut: undefined,
              workingHours: 0,
              latitude: currentLat,
              longitude: currentLng,
            };
          }
          return a;
        }),
      }));
      setPingToast(`Clocked in at ${timeStr}`);
      setTimeout(() => setPingToast(null), 3000);
    } catch (err) {
      console.error('Failed to resume shift', err);
      alert('Failed to resume shift');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Regularization Submit
  const handleApplyRegularizationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    setIsSaving(true);
    try {
      const newReg: AttendanceRegularization = {
        id: `reg_${Date.now()}`,
        employeeId: state.currentPersona.id,
        employeeName: state.currentPersona.name,
        avatar: state.currentPersona.avatar,
        department: state.currentPersona.department,
        date: regDate,
        requestedCheckIn: regInTime,
        requestedCheckOut: regOutTime,
        reason: regReason,
        remarks: regRemarks || 'Regularization request for shift adjustments',
        status: 'Pending',
        appliedOn: toLocalISODate(),
      };

      await api.attendance.requestRegularization(newReg);

      onUpdateState((prev) => ({
        ...prev,
        regularizations: [newReg, ...prev.regularizations],
        notifications: [
          {
            id: `notif_${Date.now()}`,
            title: 'Regularization Request Submitted',
            message: `Attendance adjustment submitted for ${regDate} (${regInTime} - ${regOutTime}).`,
            timestamp: 'Just now',
            category: 'Approvals' as const,
            priority: 'medium' as const,
            read: false,
            linkModule: 'attendance',
            linkTab: 'regularizations',
            actorName: state.currentPersona.name,
            actorAvatar: state.currentPersona.avatar,
            actionLabel: 'Track Status',
          },
          ...prev.notifications,
        ],
      }));
      setShowRegModal(false);
      setRegRemarks('');
    } catch (err) {
      console.error('Failed to submit regularization request', err);
      alert('Failed to submit regularization request');
    } finally {
      setIsSaving(false);
    }
  };

  // Dynamic Target Shift Hours from HR configured start and end times (e.g. 09:00 AM to 06:00 PM = 9.0 hours)
  const shiftTargetHours = useMemo(() => {
    const startDate = parseTimeToTodayDate(configuredShiftStart, now);
    const endDate = parseTimeToTodayDate(configuredShiftEnd, now);
    if (startDate && endDate) {
      let diffMs = endDate.getTime() - startDate.getTime();
      if (diffMs < 0) diffMs += 24 * 3600 * 1000;
      const hrs = Math.max(1, Math.round((diffMs / (1000 * 3600)) * 10) / 10);
      return hrs;
    }
    return 9;
  }, [configuredShiftStart, configuredShiftEnd, now, parseTimeToTodayDate]);

  const targetHoursFormatted = `${String(Math.floor(shiftTargetHours)).padStart(2, '0')}h ${String(Math.round((shiftTargetHours % 1) * 60)).padStart(2, '0')}m`;

  const weeklyTargetHours = useMemo(() => {
    let days = workDaysInWeek;
    if (
      state.customOptions?.attendanceSettings?.enableAlternateSaturdays ||
      state.customOptions?.attendanceSettings?.enableAlternateSundays
    ) {
      days += 0.5;
    }
    return Math.round(shiftTargetHours * days * 10) / 10;
  }, [shiftTargetHours, workDaysInWeek, state.customOptions?.attendanceSettings?.enableAlternateSaturdays, state.customOptions?.attendanceSettings?.enableAlternateSundays]);

  const dynamicWorkSchedule = `${weeklyTargetHours % 1 === 0 ? weeklyTargetHours : weeklyTargetHours.toFixed(1)} Hours`;

  // Generate Dynamic Attendance Log Rows strictly from actual recorded attendance
  const attendanceHistory = useMemo(() => {
    const locName = activeOfficeDisplayName;
    const targetSeconds = shiftTargetHours * 3600;

    const userAttendanceLogs = state.attendance.filter(
      (a) =>
        a.employeeId === state.currentPersona?.id ||
        (a.employeeName && state.currentPersona?.name && a.employeeName.toLowerCase() === state.currentPersona.name.toLowerCase())
    );

    const historyRows = userAttendanceLogs.map((log) => {
      const isTodayRecord = log.date === todayIsoStr;
      const isOngoing = isTodayRecord && isCheckedIn && !log.checkOut;

      let loggedSecs = 0;
      if (isOngoing) {
        loggedSecs = currentElapsedSeconds;
      } else if (log.checkIn && log.checkOut) {
        const inDate = parseTimeToTodayDate(log.checkIn, now);
        const outDate = parseTimeToTodayDate(log.checkOut, now);
        if (inDate && outDate) {
          let diffMs = outDate.getTime() - inDate.getTime();
          if (diffMs < 0) diffMs += 24 * 3600 * 1000;
          loggedSecs = Math.max(0, Math.floor(diffMs / 1000));
        } else if (log.workingHours !== undefined && log.workingHours !== null) {
          loggedSecs = Math.round(log.workingHours * 3600);
        }
      } else if (log.workingHours !== undefined && log.workingHours !== null && log.workingHours > 0) {
        loggedSecs = Math.round(log.workingHours * 3600);
      }

      const hoursNum = Math.floor(loggedSecs / 3600);
      const minsNum = Math.floor((loggedSecs % 3600) / 60);
      const formattedLogged = `${hoursNum}h ${String(minsNum).padStart(2, '0')}m`;

      const deficitMins = Math.floor((targetSeconds - loggedSecs) / 60);
      let deficitDisplay = '';
      if (loggedSecs >= targetSeconds) {
        const overMins = Math.floor((loggedSecs - targetSeconds) / 60);
        deficitDisplay = `+${overMins}m`;
      } else {
        const defHours = Math.floor(deficitMins / 60);
        const defRemainMins = deficitMins % 60;
        deficitDisplay = defHours > 0 ? `-${defHours}h ${String(defRemainMins).padStart(2, '0')}m` : `-${defRemainMins}m`;
      }

      return {
        date: log.date,
        in: log.checkIn ? log.checkIn.replace(/\s*\(GMT[^\)]*\)/gi, '').trim() : '—',
        inLoc: log.locationName || activeOfficeDisplayName,
        out: log.checkOut ? log.checkOut.replace(/\s*\(GMT[^\)]*\)/gi, '').trim() : (log.checkIn ? 'In Progress' : '—'),
        outLoc: log.locationName || activeOfficeDisplayName,
        sched: `${Math.floor(shiftTargetHours)}h`,
        logged: formattedLogged,
        deficit: deficitDisplay,
        status: log.status || (isOngoing ? 'Present (Active)' : 'Present'),
      };
    });

    return historyRows;
  }, [state.attendance, state.currentPersona, todayIsoStr, isCheckedIn, isCheckedOut, myTodayRecord, activeOfficeDisplayName, currentElapsedSeconds, shiftTargetHours, parseTimeToTodayDate, now]);

  const filteredHistory = useMemo(() => {
    return attendanceHistory.filter((item) => {
      if (recordFilter !== 'All' && item.status !== recordFilter) return false;
      if (locationFilter !== 'All' && !item.inLoc.toLowerCase().includes(locationFilter.toLowerCase())) return false;
      return true;
    });
  }, [attendanceHistory, recordFilter, locationFilter]);

  const totalPages = Math.ceil(filteredHistory.length / rowsPerPage) || 1;
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Dynamic Calculations in sync with Attendance & Live Clock state
  const parseHoursMinutes = (str: string) => {
    if (!str) return 0;
    const hMatch = str.match(/(\d+)h/);
    const mMatch = str.match(/(\d+)m/);
    const h = hMatch ? parseInt(hMatch[1], 10) : 0;
    const m = mMatch ? parseInt(mMatch[1], 10) : 0;
    return h + m / 60;
  };

  // Historical week totals (past days in active work week)
  const historyDaysCount = includeSaturday ? 4 : 3;
  const historyPastWeek = attendanceHistory.slice(1, 1 + historyDaysCount);
  const pastWeekLoggedHours = historyPastWeek.reduce((acc, curr) => acc + parseHoursMinutes(curr.logged), 0);

  // Today's live logged hours
  const todayLiveHours = isCheckedIn ? (currentElapsedSeconds / 3600) : 0;

  // Dynamic Totals live in sync
  const dynamicLoggedHours = (pastWeekLoggedHours + todayLiveHours).toFixed(1);

  // Haversine formula to compute exact distance in meters between user GPS and office coordinates
  const calculateDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lon2 - lon1);

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  };

  // Dynamic Geofence Recalculation on Location Switch
  useEffect(() => {
    if (selectedLocation === 'wfh' || isGeofenceOptional) {
      setIsInsideRadius(true);
      setGeofenceDistanceMeters(0);
      setSimulatedDistance(0);
      return;
    }
    if (!hasConfiguredOfficeCoords) {
      // Missing office coords — do not pretend the punch is inside a default city pin
      setIsInsideRadius(false);
      setGeofenceDistanceMeters(0);
      setSimulatedDistance(0);
      return;
    }
    if (hasDeviceGpsLocation && currentLat && currentLng) {
      const distance = calculateDistanceMeters(currentLat, currentLng, activeOfficeLat, activeOfficeLng);
      setGeofenceDistanceMeters(distance);
      setSimulatedDistance(distance);
      setIsInsideRadius(distance <= configuredGeofenceRadius);
    }
  }, [
    selectedLocation,
    activeOfficeLat,
    activeOfficeLng,
    currentLat,
    currentLng,
    configuredGeofenceRadius,
    hasDeviceGpsLocation,
    hasConfiguredOfficeCoords,
    isGeofenceOptional,
  ]);

  // Real Geolocation Fetcher & Validator
  const fetchCurrentLocation = useCallback(() => {
    if (typeof window === 'undefined') {
      setGpsStatus('denied');
      setIsLocating(false);
      setPunchAddress('Geolocation is not supported.');
      return;
    }

    setIsLocating(true);
    setGpsStatus('locating');

    void (async () => {
      try {
        const position = await getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
        const userLat = position.latitude;
        const userLng = position.longitude;
        const accuracy = position.accuracy || 5;

        setCurrentLat(userLat);
        setCurrentLng(userLng);
        setGpsAccuracy(accuracy);
        setHasDeviceGpsLocation(true);
        setGpsStatus('granted');
        setIsLocating(false);

        if (selectedLocation === 'wfh' || isGeofenceOptional) {
          setGeofenceDistanceMeters(0);
          setSimulatedDistance(0);
          setIsInsideRadius(true);
        } else if (!hasConfiguredOfficeCoords) {
          setGeofenceDistanceMeters(0);
          setSimulatedDistance(0);
          setIsInsideRadius(false);
        } else {
          const distance = calculateDistanceMeters(userLat, userLng, activeOfficeLat, activeOfficeLng);
          setGeofenceDistanceMeters(distance);
          setSimulatedDistance(distance);
          const inRadius = distance <= configuredGeofenceRadius;
          setIsInsideRadius(inRadius);
        }

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${userLat}&lon=${userLng}`,
            { headers: { 'Accept-Language': 'en' } }
          );
          if (res.ok) {
            const data = await res.json();
            setPunchAddress(data.display_name || `${userLat.toFixed(5)}, ${userLng.toFixed(5)}`);
          } else {
            setPunchAddress(`${userLat.toFixed(5)}, ${userLng.toFixed(5)}`);
          }
        } catch {
          setPunchAddress(`${userLat.toFixed(5)}, ${userLng.toFixed(5)}`);
        }
      } catch (error) {
        console.warn('Geolocation error:', error);
        setIsLocating(false);
        setGpsStatus(isGeofenceOptional ? 'granted' : 'denied');
        setHasDeviceGpsLocation(isGeofenceOptional);
        if (isGeofenceOptional) {
          setIsInsideRadius(true);
        }
        const message = error instanceof Error ? error.message : '';
        setPunchAddress(
          /denied|permission/i.test(message)
            ? 'Location permission denied. Please enable GPS location.'
            : 'Unable to retrieve your current location.'
        );
      }
    })();
  }, [activeOfficeLat, activeOfficeLng, configuredGeofenceRadius, selectedLocation, hasConfiguredOfficeCoords, isGeofenceOptional]);

  // Handle GPS Refresh Ping with real device geolocation
  const handlePingGps = () => {
    setIsPingingGps(true);
    fetchCurrentLocation();
    setTimeout(() => {
      setIsPingingGps(false);
      setPingToast('GPS Geofence Location Refreshed');
      setTimeout(() => setPingToast(null), 3000);
    }, 800);
  };

  // Handle Punch button click: open Confirm Punch Location map modal
  const handlePunch = () => {
    if (!hasConfiguredOffice) {
      setPingToast('⚠️ Attendance Disabled: No office location has been configured for your workspace. Please set up an office in Settings first.');
      setTimeout(() => setPingToast(null), 4000);
      return;
    }
    if (!isAttendanceConfigured) {
      setPingToast('Attendance rules must be configured by HR before taking attendance.');
      setTimeout(() => setPingToast(null), 4000);
      return;
    }
    if (isCheckedIn && isCheckedOut) {
      setPingToast('You have already completed and checked out of your shift for today.');
      setTimeout(() => setPingToast(null), 4000);
      return;
    }
    setShowPunchLocationModal(true);
    setPunchStep('map');
    setHasDeviceGpsLocation(false);
    setGpsStatus('locating');
    fetchCurrentLocation();
  };

  // Stop active camera stream
  const stopCameraStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Open camera for selfie after confirming punch location on map
  const handleOpenSelfieCamera = (asRemote: boolean) => {
    setShowPunchLocationModal(false);
    setSelfieAsRemote(asRemote);
    setCapturedSelfie(null);
    setCameraError(null);
    setIsCameraLoading(true);
    setIsCameraReady(false);
    setCameraAttempt((prev) => prev + 1);
    setShowSelfieModal(true);
  };

  // From map: go straight to camera if in geofence; otherwise show out-of-geofence warning
  const handleProceedFromMap = () => {
    if (selectedLocation !== 'wfh' && !isGeofenceOptional && !hasConfiguredOfficeCoords) {
      setPingToast(
        'Office location coordinates are not configured. Set latitude/longitude in Attendance Settings before punching at the office, or switch to WFH.'
      );
      setTimeout(() => setPingToast(null), 5000);
      return;
    }
    if (selectedLocation === 'wfh' || isInsideRadius || isGeofenceOptional) {
      handleOpenSelfieCamera(selectedLocation === 'wfh');
    } else {
      setPunchStep('confirm_out_radius');
    }
  };

  // Start camera stream when selfie modal mounts or retry is triggered
  useEffect(() => {
    if (!showSelfieModal) {
      setIsCameraReady(false);
      return;
    }
    let cancelled = false;
    setIsCameraLoading(true);
    setIsCameraReady(false);
    setCameraError(null);

    (async () => {
      try {
        // Stop any previous active stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const { stream } = await getSelfieStream();

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          videoRef.current.onloadedmetadata = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              await videoRef.current.play();
            } catch (playErr) {
              console.warn('Video play was prevented:', playErr);
            }
            if (!cancelled) {
              setIsCameraLoading(false);
              setIsCameraReady(true);
            }
          };

          // Fallback timer if onloadedmetadata does not fire or completes immediately
          setTimeout(() => {
            if (!cancelled && videoRef.current && videoRef.current.srcObject === stream) {
              videoRef.current.play().catch(() => {});
              setIsCameraLoading(false);
              setIsCameraReady(true);
            }
          }, 600);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Camera stream error:', err);
          // On native shells, fall back to the Capacitor Camera plugin (no live preview).
          if (isNativePlatform()) {
            try {
              const dataUrl = await captureSelfiePhoto();
              if (!cancelled) {
                setCapturedSelfie(dataUrl);
                setCameraError(null);
                setIsCameraLoading(false);
                setIsCameraReady(false);
              }
              return;
            } catch (nativeErr) {
              console.error('Native camera capture error:', nativeErr);
            }
          }
          const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
          setCameraError(
            isDenied
              ? 'Camera access is blocked. Please allow camera permissions and click Retry Camera.'
              : 'Camera device unavailable. Please ensure your camera is connected and click Retry Camera.'
          );
          setIsCameraLoading(false);
          setIsCameraReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCameraStream();
      setIsCameraReady(false);
    };
  }, [showSelfieModal, cameraAttempt, stopCameraStream]);

  // Capture photo from video stream with flash animation and mirrored canvas
  const handleTakePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !isCameraReady || isCameraLoading) return;
    const video = videoRef.current;

    // Safety validation: ensure video is actively playing and has dimensions (prevents black screen capture)
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      return;
    }

    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 400);

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw mirrored image to match user's live mirrored preview
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    setCapturedSelfie(dataUrl);
    stopCameraStream();
  };

  // Retry Camera: re-triggers media stream request
  const handleRetryCamera = () => {
    setCapturedSelfie(null);
    setCameraError(null);
    setIsCameraLoading(true);
    setIsCameraReady(false);
    stopCameraStream();
    setCameraAttempt((prev) => prev + 1);
  };

  /** Native-only: open system camera when live WebView stream is unavailable. */
  const handleNativeCameraCapture = async () => {
    if (!isNativePlatform()) return;
    setIsCameraLoading(true);
    setCameraError(null);
    try {
      const dataUrl = await captureSelfiePhoto();
      setCapturedSelfie(dataUrl);
      setIsCameraReady(false);
    } catch (err) {
      console.error('Native camera capture error:', err);
      setCameraError('Unable to open the device camera. Please allow camera permission and try again.');
    } finally {
      setIsCameraLoading(false);
    }
  };

  // Retake: clear captured photo and restart camera
  const handleRetake = () => {
    handleRetryCamera();
  };

  // Final punch submission (called after selfie capture or skip)
  const handleFinalConfirmPunch = async (asRemote: boolean = false, selfieDataUrl?: string | null) => {
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    setIsSaving(true);
    try {
      if (!isCheckedIn) {
        // Calculate status based on configured shift start and grace period
        const expectedStartDate = parseTimeToTodayDate(configuredShiftStart, now);
        let calculatedStatus: AttendanceRecord['status'] = 'Present';
        const gracePeriodMins = state.customOptions?.attendanceSettings?.gracePeriodMinutes ?? 15;
        if (expectedStartDate) {
          const graceTimeMs = expectedStartDate.getTime() + gracePeriodMins * 60 * 1000;
          if (now.getTime() > graceTimeMs) {
            calculatedStatus = 'Late';
          }
        }

        const punchRes = await persistPunch({
          punchType: 'check_in',
          deviceInfo: asRemote ? 'Remote / Out of Geofence' : 'GPS + Webcam Verified',
          checkInTime: timeStr,
          status: calculatedStatus,
        });
        if (!punchRes.success) {
          alert(`Check-in failed on backend: ${punchRes.error?.message || 'Request failed'}`);
          setIsSaving(false);
          return;
        }

      const todayIsoDate = new Date().toISOString().split('T')[0];
      const newRecord: AttendanceRecord = {
        id: `att_${Date.now()}`,
        employeeId: state.currentPersona.id,
        employeeName: state.currentPersona.name,
        avatar: state.currentPersona.avatar,
        date: todayIsoDate,
        checkIn: timeStr,
        checkOut: undefined,
        status: calculatedStatus,
        locationName: asRemote ? 'Remote / Out of Geofence' : punchAddress.split(',')[0] || state.organization?.officeLocation?.address || 'Primary Office',
        latitude: currentLat,
        longitude: currentLng,
        isWithinGeofence: !asRemote && isInsideRadius,
        ipAddress: '106.51.72.18',
        device: 'Web GPS Verified',
        workingHours: 0,
        breakHours: 0,
        ...(selfieDataUrl ? { selfiePhoto: selfieDataUrl, checkInPhoto: selfieDataUrl } : {}),
      };

      onUpdateState((prev) => ({
        ...prev,
        attendance: [
          newRecord,
          ...prev.attendance.filter(
            (a) => !(a.employeeId === state.currentPersona.id && a.date === todayIsoDate)
          ),
        ],
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'ATTENDANCE_CHECK_IN',
            entity: 'AttendanceRecord',
            entityId: newRecord.id,
            ipAddress: '106.51.72.18',
            details: `GPS Punch In at ${timeStr} from ${punchAddress} (Distance: ${simulatedDistance}m)${selfieDataUrl ? ' [Selfie Captured]' : ''}`,
          },
          ...prev.auditLogs,
        ],
        notifications: [
          {
            id: `notif_${Date.now()}`,
            title: 'GPS Shift Check-In Recorded',
            message: `Clocked in at ${timeStr} from ${asRemote ? 'Remote WFH' : punchAddress.split(',')[0] || state.organization?.officeLocation?.address || 'Main Office'}.${calculatedStatus === 'Late' ? ' (Late Entry)' : ''}`,
            timestamp: 'Just now',
            category: 'Attendance' as const,
            priority: calculatedStatus === 'Late' ? ('high' as const) : ('low' as const),
            read: false,
            linkModule: 'attendance',
            linkTab: 'my_attendance',
            actionLabel: 'View Attendance',
          },
          ...prev.notifications,
        ],
      }));
        setPingToast(`Punch In Verified via GPS at ${timeStr}`);
      } else if (!isCheckedOut) {
        const punchRes = await persistPunch({
          punchType: 'check_out',
          deviceInfo: asRemote ? 'Remote / Out of Geofence' : 'GPS + Webcam Verified',
          checkOutTime: timeStr,
        });
        if (!punchRes.success) {
          alert(`Check-out failed on backend: ${punchRes.error?.message || 'Request failed'}`);
          setIsSaving(false);
          return;
        }

        const workedHoursVal = Math.max(0.01, Number((currentElapsedSeconds / 3600).toFixed(2)));
        const halfDayThreshold = state.customOptions?.attendanceSettings?.halfDayThresholdHours ?? 4.5;
        const fullDayThreshold = state.customOptions?.attendanceSettings?.fullDayMinimumHours ?? 8.0;
        let finalStatus: AttendanceRecord['status'] = 'Present';
        if (workedHoursVal < halfDayThreshold) {
          finalStatus = 'Absent';
        } else if (workedHoursVal < fullDayThreshold) {
          finalStatus = 'Half Day';
        }

      const nowTime = Date.now();
      const todayStr = new Date().toISOString().split('T')[0];

      onUpdateState((prev) => {
        let updatedTimesheets = [...prev.timesheets];

        const updatedTasks = prev.tasks.map((t) => {
          const isMyTask =
            t.assigneeId === prev.currentPersona.id ||
            (t.assigneeName && t.assigneeName.toLowerCase() === prev.currentPersona.name.toLowerCase());

          if (isMyTask && t.status === 'In Progress' && t.isTimerRunning && t.timerStartedAt) {
            let timeSpentSeconds = t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0);
            const elapsed = Math.max(0, Math.floor((nowTime - t.timerStartedAt) / 1000));
            timeSpentSeconds += elapsed;
            const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));
            const elapsedHours = Number((elapsed / 3600).toFixed(2));

            // Sync open timesheet with the elapsed session
            updatedTimesheets = updatedTimesheets.map((ts) => {
              if (
                ts.taskId === t.id &&
                ts.date === todayStr &&
                !ts.endTime
              ) {
                return {
                  ...ts,
                  hours: Number((ts.hours + elapsedHours).toFixed(2)),
                  endTime: timeStr,
                };
              }
              return ts;
            });

            return {
              ...t,
              isTimerRunning: false,
              timerStartedAt: undefined,
              timeSpentSeconds,
              actualHours,
            };
          }
          return t;
        });

        return {
          ...prev,
          attendance: prev.attendance.map((a) => {
            if (
              (a.employeeId === prev.currentPersona.id || a.employeeName === prev.currentPersona.name) &&
              a.date === todayStr
            ) {
              return {
                ...a,
                checkOut: timeStr,
                workingHours: workedHoursVal,
                status: finalStatus,
                ...(selfieDataUrl ? { checkOutPhoto: selfieDataUrl } : {}),
              };
            }
            return a;
          }),
          tasks: updatedTasks,
          timesheets: updatedTimesheets,
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'ATTENDANCE_CHECK_OUT',
              entity: 'AttendanceRecord',
              entityId: myTodayRecord?.id || 'att_today',
              ipAddress: '106.51.72.18',
              details: `GPS Punch Out at ${timeStr}. Logged: ${workedHoursVal}h${selfieDataUrl ? ' [Check-Out Selfie Captured]' : ''}. Active tasks moved from In Progress back to To Do.`,
            },
            ...prev.auditLogs,
          ],
          notifications: [
            {
              id: `notif_${Date.now()}`,
              title: 'Shift Completed & Clock-Out Saved',
              message: `GPS Punch Out at ${timeStr} (${workedHoursVal}h logged). Active tasks returned to To Do.`,
              timestamp: 'Just now',
              category: 'Attendance' as const,
              priority: 'medium' as const,
              read: false,
              linkModule: 'Projects',
              actionLabel: 'View Tasks',
            },
            ...prev.notifications,
          ],
        };
      });
        setPingToast(`Punch Out Verified via GPS at ${timeStr}. Shift completed for today!`);
      } else {
        setPingToast('You have already completed and checked out of your shift for today.');
        setShowSelfieModal(false);
        stopCameraStream();
        setTimeout(() => setPingToast(null), 4000);
        return;
      }

      setShowSelfieModal(false);
      stopCameraStream();
      setTimeout(() => setPingToast(null), 3500);
    } catch (err) {
      console.error('Failed to process punch', err);
      alert('Failed to process punch');
    } finally {
      setIsSaving(false);
    }
  };

  const myRegs = state.regularizations.filter(
    (r) => r.employeeId === state.currentPersona.id || r.employeeName === state.currentPersona.name
  );

  const mainContent = (
    <div className="space-y-6 text-slate-900">
      {/* Top Secondary Sub-nav for HR / Managers / Staff */}
      {state.currentPersona.role !== 'student' && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar touch-pan-x py-1 w-full">
          {!isStudentMode && (
            <button
              onClick={() => setSubTab('my_attendance')}
              className={`${ATT_SUBNAV_BASE} ${
                subTab === 'my_attendance' ? ATT_SUBNAV_ACTIVE : ATT_SUBNAV_IDLE
              }`}
            >
              <Clock className={`h-4 w-4 shrink-0 ${subTab === 'my_attendance' ? 'text-white' : 'text-slate-500'}`} />
              <span>My Attendance</span>
            </button>
          )}

          {(!isUserView || isStudentMode) && (
            <button
              onClick={() => setSubTab('team_attendance')}
              className={`${ATT_SUBNAV_BASE} ${
                subTab === 'team_attendance' ? ATT_SUBNAV_ACTIVE : ATT_SUBNAV_IDLE
              }`}
            >
              <Users className={`h-4 w-4 shrink-0 ${subTab === 'team_attendance' ? 'text-white' : 'text-slate-500'}`} />
              <span>{isStudentMode ? 'Class Attendance' : isSuperAdmin || isHR || isInstitution ? 'Staff Attendance' : 'Team Attendance'}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  subTab === 'team_attendance'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {teamAttendanceStats.totalEmployees}
              </span>
            </button>
          )}

          {!isStudentMode && (
            <button
              onClick={() => setSubTab('leaves')}
              className={`${ATT_SUBNAV_BASE} ${
                subTab === 'leaves' ? ATT_SUBNAV_ACTIVE : ATT_SUBNAV_IDLE
              }`}
            >
              <CalendarIcon className={`h-4 w-4 shrink-0 ${subTab === 'leaves' ? 'text-white' : 'text-slate-500'}`} />
              <span>Leaves & Time Off</span>
              {pendingLeavesCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    subTab === 'leaves'
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {pendingLeavesCount}
                </span>
              )}
            </button>
          )}

          {!isStudentMode && (
            <button
              onClick={() => setSubTab('regularizations')}
              className={`${ATT_SUBNAV_BASE} ${
                subTab === 'regularizations' ? ATT_SUBNAV_ACTIVE : ATT_SUBNAV_IDLE
              }`}
            >
              <FileCheck className={`h-4 w-4 shrink-0 ${subTab === 'regularizations' ? 'text-white' : 'text-slate-500'}`} />
              <span>Regularizations</span>
              {pendingRegCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    subTab === 'regularizations'
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {pendingRegCount}
                </span>
              )}
            </button>
          )}

          {!isStudentMode && (
            <button
              onClick={() => setSubTab('holidays')}
              className={`${ATT_SUBNAV_BASE} ${
                subTab === 'holidays' ? ATT_SUBNAV_ACTIVE : ATT_SUBNAV_IDLE
              }`}
            >
              <CalendarIcon className={`h-4 w-4 shrink-0 ${subTab === 'holidays' ? 'text-white' : 'text-slate-500'}`} />
              <span>Holidays</span>
            </button>
          )}

          {(isSuperAdmin || isHR) && (
            <button
              onClick={() => setSubTab('settings')}
              className={`${ATT_SUBNAV_BASE} ${
                subTab === 'settings' ? ATT_SUBNAV_ACTIVE : ATT_SUBNAV_IDLE
              }`}
            >
              <Settings className={`h-4 w-4 shrink-0 ${subTab === 'settings' ? 'text-white' : 'text-slate-500'}`} />
              <span>{isStudentMode ? 'Campus Settings' : 'Settings'}</span>
            </button>
          )}
        </div>
      )}

      {/* VIEW 1: MY ATTENDANCE */}
      {(!isStudentMode || state.currentPersona.role === 'student') && subTab === 'my_attendance' && (
        <div className="space-y-6">
          {/* Toast Notification */}
          {pingToast && (
            <div className="fixed top-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 className="h-4 w-4" />
              <span>{pingToast}</span>
            </div>
          )}

          <div>
            <h1 className={ATT_PAGE_TITLE}>My Attendance</h1>
          </div>

          {/* UNIFIED SHIFT TIMING & GEOFENCING TILE */}
          <div className={`${ATT_CARD} p-5 sm:p-6 space-y-4 text-slate-900 font-sans`}>
            {/* Top Bar: Shift Timing + Location Dropdown */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
              <span className="text-xs font-semibold text-slate-500">
                {isStudentMode
                  ? `${activeShiftName} (${configuredShiftStart} — ${configuredShiftEnd})`
                  : isUserHourlyWorker
                  ? `Hourly / Flexible Shift (₹${userHourlyRate}/hr)`
                  : `${activeShiftName} (${configuredShiftStart} — ${configuredShiftEnd})`}
              </span>

              {/* Location Dropdown */}
              <div className="relative">
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 px-3 py-1.5 rounded-lg outline-none cursor-pointer focus:border-blue-600 transition-colors shadow-2xs w-full sm:w-auto"
                >
                  {availableOffices.map((off, idx) => (
                    <option key={`office-${off}-${idx}`} value={off}>
                      {off}
                    </option>
                  ))}
                  {!isInstitution && !isStudentMode && !isStudentLogin && (
                    <option value="wfh">Work From Home (WFH)</option>
                  )}
                  {availableOffices.length === 0 && (
                    <option value="" disabled>No Campus Location Configured</option>
                  )}
                </select>
              </div>
            </div>

            {/* Middle Row: Date & Live Tracked Session */}
            <div className="space-y-1">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight" suppressHydrationWarning>
                {isMounted ? now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Monday, Aug 31'}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
                <span className="font-bold text-slate-900 text-sm tabular-nums" suppressHydrationWarning>
                  {isMounted && isCheckedIn
                    ? (!isCheckedOut ? formatTimer(currentElapsedSeconds) : `${myTodayRecord?.workingHours || shiftTargetHours}h 00m`)
                    : '00h 00m 00s'}
                </span>
                <span className="text-slate-400">/ {targetHoursFormatted}</span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600 font-medium truncate">
                  {activeOfficeDisplayName}
                </span>
              </div>
            </div>

            {/* Bottom Controls Row: Status Indicator on Left, Action Button on Right */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
              {/* Left Status Indicator */}
              <div>
                {!isCheckedIn ? (
                  <span className="tabular-nums text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg inline-block" suppressHydrationWarning>
                    {currentTimeFormatted}
                  </span>
                ) : !isCheckedOut ? (
                  <span className="tabular-nums text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg inline-block tracking-tight" suppressHydrationWarning>
                    {formatTimer(currentElapsedSeconds)}
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg inline-block">
                    Shift Completed ({myTodayRecord?.workingHours || shiftTargetHours}h logged)
                  </span>
                )}
              </div>

              {/* Right Action Button */}
              <div>
                {!hasConfiguredOffice && selectedLocation !== 'wfh' ? (
                  (isSuperAdmin || isHR) ? (
                    <button
                      type="button"
                      onClick={() => setSubTab('settings')}
                      className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all cursor-pointer shadow-2xs"
                    >
                      {isStudentMode ? 'Setup Campus' : 'Setup Office'}
                    </button>
                  ) : (
                    <div
                      title="Attendance is disabled until your administrator sets up an office / campus location."
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed select-none text-center"
                    >
                      {isStudentMode ? 'Campus Setup Pending' : 'Office Setup Pending'}
                    </div>
                  )
                ) : !isAttendanceConfigured ? (
                  (isSuperAdmin || isHR) ? (
                    <button
                      type="button"
                      onClick={() => setSubTab('settings')}
                      className="w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all cursor-pointer shadow-2xs"
                    >
                      Setup Rules
                    </button>
                  ) : (
                    <div
                      title="Attendance tracking is awaiting configuration by your HR administrator."
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed select-none text-center"
                    >
                      Setup Pending
                    </div>
                  )
                ) : !isCheckedOut ? (
                  <button
                    type="button"
                    onClick={handlePunch}
                    className={`${ATT_BTN_PRIMARY} w-full sm:w-auto px-6 ${
                      !isCheckedIn ? '' : '!bg-rose-600 hover:!bg-rose-700 shadow-rose-500/10'
                    }`}
                  >
                    {!isCheckedIn ? 'Punch In' : 'Punch Out'}
                  </button>
                ) : (
                  <div
                    title="Shift completed for today. Multiple check-ins on the same day are restricted."
                    className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed select-none text-center"
                  >
                    Logged for Today
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Stat Metric Cards (Work Schedule & Logged Time - Hidden for Students) */}
          {!isStudentMode && (
            isUserHourlyWorker ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Card 1: Hourly Work Schedule */}
                <div
                  title="Shift type: Hourly / Flexible schedule based on logged punches"
                  className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs group hover:border-indigo-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9e9ea7]">
                    <span className="font-semibold">Shift Schedule</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700">HOURLY</span>
                  </div>
                  <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">Flexible Hours</p>
                </div>

                {/* Card 2: Logged Time This Week */}
                <div
                  title="Total working hours logged for the active work week"
                  className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs group hover:border-indigo-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9e9ea7]">
                    <span className="font-semibold">Logged This Week</span>
                    <Info className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{dynamicLoggedHours} Hours</p>
                </div>

                {/* Card 3: Hourly Billing Rate */}
                <div
                  title="Configured hourly rate for wage disbursement"
                  className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs group hover:border-indigo-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9e9ea7]">
                    <span className="font-semibold">Hourly Wage Rate</span>
                    <Clock className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  <p className="text-xl md:text-2xl font-bold text-indigo-700 tabular-nums">₹{userHourlyRate} / hr</p>
                </div>

                {/* Card 4: Tracked Weekly Pay */}
                <div
                  title="Estimated earnings tracked from logged hours this week"
                  className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs group hover:border-emerald-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9e9ea7]">
                    <span className="font-semibold">Tracked Earnings</span>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                  <p className="text-xl md:text-2xl font-bold text-emerald-700 tabular-nums">
                    ₹{Math.round(Number(dynamicLoggedHours) * userHourlyRate).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Card 1: Work Schedule */}
                <div
                  title={`Weekly work schedule: ${shiftTargetHours}h/day × ${workDaysInWeek} working days (${includeSaturday ? 'Mon–Sat' : 'Mon–Fri'})`}
                  className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs group hover:border-blue-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9e9ea7]">
                    <span className="font-semibold">Work Schedule</span>
                    <Info className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{dynamicWorkSchedule}</p>
                </div>

                {/* Card 2: Logged Time */}
                <div
                  title="Total working hours logged for the active work week"
                  className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs group hover:border-blue-500/40 transition-colors"
                >
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-[#9e9ea7]">
                    <span className="font-semibold">Logged Time</span>
                    <Info className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                  <p className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white">{dynamicLoggedHours} Hours</p>
                </div>
              </div>
            )
          )}

          {/* Info Notice Banner */}
          {!isStudentMode && state.currentPersona.role !== 'student' && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/80 dark:bg-blue-950/20 px-4 py-3 text-xs text-blue-800 dark:text-blue-300 flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>You can only update or regularize attendance records within the last 11 days.</span>
              </div>
              <button
                onClick={openRegModal}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0 cursor-pointer"
              >
                Apply Regularization →
              </button>
            </div>
          )}

          {/* Filter Strip */}
          <AttendanceFilterToolbar
            leading={
              <div className="flex items-center justify-center sm:justify-start gap-2 bg-slate-50 px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
                <CalendarIcon className="h-3.5 w-3.5 text-slate-400" />
                <span>{dateRangeFilter}</span>
              </div>
            }
            selects={[
              {
                id: 'record',
                value: recordFilter,
                onChange: setRecordFilter,
                'aria-label': 'Filter by record',
                options: [
                  { value: 'All', label: 'All Record' },
                  { value: 'Present', label: 'Present' },
                  { value: 'Late', label: 'Late' },
                  ...(!isInstitution ? [{ value: 'WFH', label: 'Work From Home' }] : []),
                ],
              },
              {
                id: 'location',
                value: locationFilter,
                onChange: setLocationFilter,
                'aria-label': 'Filter by location',
                options: [
                  { value: 'All', label: 'All Location' },
                  ...availableOffices.map((off) => ({ value: off, label: off })),
                  ...(!isInstitution ? [{ value: 'Remote', label: 'Remote' }] : []),
                ],
              },
              {
                id: 'status',
                value: statusFilter,
                onChange: setStatusFilter,
                'aria-label': 'Filter by status',
                options: [
                  { value: 'All', label: 'All Status' },
                  { value: 'Verified', label: 'Verified' },
                  { value: 'Regularized', label: 'Regularized' },
                ],
              },
            ]}
          />

          {/* Attendance Logs Table */}
          <div className={ATT_TABLE_SHELL}>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className={ATT_TABLE_HEAD}>
                <tr>
                  <th className="p-3.5 text-slate-900 dark:text-white">Date ▾</th>
                  <th className="p-3.5">Clock In</th>
                  <th className="p-3.5">Clock In Location</th>
                  <th className="p-3.5">Clock Out</th>
                  <th className="p-3.5">Clock Out Location</th>
                  {!isStudentMode && <th className="p-3.5">Work Schedule</th>}
                  {!isStudentMode && <th className="p-3.5">Logged Time</th>}
                  {!isStudentMode && <th className="p-3.5 text-right">Deficit</th>}
                  {isStudentMode && <th className="p-3.5 text-right">Attendance Status</th>}
                </tr>
              </thead>
              <tbody className="font-medium text-slate-700 dark:text-slate-300 divide-y divide-slate-100 dark:divide-[#282830]">
                {paginatedHistory.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-[#18181d] transition-colors duration-150">
                    <td className="p-3.5 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        <span>{row.date}</span>
                      </div>
                    </td>
                    <td className="p-3.5 tabular-nums text-slate-800 dark:text-slate-200" suppressHydrationWarning>{row.in}</td>
                    <td className="p-3.5 text-slate-500 dark:text-[#9e9ea7] truncate max-w-[160px]">{row.inLoc}</td>
                    <td className="p-3.5 tabular-nums text-slate-800 dark:text-slate-200" suppressHydrationWarning>{row.out}</td>
                    <td className="p-3.5 text-slate-500 dark:text-[#9e9ea7] truncate max-w-[160px]">{row.outLoc}</td>
                    {!isStudentMode && <td className="p-3.5 tabular-nums text-slate-600 dark:text-slate-300">{row.sched}</td>}
                    {!isStudentMode && <td className="p-3.5 tabular-nums font-bold text-slate-900 dark:text-white" suppressHydrationWarning>{row.logged}</td>}
                    {!isStudentMode && (
                      <td className="p-3.5 tabular-nums text-right font-bold text-blue-600 dark:text-blue-400" suppressHydrationWarning>
                        {row.deficit}
                      </td>
                    )}
                    {isStudentMode && (
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <AttendanceStatusPill
                          kind={
                            row.status === 'Present'
                              ? 'present'
                              : row.status === 'Late'
                                ? 'late'
                                : 'on_leave'
                          }
                          label={row.status}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Table Pagination Bar */}
            <div className="p-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
              {/* Pagination Controls */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  className="h-7 w-7 flex items-center justify-center border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {[1, 2, 3].map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`h-7 w-7 flex items-center justify-center rounded-lg font-bold text-xs cursor-pointer ${currentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                  >
                    {page}
                  </button>
                ))}
                <span className="px-1 text-slate-400">...</span>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  className="h-7 w-7 flex items-center justify-center border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  {totalPages}
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="h-7 w-7 flex items-center justify-center border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-100 text-slate-700 cursor-pointer"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Showing Entries and Rows dropdown */}
              <div className="flex items-center gap-4 text-[11px]">
                <span>
                  Showing {Math.min((currentPage - 1) * rowsPerPage + 1, filteredHistory.length)} to{' '}
                  {Math.min(currentPage * rowsPerPage, filteredHistory.length)} of {filteredHistory.length} entries
                </span>
                <div className="flex items-center gap-1">
                  <span>Show</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => setRowsPerPage(Number(e.target.value))}
                    className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 px-2 py-1 rounded-lg outline-none cursor-pointer"
                  >
                    <option value={6}>6</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: TEAM ATTENDANCE (FOR HR / MANAGERS / FACULTY) */}
      {state.currentPersona.role !== 'student' && subTab === 'team_attendance' && (
        <div className="space-y-6 text-slate-900">
          <div>
            <h1 className={ATT_PAGE_TITLE}>
              {isStudentMode ? 'Class Attendance' : 'Attendance'}
            </h1>
            <p className={ATT_PAGE_META}>{teamAttendanceDate}</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 items-stretch">
            <div className="xl:col-span-3 min-h-0">
              <AttendanceStatCards
                columns={3}
                items={[
                  {
                    id: 'present',
                    label: 'Present',
                    value: teamAttendanceStats.onTime + teamAttendanceStats.late,
                    unit: isStudentMode ? 'students' : 'employees',
                    tone: 'present',
                    breakdown: [
                      { label: isStudentMode ? 'on time' : 'on time', value: teamAttendanceStats.onTime },
                      { label: 'late', value: teamAttendanceStats.late },
                    ],
                    onClick: () => setTeamStatusFilter(teamStatusFilter === 'on_time' ? 'all' : 'on_time'),
                    active: teamStatusFilter === 'on_time',
                  },
                  {
                    id: 'leave',
                    label: 'On Leave',
                    value: teamAttendanceStats.timeOff,
                    unit: isStudentMode ? 'students' : 'employees',
                    tone: 'leave',
                    onClick: () => setTeamStatusFilter(teamStatusFilter === 'time_off' ? 'all' : 'time_off'),
                    active: teamStatusFilter === 'time_off',
                  },
                  {
                    id: 'absent',
                    label: 'Absent',
                    value: teamAttendanceStats.notInYet,
                    unit: isStudentMode ? 'students' : 'employees',
                    tone: 'absent',
                    onClick: () => setTeamStatusFilter(teamStatusFilter === 'not_in_yet' ? 'all' : 'not_in_yet'),
                    active: teamStatusFilter === 'not_in_yet',
                  },
                ]}
              />
            </div>
            <div className="xl:col-span-2 min-h-0">
              <AttendanceOverviewChart data={teamOverviewChartData} />
            </div>
          </div>

          {/* Quick Attendance Summary Card */}
          <div className={`${ATT_CARD} overflow-hidden`}>
            {/* Header with Title, Employee Search & Date Picker */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className={ATT_SECTION_TITLE}>Employee Attendance</h2>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {/* Employee Search Bar */}
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={teamSearchQuery}
                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                    placeholder="Search employee…"
                    className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:bg-white text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-500 transition-[background-color,border-color] duration-150 ease-out shadow-2xs"
                  />
                  {teamSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTeamSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Date Picker */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 sm:bg-white text-xs font-medium text-slate-700 shadow-2xs justify-between sm:justify-start">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="h-4 w-4 text-slate-500 shrink-0" />
                    <span className="text-[11px] font-medium text-slate-400 sm:hidden">Date:</span>
                  </div>
                  <input
                    type="date"
                    value={teamAttendanceDate}
                    onChange={(e) => setTeamAttendanceDate(e.target.value)}
                    className="bg-transparent outline-none text-xs font-semibold text-slate-800 cursor-pointer"
                  />
                </div>

                {/* Batch Selector & Group by Batch Toggle for Student/School Mode */}
                {isStudentMode && (
                  <>
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 sm:bg-white text-xs font-semibold text-slate-700 shadow-2xs">
                      <Filter className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="text-[11px] font-medium text-slate-400">Batch:</span>
                      <select
                        value={teamBatchFilter}
                        onChange={(e) => setTeamBatchFilter(e.target.value)}
                        className="bg-transparent outline-none text-xs font-bold text-slate-800 cursor-pointer"
                      >
                        <option value="All">All Batches ({teamAttendanceStats.totalEmployees})</option>
                        {uniqueBatches.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTeamGroupByBatch(!teamGroupByBatch)}
                      className={`${ATT_BTN_SECONDARY} ${
                        teamGroupByBatch
                          ? '!bg-blue-600 !text-white !border-blue-600'
                          : ''
                      }`}
                      title="Toggle batch-wise grouped breakdown"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>{teamGroupByBatch ? 'Grouped by Batch' : 'Group by Batch'}</span>
                    </button>
                  </>
                )}

                {/* Export PDF Report Button */}
                <button
                  type="button"
                  onClick={() => {
                    setReportsModalInitialType('daily');
                    setShowReportsModal(true);
                  }}
                  className={ATT_BTN_SECONDARY}
                  title="Export Attendance Report (PDF)"
                >
                  <Printer className="h-3.5 w-3.5 text-slate-500" />
                  <span>Export Report</span>
                </button>
              </div>
            </div>

            {/* Filter Tabs: All, Checked In, Late, Not Checked In */}
            <div className="px-4 py-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar touch-pan-x border-b border-slate-100 text-xs">
              {[
                { id: 'All' as const, label: 'All', count: teamAttendanceStats.totalEmployees },
                { id: 'Checked In' as const, label: isStudentMode ? 'Present' : 'Checked In', count: teamAttendanceStats.onTime },
                { id: 'Late' as const, label: 'Late', count: teamAttendanceStats.late },
                { id: 'Not Checked In' as const, label: isStudentMode ? 'Absent' : 'Not Checked In', count: teamAttendanceStats.notInYet },
                ...(isStudentMode ? [] : [{ id: 'Hourly' as const, label: 'Hourly Staff', count: teamAttendanceStats.hourlyCount }]),
              ].map((tab) => {
                const isActive = teamTabFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setTeamTabFilter(tab.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white font-semibold shadow-xs'
                        : 'bg-slate-100/90 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-semibold tabular-nums ${
                      isActive ? 'bg-white/20 text-white' : 'bg-white text-slate-700 shadow-2xs'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Status Filter Cards (4 Cards: On Time, Late, Not in Yet, Time Off) */}
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Card 1: On Time */}
              <button
                type="button"
                onClick={() => setTeamStatusFilter(teamStatusFilter === 'on_time' ? 'all' : 'on_time')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  teamStatusFilter === 'on_time'
                    ? 'border-emerald-500 bg-emerald-50/70 shadow-xs ring-1 ring-emerald-500/30'
                    : 'border-slate-200 bg-white hover:bg-slate-50/80 shadow-2xs'
                }`}
              >
                <div className="text-xl font-bold tracking-tight text-slate-900 tabular-nums">{teamAttendanceStats.onTime}</div>
                <div className="text-xs font-medium text-slate-500 mt-0.5">{isStudentMode ? 'Present' : 'On Time'}</div>
              </button>

              {/* Card 2: Late */}
              <button
                type="button"
                onClick={() => setTeamStatusFilter(teamStatusFilter === 'late' ? 'all' : 'late')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  teamStatusFilter === 'late'
                    ? 'border-rose-500 bg-rose-50/70 shadow-xs ring-1 ring-rose-500/30'
                    : 'border-slate-200 bg-white hover:bg-slate-50/80 shadow-2xs'
                }`}
              >
                <div className="text-xl font-bold tracking-tight text-slate-900 tabular-nums">{teamAttendanceStats.late}</div>
                <div className="text-xs font-medium text-slate-500 mt-0.5">Late Arrival</div>
              </button>

              {/* Card 3: Not in Yet */}
              <button
                type="button"
                onClick={() => setTeamStatusFilter(teamStatusFilter === 'not_in_yet' ? 'all' : 'not_in_yet')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  teamStatusFilter === 'not_in_yet'
                    ? 'border-amber-500 bg-amber-50/70 shadow-xs ring-1 ring-amber-500/30'
                    : 'border-slate-200 bg-white hover:bg-slate-50/80 shadow-2xs'
                }`}
              >
                <div className="text-xl font-bold tracking-tight text-slate-900 tabular-nums">{teamAttendanceStats.notInYet}</div>
                <div className="text-xs font-medium text-slate-500 mt-0.5">{isStudentMode ? 'Absent' : 'Not in Yet'}</div>
              </button>

              {/* Card 4: Time Off */}
              <button
                type="button"
                onClick={() => setTeamStatusFilter(teamStatusFilter === 'time_off' ? 'all' : 'time_off')}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  teamStatusFilter === 'time_off'
                    ? 'border-purple-500 bg-purple-50/70 shadow-xs ring-1 ring-purple-500/30'
                    : 'border-slate-200 bg-white hover:bg-slate-50/80 shadow-2xs'
                }`}
              >
                <div className="text-xl font-bold tracking-tight text-slate-900 tabular-nums">{teamAttendanceStats.timeOff}</div>
                <div className="text-xs font-medium text-slate-500 mt-0.5">{isStudentMode ? 'On Leave' : 'Time Off'}</div>
              </button>
            </div>

            {/* Mobile Staff / Student Attendance Cards */}
            <div className="block md:hidden p-4 space-y-3 border-t border-slate-100">
              {filteredTeamRecords.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium bg-slate-50/60 rounded-2xl border border-slate-200/80">
                  No {isStudentMode ? 'student' : 'employee'} attendance records match the selected shift or status filters.
                </div>
              ) : teamGroupByBatch && isStudentMode ? (
                /* Grouped Mobile Cards */
                groupedBatches.map((grp) => (
                  <div key={grp.batchName} className="space-y-2.5">
                    <div className="p-3 bg-slate-100/90 rounded-2xl border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{grp.batchName}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shadow-2xs">
                          {grp.totalEnrolled} Students
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        grp.rate >= 75 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {grp.rate}% Avg
                      </span>
                    </div>

                    {grp.records.map(({ emp, att, statusType, firstPunch, lastPunch, hoursFormatted, breakHours, isWarning, isHourlyWorker, hourlyRate, earnedToday, overtimeHours, overtimeFormatted, cumulativeAttendanceRate, isBelowThreshold, geoLabel }) => (
                      <div key={emp.id} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => handleEmployeeClick(emp)}
                            className="flex items-center gap-3 text-left min-w-0 cursor-pointer"
                          >
                            <UserAvatar
                              src={emp.avatar}
                              name={emp.name}
                              className="w-10 h-10 ring-1 ring-slate-200"
                            />
                            <div className="min-w-0 space-y-0.5">
                              <h4 className="font-semibold text-slate-900 text-sm truncate hover:text-blue-600">{emp.name}</h4>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs text-slate-500 truncate">{emp.designation || 'Student'}</p>
                                {isBelowThreshold && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> &lt; 75% At-Risk
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          <div className="shrink-0 flex flex-col items-end gap-1.5">
                            <TeamStatusBadge statusType={statusType} isStudentMode={isStudentMode} />
                            <TeamGeoBadge geoLabel={geoLabel} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-xs">
                          <div>
                            <span className="text-[11px] font-medium text-slate-400">Punch Times</span>
                            <p className="font-semibold text-slate-800 text-xs mt-0.5 tabular-nums">
                              {firstPunch} – {lastPunch}
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] font-medium text-slate-400">Attendance Rate</span>
                            <p className="font-semibold text-slate-800 text-xs mt-0.5 tabular-nums">
                              {cumulativeAttendanceRate}% Cumulative
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                /* Flat Mobile Cards */
                filteredTeamRecords.map(({ emp, att, statusType, firstPunch, lastPunch, hoursFormatted, breakHours, isWarning, isHourlyWorker, hourlyRate, earnedToday, overtimeHours, overtimeFormatted, cumulativeAttendanceRate, isBelowThreshold, geoLabel }) => (
                  <div key={emp.id} className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleEmployeeClick(emp)}
                        className="flex items-center gap-3 text-left min-w-0 cursor-pointer"
                      >
                        <UserAvatar
                          src={emp.avatar}
                          name={emp.name}
                          className="w-10 h-10 ring-1 ring-slate-200"
                        />
                        <div className="min-w-0 space-y-0.5">
                          <h4 className="font-semibold text-slate-900 text-sm truncate hover:text-blue-600">{emp.name}</h4>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs text-slate-500 truncate">{emp.designation || (isStudentMode ? 'Student' : 'Employee')}</p>
                            {isHourlyWorker && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                                <Clock className="w-2.5 h-2.5 text-indigo-600" /> Hourly (₹{hourlyRate}/hr)
                              </span>
                            )}
                            {isStudentMode && isBelowThreshold && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> &lt; 75% At-Risk
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <TeamStatusBadge statusType={statusType} isStudentMode={isStudentMode} />
                        <TeamGeoBadge geoLabel={geoLabel} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 text-xs">
                      <div>
                        <span className="text-[11px] font-medium text-slate-400">Punch Times</span>
                        <p className="font-semibold text-slate-800 text-xs mt-0.5 tabular-nums">
                          {firstPunch} – {lastPunch}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-slate-400">{isStudentMode ? 'Attendance Rate' : 'Work & Break'}</span>
                        <div className="font-semibold text-slate-800 text-xs mt-0.5 space-y-0.5">
                          {isStudentMode ? (
                            <div className="flex items-center gap-1 tabular-nums font-bold">
                              <span>{cumulativeAttendanceRate}%</span>
                              <span className="text-slate-400 font-normal">({hoursFormatted})</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 tabular-nums">
                              <span>{hoursFormatted}</span>
                              <span className="text-slate-400 font-normal">({breakHours} break)</span>
                              {isWarning && !isHourlyWorker && (
                                <AlertTriangle className="h-3 w-3 text-amber-500 inline shrink-0" />
                              )}
                            </div>
                          )}
                          {isHourlyWorker && (att?.checkIn || hoursFormatted !== '-') && (
                            <div className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 w-fit">
                              ₹{earnedToday.toLocaleString('en-IN')} earned {overtimeHours > 0 ? `(+${overtimeFormatted} OT)` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 text-xs">
                      {att && (
                        <button
                          type="button"
                          onClick={() => setSelectedAttendancePhotoRecord(att)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-all cursor-pointer shadow-2xs"
                        >
                          View Photo
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const targetAtt: AttendanceRecord = att || {
                            id: `att_${Date.now()}_${emp.id}`,
                            employeeId: emp.id,
                            employeeName: emp.name,
                            avatar: emp.avatar || '',
                            date: teamAttendanceDate,
                            checkIn: '09:00 AM',
                            status: 'Present',
                            workingHours: 8,
                            breakHours: 0.5,
                            locationName: 'Office Location',
                            latitude: state.organization?.officeLocation?.latitude || 0,
                            longitude: state.organization?.officeLocation?.longitude || 0,
                            isWithinGeofence: true,
                            ipAddress: '106.51.72.18',
                            device: 'Web App',
                          };
                          handleOpenEditAttendance(targetAtt);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Staff / Student Attendance Matrix Table */}
            <div className="hidden md:block overflow-x-auto border-t border-slate-100">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-semibold text-xs border-b border-slate-100 select-none">
                  <tr>
                    <th
                      onClick={() => handleToggleSort('employee')}
                      className="p-3.5 pl-5 cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={teamSortField === 'employee' ? 'text-blue-600 font-semibold' : ''}>{isStudentMode ? 'Student' : 'Employee'}</span>
                        {teamSortField === 'employee' ? (
                          teamSortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-slate-400" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('batch')}
                      className="p-3.5 font-semibold cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={teamSortField === 'batch' || teamSortField === 'roles' ? 'text-blue-600 font-semibold' : ''}>
                          {isStudentMode ? 'Grade / Batch' : 'Role'}
                        </span>
                        {(teamSortField === 'batch' || teamSortField === 'roles') && (
                          teamSortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        )}
                      </div>
                    </th>
                    <th className="p-3.5 font-semibold">{isStudentMode ? 'Schedule / Shift' : 'Shift'}</th>
                    <th className="p-3.5 font-semibold">Check In</th>
                    <th className="p-3.5 font-semibold">Check Out</th>
                    <th className="p-3.5 font-semibold">{isStudentMode ? 'Class Hours' : 'Working Hours'}</th>
                    <th
                      onClick={() => isStudentMode && handleToggleSort('attendanceRate')}
                      className={`p-3.5 font-semibold ${isStudentMode ? 'cursor-pointer hover:bg-slate-100' : ''}`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{isStudentMode ? 'Attendance Rate' : 'Break'}</span>
                        {isStudentMode && teamSortField === 'attendanceRate' && (
                          teamSortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        )}
                      </div>
                    </th>
                    <th className="p-3.5 font-semibold">Location</th>
                    <th className="p-3.5 font-semibold">Status</th>
                    <th className="p-3.5 pr-5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                  {filteredTeamRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-10 text-center text-xs text-slate-400">
                        No {isStudentMode ? 'student' : 'employee'} attendance records match the selected shift or status filters.
                      </td>
                    </tr>
                  ) : teamGroupByBatch && isStudentMode ? (
                    /* Grouped Batch Rows */
                    groupedBatches.map((grp) => (
                      <React.Fragment key={grp.batchName}>
                        <tr className="bg-slate-100/80 border-y border-slate-200">
                          <td colSpan={10} className="py-2.5 px-5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className="font-bold text-xs text-slate-900">{grp.batchName}</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shadow-2xs">
                                  {grp.totalEnrolled} Students Enrolled
                                </span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  (Present: {grp.activeCount}, Late: {grp.lateCount}, Absent: {grp.absentCount})
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-slate-500">Batch Health:</span>
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  grp.rate >= 75
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                                }`}>
                                  {grp.rate}%
                                </span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {grp.records.map(({ emp, att, statusType, firstPunch, lastPunch, workingHours, hoursFormatted, breakHours, isWarning, shift, shiftKind, isHourlyWorker, hourlyRate, earnedToday, overtimeHours, overtimeFormatted, cumulativeAttendanceRate, isBelowThreshold, geoLabel }) => (
                          <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-3.5 pl-5">
                              <button
                                type="button"
                                onClick={() => handleEmployeeClick(emp)}
                                className="flex items-center gap-3 text-left group cursor-pointer hover:opacity-85 transition-opacity"
                                title={`View profile for ${emp.name}`}
                              >
                                <UserAvatar
                                  src={emp.avatar}
                                  name={emp.name}
                                  className="w-8 h-8 ring-1 ring-slate-200 group-hover:ring-blue-500 transition-all"
                                />
                                <div>
                                  <div className="font-semibold text-slate-900 text-xs group-hover:text-blue-600 group-hover:underline transition-colors">{emp.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono">STU-{emp.employeeId || emp.id}</div>
                                </div>
                              </button>
                            </td>
                            <td className="p-3.5">
                              <div className="font-medium text-slate-700 text-xs">{emp.designation || 'Student'}</div>
                            </td>
                            <td className="p-3.5">
                              <div className="space-y-0.5">
                                <div className="font-semibold text-xs text-slate-800">{shift}</div>
                                {shiftKind && (
                                  <div className="text-[10px] text-slate-400">{shiftKind}</div>
                                )}
                              </div>
                            </td>
                            <td className="p-3.5 text-xs font-medium text-slate-700 tabular-nums">
                              {firstPunch}
                            </td>
                            <td className="p-3.5 text-xs font-medium text-slate-500 tabular-nums">
                              {lastPunch}
                            </td>
                            <td className="p-3.5 text-xs font-semibold text-slate-900 tabular-nums">
                              <span>{hoursFormatted}</span>
                            </td>
                            <td className="p-3.5 text-xs tabular-nums">
                              <div className="flex items-center gap-1.5">
                                <span className={`font-bold text-xs ${cumulativeAttendanceRate < 75 ? 'text-amber-800' : 'text-slate-900'}`}>
                                  {cumulativeAttendanceRate}%
                                </span>
                                {isBelowThreshold && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs" title="Attendance below 75% minimum threshold">
                                    <AlertTriangle className="h-3 w-3 text-amber-600" /> &lt; 75% At-Risk
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3.5">
                              <TeamGeoBadge geoLabel={geoLabel} />
                            </td>
                            <td className="p-3.5">
                              <TeamStatusBadge statusType={statusType} isStudentMode={isStudentMode} />
                            </td>
                            <td className="p-3.5 pr-5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                {att && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedAttendancePhotoRecord(att)}
                                    className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-all cursor-pointer shadow-2xs"
                                  >
                                    View Photo
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const targetAtt: AttendanceRecord = att || {
                                      id: `att_${Date.now()}_${emp.id}`,
                                      employeeId: emp.id,
                                      employeeName: emp.name,
                                      avatar: emp.avatar || '',
                                      date: teamAttendanceDate,
                                      checkIn: '08:30 AM',
                                      status: 'Present',
                                      workingHours: 6.5,
                                      breakHours: 0.5,
                                      locationName: 'Main Campus',
                                      latitude: state.organization?.officeLocation?.latitude || 0,
                                      longitude: state.organization?.officeLocation?.longitude || 0,
                                      isWithinGeofence: true,
                                      ipAddress: '106.51.72.18',
                                      device: 'Web App',
                                    };
                                    handleOpenEditAttendance(targetAtt);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Edit Attendance"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  <span>Edit</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  ) : (
                    /* Flat Table Rows */
                    filteredTeamRecords.map(({ emp, att, statusType, firstPunch, lastPunch, workingHours, hoursFormatted, breakHours, isWarning, shift, shiftKind, isHourlyWorker, hourlyRate, earnedToday, overtimeHours, overtimeFormatted, cumulativeAttendanceRate, isBelowThreshold, geoLabel }) => (
                      <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3.5 pl-5">
                          <button
                            type="button"
                            onClick={() => handleEmployeeClick(emp)}
                            className="flex items-center gap-3 text-left group cursor-pointer hover:opacity-85 transition-opacity"
                            title={`View profile for ${emp.name}`}
                          >
                            <UserAvatar
                              src={emp.avatar}
                              name={emp.name}
                              className="w-8 h-8 ring-1 ring-slate-200 group-hover:ring-blue-500 transition-all"
                            />
                            <div className="font-semibold text-slate-900 text-xs group-hover:text-blue-600 group-hover:underline transition-colors">{emp.name}</div>
                          </button>
                        </td>
                        <td className="p-3.5">
                          <div className="font-medium text-slate-700 text-xs">{emp.designation || (isStudentMode ? 'Student' : 'Employee')}</div>
                        </td>
                        <td className="p-3.5">
                          {isHourlyWorker ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                                <Clock className="w-3 h-3 text-indigo-600" /> Hourly (Flexible)
                              </span>
                              <div className="text-[10px] text-slate-500 font-mono font-medium pl-1">₹{hourlyRate}/hr</div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-xs text-slate-800">{shift}</div>
                              {shiftKind && (
                                <div className="text-[10px] text-slate-400">{shiftKind}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-xs font-medium text-slate-700 tabular-nums">
                          {firstPunch}
                        </td>
                        <td className="p-3.5 text-xs font-medium text-slate-500 tabular-nums">
                          {lastPunch}
                        </td>
                        <td className="p-3.5 text-xs font-semibold text-slate-900 tabular-nums">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span>{hoursFormatted}</span>
                              {isWarning && !isHourlyWorker && !isStudentMode && (
                                <span title="Less than minimum half-day threshold (4h)">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 inline ml-1.5" />
                                </span>
                              )}
                            </div>
                            {isHourlyWorker && (att?.checkIn || workingHours > 0) && (
                              <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 w-fit">
                                <span>₹{earnedToday.toLocaleString('en-IN')} earned</span>
                                {overtimeHours > 0 && <span className="text-amber-700 font-semibold">(+{overtimeFormatted} OT)</span>}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 text-xs font-medium text-slate-600 tabular-nums">
                          {isStudentMode ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold text-xs ${cumulativeAttendanceRate < 75 ? 'text-amber-800' : 'text-slate-900'}`}>
                                {cumulativeAttendanceRate}%
                              </span>
                              {isBelowThreshold && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/90 shadow-2xs" title="Attendance below 75% minimum threshold">
                                  <AlertTriangle className="h-3 w-3 text-amber-600" /> &lt; 75% At-Risk
                                </span>
                              )}
                            </div>
                          ) : (
                            breakHours
                          )}
                        </td>
                        <td className="p-3.5">
                          <TeamGeoBadge geoLabel={geoLabel} />
                        </td>
                        <td className="p-3.5">
                          <TeamStatusBadge statusType={statusType} isStudentMode={isStudentMode} />
                        </td>
                        <td className="p-3.5 pr-5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {att && (
                              <button
                                type="button"
                                onClick={() => setSelectedAttendancePhotoRecord(att)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-medium transition-all cursor-pointer shadow-2xs"
                              >
                                View Photo
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const targetAtt: AttendanceRecord = att || {
                                  id: `att_${Date.now()}_${emp.id}`,
                                  employeeId: emp.id,
                                  employeeName: emp.name,
                                  avatar: emp.avatar || '',
                                  date: teamAttendanceDate,
                                  checkIn: '09:00 AM',
                                  status: 'Present',
                                  workingHours: 8,
                                  breakHours: 0.5,
                                  locationName: 'Office Location',
                                  latitude: state.organization?.officeLocation?.latitude || 0,
                                  longitude: state.organization?.officeLocation?.longitude || 0,
                                  isWithinGeofence: true,
                                  ipAddress: '106.51.72.18',
                                  device: 'Web App',
                                };
                                handleOpenEditAttendance(targetAtt);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                              title="Edit Attendance"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Edit</span>
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

      {/* VIEW 3: REGULARIZATIONS */}
      {!isStudentMode && state.currentPersona.role !== 'student' && subTab === 'regularizations' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className={ATT_PAGE_TITLE}>Regularizations</h2>
            </div>
            <button
              onClick={openRegModal}
              className={ATT_BTN_PRIMARY}
            >
              <Plus className="h-4 w-4" /> Apply Regularization
            </button>
          </div>

          {/* Mobile Regularizations Cards */}
          <div className="block md:hidden space-y-3">
            {(isSuperAdmin || isHR
              ? state.regularizations
              : state.regularizations.filter(
                  (r) =>
                    r.employeeId === state.currentPersona.id ||
                    accessibleEmpIds.has(r.employeeId) ||
                    canApproveRegularization(state.currentPersona, r, state.employees)
                )
            ).length === 0 ? (
              <div className={`p-8 ${ATT_CARD} text-center text-xs text-slate-400 font-semibold`}>
                No attendance correction requests found.
              </div>
            ) : (
              (isSuperAdmin || isHR
                ? state.regularizations
                : state.regularizations.filter(
                    (r) =>
                      r.employeeId === state.currentPersona.id ||
                      accessibleEmpIds.has(r.employeeId) ||
                      canApproveRegularization(state.currentPersona, r, state.employees)
                  )
              ).map((reg) => {
                const canApprove = canApproveRegularization(state.currentPersona, reg, state.employees);
                return (
                  <div key={reg.id} className={`p-4 ${ATT_CARD} space-y-3`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <button
                          type="button"
                          onClick={() => handleEmployeeClick(reg.employeeId || reg.employeeName)}
                          className="text-left font-bold text-slate-900 text-xs hover:text-blue-600 cursor-pointer"
                        >
                          {reg.employeeName}
                        </button>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">{reg.date}</p>
                      </div>
                      <AttendanceStatusPill
                        kind={reg.status === 'Approved' ? 'approved' : 'pending'}
                        label={reg.status}
                      />
                    </div>

                    <div className="rounded-xl bg-slate-50 p-2.5 border border-slate-200/70 text-xs space-y-1">
                      <p className="text-[11px] font-mono text-slate-700">
                        <strong>Requested:</strong> {reg.requestedCheckIn} — {reg.requestedCheckOut}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        <strong>Reason:</strong> {reg.reason} {reg.remarks ? `• ${reg.remarks}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <span className="text-[11px] text-slate-400">
                        {reg.status === 'Approved' ? 'Authorized' : 'Pending Approval'}
                      </span>
                      {reg.status === 'Pending' && canApprove && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleApproveRegularization(reg.id, true)}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs cursor-pointer active:scale-[0.97] transition-transform duration-100"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleApproveRegularization(reg.id, false)}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] cursor-pointer active:scale-[0.97] transition-transform duration-100"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Regularizations Table */}
          <div className={`hidden md:block ${ATT_TABLE_SHELL}`}>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className={ATT_TABLE_HEAD}>
                <tr>
                  <th className="p-3.5 text-slate-900">Employee</th>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Requested Hours</th>
                  <th className="p-3.5">Reason</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="font-medium text-slate-700 divide-y divide-slate-100">
                {(isSuperAdmin || isHR
                  ? state.regularizations
                  : state.regularizations.filter(
                      (r) =>
                        r.employeeId === state.currentPersona.id ||
                        accessibleEmpIds.has(r.employeeId) ||
                        canApproveRegularization(state.currentPersona, r, state.employees)
                    )
                ).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-xs text-slate-400">
                      No attendance correction requests found.
                    </td>
                  </tr>
                ) : (
                  (isSuperAdmin || isHR
                    ? state.regularizations
                    : state.regularizations.filter(
                        (r) =>
                          r.employeeId === state.currentPersona.id ||
                          accessibleEmpIds.has(r.employeeId) ||
                          canApproveRegularization(state.currentPersona, r, state.employees)
                      )
                  ).map((reg) => {
                    const canApprove = canApproveRegularization(state.currentPersona, reg, state.employees);
                    return (
                      <tr key={reg.id} className="hover:bg-slate-50/80 transition-colors duration-150">
                        <td className="p-3.5 font-bold text-slate-900">
                          <button
                            type="button"
                            onClick={() => handleEmployeeClick(reg.employeeId || reg.employeeName)}
                            className="text-left font-bold text-slate-900 hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                            title={`View profile for ${reg.employeeName}`}
                          >
                            {reg.employeeName}
                          </button>
                        </td>
                        <td className="p-3.5">{reg.date}</td>
                        <td className="p-3.5 font-mono">{reg.requestedCheckIn} to {reg.requestedCheckOut}</td>
                        <td className="p-3.5 text-slate-500">{reg.reason} • {reg.remarks}</td>
                        <td className="p-3.5">
                          <AttendanceStatusPill
                            kind={reg.status === 'Approved' ? 'approved' : reg.status === 'Rejected' ? 'rejected' : 'pending'}
                            label={reg.status}
                          />
                        </td>
                        <td className="p-3.5 text-right space-x-1.5 whitespace-nowrap">
                          {reg.status === 'Pending' && canApprove ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveRegularization(reg.id, true)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] cursor-pointer transition-colors shadow-2xs active:scale-[0.97]"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApproveRegularization(reg.id, false)}
                                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] cursor-pointer transition-colors active:scale-[0.97]"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              {reg.status === 'Approved' ? 'Authorized' : 'Submitted'}
                            </span>
                          )}
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

      {/* VIEW: LEAVES & TIME OFF */}
      {!isStudentMode && subTab === 'leaves' && (
        isUserView ? (
          <div className="space-y-5">
            {/* Header with Apply Action */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h2 className={ATT_PAGE_TITLE}>My Leaves</h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setReportsModalInitialType('leaves');
                    setShowReportsModal(true);
                  }}
                  className={ATT_BTN_SECONDARY}
                >
                  <Printer className="h-3.5 w-3.5 text-slate-500" />
                  <span>Export Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowApplyLeaveModal(true)}
                  className={ATT_BTN_PRIMARY}
                >
                  <Plus className="h-4 w-4" /> Apply for Leave
                </button>
              </div>
            </div>

            {/* Probation Alert Banner if Subject Employee is in Probation */}
            {isTargetInProbation && (
              <div className="rounded-xl border border-amber-200/90 bg-amber-50/75 dark:bg-amber-950/20 p-3.5 flex items-center justify-between gap-3 text-amber-900 dark:text-amber-300 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <p className="text-xs font-semibold">
                    Probation Policy Active: Paid leaves (Casual, Sick, Earned) are restricted until probation completion. All absences are logged as Loss of Pay (LOP / Unpaid).
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-200/80 text-amber-900 shrink-0">
                  0 Paid Leaves
                </span>
              </div>
            )}

            {/* Current Leaves Left (4 Balance Cards) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Card 1: Casual Leave */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Casual Leave</span>
                  {isTargetInProbation ? (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      Restricted
                    </span>
                  ) : casualPending > 0 ? (
                    <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                      {casualPending}d pending
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 dark:text-[#686873]">{casualUsed}d used</span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {isTargetInProbation ? 0 : formatLeaveDays(casualLeft)} <span className="text-xs font-normal text-slate-500 dark:text-[#9e9ea7]">/ {isTargetInProbation ? 0 : formatLeaveDays(casualQuota)} Days Left</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-[#282830] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${isTargetInProbation || casualQuota === 0 ? 0 : Math.min(100, (casualLeft / casualQuota) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Sick Leave */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Sick Leave</span>
                  {isTargetInProbation ? (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      Restricted
                    </span>
                  ) : sickPending > 0 ? (
                    <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                      {sickPending}d pending
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 dark:text-[#686873]">{sickUsed}d used</span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {isTargetInProbation ? 0 : formatLeaveDays(sickLeft)} <span className="text-xs font-normal text-slate-500 dark:text-[#9e9ea7]">/ {isTargetInProbation ? 0 : formatLeaveDays(sickQuota)} Days Left</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-[#282830] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${isTargetInProbation || sickQuota === 0 ? 0 : Math.min(100, (sickLeft / sickQuota) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Earned / Privilege */}
              <div className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Earned / Privilege</span>
                  {isTargetInProbation ? (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                      Restricted
                    </span>
                  ) : earnedPending > 0 ? (
                    <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                      {earnedPending}d pending
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 dark:text-[#686873]">{earnedUsed}d used</span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                    {isTargetInProbation ? 0 : formatLeaveDays(earnedLeft)} <span className="text-xs font-normal text-slate-500 dark:text-[#9e9ea7]">/ {isTargetInProbation ? 0 : formatLeaveDays(earnedQuota)} Days Left</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-[#282830] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all duration-300"
                      style={{ width: `${isTargetInProbation || earnedQuota === 0 ? 0 : Math.min(100, (earnedLeft / earnedQuota) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 4: Work From Home */}
              {!isInstitution && (
                <div className="rounded-2xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] p-4 flex flex-col justify-between space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Work From Home</span>
                    {isTargetInProbation ? (
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                        Restricted
                      </span>
                    ) : wfhPending > 0 ? (
                      <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-500/20">
                        {wfhPending}d pending
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 dark:text-[#686873]">{wfhUsed}d used</span>
                    )}
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                      {isTargetInProbation ? 0 : formatLeaveDays(wfhLeft)} <span className="text-xs font-normal text-slate-500 dark:text-[#9e9ea7]">/ {isTargetInProbation ? 0 : formatLeaveDays(wfhQuota)} Days Left</span>
                    </p>
                    <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-[#282830] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${isTargetInProbation || wfhQuota === 0 ? 0 : Math.min(100, (wfhLeft / wfhQuota) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Past Leaves History Section */}
            <div className="rounded-xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] overflow-hidden space-y-3 p-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#282830] pb-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">History of Past Leaves & Requests</h3>
                  <span className="text-xs text-slate-500 dark:text-[#9e9ea7]">
                    ({targetEmpLeaves.length} records)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={leaveFilterStatus}
                    onChange={(e) => setLeaveFilterStatus(e.target.value)}
                    className="bg-slate-50 dark:bg-[#18181d] border border-slate-200 dark:border-[#282830] text-xs font-semibold text-slate-700 dark:text-[#9e9ea7] hover:text-slate-900 dark:hover:text-white px-3 py-1.5 rounded-lg outline-none cursor-pointer"
                  >
                    <option value="All">All Status</option>
                    <option value="Pending">Pending Approval</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected / Declined</option>
                  </select>
                </div>
              </div>

              {/* Mobile Leaves Cards */}
              <div className="block md:hidden p-3.5 space-y-3">
                {targetEmpLeaves
                  .filter((l) => leaveFilterStatus === 'All' || l.status === leaveFilterStatus)
                  .length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No leave applications found matching the selected filter. Click &ldquo;+ Apply for Leave&rdquo; to submit a new request.
                  </div>
                ) : (
                  targetEmpLeaves
                    .filter((l) => leaveFilterStatus === 'All' || l.status === leaveFilterStatus)
                    .map((leave) => (
                      <div key={leave.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-white border border-slate-200 text-slate-800">
                              {leave.leaveType}
                            </span>
                            <p className="text-xs font-bold text-slate-900 mt-1">
                              {leave.startDate} to {leave.endDate} <span className="text-blue-600 font-semibold">({leave.daysCount}d)</span>
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border shrink-0 ${
                              leave.status === 'Approved'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : leave.status === 'Pending'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}
                          >
                            {leave.status}
                          </span>
                        </div>

                        {leave.reason && (
                          <p className="text-[11px] text-slate-500 bg-white p-2 rounded-lg border border-slate-100">
                            {leave.reason}
                          </p>
                        )}

                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                          <span className="text-[10px] text-slate-400">Applied: {leave.appliedOn || leave.startDate || new Date().toISOString().substring(0, 10)}</span>
                          {leave.status === 'Pending' && (
                            <button
                              type="button"
                              onClick={() => handleCancelLeave(leave.id)}
                              className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                            >
                              Cancel Request
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>

              {/* Desktop Leaves Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-[#18181d] text-slate-500 dark:text-[#9e9ea7] border-b border-slate-200/80 dark:border-[#282830] font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3 text-slate-900 dark:text-white">Leave Type</th>
                      <th className="p-3">Dates & Duration</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Applied On</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium text-slate-700 dark:text-slate-300 divide-y divide-slate-100 dark:divide-[#282830]">
                    {targetEmpLeaves
                      .filter((l) => leaveFilterStatus === 'All' || l.status === leaveFilterStatus)
                      .length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-xs text-slate-400 dark:text-[#686873]">
                          No leave applications found matching the selected filter. Click &ldquo;+ Apply for Leave&rdquo; to submit a new request.
                        </td>
                      </tr>
                    ) : (
                      targetEmpLeaves
                        .filter((l) => leaveFilterStatus === 'All' || l.status === leaveFilterStatus)
                        .map((leave) => (
                          <tr key={leave.id} className="hover:bg-slate-50 dark:hover:bg-[#18181d] transition-colors">
                            <td className="p-3">
                              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-[#18181d] border border-slate-200 dark:border-[#282830] text-slate-800 dark:text-slate-200">
                                {leave.leaveType}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-semibold text-slate-900 dark:text-white tabular-nums">{leave.startDate} to {leave.endDate}</span>
                              <span className="ml-2 text-[11px] text-blue-500 font-semibold">({leave.daysCount}d)</span>
                            </td>
                            <td className="p-3 text-slate-500 dark:text-[#9e9ea7] max-w-sm truncate" title={leave.reason}>
                              {leave.reason}
                            </td>
                            <td className="p-3 text-slate-500 dark:text-[#9e9ea7] text-[11px] whitespace-nowrap tabular-nums">
                              {leave.appliedOn || leave.startDate || new Date().toISOString().substring(0, 10)}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span
                                className={`rounded-md px-2.5 py-0.5 text-[10px] font-semibold border ${
                                  leave.status === 'Approved'
                                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40'
                                    : leave.status === 'Pending'
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
                                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40'
                                }`}
                              >
                                {leave.status}
                              </span>
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              {leave.status === 'Pending' ? (
                                <button
                                  type="button"
                                  onClick={() => handleCancelLeave(leave.id)}
                                  className="text-xs text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                                >
                                  Cancel Request
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 dark:text-[#686873]">Reviewed</span>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* HR Approvals View */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h2 className={ATT_PAGE_TITLE}>Leave Approvals</h2>
              </div>

              <div className="flex items-center gap-2">
                {(state.leaves || []).some((l) => l.status === 'Pending') && (
                  <button
                    type="button"
                    onClick={handleApproveAllPending}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white transition-[transform,background-color] duration-150 ease-out cursor-pointer shadow-sm active:scale-[0.97]"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowApplyLeaveModal(true)}
                  className={ATT_BTN_PRIMARY}
                >
                  <Plus className="h-4 w-4" /> Log Leave
                </button>
              </div>
            </div>

            <AttendanceStatCards
              columns={3}
              items={[
                {
                  id: 'pending',
                  label: 'Pending',
                  value: (state.leaves || []).filter((l) => l.status === 'Pending').length,
                  tone: 'leave',
                },
                {
                  id: 'approved',
                  label: 'Approved',
                  value: (state.leaves || []).filter((l) => l.status === 'Approved').length,
                  tone: 'present',
                },
                {
                  id: 'total',
                  label: 'Total',
                  value: (state.leaves || []).length,
                  tone: 'neutral',
                },
              ]}
            />

            {/* Filter Bar */}
            <AttendanceFilterToolbar
              searchPlaceholder="Search team member or reason…"
              searchValue={leaveSearchQuery}
              onSearchChange={setLeaveSearchQuery}
              selects={[
                {
                  id: 'leave-status',
                  value: leaveFilterStatus,
                  onChange: setLeaveFilterStatus,
                  'aria-label': 'Filter leave status',
                  options: [
                    { value: 'All', label: 'All Status' },
                    { value: 'Pending', label: 'Pending Only' },
                    { value: 'Approved', label: 'Approved' },
                    { value: 'Rejected', label: 'Rejected' },
                  ],
                },
              ]}
            />

            {/* Pending Requests Review Table (Scoped strictly to requests the persona has permission to approve) */}
            {(() => {
              const accessiblePendingLeaves = (state.leaves || []).filter((l) => {
                if (l.status !== 'Pending') return false;
                return canApproveLeave(state.currentPersona, l, state.employees);
              });

              if (accessiblePendingLeaves.length === 0) return null;

              return (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 overflow-hidden shadow-2xs">
                  <div className="p-3.5 bg-amber-100/50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/40 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                      <span>Pending Action Items ({accessiblePendingLeaves.length})</span>
                    </div>
                  </div>

                  {/* Mobile Pending Leave Cards */}
                  <div className="block md:hidden p-3.5 space-y-3">
                    {accessiblePendingLeaves.map((leave) => (
                      <div key={leave.id} className="p-3.5 rounded-xl border border-amber-200/80 bg-white space-y-2.5 shadow-2xs">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <button
                              type="button"
                              onClick={() => handleEmployeeClick(leave.employeeId || leave.employeeName)}
                              className="text-left font-bold text-slate-900 text-xs hover:text-blue-600 cursor-pointer"
                            >
                              {leave.employeeName}
                            </button>
                            <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                              {leave.startDate} to {leave.endDate} ({leave.daysCount}d)
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                            {leave.leaveType}
                          </span>
                        </div>

                        {leave.reason && (
                          <p className="text-[11px] text-slate-600 bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                            {leave.reason}
                          </p>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                          <span className="text-[10px] text-slate-400">Applied: {leave.appliedOn}</span>
                          {(() => {
                            const emp = state.employees.find(
                              (e) => e.id === leave.employeeId || (e.name && e.name.toLowerCase() === leave.employeeName.toLowerCase())
                            );
                            const inProbation = isEmployeeInProbation(emp, state.customOptions?.probationSettings);
                            const isPaid = isPaidLeaveType(leave.leaveType, (leave as any).isPaid);

                            return (
                              <div className="flex items-center gap-1.5">
                                {inProbation && isPaid ? (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveAsUnpaid(leave.id)}
                                    className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                                    title="Employee on probation: Approve as Loss of Pay (Unpaid)"
                                  >
                                    Approve as LOP
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveLeave(leave.id, true)}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold cursor-pointer transition-colors shadow-xs"
                                  >
                                    Approve
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleApproveLeave(leave.id, false)}
                                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-bold cursor-pointer transition-colors"
                                >
                                  Reject
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Pending Leave Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-amber-100/40 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 font-bold uppercase text-[10px] border-b border-amber-200/60 dark:border-amber-900/40">
                        <tr>
                          <th className="p-3">Employee</th>
                          <th className="p-3">Department</th>
                          <th className="p-3">Leave Type</th>
                          <th className="p-3">Period</th>
                          <th className="p-3">Reason</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-200/40 dark:divide-amber-900/30 font-medium">
                        {accessiblePendingLeaves.map((leave) => {
                          const emp = state.employees.find(
                            (e) => e.id === leave.employeeId || (e.name && e.name.toLowerCase() === leave.employeeName.toLowerCase())
                          );
                          const inProbation = isEmployeeInProbation(emp, state.customOptions?.probationSettings);
                          const isPaid = isPaidLeaveType(leave.leaveType, (leave as any).isPaid);

                          return (
                            <tr key={leave.id} className="hover:bg-amber-100/20 dark:hover:bg-amber-950/20 transition-colors">
                              <td className="p-3 font-bold text-slate-900 dark:text-white">
                                <button
                                  type="button"
                                  onClick={() => handleEmployeeClick(leave.employeeId || leave.employeeName)}
                                  className="text-left font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer"
                                >
                                  {leave.employeeName}
                                </button>
                                {inProbation && (
                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                    Probation
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-slate-500 dark:text-[#9e9ea7]">{leave.department || 'Operations'}</td>
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-[#18181d] border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200">
                                  {leave.leaveType}
                                </span>
                              </td>
                              <td className="p-3 whitespace-nowrap font-mono">
                                {leave.startDate} to {leave.endDate} <span className="text-amber-700 dark:text-amber-300 font-bold">({leave.daysCount}d)</span>
                              </td>
                              <td className="p-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={leave.reason}>
                                {leave.reason}
                              </td>
                              <td className="p-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {inProbation && isPaid ? (
                                    <button
                                      type="button"
                                      onClick={() => handleApproveAsUnpaid(leave.id)}
                                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-colors shadow-xs"
                                      title="Employee on probation: Approve as Loss of Pay (Unpaid)"
                                    >
                                      Approve LOP
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleApproveLeave(leave.id, true)}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer transition-colors shadow-xs"
                                    >
                                      Approve
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleApproveLeave(leave.id, false)}
                                    className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {/* All Leave Requests Table */}
            <div className="rounded-xl border border-slate-200/80 dark:border-[#282830] bg-white dark:bg-[#121214] overflow-hidden shadow-2xs">
              <div className="p-3.5 border-b border-slate-100 dark:border-[#282830]">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#9e9ea7]">All Workforce Leave Records</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-[#18181d] text-slate-500 dark:text-[#9e9ea7] font-bold uppercase text-[10px] border-b border-slate-200/80 dark:border-[#282830]">
                    <tr>
                      <th className="p-3">Employee</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Leave Type</th>
                      <th className="p-3">Dates & Days</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#282830] font-medium text-slate-800 dark:text-slate-200">
                    {(isSuperAdmin || isHR ? (state.leaves || []) : getTeamLeaves(state.currentPersona, state.leaves || [], state.employees))
                      .filter((l) => {
                        const matchesQuery =
                          !leaveSearchQuery ||
                          l.employeeName.toLowerCase().includes(leaveSearchQuery.toLowerCase()) ||
                          l.reason.toLowerCase().includes(leaveSearchQuery.toLowerCase());
                        const matchesStatus = leaveFilterStatus === 'All' || l.status === leaveFilterStatus;
                        return matchesQuery && matchesStatus;
                      })
                      .map((leave) => {
                        const hasApprovalPermission = canApproveLeave(state.currentPersona, leave, state.employees);

                        return (
                          <tr key={leave.id} className="hover:bg-slate-50 dark:hover:bg-[#18181d]">
                            <td className="p-3 font-bold text-slate-900 dark:text-white">
                              <button
                                type="button"
                                onClick={() => handleEmployeeClick(leave.employeeId || leave.employeeName)}
                                className="text-left font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline cursor-pointer transition-colors"
                                title={`View profile for ${leave.employeeName}`}
                              >
                                {leave.employeeName}
                              </button>
                            </td>
                            <td className="p-3 text-slate-500 dark:text-[#9e9ea7]">{leave.department || 'Operations'}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-[#18181d] border border-slate-200 dark:border-[#282830] text-slate-800 dark:text-slate-200">
                                {leave.leaveType}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap font-mono">
                              {leave.startDate} to {leave.endDate} <span className="text-blue-600 dark:text-blue-400 font-bold">({leave.daysCount}d)</span>
                            </td>
                            <td className="p-3 text-slate-500 dark:text-[#9e9ea7] max-w-xs truncate" title={leave.reason}>
                              {leave.reason}
                            </td>
                            <td className="p-3">
                              <span
                                className={`rounded-md px-2.5 py-0.5 text-[10px] font-semibold border ${
                                  leave.status === 'Approved'
                                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40'
                                    : leave.status === 'Pending'
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
                                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40'
                                }`}
                              >
                                {leave.status}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {hasApprovalPermission ? (
                                leave.status === 'Pending' ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleApproveLeave(leave.id, true)}
                                      className="text-xs text-emerald-600 hover:underline cursor-pointer font-bold"
                                    >
                                      Approve
                                    </button>
                                    <span>•</span>
                                    <button
                                      type="button"
                                      onClick={() => handleApproveLeave(leave.id, false)}
                                      className="text-xs text-rose-600 hover:underline cursor-pointer font-bold"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  (isSuperAdmin || isHR) ? (
                                    <button
                                      type="button"
                                      onClick={() => handleApproveLeave(leave.id, leave.status !== 'Approved')}
                                      className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                                    >
                                      Toggle
                                    </button>
                                  ) : (
                                    <span className="text-slate-400 text-xs">—</span>
                                  )
                                )
                              ) : (
                                <span className="text-slate-400 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* VIEW: ATTENDANCE / CAMPUS SETTINGS (Strictly Admin / HR Only) */}
      {subTab === 'settings' && (isSuperAdmin || isHR) && (
        <div className="pt-2">
          <AttendanceSettingsView state={state} onUpdateState={onUpdateState} />
        </div>
      )}

      {/* VIEW: HOLIDAY CALENDAR */}
      {subTab === 'holidays' && (
        <div className="pt-2">
          <HolidayCalendarView
            holidays={state.customOptions?.holidays}
            onUpdateHolidays={(updated) => {
              if (onUpdateState) {
                onUpdateState((prev) => ({
                  ...prev,
                  customOptions: {
                    ...prev.customOptions,
                    holidays: updated,
                  },
                }));
              }
              void api.attendance.saveHolidays({ holidays: updated }).then((res) => {
                if (!res.success) {
                  console.warn('[Holidays] Failed to persist:', res.error?.message || res);
                }
              });
            }}
            isHR={isSuperAdmin || isHR}
          />
        </div>
      )}

      {/* CLOCK OUT POPUP MODAL */}
      {showClockOutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl text-slate-900 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Clock out at {currentTimeFormatted}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Your total working time for today is {formatTimer(currentElapsedSeconds)}
              </p>
            </div>

            <div>
              <textarea
                value={clockOutNotes}
                onChange={(e) => setClockOutNotes(e.target.value)}
                placeholder="Notes (optional)..."
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 transition-colors"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClockOutModal(false)}
                className="rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700 cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClockOut}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 px-5 py-2 text-xs font-bold text-white cursor-pointer transition-all shadow-xs active:scale-98"
              >
                Clock Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPLY REGULARIZATION SLIDE-OVER DRAWER (MATCHING ADD TASK UI) */}
      {showRegModal && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full sm:max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 text-slate-900">
            {/* Drawer Header */}
            <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <h3 className="text-xl sm:text-2xl font-bold text-slate-900">Apply for Regularization</h3>
              <button
                type="button"
                onClick={() => setShowRegModal(false)}
                className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors duration-150 active:scale-[0.97]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleApplyRegularizationSubmit} autoComplete="off" className="flex-1 flex flex-col justify-between overflow-hidden bg-white">
              <div className="p-8 space-y-5 overflow-y-auto custom-scrollbar text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Target Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    name="regularizationDate"
                    value={regDate}
                    onChange={(e) => setRegDate(e.target.value)}
                    max={toLocalISODate()}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Requested In-Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      name="requestedInTime"
                      autoComplete="off"
                      value={to24HourTime(regInTime)}
                      onChange={(e) => setRegInTime(to12HourClockTime(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-2">
                      Requested Out-Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      name="requestedOutTime"
                      autoComplete="off"
                      value={to24HourTime(regOutTime)}
                      onChange={(e) => setRegOutTime(to12HourClockTime(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Reason for Regularization <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={regReason}
                    onChange={(e) => setRegReason(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                  >
                    <option value="Client Visit">Client Visit / Offsite Meeting</option>
                    <option value="Network / GPS Error">GPS Accuracy / Technical Glitch</option>
                    <option value="Forgot Punch">Forgot to Clock In / Out</option>
                    <option value="Half Day Work">Half Day Authorized Work</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Detailed Remarks / Explanation <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={regRemarks}
                    onChange={(e) => setRegRemarks(e.target.value)}
                    placeholder="Provide detailed context for manager approval..."
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all resize-none"
                    required
                  />
                </div>
              </div>

              {/* Drawer Form Footer */}
              <div className="p-4 sm:p-6 sm:px-8 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowRegModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 cursor-pointer transition-colors duration-150 shadow-2xs active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* CONFIRM PUNCH LOCATION FULL-SCREEN / EXPANDED MODAL (WHITE THEME) */}
      {showPunchLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="relative w-full max-w-5xl h-[92vh] max-h-[850px] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
          >
            {/* Symmetrical Refined Header Bar */}
            <div
              className="relative px-6 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0"
              style={{ backgroundColor: '#ffffff' }}
            >
              <button
                type="button"
                onClick={() => setShowPunchLocationModal(false)}
                className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors duration-150 cursor-pointer active:scale-[0.97]"
                title="Go back"
              >
                <ChevronLeft className="h-5 w-5 stroke-[2]" />
              </button>

              <h2
                className="absolute left-1/2 -translate-x-1/2 text-sm sm:text-base font-semibold tracking-tight select-none"
                style={{ color: '#0f172a' }}
              >
                {punchStep === 'map' ? 'Confirm Punch Location' : 'Outside Authorized Geofence'}
              </h2>

              <button
                type="button"
                onClick={() => setShowPunchLocationModal(false)}
                className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                title="Close modal"
              >
                <X className="h-4 w-4 stroke-[2]" />
              </button>
            </div>

            {/* Main Interactive Leaflet Map View (or out-of-geofence warning) */}
            {punchStep === 'map' ? (
              <div
                className="flex-1 relative overflow-hidden flex flex-col justify-between"
                style={{ backgroundColor: '#f1f5f9' }}
              >
                <PunchLocationLeafletMap
                  latitude={currentLat}
                  longitude={currentLng}
                  onRecalibrateGPS={fetchCurrentLocation}
                  isLocating={isLocating}
                />
              </div>
            ) : (
              /* OUT-OF-RADIUS WARNING STEP */
              <div
                className="flex-1 p-8 sm:p-12 flex flex-col items-center justify-center text-center space-y-6 bg-white text-slate-900"
              >
                <div className="max-w-md space-y-1.5">
                  <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-rose-600">
                    Outside Authorized Geofence
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    You are <strong className="text-slate-900">{geofenceDistanceMeters > 1000 ? `${(geofenceDistanceMeters / 1000).toFixed(1)} km` : `${geofenceDistanceMeters} meters`}</strong> away from <strong>{activeOfficeDisplayName}</strong>. Maximum boundary is <strong>{configuredGeofenceRadius} meters</strong>.
                  </p>
                </div>

                <div
                  className="w-full max-w-md p-4 rounded-xl border border-rose-200 bg-rose-50/60 text-left text-xs leading-relaxed shadow-xs text-rose-700"
                >
                  <p>
                    {isInstitution || isStudentMode || isStudentLogin
                      ? 'Campus attendance is blocked because you are outside the authorized campus boundary. You must be physically present on campus to punch attendance.'
                      : 'Physical office attendance is blocked because you are not within the office radius. You must be physically at the location or switch to Work From Home (WFH).'}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2 w-full max-w-md">
                  <button
                    type="button"
                    onClick={() => setPunchStep('map')}
                    className="w-full sm:flex-1 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    Back to Map
                  </button>
                  {!isInstitution && !isStudentMode && !isStudentLogin && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLocation('wfh');
                        handleOpenSelfieCamera(true);
                      }}
                      className="w-full sm:flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs transition-all cursor-pointer active:scale-98"
                    >
                      Switch to WFH & Proceed
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Bar: Live Address Header & Time with Punch Button */}
            {punchStep === 'map' && (
              <div
                className="border-t border-slate-200 shrink-0 bg-white"
              >
                {isGeofenceOptional && selectedLocation !== 'wfh' && (
                  <div className="px-6 py-2 bg-amber-50 border-b border-amber-100 text-[11px] font-medium text-amber-800">
                    Geofence is optional or disabled in Attendance Settings — office radius is not enforced for this punch.
                  </div>
                )}
                {!isGeofenceOptional && selectedLocation !== 'wfh' && !hasConfiguredOfficeCoords && (
                  <div className="px-6 py-2 bg-rose-50 border-b border-rose-100 text-[11px] font-medium text-rose-700">
                    Office GPS coordinates are not configured. Set latitude/longitude in Settings, or switch to WFH to punch remotely.
                  </div>
                )}
                {/* SECTION 1: Live Resolved Address */}
                <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4">
                  <p
                    className={`text-xs font-medium leading-relaxed truncate ${gpsStatus === 'denied' && selectedLocation !== 'wfh' ? 'text-rose-600' : 'text-slate-800'
                      }`}
                  >
                    {isLocating
                      ? 'Acquiring device GPS location...'
                      : selectedLocation === 'wfh' && gpsStatus === 'denied'
                        ? 'Remote / Work From Home — Location unrestricted'
                        : selectedLocation === 'wfh'
                          ? `${punchAddress} (WFH)`
                          : punchAddress}
                  </p>
                  {gpsStatus === 'denied' && selectedLocation !== 'wfh' && (
                    <button
                      type="button"
                      onClick={fetchCurrentLocation}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer shrink-0"
                    >
                      Retry GPS
                    </button>
                  )}
                </div>

                {/* SECTION 2: Real-time Clock & Punch Location Action Button */}
                <div className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <span
                      className="text-xl sm:text-2xl font-bold tracking-tight leading-none block tabular-nums text-slate-900"
                      suppressHydrationWarning
                    >
                      {currentTimeFormatted}
                    </span>
                    <span
                      className="text-xs text-slate-500 font-medium block"
                    >
                      {isMounted ? now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : 'Monday, 24 Aug 2026'}
                    </span>
                  </div>

                  {/* Punch Location Button — opens camera directly (skips Location Verified confirm) */}
                  {(() => {
                    const officeCoordsMissing =
                      !isGeofenceOptional && selectedLocation !== 'wfh' && !hasConfiguredOfficeCoords;
                    const isOutsideOffice =
                      !isGeofenceOptional &&
                      selectedLocation !== 'wfh' &&
                      hasConfiguredOfficeCoords &&
                      hasDeviceGpsLocation &&
                      !isInsideRadius;
                    const gpsRequiredMissing =
                      !isGeofenceOptional &&
                      selectedLocation !== 'wfh' &&
                      hasConfiguredOfficeCoords &&
                      (!hasDeviceGpsLocation || gpsStatus !== 'granted');
                    const isPunchDisabled = isLocating || officeCoordsMissing || gpsRequiredMissing;
                    const punchHoverTitle = officeCoordsMissing
                      ? 'Configure office latitude/longitude in Settings, or switch to WFH'
                      : isOutsideOffice
                      ? 'You are outside the authorized geofence — continue to see details'
                      : isLocating
                      ? 'Acquiring device GPS location...'
                      : gpsRequiredMissing
                      ? 'Location permission is required to verify office attendance'
                      : selectedLocation === 'wfh'
                      ? 'Punch from anywhere (WFH mode)'
                      : isGeofenceOptional
                      ? 'Geofence optional — proceed with punch'
                      : 'Proceed to face verification';

                    return (
                      <div title={punchHoverTitle} className={isPunchDisabled ? 'cursor-not-allowed' : ''}>
                        <button
                          type="button"
                          onClick={handleProceedFromMap}
                          disabled={isPunchDisabled}
                          title={punchHoverTitle}
                          className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all duration-150 shrink-0 ${isPunchDisabled
                              ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                              : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] text-white shadow-xs cursor-pointer'
                            }`}
                        >
                          Punch Location
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ─── SELFIE CAMERA MODAL ───────────────────────────────────────────────────
  const selfieModal = showSelfieModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-5xl h-[92vh] max-h-[850px] rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ backgroundColor: '#ffffff', color: '#0f172a' }}
      >
        {/* Symmetrical Header Bar */}
        <div
          className="relative px-6 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0"
          style={{ backgroundColor: '#ffffff' }}
        >
          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              setShowSelfieModal(false);
              setShowPunchLocationModal(true);
              setPunchStep('map');
            }}
            className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="Back to location map"
          >
            <ChevronLeft className="h-5 w-5 stroke-[2]" />
          </button>

          <h2
            className="absolute left-1/2 -translate-x-1/2 text-sm sm:text-base font-semibold tracking-tight select-none"
            style={{ color: '#0f172a' }}
          >
            Face Verification
          </h2>

          <button
            type="button"
            onClick={() => {
              stopCameraStream();
              setShowSelfieModal(false);
            }}
            className="h-9 w-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="h-4 w-4 stroke-[2]" />
          </button>
        </div>

        {/* Camera / Photo Viewport Area */}
        <div className="flex-1 relative overflow-hidden flex flex-col justify-center items-center bg-slate-950 select-none min-h-[360px]">
          {/* Flash Effect on capture */}
          {isFlashing && (
            <div className="absolute inset-0 bg-white z-50 pointer-events-none animate-camera-flash" />
          )}

          {cameraError ? (
            /* Redesigned Camera Permission / Offline State */
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950 text-center animate-in fade-in duration-200 z-30 select-none">
              <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-2xl flex flex-col items-center space-y-4">
                <div className="space-y-1.5">
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Camera Access Required
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                    {cameraError}
                  </p>
                </div>

                <div className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 space-y-1 text-left leading-relaxed">
                  <p>1. Allow camera permissions when prompted.</p>
                  <p>2. Click Retry Camera below to reconnect.</p>
                  {isNativePlatform() && <p>3. Or use Use Device Camera to open the system camera.</p>}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full pt-1">
                  <button
                    type="button"
                    onClick={handleRetryCamera}
                    disabled={isCameraLoading}
                    className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-xs font-bold text-white transition-all shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isCameraLoading ? 'Connecting Camera...' : 'Retry Camera'}
                  </button>
                  {isNativePlatform() && (
                    <button
                      type="button"
                      onClick={() => void handleNativeCameraCapture()}
                      disabled={isCameraLoading}
                      className="w-full py-2.5 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 active:bg-slate-800 text-xs font-bold text-white transition-all cursor-pointer disabled:opacity-50 border border-slate-600"
                    >
                      Use Device Camera
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleFinalConfirmPunch(selfieAsRemote, null)}
                    className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-xs font-semibold text-slate-300 transition-colors cursor-pointer border border-slate-700/60"
                  >
                    Skip & Punch
                  </button>
                </div>
              </div>
            </div>
          ) : capturedSelfie ? (
            /* Captured Selfie Preview */
            <div className="relative w-full h-full">
              <img
                src={capturedSelfie}
                alt="Captured selfie preview"
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            /* Clean Live Camera Feed */
            <div className="relative w-full h-full bg-slate-950 flex items-center justify-center">
              {isCameraLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-20">
                  <div className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-slate-900/60 border border-slate-800/60">
                    <div className="h-9 w-9 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    <p className="text-xs font-semibold text-slate-300">Connecting live camera...</p>
                    <span className="text-[10px] text-slate-500 font-medium">Requesting video stream</span>
                  </div>
                </div>
              )}

              {/* Video element - Clean Mirrored Live Feed */}
              <video
                ref={videoRef}
                className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-300 ${
                  isCameraReady ? 'opacity-100' : 'opacity-0'
                }`}
                autoPlay
                playsInline
                muted
              />
            </div>
          )}
        </div>

        {/* Hidden Canvas for High-Res Capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Bottom Bar: Clock on Left & Action Buttons on Right */}
        <div
          className="border-t border-slate-200 shrink-0 bg-white"
        >
          <div className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-0.5">
              <span
                className="text-xl sm:text-2xl font-bold tracking-tight leading-none block tabular-nums text-slate-900"
                suppressHydrationWarning
              >
                {currentTimeFormatted}
              </span>
              <span
                className="text-xs text-slate-500 font-medium block"
              >
                {isMounted ? now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : 'Monday, 24 Aug 2026'}
              </span>
            </div>

            {/* Action Buttons */}
            {capturedSelfie ? (
              /* Review Mode Actions: Retake + Submit */
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleRetake}
                  className="px-4 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={() => handleFinalConfirmPunch(selfieAsRemote, capturedSelfie)}
                  className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Confirm Punch
                </button>
              </div>
            ) : (
              /* Live Camera Shutter Action */
              <button
                type="button"
                onClick={handleTakePhoto}
                disabled={isCameraLoading || !isCameraReady || !!cameraError}
                className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                {cameraError ? 'Camera Offline' : isCameraLoading || !isCameraReady ? 'Connecting...' : 'Take Photo'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // ─── DUAL PHOTO INSPECTION MODAL (CHECK IN & CHECK OUT) ─────────────────
  const photoInspectionModal = selectedAttendancePhotoRecord && (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-xs animate-in fade-in duration-150 cursor-pointer p-4"
      onClick={() => setSelectedAttendancePhotoRecord(null)}
    >
      <div
        className="relative max-w-2xl w-full bg-[#121214] border border-[#282830] rounded-2xl p-6 shadow-2xl text-white space-y-5 animate-in zoom-in-95 duration-150 cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#282830] pb-4">
          <div>
            <h3 className="text-base font-bold text-white">
              Attendance Verification Photos
            </h3>
            <p className="text-xs text-[#9e9ea7] mt-0.5">
              {selectedAttendancePhotoRecord.employeeName} • {selectedAttendancePhotoRecord.date}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedAttendancePhotoRecord(null)}
            className="h-8 w-8 rounded-full bg-[#18181d] hover:bg-[#25252c] border border-[#282830] text-[#9e9ea7] hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Grid of Two Photo Cards (Check In & Check Out) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Check In Photo */}
          <div className="rounded-xl border border-[#282830] bg-[#18181d] p-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Check In Photo</span>
              <span className="text-[11px] font-mono font-semibold text-blue-400 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded">
                {selectedAttendancePhotoRecord.checkIn ? selectedAttendancePhotoRecord.checkIn.replace(/\s*\(GMT[^\)]*\)/gi, '').trim() : 'Logged'}
              </span>
            </div>

            <div className="rounded-xl overflow-hidden border border-[#282830] aspect-[4/3] bg-black flex items-center justify-center">
              {(selectedAttendancePhotoRecord.checkInPhoto || selectedAttendancePhotoRecord.selfiePhoto) ? (
                <img
                  src={selectedAttendancePhotoRecord.checkInPhoto || selectedAttendancePhotoRecord.selfiePhoto}
                  alt="Check In Selfie"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4 space-y-1.5 text-[#9e9ea7]">
                  <Camera className="h-6 w-6 mx-auto text-[#686873]" />
                  <p className="text-xs font-medium">No check-in photo recorded</p>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Check Out Photo */}
          <div className="rounded-xl border border-[#282830] bg-[#18181d] p-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">Check Out Photo</span>
              <span className="text-[11px] font-mono font-semibold text-blue-400 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded">
                {selectedAttendancePhotoRecord.checkOut ? selectedAttendancePhotoRecord.checkOut.replace(/\s*\(GMT[^\)]*\)/gi, '').trim() : 'Pending'}
              </span>
            </div>

            <div className="rounded-xl overflow-hidden border border-[#282830] aspect-[4/3] bg-black flex items-center justify-center">
              {selectedAttendancePhotoRecord.checkOutPhoto ? (
                <img
                  src={selectedAttendancePhotoRecord.checkOutPhoto}
                  alt="Check Out Selfie"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4 space-y-1.5 text-[#9e9ea7]">
                  <ImageOff className="h-6 w-6 mx-auto text-[#686873]" />
                  <p className="text-xs font-medium">
                    {!selectedAttendancePhotoRecord.checkOut ? 'No photo yet' : 'No photo uploaded'}
                  </p>
                  {!selectedAttendancePhotoRecord.checkOut && (
                    <p className="text-[10px] text-[#686873]">Check out hasn't happened yet</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ─── EDIT ATTENDANCE TIMES SLIDE-OVER DRAWER (MATCHING ADD TASK UI) ───
  const editAttendanceModal = editingAttendanceRecord && (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={() => setEditingAttendanceRecord(null)}
    >
      <div
        className="relative w-full max-w-lg md:max-w-xl h-full bg-white dark:bg-[#121214] border-l border-slate-100 dark:border-[#282830] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 text-slate-900 dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-6 sm:px-8 border-b border-slate-100 dark:border-[#282830] flex items-center justify-between bg-white dark:bg-[#121214] shrink-0">
          <div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Edit Attendance Times</h3>
            <p className="text-xs text-slate-500 dark:text-[#9e9ea7] mt-1 font-medium">
              {editingAttendanceRecord.employeeName} • {editingAttendanceRecord.date}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingAttendanceRecord(null)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-2 cursor-pointer rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181d] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Form Body */}
        <form onSubmit={handleSaveAttendanceRecord} className="flex-1 flex flex-col justify-between overflow-hidden bg-white dark:bg-[#121214]">
          <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar text-xs">
            {/* Quick Shift Presets */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Quick Shift Presets
              </label>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const checkIn24 = to24HourTime(editCheckIn);
                  const checkOut24 = to24HourTime(editCheckOut);
                  const isGeneral = checkIn24 === '09:00' && checkOut24 === '18:00';
                  const isMorning = checkIn24 === '08:00' && checkOut24 === '17:00';
                  const isHalfDay = checkIn24 === '09:00' && checkOut24 === '13:30';

                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTimeChange('09:00:00 AM', '06:00:00 PM')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isGeneral
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40'
                            : 'bg-slate-100 dark:bg-[#1f1f26] text-slate-700 dark:text-slate-300 border border-transparent hover:bg-slate-200 dark:hover:bg-[#282830]'
                        }`}
                      >
                        General (9 AM - 6 PM)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimeChange('08:00:00 AM', '05:00:00 PM')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isMorning
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40'
                            : 'bg-slate-100 dark:bg-[#1f1f26] text-slate-700 dark:text-slate-300 border border-transparent hover:bg-slate-200 dark:hover:bg-[#282830]'
                        }`}
                      >
                        Morning (8 AM - 5 PM)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimeChange('09:00:00 AM', '01:30:00 PM')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isHalfDay
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40'
                            : 'bg-slate-100 dark:bg-[#1f1f26] text-slate-700 dark:text-slate-300 border border-transparent hover:bg-slate-200 dark:hover:bg-[#282830]'
                        }`}
                      >
                        Half Day (9 AM - 1:30 PM)
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Check In / Check Out Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Check In Time <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  value={to24HourTime(editCheckIn)}
                  onChange={(e) => {
                    const val24 = e.target.value;
                    const val12 = to12HourTime(val24);
                    handleTimeChange(val12, editCheckOut);
                  }}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm text-slate-800 dark:text-white font-mono font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Check Out Time
                </label>
                <input
                  type="time"
                  value={to24HourTime(editCheckOut)}
                  onChange={(e) => {
                    const val24 = e.target.value;
                    const val12 = to12HourTime(val24);
                    handleTimeChange(editCheckIn, val12);
                  }}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm text-slate-800 dark:text-white font-mono font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer"
                />
              </div>
            </div>

            {/* Logged Hours & Attendance Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Logged Hours <span className="text-rose-500">*</span>
                  </label>
                  {editCheckIn && editCheckOut && (
                    <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                      Auto-calculated
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="24"
                  value={editWorkingHours}
                  onChange={(e) => setEditWorkingHours(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm text-slate-800 dark:text-white font-mono font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Attendance Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm text-slate-800 dark:text-white font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                >
                  <option value="Present">Present</option>
                  <option value="Late">Late</option>
                  <option value="Half Day">Half Day</option>
                  {!isInstitution && <option value="Work From Home">Work From Home</option>}
                  <option value="On Leave">On Leave</option>
                  <option value="Absent">Absent</option>
                </select>
              </div>
            </div>
          </div>

          {/* Drawer Form Footer */}
          <div className="p-6 px-8 border-t border-slate-100 dark:border-[#282830] bg-white dark:bg-[#121214] flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setEditingAttendanceRecord(null)}
              className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] hover:bg-slate-50 dark:hover:bg-[#202028] text-sm font-semibold text-slate-700 dark:text-slate-300 cursor-pointer transition-colors shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99]"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  {/* APPLY LEAVE / LOG LEAVE MODAL (Simplified Modern Slide-over Drawer) */}
  const applyLeaveModal = showApplyLeaveModal && (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg md:max-w-xl h-full bg-white dark:bg-[#121214] border-l border-slate-100 dark:border-[#282830] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 text-slate-900 dark:text-white">
        
        {/* Drawer Header */}
        <div className="p-4 sm:p-7 sm:px-8 border-b border-slate-100 dark:border-[#282830] flex items-center justify-between bg-white dark:bg-[#121214] shrink-0">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {isSuperAdmin || isHR ? 'Log Leave for Employee' : 'Apply for Leave'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#9e9ea7] mt-0.5">
              {isSuperAdmin || isHR
                ? 'Submit time-off request with duration, balance quota, and reason.'
                : 'Submit time-off request for approval with duration and reason.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowApplyLeaveModal(false)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#1f1f26] cursor-pointer transition-colors shrink-0"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Form Body */}
        <form onSubmit={handleApplyLeaveSubmit} className="flex-1 flex flex-col justify-between overflow-hidden bg-white dark:bg-[#121214]">
          <div className="p-4 sm:p-8 space-y-4 sm:space-y-5 overflow-y-auto custom-scrollbar text-xs">

            {/* Probation Notice Banner if Target is in Probation */}
            {modalIsProbation && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                <div className="text-xs space-y-0.5">
                  <p className="font-bold">Probation Active: Paid Leaves Restricted</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    This employee is currently in probation. Casual, Sick, and Earned leaves have 0 balance per company policy. Absences must be logged as Loss of Pay (LOP / Unpaid).
                  </p>
                </div>
              </div>
            )}

            {/* 1. Assignee Member or Requester */}
            {isSuperAdmin || isHR ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Assignee Member <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedLeaveEmpId}
                  onChange={(e) => setSelectedLeaveEmpId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm font-medium text-slate-800 dark:text-white outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
                >
                  <option value={state.currentPersona.id} className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white font-bold">
                    Myself ({state.currentPersona.name}) — {state.currentPersona.role.replace('_', ' ')}
                  </option>
                  {state.employees
                    .filter((e) => e.id !== state.currentPersona.id)
                    .map((e) => (
                      <option key={e.id} value={e.id} className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white">
                        {e.name} ({e.employeeId || e.id}) • {e.designation || 'Staff'} — {e.department}
                      </option>
                    ))}
                </select>
              </div>
            ) : isManagerUser && managerDirectReports.length > 0 ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Leave For <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedLeaveEmpId}
                  onChange={(e) => setSelectedLeaveEmpId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm font-medium text-slate-800 dark:text-white outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
                >
                  <option value={state.currentPersona.id} className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white font-bold">
                    Myself ({state.currentPersona.name})
                  </option>
                  {managerDirectReports.map((e) => (
                    <option key={e.id} value={e.id} className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white">
                      {e.name} ({e.employeeId || e.id}) • Direct Report — {e.designation || 'Staff'}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Requester
                </label>
                <div className="p-3.5 rounded-xl border border-slate-200/80 dark:border-[#282830] bg-slate-50/70 dark:bg-[#18181d] text-xs text-slate-800 dark:text-white font-medium flex items-center justify-between">
                  <span>{state.currentPersona.name} ({state.currentPersona.role.replace('_', ' ')})</span>
                  <span className="text-slate-500 font-semibold">{state.currentPersona.department}</span>
                </div>
              </div>
            )}

            {/* 2. Leave Category (Respecting Probation Restrictions) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Leave Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as any)}
                className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm font-medium text-slate-800 dark:text-white outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
              >
                {modalIsProbation ? (
                  <>
                    <option value="Unpaid Leave" className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white font-bold">
                      Loss of Pay (LOP) / Unpaid Leave (Standard for Probation)
                    </option>
                    <option value="Casual Leave" disabled className="bg-slate-100 text-slate-400">
                      Casual Leave (0 Days Available • Restricted in Probation)
                    </option>
                    <option value="Sick Leave" disabled className="bg-slate-100 text-slate-400">
                      Sick Leave (0 Days Available • Restricted in Probation)
                    </option>
                    <option value="Earned Leave" disabled className="bg-slate-100 text-slate-400">
                      Earned / Privilege Leave (0 Days Available • Restricted in Probation)
                    </option>
                  </>
                ) : (
                  <>
                    <option value="Casual Leave" className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white">
                      Casual Leave ({modalCasualLeft}/{modalTargetQuotas.annualQuotas.casualLeave} Days Remaining)
                    </option>
                    <option value="Sick Leave" className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white">
                      Sick Leave ({modalSickLeft}/{modalTargetQuotas.annualQuotas.sickLeave} Days Remaining)
                    </option>
                    <option value="Earned Leave" className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white">
                      Earned / Privilege Leave ({modalEarnedLeft}/{modalTargetQuotas.annualQuotas.earnedLeave} Days Remaining)
                    </option>
                    {!isInstitution && (
                      <option value="Work From Home" className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white">
                        Work From Home ({modalWfhLeft}/{modalTargetQuotas.annualQuotas.compOff} Days Remaining)
                      </option>
                    )}
                    <option value="Unpaid Leave" className="bg-white dark:bg-[#18181d] text-slate-800 dark:text-white">
                      Unpaid Leave / Loss of Pay
                    </option>
                  </>
                )}
              </select>
            </div>

            {/* 3. Duration Scope (Clean 3-Tab Segmented Control) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Duration Scope <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-[#18181d] rounded-xl border border-slate-200 dark:border-[#282830]">
                {[
                  { key: 'single', label: 'Single Day' },
                  { key: 'half', label: 'Half Day (0.5d)' },
                  { key: 'multi', label: 'Date Range' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setDayMode(tab.key as any)}
                    className={`py-2 px-2 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
                      dayMode === tab.key
                        ? 'bg-white dark:bg-[#25252e] text-slate-900 dark:text-white font-bold shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Half Day Sub-session buttons */}
              {dayMode === 'half' && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setHalfSession('First Half (Morning)')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-center ${
                      halfSession === 'First Half (Morning)'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                        : 'border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    First Half (Morning)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHalfSession('Second Half (Afternoon)')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-center ${
                      halfSession === 'Second Half (Afternoon)'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                        : 'border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Second Half (Afternoon)
                  </button>
                </div>
              )}
            </div>

            {/* 4. Date Input */}
            {dayMode !== 'multi' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Date of Time Off <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={singleDate}
                  onChange={(e) => setSingleDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm text-slate-800 dark:text-white font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer shadow-2xs"
                  required
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      Start Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm text-slate-800 dark:text-white font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer shadow-2xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                      End Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      min={startDate}
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm text-slate-800 dark:text-white font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer shadow-2xs"
                      required
                    />
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#18181d] border border-slate-200/80 dark:border-[#282830] flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Total Duration:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {computedLeaveDays} {computedLeaveDays === 1 ? 'Business Day' : 'Business Days'}
                  </span>
                </div>
              </div>
            )}

            {/* 5. Work Handover Colleague */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Work Handover Colleague <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <select
                value={leaveHandover}
                onChange={(e) => setLeaveHandover(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] px-4 py-3 text-sm font-medium text-slate-800 dark:text-white outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
              >
                <option value="">(None - Self Managed)</option>
                {state.employees
                  .filter((e) => e.id !== modalTargetEmpId && e.employeeId !== modalTargetEmpId)
                  .map((e) => (
                    <option key={e.id} value={e.name}>
                      {e.name} ({e.designation || 'Staff'}) — {e.department}
                    </option>
                  ))}
              </select>
            </div>

            {/* 6. Reason & Handover Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Reason & Handover Notes <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Provide a feasible reason or deliverables handover notes..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#18181d] p-3.5 text-sm text-slate-800 dark:text-white placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all resize-none shadow-2xs"
                required
              />
            </div>

          </div>

          {/* Drawer Form Footer */}
          <div className="p-4 sm:p-6 sm:px-8 border-t border-slate-100 dark:border-[#282830] bg-white dark:bg-[#121214] flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-[#282830]">
            <span className="text-xs text-slate-500 dark:text-[#9e9ea7]">
              {modalIsProbation
                ? `Logs ${computedLeaveDays} day(s) as Loss of Pay (Probation)`
                : `Deducts ${computedLeaveDays} day(s) from ${leaveType}`}
            </span>
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setShowApplyLeaveModal(false)}
                className="px-5 py-2.5 sm:py-3 rounded-xl border border-slate-200 dark:border-[#282830] text-slate-600 dark:text-slate-300 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-[#18181d] cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 sm:py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99]"
                style={{ color: '#ffffff' }}
              >
                {isSuperAdmin || isHR ? 'Log Leave Request' : 'Submit Application'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {mainContent}
      {selfieModal}
      {photoInspectionModal}
      {editAttendanceModal}
      {applyLeaveModal}
      {probationBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#18181d] rounded-2xl border border-slate-200 dark:border-[#282830] max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500">
              <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Probation Policy: Paid Leave Restricted
                </h3>
                <p className="text-xs text-slate-500">
                  {probationBlockModal.leave.employeeName} is currently in probation
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-amber-50/60 dark:bg-amber-500/5 p-3 rounded-xl border border-amber-200/80">
              In accordance with company probation policy, employees in probation are not eligible for paid leaves (
              <span className="font-bold">{probationBlockModal.leave.leaveType}</span>). Paid leaves cannot be approved.
              You can approve this request as <span className="font-bold text-slate-900 dark:text-white">Loss of Pay (Unpaid Leave)</span> or reject it.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProbationBlockModal(null)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#282830] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleApproveLeave(probationBlockModal.leave.id, false);
                  setProbationBlockModal(null);
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 cursor-pointer"
              >
                Reject Leave
              </button>
              <button
                type="button"
                onClick={() => handleApproveAsUnpaid(probationBlockModal.leave.id)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs cursor-pointer"
              >
                Approve as Loss of Pay (LOP)
              </button>
            </div>
          </div>
        </div>
      )}
      <AttendanceReportsModal
        isOpen={showReportsModal}
        onClose={() => setShowReportsModal(false)}
        state={state}
        initialReportType={reportsModalInitialType}
      />
    </>
  );
};
