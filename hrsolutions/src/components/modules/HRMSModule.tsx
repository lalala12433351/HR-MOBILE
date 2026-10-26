'use client';
import './people-attendance.css';
import { DateInput } from '@/components/common/DateInput';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  Calendar,
  DollarSign,
  Search,
  Plus,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  Building2,
  Download,
  Printer,
  Filter,
  User,
  Mail,
  Phone,
  Briefcase,
  CalendarCheck,
  Shield,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  UserPlus,
  Send,
  FileUp,
  MoreVertical,
} from 'lucide-react';
import { AppState } from '../../services/store';
import { useApp } from '../../context/AppContext';
import { isInstitutionMode } from '@/utils/organizationMode';
import { toApiAuthRole } from '@/utils/roleMapping';
import { resolveOrCreateTeamId } from '@/utils/teamResolve';
import { alignedDepartment } from '@/utils/departmentTeam';
import { Employee, LeaveRequest, AttendanceRecord, AttendanceRegularization, TimesheetEntry, PayrollRecord, Role, Student, AccountStatus } from '../../types';
import { api } from '../../services/apiClient';
import { leaveBelongsToEmployee, toApiLeaveType } from '@/utils/mapLeaveRow';
import { eachDateInclusive } from '@/utils/wfhRegularization';
import { KekaAttendanceModule } from './KekaAttendanceModule';
import { TimesheetsModule } from './TimesheetsModule';
import {
  formatLeaveDays,
  getEffectiveLeaveQuotas,
  isEmployeeInProbation,
  isPaidLeaveType,
  validateLeaveApproval,
} from '@/utils/leaveRules';
import { EmployeeDetailView } from './EmployeeDetailView';
import { DepartmentDetailView } from './DepartmentDetailView';
import { applyDepartmentLocalUpdate, removeDepartmentLocal } from '@/utils/departmentRecords';
import { OrgChartModule } from './OrgChartModule';
import { EmployeeTableTab } from './hrms/EmployeeTableTab';
import { StaffCardsTab } from './hrms/StaffCardsTab';
import { EmployeeProfileCardModal } from './hrms/EmployeeProfileCardModal';
import { BulkIdCardStudio } from '../print/BulkIdCardStudio';
import { StudentDirectoryModule } from './StudentDirectoryModule';
import { AddEmployeeModal } from './hrms/AddEmployeeModal';
import { AddOfficeModal, OfficeModalData } from '../common/AddOfficeModal';
import {
  isExecutiveOrAdmin,
  isHRPersona,
  isManagerPersona,
  getTeamEmployees,
  canApproveLeave,
  isDirectReport,
} from '../../utils/teamAccess';

interface HRMSModuleProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onCheckInAttendance?: () => void;
  initialTab?: 'employees' | 'my_team' | 'organization' | 'students' | 'directory' | 'org_chart' | 'attendance' | 'attendance_leaves' | 'leaves' | 'timesheets' | 'settings' | 'payroll' | 'employee_settings';
  initialOpenApplyModal?: boolean;
  initialEmployeeId?: string;
  initialEmployeeTab?: 'general' | 'public_profile' | 'job' | 'attendance_leave' | 'payroll' | 'documents' | 'setting';
  moduleScope?: 'employees' | 'attendance' | 'all';
}

// Avatar Palette — consistent neutral theme
const AVATAR_PALETTE = [
  { bg: 'bg-slate-100 text-slate-600 border-slate-200' },
];

const getEmployeeAvatarStyle = (_empId: string, _name: string) => {
  return AVATAR_PALETTE[0];
};

const getInitials = (name: string): string => {
  if (!name) return 'UN';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

export const HRMSModule: React.FC<HRMSModuleProps> = ({
  state,
  onUpdateState,
  onCheckInAttendance,
  initialTab,
  initialOpenApplyModal,
  initialEmployeeId,
  initialEmployeeTab,
  moduleScope = 'employees',
}) => {
  const { syncWithBackend } = useApp();
  const isSuperAdmin = state.currentPersona?.role === 'super_admin' || state.currentPersona?.role === 'admin';
  const isHR = state.currentPersona?.role === 'hr_manager' || (state.currentPersona?.role as string) === 'hr';
  const canEditProfiles = isSuperAdmin || isHR;
  const isManager = isManagerPersona(state.currentPersona, state.employees || []);
  const isUserView = !isSuperAdmin && !isHR && !isManager;

  const [selectedEmployeeTab, setSelectedEmployeeTab] = useState<
    'general' | 'public_profile' | 'job' | 'attendance_leave' | 'payroll' | 'documents' | 'setting'
  >(initialEmployeeTab || (initialTab === 'attendance' || (initialTab as string) === 'attendance_leaves' ? 'attendance_leave' : 'general'));

  const allowCoworkerDirectoryAccess =
    state.customOptions?.profileSelfServiceSettings?.allowCoworkerDirectoryAccess ?? true;
  const [publicProfileEmployee, setPublicProfileEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    if (initialEmployeeTab) {
      setSelectedEmployeeTab(initialEmployeeTab);
    }
  }, [initialEmployeeTab]);

  // Always refresh roster from API when opening HR — localStorage does not keep employees.
  useEffect(() => {
    void syncWithBackend();
  }, []);

  const accessibleEmployees = useMemo(() => {
    return getTeamEmployees(state.currentPersona, state.employees || []);
  }, [state.currentPersona, state.employees]);

  const [teamScopeFilter, setTeamScopeFilter] = useState<'team' | 'all'>(
    isSuperAdmin || isHR ? 'all' : 'team'
  );
  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);

  const validEmployeeTabs = ['employees', 'my_team', 'organization', 'directory', 'org_chart'];
  const getSanitizedTab = (tab?: string) => {
    if (moduleScope === 'employees') {
      if (tab && validEmployeeTabs.includes(tab)) {
        return tab as any;
      }
      return 'employees';
    }
    if (moduleScope === 'attendance') {
      return tab || 'attendance';
    }
    return tab || 'employees';
  };

  const defaultTab = getSanitizedTab(initialTab);
  const resolvedDefaultTab =
    !canEditProfiles && (defaultTab === 'employees' || !defaultTab) ? 'my_team' : defaultTab;
  const [activeTab, setActiveTab] = useState<
    | 'employees'
    | 'my_team'
    | 'organization'
    | 'students'
    | 'directory'
    | 'org_chart'
    | 'attendance'
    | 'attendance_leaves'
    | 'leaves'
    | 'timesheets'
    | 'settings'
    | 'payroll'
    | 'employee_settings'
  >(resolvedDefaultTab as any);

  useEffect(() => {
    if (moduleScope !== 'employees') return;
    const coworkerTabs = allowCoworkerDirectoryAccess
      ? (['my_team', 'organization', 'directory', 'org_chart'] as const)
      : (['my_team', 'organization', 'org_chart'] as const);
    const allowed = new Set(
      canEditProfiles
        ? isInstitution
          ? ['employees', 'students', 'directory', 'org_chart']
          : ['employees', 'directory', 'org_chart']
        : isInstitution
          ? [...coworkerTabs, 'students']
          : [...coworkerTabs]
    );
    if (!allowed.has(activeTab)) {
      setActiveTab((canEditProfiles ? 'employees' : 'my_team') as any);
    }
  }, [moduleScope, canEditProfiles, isInstitution, activeTab, allowCoworkerDirectoryAccess]);

  const isSelfEmployee = (emp: Employee | null | undefined) => {
    if (!emp || !state.currentPersona) return false;
    const persona = state.currentPersona;
    return (
      emp.id === persona.id ||
      (!!persona.email && emp.email?.toLowerCase() === persona.email.toLowerCase())
    );
  };

  const handleSelectEmployee = (emp: Employee) => {
    if (canEditProfiles) {
      setPublicProfileEmployee(null);
      setSelectedEmployee(emp);
      return;
    }
    // Self: full read-only detail (includes Public Profile tab).
    if (isSelfEmployee(emp)) {
      setPublicProfileEmployee(null);
      setSelectedEmployee(emp);
      return;
    }
    // Coworkers: company public profile modal when directory access is enabled.
    if (allowCoworkerDirectoryAccess) {
      setSelectedEmployee(null);
      setPublicProfileEmployee(emp);
      return;
    }
    setPublicProfileEmployee(null);
  };

  const [selectedDepartmentName, setSelectedDepartmentName] = useState<string | null>(null);

  const handleSelectDepartment = (deptName: string) => {
    if (!deptName || deptName === 'Unassigned') return;
    setSelectedEmployee(null);
    setSelectedDepartmentName(deptName);
  };

  const [showApplyLeaveModal, setShowApplyLeaveModal] = useState(
    moduleScope !== 'employees' && !!initialOpenApplyModal
  );
  const [showLogTimesheetModal, setShowLogTimesheetModal] = useState(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showAddOfficeModal, setShowAddOfficeModal] = useState(false);
  const [idCardBatch, setIdCardBatch] = useState<Employee[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleResendInvite = async (emp: Employee) => {
    try {
      await api.identity.resendInvite(emp.id);
      onUpdateState((prev) => ({
        ...prev,
        employees: prev.employees.map((e) =>
          e.id === emp.id ? { ...e, accountStatus: 'Invited' as const } : e
        ),
      }));
      showToast(`Invite sent to ${emp.email}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not resend the invite');
    }
  };

  const handleSaveOfficeModalFromHRMS = async (data: OfficeModalData) => {
    const updated = Array.from(new Set([...(state.customOptions?.offices || []), data.name?.trim()].filter(Boolean)));
    
    setIsSaving(true);
    try {
      await api.setup.saveOffice({
        offices: updated,
        latest: {
          name: data.name,
          code: 'HQ',
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
        }
      });
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          offices: updated,
        },
        organization: {
          ...prev.organization,
          officeLocation: {
            address: data.address,
            latitude: data.latitude,
            longitude: data.longitude,
            allowedRadiusMeters: data.radiusMeters,
          },
        },
      }));
      setShowAddOfficeModal(false);
      showToast('Office Location Saved');
    } catch (e) {
      console.error('Failed to save office', e);
      showToast('Failed to save office location');
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(getSanitizedTab(initialTab));
    }
  }, [initialTab, moduleScope]);

  useEffect(() => {
    if (initialOpenApplyModal && moduleScope !== 'employees') {
      setShowApplyLeaveModal(true);
      setActiveTab('leaves');
    }
  }, [initialOpenApplyModal, moduleScope]);

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    if (!initialEmployeeId) return;
    const found = state.employees.find(
      (e) => e.id === initialEmployeeId || e.employeeId === initialEmployeeId
    );
    if (!found) return;
    if (canEditProfiles || isSelfEmployee(found)) {
      setPublicProfileEmployee(null);
      setSelectedEmployee(found);
    } else if (allowCoworkerDirectoryAccess) {
      setSelectedEmployee(null);
      setPublicProfileEmployee(found);
    }
  }, [
    initialEmployeeId,
    state.employees,
    state.currentPersona,
    canEditProfiles,
    allowCoworkerDirectoryAccess,
  ]);

  // Keep detail-view avatar in sync when photo is updated via the lightweight avatar-only path
  // (EmployeeDetailView / Header), which updates store employees without setSelectedEmployee.
  useEffect(() => {
    if (!selectedEmployee?.id) return;
    const fresh = (state.employees || []).find((e) => e.id === selectedEmployee.id);
    if (!fresh || fresh.avatar === selectedEmployee.avatar) return;
    setSelectedEmployee((prev) => (prev ? { ...prev, avatar: fresh.avatar } : prev));
  }, [state.employees, selectedEmployee?.id, selectedEmployee?.avatar]);

  // New Leave State
  const todayStr = new Date().toISOString().split('T')[0];
  const [dayMode, setDayMode] = useState<'single' | 'multiple'>('multiple');
  const [singleDate, setSingleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [leaveType, setLeaveType] = useState<'Casual Leave' | 'Sick Leave' | 'Earned Leave' | 'Work From Home' | 'Unpaid Leave'>('Casual Leave');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveAttachment, setLeaveAttachment] = useState('');
  const [leaveHandover, setLeaveHandover] = useState('');
  const [selectedLeaveEmpId, setSelectedLeaveEmpId] = useState<string>(
    state.employees[0]?.id || state.currentPersona.id
  );
  const [leaveFilterStatus, setLeaveFilterStatus] = useState('All');
  const [leaveFilterDept, setLeaveFilterDept] = useState('All');
  const [leaveSearchQuery, setLeaveSearchQuery] = useState('');

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (endDate < val) {
      setEndDate(val);
    }
  };

  // User's Leaves & Synced Dynamic Balances
  const userLeaves = useMemo(() => {
    return state.leaves.filter((l) => leaveBelongsToEmployee(l, state.currentPersona));
  }, [state.leaves, state.currentPersona]);

  const currentEmpObj = useMemo(() => {
    return (state.employees || []).find(
      (e) => e.id === state.currentPersona.id || (e.name && e.name.toLowerCase() === state.currentPersona.name.toLowerCase())
    ) || state.currentPersona;
  }, [state.employees, state.currentPersona]);

  const effectiveQuotas = useMemo(() => {
    return getEffectiveLeaveQuotas(currentEmpObj, state.customOptions?.leaveSettings);
  }, [currentEmpObj, state.customOptions?.leaveSettings]);

  // Server balances are already net of approved leave; the ledger total is the quota.
  const fromServer = effectiveQuotas.balancesFromServer;
  const quotaSource = fromServer ? effectiveQuotas.annualQuotas : effectiveQuotas.effectiveQuotas;
  const casualQuota = formatLeaveDays(quotaSource.casualLeave);
  const sickQuota = formatLeaveDays(quotaSource.sickLeave);
  const earnedQuota = formatLeaveDays(quotaSource.earnedLeave);
  const wfhQuota = formatLeaveDays(quotaSource.compOff);

  const casualUsed = formatLeaveDays(userLeaves
    .filter((l) => l.leaveType === 'Casual Leave' && l.status !== 'Rejected')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const casualPending = formatLeaveDays(userLeaves
    .filter((l) => l.leaveType === 'Casual Leave' && l.status === 'Pending')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const casualLeft = formatLeaveDays(
    fromServer ? effectiveQuotas.effectiveQuotas.casualLeave : Math.max(0, casualQuota - casualUsed)
  );

  const sickUsed = formatLeaveDays(userLeaves
    .filter((l) => l.leaveType === 'Sick Leave' && l.status !== 'Rejected')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const sickPending = formatLeaveDays(userLeaves
    .filter((l) => l.leaveType === 'Sick Leave' && l.status === 'Pending')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const sickLeft = formatLeaveDays(
    fromServer ? effectiveQuotas.effectiveQuotas.sickLeave : Math.max(0, sickQuota - sickUsed)
  );

  const earnedUsed = formatLeaveDays(userLeaves
    .filter((l) => ((l.leaveType as string) === 'Earned Leave' || (l.leaveType as string) === 'Earned / Privilege') && l.status !== 'Rejected')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const earnedPending = formatLeaveDays(userLeaves
    .filter((l) => ((l.leaveType as string) === 'Earned Leave' || (l.leaveType as string) === 'Earned / Privilege') && l.status === 'Pending')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const earnedLeft = formatLeaveDays(
    fromServer ? effectiveQuotas.effectiveQuotas.earnedLeave : Math.max(0, earnedQuota - earnedUsed)
  );

  const wfhUsed = formatLeaveDays(userLeaves
    .filter((l) => l.leaveType === 'Work From Home' && l.status !== 'Rejected')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const wfhPending = formatLeaveDays(userLeaves
    .filter((l) => l.leaveType === 'Work From Home' && l.status === 'Pending')
    .reduce((sum, l) => sum + (l.daysCount || 1), 0));
  const wfhLeft = formatLeaveDays(
    fromServer ? effectiveQuotas.effectiveQuotas.compOff : Math.max(0, wfhQuota - wfhUsed)
  );

  const computedLeaveDays = useMemo(() => {
    if (dayMode === 'single') {
      return 1;
    }
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 1;
    const diffTime = e.getTime() - s.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays > 0 ? diffDays : 1;
  }, [dayMode, startDate, endDate]);

  // New Timesheet State
  const [tsProject, setTsProject] = useState(state.projects[0]?.id || '');
  const [tsTask, setTsTask] = useState(state.tasks[0]?.id || '');
  const [tsHours, setTsHours] = useState('8');
  const [tsDescription, setTsDescription] = useState('');

  const handleDownloadCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Employee ID,Name,Email,Job Title,Department,Location,Status']
        .concat(
          state.employees.map(
            (e) =>
              `"${e.employeeId}","${e.name}","${e.email}","${e.designation}","${e.department}","${e.location || ''}","${e.status}"`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `employees_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApproveLeave = async (id: string, approved: boolean) => {
    const targetLeave = state.leaves.find((l) => l.id === id);
    if (!targetLeave) return;

    if (!canApproveLeave(state.currentPersona, targetLeave, state.employees, state.customOptions?.leaveSettings?.approvalWorkflow)) {
      showToast('Permission denied: You can only approve leaves for your direct reports.');
      return;
    }

    if (approved) {
      const targetEmp = state.employees.find(
        (e) => e.id === targetLeave.employeeId || (e.name && e.name.toLowerCase() === targetLeave.employeeName.toLowerCase())
      );
      const validation = validateLeaveApproval(targetLeave, targetEmp, state.customOptions?.probationSettings);
      if (!validation.canApproveAsPaid) {
        showToast(`Cannot approve paid leave: ${targetLeave.employeeName} is in probation. Approve as Loss of Pay (LOP) instead.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      await api.attendance.decideLeave(id, {
        status: approved ? 'approved' : 'rejected',
        decisionNotes: `Processed by ${state.currentPersona.name}`,
      });

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
      showToast(`Leave request ${approved ? 'approved' : 'rejected'} successfully.`);
    } catch (e) {
      console.error('Failed to decide leave', e);
      showToast('Failed to process leave request. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveAsUnpaid = async (id: string) => {
    const targetLeave = state.leaves.find((l) => l.id === id);
    if (!targetLeave) return;

    if (!canApproveLeave(state.currentPersona, targetLeave, state.employees, state.customOptions?.leaveSettings?.approvalWorkflow)) {
      showToast('Permission denied: You can only approve leaves for your direct reports.');
      return;
    }

    setIsSaving(true);
    try {
      await api.attendance.decideLeave(id, {
        status: 'approved',
        decisionNotes: `Approved as LOP (Probation Policy) by ${state.currentPersona.name}`,
        leaveType: 'unpaid',
        approveAsLop: true,
      });

      onUpdateState((prev) => ({
        ...prev,
        leaves: prev.leaves.map((l) =>
          l.id === id
            ? {
                ...l,
                leaveType: 'Loss of Pay',
                isPaid: false,
                status: 'Approved',
                approvedBy: `${state.currentPersona.name} (Approved as LOP - Probation Policy)`,
              }
            : l
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'APPROVED_LEAVE_AS_LOP',
            entity: 'LeaveRequest',
            entityId: id,
            ipAddress: '106.51.72.18',
            details: `Approved leave as Loss of Pay (unpaid) for probation employee`,
          },
          ...prev.auditLogs,
        ],
        notifications: [
          {
            id: `notif_${Date.now()}`,
            title: 'Leave Approved as Loss of Pay (LOP)',
            message: `${prev.leaves.find((l) => l.id === id)?.employeeName || 'Employee'}'s leave was approved as Loss of Pay (unpaid) in compliance with probation policy.`,
            timestamp: 'Just now',
            category: 'Approvals' as const,
            priority: 'high' as const,
            read: false,
            linkModule: 'attendance',
            linkTab: 'leaves',
          },
          ...prev.notifications,
        ],
      }));
      showToast('Leave approved as LOP.');
    } catch (e) {
      console.error('Failed to approve leave as unpaid', e);
      showToast('Failed to process leave request.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveAllPending = async () => {
    setIsSaving(true);
    try {
      const pendingIds = state.leaves
        .filter((l) => (l.status === 'Pending' || l.status === 'Manager approved') && canApproveLeave(state.currentPersona, l, state.employees, state.customOptions?.leaveSettings?.approvalWorkflow))
        .map((l) => l.id);
      if (pendingIds.length === 0) {
        showToast('No leave requests you can approve.');
        setIsSaving(false);
        return;
      }
      
      // Execute all decideLeave calls concurrently
      await Promise.all(
        pendingIds.map((id) =>
          api.attendance.decideLeave(id, {
            status: 'approved',
            decisionNotes: `Bulk approved by ${state.currentPersona.name}`,
          })
        )
      );

      onUpdateState((prev) => ({
        ...prev,
        leaves: prev.leaves.map((l) =>
          pendingIds.includes(l.id)
            ? { ...l, status: 'Approved', approvedBy: state.currentPersona.name }
            : l
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'APPROVED_ALL_LEAVES',
            entity: 'LeaveRequest',
            entityId: 'ALL_PENDING',
            ipAddress: '106.51.72.18',
            details: `Approved all pending leave requests`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast('All pending leaves approved successfully.');
    } catch (e) {
      console.error('Failed to bulk approve leaves', e);
      showToast('Failed to approve some or all leaves.');
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
        leaves: prev.leaves.map((l) => (l.id === id ? { ...l, status: 'Cancelled' as const } : l)),
      }));
      showToast('Leave request cancelled.');
    } catch (e) {
      console.error('Failed to cancel leave', e);
      showToast('Failed to cancel leave.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveReason.trim()) return;

    const targetEmp = !isUserView
      ? state.employees.find((e) => e.id === selectedLeaveEmpId || e.employeeId === selectedLeaveEmpId) || state.employees[0]
      : state.employees.find((e) => e.id === state.currentPersona.id || e.employeeId === state.currentPersona.id) || {
        id: state.currentPersona.id,
        employeeId: state.currentPersona.id,
        name: state.currentPersona.name,
        department: state.currentPersona.department,
        avatar: state.currentPersona.avatar,
      };

    const finalStartDate = dayMode === 'single' ? singleDate : startDate;
    const finalEndDate = dayMode === 'single' ? singleDate : endDate;
    const finalReason = leaveReason.trim();
    const reasonWithHandover = leaveHandover ? `${finalReason} (Covered by: ${leaveHandover})` : finalReason;
    const targetEmpId = (targetEmp as any).id || (targetEmp as any).employeeId || state.currentPersona.id || '';

    setIsSaving(true);
    try {
      // WFH goes to Regularizations for manager approval
      if (leaveType === 'Work From Home' || toApiLeaveType(leaveType) === 'wfh') {
        const shiftStart =
          state.customOptions?.attendanceSettings?.workDayStartTime ||
          state.customOptions?.attendancePolicies?.workDayStartTime ||
          '09:00';
        const shiftEnd =
          state.customOptions?.attendanceSettings?.workDayEndTime ||
          state.customOptions?.attendancePolicies?.workDayEndTime ||
          '18:00';
        const to24 = (t: string) => {
          const m = String(t).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
          if (!m) return String(t).slice(0, 5) || '09:00';
          let h = parseInt(m[1], 10);
          const mins = m[2];
          const mer = m[3]?.toUpperCase();
          if (mer === 'PM' && h < 12) h += 12;
          if (mer === 'AM' && h === 12) h = 0;
          if (!mer && h <= 23) return `${String(h).padStart(2, '0')}:${mins}`;
          return `${String(h).padStart(2, '0')}:${mins}`;
        };
        const dates = eachDateInclusive(finalStartDate, finalEndDate);
        const createdRegs: AttendanceRegularization[] = [];
        for (const date of dates) {
          const created = await api.attendance.requestRegularization({
            employeeId: targetEmpId,
            date,
            requestedCheckIn: to24(shiftStart),
            requestedCheckOut: to24(shiftEnd),
            reason: 'Work From Home',
            remarks: reasonWithHandover,
          });
          if (!created.success) {
            showToast(created.error?.message || 'Failed to submit WFH request.');
            setIsSaving(false);
            return;
          }
          createdRegs.push({
            id: created.data?.id || `reg_${Date.now()}_${date}`,
            employeeId: created.data?.employee_id || targetEmpId,
            employeeName: targetEmp.name,
            avatar: (targetEmp as any).avatar || '',
            department: (targetEmp.department as any) || state.currentPersona.department,
            date,
            requestedCheckIn: shiftStart,
            requestedCheckOut: shiftEnd,
            reason: 'Work From Home',
            remarks: reasonWithHandover,
            status: 'Pending',
            appliedOn: new Date().toISOString().split('T')[0],
          });
        }
        onUpdateState((prev) => ({
          ...prev,
          regularizations: [...createdRegs, ...(prev.regularizations || [])],
          notifications: [
            {
              id: `notif_${Date.now()}`,
              title: 'WFH Request Submitted',
              message: `${targetEmp.name} requested work from home for ${dates.length} day(s). Approve under Attendance → Regularizations.`,
              timestamp: 'Just now',
              category: 'Approvals' as const,
              priority: 'high' as const,
              read: false,
              linkModule: 'attendance',
              linkTab: 'regularizations',
              actorName: targetEmp.name,
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
        showToast('WFH request sent to Regularizations for manager approval.');
        setIsSaving(false);
        return;
      }

      await api.attendance.requestLeave({
        employeeId: targetEmpId,
        leaveType: toApiLeaveType(leaveType),
        startDate: finalStartDate,
        endDate: finalEndDate,
        daysCount: computedLeaveDays,
        reason: reasonWithHandover,
      });

      const newLeave: LeaveRequest = {
        id: `lve_${Date.now()}`,
        employeeId: targetEmpId,
        employeeName: targetEmp.name,
        department: (targetEmp.department as any) || state.currentPersona.department || 'Operations',
        leaveType,
        startDate: finalStartDate,
        endDate: finalEndDate,
        daysCount: computedLeaveDays,
        reason: reasonWithHandover,
        status: 'Pending',
        appliedOn: new Date().toISOString().split('T')[0],
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
      showToast('Leave request submitted successfully.');
    } catch (err) {
      console.error('Failed to submit leave', err);
      showToast('Failed to submit leave request. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogTimesheetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const proj = state.projects.find((p) => p.id === tsProject);
    const task = state.tasks.find((t) => t.id === tsTask);

    setIsSaving(true);
    try {
      await api.projects.logTimesheet({
        employeeId: state.currentPersona.id,
        projectId: tsProject,
        taskId: tsTask,
        workDate: new Date().toISOString().substring(0, 10),
        hoursSpent: parseFloat(tsHours) || 8,
        description: tsDescription || 'Development sprint work',
      });

      const newTs: TimesheetEntry = {
        id: `ts_${Date.now()}`,
        employeeId: state.currentPersona.id,
        employeeName: state.currentPersona.name,
        projectId: tsProject,
        projectName: proj?.name || 'Acme Platform',
        taskId: tsTask,
        taskTitle: task?.title || 'General Task',
        date: new Date().toISOString().substring(0, 10),
        hours: parseFloat(tsHours) || 8,
        description: tsDescription || 'Development sprint work',
        billable: true,
        status: 'Approved',
      };

      onUpdateState((prev) => ({
        ...prev,
        timesheets: [newTs, ...prev.timesheets],
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'LOGGED_TIMESHEET',
            entity: 'TimesheetEntry',
            entityId: newTs.id,
            ipAddress: '106.51.72.18',
            details: `Logged ${newTs.hours}h for ${newTs.projectName}`,
          },
          ...prev.auditLogs,
        ],
      }));
      setShowLogTimesheetModal(false);
      setTsDescription('');
      showToast('Timesheet logged successfully.');
    } catch (err) {
      console.error('Failed to log timesheet', err);
      showToast('Failed to log timesheet. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddEmployee = async (newEmpData: Partial<Employee>) => {
    const cleanEmail = (newEmpData.email || '').trim().toLowerCase();
    const cleanName = (newEmpData.name || '').trim().toLowerCase();
    const cleanPhone = (newEmpData.phone || '').trim();

    const dup = state.employees.find((e) => {
      const eEmail = (e.email || '').trim().toLowerCase();
      const eName = (e.name || e.fullName || '').trim().toLowerCase();
      const ePhone = (e.phone || '').trim();

      if (cleanEmail && eEmail === cleanEmail) return true;
      if (cleanPhone && cleanPhone !== '—' && ePhone === cleanPhone) return true;
      if (cleanName && cleanEmail && eName === cleanName && eEmail === cleanEmail) return true;
      return false;
    });

    if (dup) {
      throw new Error(`An employee matching these details (${dup.name}, ${dup.email}) already exists.`);
    }

    const selectedMgrIds = Array.from(
      new Set(
        [
          newEmpData.managerId,
          ...((newEmpData.managerIds || []) as string[]),
        ].filter(Boolean) as string[]
      )
    );
    const selectedMgr = selectedMgrIds.length
      ? state.employees.find((e) => e.id === selectedMgrIds[0])
      : undefined;

    let mappedRole: Role = 'employee';
    const roleLower = (newEmpData.designation || '').toLowerCase();
    if (roleLower.includes('hr') || roleLower.includes('people')) {
      mappedRole = 'hr_manager';
    } else if (
      roleLower.includes('lead') ||
      roleLower.includes('manager') ||
      roleLower.includes('director') ||
      roleLower.includes('head')
    ) {
      mappedRole = 'manager';
    } else if (roleLower.includes('admin')) {
      mappedRole = 'admin';
    }

    const newEmp: Employee = {
      id: `emp_${Date.now()}`,
      employeeId: '',
      name: (newEmpData.name || '').trim(),
      fullName: (newEmpData.name || '').trim(),
      email: cleanEmail,
      phone: newEmpData.phone || '—',
      avatar: newEmpData.avatar || '',
      department: (newEmpData.department as any) || (isInstitution ? 'Faculty' : 'Development'),
      designation: newEmpData.designation || (isInstitution ? 'Professor' : 'Software Engineer'),
      team: newEmpData.team || `${newEmpData.department || 'General'} Core Team`,
      jobRoleId: newEmpData.jobRoleId,
      role: mappedRole,
      joiningDate: new Date().toISOString().substring(0, 10),
      employmentType: (newEmpData.employmentType as any) || 'Full-time',
      location: newEmpData.location || '',
      officeName: newEmpData.officeName || '',
      officeId: newEmpData.officeId,
      officeIds: newEmpData.officeIds || [],
      offices: newEmpData.offices,
      managerId: selectedMgr ? selectedMgr.id : '',
      managerIds: selectedMgrIds,
      managerName: selectedMgr ? selectedMgr.name : '',
      lineManager: selectedMgr
        ? {
            name: selectedMgr.name,
            username: `@${selectedMgr.name.toLowerCase().replace(/\s+/g, '')}`,
            avatar: selectedMgr.avatar,
            designation: selectedMgr.designation,
          }
        : undefined,
      skills: ['Onboarding Pending'],
      bankDetails: newEmpData.bankDetails || {
        accountNumber: '—',
        ifscCode: '—',
        bankName: '—',
      },
      salaryDetails: newEmpData.salaryDetails,
      payrollSummary: newEmpData.payrollSummary || {
        status: 'Active',
        jobTitle: newEmpData.designation || (isInstitution ? 'Professor' : 'Software Engineer'),
        employmentType: (newEmpData.employmentType as any) || 'Full-time',
        jobDate: new Date().toISOString().substring(0, 10),
        geofencing: 'Allowed',
        lastWorkingDate: '—',
        totalCompensation: (newEmpData.salaryDetails?.netPayable || 0) * 12,
        salary: newEmpData.salaryDetails?.netPayable || 0,
        recurring: newEmpData.salaryDetails?.netPayable || 0,
        oneOff: 0,
        offset1: 0,
        offset2: 0,
      },
      salaryType: newEmpData.salaryType || 'monthly',
      payrollGroupId: newEmpData.payrollGroupId,
      panNumber: newEmpData.panNumber,
      pfUanNumber: newEmpData.pfUanNumber,
      esiNumber: newEmpData.esiNumber,
      emergencyContact: {
        name: '—',
        relation: '—',
        phone: '—',
      },
      status: 'Not Activated',
      isActivated: false,
      isDeactivated: false,
      accountStatus: 'Not Activated',
      hasCompletedProfile: false,
      onboardingProgress: 0,
      probationStatus: newEmpData.probationStatus || (state.customOptions?.probationSettings?.enabled !== false ? 'in_probation' : 'confirmed'),
      probationPeriodMonths: newEmpData.probationPeriodMonths ?? (state.customOptions?.probationSettings?.defaultDurationMonths || 3),
      probationEndDate: newEmpData.probationEndDate || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + (state.customOptions?.probationSettings?.defaultDurationMonths || 3));
        return d.toISOString().split('T')[0];
      })(),
      leaveBalances: newEmpData.leaveBalances || {
        casualLeave: 12,
        sickLeave: 10,
        earnedLeave: 15,
        compOff: 0,
      },
    };

    const nameParts = (newEmpData.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Employee';
    const lastName = nameParts.slice(1).join(' ') || '';

    setIsSaving(true);
    try {
      const teamName = newEmp.team || `${newEmp.department || 'General'} Team`;
      const teamId = await resolveOrCreateTeamId({
        departmentName: newEmp.department,
        teamName,
        leadEmployeeId: selectedMgr?.id,
      });

      const createRes = await api.identity.createEmployee({
        firstName,
        lastName,
        email: newEmp.email,
        phone: newEmp.phone,
        officeName: newEmp.officeName,
        officeId: newEmp.officeId,
        officeIds: newEmp.officeIds,
        department: newEmp.department,
        teamId,
        designation: newEmp.designation,
        jobRoleId: newEmp.jobRoleId,
        role: toApiAuthRole(newEmp.role),
        reportingManagerId: selectedMgr?.id,
        managerIds: selectedMgrIds,
        employmentType: newEmp.employmentType,
        employmentStatus: newEmp.probationStatus === 'in_probation' ? 'on_probation' : 'active',
        probationStatus: newEmp.probationStatus,
        probationEndDate: newEmp.probationEndDate,
        salaryCurrency:
          state.customOptions?.payrollSettings?.defaultCurrency ||
          state.customOptions?.employeeIdSettings?.defaultCurrency ||
          'INR',
        accountStatus: 'Not Activated',
        dateOfJoining: newEmp.joiningDate,
        sendInvite: state.customOptions?.onboardingAutomation?.autoSendWelcomeEmail !== false,
      });

      if (!createRes.success) {
        throw new Error(createRes.error?.message || 'Failed to create employee');
      }

      if (createRes.data?.id) {
        newEmp.id = createRes.data.id;
      }
      const assignedCode = (createRes.data as any)?.employee_code || (createRes.data as any)?.employeeCode;
      if (assignedCode) {
        newEmp.employeeId = String(assignedCode);
      }
      const inviteSent = Boolean((createRes.data as any)?.invite_sent);
      if (inviteSent) {
        newEmp.accountStatus = 'Invited';
      }

      if (newEmp.salaryDetails && Number(newEmp.salaryDetails.basic) > 0) {
        try {
          await api.payroll.setSalaryStructure({
            employeeId: newEmp.id,
            baseSalary: newEmp.salaryDetails.basic,
            hra: newEmp.salaryDetails.hra,
            specialAllowance: newEmp.salaryDetails.specialAllowance,
            conveyanceAllowance: newEmp.salaryDetails.conveyanceAllowance,
            medicalAllowance: newEmp.salaryDetails.medicalAllowance,
            otherAllowances: newEmp.salaryDetails.otherAllowances,
            allowances: newEmp.salaryDetails.allowanceItems,
            providentFundDeduction: newEmp.salaryDetails.pfDeduction,
            taxDeduction: newEmp.salaryDetails.taxDeduction,
          });
        } catch (salaryErr) {
          console.error('Employee created but salary was not saved', salaryErr);
          showToast('Employee added. Salary could not be saved, so add it from their profile.');
        }
      }

      onUpdateState((prev) => ({
        ...prev,
        employees: [newEmp, ...prev.employees],
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: state.currentPersona.name,
            action: 'INVITED_EMPLOYEE',
            entity: 'Employee',
            entityId: newEmp.id,
            ipAddress: '106.51.72.18',
            details: `Invited new employee ${newEmp.name} (${newEmp.email}) to ${newEmp.department} as ${newEmp.designation}`,
          },
          ...prev.auditLogs,
        ],
        notifications: [
          {
            id: `notif_${Date.now()}`,
            title: inviteSent ? 'Employee Invitation Sent' : 'Employee Added',
            message: inviteSent
              ? `Setup email sent to ${newEmp.name} (${newEmp.email}). They'll create their own password from the link.`
              : `${newEmp.name} was added, but the invite email could not be sent. Use "Resend invite" in the directory.`,
            timestamp: 'Just now',
            category: 'HR' as const,
            priority: 'medium' as const,
            read: false,
            linkModule: 'HR',
            linkTab: 'employees',
            actorName: state.currentPersona.name,
            actionLabel: 'View Directory',
          },
          ...prev.notifications,
        ],
      }));

      setShowAddEmployeeModal(false);
      showToast(
        inviteSent
          ? `Invite sent to ${newEmp.email}`
          : `Employee added. Invite email failed, so use "Resend invite" to try again.`
      );
    } catch (err) {
      console.error('Failed to add employee', err);
      const message = err instanceof Error ? err.message : 'Failed to add employee';
      showToast(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdateEmployee = async (updatedEmp: Employee) => {
    const fullName = updatedEmp.fullName || updatedEmp.name || '';
    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Employee';
    const lastName = nameParts.slice(1).join(' ') || '';

    setIsSaving(true);
    try {
      const department = alignedDepartment(
        updatedEmp.department,
        updatedEmp.team,
        state.customOptions?.departments || []
      );
      const teamName = updatedEmp.team || `${department || 'General'} Team`;
      const teamId = await resolveOrCreateTeamId({
        departmentName: department,
        teamName,
        leadEmployeeId: updatedEmp.managerId || undefined,
      });

      // Avatar / bank / salary have dedicated save paths — omit them here so a
      // personal-info (or address/job) edit is not blocked by a large avatar PUT
      // or a secondary bank/salary sync failure.
      const updateRes = await api.identity.updateEmployee(updatedEmp.id, {
        firstName,
        lastName,
        email: updatedEmp.email,
        phone: updatedEmp.phone,
        officeName: updatedEmp.officeName || updatedEmp.location,
        officeId: updatedEmp.officeId,
        officeIds: updatedEmp.officeIds,
        department,
        teamId,
        team: teamName,
        designation: updatedEmp.designation,
        role: toApiAuthRole(updatedEmp.role),
        reportingManagerId: updatedEmp.managerId || undefined,
        employmentStatus:
          updatedEmp.status?.toLowerCase() === 'probation' || updatedEmp.probationStatus === 'in_probation'
            ? 'on_probation'
            : updatedEmp.status?.toLowerCase() === 'terminated'
            ? 'terminated'
            : updatedEmp.status?.toLowerCase() === 'suspended'
            ? 'suspended'
            : 'active',
        status: updatedEmp.accountStatus || updatedEmp.status || 'Active',
        isActivated: (updatedEmp.accountStatus || updatedEmp.status) !== 'Not Activated',
        isDeactivated: (updatedEmp.accountStatus || updatedEmp.status) === 'Deactivated' || (updatedEmp.accountStatus || updatedEmp.status) === 'Suspended',
        accountStatus: (updatedEmp.accountStatus || updatedEmp.status || 'Active') as AccountStatus,
        dateOfJoining: updatedEmp.joiningDate || updatedEmp.joinDate || undefined,
        dateOfBirth: updatedEmp.dateOfBirth && updatedEmp.dateOfBirth.trim() !== '' && updatedEmp.dateOfBirth !== '—' ? updatedEmp.dateOfBirth.trim() : null,
        gender: updatedEmp.gender && updatedEmp.gender !== 'None' ? updatedEmp.gender : null,
        bloodGroup: updatedEmp.bloodGroup,
        maritalStatus: updatedEmp.maritalStatus,
        nationality: updatedEmp.nationality,
        primaryAddress: updatedEmp.primaryAddress,
        city: updatedEmp.city,
        stateProvince: updatedEmp.stateProvince,
        postalCode: updatedEmp.postalCode,
        country: updatedEmp.country,
        personalTaxId: updatedEmp.personalTaxId,
        socialInsurance: updatedEmp.socialInsurance,
        healthInsurance: updatedEmp.healthInsurance,
        emergencyContact: updatedEmp.emergencyContact,
        customFieldValues: updatedEmp.customFieldValues,
        uploadedDocuments: updatedEmp.uploadedDocuments,
        bio: updatedEmp.bio ?? null,
        exitDate: updatedEmp.exitDate || null,
        noticePeriodEndDate: updatedEmp.noticePeriodEndDate || null,
        fnfDueDate: updatedEmp.fnfDueDate || null,
        offboardingChecklist: updatedEmp.offboardingChecklist || null,
        salaryCurrency: updatedEmp.salaryCurrency || null,
        probationStatus: updatedEmp.probationStatus || null,
        probationEndDate: updatedEmp.probationEndDate || null,
      });

      if (!updateRes.success) {
        throw new Error(updateRes.error?.message || 'Failed to update employee');
      }

      const apiEmp = updateRes.data || {};
      const mergedEmp: Employee = {
        ...updatedEmp,
        name: fullName || updatedEmp.name,
        fullName: fullName || updatedEmp.fullName,
        officeId: apiEmp.office_id || apiEmp.officeId || updatedEmp.officeId,
        officeName: apiEmp.office_name || apiEmp.officeName || updatedEmp.officeName,
        department: apiEmp.department_name || apiEmp.departmentName || department || updatedEmp.department,
        designation: apiEmp.job_title || apiEmp.jobTitle || updatedEmp.designation,
        team:
          apiEmp.team_name != null || apiEmp.teamName != null
            ? String(apiEmp.team_name || apiEmp.teamName || '')
            : updatedEmp.team,
        teamId: apiEmp.team_id || apiEmp.teamId || updatedEmp.teamId,
        officeIds: Array.isArray(apiEmp.office_ids)
          ? apiEmp.office_ids.map(String)
          : Array.isArray(apiEmp.offices)
            ? apiEmp.offices.map((o: any) => String(o.id))
            : updatedEmp.officeIds,
        offices: Array.isArray(apiEmp.offices)
          ? apiEmp.offices.map((o: any) => ({
              id: String(o.id),
              name: String(o.name || ''),
              isPrimary: Boolean(o.isPrimary ?? o.is_primary),
            }))
          : updatedEmp.offices,
      };

      onUpdateState((prev) => {
        const isCurrentPersona =
          (prev.currentPersona?.id && prev.currentPersona.id === mergedEmp.id) ||
          (prev.currentPersona?.email && prev.currentPersona.email.toLowerCase() === (mergedEmp.email || '').toLowerCase());

        return {
          ...prev,
          employees: prev.employees.map((e) => (e.id === mergedEmp.id ? mergedEmp : e)),
          currentPersona: isCurrentPersona
            ? {
                ...prev.currentPersona,
                name: mergedEmp.name,
                email: mergedEmp.email || prev.currentPersona.email,
                avatar: mergedEmp.avatar || prev.currentPersona.avatar,
                designation: mergedEmp.designation || prev.currentPersona.designation,
                department: (mergedEmp.department as any) || prev.currentPersona.department,
              }
            : prev.currentPersona,
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: prev.currentPersona.name,
              action: 'UPDATED_EMPLOYEE_PROFILE',
              entity: 'Employee',
              entityId: mergedEmp.id,
              ipAddress: '106.51.72.18',
              details: `Updated details for ${mergedEmp.name} (${mergedEmp.employeeId})`,
            },
            ...prev.auditLogs,
          ],
          notifications: [
            {
              id: `notif_${Date.now()}`,
              title: 'Employee Profile Updated',
              message: `${mergedEmp.name}'s profile details were modified by ${prev.currentPersona.name}.`,
              timestamp: 'Just now',
              category: 'HR' as const,
              priority: 'low' as const,
              read: false,
              linkModule: 'HR',
              linkTab: 'employees',
              actionLabel: 'View Profile',
            },
            ...prev.notifications,
          ],
        };
      });

      setSelectedEmployee(mergedEmp);
      showToast('Employee updated successfully');
    } catch (err) {
      console.error('Failed to update employee', err);
      showToast(err instanceof Error ? err.message : 'Failed to update employee');
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // IF AN EMPLOYEE IS CLICKED/SELECTED BY ADMIN/HR, OR SELF (READ-ONLY), DISPLAY DETAIL VIEW
  if (selectedEmployee && (canEditProfiles || isSelfEmployee(selectedEmployee))) {
    return (
      <EmployeeDetailView
        employee={selectedEmployee}
        allEmployees={state.employees}
        onSelectEmployee={(emp) => {
          handleSelectEmployee(emp);
          if (canEditProfiles || isSelfEmployee(emp)) {
            setSelectedEmployeeTab('attendance_leave');
          }
        }}
        onOpenDepartment={handleSelectDepartment}
        onUpdateEmployee={handleUpdateEmployee}
        onBack={() => {
          setSelectedEmployee(null);
          setPublicProfileEmployee(null);
          setSelectedEmployeeTab('general');
        }}
        state={state}
        initialTab={selectedEmployeeTab}
      />
    );
  }

  if (selectedDepartmentName) {
    return (
      <DepartmentDetailView
        departmentName={selectedDepartmentName}
        state={state}
        canEdit={canEditProfiles}
        onBack={() => setSelectedDepartmentName(null)}
        onSelectEmployee={(emp) => {
          handleSelectEmployee(emp);
        }}
        onUpdateState={onUpdateState}
        onSaved={(patch) => {
          onUpdateState((prev) => applyDepartmentLocalUpdate(prev, patch));
          setSelectedDepartmentName(patch.name);
        }}
        onDeleted={(id, name) => {
          onUpdateState((prev) => removeDepartmentLocal(prev, id, name));
          setSelectedDepartmentName(null);
        }}
      />
    );
  }

  // Status Badge Helper matching corporate blue design system
  const renderStatusBadge = (status: string, isActivated?: boolean) => {
    let text = 'Active';
    let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';

    const s = (status || '').toLowerCase().trim();

    if (s === 'probation' || s === 'in probation' || s === 'on_probation') {
      text = 'In Probation';
      badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
    } else if (s === 'on leave' || s === 'onleave') {
      text = 'On Leave';
      badgeClass = 'bg-purple-50 text-purple-700 border-purple-200';
    } else if (s === 'notice period') {
      text = 'Notice Period';
      badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
    } else if (s === 'terminated' || s === 'deactivated' || s === 'suspended') {
      text = s === 'suspended' ? 'Suspended' : 'Deactivated';
      badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
    } else if (
      isActivated === false ||
      s === 'not activated' ||
      s === 'invited'
    ) {
      text = 'Not Activated';
      badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}`}>
        {text}
      </span>
    );
  };

  const coworkerPeopleTabs = [
    { id: 'my_team', label: 'My Team' },
    { id: 'organization', label: 'Organization' },
    ...(allowCoworkerDirectoryAccess
      ? [{ id: 'directory', label: isInstitution ? 'Staff Cards' : 'Directory' }]
      : []),
    { id: 'org_chart', label: 'Org Chart' },
  ];

  const peopleTabs =
    moduleScope === 'employees'
      ? canEditProfiles
        ? isInstitution
          ? [
              { id: 'employees', label: 'Staff & Faculty' },
              { id: 'students', label: 'Students' },
              { id: 'directory', label: 'Staff Cards' },
              { id: 'org_chart', label: 'Org Chart' },
            ]
          : [
              { id: 'employees', label: 'Employees' },
              { id: 'directory', label: 'Directory' },
              { id: 'org_chart', label: 'Org Chart' },
            ]
        : isInstitution
          ? [...coworkerPeopleTabs, { id: 'students', label: 'Students' }]
          : coworkerPeopleTabs
      : canEditProfiles
        ? isInstitution
          ? [
              { id: 'employees', label: 'Staff & Faculty' },
              { id: 'students', label: 'Students' },
              { id: 'directory', label: 'Staff Cards' },
              { id: 'org_chart', label: 'Org Chart' },
              { id: 'attendance', label: 'Staff Attendance' },
              { id: 'leaves', label: 'Leave Applications' },
            ]
          : [
              { id: 'employees', label: 'Employees' },
              { id: 'directory', label: 'Directory' },
              { id: 'org_chart', label: 'Org Chart' },
              { id: 'attendance', label: 'Attendance' },
              { id: 'leaves', label: 'Leave Applications' },
            ]
        : isInstitution
          ? [
              ...coworkerPeopleTabs,
              { id: 'students', label: 'Students' },
              { id: 'attendance', label: 'Staff Attendance' },
              { id: 'leaves', label: 'Leave Applications' },
            ]
          : [
              ...coworkerPeopleTabs,
              { id: 'attendance', label: 'Time & Attendance' },
              { id: 'leaves', label: 'Leave Applications' },
            ];

  return (
    <div className={moduleScope === 'employees' ? 'people-studio employees-page' : 'w-full min-w-0 max-w-full space-y-3.5'}>
      <div className={moduleScope === 'employees' ? 'people-studio__head' : 'flex flex-col justify-between gap-3 sm:flex-row sm:items-center'}>
        <h1 className={moduleScope === 'employees' ? 'people-studio__title' : 'text-lg font-bold tracking-tight text-[#0f172a] sm:text-xl'}>
          {activeTab === 'directory'
            ? (isInstitution ? 'Staff directory' : 'People directory')
            : activeTab === 'org_chart'
            ? 'Organization chart'
            : (activeTab as string) === 'my_team'
            ? 'My team'
            : (activeTab as string) === 'organization'
            ? 'Organization'
            : moduleScope === 'attendance'
            ? 'Attendance & Leaves'
            : isInstitution
            ? 'Staff'
            : 'Employees'}
        </h1>

        {canEditProfiles && moduleScope === 'employees' && (
          <div className="people-studio__actions">
            <button type="button" onClick={handleDownloadCSV} className="people-studio__btn people-studio__btn--secondary">
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => setIdCardBatch(state.employees || [])}
              disabled={!(state.employees && state.employees.length)}
              className="people-studio__btn people-studio__btn--secondary"
            >
              <Printer className="h-3.5 w-3.5" /> Print ID cards
            </button>
            <button type="button" onClick={() => setShowAddEmployeeModal(true)} className="people-studio__btn people-studio__btn--primary">
              <Plus className="h-3.5 w-3.5" /> {isInstitution ? 'Add Staff' : 'Add Employee'}
            </button>
          </div>
        )}

        {canEditProfiles && moduleScope !== 'employees' && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition-all hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => setIdCardBatch(state.employees || [])}
              disabled={!(state.employees && state.employees.length)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition-all hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5 text-slate-500" /> Print ID cards
            </button>
            <button
              type="button"
              onClick={() => setShowAddEmployeeModal(true)}
              className="people-studio__btn people-studio__btn--primary"
            >
              <Plus className="h-3.5 w-3.5" /> {isInstitution ? 'Add Staff' : 'Add Employee'}
            </button>
          </div>
        )}
      </div>

      {moduleScope !== 'attendance' && (
        <div role="tablist" aria-label="People views" className={moduleScope === 'employees' ? 'people-studio__tabs no-scrollbar touch-pan-x' : 'flex w-full items-center gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100/80 p-1.5 no-scrollbar touch-pan-x'}>
          {peopleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id as any)}
                className={
                  moduleScope === 'employees'
                    ? `people-studio__tab${isActive ? ' is-active' : ''}`
                    : `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer ${
                        isActive
                          ? 'bg-white text-[#0f172a] shadow-sm'
                          : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                      }`
                }
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* TAB 1: EMPLOYEES TABLE (ORGANIZATION / MY TEAM) */}
      {(activeTab === 'employees' ||
        (activeTab as string) === 'my_team' ||
        (activeTab as string) === 'organization') && (
        <EmployeeTableTab
          state={state}
          isUserView={isUserView}
          isManager={isManager}
          isSuperAdmin={isSuperAdmin}
          isHR={isHR}
          isInstitution={isInstitution}
          initialScope={
            (activeTab as string) === 'my_team' ? 'team' : 'all'
          }
          onScopeChange={(scope) => {
            if (scope === 'team') setActiveTab('my_team' as any);
            else setActiveTab(canEditProfiles ? 'employees' : ('organization' as any));
          }}
          onSelectEmployee={handleSelectEmployee}
          onSelectDepartment={handleSelectDepartment}
          onResendInvite={isSuperAdmin || isHR ? handleResendInvite : undefined}
          onPrintIdCards={canEditProfiles ? setIdCardBatch : undefined}
        />
      )}

      {/* TAB: STUDENTS DIRECTORY (INSTITUTE MODE) */}
      {activeTab === 'students' && (
        <StudentDirectoryModule
          state={state}
          onUpdateState={onUpdateState}
        />
      )}

      {/* TAB 2: DIRECTORY / STAFF CARDS */}
      {activeTab === 'directory' && (
        <StaffCardsTab
          state={state}
          isInstitution={isInstitution}
          accessibleEmployees={
            canEditProfiles || allowCoworkerDirectoryAccess ? state.employees : accessibleEmployees
          }
          onSelectEmployee={handleSelectEmployee}
          onPrintIdCards={canEditProfiles ? setIdCardBatch : undefined}
        />
      )}

      {/* TAB 3: ORG CHART */}
      {activeTab === 'org_chart' && (
        <OrgChartModule
          state={state}
          onUpdateState={onUpdateState}
          onSelectEmployee={handleSelectEmployee}
        />
      )}

      {/* TAB 2: TIME & ATTENDANCE / ATTENDANCE & LEAVES */}
      {(activeTab === 'attendance' || (activeTab as string) === 'attendance_leaves') && (
        <KekaAttendanceModule
          state={state}
          onUpdateState={onUpdateState}
          onCheckInAttendance={onCheckInAttendance}
          onSelectEmployee={(emp) => {
            handleSelectEmployee(emp);
            if (canEditProfiles || isSelfEmployee(emp)) {
              setSelectedEmployeeTab('attendance_leave');
            }
          }}
        />
      )}

      {/* TAB 3: LEAVE APPLICATION & APPROVALS */}
      {activeTab === 'leaves' && (
        isUserView ? (
          <div className="space-y-5">
            {/* Header with Apply Action */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-white">Leave Application & Balance</h2>
              </div>

              <button
                onClick={() => setShowApplyLeaveModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2 text-xs font-bold text-white transition-all cursor-pointer shadow-sm active:scale-98"
              >
                <Plus className="h-4 w-4" /> Apply for Leave
              </button>
            </div>

            {/* Current Leaves Left (4 Balance Cards - Dynamically Synced) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Card 1: Casual Leave */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Casual Leave</span>
                  {casualPending > 0 ? (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      {casualPending}d pending
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">{casualUsed}d used</span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {formatLeaveDays(casualLeft)} <span className="text-xs font-normal text-slate-500">/ {formatLeaveDays(casualQuota)} Days Left</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (casualLeft / casualQuota) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Sick Leave */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Sick Leave</span>
                  {sickPending > 0 ? (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      {sickPending}d pending
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">{sickUsed}d used</span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {formatLeaveDays(sickLeft)} <span className="text-xs font-normal text-slate-500">/ {formatLeaveDays(sickQuota)} Days Left</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (sickLeft / sickQuota) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Earned / Privilege */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Earned / Privilege</span>
                  {earnedPending > 0 ? (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                      {earnedPending}d pending
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">{earnedUsed}d used</span>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 tabular-nums">
                    {formatLeaveDays(earnedLeft)} <span className="text-xs font-normal text-slate-500">/ {formatLeaveDays(earnedQuota)} Days Left</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (earnedLeft / earnedQuota) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card 4: Work From Home */}
              {!isInstitution && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">Work From Home</span>
                    {wfhPending > 0 ? (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        {wfhPending}d pending
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">{wfhUsed}d used</span>
                    )}
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 tabular-nums">
                      {formatLeaveDays(wfhLeft)} <span className="text-xs font-normal text-slate-500">/ {formatLeaveDays(wfhQuota)} Days Left</span>
                    </p>
                    <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, (wfhLeft / wfhQuota) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Past Leaves History Section */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden space-y-3 p-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-slate-900">History of Past Leaves & Requests</h3>
                  <span className="text-xs text-slate-500">
                    ({userLeaves.length} records)
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={leaveFilterStatus}
                    onChange={(e) => setLeaveFilterStatus(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg outline-none cursor-pointer"
                  >
                    <option value="All">All Status</option>
                    <option value="Pending">Pending Approval</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected / Declined</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3 text-slate-900 font-bold">Leave Type</th>
                      <th className="p-3">Dates & Duration</th>
                      <th className="p-3">Feasible Reason</th>
                      <th className="p-3">Applied On</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium text-slate-700 divide-y divide-slate-100">
                    {userLeaves
                      .filter((l) => leaveFilterStatus === 'All' || l.status === leaveFilterStatus)
                      .length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-xs text-slate-400">
                          No leave applications found matching the selected filter. Click &ldquo;+ Apply for Leave&rdquo; to submit a new request.
                        </td>
                      </tr>
                    ) : (
                      userLeaves
                        .filter((l) => leaveFilterStatus === 'All' || l.status === leaveFilterStatus)
                        .map((leave) => (
                          <tr key={leave.id} className="hover:bg-slate-50 transition-colors">
                            <td className="p-3">
                              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 border border-slate-200 text-slate-700">
                                {leave.leaveType}
                              </span>
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span className="font-semibold text-slate-900 tabular-nums">{leave.startDate} to {leave.endDate}</span>
                              <span className="ml-2 text-[11px] text-blue-600 font-semibold">({leave.daysCount}d)</span>
                            </td>
                            <td className="p-3 text-slate-500 max-w-sm truncate" title={leave.reason}>
                              {leave.reason}
                            </td>
                            <td className="p-3 text-slate-500 text-[11px] whitespace-nowrap tabular-nums">
                              {leave.appliedOn || new Date().toISOString().split('T')[0]}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              <span
                                className={`rounded-md px-2.5 py-0.5 text-[10px] font-semibold border ${leave.status === 'Approved'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : leave.status === 'Pending'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                  }`}
                              >
                                {leave.status}
                              </span>
                            </td>
                            <td className="p-3 text-right whitespace-nowrap">
                              {leave.status === 'Pending' ? (
                                <button
                                  onClick={() => handleCancelLeave(leave.id)}
                                  className="text-xs text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                                >
                                  Cancel Request
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400">Reviewed</span>
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
          <div className="space-y-4">
            {/* HR Approvals View */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900">Leave Approvals & Workforce Time Off</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review and authorize team member leave applications, sick leaves, and work from home requests.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                {state.leaves.some((l) => l.status === 'Pending') && (
                  <button
                    onClick={handleApproveAllPending}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white transition-all cursor-pointer shadow-sm"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Approve All Pending
                  </button>
                )}
                <button
                  onClick={() => setShowApplyLeaveModal(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white transition-all cursor-pointer shadow-sm"
                >
                  <Plus className="h-4 w-4" /> Log Leave for Employee
                </button>
              </div>
            </div>

            {/* 3 Metric Cards for HR */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-xs font-semibold text-amber-800">Pending Approvals</span>
                  <p className="text-2xl font-bold text-amber-600 mt-1">
                    {state.leaves.filter((l) => l.status === 'Pending').length}
                  </p>
                </div>
                <Clock className="h-6 w-6 text-amber-600 stroke-[1.8]" />
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-xs font-semibold text-blue-800">Approved Leaves</span>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {state.leaves.filter((l) => l.status === 'Approved').length}
                  </p>
                </div>
                <CheckCircle2 className="h-6 w-6 text-blue-600 stroke-[1.8]" />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-xs font-semibold text-slate-500">Total Logged Requests</span>
                  <p className="text-2xl font-bold text-slate-900 mt-1">
                    {state.leaves.length}
                  </p>
                </div>
                <Calendar className="h-6 w-6 text-slate-400 stroke-[1.8]" />
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <div className="relative w-full md:w-80">
                <input
                  type="text"
                  value={leaveSearchQuery}
                  onChange={(e) => setLeaveSearchQuery(e.target.value)}
                  placeholder="Search team member or reason..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-3.5 pr-9 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 transition-all"
                />
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>

              <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                <select
                  value={leaveFilterStatus}
                  onChange={(e) => setLeaveFilterStatus(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Status</option>
                  <option value="Pending">Pending Only</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                </select>

                <select
                  value={leaveFilterDept}
                  onChange={(e) => setLeaveFilterDept(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="All">All Departments</option>
                  <option value="Development">Development</option>
                  <option value="Sales">Sales</option>
                  <option value="HR">HR</option>
                  <option value="Finance">Finance</option>
                  <option value="Operations">Operations</option>
                </select>
              </div>
            </div>

            {/* HR Approvals Table */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="p-3 text-slate-900 font-bold">Team Member</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Leave Type</th>
                    <th className="p-3">Dates & Duration</th>
                    <th className="p-3">Feasible Reason</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="font-medium text-slate-700 divide-y divide-slate-100">
                  {state.leaves
                    .filter((l) => {
                      const matchesSearch =
                        l.employeeName.toLowerCase().includes(leaveSearchQuery.toLowerCase()) ||
                        l.reason.toLowerCase().includes(leaveSearchQuery.toLowerCase());
                      const matchesStatus = leaveFilterStatus === 'All' || l.status === leaveFilterStatus;
                      const matchesDept = leaveFilterDept === 'All' || l.department === leaveFilterDept;
                      return matchesSearch && matchesStatus && matchesDept;
                    })
                    .length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-xs text-slate-400">
                        No leave requests found matching the current filters.
                      </td>
                    </tr>
                  ) : (
                    state.leaves
                      .filter((l) => {
                        const matchesSearch =
                          l.employeeName.toLowerCase().includes(leaveSearchQuery.toLowerCase()) ||
                          l.reason.toLowerCase().includes(leaveSearchQuery.toLowerCase());
                        const matchesStatus = leaveFilterStatus === 'All' || l.status === leaveFilterStatus;
                        const matchesDept = leaveFilterDept === 'All' || l.department === leaveFilterDept;
                        return matchesSearch && matchesStatus && matchesDept;
                      })
                      .map((leave) => (
                        <tr key={leave.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                const emp = state.employees.find(
                                  (e) => e.id === leave.employeeId || e.name.toLowerCase() === leave.employeeName.toLowerCase()
                                );
                                if (emp) handleSelectEmployee(emp);
                              }}
                              className="text-left font-semibold text-slate-900 hover:text-blue-600 hover:underline cursor-pointer transition-colors"
                              title={`View profile for ${leave.employeeName}`}
                            >
                              {leave.employeeName}
                            </button>
                          </td>
                          <td className="p-3 text-slate-500 whitespace-nowrap">{leave.department}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 border border-slate-200 text-slate-700">
                              {leave.leaveType}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 text-[11px] whitespace-nowrap tabular-nums">
                            {leave.startDate} to {leave.endDate} <strong className="text-slate-900">({leave.daysCount}d)</strong>
                          </td>
                          <td className="p-3 text-slate-500 max-w-xs truncate" title={leave.reason}>{leave.reason}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide ${
                                leave.status === 'Approved'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : leave.status === 'Pending'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {leave.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                            {canApproveLeave(state.currentPersona, leave, state.employees, state.customOptions?.leaveSettings?.approvalWorkflow) ? (
                              leave.status === 'Pending' || leave.status === 'Manager approved' ? (
                                <>
                                  {(() => {
                                    const emp = state.employees.find(
                                      (e) => e.id === leave.employeeId || (e.name && e.name.toLowerCase() === leave.employeeName.toLowerCase())
                                    );
                                    const inProbation = isEmployeeInProbation(emp, state.customOptions?.probationSettings);
                                    const isPaid = isPaidLeaveType(leave.leaveType, (leave as any).isPaid);

                                    if (inProbation && isPaid) {
                                      return (
                                        <button
                                          type="button"
                                          onClick={() => handleApproveAsUnpaid(leave.id)}
                                          className="rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1 text-[11px] font-bold text-white cursor-pointer transition-all shadow-xs"
                                          title="Employee in probation: Approve as Loss of Pay (Unpaid)"
                                        >
                                          Approve as LOP
                                        </button>
                                      );
                                    }

                                    return (
                                      <button
                                        type="button"
                                        onClick={() => handleApproveLeave(leave.id, true)}
                                        className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1 text-[11px] font-bold text-white cursor-pointer transition-all shadow-xs"
                                      >
                                        Approve
                                      </button>
                                    );
                                  })()}
                                  <button
                                    type="button"
                                    onClick={() => handleApproveLeave(leave.id, false)}
                                    className="rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 px-3 py-1 text-[11px] font-bold text-slate-700 hover:text-rose-700 cursor-pointer transition-all shadow-2xs ml-1.5"
                                  >
                                    Decline
                                  </button>
                                </>
                              ) : (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="text-[11px] text-slate-400">
                                    {leave.status === 'Approved' ? '✓ Approved' : '✗ Declined'} by {leave.approvedBy || 'Manager'}
                                  </span>
                                  {(isExecutiveOrAdmin(state.currentPersona) || isHRPersona(state.currentPersona)) && (
                                    <button
                                      onClick={() => handleApproveLeave(leave.id, leave.status !== 'Approved')}
                                      className="text-[10px] text-blue-600 hover:underline cursor-pointer ml-1"
                                    >
                                      (Revert)
                                    </button>
                                  )}
                                </div>
                              )
                            ) : (
                              <span className="text-[11px] text-slate-400">
                                {leave.status === 'Pending' ? 'Pending Approval' : `${leave.status} by ${leave.approvedBy || 'Authorized Manager'}`}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* TAB 4: TIMESHEETS */}
      {activeTab === 'timesheets' && (
        <TimesheetsModule
          state={state}
          onUpdateState={onUpdateState}
        />
      )}

      {/* TAB 5: PAYROLL */}
      {activeTab === 'payroll' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-[#282830] pb-2">
            <span className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 text-white shadow-sm">
              Payroll Processing & Runs
            </span>
            <a href="/settings?section=payroll" className="px-4 py-2 text-xs font-bold text-[#9e9ea7] transition-colors hover:bg-[#18181d]">Payroll settings &amp; groups</a>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#121214] p-5 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Monthly Payroll Processing (August 2026)</h2>
                  <p className="text-xs text-slate-500 dark:text-[#9e9ea7]">Multi-group disbursement records across Monthly, Hourly, and Statutory structures</p>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href="/settings?section=payroll"
                    className="rounded-xl border border-slate-200 dark:border-[#383842] bg-white dark:bg-[#18181d] px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[#222228]"
                  >
                    Configure Groups
                  </a>
                  <button
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        await api.payroll.executePayrollRun({
                          month: 8,
                          year: 2026,
                          executedByEmployeeId: state.currentPersona.id,
                        });
                        
                        const newLog = {
                          id: `log_${Date.now()}`,
                          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                          user: state.currentPersona.name,
                          action: 'PAYROLL_PROCESSED',
                          entity: 'PayrollRun',
                          entityId: `run_${Date.now()}`,
                          ipAddress: '106.51.72.18',
                          details: `Executed August 2026 payroll cycle across all active payroll groups`,
                        };
                        onUpdateState((prev) => ({
                          ...prev,
                          auditLogs: [newLog, ...prev.auditLogs],
                        }));
                        showToast('Payroll processed successfully');
                      } catch (err) {
                        console.error('Failed to run payroll', err);
                        showToast('Failed to run payroll cycle');
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    className="rounded-xl bg-blue-600 hover:bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white cursor-pointer transition-all shadow-sm"
                  >
                    Run Payroll Cycle
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-[#282830] rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-[#18181d] text-slate-600 dark:text-[#9e9ea7] border-b border-slate-200 dark:border-[#282830] font-bold uppercase text-[10px]">
                    <tr>
                      <th className="p-3">Employee</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Salary Type</th>
                      <th className="p-3">Basic / Regular Pay</th>
                      <th className="p-3">Allowances / OT</th>
                      <th className="p-3">Deductions (PF/Tax)</th>
                      <th className="p-3">Net Salary</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="font-medium text-slate-700 dark:text-slate-300 divide-y divide-slate-100 dark:divide-[#282830]">
                    {state.payrolls.map((pr) => {
                      const emp = state.employees.find((e) => e.id === pr.employeeId);
                      const salaryType = pr.salaryType || emp?.salaryType || 'monthly';
                      return (
                        <tr key={pr.id} className="hover:bg-slate-50 dark:hover:bg-[#18181d] transition-colors">
                          <td className="p-3 font-bold text-slate-900 dark:text-white">{pr.employeeName}</td>
                          <td className="p-3 text-slate-500 dark:text-[#9e9ea7]">{pr.department || 'Development'}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-[#202028] text-slate-800 dark:text-slate-300">
                              {salaryType}
                            </span>
                          </td>
                          <td className="p-3 font-mono">₹{(pr.basicSalary || 65000).toLocaleString('en-IN')}</td>
                          <td className="p-3 font-mono">₹{((pr.allowances || 0) + (pr.overtimePay || 0) || 25000).toLocaleString('en-IN')}</td>
                          <td className="p-3 font-mono text-rose-600 dark:text-rose-400">-₹{(pr.deductions || 8500).toLocaleString('en-IN')}</td>
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                            ₹{(pr.netSalary || pr.netPay || (pr.basicSalary || 65000) + (pr.allowances || 25000) - (pr.deductions || 8500)).toLocaleString('en-IN')}
                          </td>
                          <td className="p-3">
                            <span className="rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 px-2 py-0.5 text-[10px] font-bold">
                              {pr.status || 'Paid'}
                            </span>
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



      {/* Add New Time Off / Leave Application Slide-over Drawer (Matching Design System & Screenshot) */}
      {showApplyLeaveModal && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-white border-l border-slate-100 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 text-slate-900">
            {/* Drawer Header */}
            <div className="p-7 px-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
              <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Add New Time Off</h3>
              <button
                type="button"
                onClick={() => setShowApplyLeaveModal(false)}
                className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleApplyLeaveSubmit} className="flex-1 flex flex-col justify-between overflow-hidden bg-white">
              <div className="p-8 space-y-5 overflow-y-auto custom-scrollbar text-xs">
                {/* 0. Select Employee (Shown for HR Mode) */}
                {!isUserView && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-800 mb-2">
                      Select Employee <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <select
                        value={selectedLeaveEmpId}
                        onChange={(e) => setSelectedLeaveEmpId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 font-bold outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
                      >
                        {state.employees.map((emp) => (
                          <option key={emp.id} value={emp.id} className="bg-white text-slate-800 font-medium">
                            {emp.name} — {emp.designation} ({emp.department})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* 1. Time Off Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">
                    Time Off Type <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 cursor-pointer transition-all shadow-2xs"
                  >
                    <option value="Casual Leave" className="bg-white text-slate-800">Casual Leave ({casualLeft}/{casualQuota} Days Remaining)</option>
                    <option value="Sick Leave" className="bg-white text-slate-800">Sick Leave ({sickLeft}/{sickQuota} Days Remaining)</option>
                    <option value="Earned Leave" className="bg-white text-slate-800">Earned / Privilege Leave ({earnedLeft}/{earnedQuota} Days Remaining)</option>
                    {!isInstitution && (
                      <option value="Work From Home" className="bg-white text-slate-800">
                        Work From Home ({wfhLeft}/{wfhQuota}) — goes to Regularizations
                      </option>
                    )}
                    <option value="Unpaid Leave" className="bg-white text-slate-800">Unpaid Leave / Loss of Pay</option>
                  </select>
                  {!isInstitution && leaveType === 'Work From Home' && (
                    <p className="mt-2 text-[11px] text-slate-500">
                      WFH requests are sent to Attendance → Regularizations for manager approval (not Leaves).
                    </p>
                  )}
                </div>

                {/* 2. Single Day vs Multiple Day Segmented Selection */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Single Day Card */}
                    <button
                      type="button"
                      onClick={() => setDayMode('single')}
                      className={`flex items-center justify-between p-3.5 px-4 rounded-xl border transition-all cursor-pointer ${dayMode === 'single'
                        ? 'border-blue-600 bg-blue-50/20 ring-1 ring-blue-600/30'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                    >
                      <span className="text-sm font-semibold text-slate-800">Single Day</span>
                      {dayMode === 'single' ? (
                        <div className="h-5 w-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-slate-300" />
                      )}
                    </button>

                    {/* Multiple Day Card */}
                    <button
                      type="button"
                      onClick={() => setDayMode('multiple')}
                      className={`flex items-center justify-between p-3.5 px-4 rounded-xl border transition-all cursor-pointer ${dayMode === 'multiple'
                        ? 'border-blue-600 bg-blue-50/20 ring-1 ring-blue-600/30'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                    >
                      <span className="text-sm font-semibold text-slate-800">Multiple Day</span>
                      {dayMode === 'multiple' ? (
                        <div className="h-5 w-5 rounded-full border-2 border-blue-600 flex items-center justify-center">
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                        </div>
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-slate-300" />
                      )}
                    </button>
                  </div>

                  {/* Date Input Pickers with min date restriction */}
                  {dayMode === 'single' ? (
                    <div>
                      <DateInput min={todayStr} value={singleDate} onChange={(e) => setSingleDate(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 [color-scheme:light] transition-all cursor-pointer shadow-2xs"
                        required
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <DateInput min={todayStr} value={startDate} onChange={(e) => handleStartDateChange(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 [color-scheme:light] transition-all cursor-pointer shadow-2xs"
                          required
                        />
                      </div>
                      <div>
                        <DateInput min={startDate || todayStr} value={endDate} onChange={(e) => setEndDate(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 [color-scheme:light] transition-all cursor-pointer shadow-2xs"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* Optional Duration Info for Multiple Days */}
                  {dayMode === 'multiple' && (
                    <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
                      <span>Leave Duration:</span>
                      <span className="font-bold text-blue-600">{computedLeaveDays} Days</span>
                    </div>
                  )}
                </div>

                {/* 3. Note */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">
                    Note <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Give notes"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all resize-none shadow-2xs"
                    required
                  />
                </div>

                {/* 4. Attachment */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">
                    Attachment
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={leaveAttachment}
                      onChange={(e) => setLeaveAttachment(e.target.value)}
                      placeholder="Upload attachment"
                      className="w-full rounded-xl border border-slate-200 bg-white pl-4 pr-10 py-3.5 text-sm text-slate-800 placeholder-slate-400 font-medium outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-300 transition-all shadow-2xs"
                    />
                    <FileUp className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none stroke-[1.8]" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 font-medium">
                    Max file size : 5MB. File format : pdf, docx, png, and jpeg
                  </p>
                </div>

                {/* 5. Assign To */}
                <div>
                  <label className="block text-xs font-semibold text-slate-800 mb-2">
                    Assign To
                  </label>
                  <div className="relative">
                    <select
                      value={leaveHandover}
                      onChange={(e) => setLeaveHandover(e.target.value)}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3.5 pr-10 text-sm text-slate-800 font-medium outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600/20 transition-all cursor-pointer shadow-2xs"
                    >
                      <option value="">Select team member for handover (Optional)</option>
                      {state.employees.map((emp) => (
                        <option key={emp.id} value={`${emp.name} (${emp.designation})`}>
                          {emp.name} ({emp.designation})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Drawer Footer (Matching Screenshot) */}
              <div className="p-7 px-8 border-t border-slate-100 flex items-center gap-4 bg-white shrink-0">
                <button
                  type="button"
                  onClick={() => setShowApplyLeaveModal(false)}
                  className="flex-1 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-sm font-bold text-slate-800 cursor-pointer transition-colors shadow-2xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold cursor-pointer shadow-md shadow-blue-600/25 transition-all active:scale-[0.99]"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modular Add / Invite Employee Modal */}
      <AddEmployeeModal
        isOpen={showAddEmployeeModal}
        onClose={() => setShowAddEmployeeModal(false)}
        isSaving={isSaving}
        onSubmit={handleAddEmployee}
        state={state}
        isInstitution={isInstitution}
        onOpenAddOffice={() => setShowAddOfficeModal(true)}
      />

      {/* Log Timesheet Modal */}
      {showLogTimesheetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="relative w-full max-w-md rounded-xl border border-[#282830] bg-[#121214] p-6 shadow-2xl text-white">
            <div className="flex items-center justify-between mb-4 border-b border-[#282830] pb-3">
              <h3 className="text-sm font-bold text-white">Log Work Hours</h3>
              <button onClick={() => setShowLogTimesheetModal(false)} className="text-[#9e9ea7] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleLogTimesheetSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#9e9ea7] mb-1">Project</label>
                <select
                  value={tsProject}
                  onChange={(e) => setTsProject(e.target.value)}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 text-white font-medium outline-none focus:border-blue-500 cursor-pointer"
                >
                  {state.projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#9e9ea7] mb-1">Task Deliverable</label>
                <select
                  value={tsTask}
                  onChange={(e) => setTsTask(e.target.value)}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 text-white font-medium outline-none focus:border-blue-500 cursor-pointer"
                >
                  {state.tasks.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#9e9ea7] mb-1">Hours Logged</label>
                <input
                  type="number"
                  step="0.5"
                  value={tsHours}
                  onChange={(e) => setTsHours(e.target.value)}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 text-white font-mono font-bold outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#9e9ea7] mb-1">Work Description</label>
                <textarea
                  value={tsDescription}
                  onChange={(e) => setTsDescription(e.target.value)}
                  placeholder="What did you work on during this time?"
                  rows={2}
                  className="w-full rounded-lg border border-[#282830] bg-[#18181d] p-2 text-white font-medium outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#282830]">
                <button
                  type="button"
                  onClick={() => setShowLogTimesheetModal(false)}
                  className="rounded-lg border border-[#282830] px-3.5 py-1.5 font-bold text-[#9e9ea7] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 cursor-pointer transition-all shadow-md"
                >
                  Save Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Office Location Modal */}
      <AddOfficeModal
        isOpen={showAddOfficeModal}
        onClose={() => setShowAddOfficeModal(false)}
        onSave={handleSaveOfficeModalFromHRMS}
      />

      {idCardBatch && (
        <BulkIdCardStudio
          employees={idCardBatch}
          organization={state.organization}
          isInstitution={isInstitution}
          onClose={() => setIdCardBatch(null)}
        />
      )}

      <EmployeeProfileCardModal
        isOpen={!!publicProfileEmployee}
        onClose={() => setPublicProfileEmployee(null)}
        employee={publicProfileEmployee}
        allEmployees={state.employees || []}
        canEdit={false}
        isInstitution={isInstitution}
      />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-xl border border-slate-700 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
