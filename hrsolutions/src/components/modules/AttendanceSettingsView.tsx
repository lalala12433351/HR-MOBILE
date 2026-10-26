'use client';
import { ResponsiveTable } from '@/components/common/ResponsiveTable';
import { DateInput } from '@/components/common/DateInput';

import { SettingsPageHeader, SettingsButton, SettingsCard, SettingsDayPicker, SettingsField, SettingsSwitchRow } from './settings/SettingsPrimitives';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_GEO_COORDINATES } from '@/config/constants';
import { isInstitutionMode } from '@/utils/organizationMode';
import { SettingsToggle } from './settings/SettingsToggle';
import { SettingsToast } from './settings/SettingsToast';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AppState } from '../../services/store';
import { Holiday, WorkShift } from '../../types';
import { HolidayCalendarView } from './attendance/HolidayCalendarView';
import { api } from '../../services/apiClient';
import { repeatOnDay as repeatOnDayNumber, rotateRosterSchedule } from '@/utils/attendanceRules';
import { AddOfficeModal, OfficeModalData } from '../common/AddOfficeModal';
import {
  ATT_BTN_PRIMARY,
  ATT_CARD,
  ATT_SECTION_SUB,
  ATT_SECTION_TITLE,
  ATT_TABLE_SHELL,
} from './attendance/attendanceUi';

type AttendancePane = 'general' | 'students' | 'policy' | 'office_location' | 'leaves' | 'holidays';

interface AttendanceSettingsViewProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  pane?: string;
  paneLabel?: string;
  onPaneChange?: (pane: string) => void;
}

interface OfficePolicyConfig {
  id: string;
  name: string;
  clockingDevices: string;
  qrCodeEnabled: boolean;
  geofencingStatus: 'Active' | 'Inactive';
  address: string;
  radiusText: string;
  radiusMeters: number;
  policyDescription: string;
  allowOutsideOffice: boolean;
}

// Days of Week definition
const WEEK_DAYS = [
  { key: 'Monday', short: 'Mon', full: 'Monday' },
  { key: 'Tuesday', short: 'Tue', full: 'Tuesday' },
  { key: 'Wednesday', short: 'Wed', full: 'Wednesday' },
  { key: 'Thursday', short: 'Thu', full: 'Thursday' },
  { key: 'Friday', short: 'Fri', full: 'Friday' },
  { key: 'Saturday', short: 'Sat', full: 'Saturday' },
  { key: 'Sunday', short: 'Sun', full: 'Sunday' },
];

const ToggleSwitch = SettingsToggle;

// Helper: Convert "09:30 AM" to "09:30"
const to24HourTime = (time12h?: string): string => {
  if (!time12h) return '09:30';
  const clean = time12h.replace(/\s*\(GMT[^\)]*\)/gi, '').trim();
  const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return '09:30';
  let h = parseInt(match[1], 10);
  const m = match[2];
  const meridian = (match[3] || 'AM').toUpperCase();
  if (meridian === 'PM' && h < 12) h += 12;
  if (meridian === 'AM' && h === 12) h = 0;
  return `${h.toString().padStart(2, '0')}:${m}`;
};

// Helper: Convert "09:30" to "09:30 AM"
const to12HourTime = (time24h: string): string => {
  if (!time24h) return '09:30 AM';
  const [hStr, mStr] = time24h.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const meridian = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h.toString().padStart(2, '0')}:${m} ${meridian}`;
};

const blockDecimalPointKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === '.' || e.key === ',' || e.key === 'e' || e.key === 'E' || e.key === '+' || e.key === '-') {
    e.preventDefault();
  }
};

const toWholeDays = (raw: string, max: number): number | null => {
  if (raw.trim() === '') return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(0, n));
};

export const AttendanceSettingsView: React.FC<AttendanceSettingsViewProps> = ({
  state,
  onUpdateState,
  pane,
  paneLabel,
  onPaneChange,
}) => {
  const options = state.customOptions;
  const initialAtt = options.attendanceSettings;
  const initialPolicies = options.attendancePolicies;
  const initialLeaves = options.leaveSettings;
  const searchParams = useSearchParams();

  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);

  const [subTabState, setSubTabState] = useState<AttendancePane>('general');
  const subTab: AttendancePane = (pane as AttendancePane) || subTabState;
  const setSubTab = (next: AttendancePane) => {
    if (onPaneChange) onPaneChange(next);
    else setSubTabState(next);
  };

  useEffect(() => {
    if (pane) return;
    const tab = searchParams.get('tab');
    if (
      tab === 'general' ||
      tab === 'students' ||
      tab === 'policy' ||
      tab === 'office_location' ||
      tab === 'leaves' ||
      tab === 'holidays'
    ) {
      setSubTabState(tab);
    }
  }, [searchParams, pane]);

  useEffect(() => {
    if (!isInstitution && subTab === 'students') {
      setSubTab('general');
    }
  }, [isInstitution, subTab]);

  const holidaySaveChainRef = useRef<Promise<void>>(Promise.resolve());
  const latestHolidayPayloadRef = useRef<Holiday[] | null>(null);

  const persistHolidays = useCallback((holidays: Holiday[]) => {
    onUpdateState((prev) => ({
      ...prev,
      customOptions: { ...prev.customOptions, holidays },
    }));
    latestHolidayPayloadRef.current = holidays;
    const run = holidaySaveChainRef.current.catch(() => undefined).then(() => {
      const payload = latestHolidayPayloadRef.current;
      if (!payload) return;
      latestHolidayPayloadRef.current = null;
      return api.attendance.saveHolidays({
        holidays: payload.map((h) => ({
          id: h.id,
          name: h.name,
          date: h.date,
          year: Number(h.year) || Number(String(h.date || '').slice(0, 4)),
          dayOfWeek: h.dayOfWeek || '',
          isApproved: h.isApproved !== false,
        })),
      }).then(() => undefined);
    });
    holidaySaveChainRef.current = run;
    return run;
  }, [onUpdateState]);

  useEffect(() => {
    if (subTab !== 'holidays') return;
    let cancelled = false;
    api.attendance.getHolidays().then((res) => {
      if (cancelled || !Array.isArray(res.data)) return;
      const holidays: Holiday[] = res.data.map((h: any) => ({
        id: h.id,
        name: h.name,
        date: String(h.date || '').slice(0, 10),
        year: Number(h.year) || Number(String(h.date || '').slice(0, 4)),
        dayOfWeek: h.dayOfWeek || h.day_of_week || '',
        isApproved: h.isApproved !== false && h.is_approved !== false,
      }));
      onUpdateState((prev) => ({
        ...prev,
        customOptions: { ...prev.customOptions, holidays },
      }));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [subTab, onUpdateState]);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [leaveQuotaPeriod, setLeaveQuotaPeriod] = useState<'annual' | 'monthly'>(
    initialLeaves?.accrualFrequency === 'monthly' ? 'monthly' : 'annual'
  );

  // Academic & Student Policy Settings
  const initialAcademic = options?.academicSettings;
  const [studentMinAttendanceThreshold, setStudentMinAttendanceThreshold] = useState<number>(
    initialAcademic?.minimumAttendanceThreshold ?? 75
  );
  const [enableLowAttendanceWarning, setEnableLowAttendanceWarning] = useState<boolean>(
    initialAcademic?.enableLowAttendanceWarning ?? true
  );
  const [autoAlertGuardiansBelowThreshold, setAutoAlertGuardiansBelowThreshold] = useState<boolean>(
    initialAcademic?.autoAlertGuardiansBelowThreshold ?? true
  );
  const [consecutiveAbsenceAlertDays, setConsecutiveAbsenceAlertDays] = useState<number>(
    initialAcademic?.consecutiveAbsenceAlertDays ?? 3
  );
  const [studentWarningMessage, setStudentWarningMessage] = useState<string>(
    initialAcademic?.warningMessage ??
      'Notice: Student attendance has fallen below the mandatory 75% institutional requirement. Please ensure regular attendance or contact academic counseling.'
  );

  // Computed Student Defaulters
  const studentDefaulters = useMemo(() => {
    const studentList = Array.isArray(state.students) ? state.students : [];
    const attList = Array.isArray(state.attendance) ? state.attendance : [];

    return studentList.map((stud) => {
      const logs = attList.filter(
        (a) =>
          a.employeeId === stud.id ||
          a.employeeId === stud.studentId ||
          (a.employeeName && a.employeeName.toLowerCase() === stud.name.toLowerCase())
      );
      const total = logs.length;
      const attended = logs.filter((l) => l.status === 'Present' || l.status === 'Late').length;
      const rate = total > 0 ? Math.round((attended / total) * 100) : 0;
      const absentCount = logs.filter((l) => l.status === 'Absent' || l.status === 'On Leave').length;
      const schoolDays = logs
        .map((log) => ({ date: String(log.date || '').slice(0, 10), status: log.status }))
        .filter((log) => /^\d{4}-\d{2}-\d{2}$/.test(log.date))
        .sort((a, b) => a.date.localeCompare(b.date));
      let consecutiveAbsences = 0;
      for (let index = schoolDays.length - 1; index >= 0; index -= 1) {
        const day = new Date(`${schoolDays[index].date}T00:00:00`).getDay();
        if (day === 0 || day === 6) continue;
        if (schoolDays[index].status === 'Absent') consecutiveAbsences += 1;
        else break;
      }
      const lowAttendance = total > 0 && rate < studentMinAttendanceThreshold;
      const longAbsence = consecutiveAbsences >= consecutiveAbsenceAlertDays;
      return {
        student: stud,
        totalDays: total,
        attendedDays: attended,
        absentDays: absentCount,
        rate,
        consecutiveAbsences,
        isDefaulter: lowAttendance || longAbsence,
        lowAttendance,
        longAbsence,
      };
    });
  }, [state.students, state.attendance, studentMinAttendanceThreshold, consecutiveAbsenceAlertDays]);

  const activeDefaulters = useMemo(() => studentDefaulters.filter((d) => d.isDefaulter), [studentDefaulters]);

  const sendGuardianAlerts = async (
    rows: { student: { id?: string; studentId?: string; name: string } }[],
    reason: string
  ) => {
    const studentIds = rows.map((row) => row.student.id || row.student.studentId).filter(Boolean) as string[];
    if (studentIds.length === 0) {
      showToast('No students to alert.');
      return;
    }
    const message = studentWarningMessage
      .replace('{student_name}', rows.length === 1 ? rows[0].student.name : 'your child')
      .replace('{attendance_pct}', reason)
      .replace('{threshold}', String(studentMinAttendanceThreshold));
    const result = await api.institute.alertGuardians({
      studentIds,
      subject: 'Attendance notice',
      message,
    });
    if (!result.success) {
      showToast(result.error?.message || 'Could not send the attendance notice.');
      return;
    }
    const emailed = result.data?.emailed || [];
    const hrNotices = result.data?.hrNotices || [];
    if (hrNotices.length > 0) {
      onUpdateState((prev) => ({
        ...prev,
        notifications: [
          ...hrNotices.map((notice: { id: string; name: string; guardianName: string }) => ({
            id: `notif_hr_${notice.id}_${Date.now()}`,
            title: `HR notice: ${notice.name}`,
            message: `${notice.guardianName} has no email on file. This attendance notice was left for HR instead of a text.`,
            timestamp: 'Just now',
            category: 'Attendance' as const,
            priority: 'high' as const,
            read: false,
            linkModule: 'students',
          })),
          ...prev.notifications,
        ],
      }));
    }
    const emailedCount = emailed.length;
    const noticeCount = hrNotices.length;
    showToast(
      emailedCount > 0
        ? `Emailed ${emailedCount} guardian${emailedCount === 1 ? '' : 's'}${noticeCount ? ` and left ${noticeCount} notice${noticeCount === 1 ? '' : 's'} for HR` : ''}.`
        : `Left ${noticeCount} notice${noticeCount === 1 ? '' : 's'} for HR. No guardian email is on file.`
    );
  };

  const handleAlertGuardian = (studentId: string) => {
    const row = activeDefaulters.find((item) => (item.student.id || item.student.studentId) === studentId) ||
      studentDefaulters.find((item) => (item.student.id || item.student.studentId) === studentId);
    if (!row) return;
    const reason = row.longAbsence
      ? `${row.consecutiveAbsences} school days absent`
      : `${row.rate}%`;
    void sendGuardianAlerts([row], reason);
  };

  const handleAlertAllDefaulters = () => {
    if (activeDefaulters.length === 0) {
      showToast('No students currently need a guardian notice.');
      return;
    }
    void sendGuardianAlerts(activeDefaulters, `${studentMinAttendanceThreshold}%`);
  };

  useEffect(() => {
    if (!autoAlertGuardiansBelowThreshold || !enableLowAttendanceWarning) return;
    if (typeof window === 'undefined' || activeDefaulters.length === 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const due = activeDefaulters.filter((row) => {
      const id = row.student.id || row.student.studentId;
      if (!id) return false;
      return !window.sessionStorage.getItem(`guardian-alert:${id}:${today}`);
    });
    if (due.length === 0) return;
    due.forEach((row) => {
      const id = row.student.id || row.student.studentId;
      if (id) window.sessionStorage.setItem(`guardian-alert:${id}:${today}`, '1');
    });
    void sendGuardianAlerts(due, `${studentMinAttendanceThreshold}%`);
  }, [autoAlertGuardiansBelowThreshold, enableLowAttendanceWarning, activeDefaulters, studentMinAttendanceThreshold]);

  // General Form States
  const [hoursCalcMethod, setHoursCalcMethod] = useState(
    initialAtt?.hoursCalculationMethod || 'every_punch'
  );
  const [startDate, setStartDate] = useState(() => initialAtt?.startDate || new Date().toISOString().substring(0, 10));
  const [approvalCycle, setApprovalCycle] = useState<'Monthly' | 'Bi-Weekly' | 'Weekly'>(
    initialAtt?.approvalCycle || 'Monthly'
  );
  const [locationScope, setLocationScope] = useState(
    initialAtt?.locationScope || 'All Offices'
  );

  // Interactive Editable Working Days
  const [selectedDays, setSelectedDays] = useState<string[]>(() => {
    if (state.organization?.workingDays && state.organization.workingDays.length > 0) {
      return state.organization.workingDays;
    }
    if (initialAtt?.workingDays && initialAtt.workingDays.length > 0) {
      return initialAtt.workingDays;
    }
    if (initialAtt?.includeSaturdayInWorkHours) {
      return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    }
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  });

  // Alternate Saturdays Policy State
  const [enableAlternateSaturdays, setEnableAlternateSaturdays] = useState<boolean>(
    initialAtt?.enableAlternateSaturdays ?? initialAtt?.enableAlternateSundays ?? false
  );
  const [alternateSaturdaysPolicy, setAlternateSaturdaysPolicy] = useState<'2nd_4th_off' | '1st_3rd_off' | 'alternate'>(
    (initialAtt?.alternateSaturdaysPolicy as any) || (initialAtt?.alternateSundaysPolicy as any) || '2nd_4th_off'
  );

  // Roster / Rotational Shifts Management (Optional in Settings)
  const [enableRosterShifts, setEnableRosterShifts] = useState<boolean>(
    initialAtt?.enableRosterShifts ?? false
  );
  const [rosterRotationCycle, setRosterRotationCycle] = useState<'weekly' | 'biweekly' | 'monthly' | 'custom'>(
    (initialAtt?.rosterRotationCycle as any) || 'weekly'
  );

  // Working Hourly Policy: automatically affects shift and tracks hours worked
  const [enableHourlyShiftPolicy, setEnableHourlyShiftPolicy] = useState<boolean>(
    initialAtt?.enableHourlyShiftPolicy ?? true
  );

  // Corporate Shifts Management
  const [shifts, setShifts] = useState<WorkShift[]>(() => {
    if (options?.shifts && options.shifts.length > 0) {
      // Ensure hourly shift preset is present
      const hasHourly = options.shifts.some((s) => s.isHourlyShift || s.id === 'sh-hourly');
      if (!hasHourly) {
        return [
          ...options.shifts,
          { id: 'sh-hourly', name: 'Hourly / Flexible Shift', startTime: 'Flexible', endTime: 'Flexible', gracePeriodMinutes: 0, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], rosterCode: 'HRLY', isHourlyShift: true, hourlyTrackingThresholdHours: 8 },
        ];
      }
      return options.shifts;
    }
    return [
      { id: 'sh-1', name: 'General Day Shift', startTime: '09:00 AM', endTime: '06:00 PM', gracePeriodMinutes: 15, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], rosterCode: 'GEN' },
      { id: 'sh-hourly', name: 'Hourly / Flexible Shift', startTime: 'Flexible', endTime: 'Flexible', gracePeriodMinutes: 0, workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], rosterCode: 'HRLY', isHourlyShift: true, hourlyTrackingThresholdHours: 8 },
    ];
  });
  const [selectedShiftId, setSelectedShiftId] = useState<string>(() => shifts[0]?.id || 'sh-1');

  // Weekly Roster Matrix Mapping: empId -> { Mon, Tue, Wed, Thu, Fri, Sat, Sun }
  const [employeeRosterMatrix, setEmployeeRosterMatrix] = useState<Record<string, Record<string, string>>>(() => {
    const persisted = options?.employeeRosterMatrix || {};
    const map: Record<string, Record<string, string>> = { ...persisted };
    const sampleShifts = ['sh-1', 'sh-hourly'];
    (state.employees || []).forEach((emp, idx) => {
      if (map[emp.id]) return;
      if (emp.rosterSchedule) {
        map[emp.id] = emp.rosterSchedule;
      } else {
        const assigned = sampleShifts[idx % sampleShifts.length] || 'sh-1';
        map[emp.id] = {
          Mon: assigned,
          Tue: assigned,
          Wed: assigned,
          Thu: assigned,
          Fri: assigned,
          Sat: idx % 2 === 0 ? 'OFF' : assigned,
          Sun: 'OFF',
        };
      }
    });
    return map;
  });

  const handleUpdateRosterCell = (empId: string, dayKey: string, shiftId: string) => {
    setEmployeeRosterMatrix((prev) => ({
      ...prev,
      [empId]: {
        ...(prev[empId] || {}),
        [dayKey]: shiftId,
      },
    }));
  };

  const handleAutoRotateRoster = () => {
    const shiftIds = shifts.map((s) => s.id);
    if (shiftIds.length === 0) return;

    setEmployeeRosterMatrix((prev) => {
      const next: Record<string, Record<string, string>> = {};
      Object.entries(prev).forEach(([empId, schedule]) => {
        next[empId] = rotateRosterSchedule(schedule, shiftIds);
      });
      return next;
    });
    showToast('Weekly roster shifts automatically rotated to next cycle');
  };

  const [academicBatches, setAcademicBatches] = useState<{
    id: string;
    grade: string;
    section: string;
    startTime: string;
    endTime: string;
    graceMinutes?: number;
    workingDays?: string[];
  }[]>(() => {
    return options?.academicBatches || [];
  });
  const [selectedBatchId, setSelectedBatchId] = useState<string>(() => (options?.academicBatches && options.academicBatches[0]?.id) || '');

  // Active Timing & Grace Thresholds
  const [workStartTime, setWorkStartTime] = useState(
    initialAtt?.workDayStartTime || initialPolicies?.workDayStartTime || (isInstitution ? '08:30 AM' : '09:00 AM')
  );
  const [workEndTime, setWorkEndTime] = useState(
    initialAtt?.workDayEndTime || initialPolicies?.workDayEndTime || (isInstitution ? '03:30 PM' : '06:00 PM')
  );
  const [gracePeriod, setGracePeriod] = useState(
    initialAtt?.gracePeriodMinutes ?? initialPolicies?.lateThresholdMinutes ?? 15
  );
  const [halfDayHours, setHalfDayHours] = useState(
    initialAtt?.halfDayThresholdHours || 4.5
  );
  const [fullDayHours, setFullDayHours] = useState(
    initialAtt?.fullDayMinimumHours || 8.0
  );

  // Modals for creating new shift / batch
  const [showAddShiftModal, setShowAddShiftModal] = useState(false);
  const [newShiftName, setNewShiftName] = useState('');
  const [newShiftStart, setNewShiftStart] = useState('09:00 AM');
  const [newShiftEnd, setNewShiftEnd] = useState('06:00 PM');
  const [newShiftGrace, setNewShiftGrace] = useState(15);
  const [newShiftDays, setNewShiftDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

  const [showAddBatchModal, setShowAddBatchModal] = useState(false);
  const [newBatchGrade, setNewBatchGrade] = useState('');
  const [newBatchSection, setNewBatchSection] = useState('');
  const [newBatchStart, setNewBatchStart] = useState('08:30');
  const [newBatchEnd, setNewBatchEnd] = useState('15:30');
  const [newBatchGrace, setNewBatchGrace] = useState(15);
  const [newBatchDays, setNewBatchDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

  // Helper to calculate daily shift hours between workStartTime and workEndTime
  const calculateShiftHours = (start12: string, end12: string): number => {
    const s24 = to24HourTime(start12);
    const e24 = to24HourTime(end12);
    const [sH, sM] = s24.split(':').map(Number);
    const [eH, eM] = e24.split(':').map(Number);
    let diff = (eH * 60 + eM) - (sH * 60 + sM);
    if (diff < 0) diff += 24 * 60;
    return Math.max(1, Math.round((diff / 60) * 10) / 10);
  };

  // Employee Shift Assignments mapping: empId -> shiftId (prefer persisted attendance blob)
  const [employeeShifts, setEmployeeShifts] = useState<Record<string, string>>(() => {
    const persisted = options?.employeeShiftAssignments || {};
    const map: Record<string, string> = { ...persisted };
    (state.employees || []).forEach((emp) => {
      if (map[emp.id]) return;
      if (emp.shiftTiming?.shiftId) {
        map[emp.id] = emp.shiftTiming.shiftId;
      } else if (emp.shiftId) {
        map[emp.id] = emp.shiftId;
      } else {
        map[emp.id] = shifts[0]?.id || 'sh-1';
      }
    });
    return map;
  });

  const [shiftRosterSearch, setShiftRosterSearch] = useState('');
  const [shiftRosterDeptFilter, setShiftRosterDeptFilter] = useState('All');

  const handleAssignEmployeeShift = (empId: string, shiftId: string) => {
    setEmployeeShifts((prev) => ({ ...prev, [empId]: shiftId }));
  };

  const handleAssignDepartmentToCurrentShift = (deptName: string) => {
    setEmployeeShifts((prev) => {
      const next = { ...prev };
      (state.employees || []).forEach((emp) => {
        if (deptName === 'All' || emp.department === deptName) {
          next[emp.id] = selectedShiftId;
        }
      });
      return next;
    });
    showToast(`Assigned all ${deptName === 'All' ? 'employees' : deptName + ' members'} to "${shifts.find((s) => s.id === selectedShiftId)?.name || 'this shift'}"`);
  };

  const currentDailyShiftHours = calculateShiftHours(workStartTime, workEndTime);
  const currentWeeklyWorkHours = Math.round(currentDailyShiftHours * selectedDays.length * 10) / 10;

  // Maximum Geofence Distance Upper Bound (1.0 km)
  const MAX_GEOFENCE_LIMIT = 1000;
  const MIN_GEOFENCE_LIMIT = 20;

  // Attendance Cycle Settings (Monthly vs Yearly)
  const [attendanceCycle, setAttendanceCycle] = useState<'monthly' | 'yearly'>(
    initialAtt?.attendanceCycle || 'monthly'
  );

  // Policy Settings
  const [geofenceRadius, setGeofenceRadius] = useState<number>(() =>
    Math.min(
      MAX_GEOFENCE_LIMIT,
      Math.max(
        MIN_GEOFENCE_LIMIT,
        initialAtt?.geofenceRadiusMeters || initialPolicies?.geofenceRadiusMeters || 150
      )
    )
  );
  const [requireSelfieCheckIn, setRequireSelfieCheckIn] = useState(
    initialAtt?.requireSelfieCheckIn ?? true
  );
  const [requireSelfieCheckOut, setRequireSelfieCheckOut] = useState(
    initialAtt?.requireSelfieCheckOut ?? true
  );
  const [requireGPS, setRequireGPS] = useState(
    initialAtt?.requireLocationGPS ?? true
  );
  const [allowedIps, setAllowedIps] = useState(
    initialAtt?.allowedIpAddresses && initialAtt.allowedIpAddresses !== '192.168.1.0/24, 106.51.72.18'
      ? initialAtt.allowedIpAddresses
      : ''
  );
  const [outOfRadiusAction, setOutOfRadiusAction] = useState<'Block' | 'Allow' | 'Warn'>(
    initialAtt?.outOfRadiusAction === 'Allow' || initialAtt?.outOfRadiusAction === 'Warn'
      ? initialAtt.outOfRadiusAction
      : 'Block'
  );
  const [allowQrCodeAttendance, setAllowQrCodeAttendance] = useState(
    initialAtt?.allowQrCodeAttendance === true
  );
  const [qrRefreshIntervalSeconds, setQrRefreshIntervalSeconds] = useState(
    Number(initialAtt?.qrRefreshIntervalSeconds) || 30
  );
  const [regularizationDaysWindow, setRegularizationDaysWindow] = useState(
    Math.min(90, Math.max(1, Number(initialAtt?.regularizationWindowDays) || 11))
  );
  const [requireManagerRegularizationApproval, setRequireManagerRegularizationApproval] = useState(
    initialAtt?.requireManagerRegularizationApproval !== false
  );
  const [repeatOnDay, setRepeatOnDay] = useState(repeatOnDayNumber(initialAtt?.repeatOn));

  // Leave Settings
  const [paidLeaveQuota, setPaidLeaveQuota] = useState(initialLeaves?.paidLeaveQuota || 18);
  const [casualLeaveQuota, setCasualLeaveQuota] = useState(initialLeaves?.casualLeaveQuota || 12);
  const [sickLeaveQuota, setSickLeaveQuota] = useState(initialLeaves?.sickLeaveQuota || 10);
  const [maternityLeaveQuota, setMaternityLeaveQuota] = useState(initialLeaves?.maternityLeaveQuota || 90);
  const [paternityLeaveQuota, setPaternityLeaveQuota] = useState(initialLeaves?.paternityLeaveQuota || 15);
  const [enableCompOff, setEnableCompOff] = useState(initialLeaves?.enableCompOff ?? true);
  const [maxConsecutiveWithoutDoc, setMaxConsecutiveWithoutDoc] = useState(initialLeaves?.maxConsecutiveDaysWithoutDoc || 3);
  const [maxCarryForward, setMaxCarryForward] = useState(initialLeaves?.maxCarryForwardDays || 10);
  const [leavePoliciesEnabled, setLeavePoliciesEnabled] = useState(initialLeaves?.leavePoliciesEnabled ?? true);
  const [enableMonthlyRollover, setEnableMonthlyRollover] = useState(initialLeaves?.enableMonthlyRollover ?? true);
  const [enableCarryOver, setEnableCarryOver] = useState(initialLeaves?.enableCarryOver ?? true);
  const [allowNegativeBalance, setAllowNegativeBalance] = useState(initialLeaves?.allowNegativeBalance ?? false);
  const [restrictDuringNotice, setRestrictDuringNotice] = useState(initialLeaves?.restrictDuringNoticePeriod ?? true);
  const [leaveApprovalWorkflow, setLeaveApprovalWorkflow] = useState<'manager_then_hr' | 'manager_only' | 'hr_only'>(
    initialLeaves?.approvalWorkflow || 'manager_then_hr'
  );

  // Probation Period Settings
  const initialProbation = options.probationSettings;
  const [enableProbation, setEnableProbation] = useState(initialProbation?.enabled ?? true);
  const [probationDurationMonths, setProbationDurationMonths] = useState(initialProbation?.defaultDurationMonths || 3);
  const [restrictLeaveDuringProbation, setRestrictLeaveDuringProbation] = useState(initialProbation?.restrictLeaveDuringProbation ?? true);
  const [autoConfirmProbation, setAutoConfirmProbation] = useState(initialProbation?.autoConfirmAfterPeriod ?? true);

  // Role-Based Leave Quotas
  const defaultRoleQuotas: Record<string, { casualLeave: number; sickLeave: number; earnedLeave: number }> = {
    admin: { casualLeave: 14, sickLeave: 12, earnedLeave: 18 },
    hr_manager: { casualLeave: 14, sickLeave: 12, earnedLeave: 18 },
    manager: { casualLeave: 12, sickLeave: 12, earnedLeave: 15 },
    team_lead: { casualLeave: 12, sickLeave: 12, earnedLeave: 15 },
    employee: { casualLeave: 12, sickLeave: 10, earnedLeave: 15 },
    contractor: { casualLeave: 0, sickLeave: 0, earnedLeave: 0 },
    intern: { casualLeave: 6, sickLeave: 6, earnedLeave: 0 },
  };

  const [roleLeaveQuotas, setRoleLeaveQuotas] = useState<Record<string, { casualLeave: number; sickLeave: number; earnedLeave: number }>>(() => {
    return initialLeaves?.roleLeaveQuotas || defaultRoleQuotas;
  });

  const handleUpdateRoleLeaveQuota = (roleKey: string, field: 'casualLeave' | 'sickLeave' | 'earnedLeave', value: number) => {
    setRoleLeaveQuotas((prev) => ({
      ...prev,
      [roleKey]: {
        ...(prev[roleKey] || { casualLeave: 12, sickLeave: 10, earnedLeave: 15 }),
        [field]: Math.max(0, value),
      },
    }));
  };

  // Office Location Policies
  const [offices, setOffices] = useState<OfficePolicyConfig[]>(() => {
    const policies = (initialAtt as any)?.officeGeofencePolicies as
      | Array<{
          id?: string;
          name: string;
          geofencingStatus?: 'Active' | 'Inactive';
          radiusMeters?: number;
          address?: string;
        }>
      | undefined;
    if (Array.isArray(policies) && policies.length > 0) {
      return policies
        .filter((p) => p?.name)
        .map((p, idx) => ({
          id: p.id || `off_${idx + 1}`,
          name: p.name,
          clockingDevices: (p as any).clockingDevices || 'Desktop, Mobile',
          qrCodeEnabled: (p as any).qrCodeEnabled !== false,
          geofencingStatus: p.geofencingStatus === 'Inactive' ? 'Inactive' : 'Active',
          address: p.address || `${p.name} Office Address`,
          radiusText: `${p.radiusMeters || 250} meters`,
          radiusMeters: p.radiusMeters || 250,
          policyDescription:
            p.geofencingStatus === 'Inactive'
              ? 'GPS optional — geofencing inactive'
              : 'Not allow clock in/out outside the office',
          allowOutsideOffice: p.geofencingStatus === 'Inactive',
        }));
    }
    const customOffices = options?.offices || [];
    if (customOffices.length === 0) return [];
    return customOffices.map((name, idx) => ({
      id: `off_${idx + 1}`,
      name,
      clockingDevices: 'Desktop, Mobile',
      qrCodeEnabled: true,
      geofencingStatus: 'Active' as const,
      address: `${name} Office Address`,
      radiusText: '250 meters',
      radiusMeters: 250,
      policyDescription: 'Not allow clock in/out outside the office',
      allowOutsideOffice: false,
    }));
  });

  // Edit / Add Office Modal states
  const [editingOffice, setEditingOffice] = useState<OfficeModalData | null>(null);
  const [showAddOffice, setShowAddOffice] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Day Toggle Handler
  const toggleDay = (dayKey: string) => {
    if (selectedDays.includes(dayKey)) {
      if (selectedDays.length <= 1) {
        showToast('At least 1 working day must remain selected');
        return;
      }
      const updated = selectedDays.filter((d) => d !== dayKey);
      setSelectedDays(updated);
      if (isInstitution) {
        setAcademicBatches((prev) =>
          prev.map((b) => (b.id === selectedBatchId ? { ...b, workingDays: updated } : b))
        );
      } else {
        setShifts((prev) =>
          prev.map((s) => (s.id === selectedShiftId ? { ...s, workingDays: updated } : s))
        );
      }
    } else {
      const updated = WEEK_DAYS.filter((d) => selectedDays.includes(d.key) || d.key === dayKey).map(
        (d) => d.key
      );
      setSelectedDays(updated);
      if (isInstitution) {
        setAcademicBatches((prev) =>
          prev.map((b) => (b.id === selectedBatchId ? { ...b, workingDays: updated } : b))
        );
      } else {
        setShifts((prev) =>
          prev.map((s) => (s.id === selectedShiftId ? { ...s, workingDays: updated } : s))
        );
      }
    }
  };

  // Shift selection handler
  const handleSelectShift = (shiftId: string) => {
    setSelectedShiftId(shiftId);
    const found = shifts.find((s) => s.id === shiftId);
    if (found) {
      setWorkStartTime(found.startTime || '09:00 AM');
      setWorkEndTime(found.endTime || '06:00 PM');
      if (found.gracePeriodMinutes !== undefined) setGracePeriod(found.gracePeriodMinutes);
      if (found.workingDays && found.workingDays.length > 0) {
        setSelectedDays(found.workingDays);
      }
    }
  };

  // Batch selection handler
  const handleSelectBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    const found = academicBatches.find((b) => b.id === batchId);
    if (found) {
      setWorkStartTime(to12HourTime(found.startTime || '08:30'));
      setWorkEndTime(to12HourTime(found.endTime || '15:30'));
      if (found.graceMinutes !== undefined) setGracePeriod(found.graceMinutes);
      if (found.workingDays && found.workingDays.length > 0) {
        setSelectedDays(found.workingDays);
      }
    }
  };

  // Add new shift
  const handleCreateShift = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShiftName.trim()) return;

    const newS: WorkShift = {
      id: `sh_${Date.now()}`,
      name: newShiftName.trim(),
      startTime: newShiftStart || '09:00 AM',
      endTime: newShiftEnd || '06:00 PM',
      gracePeriodMinutes: Number.isFinite(Number(newShiftGrace)) ? Number(newShiftGrace) : 15,
      workingDays: newShiftDays,
    };

    setShifts([...shifts, newS]);
    setSelectedShiftId(newS.id);
    setWorkStartTime(newS.startTime);
    setWorkEndTime(newS.endTime);
    setGracePeriod(newS.gracePeriodMinutes ?? 15);
    setSelectedDays(newShiftDays);
    setShowAddShiftModal(false);
    setNewShiftName('');
    showToast(`Created shift "${newS.name}"`);
  };

  // Delete shift
  const handleDeleteShift = (shiftId: string) => {
    if (shifts.length <= 1) {
      showToast('You must keep at least 1 work shift configured');
      return;
    }
    const updated = shifts.filter((s) => s.id !== shiftId);
    setShifts(updated);
    if (selectedShiftId === shiftId && updated.length > 0) {
      const nextShift = updated[0];
      setSelectedShiftId(nextShift.id);
      setWorkStartTime(nextShift.startTime || '09:00 AM');
      setWorkEndTime(nextShift.endTime || '06:00 PM');
      if (nextShift.workingDays) setSelectedDays(nextShift.workingDays);
    }
    showToast('Shift removed');
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchGrade.trim()) return;

    setIsSaving(true);
    try {
      const newB = {
        id: `b_${Date.now()}`,
        grade: newBatchGrade.trim(),
        section: newBatchSection.trim(),
        startTime: newBatchStart || '08:30',
        endTime: newBatchEnd || '15:30',
        graceMinutes: Number.isFinite(Number(newBatchGrace)) ? Number(newBatchGrace) : 15,
        workingDays: newBatchDays,
      };

      const res = await api.institute.createBatch(newB);
      if (!res.success) {
        throw new Error(res.error?.message || 'Could not create batch. Please verify inputs.');
      }

      const savedBatch = res.data || newB;
      const nextBatches = [...academicBatches, savedBatch];

      await api.setup.saveAttendanceSettings({ academicBatches: nextBatches });

      setAcademicBatches(nextBatches);
      setSelectedBatchId(savedBatch.id);
      setWorkStartTime(to12HourTime(savedBatch.startTime || newB.startTime));
      setWorkEndTime(to12HourTime(savedBatch.endTime || newB.endTime));
      setGracePeriod(savedBatch.graceMinutes ?? 15);
      setSelectedDays(newBatchDays);
      setShowAddBatchModal(false);
      setNewBatchGrade('');
      setNewBatchSection('');
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          academicBatches: nextBatches,
        },
      }));

      showToast(`Added batch "${savedBatch.grade} - ${savedBatch.section}"`);
    } catch (e) {
      console.error('Failed to create batch', e);
      showToast(e instanceof Error ? e.message : 'Failed to create batch');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (academicBatches.length <= 1) {
      showToast('You must keep at least 1 academic batch');
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.institute.deleteBatch(batchId);
      if (!res.success) {
        throw new Error(res.error?.message || 'Could not delete batch from server.');
      }

      const updated = academicBatches.filter((b) => b.id !== batchId);
      await api.setup.saveAttendanceSettings({ academicBatches: updated });

      setAcademicBatches(updated);
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          academicBatches: updated,
        },
      }));

      if (selectedBatchId === batchId && updated.length > 0) {
        const nextBatch = updated[0];
        setSelectedBatchId(nextBatch.id);
        setWorkStartTime(to12HourTime(nextBatch.startTime || '08:30'));
        setWorkEndTime(to12HourTime(nextBatch.endTime || '15:30'));
        if (nextBatch.workingDays) setSelectedDays(nextBatch.workingDays);
      }
      showToast('Batch removed');
    } catch (e) {
      console.error('Failed to delete batch', e);
      showToast(e instanceof Error ? e.message : 'Failed to delete batch');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEdit = (off: OfficePolicyConfig) => {
    const records = state.customOptions?.officeRecords || [];
    const record =
      records.find((r) => r.id === off.id) ||
      records.find((r) => r.name.trim().toLowerCase() === off.name.trim().toLowerCase());
    setEditingOffice({
      id: off.id,
      name: off.name,
      address: off.address || record?.address || '',
      latitude:
        record && Number.isFinite(record.latitude) && record.latitude !== 0
          ? record.latitude
          : state.organization.officeLocation?.latitude || DEFAULT_GEO_COORDINATES.latitude,
      longitude:
        record && Number.isFinite(record.longitude) && record.longitude !== 0
          ? record.longitude
          : state.organization.officeLocation?.longitude || DEFAULT_GEO_COORDINATES.longitude,
      radiusMeters: off.radiusMeters || record?.radiusMeters || 250,
      clockingDevices: off.clockingDevices,
      qrCodeEnabled: off.qrCodeEnabled,
      geofencingStatus: off.geofencingStatus,
      policyDescription: off.policyDescription,
    });

    // Refresh GPS from server for this office when possible
    void (async () => {
      try {
        const officesRes = await api.org.getOffices();
        const match = (officesRes.data || []).find(
          (o: any) =>
            String(o.id) === String(off.id) ||
            String(o.name).toLowerCase() === off.name.toLowerCase()
        );
        if (!match) return;
        const lat = Number(match.latitude);
        const lng = Number(match.longitude);
        const radius = Number(match.geofence_radius_meters ?? match.geofenceRadiusMeters);
        setEditingOffice((prev) =>
          prev
            ? {
                ...prev,
                id: match.id || prev.id,
                address: match.address || prev.address,
                latitude: Number.isFinite(lat) && lat !== 0 ? lat : prev.latitude,
                longitude: Number.isFinite(lng) && lng !== 0 ? lng : prev.longitude,
                radiusMeters:
                  Number.isFinite(radius) && radius > 0 ? radius : prev.radiusMeters,
              }
            : prev
        );
      } catch {
        // keep local/record coords
      }
    })();
  };

  const buildOfficeGeofencePolicies = (list: OfficePolicyConfig[]) =>
    list.map((o) => ({
      id: o.id,
      name: o.name,
      geofencingStatus: o.geofencingStatus,
      radiusMeters: o.radiusMeters,
      address: o.address,
      clockingDevices: o.clockingDevices,
      qrCodeEnabled: o.qrCodeEnabled,
    }));

  const persistOfficeGeofencePolicies = async (list: OfficePolicyConfig[]) => {
    const officeGeofencePolicies = buildOfficeGeofencePolicies(list);
    const nextAtt = {
      ...(state.customOptions?.attendanceSettings || {}),
      officeGeofencePolicies,
    };
    await api.setup.saveAttendanceSettings({ attendanceSettings: nextAtt });
    return nextAtt;
  };

  const handleDeleteOffice = async (id: string) => {
    const target = offices.find((o) => o.id === id);
    if (!target) return;
    setIsSaving(true);
    try {
      const officesRes = await api.org.getOffices();
      const match = (officesRes.data || []).find(
        (o: any) => String(o.name).toLowerCase() === target.name.toLowerCase()
      );
      if (!match?.id) throw new Error('Office not found on server');
      await api.org.deleteOffice(match.id);
      const updated = offices.filter((o) => o.id !== id);
      const nextAtt = await persistOfficeGeofencePolicies(updated);
      setOffices(updated);
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          offices: updated.map((o) => o.name),
          officeRecords: (prev.customOptions?.officeRecords || []).filter(
            (r) =>
              r.id !== id &&
              r.id !== match.id &&
              r.name.toLowerCase() !== target.name.toLowerCase()
          ),
          attendanceSettings: {
            ...prev.customOptions?.attendanceSettings,
            ...nextAtt,
          },
        },
      }));
      showToast(`Removed office "${target.name}"`);
    } catch (e: any) {
      showToast(e?.message || 'Failed to remove office');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOfficeModal = async (data: OfficeModalData) => {
    const isEdit = offices.some((o) => o.id === data.id);

    const newConfig: OfficePolicyConfig = {
      id: data.id || `off_${Date.now()}`,
      name: data.name,
      address: data.address,
      radiusText: `${data.radiusMeters} meters`,
      radiusMeters: data.radiusMeters,
      clockingDevices: data.clockingDevices || 'Desktop, Mobile',
      qrCodeEnabled: data.qrCodeEnabled ?? true,
      geofencingStatus: data.geofencingStatus || 'Active',
      policyDescription: data.policyDescription || 'Not allow clock in/out outside the office',
      allowOutsideOffice: false,
    };

    setIsSaving(true);
    try {
      const existing = isEdit ? offices.find((o) => o.id === data.id) : undefined;
      if (isEdit) {
        const officesRes = await api.org.getOffices();
        const match = (officesRes.data || []).find(
          (o: any) =>
            String(o.name).toLowerCase() === (existing?.name || data.name).toLowerCase()
        );
        if (!match?.id) throw new Error('Office not found on server');
        await api.org.updateOffice(match.id, {
          name: data.name,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          geofenceRadiusMeters: data.radiusMeters,
        });
        newConfig.id = match.id;
      } else {
        const codeSeed = (data.name || 'OFF').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'OFF';
        const created = await api.org.createOffice({
          name: data.name,
          code: `${codeSeed}${Math.floor(10 + Math.random() * 90)}`,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          geofenceRadiusMeters: data.radiusMeters,
        });
        if (created?.data?.id) newConfig.id = created.data.id;
      }

      const updated = isEdit
        ? offices.map((o) => (o.id === data.id ? newConfig : o))
        : [...offices, newConfig];
      const officeNames = updated.map((o) => o.name);
      const nextAtt = await persistOfficeGeofencePolicies(updated);

      setOffices(updated);
      onUpdateState((prev) => {
        const prevRecords = prev.customOptions?.officeRecords || [];
        const nextRecord = {
          id: String(newConfig.id),
          name: data.name,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          radiusMeters: data.radiusMeters,
          geofencingStatus: (data.geofencingStatus || 'Active') as 'Active' | 'Inactive' | 'Optional',
          isActive: true,
        };
        const officeRecords = isEdit
          ? prevRecords.some(
              (r) =>
                r.id === newConfig.id ||
                r.name.toLowerCase() === (existing?.name || data.name).toLowerCase()
            )
            ? prevRecords.map((r) =>
                r.id === newConfig.id ||
                r.name.toLowerCase() === (existing?.name || data.name).toLowerCase()
                  ? { ...r, ...nextRecord }
                  : r
              )
            : [...prevRecords, nextRecord]
          : [...prevRecords.filter((r) => r.id !== nextRecord.id), nextRecord];

        return {
          ...prev,
          customOptions: {
            ...prev.customOptions,
            offices: officeNames,
            officeRecords,
            attendanceSettings: {
              ...prev.customOptions?.attendanceSettings,
              ...nextAtt,
            },
          },
          organization: {
            ...prev.organization,
            officeLocation:
              officeNames.length <= 1 ||
              prev.organization?.officeLocation?.address === data.address ||
              prevRecords[0]?.id === newConfig.id
                ? {
                    address: data.address,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    allowedRadiusMeters: data.radiusMeters,
                  }
                : prev.organization.officeLocation,
          },
        };
      });

      showToast(isEdit ? `Office "${data.name}" Updated` : `Office "${data.name}" Added Successfully`);
      setEditingOffice(null);
      setShowAddOffice(false);
    } catch (e: any) {
      console.error('Failed to save office', e);
      showToast(e?.message || 'Failed to save office location');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAllSettings = async () => {
    if (isSaving) return;
    const savedGrace = Number.isFinite(Number(gracePeriod)) ? Math.max(0, Number(gracePeriod)) : 15;
    const updatedShifts = shifts.map((s) =>
      s.id === selectedShiftId
        ? {
            ...s,
            startTime: workStartTime || '09:00 AM',
            endTime: workEndTime || '06:00 PM',
            gracePeriodMinutes: savedGrace,
            workingDays: selectedDays,
          }
        : s
    );

    const updatedBatches = academicBatches.map((b) =>
      b.id === selectedBatchId
        ? {
            ...b,
            startTime: to24HourTime(workStartTime),
            endTime: to24HourTime(workEndTime),
            graceMinutes: savedGrace,
            workingDays: selectedDays,
          }
        : b
    );

    const fallbackShift = updatedShifts[0] || {
      id: 'sh-1',
      name: 'General Day Shift',
      startTime: '09:00 AM',
      endTime: '06:00 PM',
      gracePeriodMinutes: 15,
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    };

    const hourlyShift = updatedShifts.find((s) => s.isHourlyShift || s.id === 'sh-hourly') || {
      id: 'sh-hourly',
      name: 'Hourly / Flexible Shift',
      startTime: 'Flexible',
      endTime: 'Flexible',
      gracePeriodMinutes: 0,
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      rosterCode: 'HRLY',
      isHourlyShift: true,
      hourlyTrackingThresholdHours: 8,
    };

    const updatedEmployees = (state.employees || []).map((emp) => {
      const isHourlyWorker = (emp.salaryType === 'hourly' || emp.shiftTiming?.isHourlyShift) && enableHourlyShiftPolicy;
      const assignedShiftId = isHourlyWorker
        ? hourlyShift.id
        : (employeeShifts[emp.id] || emp.shiftTiming?.shiftId || selectedShiftId);
      const targetShift = isHourlyWorker ? hourlyShift : (updatedShifts.find((s) => s.id === assignedShiftId) || fallbackShift);

      // Leave remaining days are persisted via /attendance/leave-balances (server ledger).
      // Do not write leaveBalances onto employees through attendance settings save.
      return {
        ...emp,
        shiftId: targetShift.id,
        shiftTiming: {
          shiftId: targetShift.id,
          shiftName: targetShift.name,
          startTime: targetShift.startTime || 'Flexible',
          endTime: targetShift.endTime || 'Flexible',
          graceMinutes: targetShift.gracePeriodMinutes || 0,
          isHourlyShift: isHourlyWorker || targetShift.isHourlyShift,
          hourlyRate: emp.hourlyRate || targetShift.hourlyRate || 650,
        },
        workSchedule: isHourlyWorker ? {
          name: 'Hourly / Flexible Shift',
          workingDays: 'Monday - Friday (Flexible)',
          workingHours: 'Logged Hours',
          hoursPerWeek: 40,
        } : emp.workSchedule,
        rosterShiftId: assignedShiftId,
        rosterSchedule: employeeRosterMatrix[emp.id],
      };
    });

    const attendancePayload = {
      shifts: updatedShifts,
      academicBatches: updatedBatches,
      employeeShiftAssignments: employeeShifts,
      employeeRosterMatrix,
      attendancePolicies: {
        workDayStartTime: workStartTime,
        workDayEndTime: workEndTime,
        lateThresholdMinutes: savedGrace,
        geofenceRadiusMeters: Math.min(MAX_GEOFENCE_LIMIT, Math.max(MIN_GEOFENCE_LIMIT, Number(geofenceRadius) || 150)),
      },
      attendanceSettings: {
        isConfigured: true,
        hoursCalculationMethod: hoursCalcMethod,
        startDate,
        approvalCycle,
        locationScope,
        attendanceCycle,
        workDayStartTime: workStartTime,
        workDayEndTime: workEndTime,
        gracePeriodMinutes: savedGrace,
        halfDayThresholdHours: Number(halfDayHours) || 4.5,
        fullDayMinimumHours: Number(fullDayHours) || 8.0,
        autoClockOutEnabled: true,
        autoClockOutHours: 12,
        geofenceRadiusMeters: Math.min(MAX_GEOFENCE_LIMIT, Math.max(MIN_GEOFENCE_LIMIT, Number(geofenceRadius) || 150)),
        requireSelfieCheckIn,
        requireSelfieCheckOut,
        requireLocationGPS: requireGPS,
        geofenceEnabled: requireGPS,
        outOfRadiusAction,
        allowQrCodeAttendance,
        qrRefreshIntervalSeconds: Math.min(300, Math.max(15, Number(qrRefreshIntervalSeconds) || 30)),
        allowedIpAddresses: allowedIps.trim(),
        officeGeofencePolicies: buildOfficeGeofencePolicies(offices),
        includeSaturdayInWorkHours: selectedDays.includes('Saturday'),
        workingDays: selectedDays,
        enableAlternateSaturdays,
        alternateSaturdaysPolicy,
        enableAlternateSundays: enableAlternateSaturdays,
        alternateSundaysPolicy: alternateSaturdaysPolicy,
        enableRosterShifts,
        rosterRotationCycle,
        enableHourlyShiftPolicy,
        regularizationWindowDays: Math.min(90, Math.max(1, Number(regularizationDaysWindow) || 11)),
        requireManagerRegularizationApproval,
        repeatOn: `Day ${repeatOnDay}`,
      },
      leaveSettings: {
        paidLeaveQuota: Number(paidLeaveQuota) || 15,
        casualLeaveQuota: Number(casualLeaveQuota) || 12,
        sickLeaveQuota: Number(sickLeaveQuota) || 10,
        maternityLeaveQuota: Number(maternityLeaveQuota) || 180,
        paternityLeaveQuota: Number(paternityLeaveQuota) || 15,
        enableCompOff,
        maxConsecutiveDaysWithoutDoc: Number(maxConsecutiveWithoutDoc) || 3,
        maxCarryForwardDays: Number(maxCarryForward) || 10,
        enableCarryOver,
        leavePoliciesEnabled,
        accrualFrequency: leaveQuotaPeriod,
        enableMonthlyRollover,
        allowNegativeBalance,
        restrictDuringNoticePeriod: restrictDuringNotice,
        approvalWorkflow: leaveApprovalWorkflow,
        roleLeaveQuotas,
      },
      probationSettings: {
        enabled: enableProbation,
        defaultDurationMonths: Number(probationDurationMonths) || 3,
        restrictLeaveDuringProbation,
        autoConfirmAfterPeriod: autoConfirmProbation,
      },
      academicSettings: {
        minimumAttendanceThreshold: Number(studentMinAttendanceThreshold) || 75,
        enableLowAttendanceWarning,
        autoAlertGuardiansBelowThreshold,
        warningMessage: studentWarningMessage,
        consecutiveAbsenceAlertDays: Number(consecutiveAbsenceAlertDays) || 3,
      },
      reportSettings: options.reportSettings,
    };

    setIsSaving(true);
    try {
      await api.setup.saveAttendanceSettings(attendancePayload);
    } catch (e: any) {
      console.error('Failed to persist attendance settings', e);
      showToast(e?.message || 'Failed to save attendance settings');
      return;
    } finally {
      setIsSaving(false);
    }

    onUpdateState((prev) => ({
      ...prev,
      employees: updatedEmployees,
      organization: {
        ...prev.organization,
        workingDays: selectedDays,
        workingHours: {
          start: workStartTime,
          end: workEndTime,
        },
      },
      customOptions: {
        ...prev.customOptions,
        shifts: updatedShifts,
        academicBatches: updatedBatches,
        employeeShiftAssignments: employeeShifts,
        employeeRosterMatrix,
        reportSettings: attendancePayload.reportSettings,
        attendancePolicies: {
          ...prev.customOptions.attendancePolicies,
          ...attendancePayload.attendancePolicies,
        },
        attendanceSettings: attendancePayload.attendanceSettings,
        leaveSettings: attendancePayload.leaveSettings,
        probationSettings: attendancePayload.probationSettings,
        academicSettings: attendancePayload.academicSettings,
      },
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: prev.currentPersona.name,
          action: 'ATTENDANCE_CONFIG_CHANGE',
          entity: 'AttendanceAndLeaveConfig',
          entityId: 'attendance_config',
          ipAddress: '106.51.72.18',
          details: `Updated attendance rules: Start ${workStartTime}, End ${workEndTime} (${currentDailyShiftHours}h/day, ${currentWeeklyWorkHours}h/wk across ${selectedDays.length} days: ${selectedDays.join(', ')}), Grace ${gracePeriod}m, Student Warning Threshold ${studentMinAttendanceThreshold}%`,
        },
        ...prev.auditLogs,
      ],
    }));

    showToast(`Settings Saved (${selectedDays.length} Working Days • ${currentWeeklyWorkHours}h Target • ${studentMinAttendanceThreshold}% Student Threshold)`);
  };

  return (
    <div className="settings-page">
      <SettingsToast message={toastMessage} />

      <div className="settings-page__sticky">
        <SettingsPageHeader title={paneLabel || 'Attendance and leave'} actions={subTab !== 'holidays' ? <SettingsButton loading={isSaving} onClick={handleSaveAllSettings}>{isSaving ? 'Saving…' : 'Save changes'}</SettingsButton> : undefined} />

        {!pane && (
        <div className="settings-page__tabs" role="tablist" aria-label="Attendance settings categories">
          {[
            { id: 'general', label: isInstitution ? 'Batches & Schedules' : 'Shifts & Schedules' },
            ...(isInstitution ? [{ id: 'students', label: 'Student Policies & Warnings' }] : []),
            { id: 'policy', label: 'Policy & GPS Geofencing' },
            { id: 'office_location', label: isInstitution ? 'Campus Locations' : 'Offices & Locations' },
            { id: 'leaves', label: 'Leave Policies & Quotas' },
            { id: 'holidays', label: 'Holidays' },
          ].map((item) => {
            const isSelected = subTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id as any)}
                role="tab"
                aria-selected={isSelected}
                aria-controls={`attendance-settings-${item.id}`}
                className={`settings-page__tab${isSelected ? ' settings-page__tab--active' : ''}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="w-full space-y-5" id={`attendance-settings-${subTab}`} role="tabpanel">
          {/* ========================================================================= */}
          {/* 1. GENERAL TAB (Shifts / Batches & Working Days)                          */}
          {/* ========================================================================= */}
          {subTab === 'general' && (
            <>
<SettingsCard className={` p-5 sm:p-7 space-y-6`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className={ATT_SECTION_TITLE}>
                    {isInstitution ? 'Academic Batches & Schedules' : 'Work Shifts & Schedules'}
                  </h3>
                  <p className={ATT_SECTION_SUB}>
                    {isInstitution
                      ? 'Configure batch timings, classroom shifts, and select weekly active days'
                      : 'Create custom shifts, assign office timings, and choose weekly working days'}
                  </p>
                </div>
              </div>

              {/* SECTION: CHOOSE OR CREATE SHIFT / BATCH */}
              {isInstitution ? (
                /* Institutional Batches Switcher */
                <div className="space-y-3 p-4 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-color)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--text-primary)]">
                      Choose Batch to Configure
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddBatchModal(true)}
                      className="settings-page__action"
                    >
                      New Batch
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {academicBatches.length === 0 ? (
                      <div className="text-xs text-[var(--text-muted)] py-1 font-medium">
                        No batches configured yet. Click &quot;New Batch&quot; above to create one.
                      </div>
                    ) : (
                      academicBatches.map((b) => {
                        const isSelected = b.id === selectedBatchId;
                        return (
                          <div
                            key={b.id}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-color)] hover:border-[var(--border-strong)]'
                            }`}
                            onClick={() => handleSelectBatch(b.id)}
                          >
                            <span>{b.grade} {b.section ? `- ${b.section}` : ''}</span>
                            <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-100' : 'text-[var(--text-muted)]'}`}>
                              ({b.startTime || '08:30'} - {b.endTime || '15:30'})
                            </span>
                            {academicBatches.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteBatch(b.id);
                                }}
                                className={`p-0.5 text-xs font-bold transition-colors cursor-pointer ${
                                  isSelected ? 'text-blue-200 hover:text-white' : 'text-[var(--text-muted)] hover:text-red-600'
                                }`}
                                title="Delete batch"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* Work shift selection */
                <div className="settings-shift-picker">
                  <div className="settings-card__header"><h4>Work shifts</h4><SettingsButton variant="secondary" onClick={() => setShowAddShiftModal(true)}>New shift</SettingsButton></div>
                  <div className="settings-shift-options" role="group" aria-label="Work shift">
                    {shifts.map((shift) => <div key={shift.id} className={selectedShiftId === shift.id ? 'is-selected' : ''}>
                      <button type="button" aria-pressed={selectedShiftId === shift.id} onClick={() => handleSelectShift(shift.id)}><span>{shift.name}</span><small>{shift.isHourlyShift ? 'Hourly / flexible' : `${shift.startTime} – ${shift.endTime}`}</small></button>
                      {shifts.length > 1 && <button type="button" className="settings-shift-remove" aria-label={`Delete ${shift.name}`} onClick={() => handleDeleteShift(shift.id)}>×</button>}
                    </div>)}
                  </div>
                </div>
              )}

              {/* SECTION: TIMINGS & SCHEDULE RULES */}
              <div className="space-y-4 pt-1">
                {/* Live Computed Schedule Target Banner */}
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/60 text-xs">
                  <div>
                    <span className="font-semibold text-[var(--text-primary)] block">Weekly Work Target</span>
                    <span className="text-[11px] text-[var(--text-muted)]">{currentDailyShiftHours} hrs/day × {selectedDays.length} days</span>
                  </div>
                  <span className="text-sm font-bold text-[var(--text-primary)] font-mono">{currentWeeklyWorkHours} Hours</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">
                      {isInstitution ? 'Morning Bell / Start Time' : 'Shift Start Time'}
                    </label>
                    <input
                      type="time"
                      value={to24HourTime(workStartTime)}
                      onChange={(e) => setWorkStartTime(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">
                      {isInstitution ? 'Dismissal / End Time' : 'Shift End Time'}
                    </label>
                    <input
                      type="time"
                      value={to24HourTime(workEndTime)}
                      onChange={(e) => setWorkEndTime(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">Grace Buffer Period</label>
                    <div className="relative">
                      <select
                        value={gracePeriod}
                        onChange={(e) => setGracePeriod(Number(e.target.value))}
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] appearance-none outline-none focus:border-blue-600 cursor-pointer pr-8"
                      >
                        <option value={0}>0 Mins (Strict)</option>
                        <option value={5}>5 Minutes</option>
                        <option value={10}>10 Minutes</option>
                        <option value={15}>15 Minutes (Default)</option>
                        <option value={30}>30 Minutes</option>
                        <option value={45}>45 Minutes</option>
                        <option value={60}>60 Minutes</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* INTERACTIVE 7-DAY SELECTOR (MON - SUN) */}
                <div className="space-y-3 p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)]">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-[var(--text-primary)] block">Weekly Working Days</span>
                      <span className="text-[11px] text-[var(--text-muted)]">
                        Choose active working days for this schedule (in sync with organization working days)
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
                          setEnableAlternateSaturdays(false);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] font-medium cursor-pointer transition-colors"
                      >
                        Mon – Fri (5 Days)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
                          setEnableAlternateSaturdays(false);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] font-medium cursor-pointer transition-colors"
                      >
                        Mon – Sat (6 Days)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
                          setEnableAlternateSaturdays(true);
                          setAlternateSaturdaysPolicy('2nd_4th_off');
                        }}
                        className={`px-2.5 py-1 rounded-lg border font-medium cursor-pointer transition-colors ${
                          enableAlternateSaturdays
                            ? 'border-blue-600 bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] text-blue-700 font-semibold'
                            : 'border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]'
                        }`}
                      >
                        Mon – Fri + Alt. Saturdays
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
                          setEnableAlternateSaturdays(false);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] font-medium cursor-pointer transition-colors"
                      >
                        All 7 Days
                      </button>
                    </div>
                  </div>

                  <SettingsDayPicker value={selectedDays} onToggle={toggleDay} />

                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] flex items-center justify-between">
                    <span>
                      Active: <strong className="text-[var(--text-primary)] font-bold">{selectedDays.length} Days</strong> ({selectedDays.map((d) => d.slice(0, 3)).join(', ')})
                      {enableAlternateSaturdays && (
                        <span className="ml-1 text-[var(--text-secondary)] font-semibold">+ Alternate Saturdays ({alternateSaturdaysPolicy === '2nd_4th_off' ? '2nd & 4th Off' : alternateSaturdaysPolicy === '1st_3rd_off' ? '1st & 3rd Off' : 'Fortnightly'})</span>
                      )}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">
                      {enableAlternateSaturdays ? 'Alternate Weekend Policy' : 7 - selectedDays.length > 0 ? `${7 - selectedDays.length} Off Days` : 'No Off Days'}
                    </span>
                  </div>

                  {/* Alternate Saturdays Schedule Card */}
                  <div className="p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/50 space-y-3">
                    <SettingsSwitchRow title={"Alternate Saturdays"} description={"Allow Saturdays to alternate between active working shifts and scheduled weekly offs."} checked={enableAlternateSaturdays} onChange={setEnableAlternateSaturdays} />

                    {enableAlternateSaturdays && (
                      <div className="pt-2.5 border-t border-[var(--border-color)] space-y-2.5 animate-in fade-in">
                        <label className="text-[11px] font-bold text-[var(--text-secondary)] block">Select Alternate Saturday Rule</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setAlternateSaturdaysPolicy('2nd_4th_off')}
                            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                              alternateSaturdaysPolicy === '2nd_4th_off'
                                ? 'border-blue-600 bg-[var(--bg-surface)] text-blue-900 font-bold ring-1 ring-blue-600/30'
                                : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                            }`}
                          >
                            <div className="font-bold">2nd & 4th Off</div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">1st, 3rd, 5th Saturdays are Working</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAlternateSaturdaysPolicy('1st_3rd_off')}
                            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                              alternateSaturdaysPolicy === '1st_3rd_off'
                                ? 'border-blue-600 bg-[var(--bg-surface)] text-blue-900 font-bold ring-1 ring-blue-600/30'
                                : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                            }`}
                          >
                            <div className="font-bold">1st & 3rd Off</div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">2nd & 4th Saturdays are Working</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAlternateSaturdaysPolicy('alternate')}
                            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                              alternateSaturdaysPolicy === 'alternate'
                                ? 'border-blue-600 bg-[var(--bg-surface)] text-blue-900 font-bold ring-1 ring-blue-600/30'
                                : 'border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
                            }`}
                          >
                            <div className="font-bold">Every Other Saturday</div>
                            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">Alternates fortnightly</div>
                          </button>
                        </div>

                        <div className="p-2.5 rounded-lg bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] border border-blue-200 text-[11px] text-blue-800">
                          Working Saturdays will be automatically factored into shift target calculations and punch logs.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Working Hourly Shift & Hours Tracking Card */}
                  <div className="p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/50 space-y-3">
                    <SettingsSwitchRow title={"Hourly / flexible shifts"} description={"Automatically transition employees on hourly wages to the Hourly / Flexible Shift and track their exact hours worked."} checked={enableHourlyShiftPolicy} onChange={setEnableHourlyShiftPolicy} />

                    {enableHourlyShiftPolicy && (
                      <div className="pt-2.5 border-t border-[var(--border-color)] space-y-2 animate-in fade-in">
                        <div className="p-2.5 rounded-lg bg-[color-mix(in_srgb,var(--primary-blue)_8%,transparent)] border border-blue-200 text-[11px] text-blue-900">
                          <span className="font-bold block mb-0.5">Hourly Shift Impact:</span>
                          <p className="text-blue-800">
                            Employees with hourly compensation are exempt from rigid fixed check-in times. Daily punches track actual logged hours, standard hours (8h), and overtime beyond threshold.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">Half-Day Minimum (Hours)</label>
                    <select
                      value={halfDayHours}
                      onChange={(e) => setHalfDayHours(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] appearance-none outline-none focus:border-blue-600 cursor-pointer"
                    >
                      <option value={3.5}>3.5 Hours</option>
                      <option value={4.0}>4.0 Hours</option>
                      <option value={4.5}>4.5 Hours (Standard)</option>
                      <option value={5.0}>5.0 Hours</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-secondary)]">Full-Day Minimum (Hours)</label>
                    <select
                      value={fullDayHours}
                      onChange={(e) => setFullDayHours(Number(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] appearance-none outline-none focus:border-blue-600 cursor-pointer"
                    >
                      <option value={7.0}>7.0 Hours</option>
                      <option value={7.5}>7.5 Hours</option>
                      <option value={8.0}>8.0 Hours (Standard)</option>
                      <option value={8.5}>8.5 Hours</option>
                      <option value={9.0}>9.0 Hours</option>
                    </select>
                  </div>
                </div>

                {/* Auto Clock Out Row */}
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/50">
                  <div className="space-y-0.5 pr-4">
                    <p className="text-xs font-bold text-[var(--text-primary)]">Forgotten punch-out</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      After local midnight an open shift stops with a blank punch-out. The next visit asks what time they left. Leaving the office fence while the site is open signs them out after 5 minutes.
                    </p>
                  </div>
                </div>
              </div>

              {/* Attendance Calculation & General Scope */}
              </SettingsCard>
<SettingsCard>
<div className="space-y-5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Calculation & Approvals
                </h4>
                <SettingsField label="Attendance cycle" hint="Choose monthly reconciliation or cumulative annual hours."><select value={attendanceCycle} onChange={(event) => setAttendanceCycle(event.target.value as 'monthly' | 'yearly')}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></SettingsField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Total Hours Calculation Method</label>
                    <select
                      value={hoursCalcMethod}
                      onChange={(e) => setHoursCalcMethod(e.target.value as any)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer "
                    >
                      <option value="every_punch">Every Valid Check-in & Check-out</option>
                      <option value="first_last">First Check-in & Last Check-out</option>
                      <option value="strict_shift">Strict Shift Hours</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Approval Cycle Type</label>
                    <select
                      value={approvalCycle}
                      onChange={(e) => setApprovalCycle(e.target.value as any)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer "
                    >
                      <option value="Monthly">Monthly Cycle (Default)</option>
                      <option value="Bi-Weekly">Bi-Weekly Cycle</option>
                      <option value="Weekly">Weekly Cycle</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Cycle anchor day</label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={repeatOnDay}
                      onChange={(e) => setRepeatOnDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Attendance Start Date</label>
                    <DateInput value={startDate} onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer "
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[var(--text-secondary)]">Default Office Scope</label>
                    <select
                      value={locationScope}
                      onChange={(e) => setLocationScope(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2.5 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer "
                    >
                      <option value="All Offices">All Offices</option>
                      {offices.map((o) => (
                        <option key={o.id} value={o.name}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Save General Button */}

            </SettingsCard>
</>
          )}

          {/* ========================================================================= */}
          {/* 2. STUDENT ATTENDANCE & WARNING THRESHOLDS TAB                           */}
          {/* ========================================================================= */}
          {subTab === 'students' && (
            <div className="space-y-6 text-[var(--text-primary)]">
              {/* Header Card */}


              {/* CARD 1: Configurable Minimum Attendance Threshold */}
              <SettingsCard className={` p-5 sm:p-6 space-y-4`}>
                <div className="border-b border-[var(--border-color)] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className={ATT_SECTION_TITLE}>
                      Minimum Attendance Requirement Policy
                    </h4>
                    <p className={ATT_SECTION_SUB}>
                      Students whose term or monthly attendance rate drops below this mark will be flagged with warning badges and queued for guardian notifications.
                    </p>
                  </div>
                </div>

                <div className="max-w-md space-y-1.5 pt-1">
                  <label className="block text-xs font-semibold text-[var(--text-secondary)]">
                    Attendance Cut-off Rate (%)
                  </label>
                  <select
                    value={studentMinAttendanceThreshold}
                    onChange={(e) => setStudentMinAttendanceThreshold(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer transition-all"
                  >
                    <option value={50}>50% - Low Requirement</option>
                    <option value={60}>60% - Relaxed Minimum</option>
                    <option value={65}>65% - Moderate Requirement</option>
                    <option value={70}>70% - Standard Policy</option>
                    <option value={75}>75% - Standard University / Board Rule (Recommended)</option>
                    <option value={80}>80% - Strict Academic Policy</option>
                    <option value={85}>85% - High Performance Cohort</option>
                    <option value={90}>90% - Honor Roll Requirement</option>
                    <option value={95}>95% - Mandatory Regularity</option>
                  </select>
                </div>
              </SettingsCard>

              {/* CARD 2: Automated Rules & Guardian Alerts */}
              <SettingsCard className={` p-5 sm:p-6 space-y-4`}>
                <div className="border-b border-[var(--border-color)] pb-3">
                  <h4 className={ATT_SECTION_TITLE}>
                    Warning Flags & Guardian Alert Automation
                  </h4>
                  <p className={ATT_SECTION_SUB}>
                    Configure automated notifications, roster warning chips, and consecutive absence triggers.
                  </p>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Toggle 1: Warning Badges */}
                  <div className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/50">
                    <div className="space-y-0.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">Show Warning Badges on Rosters</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          enableLowAttendanceWarning ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-[var(--text-secondary)]'
                        }`}>
                          {enableLowAttendanceWarning ? 'Enabled' : 'Off'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Displays an amber warning pill (&lt; {studentMinAttendanceThreshold}%) in the Student Directory, Attendance Table, and Profile dialogs.
                      </p>
                    </div>
                    <ToggleSwitch checked={enableLowAttendanceWarning} onChange={setEnableLowAttendanceWarning} />
                  </div>

                  {/* Toggle 2: Automated Guardian Alert */}
                  <div className="flex items-center justify-between p-3.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/50">
                    <div className="space-y-0.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">Auto-Notify Guardians upon Falling Below {studentMinAttendanceThreshold}%</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          autoAlertGuardiansBelowThreshold ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-[var(--text-secondary)]'
                        }`}>
                          {autoAlertGuardiansBelowThreshold ? 'Automated' : 'Manual'}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Emails the guardian when an address is on file. With no email, HR gets an in-app notice. Phone numbers are not texted.
                      </p>
                    </div>
                    <ToggleSwitch checked={autoAlertGuardiansBelowThreshold} onChange={setAutoAlertGuardiansBelowThreshold} />
                  </div>

                  {/* Consecutive Absences Rule */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[var(--text-secondary)]">Consecutive Absences Urgent Alert</label>
                      <select
                        value={consecutiveAbsenceAlertDays}
                        onChange={(e) => setConsecutiveAbsenceAlertDays(Number(e.target.value))}
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer"
                      >
                        <option value={2}>2 Consecutive Days Absent</option>
                        <option value={3}>3 Consecutive Days (Standard)</option>
                        <option value={5}>5 Consecutive Days (Critical Notice)</option>
                        <option value={7}>7 Consecutive Days (Disciplinary Review)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-[var(--text-secondary)]">Reconciliation Evaluation Window</label>
                      <select
                        defaultValue="monthly"
                        className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer"
                      >
                        <option value="monthly">Monthly Academic Rollup</option>
                        <option value="term">Term / Semester Cumulative</option>
                        <option value="rolling">Rolling 30-Day Window</option>
                      </select>
                    </div>
                  </div>

                  {/* Customizable Guardian Notification Template */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-[var(--text-primary)] flex items-center justify-between">
                      <span>Guardian alert email</span>
                      <span className="text-[10px] font-normal text-[var(--text-muted)]">Tokens: &#123;student_name&#125;, &#123;attendance_pct&#125;, &#123;threshold&#125;</span>
                    </label>
                    <textarea
                      rows={3}
                      value={studentWarningMessage}
                      onChange={(e) => setStudentWarningMessage(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-3 text-xs text-[var(--text-primary)] outline-none focus:border-blue-600 transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--text-primary)]">
                        Students to notify ({activeDefaulters.length})
                      </span>
                      <button
                        type="button"
                        onClick={handleAlertAllDefaulters}
                        className="text-xs font-semibold text-[#17324e] hover:underline"
                      >
                        Email all
                      </button>
                    </div>
                    {activeDefaulters.length === 0 ? (
                      <p className="text-[11px] text-[var(--text-muted)]">No student is below the threshold or absent for the set number of school days.</p>
                    ) : (
                      <ul className="divide-y divide-[var(--border-color)] rounded-xl border border-[var(--border-color)]">
                        {activeDefaulters.map((row) => {
                          const id = row.student.id || row.student.studentId || row.student.name;
                          return (
                            <li key={id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                              <span>
                                <span className="font-semibold text-[var(--text-primary)]">{row.student.name}</span>
                                <span className="ml-2 text-[var(--text-muted)]">
                                  {row.rate}% · {row.consecutiveAbsences} school days absent
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAlertGuardian(String(row.student.id || row.student.studentId || ''))}
                                className="font-semibold text-[#17324e] hover:underline"
                              >
                                Send
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </SettingsCard>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. POLICY TAB (GPS & Enforcements)                                        */}
          {/* ========================================================================= */}
          {subTab === 'policy' && (
            <div className="space-y-6">


              {/* CARD 1: GPS Geofencing Perimeter Controls */}
              <SettingsCard className={` p-5 sm:p-6 space-y-5`}>
                <div className="border-b border-[var(--border-color)] pb-3">
                  <h4 className={ATT_SECTION_TITLE}>
                    GPS Geofencing Boundary
                  </h4>
                  <p className={ATT_SECTION_SUB}>
                    Define the physical perimeter within which employee punches are validated.
                  </p>
                </div>

                <div className="space-y-4 text-xs">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[var(--text-secondary)]">Geofence Radius</label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={MIN_GEOFENCE_LIMIT}
                          max={MAX_GEOFENCE_LIMIT}
                          step={1}
                          value={geofenceRadius}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setGeofenceRadius(Math.min(MAX_GEOFENCE_LIMIT, Math.max(MIN_GEOFENCE_LIMIT, val)));
                          }}
                          className="w-16 rounded-lg border border-[var(--border-strong)] px-2 py-1 text-xs font-mono font-bold text-blue-600 text-right outline-none focus:border-blue-600"
                        />
                        <span className="text-xs text-[var(--text-muted)]">meters</span>
                      </div>
                    </div>

                    <input
                      type="range"
                      min={25}
                      max={MAX_GEOFENCE_LIMIT}
                      step={25}
                      value={geofenceRadius}
                      onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                      className="w-full accent-blue-600 cursor-pointer"
                    />

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[
                        { m: 50, label: '50m (Gate)' },
                        { m: 100, label: '100m (Floor)' },
                        { m: 150, label: '150m (Building)' },
                        { m: 250, label: '250m (Campus)' },
                        { m: 500, label: '500m (Wide)' },
                        { m: 1000, label: '1,000m (Max)' },
                      ].map((preset) => (
                        <button
                          key={preset.m}
                          type="button"
                          onClick={() => setGeofenceRadius(preset.m)}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                            geofenceRadius === preset.m
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-slate-400'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">Require GPS geofencing</div>
                      <div className="text-[11px] text-[var(--text-muted)]">When off, punches do not need device GPS and office radius is not enforced</div>
                    </div>
                    <ToggleSwitch checked={requireGPS} onChange={setRequireGPS} />
                  </div>

                  <div className="pt-3 border-t border-[var(--border-color)] flex items-center justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold text-[var(--text-primary)]">Out-of-Radius Punch Handling</div>
                      <div className="text-[11px] text-[var(--text-muted)]">Action taken when an employee punches outside the geofence perimeter</div>
                    </div>
                    <select
                      value={outOfRadiusAction}
                      onChange={(e) => setOutOfRadiusAction(e.target.value as 'Block' | 'Allow' | 'Warn')}
                      disabled={!requireGPS}
                      className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 disabled:opacity-50"
                    >
                      <option value="Block">Block check-in</option>
                      <option value="Warn">Warn, then allow as remote</option>
                      <option value="Allow">Allow without warning</option>
                    </select>
                  </div>
                </div>
              </SettingsCard>

              {/* CARD 2: Punch Verification Enforcements */}
              <SettingsCard className={` p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>
                    Punch Verification & Identity Rules
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-color)]">
                    Security Enforced
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">

                  <SettingsSwitchRow className="md:col-span-12" title={"Check-in selfie"} checked={requireSelfieCheckIn} onChange={setRequireSelfieCheckIn} />


                  <SettingsSwitchRow className="md:col-span-12" title={"Check-out selfie"} checked={requireSelfieCheckOut} onChange={setRequireSelfieCheckOut} />

                  <div className="md:col-span-4 text-[var(--text-muted)] font-medium">
                    Office Wi-Fi IP Allowlist
                  </div>
                  <div className="md:col-span-8 max-w-md">
                    <input
                      type="text"
                      value={allowedIps}
                      onChange={(e) => setAllowedIps(e.target.value)}
                      placeholder="Leave empty to allow any network. Example: 192.168.1.0/24, 10.0.0.12"
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 font-mono"
                    />
                  </div>


                  <SettingsSwitchRow className="md:col-span-12" title={"QR attendance"} checked={allowQrCodeAttendance} onChange={setAllowQrCodeAttendance} />
                  {allowQrCodeAttendance && (
                    <>
                      <div className="md:col-span-4 text-[var(--text-muted)] font-medium">
                        QR refresh interval
                      </div>
                      <div className="md:col-span-8 max-w-md">
                        <input
                          type="number"
                          min={15}
                          max={300}
                          value={qrRefreshIntervalSeconds}
                          onChange={(e) =>
                            setQrRefreshIntervalSeconds(Math.min(300, Math.max(15, Number(e.target.value) || 30)))
                          }
                          className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 font-mono"
                        />
                        <span className="ml-2 text-[11px] text-[var(--text-muted)]">seconds</span>
                      </div>
                    </>
                  )}
                </div>
              </SettingsCard>

              {/* CARD 3: Attendance Regularization Rules */}
              <SettingsCard className={` p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="border-b border-[var(--border-color)] pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>
                    Attendance Regularization & Disputes
                  </h4>
                  <p className={ATT_SECTION_SUB}>
                    Set how far back employees may dispute punches and whether manager approval is required.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                  <div className="md:col-span-4 text-[var(--text-muted)] font-medium">
                    Request Submission Window
                  </div>
                  <div className="md:col-span-8 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={regularizationDaysWindow}
                      onChange={(e) => setRegularizationDaysWindow(Number(e.target.value))}
                      className="w-20 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 text-right font-mono"
                    />
                    <span className="text-xs text-[var(--text-muted)] font-medium">
                      calendar days allowed after missed punch to dispute attendance
                    </span>
                  </div>


                  <SettingsSwitchRow className="md:col-span-12" title={"Manager approval for regularizations"} checked={requireManagerRegularizationApproval} onChange={setRequireManagerRegularizationApproval} />
                </div>
              </SettingsCard>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. OFFICE LOCATION TAB                                                    */}
          {/* ========================================================================= */}
          {subTab === 'office_location' && (
            <div className="space-y-6">
              <SettingsCard className={` p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div>
                  <h3 className={ATT_SECTION_TITLE}>
                    {isInstitution ? 'Campus Locations' : 'Office Locations & Geofences'}
                  </h3>
                  <p className={ATT_SECTION_SUB}>
                    Manage physical branches and configure GPS boundaries for on-site attendance
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingOffice(null);
                    setShowAddOffice(true);
                  }}
                  className={`${ATT_BTN_PRIMARY} shrink-0`}
                >
                  Add Location
                </button>
              </SettingsCard>

              {/* Office Cards List */}
              {offices.length === 0 ? (
                <SettingsCard className={` border-dashed p-10 flex flex-col items-center justify-center text-center space-y-3`}>
                  <div>
                    <h4 className="text-sm font-semibold text-[var(--text-primary)]">No Locations Configured</h4>
                    <p className="text-xs text-[var(--text-muted)] max-w-sm mt-0.5">
                      Add your physical campus/office locations and geofences below to enable location-restricted check-ins.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingOffice(null);
                      setShowAddOffice(true);
                    }}
                    className={`${ATT_BTN_PRIMARY} mt-2`}
                  >
                    Add First Location
                  </button>
                </SettingsCard>
              ) : (
                <div className="space-y-4">
                  {offices.map((office) => (
                    <SettingsCard
                      key={office.id}
                      className={` p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}
                    >
                      {/* Office Title + Action Buttons */}
                      <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3.5">
                        <h4 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                          {office.name}
                        </h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(office)}
                            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold text-xs cursor-pointer px-2 py-1 rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors"
                            title="Edit Location Policy"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteOffice(office.id)}
                            className="text-[var(--text-muted)] hover:text-red-600 font-semibold text-xs cursor-pointer px-2 py-1 rounded-md hover:bg-[var(--bg-surface-subtle)] transition-colors"
                            title="Delete Location"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Key-Value Attribute Table */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-y-3.5 text-xs">
                        <div className="md:col-span-4 text-[var(--text-muted)] font-medium">Clocking in/out from</div>
                        <div className="md:col-span-8 text-[var(--text-primary)] font-semibold">{office.clockingDevices}</div>

                        <div className="md:col-span-4 text-[var(--text-muted)] font-medium">QR Code</div>
                        <div className="md:col-span-8 text-[var(--text-primary)] font-semibold">{office.qrCodeEnabled ? 'Yes' : 'No'}</div>

                        <div className="md:col-span-4 text-[var(--text-muted)] font-medium">Geofencing</div>
                        <div className="md:col-span-8 text-[var(--text-primary)] font-semibold flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full inline-block ${
                              office.geofencingStatus === 'Inactive' ? 'bg-slate-400' : 'bg-emerald-500'
                            }`}
                          />
                          <span>{office.geofencingStatus}</span>
                        </div>

                        <div className="md:col-span-4 text-[var(--text-muted)] font-medium">Address</div>
                        <div className="md:col-span-8 text-[var(--text-primary)] font-semibold">{office.address}</div>

                        <div className="md:col-span-4 text-[var(--text-muted)] font-medium">Radius</div>
                        <div className="md:col-span-8 text-[var(--text-primary)] font-semibold font-mono">{office.radiusText}</div>

                        <div className="md:col-span-4 text-[var(--text-muted)] font-medium">Policy</div>
                        <div className="md:col-span-8 text-[var(--text-primary)] font-semibold">{office.policyDescription}</div>
                      </div>
                    </SettingsCard>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. LEAVES TAB                                                             */}
          {/* ========================================================================= */}
          {subTab === 'leaves' && (
            <div className="space-y-6">


              <SettingsCard className={` p-5 sm:p-7 space-y-6`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5">
                  <div>
                    <h4 className={ATT_SECTION_TITLE}>How leaves are granted</h4>
                    <p className={ATT_SECTION_SUB}>
                      Quotas below are annual allowances. Yearly credits the full balance on day one.
                      Monthly credits 1/12 each month.
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 shrink-0">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Enable grant rules</span>
                    <ToggleSwitch checked={leavePoliciesEnabled} onChange={setLeavePoliciesEnabled} />
                  </div>
                </div>

                {leavePoliciesEnabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setLeaveQuotaPeriod('annual')}
                      className={`text-left rounded-xl border px-4 py-3.5 cursor-pointer transition-colors ${
                        leaveQuotaPeriod === 'annual'
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/20'
                          : 'border-[var(--border-color)] bg-[var(--bg-surface)] hover:border-slate-300'
                      }`}
                    >
                      <div className="text-sm font-semibold text-[var(--text-primary)]">Yearly</div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">
                        Full annual quota is available from January (or join date). Unused days can carry to next year if enabled.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaveQuotaPeriod('monthly')}
                      className={`text-left rounded-xl border px-4 py-3.5 cursor-pointer transition-colors ${
                        leaveQuotaPeriod === 'monthly'
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/20'
                          : 'border-[var(--border-color)] bg-[var(--bg-surface)] hover:border-slate-300'
                      }`}
                    >
                      <div className="text-sm font-semibold text-[var(--text-primary)]">Monthly</div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">
                        Employees earn a twelfth of the annual quota each month. Unused days can roll into the next month.
                      </p>
                    </button>
                  </div>
                )}

                {leavePoliciesEnabled && (
                  <div className="space-y-4 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/50 p-4">
                    {leaveQuotaPeriod === 'monthly' && (
                      <SettingsSwitchRow title={"Monthly leave rollover"} description={"If a month's grant is not used, it is added to next month (capped at the annual quota). Turn off to expire unused days at month-end."} checked={enableMonthlyRollover} onChange={setEnableMonthlyRollover} />
                    )}
                    <SettingsSwitchRow title={"Carry unused leave forward"} description={"At year-end, leftover days move into the next calendar year up to the cap."} checked={enableCarryOver} onChange={setEnableCarryOver} />
                    {enableCarryOver && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-[var(--text-secondary)]">Max carry to next year</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={90}
                          step={1}
                          value={maxCarryForward}
                          onKeyDown={blockDecimalPointKeys}
                          onChange={(e) => {
                            const val = toWholeDays(e.target.value, 90);
                            if (val === null) return;
                            setMaxCarryForward(val);
                          }}
                          className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 text-right font-mono"
                        />
                        <span className="text-xs text-[var(--text-muted)]">days per leave type</span>
                      </div>
                    )}
                  </div>
                )}
              </SettingsCard>

              {/* CARD 1: Annual Paid Leave Entitlements */}
              <SettingsCard className={` p-5 sm:p-7 space-y-6`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-color)] pb-5">
                  <div>
                    <h4 className={ATT_SECTION_TITLE}>Annual paid leave quotas (per employee)</h4>
                    <p className={ATT_SECTION_SUB}>
                      {leavePoliciesEnabled && leaveQuotaPeriod === 'monthly'
                        ? `Monthly credit ≈ 1/12 of these numbers${enableMonthlyRollover ? ', unused rolls forward' : ', unused expires each month'}`
                        : 'Credited as a full-year balance when yearly grant is selected'}
                    </p>
                  </div>
                </div>

                {/* Section A: Standard Recurring Accrual Leaves */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Standard Recurring Leaves
                    </span>
                    <span className="text-[11px] font-medium text-[var(--text-muted)]">
                      Values shown per year
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                    {/* Paid / Privilege Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-[var(--text-primary)] text-xs">Paid / Privilege Leave (PL / EL)</div>
                      <div className="text-[11px] text-[var(--text-muted)]">Earned leaves for planned vacations</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={90}
                        step={1}
                        value={paidLeaveQuota}
                        onKeyDown={blockDecimalPointKeys}
                        onChange={(e) => {
                          const val = toWholeDays(e.target.value, 90);
                          if (val === null) return;
                          setPaidLeaveQuota(val);
                        }}
                        className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Days / Year</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border border-[var(--border-color)]">
                          ≈ {(paidLeaveQuota / 12).toFixed(2)} days / month
                        </span>
                      </div>
                    </div>

                    {/* Casual Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-[var(--text-primary)] text-xs">Casual Leave (CL)</div>
                      <div className="text-[11px] text-[var(--text-muted)]">For unexpected personal needs & emergencies</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={60}
                        step={1}
                        value={casualLeaveQuota}
                        onKeyDown={blockDecimalPointKeys}
                        onChange={(e) => {
                          const val = toWholeDays(e.target.value, 60);
                          if (val === null) return;
                          setCasualLeaveQuota(val);
                        }}
                        className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Days / Year</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border border-[var(--border-color)]">
                          ≈ {(casualLeaveQuota / 12).toFixed(2)} days / month
                        </span>
                      </div>
                    </div>

                    {/* Sick Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-[var(--text-primary)] text-xs">Sick Leave (SL)</div>
                      <div className="text-[11px] text-[var(--text-muted)]">For illness, doctor visits & medical recovery</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={60}
                        step={1}
                        value={sickLeaveQuota}
                        onKeyDown={blockDecimalPointKeys}
                        onChange={(e) => {
                          const val = toWholeDays(e.target.value, 60);
                          if (val === null) return;
                          setSickLeaveQuota(val);
                        }}
                        className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Days / Year</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] border border-[var(--border-color)]">
                          ≈ {(sickLeaveQuota / 12).toFixed(2)} days / month
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section B: Statutory & Special Leaves (Event-Based) */}
                <div className="pt-4 border-t border-[var(--border-color)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] block">
                        Statutory & Special Leaves (Per Occurrence)
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] mt-0.5 block">
                        Fixed statutory allowances granted per qualifying life event (not monthly accruals)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                    {/* Maternity Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-[var(--text-primary)] text-xs">Maternity Leave Allowance</div>
                      <div className="text-[11px] text-[var(--text-muted)]">Granted to eligible female employees per child</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={365}
                        step={1}
                        value={maternityLeaveQuota}
                        onKeyDown={blockDecimalPointKeys}
                        onChange={(e) => {
                          const val = toWholeDays(e.target.value, 365);
                          if (val === null) return;
                          setMaternityLeaveQuota(val);
                        }}
                        className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Days / Event</span>
                        <span className="text-xs text-[var(--text-muted)] font-medium">
                          • 26 Weeks Statutory Standard
                        </span>
                      </div>
                    </div>

                    {/* Paternity Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-[var(--text-primary)] text-xs">Paternity Leave Allowance</div>
                      <div className="text-[11px] text-[var(--text-muted)]">Granted to eligible fathers around childbirth / adoption</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={60}
                        step={1}
                        value={paternityLeaveQuota}
                        onKeyDown={blockDecimalPointKeys}
                        onChange={(e) => {
                          const val = toWholeDays(e.target.value, 60);
                          if (val === null) return;
                          setPaternityLeaveQuota(val);
                        }}
                        className="w-24 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--text-secondary)] font-medium">Days / Event</span>
                        <span className="text-xs text-[var(--text-muted)] font-medium">
                          • Statutory Allowance
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </SettingsCard>

              {/* CARD 2: Approval Hierarchy & Carry Forward Rules */}
              <SettingsCard className={` p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="border-b border-[var(--border-color)] pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>
                    Leave Approval Workflow & Balance Rules
                  </h4>
                  <p className={ATT_SECTION_SUB}>
                    Approval routing, carry-forward limits, comp-off, and notice-period restrictions.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                  <div className="md:col-span-4 text-[var(--text-muted)] font-medium">
                    Leave Approval Hierarchy
                  </div>
                  <div className="md:col-span-8 max-w-md">
                    <select
                      value={leaveApprovalWorkflow}
                      onChange={(e) => setLeaveApprovalWorkflow(e.target.value as any)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer"
                    >
                      <option value="manager_then_hr">Reporting Manager → HR Manager</option>
                      <option value="manager_only">Reporting Manager Only</option>
                      <option value="hr_only">HR Manager Direct Approval</option>
                    </select>
                  </div>


                  <SettingsSwitchRow className="md:col-span-12" title={"Compensatory time off"} checked={enableCompOff} onChange={setEnableCompOff} />


                  <SettingsSwitchRow className="md:col-span-12" title={"Allow negative leave balance"} checked={allowNegativeBalance} onChange={setAllowNegativeBalance} />


                  <SettingsSwitchRow className="md:col-span-12" title={"Restrict leave during notice"} checked={restrictDuringNotice} onChange={setRestrictDuringNotice} />
                </div>
              </SettingsCard>

              {/* CARD 3: Probation Period & Intern Restrictions */}
              <SettingsCard className={` p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="border-b border-[var(--border-color)] pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>
                    Probation Period Settings & Paid Leave Lock
                  </h4>
                  <p className={ATT_SECTION_SUB}>
                    Track probation for new hires and restrict paid leave until confirmation.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">

                  <SettingsSwitchRow className="md:col-span-12" title={"Employee probation"} checked={enableProbation} onChange={setEnableProbation} />

                  {enableProbation && (
                    <>
                      <div className="md:col-span-4 text-[var(--text-muted)] font-medium">
                        Standard Duration
                      </div>
                      <div className="md:col-span-8 max-w-md">
                        <select
                          value={probationDurationMonths}
                          onChange={(e) => setProbationDurationMonths(Number(e.target.value))}
                          className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] outline-none focus:border-blue-600 cursor-pointer"
                        >
                          <option value={1}>1 Month (30 Days)</option>
                          <option value={2}>2 Months (60 Days)</option>
                          <option value={3}>3 Months (90 Days Standard)</option>
                          <option value={6}>6 Months (180 Days)</option>
                          <option value={12}>12 Months (1 Year)</option>
                        </select>
                      </div>

                      <div className="md:col-span-4 text-[var(--text-muted)] font-medium">
                        Paid Leave Quota Restriction
                      </div>
                      <div className="md:col-span-8 text-[var(--text-primary)] font-semibold flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          0 Paid Leaves Allowed • Absences logged as Loss of Pay (LOP / Unpaid)
                        </span>
                      </div>

                      <div className="md:col-span-4 text-[var(--text-muted)] font-medium">
                        Auto-Confirm Probation
                      </div>
                      <SettingsSwitchRow title={"Automatically confirm probation"} checked={autoConfirmProbation} onChange={setAutoConfirmProbation} />
                    </>
                  )}
                </div>
              </SettingsCard>

              {/* CARD 4: Role-Based Leave Quotas */}
              <SettingsCard className={` p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>Role-based annual leave quotas</h4>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Custom annual allowances override the company default. Monthly grant still uses 1/12 of these values.
                  </span>
                </div>

                <div className={ATT_TABLE_SHELL}>
                  <ResponsiveTable className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)]">
                        <th className="py-3 px-4 font-bold text-[var(--text-secondary)]">Role</th>
                        <th className="py-3 px-3 font-bold text-[var(--text-secondary)] text-center">
                          Casual Leave (CL) (Days/Yr)
                        </th>
                        <th className="py-3 px-3 font-bold text-[var(--text-secondary)] text-center">
                          Sick Leave (SL) (Days/Yr)
                        </th>
                        <th className="py-3 px-3 font-bold text-[var(--text-secondary)] text-center">
                          Earned Leave (EL) (Days/Yr)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {[
                        { key: 'admin', label: 'Admin / Executive' },
                        { key: 'hr_manager', label: 'HR Manager' },
                        { key: 'manager', label: 'Manager' },
                        { key: 'team_lead', label: 'Team Lead' },
                        { key: 'employee', label: 'Employee / Full-Time' },
                        { key: 'contractor', label: 'Contractor' },
                        { key: 'intern', label: 'Intern' },
                      ].map((r) => {
                        const quotas = roleLeaveQuotas[r.key] || { casualLeave: 12, sickLeave: 10, earnedLeave: 15 };
                        return (
                          <tr key={r.key} className="hover:bg-[var(--bg-surface-subtle)]/50 transition-colors">
                            <td className="py-2.5 px-4 font-bold text-[var(--text-primary)] whitespace-nowrap">
                              {r.label}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={60}
                                step={1}
                                value={quotas.casualLeave}
                                onKeyDown={blockDecimalPointKeys}
                                onChange={(e) => {
                                  const val = toWholeDays(e.target.value, 60);
                                  if (val === null) return;
                                  handleUpdateRoleLeaveQuota(r.key, 'casualLeave', val);
                                }}
                                className="w-20 text-center py-1.5 px-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 font-mono"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={60}
                                step={1}
                                value={quotas.sickLeave}
                                onKeyDown={blockDecimalPointKeys}
                                onChange={(e) => {
                                  const val = toWholeDays(e.target.value, 60);
                                  if (val === null) return;
                                  handleUpdateRoleLeaveQuota(r.key, 'sickLeave', val);
                                }}
                                className="w-20 text-center py-1.5 px-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 font-mono"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={60}
                                step={1}
                                value={quotas.earnedLeave}
                                onKeyDown={blockDecimalPointKeys}
                                onChange={(e) => {
                                  const val = toWholeDays(e.target.value, 60);
                                  if (val === null) return;
                                  handleUpdateRoleLeaveQuota(r.key, 'earnedLeave', val);
                                }}
                                className="w-20 text-center py-1.5 px-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-xs font-bold text-[var(--text-primary)] outline-none focus:border-blue-600 font-mono"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </ResponsiveTable>
                </div>
              </SettingsCard>
            </div>
          )}

          {subTab === 'holidays' && (
            <HolidayCalendarView
              holidays={state.customOptions?.holidays}
              isHR
              onUpdateHolidays={persistHolidays}
            />
          )}

      </div>

      {/* CREATE WORK SHIFT MODAL */}
      {showAddShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)] shadow-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-[var(--text-primary)]">
            {/* Modal Header */}
            <div className="p-5 px-6 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Create New Work Shift</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Configure working hours, grace buffer, and roster schedule.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddShiftModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-sm font-bold p-1 cursor-pointer rounded-lg hover:bg-[var(--bg-surface-subtle)] transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleCreateShift} className="flex flex-col">
              <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                    Shift Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Afternoon Shift, Night Roster, Flexible Shift"
                    value={newShiftName}
                    onChange={(e) => setNewShiftName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-slate-400 font-medium outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      Start Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={to24HourTime(newShiftStart)}
                      onChange={(e) => setNewShiftStart(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-primary)] font-medium outline-none focus:border-blue-600 transition-all cursor-pointer"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      End Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={to24HourTime(newShiftEnd)}
                      onChange={(e) => setNewShiftEnd(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-primary)] font-medium outline-none focus:border-blue-600 transition-all cursor-pointer"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                    Grace Buffer (Minutes)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={newShiftGrace}
                    onChange={(e) => setNewShiftGrace(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-primary)] font-medium outline-none focus:border-blue-600 transition-all"
                  />
                </div>

                {/* Working Days Selector */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                    Shift Working Days
                  </label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEK_DAYS.map((d) => {
                      const isSelected = newShiftDays.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              if (newShiftDays.length > 1) {
                                setNewShiftDays(newShiftDays.filter((k) => k !== d.key));
                              }
                            } else {
                              setNewShiftDays(WEEK_DAYS.filter((k) => newShiftDays.includes(k.key) || k.key === d.key).map((k) => k.key));
                            }
                          }}
                          className={`py-2 text-center rounded-lg border font-semibold text-xs transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-color)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)]'
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 px-6 border-t border-[var(--border-color)] bg-[var(--bg-surface-subtle)] flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddShiftModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-xs font-semibold text-[var(--text-secondary)] cursor-pointer transition-colors shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs transition-all active:scale-98"
                >
                  Create Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE ACADEMIC BATCH MODAL */}
      {showAddBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-[var(--bg-surface)] rounded-xl border border-[var(--border-color)] shadow-lg overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-[var(--text-primary)]">
            {/* Modal Header */}
            <div className="p-5 px-6 border-b border-[var(--border-color)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">Add Academic Batch</h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">Configure class timing, dismissal, and active class schedule.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBatchModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-sm font-bold p-1 cursor-pointer rounded-lg hover:bg-[var(--bg-surface-subtle)] transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleCreateBatch} className="flex flex-col">
              <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      Grade Level <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Grade 12"
                      value={newBatchGrade}
                      onChange={(e) => setNewBatchGrade(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-slate-400 font-medium outline-none focus:border-blue-600 transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      Section <span className="text-[var(--text-muted)] font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. A (Optional)"
                      value={newBatchSection}
                      onChange={(e) => setNewBatchSection(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-primary)] placeholder-slate-400 font-medium outline-none focus:border-blue-600 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      Morning Entry Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={newBatchStart}
                      onChange={(e) => setNewBatchStart(e.target.value)}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-primary)] font-medium outline-none focus:border-blue-600 transition-all cursor-pointer"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                      Dismissal Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={newBatchEnd}
                      onChange={(e) => setNewBatchEnd(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-primary)] font-medium outline-none focus:border-blue-600 transition-all cursor-pointer"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                    Late Buffer (Minutes)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={newBatchGrace}
                    onChange={(e) => setNewBatchGrace(Number(e.target.value))}
                    className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] px-3.5 py-2 text-xs text-[var(--text-primary)] font-medium outline-none focus:border-blue-600 transition-all"
                  />
                </div>

                {/* Class Working Days Selector */}
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
                    Class Working Days
                  </label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEK_DAYS.map((d) => {
                      const isSelected = newBatchDays.includes(d.key);
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              if (newBatchDays.length > 1) {
                                setNewBatchDays(newBatchDays.filter((k) => k !== d.key));
                              }
                            } else {
                              setNewBatchDays(WEEK_DAYS.filter((k) => newBatchDays.includes(k.key) || k.key === d.key).map((k) => k.key));
                            }
                          }}
                          className={`py-2 text-center rounded-lg border font-semibold text-xs transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border-color)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)]'
                          }`}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 px-6 border-t border-[var(--border-color)] bg-[var(--bg-surface-subtle)] flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddBatchModal(false)}
                  className="px-4 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-xs font-semibold text-[var(--text-secondary)] cursor-pointer transition-colors shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer shadow-xs transition-all active:scale-98"
                >
                  Add Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Add Office Location Modal */}
      <AddOfficeModal
        isOpen={showAddOffice || !!editingOffice}
        onClose={() => {
          setShowAddOffice(false);
          setEditingOffice(null);
        }}
        onSave={handleSaveOfficeModal}
        initialData={editingOffice}
      />
    </div>
  );
};

