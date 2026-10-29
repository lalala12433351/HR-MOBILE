'use client';
import './people-attendance.css';
import { WorkspacePagination } from '@/components/common/WorkspacePagination';
import { MyLeavesView } from './attendance/MyLeavesView';
import { RegularizationRequestsView } from './attendance/RegularizationRequestsView';
import { DateInput } from '@/components/common/DateInput';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { MobileTeamAttendance } from '@/components/mobile/MobileTeamAttendance';
import { MobileTimeOff } from '@/components/mobile/MobileTimeOff';
import { MobileRow, MobileSection } from '@/components/mobile/MobilePrimitives';
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
  Send,
  Sparkles,
  Paperclip,
  Briefcase,
  Printer,
} from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { AppState } from '../../services/store';
import { AttendanceRecord, AttendanceRegularization, Employee, LeaveRequest } from '../../types';
import { AttendanceReportsModal } from './attendance/AttendanceReportsModal';
import { HolidayCalendarView } from './attendance/HolidayCalendarView';
import { AttendanceStatCards } from './attendance/AttendanceStatCards';
import { AttendanceFilterToolbar } from './attendance/AttendanceFilterToolbar';
import { AttendanceOverviewChart } from './attendance/AttendanceOverviewChart';
import { AttendanceStatusPill } from './attendance/AttendanceStatusPill';
import { MyAttendanceTodayPanel } from './attendance/MyAttendanceTodayPanel';
import { MyAttendanceLogTable } from './attendance/MyAttendanceLogTable';
import { MobileAttendanceHistory } from './attendance/MobileAttendanceHistory';
import {
  ATT_BTN_PRIMARY,
  ATT_BTN_SECONDARY,
  ATT_CARD,
  ATT_SECTION_TITLE,
  ATT_TABLE_HEAD,
  ATT_TABLE_SHELL,
} from './attendance/attendanceUi';
import { UserAvatar } from '../common/UserAvatar';
import { PunchLocationLeafletMap } from '../common/PunchLocationLeafletMap';
import { reverseGeocodeLatLng } from '@/lib/googleMaps';
import { api, type ApiResponse } from '../../services/apiClient';
import { applyTaskSessions, persistClockOutTaskSessions } from '../../utils/taskBoard';
import {
  aggregatePunchesToDaily,
  applyPunchToDailyRecord,
  attendanceDayKey,
  attendanceElapsedSeconds,
  checkoutStillAhead,
  hasOpenAttendanceSession,
  isArrivalLate,
  isAttendanceToday,
  isPlaceholderCheckout,
  isRemotePlace,
  orgGraceMinutes,
  sessionsFromRecord,
  toLocalDateKey,
} from '@/utils/attendancePunches';
import { resolveEmployeeShiftTiming } from '@/utils/employeeShift';
import { captureMirroredSelfie } from '@/utils/selfieCapture';
import { isInstitutionMode } from '@/utils/organizationMode';

import {
  isExecutiveOrAdmin,
  isHRPersona,
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
import { leaveBelongsToEmployee } from '../../utils/mapLeaveRow';
import { approvedAbsenceOnDay } from '@/utils/dashboardPeople';
import { applyLeaveBalancesToEmployees } from '../../utils/applyLeaveBalances';
import {
  applyHoursMethod,
  calendarWeekRange,
  dateKey,
  employeeInLocationScope,
  isScheduledWorkingDay,
  onOrAfterStart,
  parseDateKey,
} from '@/utils/attendanceRules';
import {
  eachDateInclusive,
  ensurePendingWfhRegularization,
  hasActiveWfhAuthorization,
  isWfhRegularization,
} from '../../utils/wfhRegularization';
import { useWfhRejectionWatch } from '@/hooks/useWfhRejectionWatch';

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

type TeamStatusType = 'on_time' | 'late' | 'logged_out' | 'not_in_yet' | 'time_off' | 'off_day';
type TeamGeoLabel = 'within' | 'outside' | 'remote' | 'none' | 'no_punch';

/** Match daily attendance to a team member by stable IDs only (never by name). */
function findAttendanceForEmployee(
  attendance: AttendanceRecord[],
  emp: { id: string; employeeId?: string },
  date: string
): AttendanceRecord | undefined {
  const day = attendanceDayKey(date);
  if (!day) return undefined;
  const matches = attendance.filter((a) => {
    const idMatch =
      a.employeeId === emp.id ||
      (!!emp.employeeId && a.employeeId === emp.employeeId);
    if (!idMatch) return false;
    return attendanceDayKey(a.date) === day;
  });
  return matches.find((row) => hasOpenAttendanceSession(row)) || matches[0];
}

function formatHourSpan(hours: number): string {
  const total = Math.max(0, Math.round(Number(hours) * 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function dayStatusLabel(status: string, places: Array<string | undefined>): string {
  const named = places.filter((place): place is string => Boolean(place));
  const allRemote = named.length > 0 && named.every((place) => isRemotePlace(place));
  if (allRemote && (status === 'Present' || status === 'Late' || status === 'Work From Home')) return 'Work From Home';
  if (!allRemote && status === 'Work From Home') return 'Present';
  return status || 'Present';
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

function renderMyAttendancePunchAction({
  hasConfiguredOffice,
  selectedLocation,
  isSuperAdmin,
  isHR,
  isStudentMode,
  isAttendanceConfigured,
  isCheckedOut,
  isCheckedIn,
  onSetup,
  onPunch,
}: {
  hasConfiguredOffice: boolean;
  selectedLocation: string;
  isSuperAdmin: boolean;
  isHR: boolean;
  isStudentMode: boolean;
  isAttendanceConfigured: boolean;
  isCheckedOut: boolean;
  isCheckedIn: boolean;
  onSetup: () => void;
  onPunch: () => void;
}) {
  if (!hasConfiguredOffice && selectedLocation !== 'wfh') {
    if (isSuperAdmin || isHR) {
      return (
        <button type="button" onClick={onSetup} className="work-btn-secondary">
          {isStudentMode ? 'Setup campus' : 'Setup office'}
        </button>
      );
    }
    return (
      <div
        title="Attendance is disabled until your administrator sets up an office / campus location."
        className="att-status"
      >
        {isStudentMode ? 'Campus setup pending' : 'Office setup pending'}
      </div>
    );
  }

  if (!isAttendanceConfigured) {
    if (isSuperAdmin || isHR) {
      return (
        <button type="button" onClick={onSetup} className="work-btn-secondary">
          Setup rules
        </button>
      );
    }
    return (
      <div
        title="Attendance tracking is awaiting configuration by your HR administrator."
        className="att-status"
      >
        Setup pending
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onPunch}
      className="work-btn-primary"
    >
      {isCheckedIn ? 'Clock out' : isCheckedOut ? 'Punch in again' : 'Punch in'}
    </button>
  );
}

function TeamStatusBadge({
  statusType,
  isStudentMode,
  label,
}: {
  statusType: TeamStatusType;
  isStudentMode: boolean;
  label?: string;
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
        label={label || (isStudentMode ? 'On Leave' : 'Time Off')}
      />
    );
  }
  if (statusType === 'off_day') {
    return (
      <AttendanceStatusPill
        kind="neutral"
        label={label || (isStudentMode ? 'Off' : 'Weekly Off')}
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
    return <span className="text-xs text-[var(--text-muted)]">-</span>;
  }
  if (geoLabel === 'within') {
    return (
      <span className="work-chip work-chip-sage" title="Within office geofence">
        Within
      </span>
    );
  }
  if (geoLabel === 'outside') {
    return (
      <span className="work-chip work-chip-error" title="Outside office geofence">
        Outside
      </span>
    );
  }
  if (geoLabel === 'remote') {
    return (
      <span className="work-chip work-chip-navy" title="Remote / WFH punch">
        Remote
      </span>
    );
  }
  return (
    <span className="work-chip work-chip-muted" title="No GPS coordinates on punch">
      No GPS
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
  const isHR = isHRPersona(state.currentPersona);
  const isManager = isManagerPersona(state.currentPersona, state.employees);
  const isInstitution = isInstitutionMode(state.organization, state.currentPersona) || isStudentMode;
  const isUserView = !isSuperAdmin && !isHR && !isManager && !isStudentMode;
  const canAccessReports = isExecutiveOrAdmin(state.currentPersona);

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
      const todayIso = teamAttendanceDate || toLocalDateKey();
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
    const scope = state.customOptions?.attendanceSettings?.locationScope;
    const inScope = (list: Employee[]) =>
      list.filter((emp) => employeeInLocationScope(emp, scope));
    if (isSuperAdmin || isHR) return inScope(state.employees);
    if (isManager) return inScope(accessibleEmployees);
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
  }, [isStudentMode, state.students, isSuperAdmin, isHR, isManager, state.employees, accessibleEmployees, state.currentPersona, state.customOptions?.attendanceSettings?.locationScope]);

  const teamAttendanceRecords = useMemo(() => {
    const startDate = state.customOptions?.attendanceSettings?.startDate;
    const visible = (rows: typeof state.attendance) =>
      applyHoursMethod(rows, state.customOptions?.attendanceSettings).filter((row) =>
        onOrAfterStart(row.date, startDate)
      );
    if (isStudentMode) {
      const studentNames = new Set(teamMembers.map((m) => m.name.toLowerCase()));
      const studentIds = new Set(teamMembers.map((m) => m.id));
      return visible(
        state.attendance.filter(
          (a) =>
            studentIds.has(a.employeeId) ||
            (a.employeeName && studentNames.has(a.employeeName.toLowerCase())) ||
            a.employeeId === state.currentPersona.id ||
            (a.employeeName && a.employeeName.toLowerCase().includes('aarav sharma'))
        )
      );
    }
    if (isSuperAdmin || isHR) return visible(state.attendance);
    if (isManager) {
      return visible(
        state.attendance.filter(
          (a) =>
            accessibleEmpIds.has(a.employeeId) ||
            (a.employeeName && accessibleEmpNames.has(a.employeeName.toLowerCase())) ||
            a.employeeId === state.currentPersona.id
        )
      );
    }
    return visible(
      state.attendance.filter(
        (a) =>
          a.employeeId === state.currentPersona.id ||
          (a.employeeName && a.employeeName.toLowerCase() === state.currentPersona.name.toLowerCase())
      )
    );
  }, [isStudentMode, teamMembers, state.attendance, isSuperAdmin, isHR, isManager, accessibleEmpIds, accessibleEmpNames, state.currentPersona, state.customOptions?.attendanceSettings]);

  const isStudentLogin = state.currentPersona.role === 'student';

  const defaultSubTab = (initialOpenApplyModal ? 'leaves' : initialSubTab) || (isStudentLogin ? 'my_attendance' : isStudentMode ? 'team_attendance' : 'my_attendance');
  const mobileViewport = useMobileViewport();
  const attendancePath = usePathname();
  const attendanceParams = useSearchParams();
  const mobileAttendancePane = attendanceParams.get('view') === 'history' ? 'history' : 'overview';
  const setMobileAttendancePane = (pane: 'overview' | 'history') => {
    const query = new URLSearchParams(attendanceParams.toString());
    if (pane === 'history') query.set('view', 'history'); else query.delete('view');
    router.replace(attendancePath + (query.size ? '?' + query.toString() : ''), { scroll: false });
  };
  const [subTab, setSubTab] = useState<'my_attendance' | 'team_attendance' | 'leaves' | 'regularizations' | 'holidays' | 'settings'>(defaultSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const onUpdateStateRef = useRef(onUpdateState);
  onUpdateStateRef.current = onUpdateState;

  useEffect(() => {
    if (subTab !== 'holidays') return;
    if (canAccessReports) {
      router.replace('/settings?section=attendance&tab=holidays');
      return;
    }
    let cancelled = false;
    api.attendance.getHolidays().then((res) => {
      if (cancelled || !res.success || !Array.isArray(res.data)) return;
      const holidays = res.data.map((h: any) => ({
        id: h.id,
        name: h.name,
        date: String(h.date || '').slice(0, 10),
        year: Number(h.year) || Number(String(h.date || '').slice(0, 4)),
        dayOfWeek: h.dayOfWeek || h.day_of_week || '',
        isApproved: h.isApproved !== false && h.is_approved !== false,
      }));
      onUpdateStateRef.current((prev) => ({
        ...prev,
        customOptions: { ...prev.customOptions, holidays },
      }));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [subTab, router, canAccessReports]);

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
  const [leaveView, setLeaveView] = useState<'mine' | 'approvals' | 'policy'>('mine');
  const [leaveMonth, setLeaveMonth] = useState('');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState('All');
  const [leavePage, setLeavePage] = useState(1);
  const [leavePageSize, setLeavePageSize] = useState(6);
  const [teamPage, setTeamPage] = useState(1);
  const [teamPageSize, setTeamPageSize] = useState(10);
  useEffect(() => setLeavePage(1), [leaveView, leaveFilterStatus, leaveSearchQuery, leaveMonth, leaveTypeFilter]);


  // Target Employee for Leave Quotas
  const activeSubjectId = targetEmployeeId || targetEmployee?.id || state.currentPersona.id;
  const activeSubjectName = targetEmployee?.name || state.currentPersona.name;

  const targetEmployeeObj = (state.employees || []).find(
    (e) => e.id === activeSubjectId || e.employeeId === activeSubjectId || (e.name && e.name.toLowerCase() === activeSubjectName.toLowerCase())
  ) || state.currentPersona;

  const targetEmpLeaves = useMemo(() => {
    return (state.leaves || []).filter((l) => leaveBelongsToEmployee(l, targetEmployeeObj));
  }, [state.leaves, targetEmployeeObj]);

  const effectiveQuotas = useMemo(() => {
    return getEffectiveLeaveQuotas(targetEmployeeObj, state.customOptions?.leaveSettings, state.customOptions?.probationSettings);
  }, [targetEmployeeObj, state.customOptions?.leaveSettings, state.customOptions?.probationSettings]);

  // Ledger balances are remaining days; the card denominator must use the granted total.
  const personalQuota = (key: keyof typeof effectiveQuotas.effectiveQuotas) => formatLeaveDays(
    effectiveQuotas.balancesFromServer
      ? ((targetEmployeeObj as Employee & { leaveBalanceTotals?: Partial<typeof effectiveQuotas.effectiveQuotas> }).leaveBalanceTotals?.[key] ?? effectiveQuotas.annualQuotas[key])
      : effectiveQuotas.effectiveQuotas[key]
  );
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

  const targetWfhRegs = useMemo(
    () =>
      (state.regularizations || []).filter(
        (r) =>
          isWfhRegularization(r) &&
          (r.employeeId === activeSubjectId ||
            r.employeeId === (targetEmployeeObj as any)?.id ||
            r.employeeId === (targetEmployeeObj as any)?.employeeId ||
            (r.employeeName &&
              r.employeeName.toLowerCase() === String(activeSubjectName || '').toLowerCase()))
      ),
    [state.regularizations, activeSubjectId, targetEmployeeObj, activeSubjectName]
  );
  const wfhUsed = formatLeaveDays(
    targetWfhRegs.filter((r) => r.status === 'Approved').length +
      targetEmpLeaves
        .filter((l) => l.leaveType === 'Work From Home' && l.status !== 'Rejected' && l.status !== 'Cancelled')
        .reduce((sum, l) => sum + (l.daysCount || 1), 0)
  );
  const wfhPending = formatLeaveDays(
    targetWfhRegs.filter((r) => r.status === 'Pending').length +
      targetEmpLeaves
        .filter((l) => l.leaveType === 'Work From Home' && l.status === 'Pending')
        .reduce((sum, l) => sum + (l.daysCount || 1), 0)
  );
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
    return (state.leaves || []).filter((l) => leaveBelongsToEmployee(l, modalTargetEmp));
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

  /** Re-hydrate per-employee leave ledgers so one approval cannot look shared. */
  const refreshLeaveBalances = useCallback(async () => {
    const balRes = await api.attendance.getLeaveBalances();
    if (!balRes.success || !balRes.data) return;
    onUpdateState((prev) => ({
      ...prev,
      employees: applyLeaveBalancesToEmployees(prev.employees || [], balRes.data),
    }));
  }, [onUpdateState]);

  const handleApproveLeave = async (id: string, approved: boolean) => {
    const targetLeave = state.leaves.find((l) => l.id === id);
    if (!targetLeave) return;

    // Strict role check: Managers can ONLY approve leaves for direct reports (NEVER for CEO/Execs)
    if (!canApproveLeave(state.currentPersona, targetLeave, state.employees, state.customOptions?.leaveSettings?.approvalWorkflow)) {
      alert('Permission denied: You can only approve leaves for your direct reports. CEO and executive leaves cannot be modified.');
      return;
    }

    if (approved) {
      const targetEmp = state.employees.find((e) => leaveBelongsToEmployee(targetLeave, e));
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
    if (approved) await refreshLeaveBalances();
  };

  const handleApproveAsUnpaid = async (id: string) => {
    const targetLeave = state.leaves.find((l) => l.id === id);
    if (!targetLeave) return;

    if (!canApproveLeave(state.currentPersona, targetLeave, state.employees, state.customOptions?.leaveSettings?.approvalWorkflow)) {
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
      await refreshLeaveBalances();
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
      await refreshLeaveBalances();
    } catch (err) {
      console.error('Failed to approve leave', err);
      alert('Failed to approve leave');
    } finally {
      setIsSaving(false);
    }
    setProbationBlockModal(null);
  };

  const handleApproveAllPending = async () => {
    const pendingLeaves = state.leaves.filter(
      (l) => (l.status === 'Pending' || l.status === 'Manager approved') && canApproveLeave(state.currentPersona, l, state.employees, state.customOptions?.leaveSettings?.approvalWorkflow)
    );
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
          if (!pendingLeaves.some((item) => item.id === l.id)) return l;
          const emp = prev.employees.find((e) => leaveBelongsToEmployee(l, e));
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
      await refreshLeaveBalances();
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
      const result = await api.attendance.deleteLeave(id);
      if (!result.success) throw new Error(result.error?.message || 'Failed to cancel leave');
      
      onUpdateState((prev) => ({
        ...prev,
        leaves: prev.leaves.map((leave) => leave.id === id ? { ...leave, status: 'Cancelled' as const } : leave),
      }));
      await refreshLeaveBalances();
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

    const restrictProbationLeave = state.customOptions?.probationSettings?.restrictLeaveDuringProbation !== false;
    const inProbation = restrictProbationLeave && isEmployeeInProbation(resolvedEmp as any, state.customOptions?.probationSettings);
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

    const documentLimit = Number(state.customOptions?.leaveSettings?.maxConsecutiveDaysWithoutDoc) || 3;
    if (computedLeaveDays > documentLimit && !leaveAttachment.trim()) {
      alert(`Leave longer than ${documentLimit} days needs a supporting document.`);
      return;
    }
    if (
      (mappedLeaveType === 'wfh' || finalLeaveType === 'Work From Home') &&
      state.customOptions?.leaveSettings?.enableCompOff === false
    ) {
      alert('Comp-off is turned off, so this request cannot be filed.');
      return;
    }

    setIsSaving(true);
    try {
      const targetEmpId = (targetEmp as any).id || (targetEmp as any).employeeId || state.currentPersona.id;
      const leaveRemarks =
        inProbation && isPaid
          ? `[Probation LOP] ${leaveHandover ? `${finalReason} (Covered by: ${leaveHandover})` : finalReason}`
          : leaveHandover
            ? `${finalReason} (Covered by: ${leaveHandover})`
            : finalReason;

      // WFH is approved via Regularizations (not Leaves)
      if (mappedLeaveType === 'wfh' || finalLeaveType === 'Work From Home') {
        const dates = eachDateInclusive(finalStartDate, finalEndDate);
        const createdRegs: AttendanceRegularization[] = [];
        for (const date of dates) {
          const created = await api.attendance.requestRegularization({
            employeeId: targetEmpId,
            date,
            requestedCheckIn: to24HourTime(configuredShiftStart) || '09:00',
            requestedCheckOut: to24HourTime(configuredShiftEnd) || '18:00',
            reason: 'Work From Home',
            remarks: leaveRemarks || 'Work from home request',
            creditCompOff: true,
          });
          if (!created.success) {
            alert(created.error?.message || 'Could not submit WFH request');
            setIsSaving(false);
            return;
          }
          createdRegs.push({
            id: created.data?.id || `reg_${Date.now()}_${date}`,
            employeeId: created.data?.employee_id || targetEmpId,
            employeeName: (targetEmp as any).name || state.currentPersona.name,
            avatar: (targetEmp as any).avatar || state.currentPersona.avatar,
            department: (targetEmp as any).department || state.currentPersona.department,
            date,
            requestedCheckIn: configuredShiftStart,
            requestedCheckOut: configuredShiftEnd,
            reason: 'Work From Home',
            remarks: leaveRemarks || 'Work from home request',
            status: 'Pending',
            appliedOn: toLocalISODate(),
          });
        }
        onUpdateState((prev) => ({
          ...prev,
          regularizations: [...createdRegs, ...prev.regularizations],
          notifications: [
            {
              id: `notif_${Date.now()}`,
              title: 'WFH Request Submitted',
              message: `${(targetEmp as any).name || state.currentPersona.name} requested work from home for ${dates.length} day(s). Awaiting manager approval in Regularizations.`,
              timestamp: 'Just now',
              category: 'Approvals' as const,
              priority: 'high' as const,
              read: false,
              linkModule: 'attendance',
              linkTab: 'regularizations',
              actorName: (targetEmp as any).name || state.currentPersona.name,
              actionLabel: 'Review Request',
            },
            ...prev.notifications,
          ],
        }));
        setShowApplyLeaveModal(false);
        setLeaveReason('');
        setLeaveHandover('');
        setLeaveAttachment('');
        setLeaveType('Casual Leave');
        setSubTab('regularizations');
        setPingToast('WFH request sent to Regularizations for manager approval');
        setTimeout(() => setPingToast(null), 4000);
        setIsSaving(false);
        return;
      }

      const leaveRes = await api.attendance.requestLeave({
        employeeId: targetEmpId,
        leaveType: mappedLeaveType,
        startDate: finalStartDate,
        endDate: finalEndDate,
        daysCount: computedLeaveDays,
        reason: leaveRemarks,
        attachmentUrl: leaveAttachment.trim() || undefined,
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
  const [teamAttendanceDate, setTeamAttendanceDate] = useState(() => toLocalDateKey());
  const [teamTabFilter, setTeamTabFilter] = useState<'All' | 'Checked In' | 'Late' | 'Not Checked In' | 'Hourly'>('All');
  const [teamShiftFilter, setTeamShiftFilter] = useState('All');
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

    const enrichedRecords = teamMembers.map((emp) => {
      const att = findAttendanceForEmployee(
        teamAttendanceRecords,
        emp,
        teamAttendanceDate
      );
      const scheduledToday = isScheduledWorkingDay(
        teamAttendanceDate,
        state.organization?.workingDays,
        state.customOptions?.attendanceSettings
      );
      const trackingStarted = onOrAfterStart(
        teamAttendanceDate,
        state.customOptions?.attendanceSettings?.startDate
      );

      const dayKey = String(teamAttendanceDate || '').slice(0, 10);
      const coveringLeave = approvedAbsenceOnDay(state.leaves, emp, dayKey);
      const holidayToday = (state.customOptions?.holidays || []).some((holiday) => {
        if (holiday.isApproved === false) return false;
        return String(holiday.date || '').slice(0, 10) === dayKey;
      });

      const isCheckedIn = hasOpenAttendanceSession(att);
      const isCheckedOut = !!att?.checkIn && !isCheckedIn;

      let statusType: TeamStatusType = 'not_in_yet';
      let statusLabel: string | undefined;

      // Detect if working hourly
      const isHourlyWorker = emp.salaryType === 'hourly' || emp.shiftTiming?.isHourlyShift;
      const hourlyRate = emp.hourlyRate || emp.shiftTiming?.hourlyRate || 650;

      if (isCheckedOut) {
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
      } else if (coveringLeave || att?.status === 'On Leave') {
        statusType = 'time_off';
        timeOff++;
      } else if (!scheduledToday) {
        statusType = 'off_day';
        statusLabel = isStudentMode ? 'Off' : 'Weekly Off';
      } else if (holidayToday) {
        statusType = 'off_day';
        statusLabel = 'Holiday';
      } else if (!trackingStarted) {
        statusType = 'off_day';
        statusLabel = 'Not tracked';
      } else {
        statusType = 'not_in_yet';
        notInYet++;
      }

      // Format first punch and last punch
      const firstPunch = att?.checkIn ? att.checkIn.replace(/\s*\(GMT[^\)]*\)/gi, '').trim() : '--:--';
      const lastPunch = att?.checkOut && !isCheckedIn
        ? att.checkOut.replace(/\s*\(GMT[^\)]*\)/gi, '').trim()
        : isCheckedIn
          ? '--:--'
          : '-';
      const loggedHours = typeof att?.workingHours === 'number' ? att.workingHours : 0;
      const openHours = isCheckedIn && att ? attendanceElapsedSeconds(att) / 3600 : 0;
      const workingHours = Number(Math.max(loggedHours, openHours).toFixed(2));
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

      if (!hasTodayLog && statusType !== 'off_day') {
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

      const resolvedShift = resolveEmployeeShiftTiming(
        emp,
        state.customOptions?.shifts,
        state.customOptions?.employeeShiftAssignments,
        {
          allowDefault: !isStudentMode,
          date: teamAttendanceDate,
          enableRosterShifts: state.customOptions?.attendanceSettings?.enableRosterShifts,
          rosterRotationCycle: state.customOptions?.attendanceSettings?.rosterRotationCycle,
          rosterMatrix: state.customOptions?.employeeRosterMatrix,
        }
      );
      const shiftName = isHourlyWorker
        ? 'Hourly / Flexible'
        : resolvedShift?.shiftName || (isStudentMode ? 'Unassigned' : 'General Shift');
      const shiftKind = isHourlyWorker
        ? 'Hourly'
        : !resolvedShift?.shiftName
          ? null
          : resolvedShift.startTime === 'Flexible' || resolvedShift.endTime === 'Flexible'
            ? 'Flexible'
            : 'Fixed';

      const geoLabel = resolveTeamGeoLabel(att);

      return {
        emp,
        att,
        statusType,
        statusLabel,
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
  }, [teamMembers, teamAttendanceRecords, state.leaves, teamAttendanceDate, isStudentMode, state.customOptions?.academicSettings, state.customOptions?.shifts, state.customOptions?.employeeShiftAssignments, state.customOptions?.employeeRosterMatrix, state.customOptions?.attendanceSettings, state.customOptions?.holidays, state.organization?.workingDays]);

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

  const teamShiftOptions = [...new Set(teamAttendanceStats.enrichedRecords.map((record) => record.shift))].sort();

  const filteredTeamRecords = useMemo(() => {
    const list = teamAttendanceStats.enrichedRecords.filter((rec) => {
      if (teamShiftFilter !== 'All' && rec.shift !== teamShiftFilter) return false;

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
  }, [teamAttendanceStats.enrichedRecords, teamShiftFilter, teamBatchFilter, teamTabFilter, teamStatusFilter, teamSearchQuery, teamSortField, teamSortDirection]);

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
      const expected = records.filter((r) => r.statusType !== 'off_day');
      const absentCount = expected.filter((r) => r.statusType === 'not_in_yet').length;
      const rate = expected.length > 0 ? Math.round(((activeCount + lateCount) / expected.length) * 100) : 0;
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
    if (!canApproveRegularization(state.currentPersona, reg, state.employees)) {
      alert('You can only decide regularizations for your team.');
      return;
    }

    setIsSaving(true);
    try {
      await api.attendance.updateRegularizationStatus(regId, {
        status: approved ? 'Approved' : 'Rejected',
        approvedBy: state.currentPersona.name,
      });

      const wfh = isWfhRegularization(reg);
      const matchesRegDay = (record: AttendanceRecord) =>
        record.date === reg.date &&
        (record.employeeId === reg.employeeId || record.employeeName === reg.employeeName);
      onUpdateState((prev) => {
        let nextAttendance = prev.attendance;
        if (approved && wfh) {
          nextAttendance = prev.attendance.map((record) => {
            if (!matchesRegDay(record)) return record;
            return {
              ...record,
              status: 'Work From Home' as AttendanceRecord['status'],
              locationName: 'Work From Home',
              isWithinGeofence: false,
              device: record.device || 'Work From Home',
            };
          });
        } else if (approved) {
          const existing = prev.attendance.find(matchesRegDay);
          const status: AttendanceRecord['status'] = 'Present';
          if (existing) {
            nextAttendance = prev.attendance.map((record) => {
              if (record.id !== existing.id) return record;
              const updated = { ...record };
              if (reg.requestedCheckIn) updated.checkIn = reg.requestedCheckIn;
              if (reg.requestedCheckOut) updated.checkOut = reg.requestedCheckOut;
              updated.status = status;
              updated.workingHours = calculateWorkedHours(updated.checkIn, updated.checkOut || undefined);
              return updated;
            });
          } else {
            const created: AttendanceRecord = {
              id: `att_${reg.employeeId}_${reg.date}`,
              employeeId: reg.employeeId,
              employeeName: reg.employeeName,
              avatar: reg.avatar,
              date: reg.date,
              checkIn: reg.requestedCheckIn || '—',
              checkOut: reg.requestedCheckOut || '—',
              status,
              locationName: 'Office',
              latitude: 0,
              longitude: 0,
              isWithinGeofence: true,
              ipAddress: '',
              device: 'Manual Edit',
              workingHours: calculateWorkedHours(reg.requestedCheckIn, reg.requestedCheckOut),
              breakHours: 0,
            };
            nextAttendance = [created, ...prev.attendance];
          }
        } else if (wfh) {
          const timeStr = new Date().toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          });
          nextAttendance = prev.attendance.map((record) => {
            if (!matchesRegDay(record) || !hasOpenAttendanceSession(record)) return record;
            return applyPunchToDailyRecord(record, {
              type: 'check_out',
              time: timeStr,
              date: reg.date,
              employeeId: record.employeeId,
              employeeName: record.employeeName,
              avatar: record.avatar,
              locationName: 'Work From Home',
              isWithinGeofence: false,
              device: 'Work From Home',
              status: record.status,
            });
          });
        }

        return {
          ...prev,
          regularizations: prev.regularizations.map((r) =>
            r.id === regId
              ? { ...r, status: approved ? 'Approved' : 'Rejected', approvedBy: state.currentPersona.name }
              : r
          ),
          attendance: nextAttendance,
        };
      });
    } catch (err: any) {
      console.error('Failed to update regularization status', err);
      alert(err?.message || 'Failed to update regularization status');
    } finally {
      setIsSaving(false);
    }
  };

  // Hydration protection & Real-time Clock State
  const [isMounted, setIsMounted] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    setIsMounted(true);
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Today's Record for Current Persona (matched to local calendar date)
  const todayIsoStr = toLocalDateKey(now);
  const myTodayRows = state.attendance.filter(
    (a) =>
      (a.employeeId === state.currentPersona.id ||
        (a.employeeName &&
          a.employeeName.toLowerCase() === state.currentPersona.name?.toLowerCase())) &&
      isAttendanceToday(a.date, now)
  );
  const myTodayRecord = myTodayRows.find((a) => hasOpenAttendanceSession(a, now)) || myTodayRows[0];
  const hasPunchedToday = !!myTodayRecord && !!myTodayRecord.checkIn;
  const isCheckedIn = hasOpenAttendanceSession(myTodayRecord);
  const isCheckedOut = hasPunchedToday && !isCheckedIn;
  const todaySessions = sessionsFromRecord(myTodayRecord);
  const todaySessionCount = todaySessions.length;
  const hasWfhAuthorization =
    hasActiveWfhAuthorization(
      state.regularizations || [],
      todayIsoStr,
      state.currentPersona?.id
    ) || todaySessions.some((session) => isRemotePlace(session.locationName));
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
    const settings = state.customOptions?.attendanceSettings;
    const currentEmp = state.employees?.find(
      (e) => e.id === state.currentPersona.id || (e.email && e.email.toLowerCase() === state.currentPersona.email.toLowerCase())
    );
    if (!isStudentMode) {
      const person = currentEmp || {
        id: state.currentPersona.id,
        shiftTiming: (state.currentPersona as any)?.shiftTiming,
        salaryType: (state.currentPersona as any)?.salaryType,
        shiftId: (state.currentPersona as any)?.shiftId,
      };
      const resolved = resolveEmployeeShiftTiming(
        person,
        state.customOptions?.shifts,
        state.customOptions?.employeeShiftAssignments,
        {
          date: toLocalDateKey(),
          enableRosterShifts: settings?.enableRosterShifts,
          rosterRotationCycle: settings?.rosterRotationCycle,
          rosterMatrix: state.customOptions?.employeeRosterMatrix,
        }
      );
      if (resolved && state.customOptions?.shifts?.some((shift) => shift.id === resolved.shiftId)) {
        return resolved;
      }
    }
    // 1. Direct persona shift timing
    if ((state.currentPersona as any)?.shiftTiming?.startTime) {
      return (state.currentPersona as any).shiftTiming;
    }
    // 2. Employee record matching persona
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
          graceMinutes: matchedBatch.graceMinutes,
        };
      }
    }
    return null;
  }, [
    state.currentPersona,
    state.employees,
    state.students,
    isStudentMode,
    state.customOptions?.academicBatches,
    state.customOptions?.shifts,
    state.customOptions?.employeeShiftAssignments,
    state.customOptions?.employeeRosterMatrix,
    state.customOptions?.attendanceSettings,
  ]);

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

  const openLogin = todaySessions.find(
    (session) =>
      isPlaceholderCheckout(session.checkOut) || checkoutStillAhead(session.checkOut, now, myTodayRecord?.date)
  );
  const lockedPlace = isCheckedIn ? openLogin?.locationName || '' : '';
  const locationSelectValue = isCheckedIn
    ? isRemotePlace(lockedPlace)
      ? 'wfh'
      : lockedPlace || selectedLocation
    : selectedLocation;

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
  const [breakElapsedSnapshot, setBreakElapsedSnapshot] = useState<number | null>(null);
  const breakStartedAtRef = useRef<number | null>(null);

  // GPS & Geofencing States
  const [isPingingGps, setIsPingingGps] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(3.2);
  const [geofenceDistanceMeters, setGeofenceDistanceMeters] = useState(38);
  const [pingToast, setPingToast] = useState<string | null>(null);

  useWfhRejectionWatch(isCheckedIn, state.currentPersona?.id, todayIsoStr, () => {
    const persona = state.currentPersona;
    if (!persona) return;
    const record = state.attendance.find(
      (entry) =>
        (entry.employeeId === persona.id ||
          entry.employeeName?.toLowerCase() === persona.name?.toLowerCase()) &&
        entry.date === todayIsoStr
    );
    if (!record || !hasOpenAttendanceSession(record)) return;
    const timeStr = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    const closed = applyPunchToDailyRecord(record, {
      type: 'check_out',
      time: timeStr,
      date: todayIsoStr,
      employeeId: persona.id,
      employeeName: persona.name,
      avatar: persona.avatar,
      locationName: 'Work From Home',
      isWithinGeofence: false,
      device: 'Work From Home',
      status: record.status,
    });
    void persistClockOutTaskSessions(
      state.tasks,
      state.timesheets,
      persona.id,
      persona.name,
      Date.now()
    ).then((sessions) => {
      onUpdateState((prev) => {
        const applied = applyTaskSessions(prev.tasks || [], prev.timesheets, sessions);
        return { ...prev, tasks: applied.tasks, timesheets: applied.timesheets };
      });
    }).catch(() => {});
    void api.attendance.recordPunch({
      employeeId: persona.id,
      punchType: 'check_out',
      deviceInfo: 'WFH regularization rejected',
      workFromHome: true,
    });
    onUpdateState((prev) => ({
      ...prev,
      attendance: [
        closed,
        ...prev.attendance.filter((entry) => !(entry.employeeId === persona.id && entry.date === todayIsoStr)),
      ],
      regularizations: (prev.regularizations || []).map((reg) =>
        reg.employeeId === persona.id &&
        String(reg.date).slice(0, 10) === todayIsoStr &&
        reg.status === 'Pending' &&
        isWfhRegularization(reg)
          ? { ...reg, status: 'Rejected' as const }
          : reg
      ),
    }));
    setPingToast('Your manager rejected work from home. You have been punched out.');
    setTimeout(() => setPingToast(null), 5000);
  });

  // Clock Out Modal State
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [clockOutNotes, setClockOutNotes] = useState('');

  const attPolicy = (state.customOptions?.attendanceSettings || {}) as any;
  const requireSelfieNow = isCheckedIn
    ? attPolicy.requireSelfieCheckOut === true
    : attPolicy.requireSelfieCheckIn === true;
  const allowQrAttendance =
    attPolicy.allowQrCodeAttendance === true &&
    (selectedOfficeRecord as { qrCodeEnabled?: boolean } | null)?.qrCodeEnabled !== false;
  const outOfRadiusAction: 'Block' | 'Allow' | 'Warn' =
    attPolicy.outOfRadiusAction === 'Allow' || attPolicy.outOfRadiusAction === 'Warn'
      ? attPolicy.outOfRadiusAction
      : 'Block';

  // Confirm Punch Location Modal State (map → camera, or geofence warning)
  const [showPunchLocationModal, setShowPunchLocationModal] = useState(false);
  const [punchStep, setPunchStep] = useState<'map' | 'confirm_out_radius' | 'qr'>('map');
  const [punchMode, setPunchMode] = useState<'gps' | 'qr'>('gps');
  const [qrTokenInput, setQrTokenInput] = useState('');
  const [officeQr, setOfficeQr] = useState<{ token: string; expiresAt: string; officeName?: string } | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
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
  const [attendancePhotoLoading, setAttendancePhotoLoading] = useState(false);
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

  const openRegModal = (opts?: { reason?: AttendanceRegularization['reason']; remarks?: string; date?: string }) => {
    setRegDate(opts?.date || toLocalISODate());
    setRegInTime(configuredShiftStart);
    setRegOutTime(configuredShiftEnd);
    setRegReason(opts?.reason || 'Client Visit');
    setRegRemarks(opts?.remarks || '');
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

  // Sum of completed sessions plus the open session (paused snapshot while on break)
  const currentElapsedSeconds = useMemo(() => {
    if (!hasPunchedToday) return 0;
    if (isOnBreak && breakElapsedSnapshot != null) {
      return breakElapsedSnapshot;
    }
    return attendanceElapsedSeconds(myTodayRecord, now);
  }, [hasPunchedToday, isOnBreak, breakElapsedSnapshot, myTodayRecord, now]);



  // Toggle Break Action
  const persistPunch = async (opts: {
    punchType: 'check_in' | 'check_out';
    deviceInfo?: string;
    status?: AttendanceRecord['status'];
    checkInTime?: string;
    checkOutTime?: string;
    selfiePhoto?: string | null;
    qrToken?: string;
    workFromHome?: boolean;
  }): Promise<ApiResponse> => {
    const today = toLocalDateKey();
    const useStudentApi = isStudentMode || state.currentPersona.role === 'student';
    const lat = Number.isFinite(currentLat) ? currentLat : undefined;
    const lng = Number.isFinite(currentLng) ? currentLng : undefined;
    try {
      if (useStudentApi) {
        const existing = state.attendance.find(
          (a) => a.employeeId === state.currentPersona.id && a.date === today
        );
        const rawStatus = opts.status || (opts.punchType === 'check_in' ? 'Present' : existing?.status || 'Present');
        const status =
          rawStatus === 'Work From Home' || rawStatus === 'On Leave' ? 'Present' : rawStatus;
        return await api.institute.recordStudentAttendance({
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
          latitude: lat,
          longitude: lng,
          selfiePhoto: opts.selfiePhoto || undefined,
        });
      }
      return await api.attendance.recordPunch({
        employeeId: state.currentPersona.id,
        punchType: opts.punchType,
        officeId: selectedLocation !== 'wfh' ? selectedOfficeIdForPunch : undefined,
        latitude: lat,
        longitude: lng,
        deviceInfo: opts.deviceInfo,
        selfiePhoto: opts.selfiePhoto || undefined,
        qrToken: opts.qrToken || undefined,
        workFromHome: selectedLocation === 'wfh' || opts.workFromHome,
      });
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: err?.code || 'PUNCH_FAILED',
          message: err?.message || 'Failed to record attendance',
        },
      };
    }
  };

  const openAttendancePhotos = async (att: AttendanceRecord) => {
    const hasCheckInPhoto = Boolean(att.checkInPhoto || att.selfiePhoto);
    const hasCheckOutPhoto = Boolean(att.checkOutPhoto) || !att.checkOut;
    setSelectedAttendancePhotoRecord(att);
    if (hasCheckInPhoto && hasCheckOutPhoto) {
      setAttendancePhotoLoading(false);
      return;
    }

    setAttendancePhotoLoading(true);
    try {
      const res = await api.attendance.getPunches({
        employeeId: att.employeeId,
        date: att.date,
        includePhotos: true,
      });
      const rows = res.success && Array.isArray(res.data) ? res.data : [];
      const match = aggregatePunchesToDaily(rows).find(
        (row) => row.employeeId === att.employeeId && row.date === att.date
      );
      if (!match) return;
      const withPhotos: AttendanceRecord = {
        ...att,
        selfiePhoto: match.selfiePhoto || att.selfiePhoto,
        checkInPhoto: match.checkInPhoto || att.checkInPhoto,
        checkOutPhoto: match.checkOutPhoto || att.checkOutPhoto,
      };
      setSelectedAttendancePhotoRecord((current) => {
        if (!current || current.employeeId !== att.employeeId || current.date !== att.date) return current;
        return withPhotos;
      });
      onUpdateState((prev) => ({
        ...prev,
        attendance: prev.attendance.map((row) =>
          row.employeeId === att.employeeId && row.date === att.date ? { ...row, ...withPhotos } : row
        ),
      }));
    } catch (err) {
      console.error('Failed to load punch photos', err);
    } finally {
      setAttendancePhotoLoading(false);
    }
  };

  const handleToggleBreak = async (type: 'Lunch' | 'Tea' | 'General' = 'General') => {
    setIsSaving(true);
    try {
      await api.attendance.toggleBreak({ employeeId: state.currentPersona.id, isOnBreak: !isOnBreak });
      if (isOnBreak) {
        const started = breakStartedAtRef.current;
        const addedHours = started ? Math.max(0, (Date.now() - started) / 3600000) : 0;
        breakStartedAtRef.current = null;
        setIsOnBreak(false);
        setBreakElapsedSnapshot(null);
        if (addedHours > 0) {
          onUpdateState((prev) => ({
            ...prev,
            attendance: prev.attendance.map((row) => {
              const samePerson =
                row.employeeId === state.currentPersona.id ||
                (!!row.employeeName &&
                  !!state.currentPersona.name &&
                  row.employeeName.toLowerCase() === state.currentPersona.name.toLowerCase());
              if (!samePerson || attendanceDayKey(row.date) !== todayIsoStr) return row;
              return {
                ...row,
                breakHours: Number(((row.breakHours || 0) + addedHours).toFixed(4)),
              };
            }),
          }));
        }
        setPingToast('Resumed work');
      } else {
        breakStartedAtRef.current = Date.now();
        setIsOnBreak(true);
        setBreakType(type);
        setBreakElapsedSnapshot(currentElapsedSeconds);
        setPingToast('Break started');
      }
      setTimeout(() => setPingToast(null), 3000);
    } catch (err) {
      console.error('Failed to toggle break', err);
      setPingToast('Could not update break. Try again.');
      setTimeout(() => setPingToast(null), 3000);
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

    const todayIsoDate = toLocalDateKey();
    const existingToday = state.attendance.find(
      (a) => a.employeeId === state.currentPersona.id && a.date === todayIsoDate
    );
    const newRecord = applyPunchToDailyRecord(existingToday, {
      type: 'check_in',
      time: timeStr,
      date: todayIsoDate,
      employeeId: state.currentPersona.id,
      employeeName: state.currentPersona.name,
      avatar: state.currentPersona.avatar,
      locationName: activeOfficeDisplayName,
      latitude: currentLat,
      longitude: currentLng,
      isWithinGeofence: selectedLocation !== 'wfh',
      ipAddress: '106.51.72.18',
      device: 'Web GPS Verified',
      status: 'Present',
      id: punchRes.data?.id,
    });

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
    const todayStr = toLocalDateKey();

    let savedSessions: Awaited<ReturnType<typeof persistClockOutTaskSessions>> = [];
    try {
      savedSessions = await persistClockOutTaskSessions(
        state.tasks,
        state.timesheets,
        state.currentPersona.id,
        state.currentPersona.name,
        nowTime
      );
    } catch (err) {
      console.error('Failed to close task timesheets on clock-out', err);
    }

    onUpdateState((prev) => {
      const applied = applyTaskSessions(prev.tasks || [], prev.timesheets, savedSessions);
      let updatedTimesheets = applied.timesheets;
      const savedIds = new Set(savedSessions.map((session) => session.taskId));

        const updatedTasks = applied.tasks.map((t) => {
          const isMyTask =
            [...(t.assigneeIds || []), t.assigneeId].includes(prev.currentPersona.id) ||
            [...(t.assigneeNames || []), t.assigneeName].some(
              (name) => name && name.toLowerCase() === prev.currentPersona.name.toLowerCase()
            );

          if (!savedIds.has(t.id) && isMyTask && t.status === 'In Progress' && t.isTimerRunning && t.timerStartedAt) {
            let timeSpentSeconds = t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0);
            const elapsed = Math.max(0, Math.floor((nowTime - t.timerStartedAt) / 1000));
            timeSpentSeconds += elapsed;
            const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));
            const elapsedHours = Number((elapsed / 3600).toFixed(2));

            updatedTimesheets = updatedTimesheets.map((ts) => {
              if (ts.taskId === t.id && ts.date === todayStr && !ts.endTime) {
                return {
                  ...ts,
                  hours: Number((ts.hours + elapsedHours).toFixed(2)),
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

      const prior = prev.attendance.find(
        (a) =>
          (a.employeeId === prev.currentPersona.id || a.employeeName === prev.currentPersona.name) &&
          a.date === todayStr
      );
      const closed = applyPunchToDailyRecord(prior, {
        type: 'check_out',
        time: timeStr,
        date: todayStr,
        employeeId: prev.currentPersona.id,
        employeeName: prev.currentPersona.name,
        avatar: prev.currentPersona.avatar,
        locationName: prior?.locationName,
      });

      return {
        ...prev,
        attendance: [
          closed,
          ...prev.attendance.filter(
            (a) =>
              !(
                (a.employeeId === prev.currentPersona.id || a.employeeName === prev.currentPersona.name) &&
                a.date === todayStr
              )
          ),
        ],
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
      const todayStr = toLocalDateKey();
      onUpdateState((prev) => {
        const prior = prev.attendance.find(
          (a) =>
            (a.employeeId === state.currentPersona.id || a.employeeName === state.currentPersona.name) &&
            a.date === todayStr
        );
        const resumed = applyPunchToDailyRecord(prior, {
          type: 'check_in',
          time: timeStr,
          date: todayStr,
          employeeId: state.currentPersona.id,
          employeeName: state.currentPersona.name,
          avatar: state.currentPersona.avatar,
          locationName: activeOfficeDisplayName,
          latitude: currentLat,
          longitude: currentLng,
        });
        return {
          ...prev,
          attendance: [
            resumed,
            ...prev.attendance.filter(
              (a) =>
                !(
                  (a.employeeId === state.currentPersona.id || a.employeeName === state.currentPersona.name) &&
                  a.date === todayStr
                )
            ),
          ],
        };
      });
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
      const remarks = regRemarks || 'Regularization request for shift adjustments';
      const created = await api.attendance.requestRegularization({
        employeeId: state.currentPersona.id,
        date: regDate,
        requestedCheckIn: to24HourTime(regInTime) || regInTime,
        requestedCheckOut: to24HourTime(regOutTime) || regOutTime,
        reason: regReason,
        remarks,
      });

      const newReg: AttendanceRegularization = {
        id: created.data?.id || `reg_${Date.now()}`,
        employeeId: created.data?.employee_id || state.currentPersona.id,
        employeeName: state.currentPersona.name,
        avatar: state.currentPersona.avatar,
        department: state.currentPersona.department,
        date: String(created.data?.date || regDate).slice(0, 10),
        requestedCheckIn: regInTime,
        requestedCheckOut: regOutTime,
        reason: regReason,
        remarks,
        status: 'Pending',
        appliedOn: toLocalISODate(),
      };

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
    } catch (err: any) {
      console.error('Failed to submit regularization request', err);
      alert(err?.message || 'Failed to submit regularization request');
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

  const weekBounds = useMemo(() => {
    return calendarWeekRange(parseDateKey(todayIsoStr) || new Date());
  }, [todayIsoStr]);

  const weeklyTargetHours = useMemo(() => {
    const settings = state.customOptions?.attendanceSettings;
    const start = parseDateKey(weekBounds.start);
    let days = 0;
    if (start) {
      for (let offset = 0; offset < 7; offset += 1) {
        const cursor = new Date(start);
        cursor.setDate(start.getDate() + offset);
        if (isScheduledWorkingDay(dateKey(cursor), state.organization?.workingDays, settings)) days += 1;
      }
    }
    return Math.round(shiftTargetHours * (days || workDaysInWeek) * 10) / 10;
  }, [shiftTargetHours, workDaysInWeek, weekBounds.start, state.customOptions?.attendanceSettings, state.organization?.workingDays]);

  const dynamicWorkSchedule = `${weeklyTargetHours % 1 === 0 ? weeklyTargetHours : weeklyTargetHours.toFixed(1)} Hours`;

  // Generate Dynamic Attendance Log Rows strictly from actual recorded attendance
  const attendanceHistory = useMemo(() => {
    const targetSeconds = shiftTargetHours * 3600;

    const userAttendanceLogs = state.attendance.filter(
      (a) =>
        a.employeeId === state.currentPersona?.id ||
        (a.employeeName && state.currentPersona?.name && a.employeeName.toLowerCase() === state.currentPersona.name.toLowerCase())
    );

    const historyRows = userAttendanceLogs.flatMap((log) => {
      const dayKey = attendanceDayKey(log.date);
      if (!dayKey) return [];
      const isTodayRecord = dayKey === todayIsoStr;
      if (
        isTodayRecord &&
        myTodayRecord?.id &&
        log.id &&
        log.id !== myTodayRecord.id
      ) {
        return [];
      }
      const sessions = sessionsFromRecord(log);
      const isOngoing = isTodayRecord && hasOpenAttendanceSession(log);
      const loggedSecs = isTodayRecord ? currentElapsedSeconds : attendanceElapsedSeconds(log, now);
      const firstSession = sessions[0];
      const lastSession = sessions[sessions.length - 1];

      const hoursNum = Math.floor(loggedSecs / 3600);
      const minsNum = Math.floor((loggedSecs % 3600) / 60);
      const formattedLogged = `${hoursNum}h ${String(minsNum).padStart(2, '0')}m`;

      const deficitMins = Math.floor((targetSeconds - loggedSecs) / 60);
      let deficitDisplay = '';
      if (loggedSecs >= targetSeconds) {
        const overMins = Math.floor((loggedSecs - targetSeconds) / 60);
        const overHours = Math.floor(overMins / 60);
        const overRemain = overMins % 60;
        deficitDisplay = overHours > 0 ? `+${overHours}h ${String(overRemain).padStart(2, '0')}m` : `+${overMins}m`;
      } else {
        const defHours = Math.floor(deficitMins / 60);
        const defRemainMins = deficitMins % 60;
        deficitDisplay = defHours > 0 ? `-${defHours}h ${String(defRemainMins).padStart(2, '0')}m` : `-${defRemainMins}m`;
      }

      const clean = (value?: string) => (value ? value.replace(/\s*\(GMT[^\)]*\)/gi, '').trim() : '');
      const missed = Boolean(log.missedPunchOut);

      return [{
        date: dayKey,
        loggedSeconds: missed ? 0 : loggedSecs,
        in: clean(firstSession?.checkIn || log.checkIn) || '—',
        inLoc: firstSession?.locationName || log.locationName || activeOfficeDisplayName,
        out: lastSession?.checkOut
          ? clean(lastSession.checkOut)
          : missed
            ? '—'
            : log.checkIn
              ? 'In Progress'
              : '—',
        outLoc: lastSession?.locationName || log.locationName || activeOfficeDisplayName,
        sched: formatHourSpan(shiftTargetHours),
        logged: missed ? '—' : formattedLogged,
        deficit: missed ? '—' : deficitDisplay,
        status: missed
          ? 'Missed punch-out'
          : dayStatusLabel(
              log.status || (isOngoing ? 'Present (Active)' : 'Present'),
              sessions.map((session) => session.locationName)
            ),
        sessions: sessions.map((s, idx) => ({
          label: `Login ${idx + 1}`,
          in: clean(s.checkIn) || '—',
          out: s.checkOut ? clean(s.checkOut) : missed ? '—' : 'In Progress',
          loc: s.locationName || log.locationName || activeOfficeDisplayName,
        })),
      }];
    });

    const byDay = new Map<string, (typeof historyRows)[number]>();
    for (const row of historyRows) {
      const prev = byDay.get(row.date);
      if (!prev || row.loggedSeconds > prev.loggedSeconds) byDay.set(row.date, row);
    }

    return [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [state.attendance, state.currentPersona, todayIsoStr, isCheckedIn, isCheckedOut, myTodayRecord, activeOfficeDisplayName, currentElapsedSeconds, shiftTargetHours, parseTimeToTodayDate, now]);

  const filteredHistory = useMemo(() => {
    const currentMonth = todayIsoStr.slice(0, 7);
    const lastMonthDate = new Date(`${todayIsoStr}T00:00:00`);
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;

    return attendanceHistory.filter((item) => {
      if (dateRangeFilter === 'Current Month' && !item.date.startsWith(currentMonth)) return false;
      if (dateRangeFilter === 'Last Month' && !item.date.startsWith(lastMonth)) return false;
      const places = [item.inLoc, item.outLoc, ...(item.sessions || []).map((session) => session.loc)]
        .join(' ')
        .toLowerCase();
      if (recordFilter !== 'All') {
        const want = recordFilter.toLowerCase();
        const status = item.status.toLowerCase();
        const remoteDay = want === 'wfh' || want === 'remote';
        if (remoteDay) {
          if (!status.includes('home') && !status.includes('wfh') && !places.includes('home') && !places.includes('wfh')) {
            return false;
          }
        } else if (!status.includes(want)) {
          return false;
        }
      }
      if (locationFilter !== 'All') {
        const want = locationFilter.toLowerCase();
        const remotePlace = want === 'remote' || want === 'wfh' || want === 'home';
        if (remotePlace) {
          if (!places.includes('home') && !places.includes('remote') && !places.includes('wfh')) return false;
        } else if (!places.includes(want)) {
          return false;
        }
      }
      if (statusFilter === 'Regularized' && !item.status.toLowerCase().includes('regular')) return false;
      if (statusFilter === 'Verified' && item.status.toLowerCase().includes('regular')) return false;
      return true;
    });
  }, [attendanceHistory, recordFilter, locationFilter, dateRangeFilter, statusFilter, todayIsoStr]);

  const totalPages = Math.ceil(filteredHistory.length / rowsPerPage) || 1;
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateRangeFilter, recordFilter, locationFilter, statusFilter]);

  // Same seconds as the punch log, limited to this Sunday–Saturday week, one row per day.
  const dynamicLoggedHours = useMemo(() => {
    const seconds = attendanceHistory.reduce((total, row) => {
      if (row.date < weekBounds.start || row.date > weekBounds.end) return total;
      return total + row.loggedSeconds;
    }, 0);
    return (Math.round((seconds / 3600) * 10) / 10).toFixed(1);
  }, [attendanceHistory, weekBounds.start, weekBounds.end]);

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
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGpsStatus('denied');
      setIsLocating(false);
      setPunchAddress('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGpsStatus('locating');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const accuracy = position.coords.accuracy || 5;

        setCurrentLat(userLat);
        setCurrentLng(userLng);
        setGpsAccuracy(accuracy);
        setHasDeviceGpsLocation(true);
        setGpsStatus('granted');
        setIsLocating(false);

        // Compute distance to the active physical office
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

        // Reverse-geocode device GPS to real street address
        try {
          const address = await reverseGeocodeLatLng(userLat, userLng);
          setPunchAddress(address || `${userLat.toFixed(5)}, ${userLng.toFixed(5)}`);
        } catch {
          setPunchAddress(`${userLat.toFixed(5)}, ${userLng.toFixed(5)}`);
        }
      },
      (error) => {
        console.warn('Geolocation error:', error);
        setIsLocating(false);
        setGpsStatus(isGeofenceOptional ? 'granted' : 'denied');
        setHasDeviceGpsLocation(false);
        if (isGeofenceOptional) {
          setIsInsideRadius(true);
        }
        setPunchAddress(
          error.code === error.PERMISSION_DENIED
            ? 'Browser location permission denied. Please enable GPS location.'
            : 'Unable to retrieve your current location.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [activeOfficeLat, activeOfficeLng, configuredGeofenceRadius, selectedLocation, hasConfiguredOfficeCoords, isGeofenceOptional]);

  useEffect(() => {
    if (!showPunchLocationModal || punchMode !== 'qr' || !allowQrAttendance) return;
    if (!(isSuperAdmin || isHR || isManager || state.currentPersona.role === 'faculty')) return;
    let cancelled = false;
    const refresh = async () => {
      const res = await api.attendance.getOfficeQrToken(selectedOfficeIdForPunch);
      if (cancelled) return;
      if (res.success && res.data) {
        setOfficeQr({
          token: res.data.token,
          expiresAt: res.data.expiresAt,
          officeName: res.data.officeName,
        });
        setQrError(null);
      } else {
        setQrError(res.error?.message || 'Could not load office QR');
      }
    };
    void refresh();
    const ms = Math.max(15, Number(attPolicy.qrRefreshIntervalSeconds) || 30) * 1000;
    const id = window.setInterval(refresh, ms);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    showPunchLocationModal,
    punchMode,
    allowQrAttendance,
    isSuperAdmin,
    isHR,
    isManager,
    selectedOfficeIdForPunch,
    attPolicy.qrRefreshIntervalSeconds,
  ]);

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
    setShowPunchLocationModal(true);
    setPunchStep('map');
    setPunchMode('gps');
    setQrTokenInput('');
    setQrError(null);
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
    const remoteAuthorized = selectedLocation === 'wfh' || hasWfhAuthorization;
    // Clock-out is allowed outside the geofence without filing another WFH request.
    if (isCheckedIn) {
      if (requireSelfieNow) handleOpenSelfieCamera(remoteAuthorized);
      else void handleFinalConfirmPunch(remoteAuthorized, null);
      return;
    }
    if (!isGeofenceOptional && !remoteAuthorized && !hasConfiguredOfficeCoords) {
      setPingToast(
        'Office location coordinates are not configured. Set latitude/longitude in Attendance Settings before punching at the office, or punch in as work from home.'
      );
      setTimeout(() => setPingToast(null), 5000);
      return;
    }
    const proceed = (asRemote: boolean) => {
      if (requireSelfieNow) {
        handleOpenSelfieCamera(asRemote);
      } else {
        void handleFinalConfirmPunch(asRemote, null);
      }
    };
    if (selectedLocation === 'wfh') {
      proceed(true);
      return;
    }
    // Already applied WFH for today — punch remote without asking again.
    if (hasWfhAuthorization && !isInsideRadius) {
      proceed(true);
      return;
    }
    if (isInsideRadius || isGeofenceOptional || outOfRadiusAction === 'Allow') {
      proceed(false);
      return;
    }
    setPunchStep('confirm_out_radius');
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

        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Camera device API not supported by browser');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });

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
          const isDenied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
          setCameraError(
            isDenied
              ? 'Camera access is blocked. Please allow camera permissions in your browser address bar and click Retry Camera.'
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

    const dataUrl = captureMirroredSelfie(video);
    if (!dataUrl) return;
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

  // Retake: clear captured photo and restart camera
  const handleRetake = () => {
    handleRetryCamera();
  };

  // Final punch submission (called after selfie capture or skip)
  const handleFinalConfirmPunch = async (asRemote: boolean = false, selfieDataUrl?: string | null) => {
    const openSession = sessionsFromRecord(myTodayRecord).find(
      (session) =>
        isPlaceholderCheckout(session.checkOut) ||
        checkoutStillAhead(session.checkOut, now, myTodayRecord?.date)
    );
    const remotePunch = isCheckedIn
      ? isRemotePlace(openSession?.locationName)
      : asRemote || selectedLocation === 'wfh';
    const punchPlaceName = remotePunch
      ? 'Work from home'
      : selectedLocation && selectedLocation !== 'wfh'
        ? selectedLocation
        : openSession?.locationName || activeOfficeDisplayName;
    setShowPunchLocationModal(false);
    setShowSelfieModal(false);
    stopCameraStream();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    setIsSaving(true);
    try {
      if (!isCheckedIn) {
        // Late only on the first punch of the day
        const expectedStartDate = parseTimeToTodayDate(configuredShiftStart, now);
        let calculatedStatus: AttendanceRecord['status'] = myTodayRecord?.status || 'Present';
        const assignedShift = state.customOptions?.shifts?.find((shift) => shift.id === userShiftTiming?.shiftId);
        const orgGrace = orgGraceMinutes(state.customOptions?.attendanceSettings, state.customOptions?.attendancePolicies);
        const gracePeriodMins = assignedShift
          ? assignedShift.gracePeriodMinutes != null
            ? Number(assignedShift.gracePeriodMinutes)
            : orgGrace
          : userShiftTiming?.graceMinutes != null
            ? Number(userShiftTiming.graceMinutes)
            : orgGrace;
        const skipLate =
          Boolean(userShiftTiming?.isHourlyShift) ||
          userShiftTiming?.shiftId === 'OFF' ||
          String(userShiftTiming?.startTime || '').trim().toLowerCase() === 'flexible';
        const priorPlaces = sessionsFromRecord(myTodayRecord).map((session) => session.locationName);
        const lateArrival =
          !skipLate &&
          !hasPunchedToday &&
          !!expectedStartDate &&
          isArrivalLate(now, configuredShiftStart, gracePeriodMins);
        const placesAfter = [...priorPlaces, punchPlaceName];
        const everyLoginRemote = placesAfter.length > 0 && placesAfter.every((place) => isRemotePlace(place));
        if (lateArrival) calculatedStatus = 'Late';
        else if (everyLoginRemote) calculatedStatus = 'Work From Home';
        else if (myTodayRecord?.status === 'Late') calculatedStatus = 'Late';
        else calculatedStatus = 'Present';

        const punchRes = await persistPunch({
          punchType: 'check_in',
          deviceInfo: remotePunch ? 'Work From Home' : punchMode === 'qr' ? 'Office QR Verified' : 'GPS + Webcam Verified',
          checkInTime: timeStr,
          status: calculatedStatus,
          selfiePhoto: selfieDataUrl,
          qrToken: punchMode === 'qr' ? qrTokenInput.trim() : undefined,
          workFromHome: remotePunch,
        });
        if (!punchRes.success) {
          alert(`Check-in failed on backend: ${punchRes.error?.message || 'Request failed'}`);
          setIsSaving(false);
          return;
        }

        let wfhRegularization: AttendanceRegularization | null = null;
        let wfhNote = '';
        if (remotePunch) {
          try {
            const filed = await ensurePendingWfhRegularization({
              employeeId: state.currentPersona.id,
              employeeName: state.currentPersona.name,
              avatar: state.currentPersona.avatar,
              department: state.currentPersona.department,
              date: toLocalDateKey(),
              shiftStart: configuredShiftStart,
              shiftEnd: configuredShiftEnd,
              remarks:
                selectedLocation === 'wfh'
                  ? 'Work from home selected at punch time'
                  : 'Requested while outside office geofence',
              existing: state.regularizations || [],
            });
            if (filed.kind === 'created') wfhRegularization = filed.regularization;
            if (filed.kind === 'created' || filed.kind === 'pending') {
              wfhNote = ' Waiting on your manager to approve work from home.';
            }
          } catch (err: any) {
            wfhNote = ` Punch is recorded, but the WFH request failed: ${err?.message || 'try again from Regularizations.'}`;
          }
        }

      const todayIsoDate = toLocalDateKey();
      const existingToday = state.attendance.find(
        (a) => a.employeeId === state.currentPersona.id && a.date === todayIsoDate
      );
      const newRecord = applyPunchToDailyRecord(existingToday, {
        type: 'check_in',
        time: timeStr,
        date: todayIsoDate,
        employeeId: state.currentPersona.id,
        employeeName: state.currentPersona.name,
        avatar: state.currentPersona.avatar,
        locationName: punchPlaceName,
        latitude: currentLat,
        longitude: currentLng,
        isWithinGeofence: !remotePunch && isInsideRadius,
        ipAddress: '106.51.72.18',
        device: remotePunch ? 'Work From Home' : 'Web GPS Verified',
        status: calculatedStatus,
        selfiePhoto: selfieDataUrl,
      });

      onUpdateState((prev) => ({
        ...prev,
        attendance: [
          newRecord,
          ...prev.attendance.filter(
            (a) => !(a.employeeId === state.currentPersona.id && a.date === todayIsoDate)
          ),
        ],
        regularizations: wfhRegularization
          ? [wfhRegularization, ...prev.regularizations]
          : prev.regularizations,
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
            message: `Clocked in at ${timeStr} from ${punchPlaceName}.${calculatedStatus === 'Late' ? ' (Late Entry)' : ''}${wfhNote}`,
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
        setPingToast(
          remotePunch
            ? `Punched in at ${timeStr}.${wfhNote}`
            : hasPunchedToday
              ? `Punched in again at ${timeStr}`
              : `Punch In Verified via GPS at ${timeStr}`
        );
      } else {
        const punchRes = await persistPunch({
          punchType: 'check_out',
          deviceInfo: remotePunch ? 'Work From Home' : punchMode === 'qr' ? 'Office QR Verified' : 'GPS + Webcam Verified',
          checkOutTime: timeStr,
          selfiePhoto: selfieDataUrl,
          qrToken: punchMode === 'qr' ? qrTokenInput.trim() : undefined,
          workFromHome: remotePunch,
        });
        if (!punchRes.success) {
          alert(`Check-out failed on backend: ${punchRes.error?.message || 'Request failed'}`);
          setIsSaving(false);
          return;
        }

        const workedHoursVal = Math.max(0.01, Number((currentElapsedSeconds / 3600).toFixed(2)));
        const halfDayThreshold = state.customOptions?.attendanceSettings?.halfDayThresholdHours ?? 4.5;
        const fullDayThreshold = state.customOptions?.attendanceSettings?.fullDayMinimumHours ?? 8.0;
        const placesToday = sessionsFromRecord(myTodayRecord).map((session) => session.locationName);
        const everyLoginRemote = placesToday.length > 0 && placesToday.every((place) => isRemotePlace(place));
        let finalStatus: AttendanceRecord['status'] = 'Present';
        if (workedHoursVal < halfDayThreshold) {
          finalStatus = 'Absent';
        } else if (workedHoursVal < fullDayThreshold) {
          finalStatus = 'Half Day';
        } else if (myTodayRecord?.status === 'Late') {
          finalStatus = 'Late';
        } else if (everyLoginRemote) {
          finalStatus = 'Work From Home';
        }

      const nowTime = Date.now();
      const todayStr = toLocalDateKey();

      let savedSessions: Awaited<ReturnType<typeof persistClockOutTaskSessions>> = [];
      try {
        savedSessions = await persistClockOutTaskSessions(
          state.tasks,
          state.timesheets,
          state.currentPersona.id,
          state.currentPersona.name,
          nowTime
        );
      } catch (err) {
        console.error('Failed to close task timesheets on clock-out', err);
      }

      onUpdateState((prev) => {
        const applied = applyTaskSessions(prev.tasks || [], prev.timesheets, savedSessions);
        let updatedTimesheets = applied.timesheets;
        const savedIds = new Set(savedSessions.map((session) => session.taskId));

        const updatedTasks = applied.tasks.map((t) => {
          const isMyTask =
            [...(t.assigneeIds || []), t.assigneeId].includes(prev.currentPersona.id) ||
            [...(t.assigneeNames || []), t.assigneeName].some(
              (name) => name && name.toLowerCase() === prev.currentPersona.name.toLowerCase()
            );

          if (!savedIds.has(t.id) && isMyTask && t.status === 'In Progress' && t.isTimerRunning && t.timerStartedAt) {
            let timeSpentSeconds = t.timeSpentSeconds || (t.actualHours ? Math.round(t.actualHours * 3600) : 0);
            const elapsed = Math.max(0, Math.floor((nowTime - t.timerStartedAt) / 1000));
            timeSpentSeconds += elapsed;
            const actualHours = Number((timeSpentSeconds / 3600).toFixed(2));
            const elapsedHours = Number((elapsed / 3600).toFixed(2));

            updatedTimesheets = updatedTimesheets.map((ts) => {
              if (ts.taskId === t.id && ts.date === todayStr && !ts.endTime) {
                return {
                  ...ts,
                  hours: Number((ts.hours + elapsedHours).toFixed(2)),
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

        const prior = prev.attendance.find(
          (a) =>
            (a.employeeId === prev.currentPersona.id || a.employeeName === prev.currentPersona.name) &&
            a.date === todayStr
        );
        const closed = applyPunchToDailyRecord(prior, {
          type: 'check_out',
          time: timeStr,
          date: todayStr,
          employeeId: prev.currentPersona.id,
          employeeName: prev.currentPersona.name,
          avatar: prev.currentPersona.avatar,
          locationName: openSession?.locationName || punchPlaceName,
          status: finalStatus,
          selfiePhoto: selfieDataUrl,
        });

        return {
          ...prev,
          attendance: [
            closed,
            ...prev.attendance.filter(
              (a) =>
                !(
                  (a.employeeId === prev.currentPersona.id || a.employeeName === prev.currentPersona.name) &&
                  a.date === todayStr
                )
            ),
          ],
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
        setPingToast(`Punched out at ${timeStr}. You can punch in again today if you return.`);
      }

      setShowSelfieModal(false);
      stopCameraStream();
      setTimeout(() => setPingToast(null), 3500);
    } catch (err: any) {
      console.error('Failed to process punch', err);
      alert(err?.message || 'Failed to process punch');
    } finally {
      setIsSaving(false);
    }
  };

  const myRegs = state.regularizations.filter(
    (r) => r.employeeId === state.currentPersona.id || r.employeeName === state.currentPersona.name
  );

  const visibleRegularizations = isSuperAdmin || isHR
    ? state.regularizations
    : state.regularizations.filter((request) => request.employeeId === state.currentPersona.id || accessibleEmpIds.has(request.employeeId) || canApproveRegularization(state.currentPersona, request, state.employees));

  const scopedTeamLeaves = isSuperAdmin || isHR ? state.leaves || [] : getTeamLeaves(state.currentPersona, state.leaves || [], state.employees);
  const leaveRows = (isUserView || leaveView === 'mine' ? targetEmpLeaves : scopedTeamLeaves).filter((leave) =>
    (leaveFilterStatus === 'All' || leave.status === leaveFilterStatus) &&
    (leaveTypeFilter === 'All' || leave.leaveType === leaveTypeFilter) &&
    (!leaveMonth || (leave.startDate.slice(0,7) <= leaveMonth && leave.endDate.slice(0,7) >= leaveMonth)) &&
    `${leave.employeeName} ${leave.reason} ${leave.leaveType}`.toLowerCase().includes(leaveSearchQuery.trim().toLowerCase())
  ).sort((a,b) => (b.appliedOn || b.startDate).localeCompare(a.appliedOn || a.startDate));
  const currentLeavePage = Math.min(leavePage, Math.max(1, Math.ceil(leaveRows.length / leavePageSize)));
  const pagedLeaveRows = leaveRows.slice((currentLeavePage - 1) * leavePageSize, currentLeavePage * leavePageSize);
  const currentTeamPage = Math.min(teamPage, Math.max(1, Math.ceil(filteredTeamRecords.length / teamPageSize)));
  const pagedTeamRecords = filteredTeamRecords.slice((currentTeamPage - 1) * teamPageSize, currentTeamPage * teamPageSize);
  useEffect(() => setTeamPage(1), [teamSearchQuery, teamAttendanceDate, teamTabFilter, teamStatusFilter, teamShiftFilter, teamBatchFilter]);

  const leaveRequestFilters = (
<div className="request-toolbar leave-shared-filters">
            <label className="request-search"><Search size={16}/><input value={leaveSearchQuery} aria-label="Search leaves" placeholder="Search leaves or reason" onChange={(e) => setLeaveSearchQuery(e.target.value)}/></label>
            <select aria-label="Leave status" value={leaveFilterStatus} onChange={(e) => setLeaveFilterStatus(e.target.value)}>{['All','Pending','Manager approved','Approved','Rejected','Cancelled'].map((status) => <option key={status} value={status}>{status === 'All' ? 'All statuses' : status}</option>)}</select>
            <select aria-label="Leave type" value={leaveTypeFilter} onChange={(e) => setLeaveTypeFilter(e.target.value)}><option value="All">All leave types</option>{Array.from(new Set<string>((state.leaves || []).map((leave: LeaveRequest) => leave.leaveType))).map((type) => <option key={type}>{type}</option>)}</select>
            <input type="month" aria-label="Leave month" value={leaveMonth} onChange={(e) => setLeaveMonth(e.target.value)}/>
            {(leaveMonth || leaveTypeFilter !== 'All' || leaveSearchQuery || leaveFilterStatus !== 'All') && <button type="button" className="request-clear" onClick={() => { setLeaveMonth(''); setLeaveTypeFilter('All'); setLeaveSearchQuery(''); setLeaveFilterStatus('All'); }}>Clear filters</button>}
          </div>
  );

  const mainContent = (
    <div className="work-page attendance-studio" data-mobile-attendance={mobileAttendancePane} data-mobile-subtab={subTab}>
      {(state.currentPersona.role !== 'student' || mobileViewport) && (
        <>{mobileViewport && <nav className="work-tabs m2-attendance-nav" aria-label="Attendance views">
<button type="button" className="work-tab" aria-selected={subTab === 'my_attendance' && mobileAttendancePane === 'overview'} onClick={() => { setSubTab('my_attendance'); setMobileAttendancePane('overview'); }}>Overview</button>
<button type="button" className="work-tab" aria-selected={subTab === 'my_attendance' && mobileAttendancePane === 'history'} onClick={() => { setSubTab('my_attendance'); setMobileAttendancePane('history'); }}>History</button>
{state.currentPersona.role !== 'student' && (!isUserView || isStudentMode) && <button type="button" className="work-tab" aria-selected={subTab === 'team_attendance'} onClick={() => setSubTab('team_attendance')}>Team</button>}
</nav>}
<div className="work-tabs m2-attendance-desktop-tabs overflow-x-auto no-scrollbar touch-pan-x">
          {!isStudentMode && (
            <button
              type="button"
              onClick={() => setSubTab('my_attendance')}
              className="work-tab"
              aria-selected={subTab === 'my_attendance'}
            >
              My attendance
            </button>
          )}

          {(!isUserView || isStudentMode) && (
            <button
              type="button"
              onClick={() => setSubTab('team_attendance')}
              className="work-tab"
              aria-selected={subTab === 'team_attendance'}
            >
              {isStudentMode ? 'Class attendance' : isSuperAdmin || isHR || isInstitution ? 'Staff attendance' : 'Team attendance'}
              <span className={`work-chip ${subTab === 'team_attendance' ? 'work-chip-navy' : 'work-chip-muted'}`}>
                {teamAttendanceStats.totalEmployees}
              </span>
            </button>
          )}

          {!isStudentMode && (
            <button
              type="button"
              onClick={() => setSubTab('leaves')}
              className="work-tab"
              aria-selected={subTab === 'leaves'}
            >
              Leaves
              {pendingLeavesCount > 0 && (
                <span className={`work-chip ${subTab === 'leaves' ? 'work-chip-navy' : 'work-chip-muted'}`}>
                  {pendingLeavesCount}
                </span>
              )}
            </button>
          )}

          {!isStudentMode && (
            <button
              type="button"
              onClick={() => setSubTab('regularizations')}
              className="work-tab"
              aria-selected={subTab === 'regularizations'}
            >
              Regularizations
              {pendingRegCount > 0 && (
                <span className={`work-chip ${subTab === 'regularizations' ? 'work-chip-navy' : 'work-chip-muted'}`}>
                  {pendingRegCount}
                </span>
              )}
            </button>
          )}

          {!isStudentMode && (
            <button
              type="button"
              onClick={() => setSubTab('holidays')}
              className="work-tab"
              aria-selected={subTab === 'holidays'}
            >
              Holidays
            </button>
          )}
        </div></>
      )}

      {/* VIEW 1: MY ATTENDANCE */}
      {(!isStudentMode || state.currentPersona.role === 'student') && (
        <div className={`flex flex-col gap-5${subTab === 'my_attendance' ? '' : ' hidden'}`}>
          {pingToast && (
            <div className="fixed top-5 right-5 z-50 flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] px-4 py-2.5 rounded-[var(--card-radius)] shadow-[0_9px_22px_rgba(26,58,84,.09)] text-[13px] font-semibold">
              <CheckCircle2 className="h-4 w-4 text-[#2f5d45]" />
              <span>{pingToast}</span>
            </div>
          )}

          <div className="work-head">
            <h1 className="work-title">My attendance</h1>
          </div>

          <MyAttendanceTodayPanel
            shiftName={
              `${isUserHourlyWorker && !isStudentMode
                ? `Hourly / flexible shift (₹${userHourlyRate}/hr)`
                : activeShiftName}${todaySessionCount > 1 ? ` · ${todaySessionCount} logins` : ''}`
            }
            shiftHours={`${configuredShiftStart} – ${configuredShiftEnd}`}
            elapsedSeconds={currentElapsedSeconds}
            targetSeconds={Math.max(3600, Math.round(shiftTargetHours * 3600))}
            statusKind={
              !hasPunchedToday
                ? 'idle'
                : isOnBreak
                  ? 'break'
                  : isCheckedIn
                    ? 'live'
                    : 'done'
            }
            locationSelect={
              <select
                value={locationSelectValue}
                onChange={(e) => setSelectedLocation(e.target.value)}
                disabled={isCheckedIn}
                aria-label="Punch location"
                title={
                  isCheckedIn
                    ? 'This login stays at the place you punched in. Clock out before switching office or work from home.'
                    : 'Choose the office or work from home before you punch in'
                }
                className="work-field att-today-loc"
              >
                {lockedPlace && !isRemotePlace(lockedPlace) && !availableOffices.includes(lockedPlace) && (
                  <option value={lockedPlace}>{lockedPlace}</option>
                )}
                {availableOffices.map((off, idx) => (
                  <option key={`office-${off}-${idx}`} value={off}>
                    {off}
                  </option>
                ))}
                {!isInstitution && !isStudentMode && !isStudentLogin && (
                  <option value="wfh">Work from home</option>
                )}
                {availableOffices.length === 0 && (
                  <option value="" disabled>
                    No campus location configured
                  </option>
                )}
              </select>
            }
            action={renderMyAttendancePunchAction({
              hasConfiguredOffice,
              selectedLocation,
              isSuperAdmin,
              isHR,
              isStudentMode,
              isAttendanceConfigured,
              isCheckedOut,
              isCheckedIn,
              onSetup: () => router.push('/settings?section=attendance'),
              onPunch: handlePunch,
            })}
            breakAction={
              isCheckedIn && !isStudentMode ? (
                <button
                  type="button"
                  className="work-btn-secondary"
                  disabled={isSaving}
                  onClick={() => void handleToggleBreak('General')}
                >
                  {isOnBreak ? 'Resume work' : 'Take a break'}
                </button>
              ) : undefined
            }
            week={
              isStudentMode
                ? null
                : {
                    loggedHours: dynamicLoggedHours,
                    scheduleLabel: dynamicWorkSchedule,
                    progress:
                      weeklyTargetHours > 0
                        ? (Number(dynamicLoggedHours) / weeklyTargetHours) * 100
                        : 0,
                    figures: isUserHourlyWorker
                      ? [
                          { label: 'Hourly wage', value: `₹${userHourlyRate}` },
                          {
                            label: 'Tracked earnings',
                            value: `₹${Math.round(Number(dynamicLoggedHours) * userHourlyRate).toLocaleString('en-IN')}`,
                          },
                        ]
                      : undefined,
                  }
            }
          />

                      {mobileViewport && <div className="m2-attendance-overview">
              <MobileSection title="Today’s timeline">
                {todaySessions.map((session,index) => <React.Fragment key={index}>
                  <MobileRow title="Clocked in" detail={[parseTimeToTodayDate(session.checkIn, now)?.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}),session.locationName || myTodayRecord?.locationName || 'Office'].filter(Boolean).join(' · ')} onClick={() => setMobileAttendancePane('history')} />
                  {session.checkOut && <MobileRow title="Clocked out" detail={parseTimeToTodayDate(session.checkOut, now)?.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) || session.checkOut} onClick={() => setMobileAttendancePane('history')} />}
                </React.Fragment>)}
                {!todaySessions.length && <p className="m2-empty">No punches recorded today.</p>}
              </MobileSection>
              <MobileSection title="This month"><MobileRow title={filteredHistory.length + ' attendance records'} detail="View your hours and attendance history" onClick={() => setMobileAttendancePane('history')} /></MobileSection>
              <div>
                <MobileRow title="Time off" detail="Balances and leave requests" href="/leaves" />
                <MobileRow title="Regularizations" detail="Request or review an attendance correction" onClick={() => setSubTab('regularizations')} />
                <MobileRow title="Holidays" detail="Your workplace holiday calendar" onClick={() => setSubTab('holidays')} />
                <MobileRow title="Timesheets" detail="Your logged hours and schedules" href="/timesheets" />
              </div>
            </div>}

            {mobileViewport && mobileAttendancePane === 'history' ? <MobileAttendanceHistory rows={attendanceHistory} today={todayIsoStr} onCorrection={!isStudentMode && state.currentPersona.role !== 'student' ? date => openRegModal({ date }) : undefined} /> : <section className="attendance-punch-panel" aria-label="Punch log">
            <header className="attendance-panel-heading"><h2>Punch log</h2></header>
          <AttendanceFilterToolbar
            leading={
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                aria-label="Filter by date range"
                className="work-field min-w-0 flex-1 sm:flex-none"
              >
                <option value="Current Month">Current month</option>
                <option value="Last Month">Last month</option>
                <option value="All">All dates</option>
              </select>
            }
            selects={[
              {
                id: 'record',
                value: recordFilter,
                onChange: setRecordFilter,
                'aria-label': 'Filter by record',
                options: [
                  { value: 'All', label: 'All records' },
                  { value: 'Present', label: 'Present' },
                  { value: 'Late', label: 'Late' },
                  ...(!isInstitution ? [{ value: 'WFH', label: 'Work from home' }] : []),
                ],
              },
              {
                id: 'location',
                value: locationFilter,
                onChange: setLocationFilter,
                'aria-label': 'Filter by location',
                options: [
                  { value: 'All', label: 'All locations' },
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
                  { value: 'All', label: 'All statuses' },
                  { value: 'Verified', label: 'Verified' },
                  { value: 'Regularized', label: 'Regularized' },
                ],
              },
            ]}
            trailing={
              !isStudentMode && state.currentPersona.role !== 'student' ? (
                <button type="button" onClick={() => openRegModal()} className="work-btn-secondary">
                  Apply regularization
                </button>
              ) : null
            }
          />

          <MyAttendanceLogTable
            rows={paginatedHistory}
            totalCount={filteredHistory.length}
            currentPage={currentPage}
            totalPages={totalPages}
            rowsPerPage={rowsPerPage}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={(rows) => {
              setRowsPerPage(rows);
              setCurrentPage(1);
            }}
            isStudentMode={isStudentMode}
          />
          </section>}
        </div>
      )}

      {/* VIEW 2: TEAM ATTENDANCE (FOR HR / MANAGERS / FACULTY) */}
      {state.currentPersona.role !== 'student' && subTab === 'team_attendance' && (mobileViewport ? <MobileTeamAttendance records={teamAttendanceStats.enrichedRecords} date={teamAttendanceDate} onDate={setTeamAttendanceDate} student={isStudentMode} onSelect={onSelectEmployee} onReport={canAccessReports?()=>{setReportsModalInitialType('daily');setShowReportsModal(true);}:undefined} onPhoto={att=>void openAttendancePhotos(att)}/> : (
        <div className="space-y-5 text-[var(--text-primary)]">
          <div className="work-head">
            <h1 className="work-title">
              {isStudentMode ? 'Class attendance' : 'Staff attendance'}
            </h1>
            {canAccessReports && (
            <button
              type="button"
              onClick={() => {
                setReportsModalInitialType('daily');
                setShowReportsModal(true);
              }}
              className={ATT_BTN_SECONDARY}
              title="Export Attendance Report (PDF)"
            >
              <Printer className="h-3.5 w-3.5 text-[var(--text-muted)]" />
              <span>Export Report</span>
            </button>
            )}
          </div>

          <div className="attendance-team-overview grid grid-cols-1 xl:grid-cols-5 gap-3 items-stretch">
            <div className="attendance-team-figures xl:col-span-3 min-h-0">
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
              <div className="attendance-team-insight"><CheckCircle2 size={18} aria-hidden="true" /><div><strong>{teamAttendanceStats.onTime + teamAttendanceStats.late} of {teamAttendanceStats.totalEmployees} {isStudentMode ? 'students' : 'people'} checked in</strong><p>{teamAttendanceStats.notInYet} have not checked in · {teamAttendanceStats.timeOff} on leave</p></div></div>
            </div>
            <div className="xl:col-span-2 min-h-0">
              <AttendanceOverviewChart data={teamOverviewChartData} />
            </div>
          </div>

          {/* Quick Attendance Summary Card */}
          <div className={`attendance-team-panel ${ATT_CARD} overflow-hidden`}>
            {/* Header with Title, Employee Search & Date Picker */}
            <div className="p-4 sm:p-5 border-b border-[var(--border-color)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className={ATT_SECTION_TITLE}>Employee attendance</h2>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                {/* Employee Search Bar */}
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                  <input
                    type="text"
                    value={teamSearchQuery}
                    onChange={(e) => setTeamSearchQuery(e.target.value)}
                    placeholder="Search employee…"
                    aria-label="Search attendance"
                    className="work-field w-full pl-10 pr-8"
                  />
                  {teamSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTeamSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Date Picker */}
                <div className="work-field flex items-center gap-2 justify-between sm:justify-start">
                  <div className="flex items-center gap-1.5">
                    <CalendarIcon className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                    <span className="text-[11px] font-medium text-[var(--text-muted)] sm:hidden">Date:</span>
                  </div>
                  <DateInput aria-label="Attendance date" value={teamAttendanceDate} onChange={(e) => setTeamAttendanceDate(e.target.value)}
                    className="bg-transparent outline-none text-xs font-semibold text-[var(--text-primary)] cursor-pointer"
                  />
                </div>

                {!isStudentMode && (
                  <select className="work-field" aria-label="Filter attendance by shift" value={teamShiftFilter} onChange={(event) => setTeamShiftFilter(event.target.value)}>
                    <option value="All">All shifts</option>
                    {teamShiftOptions.map((shift) => <option key={shift} value={shift}>{shift}</option>)}
                  </select>
                )}

                {/* Batch Selector & Group by Batch Toggle for Student/School Mode */}
                {isStudentMode && (
                  <>
                    <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-subtle)] sm:bg-[var(--bg-surface)] text-xs font-semibold text-[var(--text-secondary)] shadow-2xs">
                      <Filter className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">Batch:</span>
                      <select
                        value={teamBatchFilter}
                        onChange={(e) => setTeamBatchFilter(e.target.value)}
                        className="bg-transparent outline-none text-xs font-bold text-[var(--text-primary)] cursor-pointer"
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
                        teamGroupByBatch ? 'is-selected' : ''
                      }`}
                      title="Toggle batch-wise grouped breakdown"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>{teamGroupByBatch ? 'Grouped by Batch' : 'Group by Batch'}</span>
                    </button>
                  </>
                )}


              </div>
            </div>

            {/* Filter Tabs: All, Checked In, Late, Not Checked In */}
            <div className="px-4 py-2.5 work-tabs overflow-x-auto no-scrollbar touch-pan-x border-b-0">
              {[
                { id: 'All' as const, label: 'All', count: teamAttendanceStats.totalEmployees },
                { id: 'Checked In' as const, label: isStudentMode ? 'Present' : 'Checked in', count: teamAttendanceStats.onTime },
                { id: 'Late' as const, label: 'Late', count: teamAttendanceStats.late },
                { id: 'Not Checked In' as const, label: isStudentMode ? 'Absent' : 'Not checked in', count: teamAttendanceStats.notInYet },
                ...(isStudentMode ? [] : [{ id: 'Hourly' as const, label: 'Hourly staff', count: teamAttendanceStats.hourlyCount }]),
              ].map((tab) => {
                const isActive = teamTabFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTeamTabFilter(tab.id as any)}
                    className="work-tab"
                    aria-selected={isActive}
                  >
                    {tab.label}
                    <span className={`work-chip ${isActive ? 'work-chip-navy' : 'work-chip-muted'}`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="attendance-team-breakdown p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => setTeamStatusFilter(teamStatusFilter === 'on_time' ? 'all' : 'on_time')}
                className={`att-stat${teamStatusFilter === 'on_time' ? ' is-active' : ''}`}
              >
                <div className="att-stat-value">{teamAttendanceStats.onTime}</div>
                <div className="att-stat-label">{isStudentMode ? 'Present' : 'On time'}</div>
              </button>
              <button
                type="button"
                onClick={() => setTeamStatusFilter(teamStatusFilter === 'late' ? 'all' : 'late')}
                className={`att-stat${teamStatusFilter === 'late' ? ' is-active' : ''}`}
              >
                <div className="att-stat-value">{teamAttendanceStats.late}</div>
                <div className="att-stat-label">Late</div>
              </button>
              <button
                type="button"
                onClick={() => setTeamStatusFilter(teamStatusFilter === 'not_in_yet' ? 'all' : 'not_in_yet')}
                className={`att-stat${teamStatusFilter === 'not_in_yet' ? ' is-active' : ''}`}
              >
                <div className="att-stat-value">{teamAttendanceStats.notInYet}</div>
                <div className="att-stat-label">{isStudentMode ? 'Absent' : 'Not in yet'}</div>
              </button>
              <button
                type="button"
                onClick={() => setTeamStatusFilter(teamStatusFilter === 'time_off' ? 'all' : 'time_off')}
                className={`att-stat${teamStatusFilter === 'time_off' ? ' is-active' : ''}`}
              >
                <div className="att-stat-value">{teamAttendanceStats.timeOff}</div>
                <div className="att-stat-label">{isStudentMode ? 'On leave' : 'Time off'}</div>
              </button>
            </div>

            {/* Mobile Staff / Student Attendance Cards */}
            <div className="block md:hidden p-4 space-y-3 border-t border-[var(--border-color)]">
              {filteredTeamRecords.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--text-muted)] font-medium bg-[var(--bg-surface-subtle)]/60 rounded-xl border border-[var(--border-color)]">
                  No {isStudentMode ? 'student' : 'employee'} attendance records match the selected shift or status filters.
                </div>
              ) : teamGroupByBatch && isStudentMode ? (
                /* Grouped Mobile Cards */
                groupedBatches.map((grp) => (
                  <div key={grp.batchName} className="space-y-2.5">
                    <div className="p-3 bg-[var(--bg-surface-subtle)]/90 rounded-xl border border-[var(--border-color)] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-[var(--text-primary)]">{grp.batchName}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)] shadow-2xs">
                          {grp.totalEnrolled} Students
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        grp.rate >= 75 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {grp.rate}% Avg
                      </span>
                    </div>

                    {grp.records.map(({ emp, att, statusType, statusLabel, firstPunch, lastPunch, hoursFormatted, breakHours, isWarning, isHourlyWorker, hourlyRate, earnedToday, overtimeHours, overtimeFormatted, cumulativeAttendanceRate, isBelowThreshold, geoLabel }) => (
                      <div key={emp.id} className="attendance-person-card p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xs space-y-3">
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
                              <h4 className="font-semibold text-[var(--text-primary)] text-sm truncate hover:text-[var(--studio-navy)]">{emp.name}</h4>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs text-[var(--text-muted)] truncate">{emp.designation || 'Student'}</p>
                                {isBelowThreshold && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> &lt; 75% At-Risk
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          <div className="shrink-0 flex flex-col items-end gap-1.5">
                            <TeamStatusBadge statusType={statusType} label={statusLabel} isStudentMode={isStudentMode} />
                            <TeamGeoBadge geoLabel={geoLabel} />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 bg-[var(--bg-surface-subtle)]/80 p-2.5 rounded-xl border border-[var(--border-color)] text-xs">
                          <div>
                            <span className="text-[11px] font-medium text-[var(--text-muted)]">Punch times</span>
                            <p className="font-semibold text-[var(--text-primary)] text-xs mt-0.5 tabular-nums">
                              {firstPunch} – {lastPunch}
                            </p>
                          </div>
                          <div>
                            <span className="text-[11px] font-medium text-[var(--text-muted)]">Attendance Rate</span>
                            <p className="font-semibold text-[var(--text-primary)] text-xs mt-0.5 tabular-nums">
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
                pagedTeamRecords.map(({ emp, att, shift, statusType, statusLabel, firstPunch, lastPunch, hoursFormatted, breakHours, isWarning, isHourlyWorker, hourlyRate, earnedToday, overtimeHours, overtimeFormatted, cumulativeAttendanceRate, isBelowThreshold, geoLabel }) => (
                  <div key={emp.id} className="attendance-person-card p-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xs space-y-3">
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
                          <h4 className="font-semibold text-[var(--text-primary)] text-sm truncate hover:text-[var(--studio-navy)]">{emp.name}</h4>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs text-[var(--text-muted)] truncate">{emp.designation || (isStudentMode ? 'Student' : 'Employee')}</p>
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
                        <TeamStatusBadge statusType={statusType} label={statusLabel} isStudentMode={isStudentMode} />
                        <TeamGeoBadge geoLabel={geoLabel} />
                      </div>
                    </div>

                    {!isStudentMode && <div className="attendance-mobile-shift"><span>Shift</span><p>{shift}</p></div>}

                    <div className="grid grid-cols-2 gap-2 bg-[var(--bg-surface-subtle)]/80 p-2.5 rounded-xl border border-[var(--border-color)] text-xs">
                      <div>
                        <span className="text-[11px] font-medium text-[var(--text-muted)]">Punch times</span>
                        <p className="font-semibold text-[var(--text-primary)] text-xs mt-0.5 tabular-nums">
                          {firstPunch} – {lastPunch}
                        </p>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-[var(--text-muted)]">{isStudentMode ? 'Attendance Rate' : 'Work & Break'}</span>
                        <div className="font-semibold text-[var(--text-primary)] text-xs mt-0.5 space-y-0.5">
                          {isStudentMode ? (
                            <div className="flex items-center gap-1 tabular-nums font-bold">
                              <span>{cumulativeAttendanceRate}%</span>
                              <span className="text-[var(--text-muted)] font-normal">({hoursFormatted})</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 tabular-nums">
                              <span>{hoursFormatted}</span>
                              <span className="text-[var(--text-muted)] font-normal">({breakHours} break)</span>
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

                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-color)] text-xs">
                      {att && (
                        <button
                          type="button"
                          onClick={() => void openAttendancePhotos(att)}
                          className="px-3 py-1.5 rounded-xl border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] text-xs font-medium transition-all cursor-pointer shadow-2xs"
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
                        className="px-3 py-1.5 rounded-xl bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
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
            <div className="hidden md:block overflow-x-auto border-t border-[var(--border-color)]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] font-semibold text-xs border-b border-[var(--border-color)] select-none">
                  <tr>
                    <th
                      onClick={() => handleToggleSort('employee')}
                      className="p-3.5 pl-5 cursor-pointer hover:bg-[var(--bg-surface-subtle)] transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={teamSortField === 'employee' ? 'text-blue-600 font-semibold' : ''}>{isStudentMode ? 'Student' : 'Employee'}</span>
                        {teamSortField === 'employee' ? (
                          teamSortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-blue-600" /> : <ArrowDown className="h-3.5 w-3.5 text-blue-600" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-[var(--text-muted)]" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleSort('batch')}
                      className="p-3.5 font-semibold cursor-pointer hover:bg-[var(--bg-surface-subtle)] transition-colors"
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
                      className={`p-3.5 font-semibold ${isStudentMode ? 'cursor-pointer hover:bg-[var(--bg-surface-subtle)]' : ''}`}
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
                <tbody className="divide-y divide-[var(--border-color)] font-medium text-[var(--text-primary)]">
                  {filteredTeamRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-10 text-center text-xs text-[var(--text-muted)]">
                        No {isStudentMode ? 'student' : 'employee'} attendance records match the selected shift or status filters.
                      </td>
                    </tr>
                  ) : teamGroupByBatch && isStudentMode ? (
                    /* Grouped Batch Rows */
                    groupedBatches.map((grp) => (
                      <React.Fragment key={grp.batchName}>
                        <tr className="bg-[var(--bg-surface-subtle)]/80 border-y border-[var(--border-color)]">
                          <td colSpan={10} className="py-2.5 px-5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <span className="font-bold text-xs text-[var(--text-primary)]">{grp.batchName}</span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)] shadow-2xs">
                                  {grp.totalEnrolled} Students Enrolled
                                </span>
                                <span className="text-[11px] text-[var(--text-muted)] font-medium">
                                  (Present: {grp.activeCount}, Late: {grp.lateCount}, Absent: {grp.absentCount})
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-[var(--text-muted)]">Batch Health:</span>
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
                        {grp.records.map(({ emp, att, statusType, statusLabel, firstPunch, lastPunch, workingHours, hoursFormatted, breakHours, isWarning, shift, shiftKind, isHourlyWorker, hourlyRate, earnedToday, overtimeHours, overtimeFormatted, cumulativeAttendanceRate, isBelowThreshold, geoLabel }) => (
                          <tr key={emp.id} className="hover:bg-[var(--bg-surface-subtle)]/80 transition-colors">
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
                                  <div className="font-semibold text-[var(--text-primary)] text-xs group-hover:text-[var(--studio-navy)] group-hover:underline transition-colors">{emp.name}</div>
                                  <div className="text-[10px] text-[var(--text-muted)] font-mono">STU-{emp.employeeId || emp.id}</div>
                                </div>
                              </button>
                            </td>
                            <td className="p-3.5">
                              <div className="font-medium text-[var(--text-secondary)] text-xs">{emp.designation || 'Student'}</div>
                            </td>
                            <td className="p-3.5">
                              <div className="space-y-0.5">
                                <div className="font-semibold text-xs text-[var(--text-primary)]">{shift}</div>
                                {shiftKind && (
                                  <div className="text-[10px] text-[var(--text-muted)]">{shiftKind}</div>
                                )}
                              </div>
                            </td>
                            <td className="p-3.5 text-xs font-medium text-[var(--text-secondary)] tabular-nums">
                              {firstPunch}
                            </td>
                            <td className="p-3.5 text-xs font-medium text-[var(--text-muted)] tabular-nums">
                              {lastPunch}
                            </td>
                            <td className="p-3.5 text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                              <span>{hoursFormatted}</span>
                            </td>
                            <td className="p-3.5 text-xs tabular-nums">
                              <div className="flex items-center gap-1.5">
                                <span className={`font-bold text-xs ${cumulativeAttendanceRate < 75 ? 'text-amber-800' : 'text-[var(--text-primary)]'}`}>
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
                              <TeamStatusBadge statusType={statusType} label={statusLabel} isStudentMode={isStudentMode} />
                            </td>
                            <td className="p-3.5 pr-5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                {att && (
                                  <button
                                    type="button"
                                    onClick={() => void openAttendancePhotos(att)}
                                    className="px-2.5 py-1 rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] text-xs font-medium transition-all cursor-pointer shadow-2xs"
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
                                  className="px-2.5 py-1 rounded-lg bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
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
                    pagedTeamRecords.map(({ emp, att, statusType, statusLabel, firstPunch, lastPunch, workingHours, hoursFormatted, breakHours, isWarning, shift, shiftKind, isHourlyWorker, hourlyRate, earnedToday, overtimeHours, overtimeFormatted, cumulativeAttendanceRate, isBelowThreshold, geoLabel }) => (
                      <tr key={emp.id} className="hover:bg-[var(--bg-surface-subtle)]/80 transition-colors">
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
                            <div className="font-semibold text-[var(--text-primary)] text-xs group-hover:text-[var(--studio-navy)] group-hover:underline transition-colors">{emp.name}</div>
                          </button>
                        </td>
                        <td className="p-3.5">
                          <div className="font-medium text-[var(--text-secondary)] text-xs">{emp.designation || (isStudentMode ? 'Student' : 'Employee')}</div>
                        </td>
                        <td className="p-3.5">
                          {isHourlyWorker ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                                <Clock className="w-3 h-3 text-indigo-600" /> Hourly (Flexible)
                              </span>
                              <div className="text-[10px] text-[var(--text-muted)] font-mono font-medium pl-1">₹{hourlyRate}/hr</div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-xs text-[var(--text-primary)]">{shift}</div>
                              {shiftKind && (
                                <div className="text-[10px] text-[var(--text-muted)]">{shiftKind}</div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-xs font-medium text-[var(--text-secondary)] tabular-nums">
                          {firstPunch}
                        </td>
                        <td className="p-3.5 text-xs font-medium text-[var(--text-muted)] tabular-nums">
                          {lastPunch}
                        </td>
                        <td className="p-3.5 text-xs font-semibold text-[var(--text-primary)] tabular-nums">
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
                        <td className="p-3.5 text-xs font-medium text-[var(--text-secondary)] tabular-nums">
                          {isStudentMode ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`font-bold text-xs ${cumulativeAttendanceRate < 75 ? 'text-amber-800' : 'text-[var(--text-primary)]'}`}>
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
                          <TeamStatusBadge statusType={statusType} label={statusLabel} isStudentMode={isStudentMode} />
                        </td>
                        <td className="p-3.5 pr-5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            {att && (
                              <button
                                type="button"
                                onClick={() => void openAttendancePhotos(att)}
                                className="px-2.5 py-1 rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] text-xs font-medium transition-all cursor-pointer shadow-2xs"
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
                              className="px-2.5 py-1 rounded-lg bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
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
          {(!isStudentMode || !teamGroupByBatch) && <WorkspacePagination total={filteredTeamRecords.length} page={currentTeamPage} pageSize={teamPageSize} onPageChange={setTeamPage} onPageSizeChange={(size) => { setTeamPageSize(size); setTeamPage(1); }}/>}
        </div>
      ))}

      {/* VIEW 3: REGULARIZATIONS */}
      {!isStudentMode && state.currentPersona.role !== 'student' && subTab === 'regularizations' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
                <h2 className="work-title">Regularizations</h2>

            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isInstitution && (
                <button
                  type="button"
                  onClick={() =>
                    openRegModal({ reason: 'Work From Home', remarks: 'Work from home request' })
                  }
                  className={ATT_BTN_SECONDARY}
                >
                  Request WFH
                </button>
              )}
              <button
                onClick={() => openRegModal()}
                className={ATT_BTN_PRIMARY}
              >
                <Plus className="h-4 w-4" /> Apply Regularization
              </button>
            </div>
          </div>

          <AttendanceStatCards columns={3} items={[
            { id: 'waiting', label: 'Waiting for approval', value: visibleRegularizations.filter((request) => request.status === 'Pending').length, tone: 'leave' },
            { id: 'approved', label: 'Approved this month', value: visibleRegularizations.filter((request) => request.status === 'Approved' && request.date.startsWith(toLocalDateKey(new Date()).slice(0, 7))).length, tone: 'present' },
            { id: 'scope', label: 'People in this view', value: new Set(visibleRegularizations.map((request) => request.employeeId)).size, tone: 'neutral' },
          ]} />

          <RegularizationRequestsView onApply={()=>openRegModal()} onRequestWFH={!isInstitution?()=>openRegModal({reason:'Work From Home',remarks:'Work from home request'}):undefined} requests={visibleRegularizations} currentEmployeeId={state.currentPersona.id} canReview={(request) => canApproveRegularization(state.currentPersona, request, state.employees)} onReview={handleApproveRegularization} />
        </div>
      )}

      {/* VIEW: LEAVES & TIME OFF */}
      {!isStudentMode && subTab === 'leaves' && (mobileViewport && leaveView === 'mine' ? <MobileTimeOff balances={[
        {label:'Casual leave',remaining:casualLeft,quota:personalQuota('casualLeave'),used:casualUsed,pending:casualPending,restricted:isTargetInProbation},
        {label:'Sick leave',remaining:sickLeft,quota:personalQuota('sickLeave'),used:sickUsed,pending:sickPending,restricted:isTargetInProbation},
        {label:'Earned leave',remaining:earnedLeft,quota:personalQuota('earnedLeave'),used:earnedUsed,pending:earnedPending,restricted:isTargetInProbation},
      ]} requests={targetEmpLeaves} holidays={state.customOptions?.holidays || []} onApply={()=>{setSelectedLeaveEmpId(targetEmployeeObj.id);setShowApplyLeaveModal(true);}} onCancel={handleCancelLeave} saving={isSaving} canCancelManagerApproved={isSuperAdmin||isHR} onApprovals={!isUserView?()=>setLeaveView('approvals'):undefined} /> : (
        <div className="leave-workspace space-y-5">
          {(isUserView || leaveView === 'mine') && leaveView !== 'policy' && <header className="my-leaves-page-head"><h2 className="work-title">My leaves</h2><div>{canAccessReports && <button type="button" className={ATT_BTN_SECONDARY} onClick={() => { setReportsModalInitialType('leaves'); setShowReportsModal(true); }}><Printer size={15}/>Export report</button>}<button type="button" className={ATT_BTN_PRIMARY} onClick={() => { setSelectedLeaveEmpId(targetEmployeeObj.id); setShowApplyLeaveModal(true); }}><Plus size={16}/>Apply for leave</button></div></header>}

          <div className="work-tabs leave-subnav" role="tablist" aria-label="Leave views">
            <button type="button" className="work-tab" role="tab" aria-selected={leaveView === 'mine'} onClick={() => setLeaveView('mine')}>My leaves</button>
            {!isUserView && <button type="button" className="work-tab" role="tab" aria-selected={leaveView === 'approvals'} onClick={() => setLeaveView('approvals')}>Leave approvals</button>}
            <button type="button" className="work-tab" role="tab" aria-selected={leaveView === 'policy'} onClick={() => setLeaveView('policy')}>Leave policy</button>
          </div>
          {leaveView === 'policy' ? <section className="leave-policy-panel"><h2 className="work-title">Leave policy</h2><div className="leave-policy-quotas">{[['Casual leave', casualQuota],['Sick leave', sickQuota],['Earned leave', earnedQuota]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value} days</strong></div>)}</div><dl>
            <div><dt>Grant cycle</dt><dd>{effectiveQuotas.isMonthlyCycle ? 'Monthly' : 'Annual'}</dd></div>
            <div><dt>Approval workflow</dt><dd>{({ manager_then_hr: 'Manager, then HR', manager_only: 'Reporting manager', hr_only: 'HR approval' })[state.customOptions?.leaveSettings?.approvalWorkflow || 'manager_then_hr']}</dd></div>
            <div><dt>Supporting documents</dt><dd>Required for leave longer than {state.customOptions?.leaveSettings?.maxConsecutiveDaysWithoutDoc || 3} consecutive days.</dd></div>
            <div><dt>Negative balance</dt><dd>{state.customOptions?.leaveSettings?.allowNegativeBalance ? 'Allowed under company policy' : 'Requests must stay within available balances'}</dd></div>
            <div><dt>Compensatory leave</dt><dd>{state.customOptions?.leaveSettings?.enableCompOff ? 'Enabled' : 'Disabled'}</dd></div>
            <div><dt>Carry forward</dt><dd>{state.customOptions?.leaveSettings?.enableCarryOver ? `Up to ${state.customOptions.leaveSettings.maxCarryForwardDays || 0} days` : 'Disabled'}</dd></div>
          </dl>{isTargetInProbation && <p className="leave-policy-notice">Probation policy is active. Paid leave is restricted until probation completion.</p>}</section> : <>

        {(isUserView || leaveView === 'mine') ? (
          <MyLeavesView
            balances={[
              { label: 'Casual leave', remaining: casualLeft, quota: personalQuota('casualLeave'), used: casualUsed, pending: casualPending, restricted: isTargetInProbation },
              { label: 'Sick leave', remaining: sickLeft, quota: personalQuota('sickLeave'), used: sickUsed, pending: sickPending, restricted: isTargetInProbation },
              { label: 'Earned / Privilege', remaining: earnedLeft, quota: personalQuota('earnedLeave'), used: earnedUsed, pending: earnedPending, restricted: isTargetInProbation },
              ...(!isInstitution ? [{ label: 'Work from home', remaining: wfhLeft, quota: personalQuota('compOff'), used: wfhUsed, pending: wfhPending, restricted: isTargetInProbation, onRequest: () => { setSubTab('regularizations'); openRegModal({ reason: 'Work From Home', remarks: 'Work from home request' }); } }] : []),
            ]}
            requests={targetEmpLeaves} rows={pagedLeaveRows} filters={leaveRequestFilters}
            page={currentLeavePage} pageSize={leavePageSize} total={leaveRows.length}
            saving={isSaving} onCancel={handleCancelLeave} onPageChange={setLeavePage}
            onPageSizeChange={(size) => { setLeavePageSize(size); setLeavePage(1); }}
            probation={isTargetInProbation} monthlyCycle={effectiveQuotas.isMonthlyCycle}
            canCancelManagerApproved={isSuperAdmin || isHR}
          />
        ) : (
          <div className="min-w-0 space-y-5">
            {/* HR Approvals View */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div>
                <h2 className="work-title">Leave approvals</h2>
              </div>

              <div className="flex items-center gap-2">
                {(state.leaves || []).some((l) => l.status === 'Pending') && (
                  <button
                    type="button"
                    onClick={handleApproveAllPending}
                    className="flex items-center gap-1.5 rounded-xl bg-[var(--studio-navy)] hover:bg-[var(--studio-navy-hover)] px-3.5 py-2 text-xs font-bold text-white transition-[transform,background-color] duration-150 ease-out cursor-pointer shadow-sm active:scale-[0.97]"
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
                  value: scopedTeamLeaves.filter((l) => l.status === 'Pending').length,
                  tone: 'leave',
                },
                {
                  id: 'approved',
                  label: 'Approved',
                  value: scopedTeamLeaves.filter((l) => l.status === 'Approved').length,
                  tone: 'present',
                },
                {
                  id: 'total',
                  label: 'Total',
                  value: scopedTeamLeaves.length,
                  tone: 'neutral',
                },
              ]}
            />

            {leaveRequestFilters}

            {/* Pending Requests Review Table (Scoped strictly to requests the persona has permission to approve) */}
            {(() => {
              const accessiblePendingLeaves = (state.leaves || []).filter((l) => {
                if (l.status !== 'Pending' && l.status !== 'Manager approved') return false;
                return canApproveLeave(state.currentPersona, l, state.employees, state.customOptions?.leaveSettings?.approvalWorkflow);
              });

              if (accessiblePendingLeaves.length === 0) return null;

              return (
                <div className="min-w-0 overflow-hidden rounded-xl border border-[#e6d7b0] bg-white shadow-2xs dark:border-amber-900/40 dark:bg-[var(--bg-surface)]">
                  <div className="flex items-center justify-between gap-3 border-b border-[#efe4cc] bg-[#fbf6ea] px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/30">
                    <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-[#5c4814] dark:text-amber-200">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-[#8a6a1f] dark:text-amber-400" />
                      <span className="truncate">Pending action items ({accessiblePendingLeaves.length})</span>
                    </div>
                  </div>

                  <ul className="m-0 list-none divide-y divide-[#efe4cc] p-0 dark:divide-amber-900/30">
                    {accessiblePendingLeaves.map((leave) => {
                      const emp = state.employees.find(
                        (e) => e.id === leave.employeeId || (e.name && e.name.toLowerCase() === leave.employeeName.toLowerCase())
                      );
                      const inProbation = isEmployeeInProbation(emp, state.customOptions?.probationSettings);
                      const isPaid = isPaidLeaveType(leave.leaveType, (leave as any).isPaid);

                      return (
                        <li key={leave.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <button
                                type="button"
                                onClick={() => handleEmployeeClick(leave.employeeId || leave.employeeName)}
                                className="text-left text-[13px] font-semibold text-[#172234] hover:text-[var(--studio-navy)] hover:underline cursor-pointer dark:text-white"
                              >
                                {leave.employeeName}
                              </button>
                              <span className="text-[12px] text-[#5e6c7b] dark:text-[#9e9ea7]">{leave.department || 'Operations'}</span>
                              {inProbation && (
                                <span className="inline-flex items-center rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  Probation
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-[#5e6c7b] dark:text-[#9e9ea7]">
                              <span className="font-semibold text-[#17324e] dark:text-amber-100">{leave.leaveType}</span>
                              {' · '}
                              <span className="tabular-nums">
                                {leave.startDate} – {leave.endDate} ({leave.daysCount}d)
                              </span>
                            </p>
                            {leave.reason ? (
                              <p className="break-words text-[13px] leading-5 text-[#172234] dark:text-slate-200">{leave.reason}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {inProbation && isPaid ? (
                              <button
                                type="button"
                                onClick={() => handleApproveAsUnpaid(leave.id)}
                                className="h-8 rounded-[7px] bg-amber-700 px-3 text-[12px] font-semibold text-white cursor-pointer hover:bg-amber-800"
                                title="Employee on probation: approve as loss of pay"
                              >
                                Approve as LOP
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleApproveLeave(leave.id, true)}
                                className="h-8 rounded-[7px] bg-[#17324e] px-3 text-[12px] font-semibold text-white cursor-pointer hover:bg-[#285275]"
                              >
                                Approve
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleApproveLeave(leave.id, false)}
                              className="h-8 rounded-[7px] border border-[#e4c8c8] bg-[#faeeee] px-3 text-[12px] font-semibold text-[#8b3133] cursor-pointer hover:bg-[#f6e4e4]"
                            >
                              Reject
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}

            {/* All Leave Requests Table */}
            <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xs">
              <div className="p-3.5 border-b border-[var(--border-color)] ">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] dark:text-[#9e9ea7]">All Workforce Leave Records</h3>
              </div>

              <div className="min-w-0 overflow-x-auto">
                <table className="leave-approval-history-table w-full text-left text-xs border-collapse">
                  <thead className="bg-[var(--bg-surface-subtle)]  text-[var(--text-muted)] dark:text-[#9e9ea7] font-bold uppercase text-[10px] border-b border-[var(--border-color)] ">
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
                  <tbody className="divide-y divide-[var(--border-color)] dark:divide-[#282830] font-medium text-[var(--text-primary)] dark:text-slate-200">
                    {pagedLeaveRows.map((leave) => {
                        const hasApprovalPermission = canApproveLeave(state.currentPersona, leave, state.employees, state.customOptions?.leaveSettings?.approvalWorkflow);

                        return (
                          <tr key={leave.id} className="hover:bg-[var(--bg-surface-subtle)] dark:hover:bg-[#18181d]">
                            <td data-label="Employee" className="p-3 font-bold text-[var(--text-primary)] dark:text-white">
                              <button
                                type="button"
                                onClick={() => handleEmployeeClick(leave.employeeId || leave.employeeName)}
                                className="text-left font-bold text-[var(--text-primary)] dark:text-white hover:text-[var(--studio-navy)] dark:hover:text-blue-400 hover:underline cursor-pointer transition-colors"
                                title={`View profile for ${leave.employeeName}`}
                              >
                                {leave.employeeName}
                              </button>
                            </td>
                            <td data-label="Department" className="p-3 text-[var(--text-muted)] dark:text-[#9e9ea7]">{leave.department || 'Operations'}</td>
                            <td data-label="Leave type" className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[var(--bg-surface-subtle)]  border border-[var(--border-color)]  text-[var(--text-primary)] dark:text-slate-200">
                                {leave.leaveType}
                              </span>
                            </td>
                            <td data-label="Dates & days" className="p-3 whitespace-nowrap font-mono">
                              {leave.startDate} to {leave.endDate} <span className="text-blue-600 dark:text-blue-400 font-bold">({leave.daysCount}d)</span>
                            </td>
                            <td data-label="Reason" className="p-3 text-[var(--text-muted)] dark:text-[#9e9ea7] max-w-xs truncate" title={leave.reason}>
                              {leave.reason}
                            </td>
                            <td data-label="Status" className="p-3">
                              <span
                                className={`rounded-md px-2.5 py-0.5 text-[10px] font-semibold border ${
                                  leave.status === 'Approved'
                                    ? 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40'
                                    : leave.status === 'Pending'
                                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
                                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/40'
                                }`}
                              >
                                {leave.status}
                              </span>
                            </td>
                            <td data-label="Action" className="p-3 text-right">
                              {hasApprovalPermission ? (
                                leave.status === 'Pending' || leave.status === 'Manager approved' ? (
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
                                      className="text-xs text-[var(--studio-error)] hover:underline cursor-pointer font-bold"
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  (isSuperAdmin || isHR) ? (
                                    <button
                                      type="button"
                                      onClick={() => handleApproveLeave(leave.id, leave.status !== 'Approved')}
                                      className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:hover:text-white cursor-pointer"
                                    >
                                      Toggle
                                    </button>
                                  ) : (
                                    <span className="text-[var(--text-muted)] text-xs">—</span>
                                  )
                                )
                              ) : (
                                <span className="text-[var(--text-muted)] text-xs">—</span>
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
        )}
          {!leaveRows.length && leaveView === 'approvals' && <div className="request-empty"><strong>No leave requests found</strong><p>Try another filter or check back for new requests.</p></div>}
          {leaveView === 'approvals' && <WorkspacePagination total={leaveRows.length} page={currentLeavePage} pageSize={leavePageSize} onPageChange={setLeavePage} onPageSizeChange={(size) => { setLeavePageSize(size); setLeavePage(1); }}/>}
          </>}
        </div>
      ))}



      {subTab === 'holidays' && (
        <div className="flex flex-col gap-5">
          <div className="work-head">
            <div>
              <h1 className="work-title">Holidays</h1>
              {canAccessReports && <button type="button" className={ATT_BTN_SECONDARY} onClick={() => router.push('/settings?section=attendance&tab=holidays')}>Manage holidays</button>}
              <p className="mt-1 text-sm text-[var(--text-muted)]">Published company holidays for the year.</p>
            </div>
          </div>
          <HolidayCalendarView holidays={state.customOptions?.holidays} />
        </div>
      )}

      {showClockOutModal && (
        <div className="dash-clock-modal" role="presentation" onClick={() => setShowClockOutModal(false)}>
          <div
            className="dash-clock-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="att-clock-out-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 id="att-clock-out-title">Clock out at {currentTimeFormatted}</h2>
              <p>Time on shift: {formatTimer(currentElapsedSeconds)}</p>
            </div>
            <textarea
              className="dash-clock-notes"
              value={clockOutNotes}
              onChange={(e) => setClockOutNotes(e.target.value)}
              placeholder="Notes (optional)"
              rows={3}
            />
            <div className="dash-clock-dialog-actions">
              <button type="button" className="dash-clock-secondary" onClick={() => setShowClockOutModal(false)}>
                Cancel
              </button>
              <button type="button" className="dash-clock-punch dash-clock-punch--out" onClick={handleConfirmClockOut}>
                Punch out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPLY REGULARIZATION SLIDE-OVER DRAWER (MATCHING ADD TASK UI) */}
      {showRegModal && (
        <div className="attendance-form-overlay studio-form-overlay fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div role="dialog" aria-modal="true" aria-label="Apply for regularization" className="studio-form-drawer relative w-full sm:max-w-lg md:max-w-xl h-full bg-[var(--bg-surface)] border-l border-[var(--border-color)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 text-[var(--text-primary)]">
            {/* Drawer Header */}
            <div className="p-4 sm:p-6 sm:px-8 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
              <h3 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)]">Apply for Regularization</h3>
              <button
                type="button"
                onClick={() => setShowRegModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] p-2 cursor-pointer rounded-xl hover:bg-[var(--bg-surface-subtle)] transition-colors duration-150 active:scale-[0.97]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleApplyRegularizationSubmit} autoComplete="off" className="flex-1 flex flex-col justify-between overflow-hidden bg-[var(--bg-surface)]">
              <div className="p-8 space-y-5 overflow-y-auto custom-scrollbar text-xs">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
                    Target Date <span className="text-rose-500">*</span>
                  </label>
                  <DateInput name="regularizationDate" value={regDate} onChange={(e) => setRegDate(e.target.value)}
                    max={toLocalISODate()}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
                      Requested In-Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      name="requestedInTime"
                      autoComplete="off"
                      value={to24HourTime(regInTime)}
                      onChange={(e) => setRegInTime(to12HourClockTime(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
                      Requested Out-Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      name="requestedOutTime"
                      autoComplete="off"
                      value={to24HourTime(regOutTime)}
                      onChange={(e) => setRegOutTime(to12HourClockTime(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
                    Reason for Regularization <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={regReason}
                    onChange={(e) => setRegReason(e.target.value as any)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
                  >
                    <option value="Work From Home">Work From Home</option>
                    <option value="Client Visit">Client Visit / Offsite Meeting</option>
                    <option value="Network / GPS Error">GPS Accuracy / Technical Glitch</option>
                    <option value="Forgot Punch In">Forgot to Clock In / Out</option>
                    <option value="On Duty">On Duty / Offsite</option>
                    <option value="Biometric Scanner Glitch">Biometric Scanner Glitch</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
                    Detailed Remarks / Explanation <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={regRemarks}
                    onChange={(e) => setRegRemarks(e.target.value)}
                    placeholder="Provide detailed context for manager approval..."
                    rows={3}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all resize-none"
                    required
                  />
                </div>
              </div>

              {/* Drawer Form Footer */}
              <div className="p-4 sm:p-6 sm:px-8 border-t border-[var(--border-color)] bg-[var(--bg-surface)] flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowRegModal(false)}
                  className="flex-1 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-sm font-semibold text-[var(--text-secondary)] cursor-pointer transition-colors duration-150 shadow-2xs active:scale-[0.97]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-[var(--studio-navy)] hover:bg-[var(--studio-navy-hover)] text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showPunchLocationModal && (
        <div className="att-overlay" role="presentation" onClick={() => setShowPunchLocationModal(false)}>
          <div
            className="att-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="att-punch-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="att-dialog-head">
              <h2 id="att-punch-title">
                {punchStep === 'map' ? 'Confirm punch location' : 'Outside the office'}
              </h2>
              <button
                type="button"
                className="att-dialog-close"
                onClick={() => setShowPunchLocationModal(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {punchStep === 'map' && allowQrAttendance && (
              <div className="att-dialog-modes" role="tablist" aria-label="Punch method">
                <button
                  type="button"
                  role="tab"
                  aria-selected={punchMode === 'gps'}
                  className="work-tab"
                  onClick={() => setPunchMode('gps')}
                >
                  GPS
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={punchMode === 'qr'}
                  className="work-tab"
                  onClick={() => setPunchMode('qr')}
                >
                  Office QR
                </button>
              </div>
            )}

            {/* Main interactive map view (or out-of-geofence warning) */}
            {punchStep === 'map' && punchMode === 'qr' ? (
              <div className="att-dialog-qr">
                {(isSuperAdmin || isHR || isManager || state.currentPersona.role === 'faculty') && officeQr?.token && (
                  <div className="text-center space-y-2">
                    <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
                      Kiosk code for {officeQr.officeName || activeOfficeDisplayName}
                    </p>
                    <img
                      alt="Office attendance QR"
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(officeQr.token)}`}
                    />
                    <p className="text-[11px] text-[var(--text-muted)]">Refreshes automatically. Enter this code to punch.</p>
                  </div>
                )}
                <div className="w-full max-w-sm">
                  <label htmlFor="att-qr-token">Office QR code</label>
                  <input
                    id="att-qr-token"
                    value={qrTokenInput}
                    onChange={(e) => setQrTokenInput(e.target.value)}
                    placeholder="Paste the rotating office token"
                    className="work-field"
                  />
                  {qrError && <p className="mt-2 text-xs text-[var(--studio-error)]">{qrError}</p>}
                </div>
              </div>
            ) : punchStep === 'map' ? (
              <div className="att-dialog-body">
                <PunchLocationLeafletMap
                  latitude={currentLat}
                  longitude={currentLng}
                  onRecalibrateGPS={fetchCurrentLocation}
                  isLocating={isLocating}
                />
              </div>
            ) : (
              <div className="att-dialog-warn">
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed m-0">
                  You are{' '}
                  <strong className="text-[var(--text-primary)]">
                    {geofenceDistanceMeters > 1000
                      ? `${(geofenceDistanceMeters / 1000).toFixed(1)} km`
                      : `${geofenceDistanceMeters} meters`}
                  </strong>{' '}
                  from {activeOfficeDisplayName}. The boundary is {configuredGeofenceRadius} meters.
                </p>
                <div className="att-dialog-alert">
                  {isInstitution || isStudentMode || isStudentLogin
                    ? 'Campus attendance is blocked outside the campus boundary. You need to be on campus to punch.'
                    : hasWfhAuthorization
                      ? 'You already have a work-from-home request for today. You can punch in remotely without filing another one.'
                      : outOfRadiusAction === 'Warn'
                        ? `You are outside ${activeOfficeDisplayName}. You can still punch there, or switch this login to work from home.`
                        : `Office attendance is blocked outside the radius. Punch in as work from home and your manager will review it.`}
                </div>
                <div className="dash-clock-dialog-actions" style={{ justifyContent: 'stretch' }}>
                  <button type="button" className="work-btn-secondary flex-1" onClick={() => setPunchStep('map')}>
                    Back to map
                  </button>
                  {outOfRadiusAction === 'Warn' && !hasWfhAuthorization && (
                    <button
                      type="button"
                      className="work-btn-secondary flex-1"
                      onClick={() => {
                        if (requireSelfieNow) handleOpenSelfieCamera(false);
                        else void handleFinalConfirmPunch(false, null);
                      }}
                      disabled={isSaving}
                    >
                      Punch at {activeOfficeDisplayName}
                    </button>
                  )}
                  {!isInstitution && !isStudentMode && !isStudentLogin && (
                    <button
                      type="button"
                      className="work-btn-primary flex-1"
                      onClick={() => {
                        if (requireSelfieNow) handleOpenSelfieCamera(true);
                        else void handleFinalConfirmPunch(true, null);
                      }}
                      disabled={isSaving}
                    >
                      {hasWfhAuthorization ? 'Continue as WFH' : 'Punch in as WFH'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bottom Bar: Live Address Header & Time with Punch Button */}
            {punchStep === 'map' && (
              <div className="shrink-0">
                {isGeofenceOptional && selectedLocation !== 'wfh' && (
                  <div className="att-dialog-notice">
                    Geofence is off for this punch — office radius is not enforced.
                  </div>
                )}
                {!isGeofenceOptional && selectedLocation !== 'wfh' && !hasConfiguredOfficeCoords && (
                  <div className="att-dialog-notice att-dialog-notice--error">
                    Office GPS is not set. Add coordinates in Settings, or punch as work from home.
                  </div>
                )}
                <div
                  className={`att-dialog-status flex items-center justify-between gap-3 ${
                    gpsStatus === 'denied' && selectedLocation !== 'wfh' ? 'att-dialog-status--error' : ''
                  }`}
                >
                  <p className="truncate m-0 text-[12px]">
                    {isLocating
                      ? 'Finding your location…'
                      : selectedLocation === 'wfh' && gpsStatus === 'denied'
                        ? 'Work from home — location not required'
                        : selectedLocation === 'wfh'
                          ? `${punchAddress} (WFH)`
                          : punchAddress}
                  </p>
                  {gpsStatus === 'denied' && selectedLocation !== 'wfh' && (
                    <button type="button" className="work-btn-secondary h-8 px-3 text-xs" onClick={fetchCurrentLocation}>
                      Retry GPS
                    </button>
                  )}
                </div>

                <div className="att-dialog-foot">
                  <div className="att-dialog-meta">
                    <strong suppressHydrationWarning>{currentTimeFormatted}</strong>
                    <span>
                      {isMounted
                        ? now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
                        : 'Monday, 24 Aug'}
                    </span>
                  </div>

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
                      punchMode !== 'qr' &&
                      !isGeofenceOptional &&
                      selectedLocation !== 'wfh' &&
                      hasConfiguredOfficeCoords &&
                      (!hasDeviceGpsLocation || gpsStatus !== 'granted');
                    const qrMissing = punchMode === 'qr' && !qrTokenInput.trim();
                    const isPunchDisabled =
                      (punchMode === 'gps' &&
                        (officeCoordsMissing ||
                          gpsRequiredMissing ||
                          (isLocating && selectedLocation !== 'wfh' && !isGeofenceOptional))) ||
                      qrMissing;
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
                      <button
                        type="button"
                        onClick={() => {
                          if (punchMode === 'qr') {
                            if (!qrTokenInput.trim()) {
                              setQrError('Paste the office QR code to continue.');
                              return;
                            }
                            if (requireSelfieNow) handleOpenSelfieCamera(false);
                            else void handleFinalConfirmPunch(false, null);
                            return;
                          }
                          handleProceedFromMap();
                        }}
                        disabled={isPunchDisabled}
                        title={punchHoverTitle}
                        className={`work-btn-primary ${isPunchDisabled ? 'opacity-55 cursor-not-allowed' : ''}`}
                      >
                        Confirm location
                      </button>
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

  const selfieModal = showSelfieModal && (
    <div className="att-overlay" role="presentation">
      <div className={'att-dialog' + (capturedSelfie ? ' att-dialog--captured' : '')} role="dialog" aria-modal="true" aria-labelledby="att-selfie-title">
        <div className="att-dialog-head">
          <h2 id="att-selfie-title">{capturedSelfie ? (isCheckedIn ? 'Confirm clock out' : 'Confirm punch in') : 'Take attendance photo'}</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="work-btn-secondary h-9 px-3 text-xs"
              onClick={() => {
                stopCameraStream();
                setShowSelfieModal(false);
                setShowPunchLocationModal(true);
                setPunchStep('map');
              }}
            >
              Location
            </button>
            <button
              type="button"
              className="att-dialog-close"
              aria-label="Close"
              onClick={() => {
                stopCameraStream();
                setShowSelfieModal(false);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="att-dialog-camera">
          {isFlashing && (
            <div className="absolute inset-0 bg-[var(--bg-surface)] z-50 pointer-events-none animate-camera-flash" />
          )}

          {cameraError ? (
            <div className="att-dialog-camera-empty">
              <p>{cameraError}</p>
              <p>Allow the camera in the address bar, then retry.</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleRetryCamera}
                  disabled={isCameraLoading}
                  className="work-btn-primary"
                >
                  {isCameraLoading ? 'Connecting…' : 'Retry camera'}
                </button>
                {!requireSelfieNow && (
                  <button
                    type="button"
                    onClick={() => handleFinalConfirmPunch(selfieAsRemote, null)}
                    className="work-btn-secondary"
                  >
                    Skip and punch
                  </button>
                )}
              </div>
            </div>
          ) : capturedSelfie ? (
            <img src={capturedSelfie} alt="Captured punch photo" />
          ) : (
            <>
              {isCameraLoading && (
                <div className="att-dialog-camera-empty">
                  <p>Connecting camera…</p>
                </div>
              )}
              <video
                ref={videoRef}
                className={`scale-x-[-1] transition-opacity duration-300 ${isCameraReady ? 'opacity-100' : 'opacity-0'}`}
                autoPlay
                playsInline
                muted
              />
            </>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
        {mobileViewport && capturedSelfie && <div className="att-photo-location"><strong>{activeOfficeDisplayName}</strong><p>{punchAddress}</p><p>This photo and verified location will be saved with your attendance record.</p></div>}

        <div className="att-dialog-foot">
          <div className="att-dialog-meta">
            <strong suppressHydrationWarning>{currentTimeFormatted}</strong>
            <span>
              {isMounted
                ? now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
                : 'Monday, 24 Aug'}
            </span>
          </div>
          {capturedSelfie ? (
            <div className="flex items-center gap-2">
              {!mobileViewport && <button type="button" className="work-btn-secondary" onClick={handleRetake}>
                Retake
              </button>}
              <button
                type="button"
                className="work-btn-primary"
                onClick={() => handleFinalConfirmPunch(selfieAsRemote, capturedSelfie)}
              >
                {isCheckedIn ? 'Confirm clock out' : 'Confirm punch in'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="work-btn-primary"
              onClick={handleTakePhoto}
              disabled={isCameraLoading || !isCameraReady || !!cameraError}
            >
              {cameraError ? 'Camera offline' : isCameraLoading || !isCameraReady ? 'Connecting…' : 'Take photo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const photoInspectionModal = selectedAttendancePhotoRecord && (
    <div
      className="att-overlay"
      style={{ zIndex: 90 }}
      role="presentation"
      onClick={() => {
        setSelectedAttendancePhotoRecord(null);
        setAttendancePhotoLoading(false);
      }}
    >
      <div
        className="att-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="att-photos-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="att-dialog-head">
          <h2 id="att-photos-title">{selectedAttendancePhotoRecord.employeeName}</h2>
          <button
            type="button"
            className="att-dialog-close"
            aria-label="Close"
            onClick={() => {
              setSelectedAttendancePhotoRecord(null);
              setAttendancePhotoLoading(false);
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Punch in</span>
              <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                {selectedAttendancePhotoRecord.checkIn
                  ? selectedAttendancePhotoRecord.checkIn.replace(/\s*\(GMT[^\)]*\)/gi, '').trim()
                  : '—'}
              </span>
            </div>
            <div className="rounded-[var(--list-radius)] overflow-hidden border border-[var(--border-color)] aspect-[4/3] bg-[var(--bg-app)] flex items-center justify-center">
              {selectedAttendancePhotoRecord.checkInPhoto || selectedAttendancePhotoRecord.selfiePhoto ? (
                <img
                  src={selectedAttendancePhotoRecord.checkInPhoto || selectedAttendancePhotoRecord.selfiePhoto}
                  alt={`Punch in photo for ${selectedAttendancePhotoRecord.employeeName}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <p className="text-xs text-[var(--text-muted)] px-4 text-center">
                  {attendancePhotoLoading ? 'Loading photo…' : 'No punch-in photo'}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Punch out</span>
              <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                {selectedAttendancePhotoRecord.checkOut
                  ? selectedAttendancePhotoRecord.checkOut.replace(/\s*\(GMT[^\)]*\)/gi, '').trim()
                  : 'Pending'}
              </span>
            </div>
            <div className="rounded-[var(--list-radius)] overflow-hidden border border-[var(--border-color)] aspect-[4/3] bg-[var(--bg-app)] flex items-center justify-center">
              {selectedAttendancePhotoRecord.checkOutPhoto ? (
                <img
                  src={selectedAttendancePhotoRecord.checkOutPhoto}
                  alt={`Punch out photo for ${selectedAttendancePhotoRecord.employeeName}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <p className="text-xs text-[var(--text-muted)] px-4 text-center">
                  {!selectedAttendancePhotoRecord.checkOut
                    ? 'Not punched out yet'
                    : attendancePhotoLoading
                      ? 'Loading photo…'
                      : 'No punch-out photo'}
                </p>
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
      className="attendance-form-overlay studio-form-overlay fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={() => setEditingAttendanceRecord(null)}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Edit attendance times" className="studio-form-drawer relative w-full max-w-lg md:max-w-xl h-full bg-[var(--bg-surface)]  border-l border-[var(--border-color)]  shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 text-[var(--text-primary)] dark:text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-6 sm:px-8 border-b border-[var(--border-color)]  flex items-center justify-between bg-[var(--bg-surface)]  shrink-0">
          <div>
            <h3 className="text-2xl font-bold text-[var(--text-primary)] dark:text-white">Edit Attendance Times</h3>
            <p className="text-xs text-[var(--text-muted)] dark:text-[#9e9ea7] mt-1 font-medium">
              {editingAttendanceRecord.employeeName} • {editingAttendanceRecord.date}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditingAttendanceRecord(null)}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:hover:text-white p-2 cursor-pointer rounded-xl hover:bg-[var(--bg-surface-subtle)] dark:hover:bg-[#18181d] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Form Body */}
        <form onSubmit={handleSaveAttendanceRecord} className="flex-1 flex flex-col justify-between overflow-hidden bg-[var(--bg-surface)] ">
          <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar text-xs">
            {/* Quick Shift Presets */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
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
                            ? 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40'
                            : 'bg-[var(--bg-surface-subtle)]  text-[var(--text-secondary)] dark:text-slate-300 border border-transparent hover:bg-[var(--bg-surface-hover)] dark:hover:bg-[#282830]'
                        }`}
                      >
                        General (9 AM - 6 PM)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimeChange('08:00:00 AM', '05:00:00 PM')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isMorning
                            ? 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40'
                            : 'bg-[var(--bg-surface-subtle)]  text-[var(--text-secondary)] dark:text-slate-300 border border-transparent hover:bg-[var(--bg-surface-hover)] dark:hover:bg-[#282830]'
                        }`}
                      >
                        Morning (8 AM - 5 PM)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTimeChange('09:00:00 AM', '01:30:00 PM')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          isHalfDay
                            ? 'bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40'
                            : 'bg-[var(--bg-surface-subtle)]  text-[var(--text-secondary)] dark:text-slate-300 border border-transparent hover:bg-[var(--bg-surface-hover)] dark:hover:bg-[#282830]'
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
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
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
                  className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm text-[var(--text-primary)] dark:text-white font-mono font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
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
                  className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm text-[var(--text-primary)] dark:text-white font-mono font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer"
                />
              </div>
            </div>

            {/* Logged Hours & Attendance Status Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300">
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
                  className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm text-[var(--text-primary)] dark:text-white font-mono font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                  Attendance Status <span className="text-rose-500">*</span>
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm text-[var(--text-primary)] dark:text-white font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all"
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
          <div className="p-6 px-8 border-t border-[var(--border-color)]  bg-[var(--bg-surface)]  flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setEditingAttendanceRecord(null)}
              className="flex-1 py-3 rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  hover:bg-[var(--bg-surface-subtle)] dark:hover:bg-[#202028] text-sm font-semibold text-[var(--text-secondary)] dark:text-slate-300 cursor-pointer transition-colors shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 rounded-xl bg-[var(--studio-navy)] hover:bg-[var(--studio-navy-hover)] text-white text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99]"
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
    <div className="attendance-form-overlay studio-form-overlay fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div role="dialog" aria-modal="true" aria-label="Apply for leave" className="studio-form-drawer relative w-full max-w-lg md:max-w-xl h-full bg-[var(--bg-surface)]  border-l border-[var(--border-color)]  shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 text-[var(--text-primary)] dark:text-white">
        
        {/* Drawer Header */}
        <div className="p-4 sm:p-7 sm:px-8 border-b border-[var(--border-color)]  flex items-center justify-between bg-[var(--bg-surface)]  shrink-0">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] dark:text-white tracking-tight">
              {isSuperAdmin || isHR ? 'Log Leave for Employee' : 'Apply for Leave'}
            </h3>
            <p className="text-xs text-[var(--text-muted)] dark:text-[#9e9ea7] mt-0.5">
              {isSuperAdmin || isHR
                ? 'Submit time-off request with duration, balance quota, and reason.'
                : 'Submit time-off request for approval with duration and reason.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowApplyLeaveModal(false)}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:hover:text-white p-2 rounded-xl hover:bg-[var(--bg-surface-subtle)] dark:hover:bg-[#1f1f26] cursor-pointer transition-colors shrink-0"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Form Body */}
        <form onSubmit={handleApplyLeaveSubmit} className="flex-1 flex flex-col justify-between overflow-hidden bg-[var(--bg-surface)] ">
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
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                  Assignee Member <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedLeaveEmpId}
                  onChange={(e) => setSelectedLeaveEmpId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm font-medium text-[var(--text-primary)] dark:text-white outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
                >
                  <option value={state.currentPersona.id} className="bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white font-bold">
                    Myself ({state.currentPersona.name}) — {state.currentPersona.role.replace('_', ' ')}
                  </option>
                  {state.employees
                    .filter((e) => e.id !== state.currentPersona.id)
                    .map((e) => (
                      <option key={e.id} value={e.id} className="bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white">
                        {e.name} ({e.employeeId || e.id}) • {e.designation || 'Staff'} — {e.department}
                      </option>
                    ))}
                </select>
              </div>
            ) : isManagerUser && managerDirectReports.length > 0 ? (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                  Leave For <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedLeaveEmpId}
                  onChange={(e) => setSelectedLeaveEmpId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm font-medium text-[var(--text-primary)] dark:text-white outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
                >
                  <option value={state.currentPersona.id} className="bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white font-bold">
                    Myself ({state.currentPersona.name})
                  </option>
                  {managerDirectReports.map((e) => (
                    <option key={e.id} value={e.id} className="bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white">
                      {e.name} ({e.employeeId || e.id}) • Direct Report — {e.designation || 'Staff'}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                  Requester
                </label>
                <div className="p-3.5 rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface-subtle)]/70  text-xs text-[var(--text-primary)] dark:text-white font-medium flex items-center justify-between">
                  <span>{state.currentPersona.name} ({state.currentPersona.role.replace('_', ' ')})</span>
                  <span className="text-[var(--text-muted)] font-semibold">{state.currentPersona.department}</span>
                </div>
              </div>
            )}

            {/* 2. Leave Category (Respecting Probation Restrictions) */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                Leave Category <span className="text-rose-500">*</span>
              </label>
              <select
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value as any)}
                className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm font-medium text-[var(--text-primary)] dark:text-white outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
              >
                {modalIsProbation ? (
                  <>
                    <option value="Unpaid Leave" className="bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white font-bold">
                      Loss of Pay (LOP) / Unpaid Leave (Standard for Probation)
                    </option>
                    <option value="Casual Leave" disabled className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)]">
                      Casual Leave (0 Days Available • Restricted in Probation)
                    </option>
                    <option value="Sick Leave" disabled className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)]">
                      Sick Leave (0 Days Available • Restricted in Probation)
                    </option>
                    <option value="Earned Leave" disabled className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)]">
                      Earned / Privilege Leave (0 Days Available • Restricted in Probation)
                    </option>
                  </>
                ) : (
                  <>
                    <option value="Casual Leave" className="bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white">
                      Casual Leave ({modalCasualLeft}/{Math.max(modalCasualLeft, modalTargetQuotas.annualQuotas.casualLeave)} Days Remaining)
                    </option>
                    <option value="Sick Leave" className="bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white">
                      Sick Leave ({modalSickLeft}/{Math.max(modalSickLeft, modalTargetQuotas.annualQuotas.sickLeave)} Days Remaining)
                    </option>
                    <option value="Earned Leave" className="bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white">
                      Earned / Privilege Leave ({modalEarnedLeft}/{Math.max(modalEarnedLeft, modalTargetQuotas.annualQuotas.earnedLeave)} Days Remaining)
                    </option>
                    <option value="Unpaid Leave" className="bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white">
                      Unpaid Leave / Loss of Pay
                    </option>
                  </>
                )}
              </select>
            </div>

            {/* 3. Duration Scope (Clean 3-Tab Segmented Control) */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                Duration Scope <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-[var(--bg-surface-subtle)]  rounded-xl border border-[var(--border-color)] ">
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
                        ? 'bg-[var(--bg-surface)]  text-[var(--text-primary)] dark:text-white font-bold shadow-xs'
                        : 'text-[var(--text-muted)] dark:text-[var(--text-muted)] hover:text-[var(--text-primary)] dark:hover:text-white'
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
                        ? 'border-blue-600 bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                        : 'border-[var(--border-color)]  bg-[var(--bg-surface)]  text-[var(--text-secondary)] dark:text-[var(--text-muted)]'
                    }`}
                  >
                    First Half (Morning)
                  </button>
                  <button
                    type="button"
                    onClick={() => setHalfSession('Second Half (Afternoon)')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-center ${
                      halfSession === 'Second Half (Afternoon)'
                        ? 'border-blue-600 bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold'
                        : 'border-[var(--border-color)]  bg-[var(--bg-surface)]  text-[var(--text-secondary)] dark:text-[var(--text-muted)]'
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
                <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                  Date of Time Off <span className="text-rose-500">*</span>
                </label>
                <DateInput value={singleDate} onChange={(e) => setSingleDate(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm text-[var(--text-primary)] dark:text-white font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer shadow-2xs"
                  required
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                      Start Date <span className="text-rose-500">*</span>
                    </label>
                    <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm text-[var(--text-primary)] dark:text-white font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer shadow-2xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                      End Date <span className="text-rose-500">*</span>
                    </label>
                    <DateInput min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm text-[var(--text-primary)] dark:text-white font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all cursor-pointer shadow-2xs"
                      required
                    />
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[var(--bg-surface-subtle)]  border border-[var(--border-color)]  flex items-center justify-between text-xs">
                  <span className="text-[var(--text-muted)] font-medium">Total Duration:</span>
                  <span className="font-bold text-[var(--text-primary)] dark:text-white">
                    {computedLeaveDays} {computedLeaveDays === 1 ? 'Business Day' : 'Business Days'}
                  </span>
                </div>
              </div>
            )}

            {/* 5. Work Handover Colleague */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                Work Handover Colleague <span className="text-[var(--text-muted)] font-normal">(Optional)</span>
              </label>
              <select
                value={leaveHandover}
                onChange={(e) => setLeaveHandover(e.target.value)}
                className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  px-4 py-3 text-sm font-medium text-[var(--text-primary)] dark:text-white outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
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
              <label className="block text-xs font-semibold text-[var(--text-secondary)] dark:text-slate-300 mb-2">
                Reason & Handover Notes <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Provide a feasible reason or deliverables handover notes..."
                rows={3}
                className="w-full rounded-xl border border-[var(--border-color)]  bg-[var(--bg-surface)]  p-3.5 text-sm text-[var(--text-primary)] dark:text-white placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all resize-none shadow-2xs"
                required
              />
            </div>

            {(computedLeaveDays > (Number(state.customOptions?.leaveSettings?.maxConsecutiveDaysWithoutDoc) || 3)) && (
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-2">
                  Supporting document <span className="text-rose-500">*</span>
                </label>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) {
                      setLeaveAttachment('');
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setLeaveAttachment(typeof reader.result === 'string' ? reader.result : '');
                    reader.readAsDataURL(file);
                  }}
                  className="w-full text-xs text-[var(--text-secondary)]"
                />
              </div>
            )}

          </div>

          {/* Drawer Form Footer */}
          <div className="p-4 sm:p-6 sm:px-8 border-t border-[var(--border-color)]  bg-[var(--bg-surface)]  flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[var(--border-color)] ">
            <span className="text-xs text-[var(--text-muted)] dark:text-[#9e9ea7]">
              {modalIsProbation
                ? `Logs ${computedLeaveDays} day(s) as Loss of Pay (Probation)`
                : `Deducts ${computedLeaveDays} day(s) from ${leaveType}`}
            </span>
            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => setShowApplyLeaveModal(false)}
                className="px-5 py-2.5 sm:py-3 rounded-xl border border-[var(--border-color)]  text-[var(--text-secondary)] dark:text-slate-300 text-xs sm:text-sm font-semibold hover:bg-[var(--bg-surface-subtle)] dark:hover:bg-[#18181d] cursor-pointer transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 sm:py-3 rounded-xl bg-[var(--studio-navy)] hover:bg-[var(--studio-navy-hover)] text-white text-xs sm:text-sm font-semibold cursor-pointer shadow-md shadow-blue-600/20 transition-all active:scale-[0.99]"
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
          <div className="bg-[var(--bg-surface)]  rounded-xl border border-[var(--border-color)]  max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-500">
              <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--text-primary)] dark:text-white">
                  Probation Policy: Paid Leave Restricted
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  {probationBlockModal.leave.employeeName} is currently in probation
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] dark:text-slate-300 leading-relaxed bg-amber-50/60 dark:bg-amber-500/5 p-3 rounded-xl border border-amber-200/80">
              In accordance with company probation policy, employees in probation are not eligible for paid leaves (
              <span className="font-bold">{probationBlockModal.leave.leaveType}</span>). Paid leaves cannot be approved.
              You can approve this request as <span className="font-bold text-[var(--text-primary)] dark:text-white">Loss of Pay (Unpaid Leave)</span> or reject it.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProbationBlockModal(null)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] dark:text-[var(--text-muted)] hover:bg-[var(--bg-surface-subtle)] dark:hover:bg-[#282830] cursor-pointer"
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
      {canAccessReports && (
      <AttendanceReportsModal
        isOpen={showReportsModal}
        onClose={() => setShowReportsModal(false)}
        state={state}
        initialReportType={reportsModalInitialType}
      />
      )}
    </>
  );
};
