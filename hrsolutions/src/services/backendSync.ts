import { api } from './apiClient';
import { AppState, normalizeTaskPriority, normalizeTaskStatus } from './store';
import { AuthService } from './authService';
import { Employee, Role, Task, TimesheetEntry } from '../types';
import { initialOrganization } from '../data/initialData';

function personaFromUser(meUser: any) {
  if (!meUser) return null;
  return {
    id: meUser.employeeId || meUser.id || meUser.sub || 'user',
    name: meUser.name || meUser.email || 'Administrator',
    email: meUser.email || '',
    role: (meUser.role || 'super_admin') as Role,
    designation: meUser.designation || 'Administrator',
    department: meUser.department || 'Operations',
    avatar: meUser.avatar || '',
  };
}

function personaFromSession() {
  const session = AuthService.getSession();
  if (!session) return null;
  return {
    id: session.sub,
    name: session.name || session.email || 'User',
    email: session.email || '',
    role: (session.role || 'employee') as Role,
    designation: session.role === 'super_admin' ? 'Founder & CEO' : 'Team Member',
    department: 'Operations',
    avatar: '',
  };
}

/** Build a display name; ignore the old setup-wizard placeholder last name "User". */
export function formatEmployeeDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  fallback?: string
): string {
  const first = String(firstName || '').trim();
  const last = String(lastName || '').trim();
  const realLast = last && last !== 'User' ? last : '';
  return `${first} ${realLast}`.trim() || fallback || '';
}

/** Parse JSONB / stringified JSON fields from identity API rows. */
function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return '';
}

function normalizeDateValue(value: unknown): string | undefined {
  const raw = pickString(value);
  if (!raw) return undefined;
  // Postgres DATE / ISO timestamps → YYYY-MM-DD for date inputs
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

/** Normalize identity API employee rows (snake_case or camelCase) into app Employee shape. */
export function mapApiEmployee(emp: any): Employee {
  const first = emp.firstName || emp.first_name || '';
  const last = emp.lastName || emp.last_name || '';
  const name =
    formatEmployeeDisplayName(first, last, emp.name || emp.email || 'Employee') ||
    emp.name ||
    emp.email ||
    'Employee';
  let accountStatus =
    emp.accountStatus || emp.account_status || (emp.is_activated === false ? 'Not Activated' : 'Active');
  // Backend login activates as "Active"; some UI paths historically wrote "Activated"
  if (accountStatus === 'Activated') accountStatus = 'Active';
  const isDeactivated =
    accountStatus === 'Deactivated' || accountStatus === 'Suspended' || accountStatus === 'Terminated';
  const isActivated =
    emp.isActivated !== undefined
      ? Boolean(emp.isActivated)
      : emp.is_activated !== undefined
        ? Boolean(emp.is_activated)
        : accountStatus !== 'Not Activated' && !isDeactivated;

  const emergencyRaw = parseJsonField<any>(emp.emergencyContact ?? emp.emergency_contact, null);
  const emergencyContact = {
    name: pickString(emergencyRaw?.name, emergencyRaw?.fullName, emergencyRaw?.full_name),
    relation: pickString(emergencyRaw?.relation, emergencyRaw?.relationship),
    phone: pickString(emergencyRaw?.phone, emergencyRaw?.mobile, emergencyRaw?.contact),
  };

  const bankFromNested = emp.bankDetails || emp.bank_details || {};
  const bankDetails = {
    accountNumber: pickString(
      bankFromNested.accountNumber,
      bankFromNested.account_number,
      emp.accountNumber,
      emp.account_number
    ),
    ifscCode: pickString(
      bankFromNested.ifscCode,
      bankFromNested.routingOrIfscCode,
      bankFromNested.routing_or_ifsc_code,
      emp.routingOrIfscCode,
      emp.routing_or_ifsc_code
    ),
    bankName: pickString(bankFromNested.bankName, bankFromNested.bank_name, emp.bankName, emp.bank_name),
    accountHolderName:
      pickString(
        bankFromNested.accountHolderName,
        bankFromNested.account_holder_name,
        emp.accountHolderName,
        emp.account_holder_name
      ) || undefined,
  };

  const customFieldValues = parseJsonField<Record<string, any>>(
    emp.customFieldValues ?? emp.custom_field_values,
    {}
  );
  const uploadedDocuments = parseJsonField<Employee['uploadedDocuments']>(
    emp.uploadedDocuments ?? emp.uploaded_documents,
    []
  );

  return {
    id: emp.id,
    employeeId: emp.employeeCode || emp.employee_code || emp.employeeId || '',
    name,
    email: emp.email || '',
    phone: emp.phone || '',
    department: emp.departmentName || emp.department_name || emp.department || 'Operations',
    designation: emp.jobTitle || emp.job_title || emp.designation || 'Team Member',
    location: emp.officeName || emp.office_name || emp.location || '',
    officeName: emp.officeName || emp.office_name || emp.location || '',
    officeId: emp.officeId || emp.office_id || undefined,
    officeIds: Array.isArray(emp.officeIds)
      ? emp.officeIds.map(String)
      : Array.isArray(emp.office_ids)
        ? emp.office_ids.map(String)
        : Array.isArray(emp.offices)
          ? emp.offices.map((o: any) => String(o.id)).filter(Boolean)
          : emp.officeId || emp.office_id
            ? [String(emp.officeId || emp.office_id)]
            : [],
    offices: Array.isArray(emp.offices)
      ? emp.offices.map((o: any) => ({
          id: String(o.id),
          name: String(o.name || ''),
          isPrimary: Boolean(o.isPrimary ?? o.is_primary),
        }))
      : undefined,
    team: emp.teamName || emp.team_name || emp.team || '',
    teamId: emp.teamId || emp.team_id || undefined,
    managerId: emp.reportingManagerId || emp.reporting_manager_id || emp.managerId || undefined,
    managerName: (() => {
      const raw =
        emp.reportingManagerName ||
        emp.reporting_manager_name ||
        emp.managerName ||
        emp.team_manager_name ||
        '';
      const cleaned = String(raw).trim();
      return cleaned || undefined;
    })(),
    lineManager: (() => {
      const mgrName = String(
        emp.reportingManagerName || emp.reporting_manager_name || emp.managerName || ''
      ).trim();
      if (!mgrName) return undefined;
      return {
        name: mgrName,
        username: `@${mgrName.toLowerCase().replace(/\s+/g, '')}`,
        avatar: '',
        designation: '',
      };
    })(),
    role: (emp.role || 'employee') as Role,
    status: emp.status || (accountStatus === 'Not Activated' ? 'Onboarding' : 'Active'),
    accountStatus: accountStatus as any,
    isActivated,
    isDeactivated,
    hasCompletedProfile:
      emp.hasCompletedProfile !== undefined
        ? Boolean(emp.hasCompletedProfile)
        : emp.has_completed_profile !== undefined
          ? Boolean(emp.has_completed_profile)
          : undefined,
    onboardingProgress:
      emp.onboardingProgress !== undefined && emp.onboardingProgress !== null
        ? Number(emp.onboardingProgress)
        : emp.onboarding_progress !== undefined && emp.onboarding_progress !== null
          ? Number(emp.onboarding_progress)
          : undefined,
    joiningDate: emp.dateOfJoining || emp.date_of_joining || emp.joiningDate || '',
    avatar: emp.avatar || emp.avatar_url || '',
    // Profile / onboarding fields persisted by PUT /identity/employees/:id
    dateOfBirth: normalizeDateValue(emp.dateOfBirth ?? emp.date_of_birth),
    gender: pickString(emp.gender) || undefined,
    bloodGroup: pickString(emp.bloodGroup, emp.blood_group) || undefined,
    maritalStatus: pickString(emp.maritalStatus, emp.marital_status) || undefined,
    nationality: pickString(emp.nationality) || undefined,
    primaryAddress: pickString(emp.primaryAddress, emp.primary_address) || undefined,
    city: pickString(emp.city) || undefined,
    stateProvince: pickString(emp.stateProvince, emp.state_province) || undefined,
    postalCode: pickString(emp.postalCode, emp.postal_code) || undefined,
    country: pickString(emp.country) || undefined,
    personalTaxId: pickString(emp.personalTaxId, emp.personal_tax_id) || undefined,
    socialInsurance: pickString(emp.socialInsurance, emp.social_insurance) || undefined,
    emergencyContact,
    bankDetails,
    customFieldValues,
    uploadedDocuments,
  } as Employee;
}

/** Normalize project_tasks API rows into app Task shape (snake_case or camelCase). */
export function mapApiTask(t: any): Task {
  const assigneeId = String(
    t.assignedToEmployeeId ||
      t.assigned_to_employee_id ||
      t.assigneeId ||
      t.assignee_id ||
      ''
  );
  const rawName = String(t.assignedToName || t.assigned_to_name || t.assigneeName || t.assignee_name || '').trim();
  // Ignore Postgres NULL concat artifacts like " " / "null null"
  const assigneeName =
    rawName && rawName.toLowerCase() !== 'null null' ? rawName.replace(/\s+/g, ' ').trim() : '';

  let subtasks: Task['subtasks'] = [];
  const descRaw = t.description;
  let description = typeof descRaw === 'string' ? descRaw : '';
  if (typeof descRaw === 'string' && descRaw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(descRaw);
      if (Array.isArray(parsed) && parsed.every((x) => x && typeof x === 'object' && 'title' in x)) {
        subtasks = parsed.map((st: any, idx: number) => ({
          id: String(st.id || `st_${idx}`),
          title: String(st.title || ''),
          completed: Boolean(st.completed),
        }));
        description = '';
      }
    } catch {
      /* plain description */
    }
  }

  const due =
    t.dueDate || t.due_date
      ? String(t.dueDate || t.due_date).slice(0, 10)
      : undefined;
  const start =
    t.startDate || t.start_date
      ? String(t.startDate || t.start_date).slice(0, 10)
      : undefined;

  return {
    id: String(t.id),
    taskKey: t.taskKey || t.task_key || undefined,
    issueType: (t.issueType || t.issue_type || 'Task') as Task['issueType'],
    projectId: t.projectId || t.project_id || '',
    projectName: t.projectName || t.project_name || 'General',
    title: t.title || 'Untitled task',
    description,
    assigneeId,
    assigneeName: assigneeName || (assigneeId ? 'Team Member' : 'Unassigned'),
    assigneeAvatar: t.assigneeAvatar || t.assignee_avatar || '',
    reporterName: t.reporterName || t.reporter_name || undefined,
    priority: normalizeTaskPriority(t.priority),
    status: normalizeTaskStatus(t.status),
    startDate: start,
    dueDate: due,
    estimatedHours: t.estimatedHours != null ? Number(t.estimatedHours) : t.estimated_hours != null ? Number(t.estimated_hours) : undefined,
    actualHours: Number(t.actualHours ?? t.actual_hours ?? 0) || 0,
    timeSpentSeconds: Number(t.timeSpentSeconds ?? t.time_spent_seconds ?? 0) || 0,
    isTimerRunning: Boolean(t.isTimerRunning ?? t.is_timer_running),
    tags: Array.isArray(t.tags) ? t.tags : [],
    subtasks,
    commentsCount: Number(t.commentsCount ?? t.comments_count ?? 0) || 0,
    attachedDocIds: Array.isArray(t.attachedDocIds)
      ? t.attachedDocIds
      : Array.isArray(t.attached_doc_ids)
        ? t.attached_doc_ids
        : [],
  };
}

function mapTimesheetStatus(raw: unknown): TimesheetEntry['status'] {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'approved') return 'Approved';
  if (s === 'rejected') return 'Rejected';
  if (s === 'draft') return 'Draft';
  if (s === 'review') return 'Review';
  if (s.includes('regular')) return 'Pending Regularization';
  return 'Submitted';
}

/** Normalize timesheets API rows into app TimesheetEntry shape. */
export function mapApiTimesheet(ts: any): TimesheetEntry {
  const entryRaw = String(ts.entry_type || ts.entryType || 'task').toLowerCase();
  const entryType: 'task' | 'schedule' =
    entryRaw === 'schedule' || entryRaw === 'meeting' ? 'schedule' : 'task';
  const categoryRaw = String(ts.category || '').trim();
  const category = (categoryRaw ||
    (entryType === 'schedule' ? 'Meeting' : 'Development')) as TimesheetEntry['category'];

  return {
    id: String(ts.id),
    employeeId: String(ts.employee_id || ts.employeeId || ''),
    employeeName: String(ts.employee_name || ts.employeeName || ''),
    projectId: String(ts.project_id || ts.projectId || ''),
    projectName: String(ts.project_name || ts.projectName || ''),
    taskId: String(ts.task_id || ts.taskId || ''),
    taskTitle: String(ts.title || ts.task_title || ts.taskTitle || ts.description || 'Activity'),
    date: String(ts.work_date || ts.date || '').split('T')[0] || new Date().toISOString().split('T')[0],
    startTime: ts.start_time || ts.startTime || undefined,
    endTime: ts.end_time || ts.endTime || undefined,
    hours: Number(ts.hours_spent ?? ts.hours) || 0,
    billable: ts.billable === undefined ? true : Boolean(ts.billable),
    category,
    description: String(ts.description || ''),
    status: mapTimesheetStatus(ts.status),
    approvedBy: ts.approver_id || ts.approvedBy || undefined,
    entryType,
    meetingLink: ts.meeting_link || ts.meetingLink || undefined,
  };
}

/** Map a tenant office row into the client organization.officeLocation shape. */
function officeRowToLocation(office: any): {
  address: string;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
} | null {
  if (!office) return null;
  const lat = Number(office.latitude);
  const lng = Number(office.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;
  const radius = Number(office.geofence_radius_meters ?? office.geofenceRadiusMeters);
  return {
    address: String(office.address || office.name || '').trim(),
    latitude: lat,
    longitude: lng,
    allowedRadiusMeters: Number.isFinite(radius) && radius > 0 ? radius : 250,
  };
}

/** Map a tenant office row into OfficeLocationRecord for punch geofencing. */
function officeRowToRecord(office: any): {
  id: string;
  name: string;
  code?: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  timezone?: string;
  isActive?: boolean;
} | null {
  if (!office?.id) return null;
  const lat = Number(office.latitude);
  const lng = Number(office.longitude);
  const radius = Number(office.geofence_radius_meters ?? office.geofenceRadiusMeters);
  return {
    id: String(office.id),
    name: String(office.name || '').trim(),
    code: office.code ? String(office.code) : undefined,
    address: String(office.address || office.name || '').trim(),
    latitude: Number.isFinite(lat) ? lat : 0,
    longitude: Number.isFinite(lng) ? lng : 0,
    radiusMeters: Number.isFinite(radius) && radius > 0 ? radius : 250,
    timezone: office.timezone ? String(office.timezone) : undefined,
    isActive: office.is_active !== false && office.isActive !== false,
  };
}

export async function syncBackendDataToState(currentState: AppState): Promise<Partial<AppState>> {
  const token = api.getToken();
  if (!token) {
    return {};
  }
  const updates: Partial<AppState> = {};
  // Only mark authenticated when a token is still present (guards logout races)
  if (api.getToken()) {
    updates.isAuthenticated = true;
  }

  updates.customOptions = { ...(currentState.customOptions || ({} as any)) };
  /** Primary office GPS hydrated from /org/offices — localStorage does not keep this. */
  let syncedOfficeLocation: ReturnType<typeof officeRowToLocation> = null;

  // Fan out independent GETs in parallel; merge below preserves prior field semantics.
  const [notifSettled, orgSettled, holSettled, empSettled, meSettled] = await Promise.allSettled([
    api.auditComms.getNotifications(),
    Promise.all([
      api.org.getOffices(),
      api.org.getDepartments(),
      api.org.getJobRoles(),
      api.org.getTeams().catch(() => ({ success: false, data: null })),
      api.setup.getSettings().catch(() => ({ success: false, data: null })),
    ]),
    api.attendance.getHolidays(),
    api.identity.getEmployees(),
    api.auth.me().catch(() => ({ success: false, data: null })),
  ]);

  // Notifications
  try {
    if (notifSettled.status === 'fulfilled') {
      const notifRes = notifSettled.value;
      if (notifRes.success && Array.isArray(notifRes.data)) {
        updates.notifications = notifRes.data.map((n: any) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          timestamp: n.created_at || 'Just now',
          category: (n.category || 'System') as any,
          priority: (n.priority || 'medium') as any,
          read: n.is_read ?? false,
        }));
      }
    } else {
      console.debug('[BackendSync] Notifications sync fallback:', notifSettled.reason);
    }
  } catch (e) {
    console.debug('[BackendSync] Notifications sync fallback:', e);
  }

  // Org metadata
  try {
    if (orgSettled.status === 'fulfilled') {
      const [officesRes, deptsRes, rolesRes, teamsRes, settingsRes] = orgSettled.value;

      if (officesRes.success && Array.isArray(officesRes.data)) {
        updates.customOptions!.offices = officesRes.data.map((o: any) => o.name).filter(Boolean);
        const officeRecords = officesRes.data
          .map((row: any) => officeRowToRecord(row))
          .filter(Boolean) as NonNullable<ReturnType<typeof officeRowToRecord>>[];
        (updates.customOptions as any).officeRecords = officeRecords;
        // Legacy primary officeLocation for older UI — first office with valid coords
        for (const row of officesRes.data) {
          syncedOfficeLocation = officeRowToLocation(row);
          if (syncedOfficeLocation) break;
        }
      }
      if (deptsRes.success && Array.isArray(deptsRes.data)) {
        updates.customOptions!.departments = deptsRes.data.map((d: any) => d.name).filter(Boolean);
      }
      if (rolesRes.success && Array.isArray(rolesRes.data)) {
        updates.customOptions!.designations = rolesRes.data.map((r: any) => r.title).filter(Boolean);
      }
      if ((teamsRes as any).success && Array.isArray((teamsRes as any).data)) {
        const teamRows = (teamsRes as any).data as any[];
        updates.customOptions!.teams = teamRows.map((t) => t.name).filter(Boolean);
        (updates.customOptions as any).teamRecords = teamRows.map((t) => ({
          id: t.id,
          name: t.name,
          departmentId: t.department_id || t.departmentId,
          departmentName: t.department_name || t.departmentName,
          leadEmployeeId: t.lead_employee_id || t.leadEmployeeId || t.lead_id || null,
          leadName: String(t.lead_name || '').trim() || null,
        }));
      }

      const settings = (settingsRes as any)?.success ? (settingsRes as any).data || {} : {};
      const employment = settings['employment-types'] || {};
      if (Array.isArray(employment.employmentTypes)) {
        updates.customOptions!.employmentTypeCategories = employment.employmentTypes;
        updates.customOptions!.employmentTypes = employment.employmentTypes
          .map((et: any) => (typeof et === 'string' ? et : et.name))
          .filter(Boolean);
      }
      const onboarding = settings['onboarding-fields'] || {};
      if (Array.isArray(onboarding.fields)) {
        updates.customOptions!.onboardingFields = onboarding.fields;
      }
      const general = settings.general || {};
      for (const key of [
        'defaultInitialPassword',
        'forcePasswordReset',
        'teams',
        'employmentTypeCategories',
        'employmentTypes',
        'onboardingFields',
        'employeeIdSettings',
        'profileSelfServiceSettings',
        'noticePeriodSettings',
        'offboardingSettings',
        'probationSettings',
      ] as const) {
        if (general[key] !== undefined) (updates.customOptions as any)[key] = general[key];
      }
      const payroll = settings.payroll || {};
      if (payroll.payrollGroups) updates.customOptions!.payrollGroups = payroll.payrollGroups;
      Object.assign(updates.customOptions!, {
        ...(payroll.salaryComponents ? { salaryComponents: payroll.salaryComponents } : {}),
        ...(payroll.taxSlabs ? { taxSlabs: payroll.taxSlabs } : {}),
        ...(payroll.payrollSettings ? { payrollSettings: payroll.payrollSettings } : {}),
      });
      const attendance = settings.attendance || {};
      for (const key of [
        'shifts',
        'academicBatches',
        'attendancePolicies',
        'attendanceSettings',
        'leaveSettings',
        'probationSettings',
        'academicSettings',
        'reportSettings',
        'employeeShiftAssignments',
        'employeeRosterMatrix',
      ] as const) {
        if (attendance[key] !== undefined) (updates.customOptions as any)[key] = attendance[key];
      }

      // Merge per-office geofence status from attendance settings into officeRecords
      const policies =
        (updates.customOptions as any)?.attendanceSettings?.officeGeofencePolicies ||
        attendance?.attendanceSettings?.officeGeofencePolicies;
      if (Array.isArray(policies) && Array.isArray((updates.customOptions as any).officeRecords)) {
        (updates.customOptions as any).officeRecords = (
          (updates.customOptions as any).officeRecords as any[]
        ).map((rec) => {
          const match = policies.find(
            (p: any) =>
              p &&
              (p.id === rec.id ||
                String(p.name || '').trim().toLowerCase() === String(rec.name || '').trim().toLowerCase())
          );
          if (!match) return rec;
          return {
            ...rec,
            geofencingStatus: match.geofencingStatus || rec.geofencingStatus,
            radiusMeters:
              Number(match.radiusMeters) > 0 ? Number(match.radiusMeters) : rec.radiusMeters,
            address: match.address || rec.address,
          };
        });
      }
    } else {
      console.debug('[BackendSync] Org metadata sync fallback:', orgSettled.reason);
    }
  } catch (e) {
    console.debug('[BackendSync] Org metadata sync fallback:', e);
  }

  // Company holidays calendar
  try {
    if (holSettled.status === 'fulfilled') {
      const holRes = holSettled.value;
      if (holRes.success && Array.isArray(holRes.data)) {
        updates.customOptions!.holidays = holRes.data.map((h: any) => ({
          id: h.id,
          name: h.name,
          date: String(h.date || '').slice(0, 10),
          year: Number(h.year) || Number(String(h.date || '').slice(0, 4)),
          dayOfWeek: h.dayOfWeek || h.day_of_week || '',
          isApproved: h.isApproved !== false && h.is_approved !== false,
        }));
      }
    } else {
      console.debug('[BackendSync] Holidays sync fallback:', holSettled.reason);
    }
  } catch (e) {
    console.debug('[BackendSync] Holidays sync fallback:', e);
  }

  // Employees — mapped after org so shift/roster settings from this sync are applied
  try {
    if (empSettled.status === 'fulfilled') {
      const empRes = empSettled.value;
      if (empRes.success && Array.isArray(empRes.data)) {
        const mapped = empRes.data.map(mapApiEmployee);
        const assignments =
          updates.customOptions?.employeeShiftAssignments ||
          currentState.customOptions?.employeeShiftAssignments ||
          {};
        const rosterMatrix =
          updates.customOptions?.employeeRosterMatrix ||
          currentState.customOptions?.employeeRosterMatrix ||
          {};
        const shifts =
          updates.customOptions?.shifts || currentState.customOptions?.shifts || [];
        const shiftById = new Map(shifts.map((s: any) => [s.id, s]));

        updates.employees = mapped.map((emp) => {
          const assignedShiftId = assignments[emp.id];
          const targetShift = assignedShiftId ? shiftById.get(assignedShiftId) : undefined;
          const rosterSchedule = rosterMatrix[emp.id];
          if (!targetShift && !rosterSchedule) return emp;
          return {
            ...emp,
            ...(targetShift
              ? {
                  shiftId: targetShift.id,
                  shiftTiming: {
                    shiftId: targetShift.id,
                    shiftName: targetShift.name,
                    startTime: targetShift.startTime || 'Flexible',
                    endTime: targetShift.endTime || 'Flexible',
                    graceMinutes: targetShift.gracePeriodMinutes || 0,
                    isHourlyShift: Boolean(targetShift.isHourlyShift),
                    hourlyRate: (emp as any).hourlyRate || targetShift.hourlyRate || 650,
                  },
                  rosterShiftId: targetShift.id,
                }
              : {}),
            ...(rosterSchedule ? { rosterSchedule } : {}),
          };
        });
      } else {
        console.warn(
          '[BackendSync] getEmployees failed:',
          empRes.error?.message || empRes.error || empRes
        );
      }
    } else {
      console.warn('[BackendSync] getEmployees threw:', empSettled.reason);
    }
  } catch (e) {
    console.warn('[BackendSync] getEmployees threw:', e);
  }

  // Persona + onboarding from /me
  try {
    const meRes =
      meSettled.status === 'fulfilled'
        ? meSettled.value
        : { success: false, data: null };
    if (meSettled.status === 'rejected') {
      console.debug('[BackendSync] /me sync fallback:', meSettled.reason);
    }

    const onboardingStatus =
      (meRes as any)?.data?.user?.onboardingStatus ||
      (meRes as any)?.data?.user?.onboarding_status ||
      null;
    if (onboardingStatus) {
      const normalized = String(onboardingStatus).trim().toUpperCase();
      const known = [
        'NOT_STARTED',
        'PENDING',
        'OFFICE_SETUP',
        'DEPARTMENTS_SETUP',
        'ROLES_SETUP',
        'TEAM_SETUP',
        'COMPLETED',
      ];
      const safeStatus = known.includes(normalized)
        ? normalized === 'PENDING'
          ? 'NOT_STARTED'
          : normalized
        : 'NOT_STARTED';
      if (typeof document !== 'undefined') {
        document.cookie = `BOS_ONBOARDING_STATUS=${encodeURIComponent(safeStatus)}; path=/; max-age=86400; SameSite=Lax`;
      }
      (updates as any).onboardingStatus = safeStatus;
    }

    const meUser = (meRes as any)?.data?.user;
    const meTenant = (meRes as any)?.data?.tenant;
    // Keep workspace name consistent for every account — hydrate from live tenant record.
    if (meTenant && (meTenant.name || meTenant.slug || meTenant.industry)) {
      const baseOrg = currentState.organization || initialOrganization;
      updates.organization = {
        ...baseOrg,
        ...(meTenant.name ? { name: String(meTenant.name) } : {}),
        ...(meTenant.slug ? { domain: String(meTenant.slug) } : {}),
        ...(meTenant.industry ? { industry: String(meTenant.industry) } : {}),
        ...(syncedOfficeLocation ? { officeLocation: syncedOfficeLocation } : {}),
      };
    } else if (syncedOfficeLocation) {
      updates.organization = {
        ...(currentState.organization || initialOrganization),
        officeLocation: syncedOfficeLocation,
      };
    }
    const fromMe = personaFromUser(meUser);
    const fromSession = personaFromSession();
    const roster = (updates.employees || currentState.employees || []) as Employee[];
    const meId = String(meUser?.employeeId || meUser?.id || fromMe?.id || '');
    const meEmail = String(meUser?.email || fromMe?.email || '').toLowerCase();
    const rosterMatch = roster.find(
      (emp) =>
        (meId && String(emp.id) === meId) ||
        (meEmail && emp.email?.toLowerCase() === meEmail)
    );
    const rosterAvatar = rosterMatch?.avatar || '';
    if (fromMe) {
      updates.currentPersona = {
        ...(currentState.currentPersona || {}),
        ...fromMe,
        name: fromMe.name || currentState.currentPersona?.name || fromSession?.name || '',
        avatar: fromMe.avatar || rosterAvatar || currentState.currentPersona?.avatar || '',
      };
    } else if (!currentState.currentPersona && fromSession) {
      updates.currentPersona = {
        ...fromSession,
        avatar: rosterAvatar || fromSession.avatar || '',
      };
    } else if (currentState.currentPersona && rosterAvatar && !currentState.currentPersona.avatar) {
      updates.currentPersona = {
        ...currentState.currentPersona,
        avatar: rosterAvatar,
      };
    }

    // Stamp /me profile-completion flags onto the matched roster row so AppShell
    // gates stay aligned with auth even if list mapping is briefly stale.
    const meHasCompleted =
      meUser?.hasCompletedProfile === true || meUser?.has_completed_profile === true;
    const meProgressRaw = meUser?.onboardingProgress ?? meUser?.onboarding_progress;
    const meProgress =
      typeof meProgressRaw === 'number' ? meProgressRaw : Number(meProgressRaw);
    if (
      updates.employees &&
      Array.isArray(updates.employees) &&
      (meHasCompleted || meProgress >= 100)
    ) {
      const stampId = String(meUser?.employeeId || meUser?.id || '');
      const stampEmail = String(meUser?.email || '').toLowerCase();
      updates.employees = updates.employees.map((emp) => {
        const match =
          (stampId && String(emp.id) === stampId) ||
          (stampEmail && emp.email?.toLowerCase() === stampEmail);
        if (!match) return emp;
        return {
          ...emp,
          hasCompletedProfile: true,
          onboardingProgress: 100,
          isActivated: true,
          accountStatus: emp.accountStatus === 'Not Activated' ? 'Active' : emp.accountStatus,
          status: emp.status === 'Onboarding' ? 'Active' : emp.status,
        };
      });
    }
  } catch (e) {
    console.debug('[BackendSync] /me sync fallback:', e);
    if (!currentState.currentPersona) {
      const fromSession = personaFromSession();
      if (fromSession) updates.currentPersona = fromSession;
    }
  }

  // Drop auth flags if credentials were cleared while requests were in flight
  if (!api.getToken()) {
    delete updates.isAuthenticated;
    delete updates.currentPersona;
  }

  // Guarantee office GPS lands even if /me merge above was skipped or failed.
  if (syncedOfficeLocation) {
    updates.organization = {
      ...(updates.organization || currentState.organization || initialOrganization),
      officeLocation: syncedOfficeLocation,
    };
  }

  return updates;
}
