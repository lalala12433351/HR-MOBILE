'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
} from 'lucide-react';
import { DEFAULT_GEO_COORDINATES } from '@/config/constants';
import { AppState } from '../../services/store';
import { CustomProfileField, OnboardingSectionKey, Employee } from '../../types';
import { initialOnboardingFields } from '../../data/initialData';
import { AddOfficeModal, OfficeModalData } from '../common/AddOfficeModal';
import { PayrollSettingsView } from './PayrollSettingsView';
import { api } from '../../services/apiClient';

interface EmployeeSettingsViewProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}

export interface JobRoleDetail {
  id: string;
  title: string;
  department: string;
  tier: 'Employee' | 'HR' | 'Manager' | 'Admin';
  description: string;
  minSalary: number;
  maxSalary: number;
  canApproveTimesheets: boolean;
  canAssignTasks: boolean;
  canApproveLeaves: boolean;
}

// Reusable Sleek Toggle Switch Component (Consistent with DESIGN.md)
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
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-150 ease-in-out outline-none ${
        checked ? 'bg-blue-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white transition duration-150 ease-in-out mt-0.5 ${
          checked ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
};

export const EmployeeSettingsView: React.FC<EmployeeSettingsViewProps> = ({
  state,
  onUpdateState,
}) => {
  const router = useRouter();
  const options = state.customOptions;

  // Sub-Navigation Tab State
  const [subTab, setSubTab] = useState<
    'general' | 'initial_passwords' | 'departments_teams' | 'job_posts' | 'employment_types' | 'office_locations' | 'onboarding' | 'offboarding' | 'payroll_settings'
  >('general');

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Initial Passwords & Non-Active Account Provisioning State
  const [defaultInitialPassword, setDefaultInitialPassword] = useState(
    options?.defaultInitialPassword || 'Welcome@123'
  );
  const [forcePasswordReset, setForcePasswordReset] = useState(
    options?.forcePasswordReset ?? true
  );
  const [inlinePasswords, setInlinePasswords] = useState<{ [id: string]: string }>({});
  const [showPasswordMap, setShowPasswordMap] = useState<{ [id: string]: boolean }>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [passwordSearchQuery, setPasswordSearchQuery] = useState('');
  const [accountStatusFilter, setAccountStatusFilter] = useState<'all' | 'non_active'>('non_active');
  const [isBatchApplying, setIsBatchApplying] = useState(false);

  // Non-active employees list
  const nonActiveEmployees = useMemo(() => {
    return (state.employees || []).filter((emp) => {
      const isSuper = emp.role === 'super_admin' && (emp.accountStatus === 'Activated' || emp.isActivated);
      if (isSuper) return false;
      const accStatus = (emp.accountStatus as string) || '';
      const status = (emp.status as string) || '';
      return (
        accStatus === 'Not Activated' ||
        accStatus === 'Invited' ||
        accStatus === 'Pending' ||
        emp.isActivated === false ||
        status === 'Onboarding' ||
        status === 'Not Activated'
      );
    });
  }, [state.employees]);

  const displayedPasswordEmployees = useMemo(() => {
    const list = accountStatusFilter === 'non_active' ? nonActiveEmployees : (state.employees || []);
    if (!passwordSearchQuery.trim()) return list;
    const q = passwordSearchQuery.toLowerCase();
    return list.filter(
      (e) =>
        e.name?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.department?.toLowerCase().includes(q) ||
        e.designation?.toLowerCase().includes(q) ||
        e.employeeId?.toLowerCase().includes(q)
    );
  }, [accountStatusFilter, nonActiveEmployees, state.employees, passwordSearchQuery]);

  const handleSaveEmployeePassword = async (empId: string, pwd: string) => {
    if (!pwd || pwd.trim().length < 4) {
      showToast('Password must be at least 4 characters');
      return;
    }
    const cleanPwd = pwd.trim();
    const targetEmp = state.employees.find((e) => e.id === empId);

    setIsSaving(true);
    try {
      await api.identity.updateEmployee(empId, { password: cleanPwd });
      
      onUpdateState((prev) => ({
        ...prev,
        employees: prev.employees.map((e) => (e.id === empId ? { ...e, password: cleanPwd } : e)),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'EMPLOYEE_PASSWORD_UPDATED',
            entity: 'EmployeeAuth',
            entityId: empId,
            ipAddress: '106.51.72.18',
            details: `Set initial password for ${targetEmp?.name || empId}`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Initial password saved for ${targetEmp?.name || 'employee'}`);
    } catch (err) {
      console.error('Password save failed:', err);
      showToast('Failed to save password. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyDefaultPasswordToAll = async () => {
    const pwd = defaultInitialPassword.trim();
    if (!pwd) {
      showToast('Please specify a valid default initial password');
      return;
    }
    if (nonActiveEmployees.length === 0) {
      showToast('No non-active accounts found');
      return;
    }

    setIsBatchApplying(true);
    setIsSaving(true);
    const targetIds = nonActiveEmployees.map((e) => e.id);

    try {
      await Promise.all(
        targetIds.map((id) => api.identity.updateEmployee(id, { password: pwd }))
      );
      
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          defaultInitialPassword: pwd,
          forcePasswordReset: forcePasswordReset,
        },
        employees: prev.employees.map((e) => (targetIds.includes(e.id) ? { ...e, password: pwd } : e)),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'BATCH_INITIAL_PASSWORDS_SET',
            entity: 'EmployeeAuth',
            entityId: 'all_non_active',
            ipAddress: '106.51.72.18',
            details: `Applied default initial password to ${targetIds.length} non-active accounts`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Applied default password to ${targetIds.length} non-active accounts`);
    } catch (err) {
      console.error('Batch password apply failed:', err);
      showToast('Failed to apply default password to some accounts.');
    } finally {
      setIsBatchApplying(false);
      setIsSaving(false);
    }
  };

  const handleQuickActivate = async (empId: string) => {
    const targetEmp = state.employees.find((e) => e.id === empId);

    setIsSaving(true);
    try {
      await api.identity.updateEmployee(empId, {
        isActivated: true,
        accountStatus: 'Activated',
        employmentStatus: 'Active',
      });
      
      onUpdateState((prev) => ({
        ...prev,
        employees: prev.employees.map((e) =>
          e.id === empId
            ? {
                ...e,
                accountStatus: 'Activated',
                isActivated: true,
                status: 'Active',
                onboardingProgress: 100,
                hasCompletedProfile: true,
              }
            : e
        ),
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'EMPLOYEE_ACCOUNT_ACTIVATED',
            entity: 'EmployeeAuth',
            entityId: empId,
            ipAddress: '106.51.72.18',
            details: `Activated account for ${targetEmp?.name || empId}`,
          },
          ...prev.auditLogs,
        ],
      }));
      showToast(`Account activated for ${targetEmp?.name || 'employee'}`);
    } catch (err) {
      console.error('Account activation failed:', err);
      showToast('Failed to activate account. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCredentials = (emp: any) => {
    const pwd = inlinePasswords[emp.id] || emp.password || defaultInitialPassword;
    const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : 'Portal Login';
    const text = `HR Portal Credentials\nEmployee: ${emp.name}\nEmail: ${emp.email}\nInitial Password: ${pwd}\nLogin URL: ${loginUrl}`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    }
    setCopiedId(emp.id);
    setTimeout(() => setCopiedId(null), 2500);
    showToast(`Credentials copied for ${emp.name}`);
  };

  const handleGenerateRandomPassword = (empId: string) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let pwd = 'Arcle!';
    for (let i = 0; i < 6; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setInlinePasswords((prev) => ({ ...prev, [empId]: pwd }));
    showToast('Generated secure temporary password');
  };

  // 1. General & Profile Settings State (hydrated from persisted customOptions)
  const [empIdPrefix, setEmpIdPrefix] = useState(
    () => options?.employeeIdSettings?.prefix || 'EMP'
  );
  const [empIdSeqStart, setEmpIdSeqStart] = useState(
    () => options?.employeeIdSettings?.sequenceStart || '101'
  );
  const [defaultCurrency, setDefaultCurrency] = useState(
    () => options?.employeeIdSettings?.defaultCurrency || 'INR'
  );
  const [probationMonths, setProbationMonths] = useState(
    () => options?.probationSettings?.defaultDurationMonths ?? 3
  );
  const [autoConfirmProbation, setAutoConfirmProbation] = useState(
    () => options?.probationSettings?.autoConfirmAfterPeriod ?? false
  );
  const [noticePeriodDays, setNoticePeriodDays] = useState(
    () => options?.noticePeriodSettings?.days ?? 30
  );
  const [allowNoticeBuyout, setAllowNoticeBuyout] = useState(
    () => options?.noticePeriodSettings?.allowBuyout ?? true
  );
  const [allowSelfEditAddress, setAllowSelfEditAddress] = useState(
    () => options?.profileSelfServiceSettings?.allowSelfEditAddress ?? true
  );
  const [allowSelfEditBank, setAllowSelfEditBank] = useState(
    () => options?.profileSelfServiceSettings?.allowSelfEditBank ?? false
  );
  const [allowCoworkerDirectoryAccess, setAllowCoworkerDirectoryAccess] = useState(
    () => options?.profileSelfServiceSettings?.allowCoworkerDirectoryAccess ?? true
  );

  // 2. Departments & Teams & Offices State
  const [newDepartment, setNewDepartment] = useState('');
  const [newTeam, setNewTeam] = useState('');
  const [newTeamManagerId, setNewTeamManagerId] = useState('');
  const [showOfficeModal, setShowOfficeModal] = useState(false);
  const [editingOfficeData, setEditingOfficeData] = useState<OfficeModalData | null>(null);

  const handleSaveOfficeModal = async (data: OfficeModalData) => {
    const isEdit = (options?.offices || []).includes(editingOfficeData?.name || '');
    const codeSeed = (editingOfficeData?.name || data.name || 'OFF').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'OFF';
    const code = `${codeSeed}${Math.floor(10 + Math.random() * 90)}`;

    setIsSaving(true);
    try {
      if (isEdit && editingOfficeData?.name) {
        const officesRes = await api.org.getOffices();
        const match = (officesRes.data || []).find(
          (o: any) => String(o.name).toLowerCase() === editingOfficeData.name.toLowerCase()
        );
        if (!match?.id) throw new Error('Office not found on server');
        await api.org.updateOffice(match.id, {
          name: data.name,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          geofenceRadiusMeters: data.radiusMeters,
        });
      } else {
        await api.org.createOffice({
          name: data.name,
          code,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          geofenceRadiusMeters: data.radiusMeters,
        });
      }

      const prevName = editingOfficeData?.name;
      const updatedOffices = Array.from(
        new Set(
          (options?.offices || [])
            .map((o) => (isEdit && prevName && o === prevName ? data.name : o))
            .concat(isEdit ? [] : [data.name])
            .map((o) => o.trim())
            .filter(Boolean)
        )
      );

      // Refresh full office rows from server for punch geofencing
      let officeRecords = options?.officeRecords || [];
      try {
        const officesRes = await api.org.getOffices();
        if (officesRes.success && Array.isArray(officesRes.data)) {
          officeRecords = officesRes.data.map((o: any) => ({
            id: String(o.id),
            name: String(o.name || ''),
            code: o.code ? String(o.code) : undefined,
            address: String(o.address || o.name || ''),
            latitude: Number(o.latitude) || 0,
            longitude: Number(o.longitude) || 0,
            radiusMeters: Number(o.geofence_radius_meters ?? o.geofenceRadiusMeters) || 250,
            timezone: o.timezone ? String(o.timezone) : undefined,
            isActive: o.is_active !== false && o.isActive !== false,
          }));
        }
      } catch {
        // keep previous records; patch locally
        const patched = {
          id: officeRecords.find((r) => r.name === (prevName || data.name))?.id || `off_${Date.now()}`,
          name: data.name,
          address: data.address,
          latitude: data.latitude,
          longitude: data.longitude,
          radiusMeters: data.radiusMeters,
          isActive: true,
        };
        officeRecords = isEdit
          ? officeRecords.map((r) =>
              r.name === prevName || r.name === data.name ? { ...r, ...patched } : r
            )
          : [...officeRecords, patched];
      }

      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          offices: updatedOffices,
          officeRecords,
        },
        organization: {
          ...prev.organization,
          officeLocation:
            updatedOffices.length <= 1 ||
            prev.organization?.officeLocation?.address === data.address
              ? {
                  address: data.address,
                  latitude: data.latitude,
                  longitude: data.longitude,
                  allowedRadiusMeters: data.radiusMeters,
                }
              : prev.organization.officeLocation,
        },
      }));
      showToast(isEdit ? `Office "${data.name}" Updated` : `Office "${data.name}" Added Successfully`);
      setShowOfficeModal(false);
      setEditingOfficeData(null);
    } catch (e: any) {
      console.error('Office save failed', e);
      showToast(e?.message || 'Failed to save office location. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // 3. Job Roles & Designations — Dynamically synced with state.customOptions.designations & state.employees
  const currentDesignations = useMemo(() => {
    const set = new Set<string>();
    if (state.customOptions?.designations && state.customOptions.designations.length > 0) {
      state.customOptions.designations.forEach((d) => set.add(d));
    }
    (state.employees || []).forEach((e) => {
      if (e.designation) set.add(e.designation);
    });
    return Array.from(set);
  }, [state.customOptions?.designations, state.employees]);

  // Right Side Drawer State for Job Creation / Edit
  const [showJobDrawer, setShowJobDrawer] = useState(false);
  const [editingJobTitle, setEditingJobTitle] = useState<string | null>(null);

  // Drawer Form State
  const [drawerJobTitle, setDrawerJobTitle] = useState('');
  const [drawerJobDept, setDrawerJobDept] = useState('Development');
  const [drawerJobPermission, setDrawerJobPermission] = useState<'Employee' | 'HR' | 'Manager' | 'Admin'>('Employee');
  const [drawerJobDescription, setDrawerJobDescription] = useState('');
  const [drawerMinSalary, setDrawerMinSalary] = useState(70000);
  const [drawerMaxSalary, setDrawerMaxSalary] = useState(120000);
  const [drawerCanApproveTimesheets, setDrawerCanApproveTimesheets] = useState(false);
  const [drawerCanAssignTasks, setDrawerCanAssignTasks] = useState(true);
  const [drawerCanApproveLeaves, setDrawerCanApproveLeaves] = useState(false);

  // Open Drawer for Create
  const handleOpenCreateJobDrawer = () => {
    setEditingJobTitle(null);
    setDrawerJobTitle('');
    setDrawerJobDept(currentDepartments[0] || 'Development');
    setDrawerJobPermission('Employee');
    setDrawerJobDescription('');
    setDrawerMinSalary(70000);
    setDrawerMaxSalary(120000);
    setDrawerCanApproveTimesheets(false);
    setDrawerCanAssignTasks(true);
    setDrawerCanApproveLeaves(false);
    setShowJobDrawer(true);
  };

  // Open Drawer for Edit
  const handleOpenEditJobDrawer = (title: string) => {
    setEditingJobTitle(title);
    setDrawerJobTitle(title);
    const matchedEmp = (state.employees || []).find((e) => e.designation?.toLowerCase() === title.toLowerCase());
    setDrawerJobDept(matchedEmp?.department || currentDepartments[0] || 'Development');
    setDrawerJobPermission(
      title.toLowerCase().includes('admin')
        ? 'Admin'
        : title.toLowerCase().includes('manager') || title.toLowerCase().includes('lead') || title.toLowerCase().includes('director')
        ? 'Manager'
        : title.toLowerCase().includes('hr')
        ? 'HR'
        : 'Employee'
    );
    setDrawerJobDescription('');
    setShowJobDrawer(true);
  };

  // Save Job Role from Drawer
  const handleSaveJobRole = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = drawerJobTitle.trim();
    if (!trimmed) {
      showToast('Please enter a job role title');
      return;
    }

    setIsSaving(true);
    try {
      if (editingJobTitle) {
        const rolesRes = await api.org.getJobRoles();
        const match = (rolesRes.data || []).find(
          (r: any) => String(r.title).toLowerCase() === editingJobTitle.toLowerCase()
        );
        if (!match?.id) throw new Error('Role not found on server');
        await api.org.updateJobRole(match.id, {
          title: trimmed,
          level: drawerJobPermission,
        });
        onUpdateState((prev) => ({
          ...prev,
          customOptions: {
            ...prev.customOptions,
            designations: (prev.customOptions?.designations || []).map((d) =>
              d.toLowerCase() === editingJobTitle.toLowerCase() ? trimmed : d
            ),
          },
        }));
        showToast(`Updated role "${trimmed}"`);
      } else {
        if (currentDesignations.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
          showToast(`Role "${trimmed}" already exists`);
          return;
        }

        const code = `${trimmed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'ROLE'}${Math.floor(10 + Math.random() * 90)}`;
        await api.org.createJobRole({
          title: trimmed,
          code,
          level: drawerJobPermission,
        });

        const updatedDesignations = [...currentDesignations, trimmed];
        onUpdateState((prev) => ({
          ...prev,
          customOptions: {
            ...prev.customOptions,
            designations: updatedDesignations,
          },
        }));
        showToast(`Created role "${trimmed}" successfully`);
      }
      setShowJobDrawer(false);
      setEditingJobTitle(null);
    } catch (err: any) {
      console.error('Role save failed', err);
      showToast(err?.message || 'Failed to save job role. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteJobRole = async (title: string) => {
    setIsSaving(true);
    try {
      const rolesRes = await api.org.getJobRoles();
      const match = (rolesRes.data || []).find(
        (r: any) => String(r.title).toLowerCase() === title.toLowerCase()
      );
      if (!match?.id) throw new Error('Role not found on server');
      await api.org.deleteJobRole(match.id);
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          designations: (prev.customOptions?.designations || []).filter(
            (d) => d.toLowerCase() !== title.toLowerCase()
          ),
        },
      }));
      showToast(`Removed role "${title}"`);
    } catch (e: any) {
      showToast(e?.message || `Failed to remove role "${title}"`);
    } finally {
      setIsSaving(false);
    }
  };
  const [employmentTypes, setEmploymentTypes] = useState<
    { id: string; name: string; hasBenefits: boolean; isPermanent: boolean }[]
  >(() => {
    if (state.customOptions?.employmentTypeCategories && state.customOptions.employmentTypeCategories.length > 0) {
      return state.customOptions.employmentTypeCategories;
    }
    const defaults = [
      { id: 'et_1', name: 'Full-time', hasBenefits: true, isPermanent: true },
      { id: 'et_2', name: 'Contract', hasBenefits: false, isPermanent: false },
      { id: 'et_3', name: 'Part-time', hasBenefits: true, isPermanent: false },
      { id: 'et_4', name: 'Intern', hasBenefits: false, isPermanent: false },
      { id: 'et_5', name: 'Probationary', hasBenefits: true, isPermanent: true },
    ];
    if (state.customOptions?.employmentTypes && state.customOptions.employmentTypes.length > 0) {
      const set = new Set(defaults.map((d) => d.name.toLowerCase()));
      state.customOptions.employmentTypes.forEach((t) => {
        if (!set.has(t.toLowerCase())) {
          defaults.push({
            id: `et_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: t,
            hasBenefits: false,
            isPermanent: false,
          });
        }
      });
    }
    return defaults;
  });
  const [newEmploymentTypeName, setNewEmploymentTypeName] = useState('');
  const [newEmploymentTypeHasBenefits, setNewEmploymentTypeHasBenefits] = useState(true);
  const [editingEtId, setEditingEtId] = useState<string | null>(null);
  const [editingEtName, setEditingEtName] = useState('');

  // Keep employmentTypes in sync if state.customOptions changes
  useEffect(() => {
    if (state.customOptions?.employmentTypeCategories && state.customOptions.employmentTypeCategories.length > 0) {
      setEmploymentTypes(state.customOptions.employmentTypeCategories);
    }
  }, [state.customOptions?.employmentTypeCategories]);

  // 6. Onboarding & Custom Profile Fields State
  const [selectedFieldSection, setSelectedFieldSection] = useState<'all' | OnboardingSectionKey>('all');
  const [showAddFieldDrawer, setShowAddFieldDrawer] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldSection, setNewFieldSection] = useState<OnboardingSectionKey>('personal');
  const [newFieldType, setNewFieldType] = useState<CustomProfileField['type']>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldPlaceholder, setNewFieldPlaceholder] = useState('');
  const [newFieldDescription, setNewFieldDescription] = useState('');
  const [newFieldOptionsStr, setNewFieldOptionsStr] = useState('');
  const [autoSendWelcomeEmail, setAutoSendWelcomeEmail] = useState(true);
  const [autoAssignBuddy, setAutoAssignBuddy] = useState(true);

  // 7. Offboarding Policy (hydrated from persisted customOptions)
  const [reqExitInterview, setReqExitInterview] = useState(
    () => options?.offboardingSettings?.reqExitInterview ?? true
  );
  const [reqAssetClearance, setReqAssetClearance] = useState(
    () => options?.offboardingSettings?.reqAssetClearance ?? true
  );
  const [reqManagerNOC, setReqManagerNOC] = useState(
    () => options?.offboardingSettings?.reqManagerNOC ?? true
  );
  const [autoRevokeAccessOnLastDay, setAutoRevokeAccessOnLastDay] = useState(
    () => options?.offboardingSettings?.autoRevokeAccessOnLastDay ?? true
  );
  const [fnfSettlementDays, setFnfSettlementDays] = useState(
    () => options?.offboardingSettings?.fnfSettlementDays ?? 30
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Robust Dynamic Onboarding & Profile Fields List
  const currentOnboardingFields = useMemo<CustomProfileField[]>(() => {
    if (state.customOptions?.onboardingFields && state.customOptions.onboardingFields.length > 0) {
      return state.customOptions.onboardingFields;
    }
    return initialOnboardingFields;
  }, [state.customOptions?.onboardingFields]);

  const syncOnboardingFields = async (updatedFields: CustomProfileField[]) => {
    setIsSaving(true);
    try {
      await api.setup.saveOnboardingFields({ fields: updatedFields });
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          onboardingFields: updatedFields,
        },
      }));
    } catch (err) {
      console.error('Onboarding fields sync failed', err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleFieldRequired = async (fieldId: string) => {
    const updated = currentOnboardingFields.map((f) =>
      f.id === fieldId ? { ...f, required: !f.required } : f
    );
    try {
      await syncOnboardingFields(updated);
      const f = currentOnboardingFields.find((x) => x.id === fieldId);
      showToast(`"${f?.label || 'Field'}" marked as ${!f?.required ? 'Mandatory' : 'Optional'}`);
    } catch (e) {
      showToast('Failed to update field requirement.');
    }
  };

  const handleToggleFieldEnabled = async (fieldId: string) => {
    const updated = currentOnboardingFields.map((f) =>
      f.id === fieldId ? { ...f, enabled: !f.enabled } : f
    );
    try {
      await syncOnboardingFields(updated);
      const f = currentOnboardingFields.find((x) => x.id === fieldId);
      showToast(`"${f?.label || 'Field'}" is now ${!f?.enabled ? 'Active' : 'Disabled'}`);
    } catch (e) {
      showToast('Failed to update field status.');
    }
  };

  const handleCreateCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFieldLabel.trim();
    if (!trimmed) {
      showToast('Please enter a field label');
      return;
    }

    const fieldKey = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const optionsArray =
      newFieldType === 'select'
        ? newFieldOptionsStr
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;

    const newField: CustomProfileField = {
      id: `custom_f_${Date.now()}`,
      name: fieldKey,
      label: trimmed,
      section: newFieldSection,
      type: newFieldType,
      required: newFieldRequired,
      enabled: true,
      options: optionsArray && optionsArray.length > 0 ? optionsArray : undefined,
      placeholder: newFieldPlaceholder.trim() || undefined,
      description: newFieldDescription.trim() || undefined,
      isSystemDefault: false,
    };

    const updated = [...currentOnboardingFields, newField];
    try {
      await syncOnboardingFields(updated);
      showToast(`Added custom field "${trimmed}"`);
      setShowAddFieldDrawer(false);
      setNewFieldLabel('');
      setNewFieldPlaceholder('');
      setNewFieldDescription('');
      setNewFieldOptionsStr('');
      setNewFieldRequired(false);
    } catch (e) {
      showToast('Failed to add custom field.');
    }
  };

  const handleDeleteCustomField = async (fieldId: string) => {
    const f = currentOnboardingFields.find((x) => x.id === fieldId);
    const updated = currentOnboardingFields.filter((x) => x.id !== fieldId);
    try {
      await syncOnboardingFields(updated);
      showToast(`Deleted field "${f?.label || 'Custom Field'}"`);
    } catch (e) {
      showToast('Failed to delete custom field.');
    }
  };

  // Robust Departments List & Handlers
  const currentDepartments = useMemo(() => {
    if (state.customOptions?.departments && state.customOptions.departments.length > 0) {
      return state.customOptions.departments;
    }
    const set = new Set<string>();
    (state.employees || []).forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return Array.from(set);
  }, [state.customOptions?.departments, state.employees]);

  // Robust Teams List & Handlers
  const currentTeams = useMemo(() => {
    if (state.customOptions?.teams && state.customOptions.teams.length > 0) {
      return state.customOptions.teams;
    }
    const set = new Set<string>();
    (state.employees || []).forEach((e) => {
      if (e.team) set.add(e.team);
    });
    return Array.from(set);
  }, [state.customOptions?.teams, state.employees]);

  const handleAddDepartment = async (deptName: string) => {
    const trimmed = deptName.trim();
    if (!trimmed) return;
    if (currentDepartments.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`Department "${trimmed}" already exists!`);
      return;
    }

    setIsSaving(true);
    try {
      const code = `${trimmed.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'DEP'}${Math.floor(10 + Math.random() * 90)}`;
      await api.org.createDepartment({ name: trimmed, code });
      const updated = [...currentDepartments, trimmed];
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          departments: updated,
        },
      }));
      setNewDepartment('');
      showToast(`Department "${trimmed}" added successfully`);
    } catch (err: any) {
      console.error('Department save failed', err);
      showToast(err?.message || `Failed to add department "${trimmed}".`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDepartment = async (deptName: string) => {
    setIsSaving(true);
    try {
      const deptsRes = await api.org.getDepartments();
      const match = (deptsRes.data || []).find(
        (d: any) => String(d.name).toLowerCase() === deptName.toLowerCase()
      );
      if (!match?.id) throw new Error('Department not found on server');
      await api.org.deleteDepartment(match.id);
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          departments: (prev.customOptions?.departments || []).filter(
            (d) => d.toLowerCase() !== deptName.toLowerCase()
          ),
        },
      }));
      showToast(`Removed department "${deptName}"`);
    } catch (e: any) {
      showToast(e?.message || `Failed to remove department "${deptName}"`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddTeam = async (teamName: string) => {
    const trimmed = teamName.trim();
    if (!trimmed) return;
    if (currentTeams.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`Team "${trimmed}" already exists!`);
      return;
    }

    setIsSaving(true);
    try {
      const deptsRes = await api.org.getDepartments();
      const deptRows = Array.isArray(deptsRes.data) ? deptsRes.data : [];
      const preferredDeptName = currentDepartments[0];
      const matchDept =
        deptRows.find(
          (d: any) =>
            preferredDeptName &&
            String(d.name || '').toLowerCase() === preferredDeptName.toLowerCase()
        ) || deptRows[0];

      if (!matchDept?.id) {
        throw new Error('Create a department first, then add a team under it.');
      }

      const createRes = await api.org.createTeam({
        departmentId: matchDept.id,
        name: trimmed,
        leadEmployeeId: newTeamManagerId || undefined,
      });

      const updated = [...currentTeams, trimmed];
      const teamRecord = createRes.data
        ? {
            id: createRes.data.id,
            name: trimmed,
            departmentId: matchDept.id,
            departmentName: matchDept.name,
            leadEmployeeId: newTeamManagerId || null,
            leadName:
              (state.employees || []).find((e) => e.id === newTeamManagerId)?.name || null,
          }
        : null;

      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          teams: updated,
          teamRecords: teamRecord
            ? [...((prev.customOptions as any)?.teamRecords || []), teamRecord]
            : (prev.customOptions as any)?.teamRecords,
        } as any,
      }));
      setNewTeam('');
      setNewTeamManagerId('');
      showToast(`Team "${trimmed}" added successfully`);
    } catch (err: any) {
      console.error('Team save failed', err);
      showToast(err?.message || `Failed to add team "${trimmed}".`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTeam = async (teamName: string) => {
    setIsSaving(true);
    try {
      const teamsRes = await api.org.getTeams();
      const match = (teamsRes.data || []).find(
        (t: any) => String(t.name).toLowerCase() === teamName.toLowerCase()
      );
      if (!match?.id) throw new Error('Team not found on server');
      await api.org.deleteTeam(match.id);
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          teams: (prev.customOptions?.teams || []).filter(
            (t) => t.toLowerCase() !== teamName.toLowerCase()
          ),
          teamRecords: ((prev.customOptions as any)?.teamRecords || []).filter(
            (t: any) => String(t.name || '').toLowerCase() !== teamName.toLowerCase()
          ),
        } as any,
      }));
      showToast(`Removed team "${teamName}"`);
    } catch (e: any) {
      showToast(e?.message || `Failed to remove team "${teamName}"`);
    } finally {
      setIsSaving(false);
    }
  };

  const syncEmploymentTypes = async (
    nextTypes: { id: string; name: string; hasBenefits: boolean; isPermanent: boolean }[]
  ) => {
    setIsSaving(true);
    try {
      await api.setup.saveEmploymentTypes({ employmentTypes: nextTypes });
      setEmploymentTypes(nextTypes);
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          employmentTypes: nextTypes.map((et) => et.name),
          employmentTypeCategories: nextTypes,
        },
      }));
    } catch (err) {
      console.error('Employment types sync failed', err);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleBenefits = async (id: string) => {
    const target = employmentTypes.find((et) => et.id === id);
    if (!target) return;
    const nextStatus = !target.hasBenefits;
    const updated = employmentTypes.map((et) =>
      et.id === id ? { ...et, hasBenefits: nextStatus } : et
    );
    try {
      await syncEmploymentTypes(updated);
      showToast(
        `"${target.name}" is now marked as ${nextStatus ? 'Benefits Eligible' : 'Standard'}`
      );
    } catch (e) {
      showToast('Failed to update benefits status.');
    }
  };

  const handleAddEmploymentType = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newEmploymentTypeName.trim();
    if (!trimmed) return;

    if (employmentTypes.some((et) => et.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`Employment type "${trimmed}" already exists`);
      return;
    }

    const newEt = {
      id: `et_${Date.now()}`,
      name: trimmed,
      hasBenefits: newEmploymentTypeHasBenefits,
      isPermanent: false,
    };
    const updated = [...employmentTypes, newEt];
    
    try {
      await syncEmploymentTypes(updated);
      setNewEmploymentTypeName('');
      setNewEmploymentTypeHasBenefits(true);
      showToast(`Added type "${newEt.name}" (${newEt.hasBenefits ? 'Benefits Eligible' : 'Standard'})`);
    } catch (e) {
      showToast('Failed to add employment type.');
    }
  };

  const handleDeleteEmploymentType = async (id: string) => {
    const target = employmentTypes.find((et) => et.id === id);
    if (!target) return;
    if (employmentTypes.length <= 1) {
      showToast('At least one employment type category must be maintained');
      return;
    }
    const updated = employmentTypes.filter((et) => et.id !== id);
    try {
      await syncEmploymentTypes(updated);
      showToast(`Removed employment type "${target.name}"`);
    } catch (e) {
      showToast('Failed to remove employment type.');
    }
  };

  const handleStartEditEmploymentType = (et: { id: string; name: string; hasBenefits: boolean; isPermanent: boolean }) => {
    setEditingEtId(et.id);
    setEditingEtName(et.name);
  };

  const handleSaveEditEmploymentType = async (id: string) => {
    const trimmed = editingEtName.trim();
    if (!trimmed) return;
    const updated = employmentTypes.map((et) =>
      et.id === id ? { ...et, name: trimmed } : et
    );
    try {
      await syncEmploymentTypes(updated);
      setEditingEtId(null);
      setEditingEtName('');
      showToast(`Updated to "${trimmed}"`);
    } catch (e) {
      showToast('Failed to update employment type.');
    }
  };

  const handleDeleteOffice = async (officeName: string) => {
    setIsSaving(true);
    try {
      const officesRes = await api.org.getOffices();
      const match = (officesRes.data || []).find(
        (o: any) => String(o.name).toLowerCase() === officeName.toLowerCase()
      );
      if (!match?.id) throw new Error('Office not found on server');
      await api.org.deleteOffice(match.id);
      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          offices: (prev.customOptions?.offices || []).filter(
            (o) => o.toLowerCase() !== officeName.toLowerCase()
          ),
        },
      }));
      showToast(`Removed office "${officeName}"`);
    } catch (e: any) {
      showToast(e?.message || `Failed to remove office "${officeName}"`);
    } finally {
      setIsSaving(false);
    }
  };

  // Save All Settings
  const handleSaveAllSettings = async () => {
    setIsSaving(true);

    const payload = {
      departments: currentDepartments,
      teams: currentTeams,
      offices: Array.from(new Set((options?.offices || []).map((o) => o.trim()).filter(Boolean))),
      designations: currentDesignations,
      employmentTypes: employmentTypes.map((e) => e.name),
      employmentTypeCategories: employmentTypes,
      onboardingFields: currentOnboardingFields,
      defaultInitialPassword: defaultInitialPassword.trim(),
      forcePasswordReset: forcePasswordReset,
      employeeIdSettings: {
        prefix: empIdPrefix.trim() || 'EMP',
        sequenceStart: empIdSeqStart.trim() || '101',
        defaultCurrency: defaultCurrency || 'INR',
      },
      profileSelfServiceSettings: {
        allowSelfEditAddress,
        allowSelfEditBank,
        allowCoworkerDirectoryAccess,
      },
      noticePeriodSettings: {
        days: Number(noticePeriodDays) || 30,
        allowBuyout: allowNoticeBuyout,
      },
      offboardingSettings: {
        reqExitInterview,
        reqAssetClearance,
        reqManagerNOC,
        autoRevokeAccessOnLastDay,
        fnfSettlementDays: Number(fnfSettlementDays) || 30,
      },
      probationSettings: {
        ...(options?.probationSettings || {}),
        enabled: options?.probationSettings?.enabled !== false,
        defaultDurationMonths: Number(probationMonths) || 3,
        autoConfirmAfterPeriod: autoConfirmProbation,
      },
    };

    try {
      await api.setup.saveGeneralSettings(payload);

      onUpdateState((prev) => ({
        ...prev,
        customOptions: {
          ...prev.customOptions,
          ...payload,
        },
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            user: prev.currentPersona.name,
            action: 'EMPLOYEE_CONFIG_CHANGE',
            entity: 'EmployeeSettings',
            entityId: 'employee_config',
            ipAddress: '106.51.72.18',
            details: `Updated employee configurations: ID Prefix ${empIdPrefix}, ${currentDesignations.length} Job Roles, Currency ${defaultCurrency}, Default Password configured`,
          },
          ...prev.auditLogs,
        ],
      }));

      showToast('Employee Settings Saved Successfully');
    } catch (err) {
      console.error('General settings save failed', err);
      showToast('Failed to save settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-3 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
          <Check className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Main Page Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Employee Settings
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure employee profiles, job roles, departments, initial passwords, locations, and lifecycle rules
          </p>
        </div>

        <button
          onClick={handleSaveAllSettings}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white transition-all cursor-pointer active:scale-98 w-full sm:w-auto shrink-0 shadow-xs"
        >
          Save Changes
        </button>
      </div>

      {/* SubTab Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-px overflow-x-auto no-scrollbar py-1 w-full">
        {[
          { id: 'general', label: 'General & Rules' },
          { id: 'initial_passwords', label: 'Initial Passwords', badge: nonActiveEmployees.length },
          { id: 'job_posts', label: 'Job Roles & Titles' },
          { id: 'departments_teams', label: 'Departments & Teams' },
          { id: 'employment_types', label: 'Employment Types' },
          { id: 'office_locations', label: 'Office Locations' },
          { id: 'onboarding', label: 'Onboarding Fields' },
          { id: 'offboarding', label: 'Offboarding Policy' },
          { id: 'payroll_settings', label: 'Payroll Settings' },
        ].map((item) => {
          const isActive = subTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSubTab(item.id as any)}
              className={`px-3.5 py-2 text-xs transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                isActive
                  ? 'border-b-2 border-blue-600 text-blue-600 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 font-medium'
              }`}
            >
              <span>{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="w-full space-y-6">
          {/* ========================================================================= */}
          {/* 1. GENERAL & PROFILE RULES                                                */}
          {/* ========================================================================= */}
          {subTab === 'general' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-7 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  General & Profile Rules
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Define employee ID generation, standard probation duration, and self-service permissions.
                </p>
              </div>

              {/* Employee ID Format Grid */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-600">
                  Employee ID Auto-Generation Format
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <span className="text-[11px] text-slate-400 font-medium block mb-1">Prefix</span>
                    <input
                      type="text"
                      value={empIdPrefix}
                      onChange={(e) => setEmpIdPrefix(e.target.value)}
                      placeholder="e.g. EMP"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 transition-all"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 font-medium block mb-1">Sequence Start</span>
                    <input
                      type="text"
                      value={empIdSeqStart}
                      onChange={(e) => setEmpIdSeqStart(e.target.value)}
                      placeholder="e.g. 101"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 transition-all"
                    />
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-400 font-medium block mb-1">Sample Generated ID</span>
                    <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700">
                      {empIdPrefix}-{empIdSeqStart}
                    </div>
                  </div>
                </div>
              </div>

              {/* Currency & Probation Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">
                    Default Salary Currency
                  </label>
                  <div className="relative">
                    <select
                      value={defaultCurrency}
                      onChange={(e) => setDefaultCurrency(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer pr-10"
                    >
                      <option value="USD">USD ($) - US Dollar</option>
                      <option value="EUR">EUR (€) - Euro</option>
                      <option value="INR">INR (₹) - Indian Rupee</option>
                      <option value="GBP">GBP (£) - British Pound</option>
                      <option value="CAD">CAD ($) - Canadian Dollar</option>
                      <option value="SGD">SGD ($) - Singapore Dollar</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600">
                    Probation Period Duration
                  </label>
                  <div className="relative">
                    <select
                      value={probationMonths}
                      onChange={(e) => setProbationMonths(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer pr-10"
                    >
                      <option value={1}>1 Month</option>
                      <option value={3}>3 Months (Standard)</option>
                      <option value={6}>6 Months</option>
                      <option value={0}>No Probation (Immediate Direct Confirmation)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Standard Notice Period */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-600">
                  Standard Notice Period Duration
                </label>
                <div className="relative">
                  <select
                    value={noticePeriodDays}
                    onChange={(e) => setNoticePeriodDays(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer pr-10"
                  >
                    <option value={15}>15 Days</option>
                    <option value={30}>30 Days (1 Month)</option>
                    <option value={60}>60 Days (2 Months)</option>
                    <option value={90}>90 Days (3 Months)</option>
                  </select>
                </div>
              </div>

              {/* Self Service & Policy Toggles */}
              <div className="pt-3 border-t border-slate-200 space-y-4">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Self-Service & Permissions
                </h4>

                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Auto-Confirm Employee Upon Probation Completion
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Automatically change status to &apos;Active / Confirmed&apos; without requiring HR manual review form.
                    </span>
                  </div>
                  <ToggleSwitch checked={autoConfirmProbation} onChange={setAutoConfirmProbation} />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Allow Employees to Edit Personal Phone & Address
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Employees can update their contact details directly in their profile view.
                    </span>
                  </div>
                  <ToggleSwitch checked={allowSelfEditAddress} onChange={setAllowSelfEditAddress} />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Allow Self-Service Bank Account Updates
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Enable direct edits to bank IFSC / IBAN details without payroll admin sign-off.
                    </span>
                  </div>
                  <ToggleSwitch checked={allowSelfEditBank} onChange={setAllowSelfEditBank} />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Enable Company-Wide Coworker Directory Access
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Allow all team members to search and view public profiles in the Employee Directory.
                    </span>
                  </div>
                  <ToggleSwitch checked={allowCoworkerDirectoryAccess} onChange={setAllowCoworkerDirectoryAccess} />
                </div>

                {/* Account Provisioning & Initial Passwords Card */}
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        Non-Active Accounts & Initial Passwords
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Configure default initial passwords for accounts awaiting activation and distribute login credentials.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSubTab('initial_passwords')}
                      className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
                    >
                      Manage Account Passwords ({nonActiveEmployees.length})
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-600">
                        Default Initial Password Template
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={defaultInitialPassword}
                          onChange={(e) => setDefaultInitialPassword(e.target.value)}
                          placeholder="e.g. Welcome@123"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-blue-600 transition-all font-mono"
                        />
                      </div>
                      <span className="text-[10px] text-slate-400">Used as the starting password for new non-activated staff.</span>
                    </div>

                    <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Require Password Reset on First Login
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Employees will be prompted to choose a new password upon first sign-in.
                        </span>
                      </div>
                      <ToggleSwitch checked={forcePasswordReset} onChange={setForcePasswordReset} />
                    </div>
                  </div>

                  {nonActiveEmployees.length > 0 && (
                    <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="text-amber-900 font-medium">
                          <strong>{nonActiveEmployees.length} non-activated account(s)</strong> currently require initial credentials setup.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSubTab('initial_passwords')}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 shadow-xs"
                      >
                        View & Set Passwords
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* INITIAL PASSWORDS TAB FOR NON-ACTIVE ACCOUNTS                             */}
          {/* ========================================================================= */}
          {subTab === 'initial_passwords' && (
            <div className="space-y-6 font-sans">
              <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-7 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                      Initial Passwords & Account Access
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      Set initial login passwords for non-activated accounts and new hires before they log in.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      {nonActiveEmployees.length} Non-Activated
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {state.employees.length - nonActiveEmployees.length} Active
                    </span>
                  </div>
                </div>

                {/* Global Default Initial Password Card */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-5 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <label className="text-xs font-bold text-slate-800 block">
                        Default Initial Password Template
                      </label>
                      <p className="text-[11px] text-slate-500 font-medium">
                        Default password assigned when onboarding new staff or resetting passwords in bulk.
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <input
                        type="text"
                        value={defaultInitialPassword}
                        onChange={(e) => setDefaultInitialPassword(e.target.value)}
                        placeholder="Welcome@123"
                        className="w-48 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-mono font-medium text-slate-900 outline-none focus:border-blue-600 shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={handleApplyDefaultPasswordToAll}
                        disabled={isBatchApplying || nonActiveEmployees.length === 0}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98 shrink-0"
                      >
                        {isBatchApplying ? 'Applying...' : `Apply to All Non-Active (${nonActiveEmployees.length})`}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Require Password Change on First Sign-In
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Enforces security policy by prompting users to set their own permanent password.
                      </span>
                    </div>
                    <ToggleSwitch checked={forcePasswordReset} onChange={setForcePasswordReset} />
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg w-fit">
                    <button
                      type="button"
                      onClick={() => setAccountStatusFilter('non_active')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        accountStatusFilter === 'non_active'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Non-Active ({nonActiveEmployees.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAccountStatusFilter('all')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        accountStatusFilter === 'all'
                          ? 'bg-white text-blue-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All Accounts ({state.employees.length})
                    </button>
                  </div>

                  <div className="w-full sm:w-64">
                    <input
                      type="text"
                      value={passwordSearchQuery}
                      onChange={(e) => setPasswordSearchQuery(e.target.value)}
                      placeholder="Search by name, email, dept..."
                      className="w-full px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {/* Account Roster Cards */}
                {displayedPasswordEmployees.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-8 text-center space-y-1.5">
                    <h4 className="text-sm font-bold text-slate-800">
                      {accountStatusFilter === 'non_active'
                        ? 'No Non-Active Accounts Pending'
                        : 'No Accounts Found'}
                    </h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto font-medium">
                      {accountStatusFilter === 'non_active'
                        ? 'All employee accounts in your workspace are currently active. When you add new employees with "Not Activated" status, they will appear here to configure initial passwords.'
                        : 'No accounts match the specified search query.'}
                    </p>
                    {accountStatusFilter === 'non_active' && (
                      <button
                        type="button"
                        onClick={() => setAccountStatusFilter('all')}
                        className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700 underline cursor-pointer"
                      >
                        View all workspace accounts
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displayedPasswordEmployees.map((emp) => {
                      const accStatus = (emp.accountStatus as string) || '';
                      const empStatus = (emp.status as string) || '';
                      const isNonActive =
                        accStatus === 'Not Activated' ||
                        accStatus === 'Invited' ||
                        accStatus === 'Pending' ||
                        emp.isActivated === false ||
                        empStatus === 'Onboarding' ||
                        empStatus === 'Not Activated';
                      const currentPwdValue =
                        inlinePasswords[emp.id] !== undefined
                          ? inlinePasswords[emp.id]
                          : (emp.password || defaultInitialPassword);
                      const isRevealed = !!showPasswordMap[emp.id];
                      const isCopied = copiedId === emp.id;

                      return (
                        <div
                          key={emp.id}
                          className={`rounded-xl border p-4 sm:p-5 transition-all space-y-3.5 ${
                            isNonActive
                              ? 'border-amber-200/80 bg-amber-50/20 hover:border-amber-300'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          {/* Top row: Employee Info & Status */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0">
                              <span className="text-sm font-bold text-slate-900 block truncate">
                                {emp.name}
                              </span>
                              <div className="text-xs text-slate-500 truncate flex items-center gap-2 mt-0.5">
                                <span>{emp.email}</span>
                                <span>•</span>
                                <span>{emp.department || 'General'}</span>
                                <span>•</span>
                                <span className="text-slate-700 font-medium">{emp.designation || 'Staff'}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                  isNonActive
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                              >
                                {isNonActive ? 'Not Activated' : 'Activated'}
                              </span>
                            </div>
                          </div>

                          {/* Bottom row: Initial Password Input & Actions */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                            <div className="flex items-center gap-2 flex-1 max-w-md">
                              <div className="relative flex-1">
                                <input
                                  type={isRevealed ? 'text' : 'password'}
                                  value={currentPwdValue}
                                  onChange={(e) =>
                                    setInlinePasswords((prev) => ({
                                      ...prev,
                                      [emp.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="Initial Password"
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-mono font-medium text-slate-900 outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 pr-14 shadow-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowPasswordMap((prev) => ({
                                      ...prev,
                                      [emp.id]: !prev[emp.id],
                                    }))
                                  }
                                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer select-none"
                                >
                                  {isRevealed ? 'Hide' : 'Show'}
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleGenerateRandomPassword(emp.id)}
                                className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium transition-colors cursor-pointer shrink-0 shadow-xs"
                                title="Generate Random Secure Password"
                              >
                                Random
                              </button>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleSaveEmployeePassword(emp.id, currentPwdValue)}
                                className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
                              >
                                Set Password
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyCredentials(emp)}
                                className={`px-3.5 py-2 rounded-lg border text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98 ${
                                  isCopied
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                    : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                {isCopied ? 'Copied!' : 'Copy Credentials'}
                              </button>

                              {isNonActive && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickActivate(emp.id)}
                                  className="px-3.5 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
                                  title="Mark as Activated immediately"
                                >
                                  Activate
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 2. JOB ROLES & TITLES (With Right-Side Slide-Over Drawer Modal)             */}
          {/* ========================================================================= */}
          {subTab === 'job_posts' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Job Roles & Designations
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Manage official job titles, permission tiers, and department assignments.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenCreateJobDrawer}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  Add Role
                </button>
              </div>

              {/* Roster of Job Roles */}
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                {currentDesignations.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No job roles configured yet. Click &quot;Add Role&quot; to create one.
                  </div>
                ) : (
                  currentDesignations.map((role) => {
                    const empList = (state.employees || []).filter(
                      (e) => e.designation?.toLowerCase() === role.toLowerCase()
                    );
                    const count = empList.length;
                    const depts = Array.from(new Set(empList.map((e) => e.department).filter(Boolean)));
                    const deptDisplay = depts.length > 0 ? depts.join(', ') : 'All Departments / General';

                    return (
                      <div
                        key={role}
                        className="p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 truncate">
                            {role}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {deptDisplay} · {count} {count === 1 ? 'member' : 'members'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditJobDrawer(role)}
                            className="text-slate-600 hover:text-slate-900 font-semibold text-xs cursor-pointer px-2.5 py-1 rounded-md hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteJobRole(role)}
                            className="text-slate-400 hover:text-red-600 px-2 py-1 text-xs font-semibold cursor-pointer transition-colors"
                            title="Delete Role"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 3. DEPARTMENTS & TEAMS                                                    */}
          {/* ========================================================================= */}
          {subTab === 'departments_teams' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <h3 className="text-base font-bold text-slate-900">
                  Departments & Teams
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Departments Box */}
                <div className="rounded-xl border border-slate-200 bg-white p-4.5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900">
                      Departments
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">
                      {currentDepartments.length} active
                    </span>
                  </div>

                  {/* Inline Add Department Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDepartment}
                      onChange={(e) => setNewDepartment(e.target.value)}
                      placeholder="Add new department..."
                      className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-blue-600 font-medium text-slate-900"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddDepartment(newDepartment);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddDepartment(newDepartment)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-xs"
                    >
                      Add
                    </button>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                    {currentDepartments.map((dept) => {
                      const memberCount = (state.employees || []).filter(
                        (e) => e.department?.toLowerCase() === dept.toLowerCase()
                      ).length;

                      return (
                        <div
                          key={dept}
                          className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-slate-900 truncate text-xs">{dept}</span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              · {memberCount} {memberCount === 1 ? 'member' : 'members'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteDepartment(dept)}
                            className="text-slate-400 hover:text-rose-600 font-semibold text-xs cursor-pointer px-2 py-0.5 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Teams Box */}
                <div className="rounded-xl border border-slate-200 bg-white p-4.5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900">
                      Teams & Squads
                    </h4>
                    <span className="text-xs text-slate-500 font-medium">
                      {currentTeams.length} active
                    </span>
                  </div>

                  {/* Inline Add Team Input */}
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTeam}
                        onChange={(e) => setNewTeam(e.target.value)}
                        placeholder="Add new team / squad..."
                        className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-blue-600 font-medium text-slate-900"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTeam(newTeam);
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddTeam(newTeam)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer active:scale-95 shadow-xs"
                      >
                        Add
                      </button>
                    </div>
                    <select
                      value={newTeamManagerId}
                      onChange={(e) => setNewTeamManagerId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium text-slate-900"
                    >
                      <option value="">Manager (optional)</option>
                      {(state.employees || []).map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                    {currentTeams.map((team) => {
                      const teamRecords = ((state.customOptions as any)?.teamRecords || []) as Array<{
                        id?: string;
                        name?: string;
                        leadName?: string | null;
                      }>;
                      const record = teamRecords.find(
                        (t) => String(t.name || '').toLowerCase() === team.toLowerCase()
                      );
                      const memberCount = (state.employees || []).filter((e) => {
                        if (record?.id && e.teamId && e.teamId === record.id) return true;
                        return e.team?.toLowerCase() === team.toLowerCase();
                      }).length;

                      return (
                        <div
                          key={team}
                          className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-slate-900 truncate text-xs">{team}</span>
                            <span className="text-[11px] text-slate-500 font-medium">
                              · {memberCount} {memberCount === 1 ? 'member' : 'members'}
                              {record?.leadName ? ` · Manager: ${record.leadName}` : ''}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteTeam(team)}
                            className="text-slate-400 hover:text-rose-600 font-semibold text-xs cursor-pointer px-2 py-0.5 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. EMPLOYMENT TYPES                                                       */}
          {/* ========================================================================= */}
          {subTab === 'employment_types' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Employment Types
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage worker categories and their default benefits eligibility.
                </p>
              </div>

              {/* Add Type Form */}
              <form onSubmit={handleAddEmploymentType} className="flex flex-col sm:flex-row items-center gap-3">
                <input
                  type="text"
                  required
                  value={newEmploymentTypeName}
                  onChange={(e) => setNewEmploymentTypeName(e.target.value)}
                  placeholder="New employment category (e.g. Consultant, Trainee)"
                  className="flex-1 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 outline-none focus:border-blue-600 font-medium"
                />
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={newEmploymentTypeHasBenefits}
                    onChange={(e) => setNewEmploymentTypeHasBenefits(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600 w-4 h-4 cursor-pointer"
                  />
                  <span>Benefits Eligible</span>
                </label>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer shrink-0 shadow-xs"
                >
                  Add Type
                </button>
              </form>

              {/* Roster of Types */}
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white overflow-hidden">
                {employmentTypes.map((et) => {
                  const isEditing = editingEtId === et.id;
                  return (
                    <div
                      key={et.id}
                      className="p-3.5 flex items-center justify-between gap-4 text-xs hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingEtName}
                              onChange={(e) => setEditingEtName(e.target.value)}
                              autoFocus
                              className="rounded-lg border border-blue-600 px-3 py-1 text-xs text-slate-900 outline-none font-semibold"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveEditEmploymentType(et.id)}
                              className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold text-xs cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingEtId(null)}
                              className="px-2 py-1 text-slate-500 hover:text-slate-800 text-xs cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold text-slate-900">{et.name}</span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 shrink-0">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600">
                          <span className="text-[11px] font-medium">Benefits:</span>
                          <ToggleSwitch
                            checked={et.hasBenefits}
                            onChange={() => handleToggleBenefits(et.id)}
                          />
                        </label>

                        {!isEditing && (
                          <button
                            type="button"
                            onClick={() => handleStartEditEmploymentType(et)}
                            className="text-slate-500 hover:text-slate-900 text-xs font-semibold cursor-pointer"
                          >
                            Edit
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteEmploymentType(et.id)}
                          className="text-slate-400 hover:text-red-600 cursor-pointer p-1 text-xs font-semibold"
                          title="Delete"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 5. OFFICE LOCATIONS & SITES                                               */}
          {/* ========================================================================= */}
          {subTab === 'office_locations' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <h3 className="text-base font-bold text-slate-900">
                  Company Office Locations
                </h3>

                <button
                  type="button"
                  onClick={() => {
                    setEditingOfficeData(null);
                    setShowOfficeModal(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                >
                  + Add Office Location
                </button>
              </div>

              {/* Roster of Offices */}
              <div className="space-y-2">
                {(options?.offices || []).length === 0 ? (
                  <div className="p-8 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No office locations configured.
                  </div>
                ) : (
                  (options?.offices || []).map((office) => (
                    <div
                      key={office}
                      className="p-3.5 rounded-lg border border-slate-200 bg-white flex items-center justify-between gap-3 text-xs hover:border-slate-300 transition-colors"
                    >
                      <div>
                        <span className="font-semibold text-slate-900 text-sm block">{office}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            const record = (state.customOptions?.officeRecords || []).find(
                              (r) => r.name.trim().toLowerCase() === office.trim().toLowerCase()
                            );
                            setEditingOfficeData({
                              name: office,
                              address:
                                record?.address ||
                                state.organization.officeLocation?.address ||
                                '',
                              latitude:
                                record && Number.isFinite(record.latitude) && record.latitude !== 0
                                  ? record.latitude
                                  : state.organization.officeLocation?.latitude ||
                                    DEFAULT_GEO_COORDINATES.latitude,
                              longitude:
                                record && Number.isFinite(record.longitude) && record.longitude !== 0
                                  ? record.longitude
                                  : state.organization.officeLocation?.longitude ||
                                    DEFAULT_GEO_COORDINATES.longitude,
                              radiusMeters:
                                record?.radiusMeters ||
                                state.organization.officeLocation?.allowedRadiusMeters ||
                                250,
                            });
                            setShowOfficeModal(true);
                            // Refresh coords from server for this office
                            void (async () => {
                              try {
                                const officesRes = await api.org.getOffices();
                                const match = (officesRes.data || []).find(
                                  (o: any) => String(o.name).toLowerCase() === office.toLowerCase()
                                );
                                if (!match) return;
                                const lat = Number(match.latitude);
                                const lng = Number(match.longitude);
                                const radius = Number(
                                  match.geofence_radius_meters ?? match.geofenceRadiusMeters
                                );
                                setEditingOfficeData((prev) =>
                                  prev
                                    ? {
                                        ...prev,
                                        address: match.address || prev.address,
                                        latitude:
                                          Number.isFinite(lat) && lat !== 0 ? lat : prev.latitude,
                                        longitude:
                                          Number.isFinite(lng) && lng !== 0 ? lng : prev.longitude,
                                        radiusMeters:
                                          Number.isFinite(radius) && radius > 0
                                            ? radius
                                            : prev.radiusMeters,
                                      }
                                    : prev
                                );
                              } catch {
                                // keep local coords
                              }
                            })();
                          }}
                          className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteOffice(office)}
                          className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-rose-600 font-semibold text-xs transition-colors cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 6. PROFILE FIELDS & ONBOARDING CONFIGURATION                              */}
          {/* ========================================================================= */}
          {subTab === 'onboarding' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-7 space-y-6">
              {/* Header & Add Custom Field Action */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    Employee Profile & Onboarding Fields
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-medium">
                    Configure standard and custom fields requested from new hires during onboarding, set mandatory rules, and define document upload slots.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddFieldDrawer(true)}
                  className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer active:scale-95 shrink-0 shadow-xs"
                >
                  <span>Add Custom Field</span>
                </button>
              </div>

              {/* Automation Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Auto-Send Welcome Email
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Dispatches temporary login credentials immediately.
                    </span>
                  </div>
                  <ToggleSwitch checked={autoSendWelcomeEmail} onChange={setAutoSendWelcomeEmail} />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Auto-Assign Team Buddy
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Pairs the new hire with a senior peer for 30 days.
                    </span>
                  </div>
                  <ToggleSwitch checked={autoAssignBuddy} onChange={setAutoAssignBuddy} />
                </div>
              </div>

              {/* Section Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar border-b border-slate-200">
                {[
                  { id: 'all', label: 'All Fields', count: currentOnboardingFields.length },
                  { id: 'basic', label: 'Basic Info', count: currentOnboardingFields.filter((f) => f.section === 'basic').length },
                  { id: 'personal', label: 'Personal Details', count: currentOnboardingFields.filter((f) => f.section === 'personal').length },
                  { id: 'address', label: 'Address & Emergency', count: currentOnboardingFields.filter((f) => f.section === 'address').length },
                  { id: 'banking', label: 'Banking & Tax', count: currentOnboardingFields.filter((f) => f.section === 'banking').length },
                  { id: 'documents', label: 'Document Uploads', count: currentOnboardingFields.filter((f) => f.section === 'documents').length },
                ].map((sec) => (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => setSelectedFieldSection(sec.id as any)}
                    className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                      selectedFieldSection === sec.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <span>{sec.label}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${selectedFieldSection === sec.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      {sec.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Fields List */}
              <div className="space-y-3">
                {currentOnboardingFields
                  .filter((f) => selectedFieldSection === 'all' || f.section === selectedFieldSection)
                  .map((field) => {
                    const sectionBadge = {
                      basic: { name: 'Basic Info', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
                      personal: { name: 'Personal', color: 'bg-purple-50 text-purple-700 border-purple-200' },
                      address: { name: 'Address / Emg', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                      banking: { name: 'Banking & Tax', color: 'bg-amber-50 text-amber-700 border-amber-200' },
                      documents: { name: 'Document File', color: 'bg-rose-50 text-rose-700 border-rose-200' },
                    }[field.section];

                    return (
                      <div
                        key={field.id}
                        className={`p-4 rounded-lg border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                          field.enabled
                            ? 'border-slate-200 bg-white'
                            : 'border-slate-200 bg-slate-50/50 opacity-70'
                        }`}
                      >
                        {/* Left: Field Details */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">
                              {field.label}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${sectionBadge.color}`}>
                              {sectionBadge.name}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase tracking-wider">
                              {field.type}
                            </span>
                            {!field.isSystemDefault && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                Custom
                              </span>
                            )}
                          </div>
                          {field.description && (
                            <p className="text-[11px] text-slate-500 font-medium">
                              {field.description}
                            </p>
                          )}
                          {field.options && field.options.length > 0 && (
                            <p className="text-[10px] text-slate-400">
                              Options: {field.options.join(', ')}
                            </p>
                          )}
                        </div>

                        {/* Right: Controls (Required Toggle, Enabled Toggle, Delete) */}
                        <div className="flex items-center gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-500">
                              {field.required ? (
                                <span className="text-slate-900 font-semibold">Required</span>
                              ) : (
                                <span className="text-slate-400">Optional</span>
                              )}
                            </span>
                            <ToggleSwitch
                              checked={field.required}
                              onChange={() => handleToggleFieldRequired(field.id)}
                            />
                          </div>

                          <div className="h-4 w-px bg-slate-200" />

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-500">
                              {field.enabled ? (
                                <span className="text-emerald-600 font-bold">Active</span>
                              ) : (
                                <span>Disabled</span>
                              )}
                            </span>
                            <ToggleSwitch
                              checked={field.enabled}
                              onChange={() => handleToggleFieldEnabled(field.id)}
                            />
                          </div>

                          {!field.isSystemDefault && (
                            <button
                              type="button"
                              onClick={() => handleDeleteCustomField(field.id)}
                              className="px-2 py-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 text-xs font-semibold transition-colors cursor-pointer ml-1"
                              title="Delete Custom Field"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 7. OFFBOARDING & EXIT POLICY                                              */}
          {/* ========================================================================= */}
          {subTab === 'offboarding' && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-7 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Offboarding & Exit Management
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  Establish clearance workflows, asset recovery, exit interview surveys, and Full & Final settlements.
                </p>
              </div>

              {/* Clearance Policy Checklist */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Mandatory HR Exit Interview Survey
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Requires resigning employee to complete confidential feedback survey before last working day.
                    </span>
                  </div>
                  <ToggleSwitch checked={reqExitInterview} onChange={setReqExitInterview} />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      IT Asset & Hardware Recovery Clearance
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Requires IT admin verification that laptops, monitors, and security keys have been returned.
                    </span>
                  </div>
                  <ToggleSwitch checked={reqAssetClearance} onChange={setReqAssetClearance} />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Line Manager Knowledge Transfer (KT) Sign-Off
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Line manager must sign off on project handover and task re-assignments.
                    </span>
                  </div>
                  <ToggleSwitch checked={reqManagerNOC} onChange={setReqManagerNOC} />
                </div>

                <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Auto-Revoke Google/Workspace & Single Sign-On Access
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Automatically terminates email, drive, and VPN credentials at 11:59 PM on the last day.
                    </span>
                  </div>
                  <ToggleSwitch checked={autoRevokeAccessOnLastDay} onChange={setAutoRevokeAccessOnLastDay} />
                </div>
              </div>

              {/* F&F Settlement Timeline */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <label className="text-xs font-semibold text-slate-600">
                  Full & Final (F&F) Settlement Processing Window
                </label>
                <div className="relative">
                  <select
                    value={fnfSettlementDays}
                    onChange={(e) => setFnfSettlementDays(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer pr-10"
                  >
                    <option value={15}>15 Days following last working day</option>
                    <option value={30}>30 Days (Standard Statutory Cycle)</option>
                    <option value={45}>45 Days</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* 8. PAYROLL SETTINGS & SALARY GROUPS                                      */}
          {/* ========================================================================= */}
          {subTab === 'payroll_settings' && (
            <PayrollSettingsView
              state={state}
              onUpdateState={onUpdateState}
            />
          )}
      </div>

      {/* ========================================================================= */}
      {/* RIGHT-SIDE SLIDE-OVER DRAWER MODAL FOR JOB ROLE CREATION & EDITING        */}
      {/* ========================================================================= */}
      {showJobDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white h-full border-l border-slate-200 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300 custom-scrollbar">
            {/* Drawer Header */}
            <div className="p-6 md:p-7 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white/95 z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  {editingJobTitle ? 'Edit Job Role' : 'Create New Job Role'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure designation, department, permission scope, and compensation band.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowJobDrawer(false);
                  setEditingJobTitle(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-xs font-semibold"
              >
                Close
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleSaveJobRole} className="p-6 md:p-7 space-y-5 flex-1">
              {/* Job Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Job Title / Designation <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={drawerJobTitle}
                  onChange={(e) => setDrawerJobTitle(e.target.value)}
                  placeholder="e.g. Senior Frontend Engineer, QA Lead, Sales Director"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-medium transition-all"
                />
              </div>

              {/* Department & Permission Tier */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    Department
                  </label>
                  <div className="relative">
                    <select
                      value={drawerJobDept}
                      onChange={(e) => setDrawerJobDept(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer pr-10"
                    >
                      {(options?.departments || ['Development', 'Design', 'HR', 'Finance', 'Marketing', 'Operations']).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    Permission Level <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={drawerJobPermission}
                      onChange={(e) => setDrawerJobPermission(e.target.value as any)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer pr-10"
                    >
                      <option value="Employee">Employee (Standard Access)</option>
                      <option value="Manager">Manager (Approver & Lead)</option>
                      <option value="HR">HR (Operations & Records)</option>
                      <option value="Admin">Admin (Full System Access)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Description & Responsibilities */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Role Scope & Responsibilities
                </label>
                <textarea
                  rows={3}
                  value={drawerJobDescription}
                  onChange={(e) => setDrawerJobDescription(e.target.value)}
                  placeholder="Outline the core responsibilities, deliverables, and expectations for this job title..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-medium resize-none"
                />
              </div>

              {/* Feature Access Toggles for this Role */}
              <div className="pt-3 border-t border-slate-200 space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Role Capabilities & Approvals
                </h4>

                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Can Approve Team Timesheets
                    </span>
                    <span className="text-[10px] text-slate-500">Direct reports submit timesheets to this role for sign-off.</span>
                  </div>
                  <ToggleSwitch checked={drawerCanApproveTimesheets} onChange={setDrawerCanApproveTimesheets} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Can Assign and Delegate Project Tasks
                    </span>
                    <span className="text-[10px] text-slate-500">Allows task creation and allocation in project Kanban boards.</span>
                  </div>
                  <ToggleSwitch checked={drawerCanAssignTasks} onChange={setDrawerCanAssignTasks} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-slate-50/50">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Can Regularize Attendance & Review Leaves
                    </span>
                    <span className="text-[10px] text-slate-500">Grants authorization for leave and biometric attendance overrides.</span>
                  </div>
                  <ToggleSwitch checked={drawerCanApproveLeaves} onChange={setDrawerCanApproveLeaves} />
                </div>
              </div>
            </form>

            {/* Drawer Footer Buttons */}
            <div className="p-6 border-t border-slate-200 bg-white flex items-center justify-end gap-3 sticky bottom-0">
              <button
                type="button"
                onClick={() => {
                  setShowJobDrawer(false);
                  setEditingJobTitle(null);
                }}
                className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveJobRole}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>{editingJobTitle ? 'Update Job Role' : 'Save Job Role'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RIGHT-SIDE SLIDE-OVER DRAWER MODAL FOR CUSTOM PROFILE FIELD CREATION      */}
      {/* ========================================================================= */}
      {showAddFieldDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white h-full border-l border-slate-200 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300 custom-scrollbar">
            {/* Drawer Header */}
            <div className="p-6 md:p-7 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white/95 z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                  Add Custom Profile Field
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Create custom information fields or document upload slots for employee onboarding.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddFieldDrawer(false)}
                className="text-slate-400 hover:text-slate-700 p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-xs font-semibold"
              >
                Close
              </button>
            </div>

            {/* Drawer Form Body */}
            <form onSubmit={handleCreateCustomField} className="p-6 md:p-7 space-y-5 flex-1">
              {/* Field Label */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Field Display Label <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="e.g. LinkedIn Profile URL, T-Shirt Size, Driver License Scan"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-medium transition-all"
                />
              </div>

              {/* Section Category & Field Input Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    Onboarding Section <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={newFieldSection}
                      onChange={(e) => setNewFieldSection(e.target.value as OnboardingSectionKey)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer pr-10"
                    >
                      <option value="basic">1. Basic & Work Info</option>
                      <option value="personal">2. Personal Information</option>
                      <option value="address">3. Residential & Emergency</option>
                      <option value="banking">4. Banking & Tax Details</option>
                      <option value="documents">5. Document Uploads</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    Input Control Type <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as CustomProfileField['type'])}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 appearance-none outline-none focus:border-blue-600 cursor-pointer pr-10"
                    >
                      <option value="text">Single Line Text</option>
                      <option value="textarea">Long Text / Textarea</option>
                      <option value="number">Number</option>
                      <option value="date">Date Picker</option>
                      <option value="select">Dropdown Menu (Select)</option>
                      <option value="file">File Upload (Document)</option>
                      <option value="email">Email Address</option>
                      <option value="tel">Phone / Contact Number</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Options for Select dropdown */}
              {newFieldType === 'select' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    Dropdown Choices (Comma Separated) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newFieldOptionsStr}
                    onChange={(e) => setNewFieldOptionsStr(e.target.value)}
                    placeholder="e.g. Small, Medium, Large, XL, XXL"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-medium transition-all"
                  />
                  <p className="text-[10px] text-slate-400">Separate each choice with a comma.</p>
                </div>
              )}

              {/* Placeholder */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Input Placeholder (Optional)
                </label>
                <input
                  type="text"
                  value={newFieldPlaceholder}
                  onChange={(e) => setNewFieldPlaceholder(e.target.value)}
                  placeholder="e.g. https://linkedin.com/in/username"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-medium transition-all"
                />
              </div>

              {/* Description / Instructions */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Help Text & Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newFieldDescription}
                  onChange={(e) => setNewFieldDescription(e.target.value)}
                  placeholder="Provide any formatting guidelines or requirements for the employee..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-medium resize-none"
                />
              </div>

              {/* Required Field Toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Required Field
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Employee must complete this field before completing onboarding.
                  </span>
                </div>
                <ToggleSwitch checked={newFieldRequired} onChange={setNewFieldRequired} />
              </div>
            </form>

            {/* Drawer Actions Footer */}
            <div className="p-6 border-t border-slate-200 flex items-center justify-end gap-3 bg-white sticky bottom-0 z-10">
              <button
                type="button"
                onClick={() => setShowAddFieldDrawer(false)}
                className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCustomField}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>Add Field to Onboarding</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Office Location Modal */}
      <AddOfficeModal
        isOpen={showOfficeModal}
        onClose={() => {
          setShowOfficeModal(false);
          setEditingOfficeData(null);
        }}
        onSave={handleSaveOfficeModal}
        initialData={editingOfficeData}
      />
    </div>
  );
};
