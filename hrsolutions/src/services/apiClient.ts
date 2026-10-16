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
import type {
  ChatAttachmentInput,
  ChatConversation,
  ChatMe,
  ChatMessage,
  ChatPerson,
  ConversationType,
  TicketPriority,
  TicketStatus,
} from './chatTypes';
import type { SupportMessage, SupportStatus, SupportThread } from './supportTypes';

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
      verificationToken: string;
      planId: string;
      billingCycle?: 'monthly' | 'annual';
      address?: string;
      city?: string;
      stateProvince?: string;
      postalCode?: string;
      country?: string;
      }) =>
        this.request<{
          token: string;
          tenant: { id: string; slug: string; name: string; schema: string };
          user: { id: string; name: string; email: string; role: string; department?: string; designation?: string };
        }>('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

    me: () => this.request('/auth/me', { method: 'GET' }),

    listLicensePlans: () => this.request('/license-plans', { method: 'GET' }),

    sendVerificationCode: (payload: { email: string; name?: string }) =>
      this.request<{ expiresAt: string }>('/auth/send-verification-code', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    verifyEmail: (payload: { email: string; code: string }) =>
      this.request<{ verificationToken: string; email: string }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    getInvite: (token: string) =>
      this.request<{
        email: string;
        firstName: string;
        tenantName: string;
        role: string;
        invitedBy: string;
        expiresAt: string;
      }>(`/auth/invite/${encodeURIComponent(token)}`, { method: 'GET' }),

    acceptInvite: (payload: { token: string; password: string }) =>
      this.request<{ email: string }>('/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    forgotPassword: (payload: { email: string }) =>
      this.request<undefined>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    resetPassword: (payload: { token: string; password: string }) =>
      this.request<{ email: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  };

  public license = {
    current: () => this.request('/license', { method: 'GET' }),
    events: () => this.request('/license/events', { method: 'GET' }),
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
      planId?: string;
      maxEmployees?: number;
      billingCycle?: 'monthly' | 'annual';
      industry?: string;
      contactPhone?: string;
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

    updateTenantPlan: (
      id: string,
      payload: {
        plan?: string;
        planId?: string;
        maxSeats?: number;
        billingCycle?: 'monthly' | 'annual';
        extendDays?: number;
        periodEnd?: string;
        revoke?: boolean;
      }
    ) =>
      this.request(`/control-plane/tenants/${id}/plan`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),

    listLicensePlans: () => this.request('/control-plane/license-plans', { method: 'GET' }),

    createLicensePlan: (payload: {
      name: string;
      key?: string;
      description?: string;
      priceMonthly?: number;
      priceAnnual?: number;
      maxSeats?: number;
      trialDays?: number;
      features?: string[];
      isActive?: boolean;
      isPublic?: boolean;
      sortOrder?: number;
    }) => this.request('/control-plane/license-plans', { method: 'POST', body: JSON.stringify(payload) }),

    updateLicensePlan: (id: string, payload: Record<string, unknown>) =>
      this.request(`/control-plane/license-plans/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),

    deactivateLicensePlan: (id: string) =>
      this.request(`/control-plane/license-plans/${id}`, { method: 'DELETE' }),

    deleteTenant: (id: string, confirmName: string) =>
      this.request(`/control-plane/tenants/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmName, confirmSlug: confirmName }),
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

    deleteGlobalUser: (mappingId: string) =>
      this.request(`/control-plane/users/${mappingId}`, { method: 'DELETE' }),

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

    listSupportTickets: (status?: SupportStatus) => {
      const qs = status ? `?status=${encodeURIComponent(status)}` : '';
      return this.request<SupportThread[]>(`/control-plane/support-tickets${qs}`, { method: 'GET' });
    },

    getSupportTicket: (id: string) =>
      this.request<SupportThread>(`/control-plane/support-tickets/${encodeURIComponent(id)}`, { method: 'GET' }),

    replySupportTicket: (id: string, body: string) =>
      this.request<SupportThread>(`/control-plane/support-tickets/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),

    updateSupportTicket: (id: string, payload: { status: SupportStatus }) =>
      this.request<SupportThread>(`/control-plane/support-tickets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
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

    createDepartment: (payload: { name: string; code: string; shortCode?: string; description?: string; leadEmployeeId?: string; leadEmployeeIds?: string[] }) =>
      this.request('/org/departments', { method: 'POST', body: JSON.stringify(payload) }),

    updateDepartment: (id: string, payload: Partial<{ name: string; shortCode: string; description: string; leadEmployeeId: string; leadEmployeeIds: string[] }>) =>
      this.request(`/org/departments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),

    deleteDepartment: (id: string) =>
      this.request(`/org/departments/${id}`, { method: 'DELETE' }),

    getTeams: (departmentId?: string) =>
      this.request(`/org/teams${departmentId ? `?departmentId=${departmentId}` : ''}`, { method: 'GET' }),

    createTeam: (payload: { departmentId: string; name: string; leadEmployeeId?: string; leadEmployeeIds?: string[] }) =>
      this.request('/org/teams', { method: 'POST', body: JSON.stringify(payload) }),

    updateTeam: (id: string, payload: Partial<{ name: string; leadEmployeeId: string; leadEmployeeIds: string[] }>) =>
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

    syncReporting: () =>
      this.request('/org/reporting/sync', { method: 'POST' }),
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
      managerIds?: string[];
      employmentType?: string;
      employmentStatus?: string;
      accountStatus?: string;
      dateOfJoining?: string;
      sendInvite?: boolean;
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
      managerIds?: string[];
      employmentType?: string;
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

    resendInvite: (employeeId: string) =>
      this.request<{ email: string; accountStatus: string }>(
        `/identity/employees/${encodeURIComponent(employeeId)}/resend-invite`,
        { method: 'POST' }
      ),
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
      selfiePhoto?: string | null;
      qrToken?: string;
      workFromHome?: boolean;
    }) => this.request('/attendance/punches', { method: 'POST', body: JSON.stringify(payload) }),

    verifyWorkplaceLocation: (payload: {
      latitude: number;
      longitude: number;
      accuracy?: number;
    }) =>
      this.request<{
        clockedIn: boolean;
        clockedOut: boolean;
        skipped?: boolean;
        reason?: string;
        isWithinGeofence?: boolean;
        distanceMeters?: number;
        radiusMeters?: number;
        officeName?: string;
        message?: string;
      }>('/attendance/location-check', { method: 'POST', body: JSON.stringify(payload) }),

    getOfficeQrToken: (officeId?: string) => {
      const query = officeId ? `?officeId=${encodeURIComponent(officeId)}` : '';
      return this.request<{
        token: string;
        expiresAt: string;
        officeId: string;
        officeName: string;
        refreshSeconds: number;
      }>(`/attendance/qr-token${query}`, { method: 'GET' });
    },

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

    requestRegularization: (payload: {
      employeeId: string;
      date: string;
      requestedCheckIn?: string;
      requestedCheckOut?: string;
      reason: string;
      remarks?: string;
    }) => this.request('/attendance/regularizations', { method: 'POST', body: JSON.stringify(payload) }),

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
  // 4b. REPORTS MODULE API (server-scoped reporting aggregates and exports)
  // =========================================================================
  public reports = {
    getSummary: (params: { startDate: string; endDate: string; departmentId?: string }) => {
      const query = new URLSearchParams();
      query.set('startDate', params.startDate);
      query.set('endDate', params.endDate);
      if (params.departmentId) query.set('departmentId', params.departmentId);
      const path = `/reports/summary?${query.toString()}`;
      return this.coalesceGet(`GET:${path}`, () => this.request(path, { method: 'GET' }));
    },
    exportAttendanceCsvUrl: (params: { startDate: string; endDate: string; departmentId?: string }) => {
      const query = new URLSearchParams();
      query.set('startDate', params.startDate);
      query.set('endDate', params.endDate);
      if (params.departmentId) query.set('departmentId', params.departmentId);
      return `${this.baseUrl}/reports/attendance.csv?${query.toString()}`;
    },
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
      clientId?: string;
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
      assignedToEmployeeIds?: string[];
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      dueDate?: string | null;
      billable?: boolean;
      billingType?: 'deliverable' | 'hourly';
      unitPrice?: number;
      clientId?: string | null;
      recurrence?: { frequency: string; weekday?: number; count?: number; endDate?: string | null } | null;
    }) => this.request('/projects/tasks', { method: 'POST', body: JSON.stringify(payload) }),

    updateTask: (taskId: string, payload: {
      status?: string;
      priority?: string;
      title?: string;
      description?: string;
      assignedToEmployeeId?: string;
      assignedToEmployeeIds?: string[];
      dueDate?: string | null;
      timeSpentSeconds?: number;
      timerStartedAt?: number | null;
      billable?: boolean;
      billingType?: 'deliverable' | 'hourly';
      unitPrice?: number;
      clientId?: string | null;
      applyTo?: 'occurrence' | 'future';
      recurrenceEnd?: string | null;
      attachedDocs?: Array<{ id: string; name: string; size?: string; type?: string; s3Key?: string; owner?: string }>;
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
      employeeId?: string;
      employeeIds?: string[];
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
      status?: string;
    }) => this.request('/projects/timesheets', { method: 'POST', body: JSON.stringify(payload) }),

    getUnbilledWork: (projectId: string) =>
      this.request(`/projects/projects/${projectId}/unbilled`, { method: 'GET' }),

    listProjectInvoices: (projectId: string) =>
      this.request(`/projects/projects/${projectId}/invoices`, { method: 'GET' }),

    createProjectInvoice: (projectId: string, payload: {
      dueDate?: string;
      lines: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        sourceTaskId?: string;
        sourceTimesheetId?: string;
      }>;
    }) => this.request(`/projects/projects/${projectId}/invoices`, { method: 'POST', body: JSON.stringify(payload) }),

    updateInvoice: (invoiceId: string, payload: { status: string }) =>
      this.request(`/projects/invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify(payload) }),

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

  public billing = {
    getClients: () => this.request('/billing/clients', { method: 'GET' }),
    createClient: (payload: {
      name: string;
      companyName?: string;
      email?: string;
      phone?: string;
      billingAddress?: string;
      gstin?: string;
      currency?: string;
      paymentTermsDays?: number;
      defaultHourlyRate?: number | null;
      notes?: string;
      status?: 'active' | 'inactive';
    }) => this.request('/billing/clients', { method: 'POST', body: JSON.stringify(payload) }),
    updateClient: (id: string, payload: Record<string, unknown>) =>
      this.request(`/billing/clients/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    getUnbilled: (params?: { clientId?: string; projectId?: string; from?: string; to?: string }) => {
      const query = new URLSearchParams();
      if (params?.clientId) query.set('clientId', params.clientId);
      if (params?.projectId) query.set('projectId', params.projectId);
      if (params?.from) query.set('from', params.from);
      if (params?.to) query.set('to', params.to);
      const qs = query.toString();
      return this.request(`/billing/unbilled${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },
    getInvoices: (params?: { clientId?: string }) => {
      const query = params?.clientId ? `?clientId=${encodeURIComponent(params.clientId)}` : '';
      return this.request(`/billing/invoices${query}`, { method: 'GET' });
    },
    getInvoice: (id: string) => this.request(`/billing/invoices/${id}`, { method: 'GET' }),
    createInvoice: (payload: {
      clientId: string;
      kind: 'monthly' | 'project';
      projectId?: string;
      periodStart?: string;
      periodEnd?: string;
      dueDate?: string;
      lines: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        sourceTaskId?: string | null;
        sourceTimesheetId?: string | null;
      }>;
    }) => this.request('/billing/invoices', { method: 'POST', body: JSON.stringify(payload) }),
    updateInvoice: (id: string, payload: { status: string }) =>
      this.request(`/billing/invoices/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
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
      category?: 'GENERAL' | 'HR_POLICY' | 'EVENT' | 'ACADEMIC' | 'IT_ALERT';
      pinToHeaderBanner?: boolean;
      tags?: string[];
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
      module: 'identity' | 'payroll' | 'documents' | 'attendance' | 'chat';
      fileName: string;
      contentType: string;
      fileSizeBytes?: number;
    }) => this.request('/storage/presigned-upload', { method: 'POST', body: JSON.stringify(payload) }),

    uploadFileToS3: async (uploadUrl: string, file: File) => {
      // Method must be PUT (opening the URL in a tab is GET and fails signature).
      // Content-Type must match the value used when the URL was signed.
      // Do not send checksum or SSE headers unless they are part of the signed URL.
      const contentType = file.type || 'application/octet-stream';
      const headers: Record<string, string> = { 'Content-Type': contentType };
      const signedHeaders = new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders') || '';
      if (signedHeaders.split(';').includes('x-amz-server-side-encryption')) {
        headers['x-amz-server-side-encryption'] = 'aws:kms';
      }
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        headers,
        body: file,
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        throw new Error(`S3 upload failed with status ${res.status}${detail ? `: ${detail}` : ''}`);
      }
      return true;
    },

    getPresignedDownloadUrl: (s3Key: string) =>
      this.request(`/storage/presigned-download?s3Key=${encodeURIComponent(s3Key)}`, { method: 'GET' }),

    listDocuments: () => this.request('/storage/documents', { method: 'GET' }),

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
      latitude?: number;
      longitude?: number;
      selfiePhoto?: string | null;
    }) => this.request('/institute/attendance', { method: 'POST', body: JSON.stringify(payload) }),
  };

  // =========================================================================
  // 10. CHAT API (Team channels, group/direct chats, Ask HR)
  // =========================================================================
  public chat = {
    me: () => this.request<ChatMe>('/chat/me', { method: 'GET' }),

    people: (params?: { search?: string; hrOnly?: boolean; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.hrOnly) query.set('hrOnly', 'true');
      if (params?.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      return this.request<ChatPerson[]>(`/chat/people${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    presence: () => this.request<{ online: string[] }>('/chat/presence', { method: 'GET' }),

    listConversations: (params?: { type?: ConversationType; includeArchived?: boolean }) => {
      const query = new URLSearchParams();
      if (params?.type) query.set('type', params.type);
      if (params?.includeArchived) query.set('includeArchived', 'true');
      const qs = query.toString();
      return this.request<ChatConversation[]>(`/chat/conversations${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    getConversation: (id: string) =>
      this.request<ChatConversation>(`/chat/conversations/${encodeURIComponent(id)}`, { method: 'GET' }),

    createConversation: (payload: {
      type: 'group' | 'direct';
      participantIds: string[];
      name?: string;
      description?: string;
    }) => this.request<ChatConversation>('/chat/conversations', { method: 'POST', body: JSON.stringify(payload) }),

    updateConversation: (
      id: string,
      payload: { name?: string; description?: string | null; isArchived?: boolean; muted?: boolean }
    ) =>
      this.request<ChatConversation>(`/chat/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),

    addParticipants: (id: string, employeeIds: string[]) =>
      this.request<ChatConversation>(`/chat/conversations/${encodeURIComponent(id)}/participants`, {
        method: 'POST',
        body: JSON.stringify({ employeeIds }),
      }),

    removeParticipant: (id: string, employeeId: string) =>
      this.request<{ removed: boolean }>(
        `/chat/conversations/${encodeURIComponent(id)}/participants/${encodeURIComponent(employeeId)}`,
        { method: 'DELETE' }
      ),

    listMessages: (id: string, params?: { before?: string; limit?: number }) => {
      const query = new URLSearchParams();
      if (params?.before) query.set('before', params.before);
      if (params?.limit) query.set('limit', String(params.limit));
      const qs = query.toString();
      return this.request<{ messages: ChatMessage[]; hasMore: boolean }>(
        `/chat/conversations/${encodeURIComponent(id)}/messages${qs ? `?${qs}` : ''}`,
        { method: 'GET' }
      );
    },

    sendMessage: (
      id: string,
      payload: { body?: string; parentMessageId?: string | null; attachments?: ChatAttachmentInput[]; clientId?: string }
    ) =>
      this.request<ChatMessage>(`/chat/conversations/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    markRead: (id: string) =>
      this.request(`/chat/conversations/${encodeURIComponent(id)}/read`, { method: 'POST' }),

    editMessage: (messageId: string, body: string) =>
      this.request<ChatMessage>(`/chat/messages/${encodeURIComponent(messageId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      }),

    addReaction: (messageId: string, emoji: string) =>
      this.request<{ conversationId: string; messageId: string; reactions: ChatMessage['reactions'] }>(
        `/chat/messages/${encodeURIComponent(messageId)}/reactions`,
        { method: 'POST', body: JSON.stringify({ emoji }) }
      ),

    removeReaction: (messageId: string, emoji: string) =>
      this.request<{ conversationId: string; messageId: string; reactions: ChatMessage['reactions'] }>(
        `/chat/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(emoji)}`,
        { method: 'DELETE' }
      ),

    getAttachmentUrl: (attachmentId: string) =>
      this.request<{ downloadUrl: string; fileName: string; mimeType: string | null }>(
        `/chat/attachments/${encodeURIComponent(attachmentId)}/url`,
        { method: 'GET' }
      ),

    createHrTicket: (payload: {
      subject: string;
      category: string;
      priority?: TicketPriority;
      body: string;
      attachments?: ChatAttachmentInput[];
    }) => this.request<ChatConversation>('/chat/hr-tickets', { method: 'POST', body: JSON.stringify(payload) }),

    listHrTickets: (params?: { status?: TicketStatus; assigned?: 'me' | 'unassigned' | 'all' }) => {
      const query = new URLSearchParams();
      if (params?.status) query.set('status', params.status);
      if (params?.assigned) query.set('assigned', params.assigned);
      const qs = query.toString();
      return this.request<ChatConversation[]>(`/chat/hr-tickets${qs ? `?${qs}` : ''}`, { method: 'GET' });
    },

    updateHrTicket: (
      id: string,
      payload: { status?: TicketStatus; assignedHrId?: string | null; priority?: TicketPriority; category?: string }
    ) =>
      this.request<ChatConversation>(`/chat/hr-tickets/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  };

  public support = {
    listThreads: () => this.request<SupportThread[]>('/support/threads', { method: 'GET' }),

    createThread: (payload: { subject: string; body: string }) =>
      this.request<SupportThread>('/support/threads', { method: 'POST', body: JSON.stringify(payload) }),

    listMessages: (id: string) =>
      this.request<SupportMessage[]>(`/support/threads/${encodeURIComponent(id)}/messages`, { method: 'GET' }),

    sendMessage: (id: string, body: string) =>
      this.request<SupportThread>(`/support/threads/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
  };

  // =========================================================================
  // 11. SETUP API (Atomic Setup Stepper)
  // =========================================================================
  public setup = {
    getSettings: () => this.request('/setup/settings', { method: 'GET' }),
    saveOffice: (payload: any) => this.request('/setup/office', { method: 'POST', body: JSON.stringify(payload) }),
    saveWorkplaceMode: (payload: { mode: 'remote' | 'onsite' | 'hybrid' }) => this.request('/setup/workplace-mode', { method: 'POST', body: JSON.stringify(payload) }),
    saveDepartments: (payload: any) => this.request('/setup/departments', { method: 'POST', body: JSON.stringify(payload) }),
    saveRoles: (payload: any) => this.request('/setup/roles', { method: 'POST', body: JSON.stringify(payload) }),
    saveTeam: (payload: any) => this.request('/setup/team', { method: 'POST', body: JSON.stringify(payload) }),
    saveEmploymentTypes: (payload: any) => this.request('/setup/employment-types', { method: 'POST', body: JSON.stringify(payload) }),
    saveOnboardingFields: (payload: any) => this.request('/setup/onboarding-fields', { method: 'POST', body: JSON.stringify(payload) }),
    saveGeneralSettings: (payload: any) => this.request('/setup/general', { method: 'POST', body: JSON.stringify(payload) }),
    savePayrollSettings: (payload: any) => this.request('/setup/payroll', { method: 'POST', body: JSON.stringify(payload) }),
    saveAttendanceSettings: (payload: any) => this.request('/setup/attendance', { method: 'POST', body: JSON.stringify(payload) }),
    saveIdCardTemplates: (payload: { templates: unknown[]; defaults: { employee?: string; student?: string } }) =>
      this.request('/setup/id-card-templates', { method: 'POST', body: JSON.stringify(payload) }),
  };
}

export const api = new ApiClient();

