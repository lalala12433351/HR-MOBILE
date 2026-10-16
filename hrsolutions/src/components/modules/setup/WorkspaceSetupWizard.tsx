'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileSpreadsheet, Plus, Trash2, Upload, X,
} from 'lucide-react';
import { PixbeWordmark } from '@/components/common/PixbeBrand';
import { SetupWorkplaceStep } from './SetupWorkplaceStep';
import {
  DEFAULT_EMPLOYMENT_TYPES,
  DEFAULT_SHIFT,
  SetupWorkPatternsStep,
  shiftSummary,
  type EmploymentTypeCategory,
} from './SetupWorkPatternsStep';
import './workspace-setup.css';
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
const JOB_LEVELS: Array<{ value: JobLevel; label: string }> = [
  { value: 'Employee', label: 'Employee — standard access' },
  { value: 'Manager', label: 'Manager — approver & lead' },
  { value: 'HR', label: 'HR — operations & records' },
  { value: 'Admin', label: 'Admin — full system access' },
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
const withDefaultStructure = (departments: Department[], roles: JobRole[], industry?: string, ownerTitle?: string) => {
  const deptName = leadershipDepartment(industry);
  const orphanExecutive = roles.some((role) => isExecutiveTitle(role.title) && !role.department);
  const shouldSeed = !departments.length || orphanExecutive;
  const nextDepartments = !shouldSeed || departments.some((item) => key(item.name) === key(deptName))
    ? departments
    : [{ name: deptName, saved: false }, ...departments];
  let nextRoles = roles.map((role) => {
    const executive = isExecutiveTitle(role.title);
    return { ...role, department: role.department || (executive ? deptName : role.department), level: setupJobLevel(role.level) };
  });
  const title = ownerTitle && validLabel(ownerTitle) ? ownerTitle : (deptName === 'Administration' ? 'Principal / Dean' : 'CEO / Executive Owner');
  if (shouldSeed && !nextRoles.some((role) => isExecutiveTitle(role.title))) {
    nextRoles = [{ title, department: deptName, level: 'Employee', saved: false }, ...nextRoles];
  }
  return { departments: nextDepartments, roles: nextRoles };
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
  const fileInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [mode, setMode] = useState<Mode>('remote');
  const [offices, setOffices] = useState<Office[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<JobRole[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
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

  const hydrate = useCallback(async () => {
    setDataLoaded(false);
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
    const seeded = withDefaultStructure(loadedDepartments, loadedRoles, (state.organization as any)?.industry, clean((state.currentPersona as any)?.designation));
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
    setStep(toStep(status));
  }, [backendStatus, router, state.onboardingStatus]);

  const persistStructure = async () => {
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
      setRoles((previous) => previous.map((item) => ({ ...item, ...(result.data || []).find((created: any) => key(created.title) === key(item.title)), saved: item.saved || Boolean((result.data || []).find((created: any) => key(created.title) === key(item.title))) })));
      updateStatus('ROLES_SETUP');
    } else if (roles.length) {
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
      await hydrate(); updateStatus('OFFICE_SETUP'); setStep(2); notify('success', 'Work arrangement saved. Next, add departments and job roles.');
    } catch (cause: any) { notify('error', cause?.message || 'We could not save your workplaces.'); } finally { setBusy(false); }
  };
  const saveStructure = async () => {
    if (!departmentNames.length || !roleNames.length) { notify('error', 'Add at least one department and one job role before continuing.'); return; }
    setBusy(true); try { await persistStructure(); await hydrate(); setStep(3); notify('success', 'Departments and job roles are saved. Next, set employment types and shift hours.'); } catch (cause: any) { notify('error', cause?.message || 'We could not save the organisation structure.'); } finally { setBusy(false); }
  };
  const saveWorkPatterns = async () => {
    if (!employmentTypes.length) { notify('error', 'Add at least one employment type before continuing.'); return; }
    if (!shifts.length) { notify('error', 'Add at least one shift with working days before continuing.'); return; }
    if (shifts.some((shift) => !(shift.workingDays || []).length)) { notify('error', 'Each shift needs at least one working day.'); return; }
    setBusy(true);
    try {
      const shiftsResult: any = await api.setup.saveAttendanceSettings({ shifts });
      if (!shiftsResult.success) throw new Error(shiftsResult.error?.message || 'Shifts could not be saved.');
      const typesResult: any = await api.setup.saveEmploymentTypes({ employmentTypes });
      if (!typesResult.success) throw new Error(typesResult.error?.message || 'Employment types could not be saved.');
      updateStatus('WORK_PATTERNS_SETUP');
      updateState((previous) => ({
        ...previous,
        customOptions: {
          ...previous.customOptions,
          employmentTypes: employmentTypes.map((item) => item.name),
          employmentTypeCategories: employmentTypes,
          shifts,
        },
      }));
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
    setDepartments((previous) => [...previous, { name, saved: false }]); setDepartmentInput('');
  };
  const addRole = () => {
    const title = clean(roleForm.title), department = clean(roleForm.department || departmentNames[0]);
    if (!validLabel(title) || !department) { notify('error', 'Choose a department and enter a job title of 2–80 characters.'); return; }
    if (roles.some((item) => key(item.title) === key(title) && key(item.department) === key(department))) { notify('error', 'That job role already exists for this department.'); return; }
    setRoles((previous) => [...previous, { title, department, level: roleForm.level, saved: false }]); setRoleForm({ title: '', department, level: 'Employee' });
  };
  const addPerson = () => {
    const person: Person = { id: `draft-${Date.now()}`, firstName: clean(personForm.firstName), lastName: clean(personForm.lastName), email: key(personForm.email), phone: clean(personForm.phone), department: clean(personForm.department || departmentNames[0]), role: clean(personForm.role || personRoleNames[0]), office: clean(personForm.office), managerEmail: key(personForm.managerEmail), employmentType: clean(personForm.employmentType) || employmentTypeOptions[0] || 'Full-time', shiftId: clean(personForm.shiftId) || shifts[0]?.id || '', startDate: personForm.startDate || today() };
    if (!/\p{L}/u.test(person.firstName) || !/\p{L}/u.test(person.lastName) || !validEmail(person.email) || !person.department || !person.role) { notify('error', 'Add a first and last name, valid work email, department, and job role.'); return; }
    if (!roles.some((item) => key(item.department) === key(person.department) && key(item.title) === key(person.role))) { notify('error', 'Choose a job role from the selected department.'); return; }
    if (!validDate(person.startDate)) { notify('error', 'Choose a valid start date.'); return; }
    if (mode === 'onsite' && !person.office) { notify('error', 'Assign an on-site team member to a workplace.'); return; }
    if (person.office && !officeNames.some((item) => key(item) === key(person.office))) { notify('error', 'Choose a workplace already configured in this setup.'); return; }
    if (person.email === ownerEmail || people.some((item) => item.email === person.email)) { notify('error', 'That work email is already part of this workspace.'); return; }
    setPeople((previous) => [...previous, person]); setPersonForm((previous) => ({ ...previous, firstName: '', lastName: '', email: '', phone: '', managerEmail: '' }));
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
  const savePeople = async () => {
    setMessage(null);
    setStep(5);
  };
  const launch = async () => {
    setBusy(true);
    try {
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
      if (invited.partial) throw new Error(invited.message || 'Some invitations could not be delivered. Review the team and retry.');
      const createdRows: any[] = Array.isArray(invited.data) ? invited.data : [];
      setPeople((previous) => previous.map((person) => ({ ...person, saved: true })));
      const employeeShiftAssignments: Record<string, string> = {};
      for (const person of people) {
        if (!person.shiftId) continue;
        const created = createdRows.find((row) => key(row.email) === person.email);
        const id = clean(created?.id) || (person.saved && !person.id.startsWith('draft-') && !person.id.startsWith('import-') ? person.id : '');
        if (id) employeeShiftAssignments[id] = person.shiftId;
      }
      const shiftsResult: any = await api.setup.saveAttendanceSettings({ shifts, employeeShiftAssignments });
      if (!shiftsResult.success) throw new Error(shiftsResult.error?.message || 'Shifts could not be saved.');
      updateStatus('COMPLETED'); updateState((previous) => ({ ...previous, customOptions: { ...previous.customOptions, offices: officeNames, departments: departmentNames, designations: roleNames, employmentTypes: employmentTypes.map((item) => item.name), employmentTypeCategories: employmentTypes, shifts } })); await syncWithBackend().catch(() => undefined);
      const stored = draftPeopleKey();
      if (stored) sessionStorage.removeItem(stored);
      triggerToast({ title: 'Workspace launched', message: 'Your team is ready to join Pixbe.', type: 'success' }); window.location.assign('/dashboard');
    } catch (cause: any) { notify('error', cause?.message || 'We could not launch the workspace.'); setBusy(false); }
  };

  const stage = (number: number) => number < step ? 'done' : number === step ? 'current' : 'upcoming';

  return <div className="pixbe-setup">
    <main className="pixbe-setup__main">
      <aside className="pixbe-setup__rail">
        <PixbeWordmark className="pixbe-setup__brand text-[15px]" markClassName="h-5 w-5" />
        <h1>Make this workspace yours.</h1>
        <ol className="pixbe-setup__steps">{steps.map(([label, detail], index) => { const number = index + 1; const status = stage(number); return <li key={label}><button type="button" disabled={status !== 'done'} onClick={() => setStep(number as Step)} className={status === 'current' ? 'is-current' : status === 'done' ? 'is-done' : ''} aria-current={status === 'current' ? 'step' : undefined}><span className="pixbe-setup__step-no">{status === 'done' ? '✓' : number}</span><span><strong>{label}</strong><small>{detail}</small></span></button></li>; })}</ol>
        <div className="pixbe-setup__illustration"><img src="/pixbe-workspace-plan.png" alt="" /></div>
      </aside>
      <section className="pixbe-setup__content">
        {!dataLoaded && <div className="pixbe-setup__skeleton" aria-busy="true" aria-live="polite">
          <span className="pixbe-setup__skeleton-line pixbe-setup__skeleton-line--title" />
          <span className="pixbe-setup__skeleton-line pixbe-setup__skeleton-line--body" />
          <div className="pixbe-setup__skeleton-cards">
            <span /><span /><span />
          </div>
        </div>}
        {dataLoaded && message && <div role={message.kind === 'error' ? 'alert' : 'status'} className={`pixbe-setup__message is-${message.kind}`}><span>{message.text}</span><button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message"><X className="size-4" /></button></div>}
        {dataLoaded && step === 1 && <SetupWorkplaceStep mode={mode} setMode={setMode} offices={offices} officeForm={officeForm} setOfficeForm={setOfficeForm} timezones={timezones} addOffice={addOffice} removeOffice={removeOffice} saveWorkplace={saveWorkplace} busy={busy} />}
        {dataLoaded && step === 3 && <SetupWorkPatternsStep employmentTypes={employmentTypes} setEmploymentTypes={setEmploymentTypes} shifts={shifts} setShifts={setShifts} saveWorkPatterns={saveWorkPatterns} goBack={() => setStep(2)} busy={busy} />}
        {dataLoaded && step === 2 && <div className="setup-patterns">
          <div className="setup-patterns__heading">
            <h2>Shape your organisation.</h2>
          </div>
          <div className="setup-patterns__grid">
            <section>
              <div className="setup-patterns__section-head">
                <h3>Departments</h3>
                <span>{departmentNames.length}</span>
              </div>
              <div className="setup-chips">{suggestions.filter((item) => !departmentNames.some((name) => key(name) === key(item))).map((item) => <button key={item} type="button" onClick={() => addDepartment(item)} className="setup-chip">+ {item}</button>)}</div>
              <div className="setup-patterns__add">
                <input value={departmentInput} onChange={(event) => setDepartmentInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addDepartment(); } }} placeholder="Add a department" />
                <button type="button" onClick={() => addDepartment()} className="setup-icon-btn" aria-label="Add department"><Plus className="size-4" /></button>
              </div>
              <div className="setup-patterns__rows">{departments.map((department, index) => <div key={`${department.name}-${index}`} className="setup-patterns__row"><div><strong>{department.name}</strong></div><button type="button" onClick={() => setDepartments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${department.name}`}><Trash2 className="size-4" /></button></div>)}</div>
            </section>
            <section>
              <div className="setup-patterns__section-head">
                <h3>Job roles</h3>
                <span>{roles.length}</span>
              </div>
              <div className="setup-form-grid">
                <label className="setup-field">Job title<input value={roleForm.title} onChange={(event) => setRoleForm((previous) => ({ ...previous, title: event.target.value }))} placeholder="e.g. Product Designer" /></label>
                <label className="setup-field">Department<select value={roleForm.department || departmentNames[0] || ''} onChange={(event) => setRoleForm((previous) => ({ ...previous, department: event.target.value }))}>{departmentNames.map((department) => <option key={department}>{department}</option>)}</select></label>
                <label className="setup-field">Permission<select value={roleForm.level} onChange={(event) => setRoleForm((previous) => ({ ...previous, level: event.target.value as JobLevel }))}>{JOB_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <button type="button" onClick={addRole} className="setup-button setup-button--secondary"><Plus className="size-4" />Add role</button>
              </div>
              <div className="setup-patterns__rows">{roles.map((role, index) => <div key={`${role.department}-${role.title}-${index}`} className="setup-patterns__row"><div><strong>{role.title}</strong><small>{role.department}</small></div><select className="setup-level-select" value={role.level} onChange={(event) => setRoles((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, level: event.target.value as JobLevel } : item))} aria-label={`Permission for ${role.title}`}>{JOB_LEVELS.map((item) => <option key={item.value} value={item.value}>{item.value}</option>)}</select><button type="button" onClick={() => setRoles((previous) => previous.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${role.title}`}><Trash2 className="size-4" /></button></div>)}</div>
            </section>
          </div>
          <div className="setup-workplace__footer">
            <button type="button" className="setup-button setup-button--secondary" onClick={() => setStep(1)}>Back</button>
            <button type="button" className="setup-button setup-button--primary" disabled={busy} onClick={saveStructure}>{busy ? 'Saving…' : 'Save structure & continue'}<span aria-hidden="true">→</span></button>
          </div>
        </div>}
        {dataLoaded && step === 4 && <div className="setup-patterns">
          <div className="setup-step__top">
            <div className="setup-patterns__heading">
              <h2>Invite your first people.</h2>
            </div>
            <button type="button" className="setup-button setup-button--secondary" onClick={downloadTemplate}><FileSpreadsheet className="size-4" />Get CSV template</button>
          </div>
          <div className="setup-people">
            <section>
              <div className="setup-patterns__section-head">
                <h3>Add a person</h3>
              </div>
              <div className="setup-form-grid">
                <label className="setup-field">First name<input value={personForm.firstName} onChange={(event) => setPersonForm((previous) => ({ ...previous, firstName: event.target.value }))} /></label>
                <label className="setup-field">Last name<input value={personForm.lastName} onChange={(event) => setPersonForm((previous) => ({ ...previous, lastName: event.target.value }))} /></label>
                <label className="setup-field is-wide">Work email<input type="email" value={personForm.email} onChange={(event) => setPersonForm((previous) => ({ ...previous, email: event.target.value }))} /></label>
                <label className="setup-field">Phone<input value={personForm.phone} onChange={(event) => setPersonForm((previous) => ({ ...previous, phone: event.target.value }))} placeholder="Optional" /></label>
                <label className="setup-field">Start date<input type="date" value={personForm.startDate} onChange={(event) => setPersonForm((previous) => ({ ...previous, startDate: event.target.value }))} /></label>
                <label className="setup-field">Department<select value={personForm.department || departmentNames[0] || ''} onChange={(event) => setPersonForm((previous) => ({ ...previous, department: event.target.value, role: '' }))}>{departmentNames.map((department) => <option key={department}>{department}</option>)}</select></label>
                <label className="setup-field">Job role<select value={personForm.role || personRoleNames[0] || ''} onChange={(event) => setPersonForm((previous) => ({ ...previous, role: event.target.value }))}>{roles.filter((item) => key(item.department) === key(personForm.department || departmentNames[0])).map((item) => <option key={`${item.department}-${item.title}`} value={item.title}>{item.title} · {item.level}</option>)}</select></label>
                <label className="setup-field">Employment type<select value={personForm.employmentType} onChange={(event) => setPersonForm((previous) => ({ ...previous, employmentType: event.target.value }))}>{employmentTypeOptions.map((type) => <option key={type}>{type}</option>)}</select></label>
                <label className="setup-field">Shift<select value={personForm.shiftId || shifts[0]?.id || ''} onChange={(event) => setPersonForm((previous) => ({ ...previous, shiftId: event.target.value }))}>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select></label>
                {officeNames.length > 0 && <label className="setup-field">Workplace<select value={personForm.office} onChange={(event) => setPersonForm((previous) => ({ ...previous, office: event.target.value }))}><option value="">{mode === 'onsite' ? 'Choose workplace' : 'No assigned office'}</option>{officeNames.map((office) => <option key={office}>{office}</option>)}</select></label>}
                <label className="setup-field is-wide">Manager<select value={personForm.managerEmail} onChange={(event) => setPersonForm((previous) => ({ ...previous, managerEmail: event.target.value }))}><option value="">Chosen later (add more at review)</option>{leadOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              </div>
              <button type="button" onClick={addPerson} className="setup-button setup-button--secondary"><Plus className="size-4" />Add person</button>
            </section>
            <section className="setup-import">
              <div className="setup-patterns__section-head">
                <h3>Import a CSV</h3>
              </div>
              <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPeople(file); event.currentTarget.value = ''; }} />
              <button type="button" onClick={() => fileInput.current?.click()} className="setup-button setup-button--secondary"><Upload className="size-4" />Choose CSV</button>
              {importErrors.length > 0 && <ul className="setup-issues">{importErrors.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
            </section>
          </div>
          <div className="setup-list">
            <div className="setup-patterns__section-head">
              <h3>Invitation list</h3>
              <span>{people.length}</span>
            </div>
            <div className="setup-patterns__rows">{people.map((person) => {
              const job = roles.find((item) => key(item.title) === key(person.role) && key(item.department) === key(person.department));
              return <div key={person.id} className="setup-patterns__row"><div><strong>{person.firstName} {person.lastName}</strong><small>{person.email} · {person.department} · {person.role}{job ? ` · ${job.level}` : ''} · {person.employmentType}{person.shiftId ? ` · ${shifts.find((shift) => shift.id === person.shiftId)?.name || 'Shift'}` : ''}{person.office ? ` · ${person.office}` : ''}</small></div><button type="button" disabled={person.saved} onClick={() => setPeople((previous) => previous.filter((candidate) => candidate.id !== person.id))} aria-label={`Remove ${person.firstName}`}><Trash2 className="size-4" /></button></div>;
            })}</div>
          </div>
          <div className="setup-workplace__footer">
            <button type="button" className="setup-button setup-button--secondary" onClick={() => setStep(3)}>Back</button>
            <button type="button" className="setup-button setup-button--primary" disabled={busy} onClick={savePeople}>{busy ? 'Sending invitations…' : 'Review setup'}<span aria-hidden="true">→</span></button>
          </div>
        </div>}
        {dataLoaded && step === 5 && <div className="setup-patterns">
          <div className="setup-patterns__heading">
            <h2>Review and launch.</h2>
          </div>
          <div className="setup-review-list">{departmentNames.map((department) => {
            const members = people.filter((person) => key(person.department) === key(department));
            return <div key={department} className="setup-review-item">
              <div>
                <h3>{department}</h3>
                <p>{members.length} person to invite{members.length === 1 ? '' : 's'} · {roles.filter((role) => key(role.department) === key(department)).map((role) => `${role.title} (${role.level})`).join(', ') || 'No role assigned'}</p>
              </div>
              <div className="setup-review-managers">
                <p>Managers</p>
                {!(leads[department] || []).length && <p>No manager</p>}
                {(leads[department] || []).length > 0 && <div className="setup-pills">{(leads[department] || []).map((email, index) => {
                  const option = leadOptions.find((item) => item.value === email);
                  return <span key={email} className="setup-pill"><span>{option?.label.split(' · ')[0] || email}</span>{index === 0 && (leads[department] || []).length > 1 && <small>Primary</small>}<button type="button" onClick={() => removeLead(department, email)} aria-label={`Remove ${option?.label || email} as manager`}><X className="size-3" /></button></span>;
                })}</div>}
                <label className="setup-field">Add manager
                  <select value="" onChange={(event) => { if (event.target.value) addLead(department, event.target.value); }} aria-label={`Add manager for ${department}`}>
                    <option value="">{(leads[department] || []).length ? 'Add another manager' : 'Add manager (or assign later)'}</option>
                    {leadOptions.filter((item) => !(leads[department] || []).includes(item.value)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
              </div>
            </div>;
          })}</div>
          <div className="setup-facts">
            <span><strong>{offices.length || '—'}</strong> workplaces</span>
            <span><strong>{departmentNames.length}</strong> departments</span>
            <span><strong>{employmentTypes.length}</strong> employment types</span>
            <span><strong>{shifts.length}</strong> shifts</span>
            <span><strong>{people.length}</strong> people to invite</span>
            {state.license?.planName && <span><strong>{state.license.planName}</strong> license</span>}
          </div>
          <div className="setup-facts-detail">
            {employmentTypes.map((item) => <p key={item.id}><strong>{item.name}</strong>{item.hasBenefits ? ' · benefits' : ''}</p>)}
            {shifts.map((shift) => <p key={shift.id}><strong>{shift.name}</strong> · {shiftSummary(shift)}</p>)}
          </div>
          <div className="setup-next">
            <h3>What happens next</h3>
            <p>When you launch, invitations are sent to the people listed here. Then you can configure attendance, leave, payroll, and documents from the workspace.</p>
          </div>
          <div className="setup-workplace__footer">
            <button type="button" className="setup-button setup-button--secondary" onClick={() => setStep(4)}>Back</button>
            <button type="button" className="setup-button setup-button--primary" disabled={busy} onClick={launch}>{busy ? 'Launching…' : people.length ? 'Launch & send invitations' : 'Launch workspace'}<span aria-hidden="true">→</span></button>
          </div>
        </div>}
      </section>
    </main>
  </div>;
};
