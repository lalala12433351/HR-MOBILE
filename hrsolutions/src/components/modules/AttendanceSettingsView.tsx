'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { DEFAULT_GEO_COORDINATES } from '@/config/constants';
import { isInstitutionMode } from '@/utils/organizationMode';
import { Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { AppState } from '../../services/store';
import { WorkShift } from '../../types';
import { api } from '../../services/apiClient';
import { AddOfficeModal, OfficeModalData } from '../common/AddOfficeModal';
import {
  ATT_BTN_PRIMARY,
  ATT_CARD,
  ATT_SECTION_SUB,
  ATT_SECTION_TITLE,
  ATT_SUBNAV_ACTIVE,
  ATT_SUBNAV_BASE,
  ATT_SUBNAV_IDLE,
  ATT_TABLE_SHELL,
} from './attendance/attendanceUi';

interface AttendanceSettingsViewProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
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

// Reusable Sleek Toggle Switch Component
const ToggleSwitch: React.FC<{
  checked: boolean;
  onChange: (val: boolean) => void;
  id?: string;
}> = ({ checked, onChange, id }) => {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-[background-color] duration-150 ease-out outline-none active:scale-[0.96] ${
        checked ? 'bg-blue-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-[160ms] ease-out mt-0.5 ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
};

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

export const AttendanceSettingsView: React.FC<AttendanceSettingsViewProps> = ({
  state,
  onUpdateState,
}) => {
  const options = state.customOptions;
  const initialAtt = options.attendanceSettings;
  const initialPolicies = options.attendancePolicies;
  const initialLeaves = options.leaveSettings;

  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);

  // Sub-Navigation Tab State
  const [subTab, setSubTab] = useState<'general' | 'students' | 'policy' | 'office_location' | 'leaves' | 'reports'>('general');

  useEffect(() => {
    if (!isInstitution && subTab === 'students') {
      setSubTab('general');
    }
  }, [isInstitution, subTab]);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [leaveQuotaPeriod, setLeaveQuotaPeriod] = useState<'annual' | 'monthly'>(initialLeaves?.accrualFrequency || 'monthly');

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
      const isDefaulter = total > 0 && rate < studentMinAttendanceThreshold;
      return {
        student: stud,
        totalDays: total,
        attendedDays: attended,
        absentDays: absentCount,
        rate,
        isDefaulter,
      };
    });
  }, [state.students, state.attendance, studentMinAttendanceThreshold]);

  const activeDefaulters = useMemo(() => studentDefaulters.filter((d) => d.isDefaulter), [studentDefaulters]);

  const handleAlertGuardian = (studentName: string, guardianName?: string, phone?: string) => {
    onUpdateState((prev) => ({
      ...prev,
      notifications: [
        {
          id: `notif_${Date.now()}`,
          title: `Guardian Alert Sent: ${studentName}`,
          message: `Notice dispatched to ${guardianName || 'Parent'} (${phone || 'Contact'}) regarding attendance rate below ${studentMinAttendanceThreshold}%.`,
          timestamp: 'Just now',
          category: 'Attendance' as const,
          priority: 'high' as const,
          read: false,
          linkModule: 'students',
        },
        ...prev.notifications,
      ],
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: prev.currentPersona.name,
          action: 'DISPATCHED_GUARDIAN_ATTENDANCE_WARNING',
          entity: 'StudentAttendancePolicy',
          entityId: studentName,
          ipAddress: '106.51.72.18',
          details: `Sent low attendance alert (< ${studentMinAttendanceThreshold}%) to ${guardianName || 'Guardian'} for ${studentName}`,
        },
        ...prev.auditLogs,
      ],
    }));
    showToast(`Alert dispatched to ${guardianName || 'Parent'} (${studentName})`);
  };

  const handleAlertAllDefaulters = () => {
    if (activeDefaulters.length === 0) {
      showToast('No students currently below the minimum threshold.');
      return;
    }
    onUpdateState((prev) => ({
      ...prev,
      notifications: [
        {
          id: `notif_${Date.now()}`,
          title: `Bulk Guardian Alerts Sent (${activeDefaulters.length} Students)`,
          message: `Automated attendance warning notifications dispatched to guardians of ${activeDefaulters.length} students below ${studentMinAttendanceThreshold}%.`,
          timestamp: 'Just now',
          category: 'Attendance' as const,
          priority: 'high' as const,
          read: false,
          linkModule: 'students',
        },
        ...prev.notifications,
      ],
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: prev.currentPersona.name,
          action: 'BULK_GUARDIAN_ATTENDANCE_ALERT',
          entity: 'StudentAttendancePolicy',
          entityId: 'BULK_DEFAULTERS',
          ipAddress: '106.51.72.18',
          details: `Sent bulk attendance warning notices to guardians of ${activeDefaulters.length} students below ${studentMinAttendanceThreshold}% threshold`,
        },
        ...prev.auditLogs,
      ],
    }));
    showToast(`Dispatched alerts to all ${activeDefaulters.length} student guardians`);
  };

  // General Form States
  const [hoursCalcMethod, setHoursCalcMethod] = useState(
    initialAtt?.hoursCalculationMethod || 'every_punch'
  );
  const [startDate, setStartDate] = useState(() => initialAtt?.startDate || new Date().toISOString().substring(0, 10));
  const [approvalCycle, setApprovalCycle] = useState<'Monthly' | 'Bi-Weekly' | 'Weekly'>(
    initialAtt?.approvalCycle || 'Monthly'
  );
  const [repeatOn, setRepeatOn] = useState(
    initialAtt?.repeatOn || 'Monthly on Day 11'
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
        const nextSchedule: Record<string, string> = {};
        Object.entries(schedule).forEach(([day, shiftId]) => {
          if (shiftId === 'OFF') {
            nextSchedule[day] = 'OFF';
          } else {
            const curIdx = shiftIds.indexOf(shiftId);
            const nextIdx = (curIdx + 1) % shiftIds.length;
            nextSchedule[day] = shiftIds[nextIdx];
          }
        });
        next[empId] = nextSchedule;
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
    initialAtt?.gracePeriodMinutes || initialPolicies?.lateThresholdMinutes || 15
  );
  const [halfDayHours, setHalfDayHours] = useState(
    initialAtt?.halfDayThresholdHours || 4.5
  );
  const [fullDayHours, setFullDayHours] = useState(
    initialAtt?.fullDayMinimumHours || 8.0
  );
  const [autoClockOut, setAutoClockOut] = useState(
    initialAtt?.autoClockOutEnabled ?? true
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
    initialAtt?.allowedIpAddresses || '192.168.1.0/24, 106.51.72.18'
  );
  const [regularizationDaysWindow, setRegularizationDaysWindow] = useState(11);
  const [requireManagerRegularizationApproval, setRequireManagerRegularizationApproval] = useState(true);

  // Leave Settings
  const [paidLeaveQuota, setPaidLeaveQuota] = useState(initialLeaves?.paidLeaveQuota || 18);
  const [casualLeaveQuota, setCasualLeaveQuota] = useState(initialLeaves?.casualLeaveQuota || 12);
  const [sickLeaveQuota, setSickLeaveQuota] = useState(initialLeaves?.sickLeaveQuota || 10);
  const [maternityLeaveQuota, setMaternityLeaveQuota] = useState(initialLeaves?.maternityLeaveQuota || 90);
  const [paternityLeaveQuota, setPaternityLeaveQuota] = useState(initialLeaves?.paternityLeaveQuota || 15);
  const [enableCompOff, setEnableCompOff] = useState(initialLeaves?.enableCompOff ?? true);
  const [maxConsecutiveWithoutDoc, setMaxConsecutiveWithoutDoc] = useState(initialLeaves?.maxConsecutiveDaysWithoutDoc || 3);
  const [maxCarryForward, setMaxCarryForward] = useState(initialLeaves?.maxCarryForwardDays || 10);
  const [accrualFrequency, setAccrualFrequency] = useState<'annual' | 'monthly'>(initialLeaves?.accrualFrequency || 'monthly');
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
          clockingDevices: 'Desktop, Mobile',
          qrCodeEnabled: true,
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
      gracePeriodMinutes: Number(newShiftGrace) || 15,
      workingDays: newShiftDays,
    };

    setShifts([...shifts, newS]);
    setSelectedShiftId(newS.id);
    setWorkStartTime(newS.startTime);
    setWorkEndTime(newS.endTime);
    setGracePeriod(newS.gracePeriodMinutes || 15);
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
        graceMinutes: Number(newBatchGrace) || 15,
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
      setGracePeriod(savedBatch.graceMinutes || 15);
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
    const updatedShifts = shifts.map((s) =>
      s.id === selectedShiftId
        ? {
            ...s,
            startTime: workStartTime || '09:00 AM',
            endTime: workEndTime || '06:00 PM',
            gracePeriodMinutes: Number(gracePeriod) || 15,
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
            graceMinutes: Number(gracePeriod) || 15,
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
        lateThresholdMinutes: Number(gracePeriod) || 15,
        geofenceRadiusMeters: Math.min(MAX_GEOFENCE_LIMIT, Math.max(MIN_GEOFENCE_LIMIT, Number(geofenceRadius) || 150)),
      },
      attendanceSettings: {
        isConfigured: true,
        hoursCalculationMethod: hoursCalcMethod,
        startDate,
        approvalCycle,
        repeatOn,
        locationScope,
        attendanceCycle,
        workDayStartTime: workStartTime,
        workDayEndTime: workEndTime,
        gracePeriodMinutes: Number(gracePeriod) || 15,
        halfDayThresholdHours: Number(halfDayHours) || 4.5,
        fullDayMinimumHours: Number(fullDayHours) || 8.0,
        autoClockOutEnabled: autoClockOut,
        autoClockOutHours: 12,
        geofenceRadiusMeters: Math.min(MAX_GEOFENCE_LIMIT, Math.max(MIN_GEOFENCE_LIMIT, Number(geofenceRadius) || 150)),
        requireSelfieCheckIn,
        requireSelfieCheckOut,
        requireLocationGPS: requireGPS,
        geofenceEnabled: requireGPS,
        allowQrCodeAttendance: true,
        qrRefreshIntervalSeconds: 30,
        allowedIpAddresses: allowedIps,
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
        accrualFrequency: leaveQuotaPeriod,
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

    try {
      await api.setup.saveAttendanceSettings(attendancePayload);
    } catch (e: any) {
      console.error('Failed to persist attendance settings', e);
      showToast(e?.message || 'Failed to save attendance settings');
      return;
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
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Sticky page header + sub-nav */}
      <div className="sticky top-0 z-30 -mx-1 px-1 pt-0.5 pb-4 space-y-4 bg-[var(--bg-app)] border-b border-slate-200/70 shadow-[0_8px_16px_-12px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className={`${ATT_SECTION_TITLE} text-xl`}>
              Attendance & Work Schedules
            </h2>
            <p className={ATT_SECTION_SUB}>
              {isInstitution
                ? 'Configure batch timings, classroom shifts, campus geofences, and student attendance policies'
                : 'Configure work shifts, weekly office schedules, GPS geofences, and overtime policies'}
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveAllSettings}
            className={`${ATT_BTN_PRIMARY} w-full sm:w-auto shrink-0`}
          >
            Save Changes
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 w-full">
          {[
            { id: 'general', label: isInstitution ? 'Batches & Schedules' : 'Shifts & Schedules' },
            ...(isInstitution ? [{ id: 'students', label: 'Student Policies & Warnings' }] : []),
            { id: 'policy', label: 'Policy & GPS Geofencing' },
            { id: 'office_location', label: isInstitution ? 'Campus Locations' : 'Offices & Locations' },
            { id: 'leaves', label: 'Leave Policies & Quotas' },
            { id: 'reports', label: 'Report Customization' },
          ].map((item) => {
            const isSelected = subTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSubTab(item.id as any)}
                className={`${ATT_SUBNAV_BASE} ${isSelected ? ATT_SUBNAV_ACTIVE : ATT_SUBNAV_IDLE}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="w-full space-y-6">
          {/* ========================================================================= */}
          {/* 1. GENERAL TAB (Shifts / Batches & Working Days)                          */}
          {/* ========================================================================= */}
          {subTab === 'general' && (
            <div className={`${ATT_CARD} p-5 sm:p-7 space-y-6`}>
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
                <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      Choose Batch to Configure
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddBatchModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                    >
                      New Batch
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {academicBatches.length === 0 ? (
                      <div className="text-xs text-slate-500 py-1 font-medium">
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
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                            onClick={() => handleSelectBatch(b.id)}
                          >
                            <span>{b.grade} {b.section ? `- ${b.section}` : ''}</span>
                            <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
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
                                  isSelected ? 'text-blue-200 hover:text-white' : 'text-slate-400 hover:text-red-600'
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
                /* Corporate Shifts Switcher */
                <div className="space-y-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">
                      Choose Work Shift
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddShiftModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all cursor-pointer shadow-xs"
                    >
                      New Shift
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {shifts.map((s) => {
                      const isSelected = s.id === selectedShiftId;
                      return (
                        <div
                          key={s.id}
                          className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                          onClick={() => handleSelectShift(s.id)}
                        >
                          <span>{s.name}</span>
                          {s.isHourlyShift && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'}`}>
                              HOURLY
                            </span>
                          )}
                          <span className={`text-[10px] font-mono ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                            ({s.startTime} - {s.endTime})
                          </span>
                          {shifts.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteShift(s.id);
                              }}
                              className={`p-0.5 text-xs font-bold transition-colors cursor-pointer ${
                                isSelected ? 'text-blue-200 hover:text-white' : 'text-slate-400 hover:text-red-600'
                              }`}
                              title="Delete shift"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION: TIMINGS & SCHEDULE RULES */}
              <div className="space-y-4 pt-1">
                {/* Attendance Evaluation Cycle */}
                <div className="p-4 rounded-lg border border-slate-200 bg-white space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Attendance Evaluation & Reconciliation Cycle
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Configure monthly reconciliation vs annual cumulative hours tracking
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-600 inline-block" />
                      <span className="text-xs font-bold text-slate-900 capitalize">
                        {attendanceCycle} Tracking
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setAttendanceCycle('monthly')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        attendanceCycle === 'monthly'
                          ? 'border-blue-600 bg-blue-50/50 text-blue-950 font-semibold ring-1 ring-blue-600/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">Monthly Attendance Cycle (Standard)</span>
                        {attendanceCycle === 'monthly' && (
                          <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Reviews punches, deductions, late arrivals, and hour targets on a 1st calendar month cycle.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAttendanceCycle('yearly')}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        attendanceCycle === 'yearly'
                          ? 'border-blue-600 bg-blue-50/50 text-blue-950 font-semibold ring-1 ring-blue-600/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">Yearly Attendance Cycle (Optional)</span>
                        {attendanceCycle === 'yearly' && (
                          <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Accumulates cumulative hours and attendance statistics continuously across the entire financial year.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Live Computed Schedule Target Banner */}
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 text-xs">
                  <div>
                    <span className="font-semibold text-slate-900 block">Weekly Work Target</span>
                    <span className="text-[11px] text-slate-500">{currentDailyShiftHours} hrs/day × {selectedDays.length} days</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 font-mono">{currentWeeklyWorkHours} Hours</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      {isInstitution ? 'Morning Bell / Start Time' : 'Shift Start Time'}
                    </label>
                    <input
                      type="time"
                      value={to24HourTime(workStartTime)}
                      onChange={(e) => setWorkStartTime(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      {isInstitution ? 'Dismissal / End Time' : 'Shift End Time'}
                    </label>
                    <input
                      type="time"
                      value={to24HourTime(workEndTime)}
                      onChange={(e) => setWorkEndTime(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Grace Buffer Period</label>
                    <div className="relative">
                      <select
                        value={gracePeriod}
                        onChange={(e) => setGracePeriod(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer pr-8"
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
                <div className="space-y-3 p-4 rounded-lg border border-slate-200 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Weekly Working Days</span>
                      <span className="text-[11px] text-slate-500">
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
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer transition-colors"
                      >
                        Mon – Fri (5 Days)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDays(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
                          setEnableAlternateSaturdays(false);
                        }}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer transition-colors"
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
                            ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
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
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer transition-colors"
                      >
                        All 7 Days
                      </button>
                    </div>
                  </div>

                  {/* 7 Interactive Day Buttons */}
                  <div className="grid grid-cols-7 gap-1.5 sm:gap-2 pt-1">
                    {WEEK_DAYS.map((d) => {
                      const isSelected = selectedDays.includes(d.key);
                      const isAltSaturday = d.key === 'Saturday' && enableAlternateSaturdays;
                      return (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => toggleDay(d.key)}
                          className={`py-2.5 px-1 rounded-lg border text-center text-xs transition-all cursor-pointer active:scale-98 ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white font-bold'
                              : isAltSaturday
                              ? 'border-blue-300 bg-blue-50 text-blue-900 font-semibold'
                              : 'border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:border-slate-300 font-medium'
                          }`}
                        >
                          <span className="block text-xs sm:text-sm">{d.short}</span>
                          <span
                            className={`hidden sm:block text-[10px] mt-0.5 ${
                              isSelected ? 'text-blue-100 font-normal' : isAltSaturday ? 'text-blue-700 font-bold' : 'text-slate-400'
                            }`}
                          >
                            {isSelected ? 'Open' : isAltSaturday ? 'Alt. Open' : 'Off'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                    <span>
                      Active: <strong className="text-slate-900 font-bold">{selectedDays.length} Days</strong> ({selectedDays.map((d) => d.slice(0, 3)).join(', ')})
                      {enableAlternateSaturdays && (
                        <span className="ml-1 text-slate-700 font-semibold">+ Alternate Saturdays ({alternateSaturdaysPolicy === '2nd_4th_off' ? '2nd & 4th Off' : alternateSaturdaysPolicy === '1st_3rd_off' ? '1st & 3rd Off' : 'Fortnightly'})</span>
                      )}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {enableAlternateSaturdays ? 'Alternate Weekend Policy' : 7 - selectedDays.length > 0 ? `${7 - selectedDays.length} Off Days` : 'No Off Days'}
                    </span>
                  </div>

                  {/* Alternate Saturdays Schedule Card */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">Alternate Saturdays Schedule</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            enableAlternateSaturdays
                              ? 'bg-blue-100 text-blue-700 border border-blue-200'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {enableAlternateSaturdays ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Allow Saturdays to alternate between active working shifts and scheduled weekly offs.
                        </p>
                      </div>
                      <ToggleSwitch checked={enableAlternateSaturdays} onChange={setEnableAlternateSaturdays} />
                    </div>

                    {enableAlternateSaturdays && (
                      <div className="pt-2.5 border-t border-slate-200 space-y-2.5 animate-in fade-in">
                        <label className="text-[11px] font-bold text-slate-700 block">Select Alternate Saturday Rule</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                          <button
                            type="button"
                            onClick={() => setAlternateSaturdaysPolicy('2nd_4th_off')}
                            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                              alternateSaturdaysPolicy === '2nd_4th_off'
                                ? 'border-blue-600 bg-white text-blue-900 font-bold ring-1 ring-blue-600/30'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="font-bold">2nd & 4th Off</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">1st, 3rd, 5th Saturdays are Working</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAlternateSaturdaysPolicy('1st_3rd_off')}
                            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                              alternateSaturdaysPolicy === '1st_3rd_off'
                                ? 'border-blue-600 bg-white text-blue-900 font-bold ring-1 ring-blue-600/30'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="font-bold">1st & 3rd Off</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">2nd & 4th Saturdays are Working</div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setAlternateSaturdaysPolicy('alternate')}
                            className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                              alternateSaturdaysPolicy === 'alternate'
                                ? 'border-blue-600 bg-white text-blue-900 font-bold ring-1 ring-blue-600/30'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="font-bold">Every Other Saturday</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">Alternates fortnightly</div>
                          </button>
                        </div>

                        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-800">
                          Working Saturdays will be automatically factored into shift target calculations and punch logs.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Working Hourly Shift & Hours Tracking Card */}
                  <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">Working Hourly Shift & Hours Tracking</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            enableHourlyShiftPolicy
                              ? 'bg-blue-100 text-blue-700 border border-blue-200'
                              : 'bg-slate-200 text-slate-600'
                          }`}>
                            {enableHourlyShiftPolicy ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Automatically transition employees on hourly wages to the Hourly / Flexible Shift and track their exact hours worked.
                        </p>
                      </div>
                      <ToggleSwitch checked={enableHourlyShiftPolicy} onChange={setEnableHourlyShiftPolicy} />
                    </div>

                    {enableHourlyShiftPolicy && (
                      <div className="pt-2.5 border-t border-slate-200 space-y-2 animate-in fade-in">
                        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-900">
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
                    <label className="text-xs font-semibold text-slate-700">Half-Day Minimum (Hours)</label>
                    <select
                      value={halfDayHours}
                      onChange={(e) => setHalfDayHours(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer"
                    >
                      <option value={3.5}>3.5 Hours</option>
                      <option value={4.0}>4.0 Hours</option>
                      <option value={4.5}>4.5 Hours (Standard)</option>
                      <option value={5.0}>5.0 Hours</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">Full-Day Minimum (Hours)</label>
                    <select
                      value={fullDayHours}
                      onChange={(e) => setFullDayHours(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer"
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
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div className="space-y-0.5 pr-4">
                    <p className="text-xs font-bold text-slate-900">Auto Clock-Out at Midnight</p>
                    <p className="text-[11px] text-slate-500">
                      Automatically logs out unclosed shifts at 11:59 PM to prevent open-ended records.
                    </p>
                  </div>
                  <ToggleSwitch checked={autoClockOut} onChange={setAutoClockOut} />
                </div>
              </div>

              {/* SECTION: SHIFT ASSIGNMENT & MEMBER ALLOCATION */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Employee Shift Assignment & Member Roster
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Assign specific employees and teams to work shifts. Currently configuring: <strong className="text-slate-800 font-bold">{shifts.find((s) => s.id === selectedShiftId)?.name || 'Selected Shift'}</strong>
                    </p>
                  </div>

                  {/* Quick Assign Department to this shift */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleAssignDepartmentToCurrentShift('All')}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer transition-all shadow-xs"
                    >
                      Assign All to this Shift
                    </button>
                  </div>
                </div>

                {/* Assigned Members Summary & Filter Bar */}
                <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-3.5">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="text-xs font-semibold text-slate-700">
                        {Object.values(employeeShifts).filter((sId) => sId === selectedShiftId).length} Employees on this Shift
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="text"
                        placeholder="Search employee..."
                        value={shiftRosterSearch}
                        onChange={(e) => setShiftRosterSearch(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 outline-none focus:border-blue-600 w-full sm:w-44 font-medium shadow-xs"
                      />
                      <select
                        value={shiftRosterDeptFilter}
                        onChange={(e) => setShiftRosterDeptFilter(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 outline-none focus:border-blue-600 font-medium cursor-pointer shadow-xs"
                      >
                        <option value="All">All Departments</option>
                        {(Array.from(new Set((state.employees || []).map((e: any) => e.department).filter(Boolean))) as string[]).map((dept) => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Interactive Employee Roster List */}
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                    {(state.employees || [])
                      .filter((emp) => {
                        const q = shiftRosterSearch.toLowerCase().trim();
                        const matchesSearch = !q || emp.name.toLowerCase().includes(q) || (emp.employeeId && emp.employeeId.toLowerCase().includes(q));
                        const matchesDept = shiftRosterDeptFilter === 'All' || emp.department === shiftRosterDeptFilter;
                        return matchesSearch && matchesDept;
                      })
                      .map((emp) => {
                        const currentAssignedShiftId = employeeShifts[emp.id] || emp.shiftTiming?.shiftId || shifts[0]?.id || 'sh-1';
                        const isCurrentShift = currentAssignedShiftId === selectedShiftId;
                        return (
                          <div
                            key={emp.id}
                            className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-3 text-xs ${
                              isCurrentShift
                                ? 'bg-white border-blue-200 shadow-xs'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {emp.name}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {emp.designation || 'Staff'} • <span className="text-slate-700 font-medium">{emp.department}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <select
                                value={currentAssignedShiftId}
                                onChange={(e) => handleAssignEmployeeShift(emp.id, e.target.value)}
                                className="px-2.5 py-1.5 rounded-2xl border border-slate-200/80 bg-white shadow-2xs text-xs font-bold text-slate-800 outline-none focus:border-blue-600 cursor-pointer "
                              >
                                {shifts.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name} ({s.startTime} - {s.endTime})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              {/* SECTION: ROSTER SHIFTS & ROTATIONAL SCHEDULING (OPTIONAL IN SETTINGS) */}
              <div className="pt-4 border-t border-slate-200 space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-white/80">
                  <div className="space-y-0.5 pr-4">
                    <div className="flex items-center gap-2">
                      
                      <h4 className="text-sm font-bold text-slate-900">
                        Roster Shifts & Rotational Scheduling
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                        Optional
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Enable dynamic rotational shift patterns (e.g., Morning, Evening, Night) and assign weekly staggered rosters.
                    </p>
                  </div>
                  <ToggleSwitch checked={enableRosterShifts} onChange={setEnableRosterShifts} />
                </div>

                {enableRosterShifts && (
                  <div className="p-4 rounded-lg border border-blue-200/80 bg-white space-y-4  animate-in fade-in">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">Weekly Employee Roster Allocation Matrix</span>
                        <span className="text-[11px] text-slate-500">Assign individual daily shifts or au weekly shift cycles</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 text-xs">
                          <span className="text-slate-500 text-[11px]">Rotation:</span>
                          <select
                            value={rosterRotationCycle}
                            onChange={(e) => setRosterRotationCycle(e.target.value as any)}
                            className="px-2.5 py-1 rounded-2xl border border-slate-200/80 bg-white shadow-2xs font-semibold text-slate-800 text-xs outline-none cursor-pointer"
                          >
                            <option value="weekly">Weekly Rotation (Mondays)</option>
                            <option value="biweekly">Bi-Weekly Rotation (14 Days)</option>
                            <option value="monthly">Monthly Rotation</option>
                            <option value="custom">Custom Allocation</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={handleAutoRotateRoster}
                          className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer  transition-colors"
                        >
                          Auto-Rotate Roster
                        </button>
                      </div>
                    </div>

                    {/* Roster Shift Legend */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-[11px] font-bold text-slate-400">Available Shifts:</span>
                      {shifts.map((s, idx) => {
                        const code = idx === 0 ? 'GEN' : idx === 1 ? 'M1' : idx === 2 ? 'E1' : 'N1';
                        return (
                          <span key={s.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] font-bold">
                            <span className="text-slate-900 font-extrabold">{code}</span> · {s.name} ({s.startTime} - {s.endTime})
                          </span>
                        );
                      })}
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-500 text-[11px] font-bold">
                        <span className="text-rose-600 font-extrabold">OFF</span> · Weekly Off Day
                      </span>
                    </div>

                    {/* Weekly Matrix Table */}
                    <div className="overflow-x-auto custom-scrollbar border border-slate-200 rounded-lg">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-white text-slate-600 font-semibold text-[11px]">
                            <th className="py-2.5 px-3 font-bold text-slate-900">Employee</th>
                            <th className="py-2.5 px-3">Dept</th>
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                              <th key={day} className="py-2.5 px-2 text-center">{day}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(state.employees || []).slice(0, 10).map((emp) => {
                            const empSchedule = employeeRosterMatrix[emp.id] || {};
                            return (
                              <tr key={emp.id} className="hover:bg-white/60">
                                <td className="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">
                                  {emp.name}
                                </td>
                                <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                                  {emp.department || 'General'}
                                </td>
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                                  const currentShiftId = empSchedule[day] || 'sh-1';
                                  const isOff = currentShiftId === 'OFF';
                                  const shiftObj = shifts.find((s) => s.id === currentShiftId);
                                  const shiftCode = isOff ? 'OFF' : shiftObj ? (shiftObj.name.includes('Morning') ? 'M1' : shiftObj.name.includes('Evening') ? 'E1' : shiftObj.name.includes('Night') ? 'N1' : 'GEN') : 'GEN';

                                  return (
                                    <td key={day} className="py-1.5 px-1 text-center">
                                      <select
                                        value={currentShiftId}
                                        onChange={(e) => handleUpdateRosterCell(emp.id, day, e.target.value)}
                                        className={`px-1.5 py-1 rounded text-[11px] font-bold border outline-none cursor-pointer text-center ${
                                          isOff
                                            ? 'bg-white text-slate-400 border-slate-200'
                                            : shiftCode === 'M1'
                                            ? 'bg-white text-amber-800 border-amber-300'
                                            : shiftCode === 'E1'
                                            ? 'bg-white text-purple-800 border-purple-300'
                                            : shiftCode === 'N1'
                                            ? 'bg-white text-indigo-800 border-indigo-300'
                                            : 'bg-white text-blue-800 border-blue-200'
                                        }`}
                                      >
                                        {shifts.map((s, idx) => {
                                          const code = idx === 0 ? 'GEN' : idx === 1 ? 'M1' : idx === 2 ? 'E1' : 'N1';
                                          return (
                                            <option key={s.id} value={s.id}>
                                              {code} ({s.startTime.split(' ')[0]})
                                            </option>
                                          );
                                        })}
                                        <option value="OFF">OFF (Weekly Off)</option>
                                      </select>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Attendance Calculation & General Scope */}
              <div className="pt-4 border-t border-slate-200 space-y-3.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Calculation & Approvals
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">Total Hours Calculation Method</label>
                    <select
                      value={hoursCalcMethod}
                      onChange={(e) => setHoursCalcMethod(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 cursor-pointer "
                    >
                      <option value="every_punch">Every Valid Check-in & Check-out</option>
                      <option value="first_last">First Check-in & Last Check-out</option>
                      <option value="strict_shift">Strict Shift Hours</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">Approval Cycle Type</label>
                    <select
                      value={approvalCycle}
                      onChange={(e) => setApprovalCycle(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 cursor-pointer "
                    >
                      <option value="Monthly">Monthly Cycle (Default)</option>
                      <option value="Bi-Weekly">Bi-Weekly Cycle</option>
                      <option value="Weekly">Weekly Cycle</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">Attendance Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 cursor-pointer "
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700">Default Office Scope</label>
                    <select
                      value={locationScope}
                      onChange={(e) => setLocationScope(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 cursor-pointer "
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
              <div className="flex items-center justify-end pt-5 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleSaveAllSettings}
                  className={ATT_BTN_PRIMARY}
                >
                  Save Work Schedule Rules
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. STUDENT ATTENDANCE & WARNING THRESHOLDS TAB                           */}
          {/* ========================================================================= */}
          {subTab === 'students' && (
            <div className="space-y-6 text-slate-900">
              {/* Header Card */}
              <div className={`${ATT_CARD} flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 sm:p-6`}>
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider mb-1 border border-blue-100">
                    Academic Regulations
                  </div>
                  <h3 className={`${ATT_SECTION_TITLE} text-lg`}>
                    Student Attendance Policy & Warning Thresholds
                  </h3>
                  <p className={ATT_SECTION_SUB}>
                    Enforce minimum mandatory attendance standards, automated guardian dispatch alerts, and live defaulter tracking
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleAlertAllDefaulters}
                    disabled={activeDefaulters.length === 0}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  >
                    <span>Notify All Defaulters ({activeDefaulters.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveAllSettings}
                    className={ATT_BTN_PRIMARY}
                  >
                    Save Student Policy
                  </button>
                </div>
              </div>

              {/* 4 Summary Stat KPI Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className={`${ATT_CARD} p-4`}>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Minimum Threshold</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-2xl font-bold text-blue-600 font-mono">{studentMinAttendanceThreshold}%</span>
                    <span className="text-xs text-slate-400 font-medium">Mandatory</span>
                  </div>
                </div>

                <div className={`${ATT_CARD} p-4`}>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Warning Flagging</span>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${enableLowAttendanceWarning ? 'bg-amber-500' : 'bg-slate-300'}`} />
                    <span className="text-xs font-bold text-slate-800">
                      {enableLowAttendanceWarning ? 'Active on Rosters' : 'Disabled'}
                    </span>
                  </div>
                </div>

                <div className={`${ATT_CARD} p-4`}>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Current Defaulters</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className={`text-2xl font-bold font-mono ${activeDefaulters.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {activeDefaulters.length}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">
                      / {studentDefaulters.length} Students
                    </span>
                  </div>
                </div>

                <div className={`${ATT_CARD} p-4`}>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Guardian Alerts</span>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${autoAlertGuardiansBelowThreshold ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className="text-xs font-bold text-slate-800">
                      {autoAlertGuardiansBelowThreshold ? 'SMS & Email Auto' : 'Manual Outreach'}
                    </span>
                  </div>
                </div>
              </div>

              {/* CARD 1: Configurable Minimum Attendance Threshold */}
              <div className={`${ATT_CARD} p-5 sm:p-6 space-y-4`}>
                <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
                  <label className="block text-xs font-semibold text-slate-700">
                    Attendance Cut-off Rate (%)
                  </label>
                  <select
                    value={studentMinAttendanceThreshold}
                    onChange={(e) => setStudentMinAttendanceThreshold(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 cursor-pointer transition-all"
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
              </div>

              {/* CARD 2: Automated Rules & Guardian Alerts */}
              <div className={`${ATT_CARD} p-5 sm:p-6 space-y-4`}>
                <div className="border-b border-slate-100 pb-3">
                  <h4 className={ATT_SECTION_TITLE}>
                    Warning Flags & Guardian Alert Automation
                  </h4>
                  <p className={ATT_SECTION_SUB}>
                    Configure automated notifications, roster warning chips, and consecutive absence triggers.
                  </p>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Toggle 1: Warning Badges */}
                  <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="space-y-0.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">Show Warning Badges on Rosters</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          enableLowAttendanceWarning ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {enableLowAttendanceWarning ? 'Enabled' : 'Off'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Displays an amber warning pill (&lt; {studentMinAttendanceThreshold}%) in the Student Directory, Attendance Table, and Profile dialogs.
                      </p>
                    </div>
                    <ToggleSwitch checked={enableLowAttendanceWarning} onChange={setEnableLowAttendanceWarning} />
                  </div>

                  {/* Toggle 2: Automated Guardian Alert */}
                  <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                    <div className="space-y-0.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">Auto-Notify Guardians upon Falling Below {studentMinAttendanceThreshold}%</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          autoAlertGuardiansBelowThreshold ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {autoAlertGuardiansBelowThreshold ? 'Automated' : 'Manual'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Dispatches SMS and Email notices directly to registered parent contacts when a student is recorded absent with attendance &lt; {studentMinAttendanceThreshold}%.
                      </p>
                    </div>
                    <ToggleSwitch checked={autoAlertGuardiansBelowThreshold} onChange={setAutoAlertGuardiansBelowThreshold} />
                  </div>

                  {/* Consecutive Absences Rule */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">Consecutive Absences Urgent Alert</label>
                      <select
                        value={consecutiveAbsenceAlertDays}
                        onChange={(e) => setConsecutiveAbsenceAlertDays(Number(e.target.value))}
                        className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 cursor-pointer"
                      >
                        <option value={2}>2 Consecutive Days Absent</option>
                        <option value={3}>3 Consecutive Days (Standard)</option>
                        <option value={5}>5 Consecutive Days (Critical Notice)</option>
                        <option value={7}>7 Consecutive Days (Disciplinary Review)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-700">Reconciliation Evaluation Window</label>
                      <select
                        defaultValue="monthly"
                        className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 cursor-pointer"
                      >
                        <option value="monthly">Monthly Academic Rollup</option>
                        <option value="term">Term / Semester Cumulative</option>
                        <option value="rolling">Rolling 30-Day Window</option>
                      </select>
                    </div>
                  </div>

                  {/* Customizable Guardian Notification Template */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                      <span>Guardian Alert SMS & Email Template</span>
                      <span className="text-[10px] font-normal text-slate-400">Tokens: &#123;student_name&#125;, &#123;attendance_pct&#125;, &#123;threshold&#125;</span>
                    </label>
                    <textarea
                      rows={3}
                      value={studentWarningMessage}
                      onChange={(e) => setStudentWarningMessage(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white p-3 text-xs text-slate-800 outline-none focus:border-blue-600 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* CARD 3: LIVE DEFAULTERS ROSTER PREVIEW */}
              <div className={`${ATT_CARD} overflow-hidden`}>
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className={ATT_SECTION_TITLE}>
                        Live Defaulters Roster Preview
                      </h4>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        activeDefaulters.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {activeDefaulters.length} Below {studentMinAttendanceThreshold}%
                      </span>
                    </div>
                    <p className={ATT_SECTION_SUB}>
                      Real-time calculation from active attendance logs against the configured {studentMinAttendanceThreshold}% threshold.
                    </p>
                  </div>

                  {activeDefaulters.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAlertAllDefaulters}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
                    >
                      <span>Dispatch Alert to All {activeDefaulters.length}</span>
                    </button>
                  )}
                </div>

                {activeDefaulters.length === 0 ? (
                  <div className="p-8 text-center space-y-2 bg-slate-50/50">
                    <h5 className="text-sm font-bold text-slate-800">Zero Attendance Defaulters</h5>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      All enrolled students currently meet or exceed the mandatory {studentMinAttendanceThreshold}% attendance requirement.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px] border-b border-slate-200 select-none">
                        <tr>
                          <th className="p-3.5 pl-5">Student</th>
                          <th className="p-3.5">Batch / Section</th>
                          <th className="p-3.5">Attendance Rate</th>
                          <th className="p-3.5">Attended / Total</th>
                          <th className="p-3.5">Absences</th>
                          <th className="p-3.5">Guardian Contact</th>
                          <th className="p-3.5 pr-5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {activeDefaulters.map(({ student, rate, totalDays, attendedDays, absentDays }) => (
                          <tr key={student.id} className="hover:bg-amber-50/30 transition-colors">
                            <td className="p-3.5 pl-5 whitespace-nowrap">
                              <div>
                                <div className="font-bold text-slate-900">{student.name}</div>
                                <div className="text-[10px] font-mono text-slate-400">Roll #{student.rollNumber} • {student.studentId}</div>
                              </div>
                            </td>

                            <td className="p-3.5 whitespace-nowrap">
                              <span className="font-semibold text-slate-800">{student.grade}</span>
                            </td>

                            <td className="p-3.5 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 font-mono">
                                <span>{rate}%</span>
                              </span>
                            </td>

                            <td className="p-3.5 font-mono text-slate-800 whitespace-nowrap">
                              {attendedDays} / {totalDays} Days
                            </td>

                            <td className="p-3.5 font-mono text-rose-600 font-bold whitespace-nowrap">
                              {absentDays} Absences
                            </td>

                            <td className="p-3.5 whitespace-nowrap">
                              <div className="text-slate-800 font-medium">{student.guardianName || '—'}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{student.guardianPhone || student.phone || '—'}</div>
                            </td>

                            <td className="p-3.5 pr-5 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleAlertGuardian(student.name, student.guardianName, student.guardianPhone || student.phone)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                              >
                                <span>Send Alert</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. POLICY TAB (GPS & Enforcements)                                        */}
          {/* ========================================================================= */}
          {subTab === 'policy' && (
            <div className="space-y-6">
              <div className={`${ATT_CARD} p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div>
                  <h3 className={ATT_SECTION_TITLE}>
                    Attendance Policy & GPS Geofencing
                  </h3>
                  <p className={ATT_SECTION_SUB}>
                    Configure GPS geofence radius, punch verification rules, and attendance regularization limits
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveAllSettings}
                  className={`${ATT_BTN_PRIMARY} shrink-0`}
                >
                  Save Policy
                </button>
              </div>

              {/* CARD 1: GPS Geofencing Perimeter Controls */}
              <div className={`${ATT_CARD} p-5 sm:p-6 space-y-5`}>
                <div className="border-b border-slate-200 pb-3">
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
                      <label className="text-xs font-semibold text-slate-700">Geofence Radius</label>
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
                          className="w-16 rounded-lg border border-slate-300 px-2 py-1 text-xs font-mono font-bold text-blue-600 text-right outline-none focus:border-blue-600"
                        />
                        <span className="text-xs text-slate-500">meters</span>
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
                              : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-800">Strict GPS Coordinate Matching</div>
                      <div className="text-[11px] text-slate-500">Blocks punch if mobile location services are disabled or coordinates are spoofed</div>
                    </div>
                    <ToggleSwitch checked={requireGPS} onChange={setRequireGPS} />
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-800">Out-of-Radius Punch Handling</div>
                      <div className="text-[11px] text-slate-500">Action taken when employee punches outside the geofence perimeter</div>
                    </div>
                    <span className="text-xs font-medium text-slate-700">Block Check-in & Prompt Regularization</span>
                  </div>
                </div>
              </div>

              {/* CARD 2: Punch Verification Enforcements */}
              <div className={`${ATT_CARD} p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>
                    Punch Verification & Identity Rules
                  </h4>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    Security Enforced
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Check-In Selfie Photo
                  </div>
                  <div className="md:col-span-8 flex items-center justify-between max-w-md">
                    <span className="text-slate-700 font-medium">
                      Captures front camera photo verification upon morning check-in
                    </span>
                    <ToggleSwitch checked={requireSelfieCheckIn} onChange={setRequireSelfieCheckIn} />
                  </div>

                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Check-Out Selfie Photo
                  </div>
                  <div className="md:col-span-8 flex items-center justify-between max-w-md">
                    <span className="text-slate-700 font-medium">
                      Captures front camera photo verification upon evening departure
                    </span>
                    <ToggleSwitch checked={requireSelfieCheckOut} onChange={setRequireSelfieCheckOut} />
                  </div>

                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Office Wi-Fi IP Allowlist
                  </div>
                  <div className="md:col-span-8 max-w-md">
                    <input
                      type="text"
                      value={allowedIps}
                      onChange={(e) => setAllowedIps(e.target.value)}
                      placeholder="e.g. 192.168.1.0/24, 106.51.72.18"
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* CARD 3: Attendance Regularization Rules */}
              <div className={`${ATT_CARD} p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="border-b border-slate-100 pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>
                    Attendance Regularization & Disputes
                  </h4>
                  <p className={ATT_SECTION_SUB}>
                    Set how far back employees may dispute punches and whether manager approval is required.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Request Submission Window
                  </div>
                  <div className="md:col-span-8 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={regularizationDaysWindow}
                      onChange={(e) => setRegularizationDaysWindow(Number(e.target.value))}
                      className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 text-right font-mono"
                    />
                    <span className="text-xs text-slate-500 font-medium">
                      calendar days allowed after missed punch to dispute attendance
                    </span>
                  </div>

                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Manager Sign-off Required
                  </div>
                  <div className="md:col-span-8 flex items-center justify-between max-w-md">
                    <span className="text-slate-700 font-medium">
                      Direct reporting manager approval is mandatory before punch adjustments are posted
                    </span>
                    <ToggleSwitch
                      checked={requireManagerRegularizationApproval}
                      onChange={setRequireManagerRegularizationApproval}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 4. OFFICE LOCATION TAB                                                    */}
          {/* ========================================================================= */}
          {subTab === 'office_location' && (
            <div className="space-y-6">
              <div className={`${ATT_CARD} p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
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
              </div>

              {/* Office Cards List */}
              {offices.length === 0 ? (
                <div className={`${ATT_CARD} border-dashed p-10 flex flex-col items-center justify-center text-center space-y-3`}>
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">No Locations Configured</h4>
                    <p className="text-xs text-slate-500 max-w-sm mt-0.5">
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
                </div>
              ) : (
                <div className="space-y-4">
                  {offices.map((office) => (
                    <div
                      key={office.id}
                      className={`${ATT_CARD} p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}
                    >
                      {/* Office Title + Action Buttons */}
                      <div className="flex items-center justify-between border-b border-slate-200 pb-3.5">
                        <h4 className="text-base font-bold text-slate-900 tracking-tight">
                          {office.name}
                        </h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenEdit(office)}
                            className="text-slate-600 hover:text-slate-900 font-semibold text-xs cursor-pointer px-2 py-1 rounded-md hover:bg-slate-50 transition-colors"
                            title="Edit Location Policy"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteOffice(office.id)}
                            className="text-slate-400 hover:text-red-600 font-semibold text-xs cursor-pointer px-2 py-1 rounded-md hover:bg-slate-50 transition-colors"
                            title="Delete Location"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Key-Value Attribute Table */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-y-3.5 text-xs">
                        <div className="md:col-span-4 text-slate-500 font-medium">Clocking in/out from</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold">{office.clockingDevices}</div>

                        <div className="md:col-span-4 text-slate-500 font-medium">QR Code</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold">{office.qrCodeEnabled ? 'Yes' : 'No'}</div>

                        <div className="md:col-span-4 text-slate-500 font-medium">Geofencing</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                          <span>{office.geofencingStatus}</span>
                        </div>

                        <div className="md:col-span-4 text-slate-500 font-medium">Address</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold">{office.address}</div>

                        <div className="md:col-span-4 text-slate-500 font-medium">Radius</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold font-mono">{office.radiusText}</div>

                        <div className="md:col-span-4 text-slate-500 font-medium">Policy</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold">{office.policyDescription}</div>
                      </div>
                    </div>
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
              <div className={`${ATT_CARD} p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3`}>
                <div>
                  <h3 className={ATT_SECTION_TITLE}>
                    Leave Policies & Annual Quotas
                  </h3>
                  <p className={ATT_SECTION_SUB}>
                    Configure annual paid leave allowances, approval hierarchies, rollover limits, and probation rules
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSaveAllSettings}
                  className={`${ATT_BTN_PRIMARY} shrink-0`}
                >
                  Save Leave Policies
                </button>
              </div>

              {/* CARD 1: Annual Paid Leave Entitlements & Monthly Accruals */}
              <div className={`${ATT_CARD} p-5 sm:p-7 space-y-6`}>
                {/* Card Top Header & Period Selector */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <h4 className={ATT_SECTION_TITLE}>
                      {leaveQuotaPeriod === 'annual' ? 'Annual Paid Leave Quotas' : 'Monthly Leave Accrual Rates'} (Per Employee)
                    </h4>
                    <p className={ATT_SECTION_SUB}>
                      {leaveQuotaPeriod === 'annual'
                        ? 'Configured as total full-day quota credited across the 12-month calendar year'
                        : 'Configured as monthly accrual rate credited to employee balance at each month-end'}
                    </p>
                  </div>
                  <div className="flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setLeaveQuotaPeriod('monthly');
                        setAccrualFrequency('monthly');
                      }}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        leaveQuotaPeriod === 'monthly'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Monthly (Days/Month)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLeaveQuotaPeriod('annual');
                        setAccrualFrequency('annual');
                      }}
                      className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                        leaveQuotaPeriod === 'annual'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Annual (Days/Year)
                    </button>
                  </div>
                </div>

                {/* Section A: Standard Recurring Accrual Leaves */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Standard Recurring Leaves
                    </span>
                    <span className="text-[11px] font-medium text-slate-400">
                      {leaveQuotaPeriod === 'annual' ? 'Values shown per annum' : 'Values shown per month'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                    {/* Paid / Privilege Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-slate-800 text-xs">Paid / Privilege Leave (PL / EL)</div>
                      <div className="text-[11px] text-slate-400">Earned leaves for planned vacations</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        max={leaveQuotaPeriod === 'annual' ? 90 : 7.5}
                        step={leaveQuotaPeriod === 'annual' ? 1 : 0.01}
                        value={leaveQuotaPeriod === 'annual' ? paidLeaveQuota : Number((paidLeaveQuota / 12).toFixed(2))}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setPaidLeaveQuota(leaveQuotaPeriod === 'annual' ? val : Math.round(val * 12 * 100) / 100);
                        }}
                        className="w-24 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-700 font-medium">
                          {leaveQuotaPeriod === 'annual' ? 'Days / Year' : 'Days / Month'}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                          {leaveQuotaPeriod === 'annual'
                            ? `≈ ${(paidLeaveQuota / 12).toFixed(2)} Days / Month`
                            : `≈ ${paidLeaveQuota} Days / Year total`}
                        </span>
                      </div>
                    </div>

                    {/* Casual Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-slate-800 text-xs">Casual Leave (CL)</div>
                      <div className="text-[11px] text-slate-400">For unexpected personal needs & emergencies</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        max={leaveQuotaPeriod === 'annual' ? 60 : 5}
                        step={leaveQuotaPeriod === 'annual' ? 1 : 0.01}
                        value={leaveQuotaPeriod === 'annual' ? casualLeaveQuota : Number((casualLeaveQuota / 12).toFixed(2))}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setCasualLeaveQuota(leaveQuotaPeriod === 'annual' ? val : Math.round(val * 12 * 100) / 100);
                        }}
                        className="w-24 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-700 font-medium">
                          {leaveQuotaPeriod === 'annual' ? 'Days / Year' : 'Days / Month'}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                          {leaveQuotaPeriod === 'annual'
                            ? `≈ ${(casualLeaveQuota / 12).toFixed(2)} Days / Month`
                            : `≈ ${casualLeaveQuota} Days / Year total`}
                        </span>
                      </div>
                    </div>

                    {/* Sick Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-slate-800 text-xs">Sick Leave (SL)</div>
                      <div className="text-[11px] text-slate-400">For illness, doctor visits & medical recovery</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        max={leaveQuotaPeriod === 'annual' ? 60 : 5}
                        step={leaveQuotaPeriod === 'annual' ? 1 : 0.01}
                        value={leaveQuotaPeriod === 'annual' ? sickLeaveQuota : Number((sickLeaveQuota / 12).toFixed(2))}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setSickLeaveQuota(leaveQuotaPeriod === 'annual' ? val : Math.round(val * 12 * 100) / 100);
                        }}
                        className="w-24 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-700 font-medium">
                          {leaveQuotaPeriod === 'annual' ? 'Days / Year' : 'Days / Month'}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">
                          {leaveQuotaPeriod === 'annual'
                            ? `≈ ${(sickLeaveQuota / 12).toFixed(2)} Days / Month`
                            : `≈ ${sickLeaveQuota} Days / Year total`}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section B: Statutory & Special Leaves (Event-Based) */}
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                        Statutory & Special Leaves (Per Occurrence)
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5 block">
                        Fixed statutory allowances granted per qualifying life event (not monthly accruals)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                    {/* Maternity Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-slate-800 text-xs">Maternity Leave Allowance</div>
                      <div className="text-[11px] text-slate-400">Granted to eligible female employees per child</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={maternityLeaveQuota}
                        onChange={(e) => setMaternityLeaveQuota(Number(e.target.value))}
                        className="w-24 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-700 font-medium">Days / Event</span>
                        <span className="text-xs text-slate-500 font-medium">
                          • 26 Weeks Statutory Standard
                        </span>
                      </div>
                    </div>

                    {/* Paternity Leave */}
                    <div className="md:col-span-4">
                      <div className="font-semibold text-slate-800 text-xs">Paternity Leave Allowance</div>
                      <div className="text-[11px] text-slate-400">Granted to eligible fathers around childbirth / adoption</div>
                    </div>
                    <div className="md:col-span-8 flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        max={60}
                        value={paternityLeaveQuota}
                        onChange={(e) => setPaternityLeaveQuota(Number(e.target.value))}
                        className="w-24 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 text-right font-mono"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-700 font-medium">Days / Event</span>
                        <span className="text-xs text-slate-500 font-medium">
                          • Statutory Allowance
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: Approval Hierarchy & Carry Forward Rules */}
              <div className={`${ATT_CARD} p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="border-b border-slate-100 pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>
                    Leave Approval Workflow & Balance Rules
                  </h4>
                  <p className={ATT_SECTION_SUB}>
                    Approval routing, carry-forward limits, comp-off, and notice-period restrictions.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Leave Approval Hierarchy
                  </div>
                  <div className="md:col-span-8 max-w-md">
                    <select
                      value={leaveApprovalWorkflow}
                      onChange={(e) => setLeaveApprovalWorkflow(e.target.value as any)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-600 cursor-pointer"
                    >
                      <option value="manager_then_hr">Reporting Manager → HR Manager</option>
                      <option value="manager_only">Reporting Manager Only</option>
                      <option value="hr_only">HR Manager Direct Approval</option>
                    </select>
                  </div>

                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Max Carry Over Limit
                  </div>
                  <div className="md:col-span-8 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={90}
                      value={maxCarryForward}
                      onChange={(e) => setMaxCarryForward(Number(e.target.value))}
                      className="w-24 rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 outline-none focus:border-blue-600 text-right font-mono"
                    />
                    <span className="text-xs text-slate-500 font-medium">Days / Year max rollover</span>
                  </div>

                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Enable Leave Carry Over
                  </div>
                  <div className="md:col-span-8 flex items-center justify-between max-w-md">
                    <span className="text-slate-700 font-medium">
                      Unused leaves roll forward automatically into the next cycle up to the max limit
                    </span>
                    <ToggleSwitch checked={enableCarryOver} onChange={setEnableCarryOver} />
                  </div>

                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Compensatory Off (Comp-Off)
                  </div>
                  <div className="md:col-span-8 flex items-center justify-between max-w-md">
                    <span className="text-slate-700 font-medium">
                      Allows employees working on weekends or holidays to claim leave credits
                    </span>
                    <ToggleSwitch checked={enableCompOff} onChange={setEnableCompOff} />
                  </div>

                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Allow Negative Leave Balance
                  </div>
                  <div className="md:col-span-8 flex items-center justify-between max-w-md">
                    <span className="text-slate-700 font-medium">
                      Allows advance leave requests when employee balance is zero
                    </span>
                    <ToggleSwitch checked={allowNegativeBalance} onChange={setAllowNegativeBalance} />
                  </div>

                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Restrict Leaves During Notice Period
                  </div>
                  <div className="md:col-span-8 flex items-center justify-between max-w-md">
                    <span className="text-slate-700 font-medium">
                      Blocks planned casual leaves when serving resignation notice
                    </span>
                    <ToggleSwitch checked={restrictDuringNotice} onChange={setRestrictDuringNotice} />
                  </div>
                </div>
              </div>

              {/* CARD 3: Probation Period & Intern Restrictions */}
              <div className={`${ATT_CARD} p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="border-b border-slate-100 pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>
                    Probation Period Settings & Paid Leave Lock
                  </h4>
                  <p className={ATT_SECTION_SUB}>
                    Track probation for new hires and restrict paid leave until confirmation.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-y-4 text-xs items-center">
                  <div className="md:col-span-4 text-slate-500 font-medium">
                    Enable Probation Tracking
                  </div>
                  <div className="md:col-span-8 flex items-center justify-between max-w-md">
                    <span className="text-slate-700 font-medium">
                      Enforce probation status and review period for newly onboarded staff
                    </span>
                    <ToggleSwitch checked={enableProbation} onChange={setEnableProbation} />
                  </div>

                  {enableProbation && (
                    <>
                      <div className="md:col-span-4 text-slate-500 font-medium">
                        Standard Duration
                      </div>
                      <div className="md:col-span-8 max-w-md">
                        <select
                          value={probationDurationMonths}
                          onChange={(e) => setProbationDurationMonths(Number(e.target.value))}
                          className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-600 cursor-pointer"
                        >
                          <option value={1}>1 Month (30 Days)</option>
                          <option value={2}>2 Months (60 Days)</option>
                          <option value={3}>3 Months (90 Days Standard)</option>
                          <option value={6}>6 Months (180 Days)</option>
                          <option value={12}>12 Months (1 Year)</option>
                        </select>
                      </div>

                      <div className="md:col-span-4 text-slate-500 font-medium">
                        Paid Leave Quota Restriction
                      </div>
                      <div className="md:col-span-8 text-slate-900 font-semibold flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                          0 Paid Leaves Allowed • Absences logged as Loss of Pay (LOP / Unpaid)
                        </span>
                      </div>

                      <div className="md:col-span-4 text-slate-500 font-medium">
                        Auto-Confirm Probation
                      </div>
                      <div className="md:col-span-8 flex items-center justify-between max-w-md">
                        <span className="text-slate-700 font-medium">
                          Auto update employee status and unlock full paid leave quotas upon completion
                        </span>
                        <ToggleSwitch checked={autoConfirmProbation} onChange={setAutoConfirmProbation} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* CARD 4: Role-Based Leave Quotas */}
              <div className={`${ATT_CARD} p-5 sm:p-6 space-y-5 transition-all hover:border-slate-300/90`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                  <h4 className={ATT_SECTION_TITLE}>
                    {leaveQuotaPeriod === 'annual' ? 'Role-Based Annual Leave Quotas' : 'Role-Based Monthly Leave Accruals'}
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {leaveQuotaPeriod === 'annual' ? 'Custom annual allowances override company default' : 'Custom monthly accrual rates override company default'}
                  </span>
                </div>

                <div className={ATT_TABLE_SHELL}>
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th className="py-3 px-4 font-bold text-slate-700">Role</th>
                        <th className="py-3 px-3 font-bold text-slate-700 text-center">
                          Casual Leave (CL) {leaveQuotaPeriod === 'annual' ? '(Days/Yr)' : '(Days/Mo)'}
                        </th>
                        <th className="py-3 px-3 font-bold text-slate-700 text-center">
                          Sick Leave (SL) {leaveQuotaPeriod === 'annual' ? '(Days/Yr)' : '(Days/Mo)'}
                        </th>
                        <th className="py-3 px-3 font-bold text-slate-700 text-center">
                          Earned Leave (EL) {leaveQuotaPeriod === 'annual' ? '(Days/Yr)' : '(Days/Mo)'}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
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
                          <tr key={r.key} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                              {r.label}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                min={0}
                                max={leaveQuotaPeriod === 'annual' ? 60 : 5}
                                step={leaveQuotaPeriod === 'annual' ? 1 : 0.01}
                                value={leaveQuotaPeriod === 'annual' ? quotas.casualLeave : Number((quotas.casualLeave / 12).toFixed(2))}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  handleUpdateRoleLeaveQuota(r.key, 'casualLeave', leaveQuotaPeriod === 'annual' ? val : Math.round(val * 12 * 100) / 100);
                                }}
                                className="w-20 text-center py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-900 outline-none focus:border-blue-600 font-mono"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                min={0}
                                max={leaveQuotaPeriod === 'annual' ? 60 : 5}
                                step={leaveQuotaPeriod === 'annual' ? 1 : 0.01}
                                value={leaveQuotaPeriod === 'annual' ? quotas.sickLeave : Number((quotas.sickLeave / 12).toFixed(2))}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  handleUpdateRoleLeaveQuota(r.key, 'sickLeave', leaveQuotaPeriod === 'annual' ? val : Math.round(val * 12 * 100) / 100);
                                }}
                                className="w-20 text-center py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-900 outline-none focus:border-blue-600 font-mono"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                min={0}
                                max={leaveQuotaPeriod === 'annual' ? 60 : 5}
                                step={leaveQuotaPeriod === 'annual' ? 1 : 0.01}
                                value={leaveQuotaPeriod === 'annual' ? quotas.earnedLeave : Number((quotas.earnedLeave / 12).toFixed(2))}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  handleUpdateRoleLeaveQuota(r.key, 'earnedLeave', leaveQuotaPeriod === 'annual' ? val : Math.round(val * 12 * 100) / 100);
                                }}
                                className="w-20 text-center py-1.5 px-2 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-900 outline-none focus:border-blue-600 font-mono"
                              />
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

          {/* ========================================================================= */}
          {/* 6. REPORTS CUSTOMIZATION TAB                                              */}
          {/* ========================================================================= */}
          {subTab === 'reports' && (
            <div className="space-y-6">
              <div className={`${ATT_CARD} p-5 sm:p-7 space-y-5`}>
                <div>
                  <h3 className={ATT_SECTION_TITLE}>Report Customization</h3>
                  <p className={ATT_SECTION_SUB}>
                    Overview widgets, attendance report categories, filters, columns and CSV export are managed on the dedicated Reports Settings page.
                  </p>
                </div>
                <div
                  className={`${ATT_CARD} p-5 sm:p-6 bg-gradient-to-br from-blue-50/80 via-white to-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
                >
                  <div className="space-y-1 max-w-md">
                    <p className="text-xs font-semibold text-slate-800">Reports & Analytics configuration</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Changes on Reports Settings apply immediately to{' '}
                      <span className="font-semibold text-slate-700">Reports & Analytics</span> after you save.
                    </p>
                  </div>
                  <Link href="/reports/settings" className={`${ATT_BTN_PRIMARY} self-start sm:self-auto`}>
                    Open Reports Settings
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          )}
      </div>

      {/* CREATE WORK SHIFT MODAL */}
      {showAddShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-slate-900">
            {/* Modal Header */}
            <div className="p-5 px-6 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">Create New Work Shift</h3>
                <p className="text-xs text-slate-500 mt-0.5">Configure working hours, grace buffer, and roster schedule.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddShiftModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 cursor-pointer rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleCreateShift} className="flex flex-col">
              <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Shift Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Afternoon Shift, Night Roster, Flexible Shift"
                    value={newShiftName}
                    onChange={(e) => setNewShiftName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-blue-600 transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Start Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={to24HourTime(newShiftStart)}
                      onChange={(e) => setNewShiftStart(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-800 font-medium outline-none focus:border-blue-600 transition-all cursor-pointer"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      End Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={to24HourTime(newShiftEnd)}
                      onChange={(e) => setNewShiftEnd(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-800 font-medium outline-none focus:border-blue-600 transition-all cursor-pointer"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Grace Buffer (Minutes)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={newShiftGrace}
                    onChange={(e) => setNewShiftGrace(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-800 font-medium outline-none focus:border-blue-600 transition-all"
                  />
                </div>

                {/* Working Days Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
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
              <div className="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddShiftModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors shadow-xs"
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
          <div className="relative w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-slate-900">
            {/* Modal Header */}
            <div className="p-5 px-6 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">Add Academic Batch</h3>
                <p className="text-xs text-slate-500 mt-0.5">Configure class timing, dismissal, and active class schedule.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBatchModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 cursor-pointer rounded-lg hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleCreateBatch} className="flex flex-col">
              <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Grade Level <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Grade 12"
                      value={newBatchGrade}
                      onChange={(e) => setNewBatchGrade(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-blue-600 transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Section <span className="text-slate-400 font-normal">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. A (Optional)"
                      value={newBatchSection}
                      onChange={(e) => setNewBatchSection(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-blue-600 transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Morning Entry Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={newBatchStart}
                      onChange={(e) => setNewBatchStart(e.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-800 font-medium outline-none focus:border-blue-600 transition-all cursor-pointer"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Dismissal Time <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={newBatchEnd}
                      onChange={(e) => setNewBatchEnd(to12HourTime(e.target.value))}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-800 font-medium outline-none focus:border-blue-600 transition-all cursor-pointer"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Late Buffer (Minutes)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={newBatchGrace}
                    onChange={(e) => setNewBatchGrace(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2 text-xs text-slate-800 font-medium outline-none focus:border-blue-600 transition-all"
                  />
                </div>

                {/* Class Working Days Selector */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
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
              <div className="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddBatchModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors shadow-xs"
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

