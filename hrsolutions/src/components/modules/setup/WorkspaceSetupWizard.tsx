'use client';
import { DateInput } from '@/components/common/DateInput';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileSpreadsheet, Plus, Trash2, Upload, X, Check,
} from 'lucide-react';
import { PixbeDesignWordmark } from '@/components/common/PixbeBrand';
import { SetupWorkplaceStep } from './SetupWorkplaceStep';
import {
  DEFAULT_EMPLOYMENT_TYPES,
  DEFAULT_SHIFT,
  SetupWorkPatternsStep,
  shiftSummary,
  type EmploymentTypeCategory,
} from './SetupWorkPatternsStep';
import './workspace-setup.css';
import './onboarding-studio.css';
import './figma-onboarding.css';
import { OnboardingAccount, OnboardingContextBar, OnboardingPageFooter } from './OnboardingChrome';
import { DEFAULT_OFFICE_RADIUS_METERS, MAX_GEOFENCE_LIMIT_METERS, MIN_GEOFENCE_LIMIT_METERS } from '@/config/constants';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';
import { toApiAuthRoleFromJobLevel } from '@/utils/roleMapping';
import type { WorkShift } from '@/types';

type Step = 1 | 2 | 3 | 4 | 5;
type Mode = 'remote' | 'onsite' | 'hybrid';
type Office = { id?: string; name: string; address: string; latitude: number; longitude: number; radius: number; timezone: string; saved: boolean };
type Department = { id?: string; name: string; saved: boolean };
type JobLevel = 'Employee' | 'Manager' | 'HR' | 'Admin';
type JobRole = { id?: string; title: string; department: string; level: JobLevel; saved: boolean };
const JOB_LEVELS: Array<{ value: JobLevel; label: string; hint: string }> = [
  { value: 'Employee', label: 'Employee', hint: 'Standard access' },
  { value: 'Manager', label: 'Manager', hint: 'Approver & lead' },
  { value: 'HR', label: 'HR', hint: 'Operations & records' },
  { value: 'Admin', label: 'Admin', hint: 'Full system access' },
];
type Person = { id: string; firstName: string; lastName: string; email: string; phone: string; department: string; role: string; office: string; managerEmail: string; employmentType: string; shiftId: string; startDate: string; saved?: boolean };

const suggestions = ['Management', 'Engineering', 'People', 'Sales'];
const isExecutiveTitle = (title: string) => /ceo|founder|executive owner|\bowner\b|principal|dean/i.test(title);
const setupJobLevel = (level?: string): JobLevel => {
  const value = clean(level).toLowerCase();
  if (value === 'admin') return 'Admin';
  if (value === 'hr') return 'HR';
  if (value === 'manager') return 'Manager';
  return 'Employee';
};
const leadershipDepartment = (industry?: string) => /institut|educat|school|college/i.test(String(industry || '')) ? 'Administration' : 'Management';
const roleMatchKey = (title: unknown, department: unknown) => `${key(title)}::${key(department)}`;
const withDefaultStructure = (departments: Department[], roles: JobRole[], industry?: string, ownerTitle?: string, allowSeed = true) => {
  const deptName = leadershipDepartment(industry);
  const orphanExecutive = roles.some((role) => isExecutiveTitle(role.title) && !role.department);
  const shouldSeed = allowSeed && (!departments.length || orphanExecutive);
  const nextDepartments = !shouldSeed || departments.some((item) => key(item.name) === key(deptName))
    ? departments
    : [{ name: deptName, saved: false }, ...departments];
  let nextRoles = roles.map((role) => {
    const executive = isExecutiveTitle(role.title);
    return { ...role, department: role.department || (executive ? deptName : role.department), level: setupJobLevel(role.level) };
  });
  const title = ownerTitle && validLabel(ownerTitle) ? ownerTitle : (deptName === 'Administration' ? 'Principal / Dean' : 'CEO / Executive Owner');
  if (shouldSeed && !nextRoles.some((role) => isExecutiveTitle(role.title))) {
    nextRoles = [{ title, department: deptName, level: 'Admin', saved: false }, ...nextRoles];
  }
  return { departments: nextDepartments, roles: nextRoles };
};
const primaryShift = (list: WorkShift[]) => list.find((item) => !item.isHourlyShift && clean(item.name)) || list[0];
const attendancePayloadFromShifts = (list: WorkShift[], extra: Record<string, unknown> = {}) => {
  const primary = primaryShift(list);
  const start = clean(primary?.startTime) || '09:00 AM';
  const end = clean(primary?.endTime) || '06:00 PM';
  const grace = Number(primary?.gracePeriodMinutes) || 15;
  return {
    shifts: list,
    attendancePolicies: {
      workDayStartTime: start,
      workDayEndTime: end,
      lateThresholdMinutes: grace,
    },
    attendanceSettings: {
      workDayStartTime: start,
      workDayEndTime: end,
      gracePeriodMinutes: grace,
    },
    ...extra,
  };
};
const steps = [
  ['Workplace', 'Where your team works'],
  ['Structure', 'Departments and job roles'],
  ['Hours', 'Types, shifts, and days'],
  ['People', 'Your first invitations'],
  ['Review', 'Launch your workspace'],
] as const;
const clean = (value: unknown) => String(value || '').trim();
const key = (value: unknown) => clean(value).toLowerCase();
const validLabel = (value: string) => value.length >= 2 && value.length <= 80 && /\p{L}/u.test(value);
const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validTimezone = (value: string) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
};
const isPlaceholderOffice = (item: { name: string; address?: string }) =>
  /^(bengaluru|bangalore)\s+hq$/i.test(clean(item.name)) && (!clean(item.address) || key(item.address) === key(item.name));
const today = () => new Date().toISOString().slice(0, 10);
const codeFor = (prefix: string, value: string, index: number) => `${prefix}-${value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || prefix}-${index + 1}`.slice(0, 32);
const toStep = (status: unknown): Step => {
  switch (clean(status).toUpperCase()) {
    case 'OFFICE_SETUP': case 'DEPARTMENTS_SETUP': return 2;
    case 'ROLES_SETUP': return 3;
    case 'WORK_PATTERNS_SETUP': return 4;
    case 'TEAM_SETUP': return 5;
    default: return 1;
  }
};
const setCookie = (value: string) => { document.cookie = `BOS_ONBOARDING_STATUS=${encodeURIComponent(value)}; path=/; max-age=86400; SameSite=Lax`; };
const draftPeopleKey = () => {
  const tenant = api.getTenantId();
  return tenant ? `PIXBE_SETUP_PEOPLE_${tenant}` : null;
};

function parseCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') { cell += char; i += 1; } else quoted = !quoted; }
    else if (char === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && source[i + 1] === '\n') i += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [] as Record<string, string>[];
  const headers = rows[0].map((item) => key(item).replace(/\s+/g, '_'));
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, clean(values[index])])));
}

function downloadTemplate() {
  const content = 'first_name,last_name,email,department,job_title,permission_level,employment_type,office,manager_email,start_date\nAsha,Patel,asha@company.com,Engineering,Software Engineer,Employee,Full-time,London HQ,manager@company.com;colead@company.com,2026-10-07';
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'pixbe-employee-import.csv'; link.click(); URL.revokeObjectURL(url);
}

export const WorkspaceSetupWizard: React.FC = () => {
  const router = useRouter();
  const { state, updateState, triggerToast, syncWithBackend, backendStatus } = useApp();
  const loaded = useRef(false);
  const statusSynced = useRef(false);
  const structureTouched = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>('remote');
  const [offices, setOffices] = useState<Office[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [officeForm, setOfficeForm] = useState<{ name: string; address: string; latitude: number | null; longitude: number | null; radius: number; timezone: string }>({ name: '', address: '', latitude: null, longitude: null, radius: DEFAULT_OFFICE_RADIUS_METERS, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
  const [departmentInput, setDepartmentInput] = useState('');
  const [roleForm, setRoleForm] = useState({ title: '', department: '', level: 'Employee' as JobLevel });
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentTypeCategory[]>(DEFAULT_EMPLOYMENT_TYPES);
  const [shifts, setShifts] = useState<WorkShift[]>([DEFAULT_SHIFT]);
  const [personForm, setPersonForm] = useState({ firstName: '', lastName: '', email: '', phone: '', department: '', role: '', office: '', managerEmail: '', employmentType: 'Full-time', shiftId: DEFAULT_SHIFT.id, startDate: today() });
  const employmentTypeOptions = employmentTypes.map((item) => item.name);

  const ownerEmail = key(state.currentPersona?.email);
  const ownerName = clean(state.currentPersona?.name) || 'Workspace owner';
  const departmentNames = useMemo(() => departments.map((item) => item.name), [departments]);
  const roleNames = useMemo(() => roles.map((item) => item.title), [roles]);
  const personRoleNames = useMemo(() => roles.filter((item) => key(item.department) === key(personForm.department || departmentNames[0])).map((item) => item.title), [roles, personForm.department, departmentNames]);
  const officeNames = useMemo(() => offices.map((item) => item.name), [offices]);
  const timezones = useMemo(() => {
    const current = officeForm.timezone;
    return [...new Set([current, 'UTC', ...Intl.supportedValuesOf('timeZone')])].sort();
  }, [officeForm.timezone]);
  const leadOptions = useMemo(() => [{ value: ownerEmail, label: `${ownerName} (workspace owner)` }, ...people.map((person) => ({ value: person.email, label: `${person.firstName} ${person.lastName} · ${person.role}` }))].filter((item) => item.value), [ownerEmail, ownerName, people]);

  const notify = useCallback((kind: 'error' | 'success', text: string) => {
    setMessage({ kind, text });
    triggerToast({ title: kind === 'error' ? 'Setup needs attention' : 'Saved', message: text, type: kind });
  }, [triggerToast]);
  const updateStatus = useCallback((status: string) => { setCookie(status); updateState((previous) => ({ ...previous, onboardingStatus: status } as any)); }, [updateState]);

  const hydrate = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setDataLoaded(false);
    const settingsRes = await api.setup.getSettings();
    const [officeRes, departmentRes, roleRes, employeeRes] = await Promise.all([api.org.getOffices(), api.org.getDepartments(), api.org.getJobRoles(), api.identity.getEmployees()]);
    if (officeRes.success) {
      const items = ((officeRes.data as any[]) || []).map((item) => ({ id: item.id, name: clean(item.name), address: clean(item.address), latitude: Number(item.latitude), longitude: Number(item.longitude), radius: Number(item.geofence_radius_meters) || DEFAULT_OFFICE_RADIUS_METERS, timezone: clean(item.timezone) || 'UTC', saved: true }));
      const placeholders = items.filter(isPlaceholderOffice);
      const kept = items.filter((item) => !isPlaceholderOffice(item));
      setOffices(kept);
      await Promise.all(placeholders.map((office) => office.id ? api.org.deleteOffice(office.id).catch(() => undefined) : Promise.resolve()));
    }
    const storedTypes = (settingsRes.data as any)?.['employment-types']?.employmentTypes;
    if (Array.isArray(storedTypes) && storedTypes.length) {
      setEmploymentTypes(storedTypes.map((item: any, index: number) => (
        typeof item === 'string'
          ? { id: `et_${index + 1}`, name: clean(item), hasBenefits: /full|part/i.test(item), isPermanent: /full/i.test(item) }
          : { id: clean(item.id) || `et_${index + 1}`, name: clean(item.name), hasBenefits: Boolean(item.hasBenefits), isPermanent: Boolean(item.isPermanent) }
      )).filter((item: EmploymentTypeCategory) => item.name));
    }
    const storedShifts = (settingsRes.data as any)?.attendance?.shifts;
    if (Array.isArray(storedShifts) && storedShifts.length) {
      setShifts(storedShifts.filter((item: WorkShift) => clean(item?.name)));
    }
    const storedMode = (settingsRes.data as any)?.general?.workplaceMode;
    if (['remote', 'onsite', 'hybrid'].includes(storedMode)) setMode(storedMode);
    else if (officeRes.success && ((officeRes.data as any[]) || []).filter((item) => !isPlaceholderOffice({ name: clean(item.name), address: clean(item.address) })).length) setMode('onsite');
    const loadedDepartments = departmentRes.success
      ? ((departmentRes.data as any[]) || []).map((item) => ({ id: item.id, name: clean(item.name), saved: true })).filter((item, index, list) => item.name && list.findIndex((candidate) => key(candidate.name) === key(item.name)) === index)
      : [];
    const loadedRoles = roleRes.success
      ? ((roleRes.data as any[]) || []).map((item) => ({ id: item.id, title: clean(item.title), department: clean(item.department_name), level: setupJobLevel(item.level), saved: true })).filter((item, index, list) => item.title && list.findIndex((candidate) => key(candidate.title) === key(item.title) && key(candidate.department) === key(item.department)) === index)
      : [];
    const seeded = withDefaultStructure(
      loadedDepartments,
      loadedRoles,
      (state.organization as any)?.industry,
      clean((state.currentPersona as any)?.designation),
      !structureTouched.current
    );
    setDepartments(seeded.departments);
    setRoles(seeded.roles);
    if (departmentRes.success && employeeRes.success) {
      const emailById = new Map(((employeeRes.data as any[]) || []).map((item) => [String(item.id), key(item.email)]));
      const saved = Object.fromEntries(((departmentRes.data as any[]) || []).map((item) => [clean(item.name), (Array.isArray(item.leads) ? item.leads : []).map((lead: any) => emailById.get(String(lead.id)) || '').filter(Boolean) as string[]]).filter(([, emails]) => (emails as string[]).length));
      setLeads((previous) => ({ ...saved, ...Object.fromEntries(Object.entries(previous).filter(([, emails]) => emails.length)) }));
    }
    if (employeeRes.success) {
      const savedPeople: Person[] = ((employeeRes.data as any[]) || []).filter((item) => key(item.email) !== ownerEmail && key(item.role) !== 'super_admin').map((item) => ({ id: clean(item.id) || `saved-${item.email}`, firstName: clean(item.first_name || item.firstName), lastName: clean(item.last_name || item.lastName), email: key(item.email), phone: clean(item.phone), department: clean(item.department_name || item.department), role: clean(item.job_role_title || item.designation || item.jobRole), office: clean(item.office_name || item.officeName || item.location), managerEmail: '', employmentType: clean(item.employment_type || item.employmentType) || 'Full-time', shiftId: clean(item.shift_id || item.shiftId || item.shiftTiming?.shiftId), startDate: clean(item.date_of_joining || item.dateOfJoining) || today(), saved: true }));
      let drafts: Person[] = [];
      try {
        const stored = draftPeopleKey();
        const parsed = stored ? JSON.parse(sessionStorage.getItem(stored) || '[]') : [];
        if (Array.isArray(parsed)) drafts = parsed.filter((item) => validEmail(key(item?.email)) && clean(item?.firstName) && clean(item?.lastName) && !item.saved).map((item) => ({ ...item, shiftId: clean(item.shiftId) }));
      } catch { /* Ignore stale or invalid session drafts. */ }
      setPeople([...savedPeople, ...drafts.filter((item) => item.email !== ownerEmail && !savedPeople.some((saved) => saved.email === item.email))]);
    }
    setDataLoaded(true);
  }, [ownerEmail, state.currentPersona, state.organization]);
  useEffect(() => {
    if (!dataLoaded) return;
    const stored = draftPeopleKey();
    if (!stored) return;
    try { sessionStorage.setItem(stored, JSON.stringify(people.filter((item) => !item.saved))); }
    catch { /* Session storage can be disabled by the browser. */ }
  }, [dataLoaded, people]);

  useEffect(() => {
    if (!state.isAuthenticated || !api.getToken()) { router.replace('/login'); return; }
    if (loaded.current) return; loaded.current = true;
    void hydrate()
      .catch(() => notify('error', 'We could not load the latest workspace data. Refresh and try again.'))
      .finally(() => setDataLoaded(true));
  }, [hydrate, notify, router, state.isAuthenticated]);
  useEffect(() => {
    if (!loaded.current || backendStatus === 'syncing') return;
    const status = clean((state as any).onboardingStatus).toUpperCase();
    if (status === 'COMPLETED') { setCookie('COMPLETED'); router.replace('/dashboard'); return; }
    // Apply server step only once so Back/Continue are not yanked by sync.
    if (!statusSynced.current) {
      setStep(toStep(status));
      statusSynced.current = true;
    }
  }, [backendStatus, router, state.onboardingStatus]);

  const persistStructure = async () => {
    if (departments.some((department) => !validLabel(department.name.trim())) || new Set(departments.map((department) => key(department.name))).size !== departments.length) throw new Error('Use a unique department name of 2–80 characters.');
    if (roles.some((role) => !validLabel(role.title.trim()) || !departments.some((department) => key(department.name) === key(role.department)))) throw new Error('Use valid job titles and assign each to a department.');

    let departmentSnapshot = departments;
    const freshDepartments = departments.filter((item) => !item.saved);
    if (freshDepartments.length) {
      const result: any = await api.setup.saveDepartments({ departments: freshDepartments.map((item, index) => ({ name: item.name, code: codeFor('DEP', item.name, index) })) });
      if (!result.success) throw new Error(result.error?.message || 'Departments could not be saved.');
      departmentSnapshot = departments.map((item) => ({ ...item, ...(result.data || []).find((created: any) => key(created.name) === key(item.name)), saved: item.saved || Boolean((result.data || []).find((created: any) => key(created.name) === key(item.name))) }));
      setDepartments(departmentSnapshot); updateStatus('DEPARTMENTS_SETUP');
    }
    const ids = new Map(departmentSnapshot.map((item) => [key(item.name), item.id]));
    for (const role of roles.filter((item) => item.saved && item.id)) {
      const departmentId = ids.get(key(role.department));
      if (!departmentId) continue;
      const result: any = await api.org.updateJobRole(role.id, { departmentId, level: role.level });
      if (!result.success) throw new Error(result.error?.message || `${role.title} could not be updated.`);
    }
    const freshRoles = roles.filter((item) => !item.saved);
    if (freshRoles.length) {
      const result: any = await api.setup.saveRoles({ roles: freshRoles.map((item, index) => ({ title: item.title, code: codeFor('ROLE', `${item.department}-${item.title}`, index), departmentId: ids.get(key(item.department)), level: item.level })) });
      if (!result.success) throw new Error(result.error?.message || 'Job roles could not be saved.');
      const createdByKey = new Map(
        ((result.data || []) as any[]).map((created: any) => [
          roleMatchKey(created.title, created.department_name || departmentSnapshot.find((dept) => dept.id === created.department_id)?.name),
          created,
        ])
      );
      setRoles((previous) => previous.map((item) => {
        const created = createdByKey.get(roleMatchKey(item.title, item.department));
        return created ? { ...item, id: created.id || item.id, saved: true } : item;
      }));
      updateStatus('ROLES_SETUP');
    } else {
      // Advance server even when seed/defaults are already persisted.
      const result: any = await api.setup.saveRoles({ roles: [] });
      if (!result.success) throw new Error(result.error?.message || 'Organisation structure could not be confirmed.');
      updateStatus('ROLES_SETUP');
    }
  };

  const saveWorkplace = async () => {
    setMessage(null);
    if (mode !== 'remote' && !offices.length) { notify('error', 'Add a workplace with a selected map location to continue with on-site or hybrid work.'); return; }
    setBusy(true);
    try {
      for (const [index, office] of (mode === 'remote' ? [] : offices).entries()) {
        if (office.saved) continue;
        const result: any = await api.setup.saveOffice({ name: office.name, code: codeFor('OFF', office.name, index), address: office.address, latitude: office.latitude, longitude: office.longitude, geofenceRadiusMeters: office.radius, timezone: office.timezone });
        if (!result.success) throw new Error(result.error?.message || `${office.name} could not be saved.`);
      }
      const result: any = await api.setup.saveWorkplaceMode({ mode });
      if (!result.success) throw new Error(result.error?.message || 'Work arrangement could not be saved.');
      await hydrate({ silent: true }); updateStatus('OFFICE_SETUP'); setStep(2); notify('success', 'Work arrangement saved. Next, add departments and job roles.');
    } catch (cause: any) { notify('error', cause?.message || 'We could not save your workplaces.'); } finally { setBusy(false); }
  };
  const saveStructure = async () => {
    if (!departmentNames.length || !roleNames.length) { notify('error', 'Add at least one department and one job role before continuing.'); return; }
    setBusy(true); try { await persistStructure(); await hydrate({ silent: true }); setStep(3); notify('success', 'Departments and job roles are saved. Next, set employment types and shift hours.'); } catch (cause: any) { notify('error', cause?.message || 'We could not save the organisation structure.'); } finally { setBusy(false); }
  };
  const saveWorkPatterns = async () => {
    if (!employmentTypes.length) { notify('error', 'Add at least one employment type before continuing.'); return; }
    if (!shifts.length) { notify('error', 'Add at least one shift with working days before continuing.'); return; }
    if (shifts.some((shift) => !(shift.workingDays || []).length)) { notify('error', 'Each shift needs at least one working day.'); return; }
    setBusy(true);
    try {
      const shiftsResult: any = await api.setup.saveAttendanceSettings(attendancePayloadFromShifts(shifts));
      if (!shiftsResult.success) throw new Error(shiftsResult.error?.message || 'Shifts could not be saved.');
      const typesResult: any = await api.setup.saveEmploymentTypes({ employmentTypes });
      if (!typesResult.success) throw new Error(typesResult.error?.message || 'Employment types could not be saved.');
      await hydrate({ silent: true });
      updateStatus('WORK_PATTERNS_SETUP');
      const primary = primaryShift(shifts);
      const workStart = primary?.startTime || '09:00 AM';
      const workEnd = primary?.endTime || '06:00 PM';
      const grace = Number(primary?.gracePeriodMinutes) || 15;
      updateState((previous) => {
        const priorPolicies = previous.customOptions?.attendancePolicies;
        return {
          ...previous,
          customOptions: {
            ...previous.customOptions,
            employmentTypes: employmentTypes.map((item) => item.name),
            employmentTypeCategories: employmentTypes,
            shifts,
            attendancePolicies: {
              geofenceRadiusMeters: priorPolicies?.geofenceRadiusMeters ?? DEFAULT_OFFICE_RADIUS_METERS,
              autoApproveRegularizationDays: priorPolicies?.autoApproveRegularizationDays ?? 0,
              requireManagerSignoff: priorPolicies?.requireManagerSignoff ?? false,
              ...priorPolicies,
              workDayStartTime: workStart,
              workDayEndTime: workEnd,
              lateThresholdMinutes: grace,
            },
            attendanceSettings: {
              ...(previous.customOptions?.attendanceSettings as object | undefined),
              workDayStartTime: workStart,
              workDayEndTime: workEnd,
              gracePeriodMinutes: grace,
            } as any,
          },
        };
      });
      setPersonForm((previous) => ({
        ...previous,
        employmentType: employmentTypes.some((item) => item.name === previous.employmentType) ? previous.employmentType : employmentTypes[0].name,
        shiftId: shifts.some((item) => item.id === previous.shiftId) ? previous.shiftId : shifts[0].id,
      }));
      setStep(4);
      notify('success', 'Work patterns saved. Next, invite your first people.');
    } catch (cause: any) {
      notify('error', cause?.message || 'We could not save employment types and shifts.');
    } finally {
      setBusy(false);
    }
  };
  const addOffice = () => {
    const name = clean(officeForm.name), address = clean(officeForm.address);
    if (!validLabel(name) || address.length < 5 || officeForm.latitude === null || officeForm.longitude === null) { notify('error', 'Enter a workplace name of at least two letters, then confirm its address on the map.'); return; }
    if (!validTimezone(officeForm.timezone)) { notify('error', 'Choose a valid time zone for this workplace.'); return; }
    if (!Number.isInteger(officeForm.radius) || officeForm.radius < MIN_GEOFENCE_LIMIT_METERS || officeForm.radius > MAX_GEOFENCE_LIMIT_METERS) { notify('error', 'Choose a radius between 20 and 1000 metres.'); return; }
    if (offices.some((item) => key(item.name) === key(name))) { notify('error', 'That office is already in the setup list.'); return; }
    setOffices((previous) => [...previous, { ...officeForm, name, address, latitude: officeForm.latitude!, longitude: officeForm.longitude!, saved: false }]); setOfficeForm((previous) => ({ ...previous, name: '', address: '', latitude: null, longitude: null }));
  };
  const removeOffice = async (index: number) => {
    const office = offices[index];
    if (!office) return;
    if (office.saved && office.id) {
      const result: any = await api.org.deleteOffice(office.id);
      if (!result.success) { notify('error', result.error?.message || `${office.name} could not be removed.`); return; }
    }
    setOffices((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };
  const addDepartment = (candidate = departmentInput) => {
    const name = clean(candidate);
    if (!validLabel(name)) { notify('error', 'Use a department name of 2–80 characters containing a letter.'); return; }
    if (departments.some((item) => key(item.name) === key(name))) { notify('error', 'That department is already listed.'); return; }
    structureTouched.current = true;
    setDepartments((previous) => [...previous, { name, saved: false }]); setDepartmentInput('');
  };
  const removeDepartment = async (index: number) => {
    const department = departments[index];
    if (!department) return;
    structureTouched.current = true;
    if (department.saved && department.id) {
      const result: any = await api.org.deleteDepartment(department.id);
      if (!result.success) { notify('error', result.error?.message || `${department.name} could not be removed.`); return; }
    }
    setDepartments((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setRoles((previous) => previous.filter((role) => key(role.department) !== key(department.name)));
  };
  const addRole = () => {
    const title = clean(roleForm.title), department = clean(roleForm.department || departmentNames[0]);
    if (!validLabel(title) || !department) { notify('error', 'Choose a department and enter a job title of 2–80 characters.'); return; }
    if (roles.some((item) => key(item.title) === key(title) && key(item.department) === key(department))) { notify('error', 'That job role already exists for this department.'); return; }
    structureTouched.current = true;
    setRoles((previous) => [...previous, { title, department, level: roleForm.level, saved: false }]); setRoleForm({ title: '', department, level: 'Employee' });
  };
  const removeRole = async (index: number) => {
    const role = roles[index];
    if (!role) return;
    structureTouched.current = true;
    if (role.saved && role.id) {
      const result: any = await api.org.deleteJobRole(role.id);
      if (!result.success) { notify('error', result.error?.message || `${role.title} could not be removed.`); return; }
    }
    setRoles((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
  };
  const removeStagedPerson = (person: Person) => {
    if (person.saved) return;
    setPeople((previous) => previous.filter((candidate) => candidate.id !== person.id).map((candidate) => candidate.managerEmail === person.email ? { ...candidate, managerEmail: '' } : candidate));
    setLeads((previous) => Object.fromEntries(Object.entries(previous).map(([department, emails]) => [department, emails.filter((email) => email !== person.email)])));
    if (editingPersonId === person.id) {
      setEditingPersonId(null);
      setPersonForm((previous) => ({ ...previous, firstName: '', lastName: '', email: '', phone: '', managerEmail: '' }));
    }
  };
  const addPerson = () => {
    const person: Person = { id: editingPersonId || `draft-${Date.now()}`, firstName: clean(personForm.firstName), lastName: clean(personForm.lastName), email: key(personForm.email), phone: clean(personForm.phone), department: clean(personForm.department || departmentNames[0]), role: clean(personForm.role || personRoleNames[0]), office: clean(personForm.office), managerEmail: key(personForm.managerEmail), employmentType: clean(personForm.employmentType) || employmentTypeOptions[0] || 'Full-time', shiftId: clean(personForm.shiftId) || shifts[0]?.id || '', startDate: personForm.startDate || today() };
    if (!/\p{L}/u.test(person.firstName) || !/\p{L}/u.test(person.lastName) || !validEmail(person.email) || !person.department || !person.role) { notify('error', 'Add a first and last name, valid work email, department, and job role.'); return; }
    if (!roles.some((item) => key(item.department) === key(person.department) && key(item.title) === key(person.role))) { notify('error', 'Choose a job role from the selected department.'); return; }
    if (!validDate(person.startDate)) { notify('error', 'Choose a valid start date.'); return; }
    if (mode === 'onsite' && !person.office) { notify('error', 'Assign an on-site team member to a workplace.'); return; }
    if (person.office && !officeNames.some((item) => key(item) === key(person.office))) { notify('error', 'Choose a workplace already configured in this setup.'); return; }
    if (person.email === ownerEmail || people.some((item) => item.email === person.email && item.id !== editingPersonId)) { notify('error', 'That work email is already part of this workspace.'); return; }
    if (person.managerEmail === person.email) { notify('error', 'A person cannot report to themselves.'); return; }
    const previousEmail = people.find((item) => item.id === editingPersonId)?.email;
    setPeople((previous) => (editingPersonId ? previous.map((item) => item.id === editingPersonId ? person : item) : [...previous, person]).map((item) => previousEmail && previousEmail !== person.email && item.managerEmail === previousEmail ? { ...item, managerEmail: person.email } : item));
    if (previousEmail && previousEmail !== person.email) setLeads((previous) => Object.fromEntries(Object.entries(previous).map(([department, emails]) => [department, emails.map((email) => email === previousEmail ? person.email : email)])));
    setEditingPersonId(null); setPersonForm((previous) => ({ ...previous, firstName: '', lastName: '', email: '', phone: '', managerEmail: '' }));
    if (person.managerEmail) addLead(person.department, person.managerEmail);
  };
  const addLead = (department: string, email: string) => setLeads((previous) => {
    const current = previous[department] || [];
    return current.includes(email) ? previous : { ...previous, [department]: [...current, email] };
  });
  const removeLead = (department: string, email: string) => setLeads((previous) => ({ ...previous, [department]: (previous[department] || []).filter((item) => item !== email) }));

  const importPeople = async (file: File) => {
    setImportErrors([]); const rows = parseCsv(await file.text()); const required = ['first_name', 'last_name', 'email'];
    if (!rows.length || required.some((header) => !(header in rows[0]))) { setImportErrors(['Use the Pixbe template: first_name, last_name, and email are required.']); return; }
    const problems: string[] = [], seen = new Set<string>(), newDepartments: string[] = [], newRoles: Array<[string, string, JobLevel]> = [], managersByDepartment = new Map<string, string[]>();
    const additions = rows.map((row, index) => {
      const line = index + 2, email = key(row.email), department = clean(row.department || departmentNames[0] || 'Management'), role = clean(row.job_title || roleNames[0] || 'Team Member'), office = clean(row.office), managerEmails = [...new Set(String(row.manager_email || '').split(';').map(key).filter(Boolean))], managerEmail = managerEmails[0] || '', startDate = clean(row.start_date || today());
      if (!clean(row.first_name) || !clean(row.last_name) || !validEmail(email)) problems.push(`Row ${line}: add a first name, last name, and valid email.`);
      if (seen.has(email) || email === ownerEmail || people.some((person) => person.email === email)) problems.push(`Row ${line}: ${email || 'this email'} is already in the workspace.`); seen.add(email);
      if (office && !officeNames.some((item) => key(item) === key(office))) problems.push(`Row ${line}: ${office} is not a configured workplace.`);
      if (!validDate(startDate)) problems.push(`Row ${line}: use a real YYYY-MM-DD date for start_date.`);
      if (!validLabel(department) || !validLabel(role)) problems.push(`Row ${line}: department and job title must contain a name of 2–80 characters.`);
      if (mode === 'onsite' && !office) problems.push(`Row ${line}: on-site team members need a configured workplace.`);
      if (managerEmails.includes(email)) problems.push(`Row ${line}: a person cannot report to themself.`);
      if (managerEmails.length) { const current = managersByDepartment.get(department) || []; managersByDepartment.set(department, [...new Set([...current, ...managerEmails])]); }
      if (!departmentNames.some((item) => key(item) === key(department))) newDepartments.push(department);
      if (!roles.some((item) => key(item.title) === key(role) && key(item.department) === key(department))) newRoles.push([role, department, setupJobLevel(row.permission_level || row.permission)]);
      return { id: `import-${line}-${email}`, firstName: clean(row.first_name), lastName: clean(row.last_name), email, phone: clean(row.phone), department, role, office, managerEmail, employmentType: clean(row.employment_type) || employmentTypeOptions[0] || 'Full-time', shiftId: shifts.find((item) => key(item.name) === key(row.shift))?.id || shifts[0]?.id || '', startDate };
    });
    const allKnown = new Set([...people.map((person) => person.email), ...additions.map((person) => person.email), ownerEmail]);
    managersByDepartment.forEach((emails) => emails.forEach((managerEmail) => { if (!allKnown.has(managerEmail)) problems.push(`${managerEmail}: manager_email must belong to this import, the invitation list, or the workspace owner.`); }));
    if (problems.length) { setImportErrors([...new Set(problems)].slice(0, 12)); return; }
    setDepartments((previous) => [...previous, ...newDepartments.filter((name, index, list) => list.findIndex((item) => key(item) === key(name)) === index && !previous.some((item) => key(item.name) === key(name))).map((name) => ({ name, saved: false }))]);
    setRoles((previous) => [...previous, ...newRoles.filter(([title, department], index, list) => list.findIndex(([otherTitle, otherDepartment]) => key(otherTitle) === key(title) && key(otherDepartment) === key(department)) === index && !previous.some((item) => key(item.title) === key(title) && key(item.department) === key(department))).map(([title, department, level]) => ({ title, department, level, saved: false }))]);
    setPeople((previous) => [...previous, ...additions]); setLeads((previous) => { const next = { ...previous }; managersByDepartment.forEach((emails, department) => { const existingKey = Object.keys(next).find((name) => key(name) === key(department)) || departmentNames.find((name) => key(name) === key(department)) || department; next[existingKey] = [...new Set([...(next[existingKey] || []), ...emails])]; }); return next; }); notify('success', `${additions.length} people are ready to review. New departments and roles will save before invitations are sent.`);
  };
  const validatePeopleForMode = () => {
    if (mode !== 'onsite') return true;
    const missing = people.filter((person) => !person.office);
    if (!missing.length) return true;
    notify('error', `Assign a workplace to ${missing.length === 1 ? missing[0].firstName : `${missing.length} people`} before launching on-site.`);
    return false;
  };
  const savePeople = async () => {
    setMessage(null);
    if (!validatePeopleForMode()) return;
    setBusy(true);
    try {
      await persistStructure();
      updateStatus('TEAM_SETUP');
      setStep(5);
    } catch (cause: any) {
      notify('error', cause?.message || 'We could not save departments and roles before review.');
    } finally {
      setBusy(false);
    }
  };
  const launch = async () => {
    setBusy(true);
    try {
      if (!validatePeopleForMode()) { setBusy(false); return; }
      await persistStructure();
      const typesResult: any = await api.setup.saveEmploymentTypes({ employmentTypes });
      if (!typesResult.success) throw new Error(typesResult.error?.message || 'Employment types could not be saved.');
      const pending = people.filter((item) => !item.saved);
      const assignments = departmentNames.map((department) => ({
        department,
        managerEmails: leads[department] || [],
        memberEmails: people.filter((person) => key(person.department) === key(department)).map((person) => person.email),
      }));
      const invited: any = await api.setup.saveTeam({
        completeOnboarding: true,
        employees: pending.map((person) => {
          const job = roles.find((item) => key(item.title) === key(person.role) && key(item.department) === key(person.department));
          return { firstName: person.firstName, lastName: person.lastName, email: person.email, phone: person.phone || undefined, officeName: person.office || undefined, department: person.department, designation: person.role, employmentType: person.employmentType || 'Full-time', dateOfJoining: person.startDate, role: toApiAuthRoleFromJobLevel(job?.level) };
        }),
        assignments,
      });
      if (!invited.success) throw new Error(invited.error?.message || 'Workspace launch could not be completed.');
      const createdRows: any[] = Array.isArray(invited.data) ? invited.data : [];
      setPeople((previous) => previous.map((person) => ({ ...person, saved: true })));
      const employeeShiftAssignments: Record<string, string> = {};
      for (const person of people) {
        if (!person.shiftId) continue;
        const created = createdRows.find((row) => key(row.email) === person.email);
        const id = clean(created?.id) || (person.saved && !person.id.startsWith('draft-') && !person.id.startsWith('import-') ? person.id : '');
        if (id) employeeShiftAssignments[id] = person.shiftId;
      }
      const shiftsResult: any = await api.setup.saveAttendanceSettings(attendancePayloadFromShifts(shifts, { employeeShiftAssignments }));
      if (!shiftsResult.success) {
        triggerToast({ title: 'Workspace launched', message: 'Team is ready, but shift assignments need a quick check in Attendance settings.', type: 'warning' });
      } else if (invited.partial) {
        triggerToast({ title: 'Workspace launched', message: invited.message || 'Some invitations need a retry from HR settings.', type: 'warning' });
      } else {
        triggerToast({ title: 'Workspace launched', message: 'Your team is ready to join Pixbe.', type: 'success' });
      }
      updateStatus('COMPLETED');
      updateState((previous) => ({
        ...previous,
        customOptions: {
          ...previous.customOptions,
          offices: officeNames,
          departments: departmentNames,
          designations: roleNames,
          employmentTypes: employmentTypes.map((item) => item.name),
          employmentTypeCategories: employmentTypes,
          shifts,
        },
      }));
      await syncWithBackend().catch(() => undefined);
      const stored = draftPeopleKey();
      if (stored) sessionStorage.removeItem(stored);
      window.location.assign('/dashboard');
    } catch (cause: any) { notify('error', cause?.message || 'We could not launch the workspace.'); setBusy(false); }
  };

  const stage = (number: number) => number < step ? 'done' : number === step ? 'current' : 'upcoming';

  return <div className="figma-setup workspace-onboarding" data-mobile-step={step}>
    <header className="m2-setup-page-header">{step>1&&<button type="button" aria-label="Previous setup step" onClick={()=>setStep((step-1) as Step)}><img src="/mobile-v2/auth-back.svg" width="20" height="20" alt=""/></button>}<h1>{['Your workplace','Build your structure','Set the rhythm','Better, together.','Ready when you are.'][step-1]}</h1></header>
    <main className="fs-shell">
      <aside className="fs-rail"><div className="fs-rail-top">
        <PixbeDesignWordmark/><div className="fs-journey">
        <h1>Make this workspace yours</h1><p className="onboarding-rail-intro">Set up {state.organization?.name || 'your workspace'}, then bring your team in.</p>
        <ol className="fs-progress-list">{steps.map(([label, detail], index) => {
          const number = index + 1;
          const status = stage(number);
          return <li key={label}>
            <button
              type="button"
              disabled={status !== 'done'}
              onClick={() => setStep(number as Step)}
              className={`fs-progress is-${status}`}
              aria-current={status === 'current' ? 'step' : undefined}
              aria-label={`${label}: ${detail}`}
            >
              <span className="fs-step-number">{status === 'done' ? <Check size={14}/> : number}</span>
              <span className="fs-step-copy"><strong>{label}</strong><small>{status === 'done' ? detail : status === 'current' ? `Step ${number} of ${steps.length}, Current` : 'Upcoming'}</small></span>
            </button>
          </li>;
        })}</ol></div>
        <div className="onboarding-workspace-note"><strong>{state.organization?.name || 'Your workspace'}</strong><span>{state.license?.planName || 'Workspace setup'}</span><p>Completed work stays saved when you go back to edit.</p></div>
        </div><OnboardingAccount/>
      </aside>
      <section className="fs-content"><OnboardingContextBar/><div className="fs-form-area"><div className="fs-form fs-workspace-form">
        {!dataLoaded && <div className="pixbe-setup__skeleton" aria-busy="true" aria-live="polite">
          <span className="pixbe-setup__skeleton-line pixbe-setup__skeleton-line--title" />
          <span className="pixbe-setup__skeleton-line pixbe-setup__skeleton-line--body" />
          <div className="pixbe-setup__skeleton-cards">
            <span /><span /><span />
          </div>
        </div>}
        {dataLoaded && message && <div role={message.kind === 'error' ? 'alert' : 'status'} className={`pixbe-setup__message is-${message.kind}`}><span>{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message"><X className="size-4" /></button></div>}
        {dataLoaded && step === 1 && <SetupWorkplaceStep mode={mode} setMode={setMode} offices={offices} officeForm={officeForm} setOfficeForm={setOfficeForm} timezones={timezones} addOffice={addOffice} removeOffice={removeOffice} saveWorkplace={saveWorkplace} busy={busy} />}
        {dataLoaded && step === 3 && <SetupWorkPatternsStep employmentTypes={employmentTypes} setEmploymentTypes={setEmploymentTypes} shifts={shifts} setShifts={setShifts} saveWorkPatterns={saveWorkPatterns} goBack={() => setStep(2)} busy={busy} onNotify={notify} />}
        {dataLoaded && step === 2 && <div className="setup-patterns">
          <div className="setup-patterns__heading">
            <h2>Give your team a clear structure</h2><p>Departments organise people. Job roles describe their work; permission levels control what they can access.</p>
          </div>
          <div className="setup-patterns__grid">
            <section>
              <div className="setup-patterns__section-head">
                <h3>Departments</h3>
                <span>{departmentNames.length}</span>
              </div>
              <div className="setup-chips">{suggestions.filter((item) => !departmentNames.some((name) => key(name) === key(item))).map((item) => <button key={item} type="button" onClick={() => addDepartment(item)} className="setup-chip">+ {item}</button>)}</div>
              <div className="setup-patterns__rows">{departments.map((department, index) => {
                const isStarter = !department.saved && key(department.name) === key(leadershipDepartment((state.organization as any)?.industry));
                return <div key={department.id || `draft-department-${index}`} className="setup-patterns__row fs-structure-row"><label className="setup-field fs-department-name">Department name<input value={department.name} readOnly={department.saved} onChange={(event) => { const name = event.target.value; const oldName = department.name; structureTouched.current = true; setDepartments((previous) => previous.map((item,itemIndex) => itemIndex === index ? { ...item, name } : item)); setRoles((previous) => previous.map((item) => item.department === oldName ? { ...item, department: name } : item)); setPeople((previous) => previous.map((item) => item.department === oldName ? { ...item, department: name } : item)); setLeads((previous) => { if (oldName === name || !previous[oldName]) return previous; const next = { ...previous, [name]: Array.from(new Set([...(previous[name] || []), ...previous[oldName]])) }; delete next[oldName]; return next; }); }}/></label><button type="button" onClick={() => void removeDepartment(index)} aria-label={`Remove ${department.name}`}>Remove</button></div>;
              })}</div>
              <details className="fs-add-composer"><summary>+ Add department</summary>              <div className="setup-patterns__add">
                <input value={departmentInput} onChange={(event) => setDepartmentInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDepartment(); } }} placeholder="Add a department" />
                <button type="button" onClick={() => addDepartment()} className="setup-icon-btn" aria-label="Add department"><Plus className="size-4" /></button>
              </div>
</details>
            </section>
            <section>
              <div className="setup-patterns__section-head">
                <h3>Job roles</h3>
                <span>{roles.length}</span>
              </div>
              <div className="setup-patterns__rows">{roles.map((role, index) => {
                const isStarter = !role.saved && isExecutiveTitle(role.title);
                return <div key={role.id || `draft-role-${index}`} className="setup-patterns__row fs-structure-row fs-role-row"><label className="setup-field">Job role<input value={role.title} readOnly={role.saved} onChange={(event) => { structureTouched.current = true; const title = event.target.value; setRoles((previous) => previous.map((item,itemIndex) => itemIndex === index ? { ...item, title } : item)); setPeople((previous) => previous.map((item) => item.role === role.title && item.department === role.department ? { ...item, role: title } : item)); }}/></label><label className="setup-field">Permission level<select className="setup-level-select" value={role.level} onChange={(event) => { structureTouched.current = true; setRoles((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, level: event.target.value as JobLevel } : item)); }} aria-label={`Permission for ${role.title}`}>{JOB_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button type="button" onClick={() => void removeRole(index)} aria-label={`Remove ${role.title}`}>Remove</button></div>;
              })}</div>
              <details className="fs-add-composer"><summary>+ Add job role</summary>              <div className="setup-form-grid">
                <label className="setup-field">Job title<input value={roleForm.title} onChange={(event) => setRoleForm((previous) => ({ ...previous, title: event.target.value }))} placeholder="e.g. Product Designer" /></label>
                <label className="setup-field">Department<select value={roleForm.department || departmentNames[0] || ''} onChange={(event) => setRoleForm((previous) => ({ ...previous, department: event.target.value }))}>{departmentNames.map((department) => <option key={department}>{department}</option>)}</select></label>
                <label className="setup-field">Permission
                  <select value={roleForm.level} onChange={(event) => setRoleForm((previous) => ({ ...previous, level: event.target.value as JobLevel }))}>{JOB_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
                  <span className="setup-field__hint">{JOB_LEVELS.find((item) => item.value === roleForm.level)?.hint}</span>
                </label>
                <button type="button" onClick={addRole} className="setup-button setup-button--secondary"><Plus className="size-4" />Add role</button>
              </div>
</details>
              <div className="fs-permission-guide">{JOB_LEVELS.map((level) => <div key={level.value}><strong>{level.label}</strong><span>{level.hint}</span></div>)}</div>
            </section>
          </div>
          <div className="setup-workplace__footer">
            <button type="button" className="setup-button setup-button--secondary" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="setup-button setup-button--primary" disabled={busy} onClick={saveStructure}>{busy ? 'Saving…' : 'Continue'}<span aria-hidden="true">→</span></button>
          </div>
        </div>}
        {dataLoaded && step === 4 && <div className="setup-patterns">
          <div className="setup-patterns__heading"><h2>Bring your people into Pixbe</h2><p>Prepare invitations one at a time or import a CSV. Nothing is sent until you launch your workspace.</p></div>
          <div className="onboarding-notice"><strong>Invitations are staged, not sent</strong><p>{people.filter((person) => !person.saved).length} invitations are ready for launch. Review each person’s department, role, shift, workplace and reporting manager before sending.</p></div>
          <div className="setup-people">
            <section>
              <div className="setup-patterns__section-head">
                <h3>{editingPersonId ? 'Edit staged invitation' : 'Add a person'}</h3>
              </div>
              <div className="setup-form-grid">
                <label className="setup-field">Full name *<input value={personForm.firstName + (personForm.lastName ? ` ${personForm.lastName}` : '')} onChange={(event) => { const name = event.target.value; const separator = name.trimEnd().lastIndexOf(' '); setPersonForm((previous) => ({ ...previous, firstName: separator < 0 ? name : name.slice(0,separator), lastName: separator < 0 ? '' : name.slice(separator+1) })); }} /></label>
                <label className="setup-field">Work email *<input type="email" value={personForm.email} onChange={(event) => setPersonForm((previous) => ({ ...previous, email: event.target.value }))}/></label>
                <label className="setup-field">Department<select value={personForm.department || departmentNames[0] || ''} onChange={(event) => setPersonForm((previous) => ({ ...previous, department: event.target.value, role: '' }))}>{departmentNames.map((department) => <option key={department}>{department}</option>)}</select></label>
                <label className="setup-field">Job role<select value={personForm.role || personRoleNames[0] || ''} onChange={(event) => setPersonForm((previous) => ({ ...previous, role: event.target.value }))}>{roles.filter((item) => key(item.department) === key(personForm.department || departmentNames[0])).map((item) => <option key={`${item.department}-${item.title}`} value={item.title}>{item.title} · {item.level}</option>)}</select></label>
              </div>
              <div className="setup-patterns__section-head setup-patterns__section-head--spaced">
                <h3>Assignment</h3>
              </div>
              <div className="setup-form-grid">
                <label className="setup-field">Employment type<select value={personForm.employmentType} onChange={(event) => setPersonForm((previous) => ({ ...previous, employmentType: event.target.value }))}>{employmentTypeOptions.map((type) => <option key={type}>{type}</option>)}</select></label>
                <label className="setup-field">Shift<select value={personForm.shiftId || shifts[0]?.id || ''} onChange={(event) => setPersonForm((previous) => ({ ...previous, shiftId: event.target.value }))}>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select></label>
                {officeNames.length > 0 && <label className="setup-field">Workplace<select value={personForm.office} onChange={(event) => setPersonForm((previous) => ({ ...previous, office: event.target.value }))}><option value="">{mode === 'onsite' ? 'Choose workplace' : 'No assigned office'}</option>{officeNames.map((office) => <option key={office}>{office}</option>)}</select></label>}
                <label className="setup-field">Start date<DateInput value={personForm.startDate} onChange={(event) => setPersonForm((previous) => ({ ...previous, startDate: event.target.value }))} /></label>
                <label className="setup-field">Phone<input value={personForm.phone} onChange={(event) => setPersonForm((previous) => ({ ...previous, phone: event.target.value }))} placeholder="Optional" /></label>
                <label className="setup-field is-wide">Manager<select value={personForm.managerEmail} onChange={(event) => setPersonForm((previous) => ({ ...previous, managerEmail: event.target.value }))}><option value="">Chosen later (add more at review)</option>{leadOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              </div>
              <button type="button" onClick={addPerson} className="setup-button setup-button--secondary"><Plus className="size-4" />{editingPersonId ? 'Save invitation changes' : 'Add to invitation list'}</button>
              <button type="button" className="onboarding-text-action" onClick={() => { setEditingPersonId(null); setPersonForm({ firstName: '', lastName: '', email: '', phone: '', department: '', role: '', office: '', managerEmail: '', employmentType: employmentTypeOptions[0] || 'Full-time', shiftId: shifts[0]?.id || '', startDate: today() }); }}>{editingPersonId ? 'Cancel editing' : 'Clear draft'}</button>
            </section>
            <section className="setup-import">
              <div className="setup-patterns__section-head">
                <h3>Have a list already?</h3><p className="fs-hint">Import a CSV with the same fields. We’ll validate each row before adding it.</p>
              </div>
              <div className="setup-import__actions">
                <button type="button" className="setup-button setup-button--secondary" onClick={downloadTemplate}><FileSpreadsheet className="size-4" />Get CSV template</button>
                <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPeople(file); event.currentTarget.value = ''; }} />
                <button type="button" onClick={() => fileInput.current?.click()} className="setup-button setup-button--secondary"><Upload className="size-4" />Choose CSV</button>
              </div>
              {importErrors.length > 0 && <ul className="setup-issues">{importErrors.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            </section>
          </div>
          <div className="setup-list">
            <div className="setup-patterns__section-head">
              <h3>Staged invitations</h3>
              <span>{people.filter((person) => !person.saved).length} staged · {people.filter((person) => person.saved).length} existing</span>
            </div>
            {people.length === 0 && <p className="onboarding-empty">No invitations staged yet. Add a person or import a CSV to build your team.</p>}
            <div className="setup-patterns__rows">{people.map((person) => {
              const meta = [person.department, person.role, person.employmentType].filter(Boolean).join(' · ');
              const officeBit = mode === 'onsite' && person.office ? ` · ${person.office}` : '';
              return <div key={person.id} className="setup-patterns__row"><div><strong>{person.firstName} {person.lastName}</strong><small>{person.email}</small><small className="setup-patterns__meta">{meta}{officeBit}</small><small className="setup-patterns__meta">{shifts.find((shift) => shift.id === person.shiftId)?.name || 'No shift'} · {person.startDate}{person.managerEmail ? ` · Reports to ${leadOptions.find((manager) => manager.value === person.managerEmail)?.label || person.managerEmail}` : ''}</small></div>{!person.saved && <button type="button" className="onboarding-text-action" aria-label={`Edit invitation for ${person.firstName} ${person.lastName}`} onClick={() => { setEditingPersonId(person.id); setPersonForm({ firstName: person.firstName, lastName: person.lastName, email: person.email, phone: person.phone, department: person.department, role: person.role, office: person.office, managerEmail: person.managerEmail, employmentType: person.employmentType, shiftId: person.shiftId, startDate: person.startDate }); document.querySelector('.setup-people')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Edit</button>}
              <button type="button" disabled={person.saved} onClick={() => removeStagedPerson(person)} aria-label={`Remove ${person.firstName}`}>Remove</button></div>;
            })}</div>
          </div>
          <div className="setup-workplace__footer">
            <button type="button" className="setup-button setup-button--secondary" onClick={() => setStep(3)}>Back</button>
            <button type="button" className="setup-button setup-button--primary" disabled={busy} onClick={() => void savePeople()}>{busy ? 'Saving…' : 'Review setup'}<span aria-hidden="true">→</span></button>
          </div>
        </div>}
        {dataLoaded && step === 5 && <div className="setup-patterns">
          <div className="setup-patterns__heading">
            <h2>Ready to launch {state.organization?.name || 'your workspace'}?</h2><p>Check your setup and team assignments. Edit any completed step without losing your saved details.</p>
          </div>
          <section className="onboarding-review-card"><header><h3>{state.organization?.name || 'Your workspace'}</h3><span>Ready for review</span></header><dl><div><dt>Workspace owner</dt><dd>{state.currentPersona?.name} · {ownerEmail}</dd></div><div><dt>License</dt><dd>{state.license?.planName || 'Your selected plan'}</dd></div><div><dt>Work arrangement</dt><dd>{mode === 'onsite' ? 'On-site' : mode === 'hybrid' ? 'Hybrid' : 'Remote'}</dd></div></dl></section>
          <div className="setup-facts">
            <span><strong>{offices.length || '—'}</strong> workplaces</span>
            <span><strong>{departmentNames.length}</strong> departments</span>
            <span><strong>{employmentTypes.length}</strong> employment types</span>
            <span><strong>{shifts.length}</strong> shifts</span>
            <span><strong>{people.length}</strong> people to invite</span>
            {state.license?.planName && <span><strong>{state.license.planName}</strong> license</span>}
          </div>
          <section className="onboarding-review-card"><header><h3>Workplace</h3><button type="button" onClick={() => setStep(1)}>Edit workplace</button></header>{offices.length ? offices.map((office) => <dl key={office.id || office.name}><div><dt>{office.name}</dt><dd>{office.address}</dd></div><div><dt>Timezone & radius</dt><dd>{office.timezone} · {office.radius} metres</dd></div></dl>) : <p>Remote working. No physical office is required.</p>}</section>
          <div className="onboarding-review-section-head"><h3>Departments & managers</h3><button type="button" onClick={() => setStep(2)}>Edit structure</button></div>
          <div className="setup-review-list">{departmentNames.map((department) => {
            const members = people.filter((person) => key(person.department) === key(department));
            const managerEmails = leads[department] || [];
            return <div key={department} className="setup-review-item">
              <div>
                <h3>{department}</h3>
                <p>{members.length} {members.length === 1 ? 'person' : 'people'} to invite · {roles.filter((role) => key(role.department) === key(department)).map((role) => `${role.title} (${role.level})`).join(', ') || 'No role assigned'}</p>
              </div>
              <div className="setup-review-managers">
                <p>Managers</p>
                {!managerEmails.length && <p className="setup-review-empty">No manager yet</p>}
                {managerEmails.length > 0 && <div className="setup-pills">{managerEmails.map((email, index) => {
                  const option = leadOptions.find((item) => item.value === email);
                  return <span key={email} className="setup-pill"><span>{option?.label.split(' · ')[0] || email}</span>{index === 0 && managerEmails.length > 1 && <small>Primary</small>}<button type="button" onClick={() => removeLead(department, email)} aria-label={`Remove ${option?.label || email} as manager`}><X className="size-3" /></button></span>;
                })}</div>}
                <label className="setup-field">Add manager
                  <select value="" onChange={(event) => { if (event.target.value) addLead(department, event.target.value); }} aria-label={`Add manager for ${department}`}>
                    <option value="">{managerEmails.length ? 'Add another manager' : 'Add manager (or assign later)'}</option>
                    {leadOptions.filter((item) => !managerEmails.includes(item.value)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>
            </div>;
          })}</div>
          <section className="onboarding-review-card"><header><h3>Hours</h3><button type="button" onClick={() => setStep(3)}>Edit hours</button></header><dl><div><dt>Employment types</dt><dd>{employmentTypes.map((type) => type.name).join(', ')}</dd></div>{shifts.map((shift) => <div key={shift.id}><dt>{shift.name}</dt><dd>{shiftSummary(shift)}</dd></div>)}</dl></section>
          <section className="onboarding-review-card"><header><h3>People</h3><button type="button" onClick={() => setStep(4)}>Edit people</button></header><p>{people.filter((person) => !person.saved).length} invitations will be sent when you launch.</p><p>{people.filter((person) => !person.saved).map((person) => `${person.firstName} ${person.lastName}`).join(', ') || 'You can invite people after launch.'}</p></section>
          <details className="fs-add-composer"><summary>Additional work-pattern details</summary>          <div className="setup-facts-detail">
            {employmentTypes.map((item) => <p key={item.id}><strong>{item.name}</strong>{item.hasBenefits ? ' · benefits' : ''}</p>)}
            {shifts.map((shift) => <p key={shift.id}><strong>{shift.name}</strong> · {shiftSummary(shift)}</p>)}
          </div>
</details>
          <div className="setup-next">
            <h3>What happens next</h3>
            <p>When you launch, invitations are sent to the people listed here. Then you can configure attendance, leave, payroll, and documents from the workspace.</p>
          </div>
          <div className="setup-workplace__footer">
            <button type="button" className="setup-button setup-button--secondary" onClick={() => setStep(4)}>Back</button>
            <button type="button" className="setup-button setup-button--primary" disabled={busy} onClick={() => void launch()}>{busy ? 'Launching…' : people.some((person) => !person.saved) ? 'Launch & send invitations' : 'Launch workspace'}<span aria-hidden="true">→</span></button>
          </div>
        </div>}
      </div></div><OnboardingPageFooter current={step} total={steps.length} saved/></section>
    </main>
  </div>;
};
