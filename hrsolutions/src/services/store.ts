import {
  Organization,
  Employee,
  AttendanceRecord,
  AttendanceRegularization,
  LeaveRequest,
  TimesheetEntry,
  ProjectNote,
  PayrollRecord,
  ExpenseClaim,
  Project,
  Task,
  Lead,
  Customer,
  Deal,
  Invoice,
  InventoryItem,
  SupportTicket,
  ChatChannel,
  ChatMessage,
  CommunityPost,
  Meeting,
  DriveItem,
  WorkflowRule,
  AuditLogItem,
  NotificationItem,
  UserPersona,
  Role,
  CustomizableOptions,
  Announcement,
  Student,
  DepartmentName,
} from '../types';

import {
  initialOrganization,
  initialEmployees,
  initialAttendance,
  generateInitialAttendance,
  initialRegularizations,
  initialLeaves,
  initialProjects,
  initialTasks,
  initialTimesheets,
  initialLeads,
  initialCustomers,
  initialDeals,
  initialInvoices,
  initialInventory,
  initialTickets,
  initialChannels,
  initialMessages,
  initialCommunityPosts,
  initialAnnouncements,
  initialMeetings,
  initialDriveItems,
  initialWorkflowRules,
  initialAuditLogs,
  initialNotifications,
  initialCustomizableOptions,
  initialStudents,
  DEFAULT_AVATAR,
} from '../data/initialData';

const STORAGE_KEY = 'PIXBE_BOS_STATE_V1';
export const DISABLE_LOCAL_STORAGE =
  typeof process !== 'undefined' &&
  (process.env.NEXT_PUBLIC_DISABLE_LOCAL_STORAGE === 'true' ||
   process.env.NODE_ENV === 'test' ||
   Boolean(process.env.PLAYWRIGHT_TEST));

export interface AppState {
  isAuthenticated: boolean;
  currentPersona: UserPersona | null;
  activeModule: string;
  notifications: NotificationItem[];
  customOptions: CustomizableOptions;

  // --- DYNAMIC DATA: Business data is now fetched at the component/page level ---
  // The index signature prevents TypeScript compilation errors in legacy 2k+ line God modules
  // while enforcing that AppState structure is fundamentally just UI state.
  [key: string]: any;
}

export const initialProjectNotes: ProjectNote[] = [];

/** Cookie/storage presence markers are not usable JWTs (see apiClient isPresenceMarker). */
const isAuthPresenceMarker = (value: string | null | undefined): boolean => {
  if (!value) return true;
  const v = value.trim();
  return v === '1' || v === 'true' || v === 'present';
};

const isUsableStoredToken = (value: string | null | undefined): boolean => {
  if (!value || isAuthPresenceMarker(value)) return false;
  try {
    return Boolean(decodeURIComponent(value));
  } catch {
    return Boolean(value);
  }
};

/** True only when a real auth credential exists — never trust PIXBE.isAuthenticated alone. */
export const hasStoredAuthCredential = (): boolean => {
  if (typeof window === 'undefined') return false;
  const mem = (window as any).__BOS_AUTH_TOKEN__;
  if (typeof mem === 'string' && isUsableStoredToken(mem)) return true;
  try {
    // Only BOS_AUTH_TOKEN can hold a JWT. BOS_AUTH is always a presence marker ("1").
    const cookieToken = document.cookie
      .split('; ')
      .find((row) => row.startsWith('BOS_AUTH_TOKEN='))
      ?.split('=')
      .slice(1)
      .join('=');
    if (isUsableStoredToken(cookieToken)) return true;
  } catch (_) {}
  try {
    if (isUsableStoredToken(sessionStorage.getItem('BOS_AUTH_TOKEN'))) return true;
    const sessionRaw = sessionStorage.getItem('BOS_AUTH_SESSION');
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw);
      if (isUsableStoredToken(session?.token)) return true;
    }
  } catch (_) {}
  if (!DISABLE_LOCAL_STORAGE) {
    try {
      if (isUsableStoredToken(localStorage.getItem('BOS_AUTH_TOKEN'))) return true;
      const sessionRaw = localStorage.getItem('BOS_AUTH_SESSION');
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        if (isUsableStoredToken(session?.token)) return true;
      }
    } catch (_) {}
  }
  return false;
};

export const getDefaultState = (): AppState => {
  const hasAuthToken = hasStoredAuthCredential();

  return {
    isAuthenticated: hasAuthToken,
    currentPersona: null,
    activeModule: 'dashboard',
    notifications: [],
    organization: { ...initialOrganization },
    // Business collections are never persisted in localStorage — always start empty
    // so UI code can safely call .map/.find/.forEach before backend sync fills them.
    employees: [],
    projects: [],
    tasks: [],
    leaves: [],
    timesheets: [],
    payrolls: [],
    students: [],
    attendance: [],
    auditLogs: [],
    customOptions: {
      ...initialCustomizableOptions,
      academicBatches: [],
      departments: [],
      teams: [],
      offices: [],
      designations: [],
      employmentTypes: ['Full-time', 'Contract', 'Part-time', 'Intern'],
    },
  };
};

export const isTestEntity = (str?: string): boolean => {
  return false;
};

export const normalizeTaskStatus = (raw?: any): Task['status'] => {
  if (!raw) return 'To Do';
  const clean = String(raw).toLowerCase().trim().replace(/[\s_-]+/g, '');
  if (clean === 'todo' || clean === 'backlog') return 'To Do';
  if (clean === 'inprogress' || clean === 'ongoing' || clean === 'doing') return 'In Progress';
  if (clean === 'review' || clean === 'inreview' || clean === 'testing') return 'Review';
  if (clean === 'completed' || clean === 'done' || clean === 'approved' || clean === 'finished') return 'Completed';
  return 'To Do';
};

export const normalizeTaskPriority = (raw?: any): Task['priority'] => {
  if (!raw) return 'Medium';
  const clean = String(raw).toLowerCase().trim();
  if (clean === 'low') return 'Low';
  if (clean === 'high') return 'High';
  if (clean === 'urgent') return 'Urgent';
  return 'Medium';
};

export const loadStoredState = (): AppState => {
  if (typeof window !== 'undefined') {
    try {
      // One-time cleanup of legacy domain-state dumps
      localStorage.removeItem('ACME_BOS_STATE_FRESH_V1');
    } catch (_) {}
  }

  if (DISABLE_LOCAL_STORAGE) {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (_) {}
    }
    return getDefaultState();
  }
  try {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const resolvedAuth = hasStoredAuthCredential();
        const defaults = getDefaultState();
        const storedToggles = parsed?.customOptions?.featureToggles;

        // Rewrite storage to UI-only shape (strip employees/persona/notifications/etc.)
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              activeModule: typeof parsed.activeModule === 'string' ? parsed.activeModule : 'dashboard',
              customOptions: {
                featureToggles: storedToggles || undefined,
              },
            })
          );
        } catch (_) {}

        return {
          ...defaults,
          activeModule: typeof parsed.activeModule === 'string' ? parsed.activeModule : defaults.activeModule,
          isAuthenticated: resolvedAuth,
          currentPersona: null,
          notifications: [],
          employees: [],
          projects: [],
          tasks: [],
          leaves: [],
          timesheets: [],
          payrolls: [],
          students: [],
          attendance: [],
          auditLogs: [],
          customOptions: {
            ...defaults.customOptions,
            featureToggles: {
              ...defaults.customOptions.featureToggles,
              ...(storedToggles && typeof storedToggles === 'object' ? storedToggles : {}),
            },
          },
        };
      }
    }
  } catch (e) {
    console.warn('Failed to load UI state from localStorage:', e);
  }
  return getDefaultState();
};

export const saveStoredState = (state: AppState) => {
  if (DISABLE_LOCAL_STORAGE) return;
  try {
    if (typeof window !== 'undefined') {
      // Persist only UI preferences — never domain data, persona, or notifications.
      const uiStateOnly = {
        activeModule: state.activeModule,
        customOptions: {
          featureToggles: state.customOptions?.featureToggles,
        },
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(uiStateOnly));
    }
  } catch (e) {
    console.warn('Failed to save UI state to localStorage:', e);
  }
};
