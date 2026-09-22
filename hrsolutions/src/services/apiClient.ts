/**
 * Production-Grade Backend API Client for Enterprise BOS / HR Solutions
 * Communicates with the Schema-per-Tenant Node.js / Express Backend
 */

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

import { API_CONFIG } from '@/config/constants';
import { DISABLE_LOCAL_STORAGE } from './store';

export class ApiClientError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.details = details;
  }
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private tenantId: string = '';
  /** Coalesce identical in-flight GETs so dashboard/HR/attendance hooks don't stampede the API. */
  private inflightGets = new Map<string, Promise<any>>();

  constructor() {
    this.baseUrl = API_CONFIG.BASE_URL;
    this.token = null;
    this.tenantId = '';
  }

  private coalesceGet<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inflightGets.get(key);
    if (existing) return existing as Promise<T>;
    const promise = factory().finally(() => {
      if (this.inflightGets.get(key) === promise) {
        this.inflightGets.delete(key);
      }
    });
    this.inflightGets.set(key, promise);
    return promise;
  }

  private readStorageToken(key: string): string {
    try {
      const sessionVal = sessionStorage.getItem(key);
      if (sessionVal && sessionVal !== 'null' && sessionVal !== 'undefined') return sessionVal;
    } catch (_) {}
    if (!DISABLE_LOCAL_STORAGE) {
      try {
        const localVal = localStorage.getItem(key);
        if (localVal && localVal !== 'null' && localVal !== 'undefined') return localVal;
      } catch (_) {}
    }
    return '';
  }

  private readCookieValue(name: string): string {
    if (typeof document === 'undefined') return '';
    const cookieVal = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${name}=`))
      ?.split('=')[1];
    return cookieVal ? decodeURIComponent(cookieVal) : '';
  }

  private writeCookie(name: string, value: string, persist: boolean) {
    if (typeof document === 'undefined') return;
    const maxAge = persist ? '; max-age=86400' : '';
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/${maxAge}; SameSite=Lax`;
  }

  private expireCookie(name: string) {
    if (typeof document === 'undefined') return;
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  }

  private writeBrowserStorage(key: string, value: string, persist: boolean) {
    try {
      if (persist) {
        if (!DISABLE_LOCAL_STORAGE) localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        if (!DISABLE_LOCAL_STORAGE) localStorage.removeItem(key);
      }
    } catch (_) {}
  }

  private removeBrowserStorage(key: string) {
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
    if (!DISABLE_LOCAL_STORAGE) {
      try {
        localStorage.removeItem(key);
      } catch (_) {}
    }
  }

  public getTenantId(): string {
    if (typeof window !== 'undefined') {
      if ((window as any).__BOS_TENANT_ID__) {
        this.tenantId = (window as any).__BOS_TENANT_ID__;
        return this.tenantId;
      }
      const cookieVal = this.readCookieValue('BOS_TENANT_ID');
      if (cookieVal) {
        this.tenantId = cookieVal;
        return cookieVal;
      }
      try {
        const stored = this.readStorageToken('BOS_TENANT_ID');
        if (stored) {
          this.tenantId = stored;
          return stored;
        }
        const sessionRaw = this.readStorageToken('BOS_AUTH_SESSION');
        if (sessionRaw) {
          const session = JSON.parse(sessionRaw);
          if (session.tenantId) {
            this.tenantId = session.tenantId;
            return session.tenantId;
          }
        }
      } catch (_) {}
      this.tenantId = '';
      return '';
    }
    return this.tenantId || '';
  }

  public getToken(): string {
    if (typeof window !== 'undefined') {
      if ((window as any).__BOS_AUTH_TOKEN__) {
        this.token = (window as any).__BOS_AUTH_TOKEN__;
        return this.token;
      }
      const cookieVal = this.readCookieValue('BOS_AUTH_TOKEN');
      if (cookieVal) {
        this.token = cookieVal;
        return cookieVal;
      }
      try {
        const storedToken = this.readStorageToken('BOS_AUTH_TOKEN');
        if (storedToken) {
          this.token = storedToken;
          return storedToken;
        }
        const sessionRaw = this.readStorageToken('BOS_AUTH_SESSION');
        if (sessionRaw) {
          const session = JSON.parse(sessionRaw);
          if (session.token) {
            this.token = session.token;
            if (session.tenantId) this.tenantId = session.tenantId;
            return session.token;
          }
        }
      } catch (_) {}
      this.token = null;
      return '';
    }

    return this.token || '';
  }

  /**
   * Persist auth credentials.
   * persist=true (Remember Me): localStorage + 24h cookie
   * persist=false: sessionStorage + session cookie (cleared when browser closes)
   */
  public setAuth(token: string, tenantId?: string, options?: { persist?: boolean }) {
    const persist = options?.persist !== false;
    this.token = token;
    if (tenantId) this.tenantId = tenantId;

    this.writeCookie('BOS_AUTH_TOKEN', token, persist);
    if (tenantId) {
      this.writeCookie('BOS_TENANT_ID', tenantId, persist);
    }

    if (typeof window !== 'undefined') {
      (window as any).__BOS_AUTH_TOKEN__ = token;
      if (tenantId) (window as any).__BOS_TENANT_ID__ = tenantId;
      this.writeBrowserStorage('BOS_AUTH_TOKEN', token, persist);
      if (tenantId) this.writeBrowserStorage('BOS_TENANT_ID', tenantId, persist);
    }
  }

  public clearAuth() {
    this.token = null;
    this.tenantId = '';
    this.expireCookie('BOS_AUTH_TOKEN');
    this.expireCookie('BOS_TENANT_ID');
    this.expireCookie('BOS_AUTH_SESSION');
    this.expireCookie('BOS_ONBOARDING_STATUS');
    if (typeof window !== 'undefined') {
      delete (window as any).__BOS_AUTH_TOKEN__;
      delete (window as any).__BOS_TENANT_ID__;
      delete (window as any).__BOS_AUTH_SESSION__;
      this.removeBrowserStorage('BOS_AUTH_TOKEN');
      this.removeBrowserStorage('BOS_TENANT_ID');
      this.removeBrowserStorage('BOS_AUTH_SESSION');
      this.removeBrowserStorage('BOS_STUDENT_AUTH');
    }
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers as Record<string, string> || {}),
    };

    const activeToken = this.getToken();
    const activeTenantId = this.getTenantId();

    if (activeToken) {
      headers['Authorization'] = `Bearer ${activeToken}`;
    }
    if (activeTenantId) {
      headers['X-Tenant-ID'] = activeTenantId;
    }

    const controller = new AbortController();
    // Tenant registration can create a Cognito user and an isolated database
    // schema. Three seconds guarantees an abort on a healthy but busy API,
    // which previously caused the UI to write a misleading local-only state.
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data: ApiResponse<T>;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new ApiClientError(
          'NON_JSON_RESPONSE',
          `Server returned non-JSON response (${response.status})`,
          text.slice(0, 100)
        );
      }

      if (!response.ok || !data.success) {
        throw new ApiClientError(
          data.error?.code || `HTTP_${response.status}`,
          data.error?.message || `HTTP ${response.status}: Request failed`,
          data.error?.details
        );
      }

      return data;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error instanceof ApiClientError) {
        throw error;
      }
      // Only warn if not an ECONNREFUSED / non-json offline response
      if (!error.message?.includes('ECONNREFUSED') && !error.message?.includes('non-JSON')) {
        console.warn(`[ApiClient] Request to ${endpoint} failed:`, error.message || error);
      }
      throw new ApiClientError(
        'FETCH_ERROR',
        error.name === 'AbortError' ? 'Network connection timed out' : (error.message || 'Network request failed')
      );
    }
  }

  // =========================================================================
  // 0. AUTHENTICATION API (Public Login, Register & Session verification)
  // =========================================================================
  public auth = {
    login: (payload: { email: string; password: string }) =>
      this.request<{
        token: string;
        tenant: { id: string; slug: string; name: string; schema: string };
        user: { id: string; name: string; email: string; role: string; department?: string; designation?: string; avatar?: string };
      }>('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),

    studentLogin: (payload: { identifier?: string; email?: string; password: string; tenantSlug?: string }) =>
      this.request<{
        token: string;
        tenant: { id: string; slug: string; name: string; schema: string; industry?: string };
        user: {
          id: string;
          sub?: string;
          name: string;
          email: string;
          role: string;
          department?: string;
          designation?: string;
          avatar?: string;
          rollNumber?: string;
          studentId?: string;
        };
      }>('/auth/student-login', { method: 'POST', body: JSON.stringify(payload) }),

    register: (payload: {
      companyName: string;
      slug?: string;
      domain?: string;
      industry?: string;
      size?: string;
      adminName: string;
      adminEmail: string;
      adminPassword: string;
      contactPhone?: string;
      designation?: string;
      adminRoleTitle?: string;
      }) =>
        this.request<{
          token: string;
          tenant: { id: string; slug: string; name: string; schema: string };
          user: { id: string; name: string; email: string; role: string; department?: string; designation?: string };
        }>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

    me: () => this.request('/auth/me', { method: 'GET' }),

    resetPassword: (payload: { email: string; newPassword: string }) =>
      this.request<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  };

  // =========================================================================
  // 1. CONTROL PLANE API (Master Admin Only — no tenant header required)
  // =========================================================================
  public controlPlane = {
    registerTenant: (payload: {
      slug: string;
      name: string;
      adminEmail: string;
      adminName?: string;
      plan?: string;
      maxEmployees?: number;
      industry?: string;
    }) => this.request('/control-plane/tenants', { method: 'POST', body: JSON.stringify(payload) }),

    listTenants: () =>
      this.request('/control-plane/tenants', { method: 'GET' }),

    getTenantDetails: (id: string) =>
      this.request(`/control-plane/tenants/${id}`, { method: 'GET' }),

    toggleTenantStatus: (id: string, status: 'active' | 'suspended') =>
      this.request(`/control-plane/tenants/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),

    updateTenantPlan: (id: string, payload: { plan: string; maxSeats: number }) =>
      this.request(`/control-plane/tenants/${id}/plan`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),

    listDatabaseSchemas: () =>
      this.request('/control-plane/database/schemas', { method: 'GET' }),

    triggerClusterBackup: () =>
      this.request('/control-plane/database/backup', { method: 'POST' }),

    getAWSTelemetry: () =>
      this.request('/control-plane/telemetry/aws', { method: 'GET' }),

    searchGlobalUsers: (q: string) =>
      this.request(`/control-plane/users/search?q=${encodeURIComponent(q)}`, { method: 'GET' }),

    mapGlobalUser: (payload: { cognitoSub: string; email: string; tenantId: string; role: string }) =>
      this.request('/control-plane/users/map', { method: 'POST', body: JSON.stringify(payload) }),

    startImpersonation: (tenantId: string) =>
      this.request<{
        token: string;
        acceptUrl: string;
        tenant: {
          id: string;
          slug: string;
          name: string;
          schemaName: string;
          industry: string;
          adminEmail: string;
          status: string;
        };
        expiresInSeconds: number;
      }>(`/control-plane/tenants/${tenantId}/impersonate`, { method: 'POST' }),

    listAuditLogs: (limit = 100) =>
      this.request(`/control-plane/audit-logs?limit=${limit}`, { method: 'GET' }),
  };


  // =========================================================================
  // 2. ORG MODULE API (Offices, Departments, Teams, Roles)
  // =========================================================================
  public org = {
    getOffices: () =>
      this.request('/org/offices', { method: 'GET' }),

    createOffice: (payload: { name: string; code: string; address: string; latitude: number; longitude: number; geofenceRadiusMeters?: number; timezone?: string }) =>
      this.request('/org/offices', { method: 'POST', body: JSON.stringify(payload) }),

    updateOffice: (id: string, payload: Partial<{ name: string; address: string; latitude: number; longitude: number; geofenceRadiusMeters: number; timezone: string }>) =>
      this.request(`/org/offices/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

    deleteOffice: (id: string) =>
      this.request(`/org/offices/${id}`, { method: 'DELETE' }),

    getDepartments: () =>
      this.request('/org/departments', { method: 'GET' }),

    createDepartment: (payload: { name: string; code: string; leadEmployeeId?: string }) =>
      this.request('/org/departments', { method: 'POST', body: JSON.stringify(payload) }),

    updateDepartment: (id: string, payload: Partial<{ name: string; leadEmployeeId: string }>) =>
      this.request(`/org/departments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

    deleteDepartment: (id: string) =>
      this.request(`/org/departments/${id}`, { method: 'DELETE' }),

    getTeams: (departmentId?: string) =>
      this.request(`/org/teams${departmentId ? `?departmentId=${departmentId}` : ''}`, { method: 'GET' }),

    createTeam: (payload: { departmentId: string; name: string; leadEmployeeId?: string }) =>
      this.request('/org/teams', { method: 'POST', body: JSON.stringify(payload) }),

    updateTeam: (id: string, payload: Partial<{ name: string; leadEmployeeId: string }>) =>
      this.request(`/org/teams/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

    deleteTeam: (id: string) =>
      this.request(`/org/teams/${id}`, { method: 'DELETE' }),

    getJobRoles: () =>
      this.request('/org/job-roles', { method: 'GET' }),

    createJobRole: (payload: { title: string; code: string; departmentId?: string; level?: string }) =>
      this.request('/org/job-roles', { method: 'POST', body: JSON.stringify(payload) }),

    updateJobRole: (id: string, payload: Partial<{ title: string; departmentId: string; level: string }>) =>
      this.request(`/org/job-roles/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

    deleteJobRole: (id: string) =>
      this.request(`/org/job-roles/${id}`, { method: 'DELETE' }),
  };

  // =========================================================================
  // 3. IDENTITY MODULE API (Employees, Bank Details, Profiles)
  // =========================================================================
  public identity = {
    getEmployees: (params?: { departmentId?: string; role?: string; status?: string }) => {
      const query = new URLSearchParams(params as any).toString();
      const path = `/identity/employees${query ? `?${query}` : ''}`;
      return this.coalesceGet(`GET:${path}`, () => this.request(path, { method: 'GET' }));
    },

    getEmployeeById: (id: string) =>
      this.request(`/identity/employees/${id}`, { method: 'GET' }),

    createEmployee: (payload: {
      employeeCode: string;
      firstName: string;
      lastName: string;
      email: string;
      password?: string;
      phone?: string;
      officeId?: string;
      officeIds?: string[];
      officeName?: string;
      location?: string;
      departmentId?: string;
      department?: string;
      teamId?: string;
      jobRoleId?: string;
      designation?: string;
      jobTitle?: string;
      role?: string;
      reportingManagerId?: string;
      employmentStatus?: string;
      accountStatus?: string;
      dateOfJoining?: string;
    }) => this.request('/identity/employees', { method: 'POST', body: JSON.stringify(payload) }),

    updateEmployee: (id: string, payload: {
      password?: string;
      isActivated?: boolean;
      isDeactivated?: boolean;
      accountStatus?: string;
      hasCompletedProfile?: boolean;
      onboardingProgress?: number;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      officeId?: string;
      officeIds?: string[];
      officeName?: string;
      location?: string;
      departmentId?: string;
      department?: string;
      teamId?: string;
      jobRoleId?: string;
      designation?: string;
      jobTitle?: string;
      role?: string;
      employmentStatus?: string;
      status?: string;
      reportingManagerId?: string;
      managerId?: string;
      dateOfJoining?: string | null;
      dateOfBirth?: string | null;
      gender?: string;
      bloodGroup?: string;
      maritalStatus?: string;
      nationality?: string;
      primaryAddress?: string;
      city?: string;
      stateProvince?: string;
      postalCode?: string;
      country?: string;
      personalTaxId?: string;
      socialInsurance?: string;
      emergencyContact?: any;
      customFieldValues?: any;
      uploadedDocuments?: any;
      avatar?: string;
    }) => this.request(`/identity/employees/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

    updateBankDetails: (employeeId: string, payload: {
      accountHolderName: string;
      accountNumber: string;
      bankName: string;
      routingOrIfscCode: string;
    }) => this.request(`/identity/employees/${employeeId}/bank-details`, { method: 'PUT', body: JSON.stringify(payload) }),
  };

  // =========================================================================
  // 4. ATTENDANCE MODULE API (Geofenced Punches, Leaves, Regularizations)
  // =========================================================================
  public attendance = {
    recordPunch: (payload: {
      employeeId: string;
      officeId?: string;
      punchType: 'check_in' | 'check_out';
      latitude?: number;
      longitude?: number;
      deviceInfo?: string;
    }) => this.request('/attendance/punches', { method: 'POST', body: JSON.stringify(payload) }),

    getPunches: (params?: { employeeId?: string; date?: string }) => {
      const query = new URLSearchParams(params as any).toString();
      return this.request(`/attendance/punches${query ? `?${query}` : ''}`, { method: 'GET' });
    },

    getLeaves: (params?: { employeeId?: string; status?: string }) => {
      const query = new URLSearchParams(params as any).toString();
      return this.request(`/attendance/leaves${query ? `?${query}` : ''}`, { method: 'GET' });
    },

    getHolidays: (params?: { year?: number | string }) => {
      const query = new URLSearchParams(params as any).toString();
      return this.request(`/attendance/holidays${query ? `?${query}` : ''}`, { method: 'GET' });
    },

    saveHolidays: (payload: {
      holidays: Array<{
        id: string;
        name: string;
        date: string;
        year: number;
        dayOfWeek?: string;
        isApproved?: boolean;
      }>;
    }) => this.request('/attendance/holidays', { method: 'PUT', body: JSON.stringify(payload) }),

    requestLeave: (payload: {
      employeeId: string;
      leaveType: 'casual' | 'sick' | 'earned' | 'unpaid' | 'wfh';
      startDate: string;
      endDate: string;
      daysCount: number;
      reason: string;
    }) => this.request('/attendance/leaves', { method: 'POST', body: JSON.stringify(payload) }),

    updateLeaveStatus: (
      id: string,
      payload: {
        status: 'Approved' | 'Rejected';
        approvedBy?: string;
        leaveType?: 'unpaid';
        approveAsLop?: boolean;
      }
    ) => this.request(`/attendance/leaves/${id}/status`, { method: 'PUT', body: JSON.stringify(payload) }),

    deleteLeave: (id: string) =>
      this.request(`/attendance/leaves/${id}`, { method: 'DELETE' }),

    bulkUpdateLeaveStatus: (payload: {
      leaveIds: string[];
      status: 'Approved' | 'Rejected';
      approvedBy?: string;
      leaveType?: 'unpaid';
      approveAsLop?: boolean;
    }) => this.request(`/attendance/leaves/bulk-status`, { method: 'PUT', body: JSON.stringify(payload) }),

    getLeaveBalances: (params?: { employeeId?: string; year?: number }) => {
      const query = new URLSearchParams();
      if (params?.employeeId) query.set('employeeId', params.employeeId);
      if (params?.year) query.set('year', String(params.year));
      const qs = query.toString();
      const path = `/attendance/leave-balances${qs ? `?${qs}` : ''}`;
      return this.coalesceGet(`GET:${path}`, () => this.request(path, { method: 'GET' }));
    },

    adjustLeaveBalance: (payload: {
      employeeId: string;
      leaveType: 'casual' | 'sick' | 'earned' | 'wfh';
      delta: number;
      notes?: string;
      year?: number;
    }) => this.request('/attendance/leave-balances/adjust', { method: 'POST', body: JSON.stringify(payload) }),

    requestRegularization: (payload: any) =>
      this.request('/attendance/regularizations', { method: 'POST', body: JSON.stringify(payload) }),

    getRegularizations: (params?: { employeeId?: string; status?: string }) => {
      const query = new URLSearchParams(params as any).toString();
      return this.request(`/attendance/regularizations${query ? `?${query}` : ''}`, { method: 'GET' });
    },

    updateRegularizationStatus: (id: string, payload: { status: 'Approved' | 'Rejected', approvedBy?: string }) =>
      this.request(`/attendance/regularizations/${id}/status`, { method: 'PUT', body: JSON.stringify(payload) }),

    updateAttendanceRecord: (id: string, payload: any) =>
      this.request(`/attendance/records/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),

    toggleBreak: (payload: { employeeId: string, isOnBreak: boolean }) =>
      this.request(`/attendance/break`, { method: 'POST', body: JSON.stringify(payload) }),

    decideLeave: (
      leaveId: string,
      payload: {
        status: 'approved' | 'rejected';
        decisionNotes?: string;
        leaveType?: 'unpaid';
        approveAsLop?: boolean;
      }
    ) => this.request(`/attendance/leaves/${leaveId}/decision`, { method: 'PUT', body: JSON.stringify(payload) }),
  };

  // =========================================================================
  // 5. PROJECTS MODULE API (Projects, Tasks, Timesheets)
  // =========================================================================
  public projects = {
    getProjects: () =>
      this.request('/projects/projects', { method: 'GET' }),

    createProject: (payload: {
      name: string;
      code: string;
      description?: string;
      clientName?: string;
      managerId: string;
      startDate?: string;
      endDate?: string;
    }) => this.request('/projects/projects', { method: 'POST', body: JSON.stringify(payload) }),
    
    updateProject: (projectId: string, payload: any) =>
      this.request(`/projects/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify(payload) }),

    getTasks: (projectId?: string) =>
      this.request(`/projects/tasks${projectId ? `?projectId=${projectId}` : ''}`, { method: 'GET' }),

    bulkCreateTasks: (tasks: any[]) =>
      this.request('/projects/tasks/bulk', { method: 'POST', body: JSON.stringify({ tasks }) }),

    createTask: (payload: {
      projectId: string;
      title: string;
      description?: string;
      assignedToEmployeeId?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      dueDate?: string;
    }) => this.request('/projects/tasks', { method: 'POST', body: JSON.stringify(payload) }),

    updateTask: (taskId: string, payload: {
      status?: string;
      priority?: string;
      title?: string;
      description?: string;
      assignedToEmployeeId?: string;
      dueDate?: string;
    }) => this.request(`/projects/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(payload) }),

    deleteTask: (taskId: string) =>
      this.request<{ id: string; message: string }>(`/projects/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
      }),

    verifyTaskTracking: (taskId: string, payload?: { action?: 'start' | 'stop' | 'verify'; title?: string }) =>
      this.request(`/projects/tasks/${encodeURIComponent(taskId)}/verify-tracking`, {
        method: 'POST',
        body: JSON.stringify(payload || { action: 'verify' }),
      }),

    logTimesheet: (payload: {
      projectId: string;
      taskId?: string;
      employeeId: string;
      workDate: string;
      hoursSpent: number;
      description: string;
      entryType?: 'task' | 'schedule';
      title?: string;
      startTime?: string;
      endTime?: string;
      category?: string;
      meetingLink?: string;
      billable?: boolean;
    }) => this.request('/projects/timesheets', { method: 'POST', body: JSON.stringify(payload) }),

    getTimesheets: (params?: { employeeId?: string; projectId?: string; entryType?: 'task' | 'schedule' }) => {
      const query = new URLSearchParams(params as any).toString();
      return this.request(`/projects/timesheets${query ? `?${query}` : ''}`, { method: 'GET' });
    },
    deleteTimesheet: (id: string) => this.request(`/projects/timesheets/${id}`, { method: 'DELETE' }),

    updateTimesheet: (timesheetId: string, payload: any) =>
      this.request(`/projects/timesheets/${timesheetId}`, { method: 'PATCH', body: JSON.stringify(payload) }),

    bulkUpdateTimesheets: (payload: { timesheetIds: string[]; status: string; approvedBy?: string }) =>
      this.request(`/projects/timesheets/bulk`, { method: 'PATCH', body: JSON.stringify(payload) }),
  };

  // =========================================================================
  // 6. PAYROLL MODULE API (Salary Structures, Runs, Payslips)
  // =========================================================================
  public payroll = {
    setSalaryStructure: (payload: {
      employeeId: string;
      currency?: string;
      baseSalary: number;
      hra?: number;
      specialAllowance?: number;
      conveyanceAllowance?: number;
      medicalAllowance?: number;
      otherAllowances?: number;
      allowances?: any[];
      providentFundDeduction?: number;
      taxDeduction?: number;
      effectiveFrom?: string;
    }) => this.request('/payroll/salary-structures', { method: 'POST', body: JSON.stringify(payload) }),

    executePayrollRun: (payload: { month: number; year: number; executedByEmployeeId: string }) =>
      this.request('/payroll/runs', { method: 'POST', body: JSON.stringify(payload) }),

    getPayslips: (params?: { employeeId?: string; payrollRunId?: string }) => {
      const query = new URLSearchParams(params as any).toString();
      return this.request(`/payroll/payslips${query ? `?${query}` : ''}`, { method: 'GET' });
    },
  };

  // =========================================================================
  // 7. AUDIT & COMMS API (Announcements, Notifications, Audit Logs)
  // =========================================================================
  public auditComms = {
    getAnnouncements: () =>
      this.request('/audit-comms/announcements', { method: 'GET' }),

    createAnnouncement: (payload: {
      title: string;
      content: string;
      authorEmployeeId: string;
      targetDepartmentId?: string;
      priority?: 'normal' | 'important' | 'urgent';
    }) => this.request('/audit-comms/announcements', { method: 'POST', body: JSON.stringify(payload) }),

    markAnnouncementRead: (id: string, employeeId: string) =>
      this.request(`/audit-comms/announcements/${id}/read`, { method: 'PUT', body: JSON.stringify({ employeeId }) }),

    toggleReaction: (id: string, emoji: string, employeeId: string) =>
      this.request(`/audit-comms/announcements/${id}/react`, { method: 'PUT', body: JSON.stringify({ emoji, employeeId }) }),

    addComment: (id: string, payload: any) =>
      this.request(`/audit-comms/announcements/${id}/comments`, { method: 'POST', body: JSON.stringify(payload) }),

    togglePin: (id: string) =>
      this.request(`/audit-comms/announcements/${id}/pin`, { method: 'PUT' }),

    deleteAnnouncement: (id: string) =>
      this.request(`/audit-comms/announcements/${id}`, { method: 'DELETE' }),

    getNotifications: (employeeId?: string) =>
      this.request(`/audit-comms/notifications${employeeId ? `?employeeId=${employeeId}` : ''}`, { method: 'GET' }),

    markAsRead: (notificationId: string) =>
      this.request(`/audit-comms/notifications/${notificationId}/read`, { method: 'PUT' }),
    markAllAsRead: () =>
      this.request('/audit-comms/notifications/read-all', { method: 'PUT' }),

    markNotificationRead: (id: string) =>
      this.request(`/audit-comms/notifications/${id}/read`, { method: 'PUT' }),

    markAllNotificationsRead: (employeeId?: string) =>
      this.request(`/audit-comms/notifications/read-all${employeeId ? `?employeeId=${employeeId}` : ''}`, { method: 'PUT' }),

    deleteNotification: (id: string) =>
      this.request(`/audit-comms/notifications/${id}`, { method: 'DELETE' }),

    clearAllNotifications: (employeeId?: string) =>
      this.request(`/audit-comms/notifications/clear-all${employeeId ? `?employeeId=${employeeId}` : ''}`, { method: 'DELETE' }),

    getAuditLogs: () =>
      this.request('/audit-comms/audit-trail', { method: 'GET' }),
  };

  // =========================================================================
  // 8. DOCUMENTS API
  // =========================================================================
  public documents = {
    uploadDocument: (payload: any) =>
      this.request('/documents/upload', { method: 'POST', body: JSON.stringify(payload) }),
    deleteDocument: (id: string) =>
      this.request(`/documents/${id}`, { method: 'DELETE' }),
    createFolder: (payload: any) =>
      this.request('/documents/folders', { method: 'POST', body: JSON.stringify(payload) }),
  };

  // =========================================================================
  // 9. STORAGE API (S3 Direct Uploads & KMS Download Pointers)
  // =========================================================================
  public storage = {
    getPresignedUploadUrl: (payload: {
      module: 'identity' | 'payroll' | 'documents' | 'attendance';
      fileName: string;
      contentType: string;
      fileSizeBytes?: number;
    }) => this.request('/storage/presigned-upload', { method: 'POST', body: JSON.stringify(payload) }),

    uploadFileToS3: async (uploadUrl: string, file: File) => {
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!res.ok) throw new Error(`S3 upload failed with status ${res.status}`);
      return true;
    },

    getPresignedDownloadUrl: (s3Key: string) =>
      this.request(`/storage/presigned-download?s3Key=${encodeURIComponent(s3Key)}`, { method: 'GET' }),

    registerDocument: (payload: {
      employeeId: string;
      docType: string;
      fileName: string;
      s3Key: string;
      fileSizeBytes: number;
    }) => this.request('/storage/documents', { method: 'POST', body: JSON.stringify(payload) }),

    deleteDocument: (documentId: string) => this.request(`/storage/documents/${documentId}`, { method: 'DELETE' }),
  };

  // =========================================================================
  // 9. INSTITUTE & ACADEMIC API (Batches, Students, Timetable, Student Attendance)
  // =========================================================================
  public institute = {
    // Batches
    getBatches: () => this.request('/institute/batches', { method: 'GET' }),
    createBatch: (payload: {
      id?: string;
      grade: string;
      section: string;
      startTime?: string;
      endTime?: string;
      workingDays?: string[];
      maxCapacity?: number;
    }) => this.request('/institute/batches', { method: 'POST', body: JSON.stringify(payload) }),
    bulkSyncBatches: (batches: any[]) =>
      this.request('/institute/batches/bulk', { method: 'POST', body: JSON.stringify({ batches }) }),
    updateBatch: (id: string, payload: any) =>
      this.request(`/institute/batches/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteBatch: (id: string) =>
      this.request(`/institute/batches/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    // Students
    getStudents: (params?: { grade?: string; section?: string; batchId?: string; status?: string }) => {
      const query = new URLSearchParams(params as any).toString();
      return this.request(`/institute/students${query ? `?${query}` : ''}`, { method: 'GET' });
    },
    createStudent: (payload: any) =>
      this.request('/institute/students', { method: 'POST', body: JSON.stringify(payload) }),
    bulkSyncStudents: (students: any[]) =>
      this.request('/institute/students/bulk', { method: 'POST', body: JSON.stringify({ students }) }),
    updateStudent: (id: string, payload: any) =>
      this.request(`/institute/students/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteStudent: (id: string) =>
      this.request(`/institute/students/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    // Timetable Slots
    getTimetableSlots: (params?: { batchId?: string; dayOfWeek?: string; facultyName?: string }) => {
      const query = new URLSearchParams(params as any).toString();
      return this.request(`/institute/timetable-slots${query ? `?${query}` : ''}`, { method: 'GET' });
    },
    createTimetableSlot: (payload: any) =>
      this.request('/institute/timetable-slots', { method: 'POST', body: JSON.stringify(payload) }),
    bulkSyncTimetableSlots: (slots: any[], batchId?: string) =>
      this.request('/institute/timetable-slots/bulk', { method: 'POST', body: JSON.stringify({ slots, batchId }) }),
    updateTimetableSlot: (id: string, payload: any) =>
      this.request(`/institute/timetable-slots/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    deleteTimetableSlot: (id: string, deleteSyncGroup: boolean = false) =>
      this.request(`/institute/timetable-slots/${encodeURIComponent(id)}${deleteSyncGroup ? '?deleteSyncGroup=true' : ''}`, { method: 'DELETE' }),

    // Student Attendance
    getStudentAttendance: (params?: { batchId?: string; date?: string; studentId?: string }) => {
      const query = new URLSearchParams(params as any).toString();
      return this.request(`/institute/attendance${query ? `?${query}` : ''}`, { method: 'GET' });
    },
    recordStudentAttendance: (payload: {
      studentId: string;
      batchId?: string;
      attendanceDate: string;
      status: 'Present' | 'Absent' | 'Late' | 'Half Day' | 'Excused';
      checkInTime?: string;
      checkOutTime?: string;
      remarks?: string;
    }) => this.request('/institute/attendance', { method: 'POST', body: JSON.stringify(payload) }),
  };

  // =========================================================================
  // 10. SETUP API (Atomic Setup Stepper)
  // =========================================================================
  public setup = {
    getSettings: () => this.request('/setup/settings', { method: 'GET' }),
    saveOffice: (payload: any) => this.request('/setup/office', { method: 'POST', body: JSON.stringify(payload) }),
    saveDepartments: (payload: any) => this.request('/setup/departments', { method: 'POST', body: JSON.stringify(payload) }),
    saveRoles: (payload: any) => this.request('/setup/roles', { method: 'POST', body: JSON.stringify(payload) }),
    saveTeam: (payload: any) => this.request('/setup/team', { method: 'POST', body: JSON.stringify(payload) }),
    saveEmploymentTypes: (payload: any) => this.request('/setup/employment-types', { method: 'POST', body: JSON.stringify(payload) }),
    saveOnboardingFields: (payload: any) => this.request('/setup/onboarding-fields', { method: 'POST', body: JSON.stringify(payload) }),
    saveGeneralSettings: (payload: any) => this.request('/setup/general', { method: 'POST', body: JSON.stringify(payload) }),
    savePayrollSettings: (payload: any) => this.request('/setup/payroll', { method: 'POST', body: JSON.stringify(payload) }),
    saveAttendanceSettings: (payload: any) => this.request('/setup/attendance', { method: 'POST', body: JSON.stringify(payload) }),
  };
}

export const api = new ApiClient();

