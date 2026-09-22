'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Check,
  ArrowRight,
  ArrowLeft,
  Trash2,
  Shield,
} from 'lucide-react';
import { OfficeLocationPickerMap } from '@/components/common/OfficeLocationPickerMap';
import {
  DEFAULT_GEO_COORDINATES,
  DEFAULT_OFFICE_RADIUS_METERS,
  MAX_GEOFENCE_LIMIT_METERS,
  MIN_GEOFENCE_LIMIT_METERS,
} from '@/config/constants';
import { useApp } from '@/context/AppContext';
import { Employee, DepartmentName, Role } from '@/types';
import { api } from '@/services/apiClient';
import { saveStoredState } from '@/services/store';
import { inferApiRoleFromDesignation } from '@/utils/roleMapping';

interface TempOffice {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  geofencingStatus: 'Active' | 'Inactive';
  clockingDevices: string;
  policyDescription?: string;
}

interface TempJobRole {
  id: string;
  title: string;
  department: string;
  permissionLevel: 'Employee' | 'HR' | 'Manager' | 'Admin';
  description?: string;
  canApproveTimesheets?: boolean;
  canAssignTasks?: boolean;
  canApproveLeaves?: boolean;
}

interface TempEmployee {
  id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  officeName: string;
  joiningDate: string;
  employmentType: 'Full-time' | 'Part-time' | 'Contract' | 'Intern';
  shift: string;
}

interface DepartmentAssignment {
  department: string;
  teamLeadId: string;
  memberIds: string[];
}

const COMMON_DEPARTMENTS = [
  'Engineering',
  'Product',
  'Design',
  'Marketing',
  'Sales',
  'Human Resources',
  'Finance',
  'Operations',
];

function readOnboardingStatus(): string {
  if (typeof document === 'undefined') return 'NOT_STARTED';
  const raw = document.cookie
    .split('; ')
    .find((row) => row.startsWith('BOS_ONBOARDING_STATUS='))
    ?.split('=')[1];
  return raw ? decodeURIComponent(raw) : 'NOT_STARTED';
}

function setOnboardingCookie(status: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `BOS_ONBOARDING_STATUS=${encodeURIComponent(status)}; path=/; max-age=86400; SameSite=Lax`;
}

function onboardingStatusToStep(status: string): 1 | 2 | 3 | 4 | 5 {
  const normalized = String(status || 'NOT_STARTED').trim().toUpperCase();
  switch (normalized) {
    case 'OFFICE_SETUP':
      return 2;
    case 'DEPARTMENTS_SETUP':
      return 3;
    case 'ROLES_SETUP':
      return 4;
    case 'TEAM_SETUP':
      return 5;
    case 'COMPLETED':
      // Completed workspaces should not sit in the wizard — treat as done.
      return 5;
    case 'NOT_STARTED':
    case 'PENDING':
    case '':
    default:
      return 1;
  }
}

function isSetupCompleteStatus(status: string): boolean {
  return String(status || '').trim().toUpperCase() === 'COMPLETED';
}

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
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-150 ease-in-out outline-none ${checked ? 'bg-[#2563eb]' : 'bg-[#cbd5e1]'
        }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition duration-150 ease-in-out mt-0.5 ${checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
      />
    </button>
  );
};

export const WorkspaceSetupWizard: React.FC = () => {
  const router = useRouter();
  const { state, updateState, triggerToast, syncWithBackend, backendStatus } = useApp();

  const persistSetupStep = async (request: Promise<{ success: boolean; error?: { message?: string } }>, label: string) => {
    try {
      const response = await request;
      if (response.success) return true;

      triggerToast({
        title: `${label} was not saved`,
        message: response.error?.message || 'Unable to reach the server. Please try again.',
        type: 'error',
      });
      return false;
    } catch (e: any) {
      triggerToast({
        title: `${label} was not saved`,
        message: e?.message || 'Unable to reach the server. Please try again.',
        type: 'error',
      });
      return false;
    }
  };

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const hasRestoredSetupProgress = useRef(false);
  const lastAppliedOnboardingStatus = useRef<string | null>(null);

  // STEP 1: Offices (Features from AddOfficeModal)
  useEffect(() => {
    if (!state.isAuthenticated || !api.getToken()) {
      triggerToast({
        title: 'Authentication Required',
        message: 'Please authenticate with valid credentials before accessing workspace setup.',
        type: 'warning',
      });
      router.replace('/login');
    }
  }, [state.isAuthenticated, router, triggerToast]);

  const initialOfficesList: TempOffice[] = (() => {
    const existing = (state.customOptions?.offices || []).filter(
      (o) => o && o !== 'Main Headquarters' && o !== 'Corporate Headquarters' && o !== 'Office Location'
    );
    if (existing.length > 0) {
      return existing.map((o, idx) => ({
        id: `off_${idx}`,
        name: o,
        address: state.organization?.officeLocation?.address || '',
        latitude: state.organization?.officeLocation?.latitude || DEFAULT_GEO_COORDINATES.latitude,
        longitude: state.organization?.officeLocation?.longitude || DEFAULT_GEO_COORDINATES.longitude,
        radiusMeters: state.organization?.officeLocation?.allowedRadiusMeters || DEFAULT_OFFICE_RADIUS_METERS,
        geofencingStatus: 'Active' as const,
        clockingDevices: 'Desktop, Mobile',
        policyDescription: 'Strict clock-in within geofence perimeter',
      }));
    }
    return [];
  })();

  const [offices, setOffices] = useState<TempOffice[]>(initialOfficesList);

  const [officeName, setOfficeName] = useState(initialOfficesList[0]?.name || '');
  const [officeAddress, setOfficeAddress] = useState(initialOfficesList[0]?.address || state.organization?.officeLocation?.address || '');
  const [officeLatitude, setOfficeLatitude] = useState<number>(initialOfficesList[0]?.latitude || state.organization?.officeLocation?.latitude || DEFAULT_GEO_COORDINATES.latitude);
  const [officeLongitude, setOfficeLongitude] = useState<number>(initialOfficesList[0]?.longitude || state.organization?.officeLocation?.longitude || DEFAULT_GEO_COORDINATES.longitude);
  const [officeRadius, setOfficeRadius] = useState<number>(initialOfficesList[0]?.radiusMeters || 150);
  const [officeStatus, setOfficeStatus] = useState<'Active' | 'Inactive'>(initialOfficesList[0]?.geofencingStatus || 'Active');
  const [officeDevices, setOfficeDevices] = useState(initialOfficesList[0]?.clockingDevices || 'Desktop, Mobile');
  const [officeError, setOfficeError] = useState('');
  const [editingOfficeId, setEditingOfficeId] = useState<string | null>(initialOfficesList[0]?.id || null);

  // Geolocation detection on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setOfficeLatitude(pos.coords.latitude);
          setOfficeLongitude(pos.coords.longitude);
        },
        () => {
          setOfficeLatitude(DEFAULT_GEO_COORDINATES.latitude);
          setOfficeLongitude(DEFAULT_GEO_COORDINATES.longitude);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  // STEP 2: Departments
  const [departments, setDepartments] = useState<string[]>(() => {
    const existing = state.customOptions?.departments || [];
    if (existing.length > 0) return existing;
    return state.organization?.industry?.toLowerCase().includes('inst') ? ['Administration'] : ['Operations'];
  });
  const [departmentInput, setDepartmentInput] = useState('');

  // STEP 3: Job Roles
  const [jobRoles, setJobRoles] = useState<TempJobRole[]>(() => {
    const existing = state.customOptions?.designations || [];
    if (existing.length > 0) {
      return existing.map((title, idx) => {
        const lowerTitle = title.toLowerCase();
        const isLeader =
          lowerTitle.includes('admin') ||
          lowerTitle.includes('founder') ||
          lowerTitle.includes('ceo') ||
          lowerTitle.includes('owner') ||
          lowerTitle.includes('chief') ||
          lowerTitle.includes('president') ||
          lowerTitle.includes('principal') ||
          lowerTitle.includes('dean') ||
          lowerTitle.includes('head') ||
          lowerTitle.includes('director') ||
          lowerTitle.includes('exec');

        const permLevel: 'Employee' | 'HR' | 'Manager' | 'Admin' = isLeader
          ? 'Admin'
          : lowerTitle.includes('manager') || lowerTitle.includes('lead')
            ? 'Manager'
            : lowerTitle.includes('hr') || lowerTitle.includes('people')
              ? 'HR'
              : 'Employee';

        return {
          id: `job_${idx}`,
          title,
          department: departments[0] || (state.organization?.industry?.toLowerCase().includes('inst') ? 'Administration' : 'Operations'),
          permissionLevel: permLevel,
          description: 'Standard workspace position',
          canApproveTimesheets: permLevel === 'Admin' || permLevel === 'Manager',
          canAssignTasks: true,
          canApproveLeaves: permLevel === 'Admin' || permLevel === 'Manager' || permLevel === 'HR',
        };
      });
    }
    if (state.currentPersona) {
      const title = state.currentPersona.designation || (state.currentPersona.role === 'student' ? 'Student' : 'Super Admin');
      return [
        {
          id: 'job_0',
          title: title,
          department: departments[0] || (state.organization?.industry?.toLowerCase().includes('inst') ? 'Administration' : 'Operations'),
          permissionLevel: 'Admin',
          description: 'Workspace Owner / Admin',
          canApproveTimesheets: true,
          canAssignTasks: true,
          canApproveLeaves: true,
        },
      ];
    }
    return [];
  });

  // After a hard reload, restore offices/departments/roles + wizard step from the API
  // (localStorage intentionally does not keep setup business data).
  useEffect(() => {
    const syncedOffices = (state.customOptions?.offices || []).filter(
      (o) => o && o !== 'Main Headquarters' && o !== 'Corporate Headquarters' && o !== 'Office Location'
    );
    const syncedDepartments = state.customOptions?.departments || [];
    const syncedRoles = state.customOptions?.designations || [];

    // Only hydrate empty local lists from the API — never clobber in-progress edits.
    if (syncedOffices.length > 0) {
      setOffices((prev) => {
        if (prev.length > 0) return prev;
        return syncedOffices.map((name, idx) => ({
          id: `off_synced_${idx}`,
          name,
          address: state.organization?.officeLocation?.address || name,
          latitude: state.organization?.officeLocation?.latitude || DEFAULT_GEO_COORDINATES.latitude,
          longitude: state.organization?.officeLocation?.longitude || DEFAULT_GEO_COORDINATES.longitude,
          radiusMeters: state.organization?.officeLocation?.allowedRadiusMeters || DEFAULT_OFFICE_RADIUS_METERS,
          geofencingStatus: 'Active' as const,
          clockingDevices: 'Desktop, Mobile',
          policyDescription: 'Strict clock-in within geofence perimeter',
        }));
      });
    }

    if (syncedDepartments.length > 0) {
      setDepartments((prev) => {
        const onlyDefaults =
          prev.length === 0 ||
          prev.every((d) => d === 'Operations' || d === 'Administration');
        if (!onlyDefaults) return prev;
        // Avoid new array identity when contents already match (prevents auto-save loops).
        if (
          prev.length === syncedDepartments.length &&
          prev.every((d, i) => d === syncedDepartments[i])
        ) {
          return prev;
        }
        return syncedDepartments;
      });
    }

    if (syncedRoles.length > 0) {
      setJobRoles((prev) => {
        let changed = false;
        const merged = [...prev];
        for (const title of syncedRoles) {
          if (!merged.some((r) => r.title.toLowerCase() === title.toLowerCase())) {
            changed = true;
            merged.push({
              id: `job_synced_${merged.length}`,
              title,
              department: syncedDepartments[0] || 'Operations',
              permissionLevel: 'Employee',
              description: 'Standard workspace position',
            });
          }
        }
        return changed ? merged : prev;
      });
    }

    const syncedEmployees = state.employees || [];
    if (syncedEmployees.length > 0) {
      setEmployees((prev) => {
        const merged = [...prev];
        for (const emp of syncedEmployees) {
          const name = emp.name || `${(emp as any).firstName || ''} ${(emp as any).lastName || ''}`.trim();
          const email = emp.email || '';
          if (!name && !email) continue;
          if (merged.some((e) => (email && e.email.toLowerCase() === email.toLowerCase()) || e.name === name)) {
            continue;
          }
          merged.push({
            id: emp.id || `emp_synced_${merged.length}`,
            name: name || email,
            email,
            phone: emp.phone || '',
            designation: emp.designation || (emp as any).role || 'Employee',
            department: emp.department || syncedDepartments[0] || 'Operations',
            officeName: (emp as any).location || (emp as any).officeName || offices[0]?.name || '',
            joiningDate: (emp as any).joiningDate || new Date().toISOString().substring(0, 10),
            employmentType: 'Full-time',
            shift: 'General Day Shift (09:00 - 18:00)',
          });
        }
        return merged;
      });
    }
  }, [state.customOptions, state.organization, state.employees, backendStatus]);

  // Resume wizard step once from backend onboarding status.
  // Keep this effect free of setState→dep loops (no updateState, stable deps only).
  useEffect(() => {
    if (backendStatus === 'syncing') return;
    if (hasRestoredSetupProgress.current) return;

    const statusFromMe = (state as any).onboardingStatus as string | undefined;
    // Wait until sync has settled so we don't apply a stale cookie mid-flight.
    if (backendStatus !== 'connected' && backendStatus !== 'disconnected') return;
    if (!statusFromMe && backendStatus === 'connected') {
      // Connected but /me has not provided status yet — use cookie once.
    }

    const status = String(statusFromMe || readOnboardingStatus() || 'NOT_STARTED');
    if (lastAppliedOnboardingStatus.current === status) {
      hasRestoredSetupProgress.current = true;
      return;
    }

    if (isSetupCompleteStatus(status)) {
      hasRestoredSetupProgress.current = true;
      lastAppliedOnboardingStatus.current = status;
      setOnboardingCookie('COMPLETED');
      window.location.assign('/dashboard');
      return;
    }

    let nextStep = onboardingStatusToStep(status);

    // Stale TEAM_SETUP/ROLES with no org data → stay on step 1 (cookie only, no setState loop).
    const officesCount = (state.customOptions?.offices || []).filter(
      (o: string) => o && o !== 'Main Headquarters' && o !== 'Corporate Headquarters'
    ).length;
    const deptsCount = (state.customOptions?.departments || []).length;
    if (nextStep >= 4 && officesCount === 0 && deptsCount === 0) {
      nextStep = 1;
      setOnboardingCookie('NOT_STARTED');
    }

    setCurrentStep(nextStep);
    lastAppliedOnboardingStatus.current = status;
    hasRestoredSetupProgress.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot resume after sync settles
  }, [backendStatus, (state as any).onboardingStatus]);

  const [jobTitleInput, setJobTitleInput] = useState('');
  const [jobDeptInput, setJobDeptInput] = useState('');
  const [jobPermissionInput, setJobPermissionInput] = useState<'Employee' | 'HR' | 'Manager' | 'Admin'>('Employee');
  const [jobDescriptionInput, setJobDescriptionInput] = useState('');
  const [jobCanApproveTimesheets, setJobCanApproveTimesheets] = useState(false);
  const [jobCanAssignTasks, setJobCanAssignTasks] = useState(true);
  const [jobCanApproveLeaves, setJobCanApproveLeaves] = useState(false);
  const [jobError, setJobError] = useState('');
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  const [employees, setEmployees] = useState<TempEmployee[]>(() => {
    const existingEmployees = state.employees || [];
    if (existingEmployees.length > 0) {
      return existingEmployees.map(emp => ({
        id: emp.id,
        name: emp.name,
        email: emp.email,
        phone: emp.phone || '',
        designation: emp.designation || emp.role || 'Employee',
        department: emp.department || departments[0] || 'General',
        officeName: emp.location || emp.officeName || offices[0]?.name || '',
        joiningDate: emp.joinDate || emp.joiningDate || new Date().toISOString().substring(0, 10),
        employmentType: 'Full-time',
        shift: 'General Day Shift (09:00 - 18:00)',
      }));
    }
    
    // Fallback: Just the current persona if no employees exist in state
    if (state.currentPersona) {
      const existingEmp = existingEmployees.find(e => e.id === state.currentPersona?.id || e.email === state.currentPersona?.email);
      const assignedDept = existingEmp?.department || departments[0] || 'Management';
      return [{
        id: state.currentPersona.id || `setup_emp_${Date.now()}`,
        name: state.currentPersona.name || '',
        email: state.currentPersona.email || '',
        phone: existingEmp?.phone || '',
        designation: state.currentPersona.designation || (state.currentPersona.role === 'student' ? 'Student' : 'Super Admin'),
        department: assignedDept,
        officeName: existingEmp?.officeName || existingEmp?.location || offices[0]?.name || '',
        joiningDate: existingEmp?.joiningDate || new Date().toISOString().substring(0, 10),
        employmentType: 'Full-time',
        shift: 'General Day Shift (09:00 - 18:00)',
      }];
    }
    return [];
  });
  const [empName, setEmpName] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empDesignation, setEmpDesignation] = useState(() => jobRoles[0]?.title || '');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empOffice, setEmpOffice] = useState('');
  const [empJoiningDate, setEmpJoiningDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [empEmploymentType, setEmpEmploymentType] = useState<'Full-time' | 'Part-time' | 'Contract' | 'Intern'>('Full-time');
  const [empShift, setEmpShift] = useState('General Day Shift (09:00 - 18:00)');
  const [employeeError, setEmployeeError] = useState('');

  // STEP 5: Finalize Departments & Team Leads
  const [assignments, setAssignments] = useState<Record<string, DepartmentAssignment>>({});

  // --- Auto-Save Hooks to prevent data loss if user quits early ---
  // Wait until backend hydration finishes so defaults (e.g. "Operations")
  // do not overwrite freshly synced tenant data after reload.
  useEffect(() => {
    if (!hasRestoredSetupProgress.current || offices.length === 0) return;
    const nextOffices = Array.from(new Set(offices.map((o) => o.name).filter(Boolean)));
    updateState((prev) => {
      const prevOffices = prev.customOptions?.offices || [];
      if (
        prevOffices.length === nextOffices.length &&
        prevOffices.every((o, i) => o === nextOffices[i])
      ) {
        return prev;
      }
      return {
        ...prev,
        organization: {
          ...prev.organization,
          officeLocation: {
            address: offices[0]?.address || prev.organization?.officeLocation?.address || '',
            latitude: offices[0]?.latitude || prev.organization?.officeLocation?.latitude || 0,
            longitude: offices[0]?.longitude || prev.organization?.officeLocation?.longitude || 0,
            allowedRadiusMeters: offices[0]?.radiusMeters || prev.organization?.officeLocation?.allowedRadiusMeters || 150,
          },
        },
        customOptions: {
          ...prev.customOptions,
          offices: nextOffices,
        },
      };
    });
  }, [offices, updateState]);

  useEffect(() => {
    if (!hasRestoredSetupProgress.current || departments.length === 0) return;
    updateState((prev) => {
      const nextDepartments = Array.from(
        new Set([...(prev.customOptions?.departments || []), ...departments.filter(Boolean)])
      );
      const prevDepartments = prev.customOptions?.departments || [];
      if (
        prevDepartments.length === nextDepartments.length &&
        prevDepartments.every((d, i) => d === nextDepartments[i])
      ) {
        return prev;
      }
      return {
        ...prev,
        customOptions: {
          ...prev.customOptions,
          departments: nextDepartments,
        },
      };
    });
  }, [departments, updateState]);

  useEffect(() => {
    if (!hasRestoredSetupProgress.current || jobRoles.length === 0) return;
    updateState((prev) => {
      const nextDesignations = Array.from(
        new Set([
          ...(prev.customOptions?.designations || []),
          ...jobRoles.map((j) => j.title).filter(Boolean),
        ])
      );
      const prevDesignations = prev.customOptions?.designations || [];
      if (
        prevDesignations.length === nextDesignations.length &&
        prevDesignations.every((d, i) => d === nextDesignations[i])
      ) {
        return prev;
      }
      return {
        ...prev,
        customOptions: {
          ...prev.customOptions,
          designations: nextDesignations,
        },
      };
    });
  }, [jobRoles, updateState]);
  // ----------------------------------------------------------------

  const stepsList = [
    { num: 1, title: 'Office Locations' },
    { num: 2, title: 'Departments' },
    { num: 3, title: 'Job Roles' },
    { num: 4, title: 'Team Members' },
    { num: 5, title: 'Finalize & Managers' },
  ];

  const handleLocationChange = (lat: number, lng: number, newAddress?: string) => {
    setOfficeLatitude(lat);
    setOfficeLongitude(lng);
    if (newAddress) {
      setOfficeAddress(newAddress);
    }
  };

  const handleRadiusChange = (val: number) => {
    const clamped = Math.min(MAX_GEOFENCE_LIMIT_METERS, Math.max(MIN_GEOFENCE_LIMIT_METERS, val));
    setOfficeRadius(clamped);
  };

  const resetOfficeForm = () => {
    setEditingOfficeId(null);
    setOfficeName('');
    setOfficeAddress('');
    setOfficeLatitude(DEFAULT_GEO_COORDINATES.latitude);
    setOfficeLongitude(DEFAULT_GEO_COORDINATES.longitude);
    setOfficeRadius(DEFAULT_OFFICE_RADIUS_METERS);
    setOfficeStatus('Active');
    setOfficeDevices('Desktop, Mobile');
    setOfficeError('');
  };

  // Commit current office form values into offices state
  const handleCommitCurrentOffice = (): boolean => {
    setOfficeError('');
    const nameTrimmed = officeName.trim();
    if (!nameTrimmed) {
      setOfficeError('Please enter an Office / Branch name above');
      const el = document.getElementById('office-name-input');
      if (el) el.focus();
      return false;
    }

    const derivedPolicy =
      officeStatus === 'Active'
        ? 'Strict clock-in within geofence perimeter'
        : 'Flexible clock-in (GPS optional)';

    if (editingOfficeId) {
      if (offices.some((o) => o.id !== editingOfficeId && o.name.toLowerCase() === nameTrimmed.toLowerCase())) {
        setOfficeError('An office with this name already exists');
        return false;
      }
      setOffices((prev) =>
        prev.map((o) =>
          o.id === editingOfficeId
            ? {
              ...o,
              name: nameTrimmed,
              address: officeAddress.trim() || `${officeLatitude.toFixed(4)}, ${officeLongitude.toFixed(4)}`,
              latitude: officeLatitude,
              longitude: officeLongitude,
              radiusMeters: officeRadius,
              geofencingStatus: officeStatus,
              clockingDevices: officeDevices,
              policyDescription: derivedPolicy,
            }
            : o
        )
      );
    } else {
      const existingIndex = offices.findIndex((o) => o.name.toLowerCase() === nameTrimmed.toLowerCase());
      if (existingIndex >= 0) {
        setOffices((prev) =>
          prev.map((o, idx) =>
            idx === existingIndex
              ? {
                ...o,
                name: nameTrimmed,
                address: officeAddress.trim() || `${officeLatitude.toFixed(4)}, ${officeLongitude.toFixed(4)}`,
                latitude: officeLatitude,
                longitude: officeLongitude,
                radiusMeters: officeRadius,
                geofencingStatus: officeStatus,
                clockingDevices: officeDevices,
                policyDescription: derivedPolicy,
              }
              : o
          )
        );
      } else {
        const newOff: TempOffice = {
          id: `off_${Date.now()}`,
          name: nameTrimmed,
          address: officeAddress.trim() || `${officeLatitude.toFixed(4)}, ${officeLongitude.toFixed(4)}`,
          latitude: officeLatitude,
          longitude: officeLongitude,
          radiusMeters: officeRadius,
          geofencingStatus: officeStatus,
          clockingDevices: officeDevices,
          policyDescription: derivedPolicy,
        };
        setOffices((prev) => [...prev, newOff]);
      }
    }
    resetOfficeForm();
    return true;
  };

  const handleProceedToStep2 = async () => {
    let officesSnapshot = offices;

    if (officeName.trim()) {
      const nameTrimmed = officeName.trim();
      const derivedPolicy =
        officeStatus === 'Active'
          ? 'Strict clock-in within geofence perimeter'
          : 'GPS optional — geofencing inactive';
      const committed: TempOffice = {
        id: editingOfficeId || `off_${Date.now()}`,
        name: nameTrimmed,
        address: officeAddress.trim() || `${officeLatitude.toFixed(4)}, ${officeLongitude.toFixed(4)}`,
        latitude: officeLatitude,
        longitude: officeLongitude,
        radiusMeters: officeRadius,
        geofencingStatus: officeStatus,
        clockingDevices: officeDevices,
        policyDescription: derivedPolicy,
      };
      const success = handleCommitCurrentOffice();
      if (!success) return;
      officesSnapshot = editingOfficeId
        ? offices.map((o) => (o.id === editingOfficeId ? committed : o))
        : [...offices.filter((o) => o.name.toLowerCase() !== nameTrimmed.toLowerCase()), committed];
    } else if (officesSnapshot.length === 0) {
      setOfficeError('Please configure at least one office location');
      const el = document.getElementById('office-name-input');
      if (el) el.focus();
      return;
    }

    try {
      if (officesSnapshot.length > 0) {
        for (const office of officesSnapshot) {
          const codeSeed = (office.name || 'OFF').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase() || 'OFF';
          const saved = await persistSetupStep(
            api.org.createOffice({
              name: office.name,
              code: `${codeSeed}${Math.floor(10 + Math.random() * 90)}`,
              address: office.address,
              latitude: office.latitude,
              longitude: office.longitude,
              geofenceRadiusMeters: office.radiusMeters,
            }),
            'Office'
          );
          if (!saved) return;
        }
        const officeGeofencePolicies = officesSnapshot.map((o) => ({
          id: o.id,
          name: o.name,
          geofencingStatus: o.geofencingStatus,
          radiusMeters: o.radiusMeters,
          address: o.address,
        }));
        const anyInactive = officesSnapshot.some((o) => o.geofencingStatus === 'Inactive');
        const attSaved = await persistSetupStep(
          api.setup.saveAttendanceSettings({
            attendanceSettings: {
              officeGeofencePolicies,
              ...(anyInactive ? { requireLocationGPS: false, geofenceEnabled: false } : {}),
            },
          }),
          'Office geofence policy'
        );
        if (!attSaved) return;
        updateState((prev) => ({
          ...prev,
          customOptions: {
            ...prev.customOptions,
            attendanceSettings: {
              ...prev.customOptions?.attendanceSettings,
              officeGeofencePolicies,
              ...(anyInactive ? { requireLocationGPS: false, geofenceEnabled: false } : {}),
            },
          },
        }));
        setOnboardingCookie('OFFICE_SETUP');
      }
    } catch (e) {
      console.warn('Backend sync for office failed', e);
      return;
    }

    setCurrentStep(2);
  };

  const handleAddAnotherOffice = () => {
    if (officeName.trim()) {
      const addedName = officeName.trim();
      const success = handleCommitCurrentOffice();
      if (!success) return;
      triggerToast({
        title: 'Office Location Added',
        message: `Successfully configured office location "${addedName}".`,
        type: 'success',
      });
    }
    resetOfficeForm();
  };

  const handleSaveCurrentEdit = () => {
    const success = handleCommitCurrentOffice();
    if (!success) return;
    resetOfficeForm();
  };

  const handleEditOffice = (off: TempOffice) => {
    setEditingOfficeId(off.id);
    setOfficeName(off.name);
    setOfficeAddress(off.address);
    setOfficeLatitude(off.latitude);
    setOfficeLongitude(off.longitude);
    setOfficeRadius(off.radiusMeters);
    setOfficeStatus(off.geofencingStatus);
    setOfficeDevices(off.clockingDevices);
    setOfficeError('');
    const el = document.getElementById('office-name-input');
    if (el) el.focus();
  };

  const handleCancelEdit = () => {
    resetOfficeForm();
  };

  const handleRemoveOffice = (idToRemove: string) => {
    setOffices((prev) => prev.filter((o) => o.id !== idToRemove));
    if (editingOfficeId === idToRemove) {
      handleCancelEdit();
    }
  };

  // Add Department Handler
  const handleAddDepartment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = departmentInput.trim();
    if (!trimmed) return;
    if (departments.some((d) => d.toLowerCase() === trimmed.toLowerCase())) {
      setDepartmentInput('');
      return;
    }
    setDepartments((prev) => [...prev, trimmed]);
    setDepartmentInput('');
  };

  const handleQuickAddDepartment = (dept: string) => {
    if (departments.some((d) => d.toLowerCase() === dept.toLowerCase())) return;
    setDepartments((prev) => [...prev, dept]);
  };

  const handleRemoveDepartment = (deptToRemove: string) => {
    setDepartments((prev) => prev.filter((d) => d !== deptToRemove));
    setEmployees((prev) =>
      prev.map((emp) => (emp.department === deptToRemove ? { ...emp, department: '' } : emp))
    );
  };

  const handleProceedToStep3 = async () => {
    try {
      if (departments.length > 0) {
        for (const [i, name] of departments.entries()) {
          const code = `${name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'DEP'}${i}${Math.floor(10 + Math.random() * 90)}`;
          const saved = await persistSetupStep(
            api.org.createDepartment({ name, code }),
            'Departments'
          );
          if (!saved) return;
        }
        setOnboardingCookie('DEPARTMENTS_SETUP');
      }
    } catch (e) {
      console.warn('Backend sync for departments failed', e);
      return;
    }
    setCurrentStep(3);
  };

  // Job Roles Handlers
  const handleCommitCurrentJob = (): boolean => {
    setJobError('');
    const titleTrimmed = jobTitleInput.trim();
    if (!titleTrimmed) {
      setJobError('Job title is required');
      return false;
    }

    const assignedDept = jobDeptInput || departments[0] || 'General';

    if (editingJobId) {
      setJobRoles((prev) =>
        prev.map((j) =>
          j.id === editingJobId
            ? {
              ...j,
              title: titleTrimmed,
              department: assignedDept,
              permissionLevel: jobPermissionInput,
              description: jobDescriptionInput.trim() || undefined,
              canApproveTimesheets: jobCanApproveTimesheets,
              canAssignTasks: jobCanAssignTasks,
              canApproveLeaves: jobCanApproveLeaves,
            }
            : j
        )
      );
      setEditingJobId(null);
    } else {
      const existingIdx = jobRoles.findIndex(
        (j) => j.title.toLowerCase() === titleTrimmed.toLowerCase() && j.department.toLowerCase() === assignedDept.toLowerCase()
      );
      if (existingIdx >= 0) {
        setJobRoles((prev) =>
          prev.map((j, idx) =>
            idx === existingIdx
              ? {
                ...j,
                title: titleTrimmed,
                department: assignedDept,
                permissionLevel: jobPermissionInput,
                description: jobDescriptionInput.trim() || undefined,
                canApproveTimesheets: jobCanApproveTimesheets,
                canAssignTasks: jobCanAssignTasks,
                canApproveLeaves: jobCanApproveLeaves,
              }
              : j
          )
        );
      } else {
        const newJob: TempJobRole = {
          id: `job_${Date.now()}`,
          title: titleTrimmed,
          department: assignedDept,
          permissionLevel: jobPermissionInput,
          description: jobDescriptionInput.trim() || undefined,
          canApproveTimesheets: jobCanApproveTimesheets,
          canAssignTasks: jobCanAssignTasks,
          canApproveLeaves: jobCanApproveLeaves,
        };
        setJobRoles((prev) => [...prev, newJob]);
      }
    }

    setJobTitleInput('');
    setJobDescriptionInput('');
    setJobCanApproveTimesheets(false);
    setJobCanAssignTasks(true);
    setJobCanApproveLeaves(false);
    setJobError('');
    return true;
  };

  const handleProceedToStep4 = async () => {
    if (jobTitleInput.trim()) {
      const success = handleCommitCurrentJob();
      if (!success) return;
    } else if (jobRoles.length === 0) {
      setJobError('Please configure at least one job role');
      return;
    }

    try {
      if (jobRoles.length > 0) {
        for (const [i, role] of jobRoles.entries()) {
          const code = `${role.title.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'ROLE'}${i}${Math.floor(10 + Math.random() * 90)}`;
          const saved = await persistSetupStep(
            api.org.createJobRole({
              title: role.title,
              code,
              level: role.permissionLevel,
            }),
            'Job roles'
          );
          if (!saved) return;
        }
        setOnboardingCookie('ROLES_SETUP');
      }
    } catch (e) {
      console.warn('Backend sync for roles failed', e);
      return;
    }

    setCurrentStep(4);
  };

  const handleEditJob = (job: TempJobRole) => {
    setEditingJobId(job.id);
    setJobTitleInput(job.title);
    setJobDeptInput(job.department);
    setJobPermissionInput(job.permissionLevel);
    setJobDescriptionInput(job.description || '');
    setJobCanApproveTimesheets(job.canApproveTimesheets ?? false);
    setJobCanAssignTasks(job.canAssignTasks ?? true);
    setJobCanApproveLeaves(job.canApproveLeaves ?? false);
    setJobError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelJobEdit = () => {
    setEditingJobId(null);
    setJobTitleInput('');
    setJobDeptInput(departments[0] || 'General');
    setJobPermissionInput('Employee');
    setJobDescriptionInput('');
    setJobCanApproveTimesheets(false);
    setJobCanAssignTasks(true);
    setJobCanApproveLeaves(false);
    setJobError('');
  };

  const handleRemoveJob = (idToRemove: string) => {
    setJobRoles((prev) => prev.filter((j) => j.id !== idToRemove));
    if (editingJobId === idToRemove) {
      handleCancelJobEdit();
    }
  };

  // Add Employee Handler
  const handleAddEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    setEmployeeError('');

    if (!empName.trim()) {
      setEmployeeError('Full name is required');
      return;
    }
    if (!empEmail.trim() || !empEmail.includes('@')) {
      setEmployeeError('Valid official email is required');
      return;
    }
    const resolvedDesignation = (empDesignation || jobRoles[0]?.title || '').trim();
    if (!resolvedDesignation) {
      setEmployeeError('Job title / designation is required');
      return;
    }
    const cleanEmail = empEmail.trim().toLowerCase();
    const cleanName = empName.trim().toLowerCase();
    const cleanPhone = empPhone.trim();

    const isDuplicate =
      employees.some(
        (emp) =>
          (emp.email && emp.email.toLowerCase() === cleanEmail) ||
          (cleanPhone && emp.phone && emp.phone.trim() === cleanPhone) ||
          (emp.name && emp.name.toLowerCase() === cleanName && emp.email && emp.email.toLowerCase() === cleanEmail)
      ) ||
      (state.employees || []).some(
        (emp) =>
          (emp.email && emp.email.toLowerCase() === cleanEmail) ||
          (cleanPhone && emp.phone && emp.phone.trim() === cleanPhone) ||
          (emp.name && emp.name.toLowerCase() === cleanName && emp.email && emp.email.toLowerCase() === cleanEmail)
      );

    if (isDuplicate) {
      setEmployeeError('An employee with this name, email, or phone number already exists.');
      return;
    }

    const assignedDept = empDepartment || departments[0] || 'General';
    const assignedOffice = empOffice || (offices[0]?.name ?? (state.customOptions?.offices?.[0] || ''));

    const newEmp: TempEmployee = {
      id: `setup_emp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: empName.trim(),
      email: empEmail.trim().toLowerCase(),
      phone: empPhone.trim(),
      designation: resolvedDesignation,
      department: assignedDept,
      officeName: assignedOffice,
      joiningDate: empJoiningDate,
      employmentType: empEmploymentType,
      shift: empShift,
    };

    setEmployees((prev) => [...prev, newEmp]);
    setEmpName('');
    setEmpEmail('');
    setEmpPhone('');
    setEmpDesignation(jobRoles[0]?.title || '');
  };

  const isOwnSetupAccount = (emp: Pick<TempEmployee, 'id' | 'email'>) => {
    const persona = state.currentPersona;
    if (!persona) return false;
    const personaEmail = (persona.email || '').trim().toLowerCase();
    const empEmail = (emp.email || '').trim().toLowerCase();
    if (personaEmail && empEmail && personaEmail === empEmail) return true;
    if (persona.id && emp.id && persona.id === emp.id) return true;
    return false;
  };

  const handleRemoveEmployee = (idToRemove: string) => {
    const target = employees.find((e) => e.id === idToRemove);
    if (target && isOwnSetupAccount(target)) {
      triggerToast({
        title: 'Cannot remove your account',
        message: 'You cannot delete your own user during workspace setup.',
        type: 'warning',
      });
      return;
    }
    setEmployees((prev) => prev.filter((e) => e.id !== idToRemove));
    setAssignments((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((dept) => {
        next[dept] = {
          ...next[dept],
          teamLeadId: next[dept].teamLeadId === idToRemove ? '' : next[dept].teamLeadId,
          memberIds: next[dept].memberIds.filter((id) => id !== idToRemove),
        };
      });
      return next;
    });
  };

  const handleProceedToStep5 = async () => {
    if (employees.length === 0) return;
    
    try {
      const saved = await persistSetupStep(api.setup.saveTeam({
        employees: employees
          .filter((emp) => !isOwnSetupAccount(emp))
          .map((emp) => ({
          firstName: emp.name.split(' ')[0],
          lastName: emp.name.split(' ').slice(1).join(' ') || '',
          email: emp.email,
          phone: emp.phone || undefined,
          officeName: emp.officeName,
          department: emp.department,
          designation: emp.designation,
          dateOfJoining: emp.joiningDate,
          role: inferApiRoleFromDesignation(
            emp.designation,
            emp.department === 'Administration' ? 'manager' : 'employee'
          ),
        }))
      }), 'Employees');
      if (!saved) return;
      setOnboardingCookie('TEAM_SETUP');
    } catch (e) {
      console.warn('Backend sync for team failed', e);
      return;
    }

    setAssignments((prev) => {
      const updated = { ...prev };
      departments.forEach((dept) => {
        if (!updated[dept]) {
          const autoMembers = employees.filter((e) => e.department === dept).map((e) => e.id);
          updated[dept] = {
            department: dept,
            teamLeadId: autoMembers[0] || '',
            memberIds: autoMembers,
          };
        }
      });
      return updated;
    });
    setCurrentStep(5);
  };

  const handleToggleMember = (department: string, employeeId: string) => {
    setAssignments((prev) => {
      const current = prev[department] || { department, teamLeadId: '', memberIds: [] };
      const exists = current.memberIds.includes(employeeId);
      const updatedMembers = exists
        ? current.memberIds.filter((id) => id !== employeeId)
        : [...current.memberIds, employeeId];

      return {
        ...prev,
        [department]: {
          ...current,
          memberIds: updatedMembers,
          teamLeadId: exists && current.teamLeadId === employeeId ? '' : current.teamLeadId,
        },
      };
    });
  };

  const handleSetTeamLead = (department: string, teamLeadId: string) => {
    setAssignments((prev) => {
      const current = prev[department] || { department, teamLeadId: '', memberIds: [] };
      const memberIds =
        teamLeadId && !current.memberIds.includes(teamLeadId)
          ? [...current.memberIds, teamLeadId]
          : current.memberIds;

      return {
        ...prev,
        [department]: {
          ...current,
          teamLeadId,
          memberIds,
        },
      };
    });
  };

  // Finish Setup Handler
  const handleFinishSetup = async () => {
    const finalOffices = Array.from(new Set(offices.map((o) => o.name).filter(Boolean)));
    const finalDepartments = Array.from(new Set(departments.filter(Boolean)));
    const finalDesignations = Array.from(new Set(jobRoles.map((j) => j.title).filter(Boolean)));

    const mappedEmployees: Employee[] = employees.map((emp, index) => {
      const assignedDeptEntry = Object.entries(assignments).find(([_, assign]) =>
        assign.memberIds.includes(emp.id)
      );
      const assignedDept = assignedDeptEntry ? assignedDeptEntry[0] : emp.department || finalDepartments[0] || 'General';

      const deptLeadId = assignments[assignedDept]?.teamLeadId || '';
      const leadObj = employees.find((e) => e.id === deptLeadId);

      const isLead = deptLeadId === emp.id;
      const role: Role = isLead ? 'manager' : 'employee';

      const isCurrentPersona = Boolean(
        (state.currentPersona?.email && emp.email?.toLowerCase().trim() === state.currentPersona.email.toLowerCase().trim()) ||
        (state.currentPersona?.id && emp.id === state.currentPersona.id)
      );

      return {
        id: emp.id,
        // Temporary local id — backend assigns canonical EMP-### on save/sync.
        employeeId: `EMP-${String(index + 2).padStart(3, '0')}`,
        name: emp.name,
        fullName: emp.name,
        email: emp.email,
        phone: emp.phone || '—',
        avatar: '',
        designation: emp.designation,
        department: assignedDept as DepartmentName,
        team: `${assignedDept} Team`,
        role: isCurrentPersona && state.currentPersona?.role ? state.currentPersona.role : role,
        joiningDate: emp.joiningDate,
        employmentType: emp.employmentType,
        location: emp.officeName,
        officeName: emp.officeName,
        managerId: leadObj && leadObj.id !== emp.id ? leadObj.id : '',
        managerName: leadObj && leadObj.id !== emp.id ? leadObj.name : '',
        lineManager:
          leadObj && leadObj.id !== emp.id
            ? {
              name: leadObj.name,
              username: `@${leadObj.name.toLowerCase().replace(/\s+/g, '')}`,
              avatar: '',
              designation: leadObj.designation,
            }
            : undefined,
        shiftId: 'sh-1',
        shiftTiming: {
          shiftId: 'sh-1',
          shiftName: emp.shift,
          startTime: '09:00 AM',
          endTime: '06:00 PM',
          graceMinutes: 15,
        },
        skills: ['Team Member'],
        status: isCurrentPersona ? 'Active' : 'Onboarding',
        isActivated: isCurrentPersona,
        accountStatus: isCurrentPersona ? 'Active' : 'Not Activated',
        hasCompletedProfile: isCurrentPersona,
        onboardingProgress: isCurrentPersona ? 100 : 0,
        bankDetails: {
          accountNumber: '—',
          ifscCode: '—',
          bankName: '—',
        },
        emergencyContact: {
          name: '',
          relation: '',
          phone: '',
        },
        payrollSummary: {
          status: isCurrentPersona ? 'Active' : 'Onboarding',
          jobTitle: emp.designation,
          employmentType: emp.employmentType,
          jobDate: emp.joiningDate,
          geofencing: 'Allowed',
          lastWorkingDate: '—',
          totalCompensation: 0,
          salary: 0,
          recurring: 0,
          oneOff: 0,
          offset1: 0,
          offset2: 0,
        },
      };
    });

    // Ensure the current persona (Founder/CEO/Admin) is retained or prepended
    const existingAdminInPrev = (state.employees || []).find(
      (e) =>
        e.role === 'super_admin' ||
        e.employeeId === 'EMP001' ||
        (state.currentPersona?.email && e.email?.toLowerCase().trim() === state.currentPersona.email.toLowerCase().trim()) ||
        (state.currentPersona?.id && e.id === state.currentPersona.id)
    );

    const hasAdminInMapped = mappedEmployees.some(
      (e) =>
        e.role === 'super_admin' ||
        (state.currentPersona?.email && e.email?.toLowerCase().trim() === state.currentPersona.email.toLowerCase().trim()) ||
        (state.currentPersona?.id && e.id === state.currentPersona.id)
    );

    let finalEmployeesList: Employee[] = [...mappedEmployees];

    if (!hasAdminInMapped) {
      if (existingAdminInPrev) {
        finalEmployeesList = [
          {
            ...existingAdminInPrev,
            department: 'Management' as DepartmentName,
            team: 'Executive Leadership',
            status: 'Active',
            isActivated: true,
            accountStatus: 'Active',
            hasCompletedProfile: true,
            onboardingProgress: 100,
            designation:
              existingAdminInPrev.designation &&
                existingAdminInPrev.designation !== 'Staff Member' &&
                existingAdminInPrev.designation !== 'Team Member'
                ? existingAdminInPrev.designation
                : (state.currentPersona?.designation || 'Founder & CEO'),
          },
          ...finalEmployeesList,
        ];
      } else if (state.currentPersona) {
        const resolvedAdminName = state.currentPersona.name || 'Organization Administrator';
        const resolvedAdminEmail = state.currentPersona.email || 'admin@organization.com';
        const resolvedAdminDesignation =
          state.currentPersona.designation &&
            state.currentPersona.designation !== 'Staff Member' &&
            state.currentPersona.designation !== 'Team Member'
            ? state.currentPersona.designation
            : 'Founder & CEO';
        const defaultOffice = finalOffices[0] || 'Headquarters';
        const defaultDept = (finalDepartments[0] || state.currentPersona?.department || (state.organization?.industry?.toLowerCase().includes('inst') ? 'Administration' : 'Operations')) as DepartmentName;

        const founderEmployee: Employee = {
          id: state.currentPersona.id || `admin_founder_${Date.now()}`,
          employeeId: 'EMP001',
          name: resolvedAdminName,
          fullName: resolvedAdminName,
          email: resolvedAdminEmail,
          phone: '—',
          avatar: state.currentPersona.avatar || '',
          department: defaultDept,
          team: 'Executive Leadership',
          designation: resolvedAdminDesignation,
          role: 'super_admin',
          joiningDate: new Date().toISOString().substring(0, 10),
          employmentType: 'Full-time',
          location: defaultOffice,
          officeName: defaultOffice,
          skills: ['Leadership', 'Operations', 'Strategy', 'Executive Management'],
          managerId: '',
          managerName: '',
          shiftId: 'sh-1',
          shiftTiming: {
            shiftId: 'sh-1',
            shiftName: 'General Day Shift (09:00 - 18:00)',
            startTime: '09:00 AM',
            endTime: '06:00 PM',
            graceMinutes: 15,
          },
          bankDetails: {
            accountNumber: '—',
            ifscCode: '—',
            bankName: '—',
          },
          emergencyContact: {
            name: '',
            relation: '',
            phone: '',
          },
          salaryDetails: {
            basic: 100000,
            hra: 40000,
            specialAllowance: 20000,
            pfDeduction: 1800,
            taxDeduction: 10000,
            netPayable: 148200,
          },
          payrollSummary: {
            status: 'Active',
            jobTitle: resolvedAdminDesignation,
            employmentType: 'Full-time',
            jobDate: new Date().toISOString().substring(0, 10),
            geofencing: 'Allowed',
            lastWorkingDate: '—',
            totalCompensation: 148200 * 12,
            salary: 148200,
            recurring: 148200,
            oneOff: 0,
            offset1: 0,
            offset2: 0,
          },
          status: 'Active',
          isActivated: true,
          accountStatus: 'Active',
          hasCompletedProfile: true,
          onboardingProgress: 100,
        };

        finalEmployeesList = [founderEmployee, ...finalEmployeesList];
      }
    }

    const resolvedFinalDepartments = finalDepartments.length > 0
      ? Array.from(new Set(finalDepartments))
      : [state.currentPersona?.department || (state.organization?.industry?.toLowerCase().includes('inst') ? 'Administration' : 'Operations')];

    // Persist manager assignments before marking setup complete / redirecting.
    const assignmentPayload = resolvedFinalDepartments.map((dept) => {
      const assign = assignments[dept];
      const managerEmp = employees.find((e) => e.id === assign?.teamLeadId);
      return {
        department: dept,
        managerEmail: managerEmp?.email || undefined,
        memberEmails: (assign?.memberIds || [])
          .map((id) => employees.find((e) => e.id === id)?.email)
          .filter((email): email is string => Boolean(email)),
      };
    });

    const saved = await persistSetupStep(
      api.setup.saveTeam({
        completeOnboarding: true,
        employees: [],
        assignments: assignmentPayload,
      }),
      'Workspace launch',
    );
    if (!saved) return;

    updateState((prev) => {
      const next = {
        ...prev,
        isAuthenticated: true,
        customOptions: {
          ...prev.customOptions,
          offices: finalOffices,
          departments: resolvedFinalDepartments,
          designations: finalDesignations,
        },
        employees: finalEmployeesList,
      };
      saveStoredState(next);
      return next;
    });

    setOnboardingCookie('COMPLETED');

    triggerToast({
      title: 'Setup Complete',
      message: 'Workspace configured successfully.',
      type: 'success',
    });

    if (typeof window !== 'undefined') {
      window.location.assign('/dashboard');
    } else {
      router.push('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] font-sans flex flex-col justify-between">
      {/* Top Header */}
      <header className="w-full bg-white border-b border-[#e2e8f0] px-5 py-3.5 flex items-center justify-between shadow-2xs">
        <h1 className="text-sm font-bold text-[#0f172a]">Workspace Setup</h1>
        <button
          type="button"
          onClick={async () => {
            setOnboardingCookie('COMPLETED');
            updateState((prev) => ({ ...prev, onboardingStatus: 'COMPLETED' } as any));
            try {
              await api.setup.saveTeam({ completeOnboarding: true, employees: [] });
            } catch (e) {
              console.warn('Could not persist setup completion before exit', e);
            }
            // Hard navigate so proxy sees the updated cookie and /me won't bounce us back.
            window.location.assign('/dashboard');
          }}
          className="px-3 py-1.5 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-xs font-semibold text-[#0f172a] transition-all cursor-pointer shadow-2xs"
        >
          Exit to Dashboard
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 space-y-4 flex flex-col justify-start">
        {/* Stepper Progress Bar */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-4 shadow-2xs">
          <div className="relative flex items-center justify-between">
            <div className="absolute left-8 right-8 top-4 -translate-y-1/2 h-1 bg-[#e2e8f0] rounded-full z-0 overflow-hidden">
              <div
                className="h-full bg-[#2563eb] transition-all duration-300 rounded-full"
                style={{
                  width: `${((currentStep - 1) / (stepsList.length - 1)) * 100}%`,
                }}
              />
            </div>

            {stepsList.map((st) => {
              const isDone = currentStep > st.num;
              const isCurrent = currentStep === st.num;

              return (
                <div
                  key={st.num}
                  onClick={() => {
                    if (st.num < currentStep) setCurrentStep(st.num as any);
                  }}
                  className={`relative z-10 flex flex-col items-center group ${st.num < currentStep ? 'cursor-pointer' : 'cursor-default'
                    }`}
                >
                  <div
                    className={`w-7.5 h-7.5 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${isDone
                        ? 'bg-[#2563eb] text-white'
                        : isCurrent
                          ? 'bg-[#2563eb] text-white ring-3 ring-blue-100 shadow-sm'
                          : 'bg-white border border-[#e2e8f0] text-[#64748b]'
                      }`}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : st.num}
                  </div>
                  <span
                    className={`text-[11px] font-semibold mt-1.5 transition-colors hidden sm:block ${isCurrent ? 'text-[#0f172a] font-bold' : isDone ? 'text-[#2563eb]' : 'text-[#64748b]'
                      }`}
                  >
                    {st.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ==================================================== */}
        {/* STEP 1: ADD OFFICE LOCATIONS (With AddOfficeModal features) */}
        {/* ==================================================== */}
        {currentStep === 1 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 sm:p-6 shadow-2xs space-y-4 animate-in fade-in duration-200">
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold text-[#0f172a]">Add Office Locations</h2>
              <p className="text-[11px] text-[#64748b]">
                Configure office locations, branch campuses, and GPS geofence boundaries for attendance tracking.
              </p>
            </div>

            {/* Comprehensive Office Creation Form matching AddOfficeModal */}
            <form onSubmit={(e) => { e.preventDefault(); handleCommitCurrentOffice(); }} className="space-y-3 pt-2 border-t border-[#e2e8f0]">
              {/* Row 1: Name & Address */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  id="office-name-input"
                  type="text"
                  value={officeName}
                  onChange={(e) => {
                    setOfficeName(e.target.value);
                    if (officeError) setOfficeError('');
                  }}
                  placeholder="Office / Branch Name (e.g. Bengaluru HQ) *"
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] placeholder:text-[#64748b] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                />
                <input
                  type="text"
                  readOnly
                  value={officeAddress}
                  placeholder="Street Address or Campus Landmark (Selected on Map) *"
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 text-xs text-[#0f172a] placeholder:text-[#64748b] outline-none cursor-default font-medium select-none"
                />
              </div>

              {/* Row 2: Location Map */}
              <div className="space-y-1.5">
                <div className="px-0.5">
                  <span className="text-xs font-semibold text-[#0f172a]">Map</span>
                </div>

                <OfficeLocationPickerMap
                  latitude={officeLatitude}
                  longitude={officeLongitude}
                  radiusMeters={officeRadius}
                  onLocationChange={handleLocationChange}
                  className="h-80 sm:h-96 rounded-lg border border-[#e2e8f0] overflow-hidden shadow-2xs"
                />
              </div>

              {/* Row 3: Geofence Radius Slider & Presets */}
              <div className="p-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#0f172a]">
                    Geofence Radius ({officeRadius} meters)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={MIN_GEOFENCE_LIMIT_METERS}
                      max={MAX_GEOFENCE_LIMIT_METERS}
                      value={officeRadius}
                      onChange={(e) => handleRadiusChange(Number(e.target.value))}
                      className="w-14 h-7 text-right font-mono text-xs font-bold border border-[#e2e8f0] rounded-md px-1.5 bg-white text-[#2563eb] outline-none focus:border-[#2563eb]"
                    />
                    <span className="text-xs font-medium text-[#64748b]">m</span>
                  </div>
                </div>

                <input
                  type="range"
                  min={25}
                  max={MAX_GEOFENCE_LIMIT_METERS}
                  step={25}
                  value={officeRadius}
                  onChange={(e) => handleRadiusChange(Number(e.target.value))}
                  className="w-full accent-[#2563eb] cursor-pointer"
                />

                <div className="flex gap-1.5">
                  {[50, 100, 150, 250, 500, 1000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleRadiusChange(preset)}
                      className={`flex-1 py-0.5 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${officeRadius === preset
                          ? 'border-[#2563eb] bg-[#2563eb] text-white shadow-2xs'
                          : 'border-[#e2e8f0] bg-white text-[#0f172a] hover:border-slate-300'
                        }`}
                    >
                      {preset === 1000 ? '1km' : `${preset}m`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 4: Status & Allowed Devices */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={officeStatus}
                  onChange={(e) => setOfficeStatus(e.target.value as any)}
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium cursor-pointer"
                >
                  <option value="Active">Geofence Status: Active (Strict GPS Required)</option>
                  <option value="Inactive">Geofence Status: Inactive (GPS Optional)</option>
                </select>

                <select
                  value={officeDevices}
                  onChange={(e) => setOfficeDevices(e.target.value)}
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium cursor-pointer"
                >
                  <option value="Desktop, Mobile">Allowed Devices: Desktop & Mobile</option>
                  <option value="Mobile Only">Allowed Devices: Mobile Only</option>
                  <option value="Biometric Kiosk Only">Allowed Devices: Biometric Kiosk Only</option>
                </select>
              </div>

              {officeError && (
                <p className="text-xs font-semibold text-rose-600">{officeError}</p>
              )}

              {/* Form Action: Explicit Add/Update Button */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="submit"
                  className="h-9.5 px-4 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  {editingOfficeId ? 'Save & Update Office Location' : 'Add Office Location'}
                </button>
                {editingOfficeId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="h-9.5 px-3.5 rounded-lg border border-[#e2e8f0] bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-all cursor-pointer"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>

            {/* Configured Offices List - Matching Settings Layout (compacted) */}
            <div className="space-y-3 pt-3 border-t border-[#e2e8f0]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Configured Office Locations ({offices.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Physical branch locations and geofences configured for your workspace
                  </p>
                </div>
              </div>

              {offices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 flex flex-col items-center justify-center text-center space-y-2">
                  <h4 className="text-xs font-semibold text-slate-900">No Locations Configured</h4>
                  <p className="text-[11px] text-slate-500 max-w-sm">
                    Add your physical campus or office locations and geofences above to enable location-restricted check-ins.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById('office-name-input');
                      if (el) el.focus();
                      setOfficeError('Please type your Office / Branch name above');
                    }}
                    className="mt-1 h-8.5 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    Enter Office Details Above
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {offices.map((off) => (
                    <div
                      key={off.id}
                      className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 space-y-3 transition-all hover:border-slate-300 shadow-2xs"
                    >
                      {/* Office Title + Action Buttons */}
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                        <h4 className="text-sm font-bold text-slate-900 tracking-tight">
                          {off.name}
                        </h4>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleEditOffice(off)}
                            className="text-slate-500 hover:text-slate-900 font-semibold text-[11px] cursor-pointer px-2 py-0.5 transition-colors"
                            title="Edit Location"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveOffice(off.id)}
                            className="text-rose-500 hover:text-rose-700 font-semibold text-[11px] cursor-pointer px-2 py-0.5 transition-colors"
                            title="Remove Location"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {/* Details Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-y-2 text-xs">
                        <div className="md:col-span-4 text-slate-500 font-medium">Status</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full inline-block ${off.geofencingStatus === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                          />
                          <span>{off.geofencingStatus}</span>
                        </div>

                        <div className="md:col-span-4 text-slate-500 font-medium">Address</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold">{off.address}</div>

                        <div className="md:col-span-4 text-slate-500 font-medium">Radius</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold font-mono">{off.radiusMeters}m</div>

                        <div className="md:col-span-4 text-slate-500 font-medium">Policy</div>
                        <div className="md:col-span-8 text-slate-900 font-semibold">
                          {off.policyDescription || 'Strict clock-in within geofence perimeter'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 1 Actions */}
            <div className="pt-3 flex items-center justify-between border-t border-[#e2e8f0]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!officeName.trim()) {
                      const el = document.getElementById('office-name-input');
                      if (el) el.focus();
                      setOfficeError('Please type your Office / Branch name above');
                    } else {
                      handleCommitCurrentOffice();
                    }
                  }}
                  className="h-9.5 px-4 rounded-lg border border-[#e2e8f0] bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 transition-all cursor-pointer shadow-2xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  Add Office Location
                </button>
              </div>

              <button
                type="button"
                onClick={handleProceedToStep2}
                className="h-9.5 px-5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                Next: Departments <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* STEP 2: ADD DEPARTMENTS */}
        {/* ==================================================== */}
        {currentStep === 2 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 sm:p-6 shadow-2xs space-y-4 animate-in fade-in duration-200">
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold text-[#0f172a]">Add Departments</h2>
              <p className="text-[11px] text-[#64748b]">
                Structure your company teams and functional departments.
              </p>
              {offices.length > 0 && (
                <p className="text-[11px] text-[#475569] pt-1">
                  Offices ready:{' '}
                  {offices.map((o) => (
                    <span key={o.id} className="font-semibold text-[#0f172a]">
                      {o.name}
                      {offices[offices.length - 1]?.id !== o.id ? ', ' : ''}
                    </span>
                  ))}
                </p>
              )}
            </div>

            {/* Department Input */}
            <form onSubmit={handleAddDepartment} className="flex gap-2">
              <input
                type="text"
                value={departmentInput}
                onChange={(e) => setDepartmentInput(e.target.value)}
                placeholder="Department Name (e.g. Engineering)"
                className="flex-1 h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] placeholder:text-[#64748b] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium"
              />
              <button
                type="submit"
                disabled={!departmentInput.trim()}
                className="h-9.5 px-4 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add Department
              </button>
            </form>

            {/* Quick Presets */}
            <div className="space-y-1.5 pt-1 border-t border-[#e2e8f0]">
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COMMON_DEPARTMENTS.map((dept) => {
                  const isAdded = departments.some((d) => d.toLowerCase() === dept.toLowerCase());
                  return (
                    <button
                      key={dept}
                      type="button"
                      disabled={isAdded}
                      onClick={() => handleQuickAddDepartment(dept)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 ${isAdded
                          ? 'border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8] cursor-not-allowed'
                          : 'border-[#e2e8f0] bg-white text-[#0f172a] hover:border-[#2563eb] hover:text-[#2563eb]'
                        }`}
                    >
                      {isAdded ? <Check className="w-3 h-3 text-emerald-600" /> : <Plus className="w-3 h-3" />}
                      {dept}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List of Configured Departments */}
            <div className="space-y-2.5 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {departments.map((dept) => (
                  <div
                    key={dept}
                    className="p-2.5 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] hover:border-slate-300 transition-all flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-blue-50 text-[#2563eb] flex items-center justify-center font-bold text-xs shrink-0">
                        {dept.charAt(0)}
                      </div>
                      <span className="font-semibold text-xs text-[#0f172a] truncate">{dept}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDepartment(dept)}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                      title="Remove department"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2 Actions */}
            <div className="pt-3 flex items-center justify-between border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="h-9.5 px-4 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-xs font-semibold text-[#0f172a] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="button"
                disabled={departments.length === 0}
                onClick={handleProceedToStep3}
                className="h-9.5 px-5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Next: Job Roles <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* STEP 3: ADD JOB ROLES */}
        {/* ==================================================== */}
        {currentStep === 3 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 sm:p-6 shadow-2xs space-y-5 animate-in fade-in duration-200">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-[#0f172a] tracking-tight">
                {editingJobId ? 'Edit Job Role' : 'Create New Job Role'}
              </h2>
              <p className="text-xs text-[#64748b]">
                Configure designation, department, permission scope, and compensation band.
              </p>
              {departments.length > 0 && (
                <p className="text-[11px] text-[#475569]">
                  Departments ready:{' '}
                  {departments.map((dept, idx) => (
                    <span key={dept} className="font-semibold text-[#0f172a]">
                      {dept}{idx < departments.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              )}
            </div>

            {/* Form matching user screenshot exactly */}
            <form onSubmit={(e) => { e.preventDefault(); handleCommitCurrentJob(); }} className="space-y-4 pt-2 border-t border-[#e2e8f0]">
              {/* Job Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Job Title / Designation <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={jobTitleInput}
                  onChange={(e) => {
                    setJobTitleInput(e.target.value);
                    if (jobError) setJobError('');
                  }}
                  placeholder="e.g. Senior Frontend Engineer, QA Lead, Sales Director"
                  className="w-full h-10 rounded-lg border border-[#e2e8f0] bg-white px-3.5 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 font-medium transition-all placeholder:text-slate-400"
                />
              </div>

              {/* Department & Permission Level */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    Department
                  </label>
                  <select
                    value={jobDeptInput || (departments[0] || 'General')}
                    onChange={(e) => setJobDeptInput(e.target.value)}
                    className="w-full h-10 rounded-lg border border-[#e2e8f0] bg-white px-3.5 text-xs font-semibold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 cursor-pointer"
                  >
                    {departments.length === 0 && <option value="General">General</option>}
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800">
                    Permission Level <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={jobPermissionInput}
                    onChange={(e) => setJobPermissionInput(e.target.value as any)}
                    className="w-full h-10 rounded-lg border border-[#e2e8f0] bg-white px-3.5 text-xs font-semibold text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 cursor-pointer"
                  >
                    <option value="Employee">Employee (Standard Access)</option>
                    <option value="Manager">Manager (Approver & Lead)</option>
                    <option value="HR">HR (Operations & Records)</option>
                    <option value="Admin">Admin (Full System Access)</option>
                  </select>
                </div>
              </div>

              {/* Role Scope & Responsibilities */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800">
                  Role Scope & Responsibilities
                </label>
                <textarea
                  rows={3}
                  value={jobDescriptionInput}
                  onChange={(e) => setJobDescriptionInput(e.target.value)}
                  placeholder="Outline the core responsibilities, deliverables, and expectations for this job title..."
                  className="w-full rounded-lg border border-[#e2e8f0] bg-white px-3.5 py-2.5 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 font-medium resize-none placeholder:text-slate-400"
                />
              </div>

              {/* Role Capabilities & Approvals */}
              <div className="pt-3 border-t border-[#e2e8f0] space-y-2.5">
                <h4 className="text-xs font-bold text-[#0f172a] uppercase tracking-wider">
                  Role Capabilities & Approvals
                </h4>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
                  <div>
                    <span className="text-xs font-bold text-[#0f172a] block">
                      Can Approve Team Timesheets
                    </span>
                    <span className="text-[10.5px] text-[#64748b]">Direct reports submit timesheets to this role for sign-off.</span>
                  </div>
                  <ToggleSwitch checked={jobCanApproveTimesheets} onChange={setJobCanApproveTimesheets} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
                  <div>
                    <span className="text-xs font-bold text-[#0f172a] block">
                      Can Assign and Delegate Project Tasks
                    </span>
                    <span className="text-[10.5px] text-[#64748b]">Allows task creation and allocation in project Kanban boards.</span>
                  </div>
                  <ToggleSwitch checked={jobCanAssignTasks} onChange={setJobCanAssignTasks} />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-[#e2e8f0] bg-[#f8fafc]">
                  <div>
                    <span className="text-xs font-bold text-[#0f172a] block">
                      Can Regularize Attendance & Review Leaves
                    </span>
                    <span className="text-[10.5px] text-[#64748b]">Grants authorization for leave and biometric attendance overrides.</span>
                  </div>
                  <ToggleSwitch checked={jobCanApproveLeaves} onChange={setJobCanApproveLeaves} />
                </div>
              </div>

              {jobError && (
                <p className="text-xs font-semibold text-rose-600">{jobError}</p>
              )}

              {/* Action Buttons inside Form */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                {(editingJobId || jobTitleInput) && (
                  <button
                    type="button"
                    onClick={handleCancelJobEdit}
                    className="px-4 py-2 rounded-lg border border-[#e2e8f0] text-xs font-bold text-slate-700 hover:bg-[#f8fafc] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-xs transition-colors cursor-pointer shadow-xs"
                >
                  {editingJobId ? 'Save Changes' : 'Save Job Role'}
                </button>
              </div>
            </form>

            {/* Configured Job Roles List */}
            <div className="space-y-3 pt-3 border-t border-[#e2e8f0]">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Configured Job Roles ({jobRoles.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Job titles, permission scopes, and capabilities configured for your workspace
                  </p>
                </div>
              </div>

              {jobRoles.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-6 flex flex-col items-center justify-center text-center space-y-1">
                  <h4 className="text-xs font-semibold text-slate-900">No Job Roles Configured</h4>
                  <p className="text-[11px] text-slate-500 max-w-sm">
                    Add job positions and roles above to assign to incoming team members.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {jobRoles.map((job) => {
                    const activeCaps: string[] = [];
                    if (job.canApproveTimesheets) activeCaps.push('Timesheet Approvals');
                    if (job.canAssignTasks) activeCaps.push('Task Delegation');
                    if (job.canApproveLeaves) activeCaps.push('Leave Regularization');

                    return (
                      <div
                        key={job.id}
                        className="p-3 sm:p-3.5 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-all flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">
                              {job.title}
                            </h4>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">
                              {job.department}
                            </span>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {job.permissionLevel}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium flex-wrap">
                            {job.description && (
                              <span className="text-slate-600 truncate max-w-md">{job.description}</span>
                            )}
                            {job.description && activeCaps.length > 0 && (
                              <span className="text-slate-300">•</span>
                            )}
                            {activeCaps.length > 0 && (
                              <span className="text-slate-400">
                                Scope: <span className="text-slate-700 font-semibold">{activeCaps.join(', ')}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditJob(job)}
                            className="text-slate-500 hover:text-slate-900 font-semibold text-xs cursor-pointer px-2.5 py-1 rounded-md hover:bg-slate-50 transition-colors"
                            title="Edit Role"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveJob(job.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete Role"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 3 Wizard Navigation */}
            <div className="pt-3 flex items-center justify-between border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="h-9.5 px-4 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-xs font-semibold text-[#0f172a] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back: Departments
              </button>

              <button
                type="button"
                disabled={jobRoles.length === 0 && !jobTitleInput.trim()}
                onClick={handleProceedToStep4}
                className="h-9.5 px-5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Next: Team Members <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* STEP 4: ADD EMPLOYEES */}
        {/* ==================================================== */}
        {currentStep === 4 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 sm:p-6 shadow-2xs space-y-4 animate-in fade-in duration-200">
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold text-[#0f172a]">Add Team Members</h2>
              <p className="text-[11px] text-[#64748b]">
                Add employees and assign initial roles, designations, and branch campuses.
              </p>
              {jobRoles.length > 0 && (
                <p className="text-[11px] text-[#475569] pt-1">
                  Roles ready:{' '}
                  {jobRoles.map((role, idx) => (
                    <span key={role.id} className="font-semibold text-[#0f172a]">
                      {role.title}{idx < jobRoles.length - 1 ? ', ' : ''}
                    </span>
                  ))}
                </p>
              )}
            </div>

            {/* Employee Form with same setup info as AddEmployeeModal */}
            <form onSubmit={handleAddEmployee} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="Full Name *"
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] placeholder:text-[#64748b] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                />
                <input
                  type="email"
                  value={empEmail}
                  onChange={(e) => setEmpEmail(e.target.value)}
                  placeholder="Official Email *"
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] placeholder:text-[#64748b] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="tel"
                  maxLength={10}
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Phone Number (10 digits)"
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] placeholder:text-[#64748b] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                />
                <select
                  value={empDesignation || (jobRoles[0]?.title || '')}
                  onChange={(e) => {
                    const selectedTitle = e.target.value;
                    setEmpDesignation(selectedTitle);
                    const matchedRole = jobRoles.find((j) => j.title === selectedTitle);
                    if (matchedRole && matchedRole.department) {
                      setEmpDepartment(matchedRole.department);
                    }
                  }}
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium cursor-pointer"
                >
                  {jobRoles.length === 0 && (
                    <option value="">Job Role: None configured</option>
                  )}
                  {jobRoles.map((jr) => (
                    <option key={jr.id} value={jr.title}>
                      Job Role: {jr.title} ({jr.department})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={empDepartment || departments[0] || ''}
                  onChange={(e) => setEmpDepartment(e.target.value)}
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium cursor-pointer"
                >
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      Department: {dept}
                    </option>
                  ))}
                </select>

                <select
                  value={empOffice || offices[0]?.name || ''}
                  onChange={(e) => setEmpOffice(e.target.value)}
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium cursor-pointer"
                >
                  {offices.map((office) => (
                    <option key={office.id} value={office.name}>
                      Office: {office.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="date"
                  value={empJoiningDate}
                  onChange={(e) => setEmpJoiningDate(e.target.value)}
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium"
                />

                <select
                  value={empEmploymentType}
                  onChange={(e) => setEmpEmploymentType(e.target.value as any)}
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium cursor-pointer"
                >
                  <option value="Full-time">Full-time</option>
                  <option value="Part-time">Part-time</option>
                  <option value="Contract">Contract</option>
                  <option value="Intern">Intern</option>
                </select>

                <select
                  value={empShift}
                  onChange={(e) => setEmpShift(e.target.value)}
                  className="h-9.5 rounded-lg border border-[#e2e8f0] bg-white px-3 text-xs text-[#0f172a] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-blue-100 transition-all font-medium cursor-pointer"
                >
                  <option value="General Day Shift (09:00 - 18:00)">General Day Shift</option>
                  <option value="Flexible / Hourly Shift">Flexible Shift</option>
                </select>
              </div>

              {employeeError && (
                <p className="text-xs text-rose-600 font-semibold">{employeeError}</p>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="h-9 px-4.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Team Member
                </button>
              </div>
            </form>

            {/* Table of Added Employees */}
            <div className="space-y-2.5 pt-2 border-t border-[#e2e8f0]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0f172a]">
                  Configured Members ({employees.length})
                </span>
              </div>

              {employees.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#64748b] border border-dashed border-[#e2e8f0] rounded-lg bg-[#f8fafc]">
                  No employees added yet. Use the form above to add members.
                </div>
              ) : (
                <div className="overflow-x-auto border border-[#e2e8f0] rounded-lg shadow-2xs">
                  <table className="w-full text-left text-xs text-[#0f172a]">
                    <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b] font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Member</th>
                        <th className="py-2.5 px-3">Designation</th>
                        <th className="py-2.5 px-3">Department</th>
                        <th className="py-2.5 px-3">Office</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0] bg-white">
                      {employees.map((emp) => {
                        const isYou = isOwnSetupAccount(emp);
                        return (
                        <tr key={emp.id} className="hover:bg-[#f8fafc] transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-blue-100 text-[#2563eb] font-bold flex items-center justify-center text-[11px] shrink-0">
                                {emp.name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <span className="font-semibold text-xs text-[#0f172a] block truncate">
                                  {emp.name}
                                  {isYou ? (
                                    <span className="ml-1.5 text-[10px] font-bold text-[#2563eb]">(You)</span>
                                  ) : null}
                                </span>
                                <span className="text-[10px] text-[#64748b] block truncate">{emp.email}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{emp.designation}</td>
                          <td className="py-2.5 px-3">{emp.department || '—'}</td>
                          <td className="py-2.5 px-3">{emp.officeName || '—'}</td>
                          <td className="py-2.5 px-3 text-[#64748b]">{emp.employmentType}</td>
                          <td className="py-2.5 px-3 text-right">
                            {isYou ? (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 px-1"
                                title="Your account cannot be removed"
                              >
                                <Shield className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRemoveEmployee(emp.id)}
                                className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                                title="Remove member"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Step 4 Actions */}
            <div className="pt-3 flex items-center justify-between border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="h-9.5 px-4 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-xs font-semibold text-[#0f172a] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="button"
                disabled={employees.length === 0}
                onClick={handleProceedToStep5}
                className="h-9.5 px-5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                Next: Finalize Departments <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ==================================================== */}
        {/* STEP 5: FINALIZE DEPARTMENTS & TEAM LEADS */}
        {/* ==================================================== */}
        {currentStep === 5 && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-5 sm:p-6 shadow-2xs space-y-4 animate-in fade-in duration-200">
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold text-[#0f172a]">Finalize Departments & Managers</h2>
              <p className="text-[11px] text-[#64748b]">
                Assign members to their departments and designate a Manager for each department team.
              </p>
            </div>

            <div className="space-y-4">
              {departments.map((dept) => {
                const currentAssign = assignments[dept] || {
                  department: dept,
                  teamLeadId: '',
                  memberIds: [],
                };
                const availableEmployees = employees;

                return (
                  <div
                    key={dept}
                    className="rounded-lg border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5 shadow-2xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">{dept}</h3>
                        <p className="text-[11px] text-slate-500">
                          {currentAssign.memberIds.length} member{currentAssign.memberIds.length !== 1 ? 's' : ''} assigned
                        </p>
                      </div>

                      {/* Department Manager Selector */}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-700 shrink-0">
                          Manager:
                        </span>
                        <select
                          value={currentAssign.teamLeadId}
                          onChange={(e) => handleSetTeamLead(dept, e.target.value)}
                          className="h-8.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-blue-600 font-medium cursor-pointer min-w-[160px] max-w-[220px]"
                        >
                          <option value="">No Manager Selected</option>
                          {availableEmployees.map((emp) => (
                            <option key={emp.id} value={emp.id}>
                              {emp.name} ({emp.designation})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Member Assignment Grid */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-600">
                        Assign Members to {dept}:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-0.5">
                        {availableEmployees.map((emp) => {
                          const isAssigned = currentAssign.memberIds.includes(emp.id);
                          const isLead = currentAssign.teamLeadId === emp.id;

                          return (
                            <div
                              key={emp.id}
                              onClick={() => handleToggleMember(dept, emp.id)}
                              className={`p-2.5 rounded-lg border text-xs transition-all cursor-pointer flex items-center justify-between gap-2 select-none ${isAssigned
                                  ? 'border-slate-300 bg-slate-50/70 shadow-2xs'
                                  : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div
                                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${isAssigned
                                      ? 'border-blue-600 bg-blue-600 text-white'
                                      : 'border-slate-300 bg-white'
                                    }`}
                                >
                                  {isAssigned && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <div className="min-w-0">
                                  <span className="font-semibold text-xs text-slate-900 block truncate">
                                    {emp.name}
                                  </span>
                                  <span className="text-[10px] text-slate-500 block truncate">
                                    {emp.designation}
                                  </span>
                                </div>
                              </div>

                              {isLead && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100 shrink-0 flex items-center gap-1">
                                  <Shield className="w-2.5 h-2.5" /> Manager
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Step 5 Actions */}
            <div className="pt-3 flex items-center justify-between border-t border-[#e2e8f0]">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="h-9.5 px-4 rounded-lg border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] text-xs font-semibold text-[#0f172a] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={handleFinishSetup}
                className="h-9.5 px-6 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5"
              >
                Finish Setup & Launch Workspace <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
