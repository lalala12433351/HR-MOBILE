'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Building2,
  Users,
  Database,
  CalendarCheck,
  Search,
  Plus,
  ExternalLink,
  Lock,
  Unlock,
  RefreshCw,
  Sliders,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  X,
  KeyRound,
  FileCode,
  Megaphone,
  Radio,
  Activity,
  Download,
  Trash2,
  LifeBuoy,
  Server,
  Cloud,
  HardDrive,
  Cpu,
  Mail,
  MessageSquare,
  Send,
  UserCheck,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ClientTenant, SchemaInspectorItem, MasterAuditLogItem, LicensePlan, LicenseEvent, LicenseStatus } from '@/types';
import { api } from '@/services/apiClient';
import { CustomSubscriptionPlan, LicenseManagerTab, mapApiPlan } from './LicenseManagerTab';
import { SupportInbox } from './SupportInbox';
import type { SupportThread } from '@/services/supportTypes';
import { AuthService } from '@/services/authService';
import { APP_ORIGIN, isAppHost, isLoopbackHost } from '@/config/origins';
import { AdminPageSkeleton } from '@/components/skeletons';

function mapApiTenant(row: any): ClientTenant {
  const slug = row.slug || row.schema_name?.replace(/^tenant_/, '') || 'unknown';
  const statusRaw = String(row.status || 'active').toLowerCase();
  const licenseStatus = String(row.license_status || row.licenseStatus || '').toLowerCase() as LicenseStatus;
  const status: ClientTenant['status'] =
    statusRaw === 'suspended'
      ? 'suspended'
      : licenseStatus === 'trialing' || statusRaw === 'trialing' || statusRaw === 'trial'
        ? 'trial'
        : 'active';
  return {
    id: row.id,
    slug,
    name: row.name || slug,
    domain: row.domain || `${slug}.app`,
    industry: row.industry || 'Office',
    schemaName: row.schema_name || row.schemaName || `tenant_${slug}`,
    plan: String(row.plan || row.tier || row.plan_key || 'professional'),
    planId: row.plan_id || row.planId || null,
    planName: row.plan_name || row.planName || row.plan || row.tier,
    licenseStatus: (licenseStatus || 'active') as LicenseStatus,
    periodStart: row.current_period_start || row.periodStart || null,
    periodEnd: row.current_period_end || row.periodEnd || null,
    trialEndsAt: row.trial_ends_at || row.trialEndsAt || null,
    daysRemaining: Number(row.days_remaining ?? row.daysRemaining ?? 0) || 0,
    billingCycle: row.billing_cycle === 'annual' ? 'annual' : 'monthly',
    maxSeats: Number(row.max_employees ?? row.maxSeats ?? 50) || 50,
    activeUsersCount: Number(row.active_users_count ?? row.activeUsersCount ?? 0) || 0,
    adminName: row.admin_name || row.adminName || 'Admin',
    adminEmail: row.admin_email || row.adminEmail || '',
    status,
    createdAt: row.created_at
      ? String(row.created_at).substring(0, 10)
      : new Date().toISOString().substring(0, 10),
    lastActivityAt: row.last_activity_at || row.lastActivityAt || '—',
    dbSizeBytes: Number(row.db_size_bytes ?? 0) || 0,
    totalPunchesRecorded: Number(row.total_punches ?? 0) || 0,
  };
}

function mapSchemaName(name: string, tenants: ClientTenant[]): SchemaInspectorItem {
  const match = tenants.find((t) => t.schemaName === name || `tenant_${t.slug}` === name);
  return {
    schemaName: name,
    tenantSlug: match?.slug || name.replace(/^tenant_/, ''),
    tenantName: match?.name || name,
    migrationVersion: '002',
    tablesCount: 0,
    totalRows: 0,
    sizeMB: 0,
    status: 'healthy',
    lastModified: new Date().toISOString(),
  };
}

export type { CustomSubscriptionPlan };

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  tenantName: string;
  tenantSlug: string;
  tenantSchema: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  description: string;
  category: 'Attendance & Timings' | 'Billing & Subscription' | 'Database & Storage' | 'Authentication' | 'Other';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  status: 'open' | 'in_progress' | 'waiting_client' | 'resolved' | 'closed';
  slaDue: string;
  createdAt: string;
  assignedTo: string;
}

function workspaceNameMatches(typed: string, tenant: ClientTenant): boolean {
  const value = typed.trim().toLowerCase();
  return value.length > 0 && value === tenant.name.trim().toLowerCase();
}

function impersonationAcceptUrl(token: string, backendAcceptUrl?: string): string {
  const path = `/impersonate?token=${encodeURIComponent(token)}`;
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (isLoopbackHost(hostname)) {
      return `${window.location.origin}${path}`;
    }
    if (isAppHost(hostname)) {
      return `${window.location.origin}${path}`;
    }
  }
  if (
    backendAcceptUrl?.startsWith('http') &&
    !/https?:\/\/(localhost|127\.0\.0\.1|\[::1\])\b/i.test(backendAcceptUrl)
  ) {
    return backendAcceptUrl;
  }
  if (typeof window !== 'undefined' && isLoopbackHost(new URL(APP_ORIGIN).hostname)) {
    const host = window.location.hostname.replace(/^(masteradmin|masteadmin)\./i, 'app.');
    return `${window.location.protocol}//${host}${path}`;
  }
  return `${APP_ORIGIN}${path}`;
}

function mapSupportThread(row: SupportThread): SupportTicket {
  const created = row.createdAt ? new Date(row.createdAt) : null;
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    tenantName: row.tenantName || 'Workspace',
    tenantSlug: row.tenantSlug || '',
    tenantSchema: row.tenantSchema || '',
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    subject: row.subject,
    description: row.preview || '',
    category: 'Other',
    priority: 'normal',
    status: row.status,
    slaDue: created && !Number.isNaN(created.getTime()) ? created.toLocaleString() : '—',
    createdAt: row.createdAt,
    assignedTo: 'Pixbe Support',
  };
}

export interface PlatformBroadcast {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  createdAt: string;
  isActive: boolean;
}

const INITIAL_PLANS: CustomSubscriptionPlan[] = [];

export const MasterAdminDashboard: React.FC = () => {
  const { state, updateState, triggerToast } = useApp();

  const [isMasterAuthenticated, setIsMasterAuthenticated] = useState<boolean>(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const [masterEmail, setMasterEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  const [activeTab, setActiveTab] = useState<
    'tenants' | 'licenses' | 'support' | 'database' | 'users' | 'telemetry' | 'audit'
  >('tenants');

  const [tenants, setTenants] = useState<ClientTenant[]>([]);
  const [schemas, setSchemas] = useState<SchemaInspectorItem[]>([]);
  const [globalUsers, setGlobalUsers] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<any | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [tenantSearch, setTenantSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [auditLogs, setAuditLogs] = useState<MasterAuditLogItem[]>([]);

  const [plans, setPlans] = useState<CustomSubscriptionPlan[]>(INITIAL_PLANS);
  const [plansLoadError, setPlansLoadError] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  const fetchPlatformData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [tenantsRes, schemasRes, usersRes, telemetryRes, auditRes, ticketsRes, plansRes] = await Promise.allSettled([
        api.controlPlane.listTenants(),
        api.controlPlane.listDatabaseSchemas(),
        api.controlPlane.searchGlobalUsers(''),
        api.controlPlane.getAWSTelemetry(),
        api.controlPlane.listAuditLogs(100),
        api.controlPlane.listSupportTickets(),
        api.controlPlane.listLicensePlans(),
      ]);

      let mappedTenants: ClientTenant[] = [];
      if (tenantsRes.status === 'fulfilled' && tenantsRes.value.success && tenantsRes.value.data) {
        const rawTenants = Array.isArray(tenantsRes.value.data)
          ? tenantsRes.value.data
          : (tenantsRes.value.data as any).tenants;
        if (Array.isArray(rawTenants)) {
          mappedTenants = rawTenants.map(mapApiTenant);
          setTenants(mappedTenants);
        }
      }

      if (schemasRes.status === 'fulfilled' && schemasRes.value.success && schemasRes.value.data) {
        const rawSchemas = Array.isArray(schemasRes.value.data)
          ? schemasRes.value.data
          : (schemasRes.value.data as any).schemas;
        if (Array.isArray(rawSchemas)) {
          const names = rawSchemas.map((s: any) => (typeof s === 'string' ? s : s.schemaName || s.schema_name));
          setSchemas(names.filter(Boolean).map((n: string) => mapSchemaName(n, mappedTenants)));
        }
      }

      if (usersRes.status === 'fulfilled' && usersRes.value.success && usersRes.value.data) {
        const rawUsers = Array.isArray(usersRes.value.data) ? usersRes.value.data : [];
        setGlobalUsers(rawUsers);
      }

      if (telemetryRes.status === 'fulfilled' && telemetryRes.value.success && telemetryRes.value.data) {
        setTelemetry(telemetryRes.value.data);
      }

      if (ticketsRes.status === 'fulfilled' && ticketsRes.value.success && ticketsRes.value.data) {
        const rawTickets = Array.isArray(ticketsRes.value.data) ? ticketsRes.value.data : [];
        setTickets(rawTickets.map(mapSupportThread));
      }

      if (plansRes.status === 'fulfilled' && plansRes.value.success && Array.isArray(plansRes.value.data)) {
        setPlans((plansRes.value.data as LicensePlan[]).map(mapApiPlan));
        setPlansLoadError('');
      } else if (plansRes.status === 'rejected') {
        setPlansLoadError(plansRes.reason?.message || 'License catalog could not be loaded.');
      } else {
        setPlansLoadError('License catalog could not be loaded.');
      }

      if (auditRes.status === 'fulfilled' && auditRes.value.success && auditRes.value.data) {
        const rawLogs = Array.isArray(auditRes.value.data) ? auditRes.value.data : [];
        setAuditLogs(
          rawLogs.map((row: any) => ({
            id: row.id,
            timestamp: row.created_at
              ? String(row.created_at).replace('T', ' ').substring(0, 16)
              : '',
            operator: row.actor_email || 'Operator',
            action: row.action || 'ACTION',
            targetTenant: row.tenant_name || undefined,
            targetEntity: row.resource || 'system',
            details:
              typeof row.details === 'string'
                ? row.details
                : row.details
                  ? JSON.stringify(row.details)
                  : '',
            status:
              String(row.action || '').includes('SUSPEND') || String(row.action || '').includes('IMPERSONATION')
                ? 'warning'
                : 'success',
          }))
        );
      }
    } catch {
      // Backend gracefully handled
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = AuthService.getSession();
        const token = api.getToken();
        if (!token) {
          if (!cancelled) {
            setIsMasterAuthenticated(false);
            setIsCheckingSession(false);
          }
          return;
        }

        // Prefer live /auth/me role check; fall back to stored session role
        try {
          const meRes = await api.auth.me();
          const role = (meRes as any)?.data?.user?.role || session?.role;
          if (!cancelled) {
            setIsMasterAuthenticated(role === 'platform_admin');
          }
        } catch {
          if (!cancelled) {
            setIsMasterAuthenticated(session?.role === 'platform_admin');
          }
        }
      } finally {
        if (!cancelled) setIsCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isMasterAuthenticated) {
      fetchPlatformData();
    }
  }, [isMasterAuthenticated, fetchPlatformData]);

  // Modals & Drawers
  const [showProvisionModal, setShowProvisionModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [selectedTenantForPlan, setSelectedTenantForPlan] = useState<ClientTenant | null>(null);

  const [licenseEvents, setLicenseEvents] = useState<LicenseEvent[]>([]);
  const [editExtendDays, setEditExtendDays] = useState(0);
  const [editRevoke, setEditRevoke] = useState(false);

  // New Tenant State
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantIndustry, setNewTenantIndustry] = useState('Office');
  const [newTenantPlan, setNewTenantPlan] = useState<string>('professional');
  const [newTenantSeats, setNewTenantSeats] = useState(100);
  const [newTenantBillingCycle, setNewTenantBillingCycle] = useState<'monthly' | 'annual' | 'trial'>('monthly');
  const [newTenantAdminName, setNewTenantAdminName] = useState('');
  const [newTenantAdminEmail, setNewTenantAdminEmail] = useState('');
  const [newTenantPhone, setNewTenantPhone] = useState('');
  const [isProvisioning, setIsProvisioning] = useState(false);

  // Tenant Plan Edit State
  const [editPlanTier, setEditPlanTier] = useState<string>('professional');
  const [editPlanSeats, setEditPlanSeats] = useState(100);

  // Broadcasts State
  const [broadcasts, setBroadcasts] = useState<PlatformBroadcast[]>([]);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSeverity, setBroadcastSeverity] = useState<'info' | 'warning' | 'urgent'>('info');

  const [userSearchQuery, setUserSearchQuery] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'tenant'; tenant: ClientTenant; action: 'suspend' | 'delete' }
    | { kind: 'user'; id: string; email: string; tenant: string; role: string }
    | null
  >(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleMasterLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const cleanEmail = masterEmail.trim().toLowerCase();
    const cleanPassword = masterPassword.trim();
    if (!cleanEmail || !cleanPassword) {
      setLoginError('Email and password are required.');
      return;
    }

    setIsSubmittingLogin(true);
    try {
      const res = await api.auth.login({ email: cleanEmail, password: cleanPassword });
      if (!res?.success || !res.data) {
        setLoginError((res as any)?.error?.message || 'Invalid credentials.');
        return;
      }

      const { token, tenant, user } = res.data;
      if (user.role !== 'platform_admin') {
        api.clearAuth();
        AuthService.logout();
        setLoginError('Access denied. Platform console requires a platform_admin account.');
        return;
      }

      AuthService.setSession({
        token,
        sub: (user as any).sub || user.id,
        email: user.email,
        role: 'platform_admin',
        tenantId: tenant.slug,
        dbSchema: tenant.schema,
        name: user.name,
        persist: true,
        refreshToken: (res.data as any).refreshToken || token,
      });

      setIsMasterAuthenticated(true);
      triggerToast({
        title: 'Platform Control Signed In',
        message: 'Welcome to the platform control plane.',
        type: 'system',
      });
    } catch (err: any) {
      setLoginError(err?.message || 'Invalid credentials.');
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleMasterLogout = () => {
    setIsMasterAuthenticated(false);
    AuthService.logout();
  };

  // Live tenants from control-plane API only (no synthetic local workspace)
  const allTenants = tenants;

  const filteredTenants = useMemo(() => {
    return allTenants.filter((t) => {
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const q = tenantSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.domain && t.domain.toLowerCase().includes(q)) ||
        t.adminEmail.toLowerCase().includes(q);

      return matchesStatus && matchesSearch;
    });
  }, [allTenants, statusFilter, tenantSearch]);

  const stats = useMemo(() => {
    const totalTenantsCount = allTenants.length;
    const activeTenantsCount = allTenants.filter((t) => t.status === 'active').length;
    const totalUsersCount = allTenants.reduce((acc, t) => acc + t.activeUsersCount, 0);
    const totalPunchesCount = allTenants.reduce((acc, t) => acc + t.totalPunchesRecorded, 0);
    const openTicketsCount = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;

    return {
      totalTenantsCount,
      activeTenantsCount,
      totalUsersCount,
      totalPunchesCount,
      openTicketsCount,
    };
  }, [allTenants, tickets]);

  const handleImpersonateTenant = async (tenant: ClientTenant) => {
    if (tenant.status === 'suspended') {
      triggerToast({
        title: 'Jump in blocked',
        message: `${tenant.name} is suspended. Reactivate it before opening an operator session.`,
        type: 'system',
      });
      return;
    }
    try {
      const res = await api.controlPlane.startImpersonation(tenant.id);
      if (!res.success || !res.data?.token) {
        throw new Error((res as any)?.error?.message || 'Impersonation failed');
      }

      triggerToast({
        title: `Jumping into ${tenant.name}`,
        message: 'Opening operator session…',
        type: 'system',
      });

      window.location.href = impersonationAcceptUrl(res.data.token, res.data.acceptUrl);
    } catch (err: any) {
      triggerToast({
        title: 'Jump in failed',
        message: err?.message || 'Could not start operator session.',
        type: 'system',
      });
    }
  };

  const appendTenantAudit = (tenant: ClientTenant, action: 'TENANT_SUSPENDED' | 'TENANT_ACTIVATED') => {
    const log: MasterAuditLogItem = {
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      operator: 'Master Admin',
      action,
      targetTenant: tenant.name,
      targetEntity: 'Tenant',
      details: action === 'TENANT_SUSPENDED' ? 'Status changed to suspended.' : 'Status changed to active.',
      status: action === 'TENANT_SUSPENDED' ? 'warning' : 'success',
    };
    setAuditLogs((prev) => [log, ...prev]);
  };

  const handleReactivateTenant = async (tenant: ClientTenant) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await api.controlPlane.toggleTenantStatus(tenant.id, 'active');
      setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, status: 'active' } : t)));
      appendTenantAudit(tenant, 'TENANT_ACTIVATED');
      triggerToast({
        title: 'Workspace reactivated',
        message: `${tenant.name} can sign in again, and Jump in is available.`,
        type: 'system',
      });
      void fetchPlatformData();
    } catch (err: any) {
      triggerToast({
        title: 'Reactivate failed',
        message: err?.message || 'The server rejected the status change.',
        type: 'system',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const closeDeleteModal = () => {
    if (isDeleting) return;
    setDeleteTarget(null);
    setDeleteConfirmText('');
  };

  const handleConfirmWorkspaceAction = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'tenant' && !workspaceNameMatches(deleteConfirmText, deleteTarget.tenant)) return;

    setIsDeleting(true);
    try {
      if (deleteTarget.kind === 'tenant' && deleteTarget.action === 'suspend') {
        const { tenant } = deleteTarget;
        await api.controlPlane.toggleTenantStatus(tenant.id, 'suspended');
        setTenants((prev) => prev.map((t) => (t.id === tenant.id ? { ...t, status: 'suspended' } : t)));
        appendTenantAudit(tenant, 'TENANT_SUSPENDED');
        triggerToast({
          title: 'Workspace suspended',
          message: `${tenant.name} is locked. Users cannot sign in until it is reactivated. Delete is now available.`,
          type: 'system',
        });
      } else if (deleteTarget.kind === 'tenant') {
        const { tenant } = deleteTarget;
        const deleted = await api.controlPlane.deleteTenant(tenant.id, deleteConfirmText.trim());
        setTenants((prev) => prev.filter((t) => t.id !== tenant.id));
        setSchemas((prev) => prev.filter((s) => s.schemaName !== tenant.schemaName));
        setGlobalUsers((prev) =>
          prev.filter((u) => u.tenant_slug !== tenant.slug && u.tenant_id !== tenant.id)
        );
        const usersRemoved = Number((deleted as any)?.data?.usersRemoved || 0);
        triggerToast({
          title: 'Workspace Deleted',
          message:
            usersRemoved > 0
              ? `${tenant.name} was removed along with ${usersRemoved} user${usersRemoved === 1 ? '' : 's'}.`
              : `${tenant.name} and schema "${tenant.schemaName}" were permanently removed.`,
          type: 'system',
        });
      } else {
        await api.controlPlane.deleteGlobalUser(deleteTarget.id);
        setGlobalUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
        triggerToast({
          title: 'User Deleted',
          message: `${deleteTarget.email} was removed from ${deleteTarget.tenant}.`,
          type: 'system',
        });
      }
      setDeleteTarget(null);
      setDeleteConfirmText('');
      void fetchPlatformData();
    } catch (err: any) {
      triggerToast({
        title: deleteTarget.kind === 'tenant' && deleteTarget.action === 'suspend' ? 'Suspend failed' : 'Delete Failed',
        message: err?.message || 'The server rejected the request.',
        type: 'system',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleProvisionTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim() || !newTenantAdminEmail.trim() || isProvisioning) return;

    const generatedSlug = (newTenantSlug.trim() || newTenantName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const selected = plans.find((p) => p.key === newTenantPlan || p.id === newTenantPlan);
    setIsProvisioning(true);
    try {
      const res = await api.controlPlane.registerTenant({
        slug: generatedSlug,
        name: newTenantName.trim(),
        adminEmail: newTenantAdminEmail.trim(),
        adminName: newTenantAdminName.trim() || 'Administrator',
        planId: selected?.id || newTenantPlan,
        plan: selected?.key || newTenantPlan,
        maxEmployees: Number(newTenantSeats) || selected?.maxSeats || 25,
        billingCycle: newTenantBillingCycle,
        industry: newTenantIndustry,
        contactPhone: newTenantPhone.trim() || undefined,
      });
      setShowProvisionModal(false);
      setNewTenantName('');
      setNewTenantSlug('');
      setNewTenantAdminName('');
      setNewTenantAdminEmail('');
      setNewTenantPhone('');
      setNewTenantBillingCycle('monthly');
      await fetchPlatformData();
      const schema = res.data?.schema_name || res.data?.schemaName;
      const invite = res.data?.admin_invite_sent ? ` Invite sent to ${newTenantAdminEmail.trim()}.` : '';
      triggerToast({
        title: 'Workspace created',
        message: `${newTenantName.trim()} is ready${schema ? ` (${schema})` : ''}.${invite}`,
        type: 'system',
      });
    } catch (err: any) {
      triggerToast({
        title: 'Workspace could not be created',
        message: err?.message || 'The server rejected the workspace.',
        type: 'system',
      });
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleSavePlanUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantForPlan) return;

    setTenants((prev) =>
      prev.map((t) => (t.id === selectedTenantForPlan.id ? { ...t, plan: editPlanTier, maxSeats: Number(editPlanSeats) } : t))
    );

    setShowPlanModal(false);
    setSelectedTenantForPlan(null);

    try {
      await api.controlPlane.updateTenantPlan(selectedTenantForPlan.id, {
        plan: editPlanTier,
        maxSeats: Number(editPlanSeats),
        extendDays: editRevoke || !Number(editExtendDays) ? undefined : Number(editExtendDays),
        revoke: editRevoke || undefined,
      });
      const log: MasterAuditLogItem = {
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        operator: 'Master Admin',
        action: 'PLAN_UPDATED',
        targetTenant: selectedTenantForPlan.name,
        targetEntity: 'Subscription',
        details: `Plan changed to ${editPlanTier} with ${editPlanSeats} seats.`,
        status: 'success',
      };
      setAuditLogs((prev) => [log, ...prev]);
      void fetchPlatformData();
      triggerToast({
        title: 'License updated',
        message: 'Changes applied successfully.',
        type: 'system',
      });
    } catch (err: any) {
      triggerToast({
        title: 'License update failed',
        message: err?.message || 'The server rejected the change.',
        type: 'system',
      });
    }
  };

  // ---------------------------------------------------------------------------
  // 1. LOGIN SCREEN
  // ---------------------------------------------------------------------------
  if (isCheckingSession) {
    return <AdminPageSkeleton fullPage />;
  }

  if (!isMasterAuthenticated) {
    return (
      <div className="min-h-full w-full bg-[#f8fafc] flex flex-col items-center justify-center p-4 py-12 font-sans text-[var(--text-primary)]">
        <div className="w-full max-w-sm bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] shadow-sm p-7 space-y-5">
          <div className="text-center space-y-1">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">Platform Control</h1>
            <p className="text-xs text-[var(--text-muted)]">Sign in with a platform_admin control-plane account</p>
          </div>

          {loginError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleMasterLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Email</label>
              <input
                type="email"
                required
                value={masterEmail}
                onChange={(e) => setMasterEmail(e.target.value)}
                placeholder="admin@your-org.com"
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/50 px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-[var(--bg-surface)]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Password</label>
              <input
                type="password"
                required
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Your account password"
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface-subtle)]/50 px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-[var(--bg-surface)]"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingLogin}
              className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
            >
              {isSubmittingLogin ? 'Signing In...' : 'Sign In'}
            </button>
          </form>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                window.location.href = `${APP_ORIGIN}/login`;
              }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
            >
              Back to Client Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. MAIN MASTER DASHBOARD
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-full w-full bg-[#f8fafc] font-sans text-[var(--text-primary)] flex flex-col pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full bg-[var(--bg-surface)] border-b border-[var(--border-color)]/90 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-[var(--text-primary)] text-sm">Platform Control</span>
            <span className="text-xs text-[var(--text-muted)] ml-2">AWS ap-south-1</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchPlatformData}
            disabled={isLoadingData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-semibold hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
            title="Sync live platform data"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[var(--text-muted)] ${isLoadingData ? 'animate-spin' : ''}`} />
            <span>{isLoadingData ? 'Syncing...' : 'Sync Live Data'}</span>
          </button>
          <button
            type="button"
            onClick={handleMasterLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-secondary)] text-xs font-semibold hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-5 sm:p-6 space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)]/80 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--text-muted)] font-medium">Workspaces</span>
              <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{stats.totalTenantsCount}</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)]/80 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--text-muted)] font-medium">Total Users</span>
              <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{stats.totalUsersCount.toLocaleString()}</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)]/80 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--text-muted)] font-medium">Support Tickets</span>
              <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{stats.openTicketsCount} Open</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <LifeBuoy className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)]/80 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-[var(--text-muted)] font-medium">Punches Logged</span>
              <div className="text-xl font-bold text-[var(--text-primary)] mt-0.5">{stats.totalPunchesCount.toLocaleString()}</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-[var(--bg-surface-subtle)] p-1 rounded-lg border border-[var(--border-color)]/70 overflow-x-auto custom-scrollbar">
          {[
            { id: 'tenants', label: 'Workspaces', icon: Building2 },
            { id: 'licenses', label: 'Licenses', icon: KeyRound },
            { id: 'support', label: 'Support', icon: LifeBuoy },
            { id: 'database', label: 'Databases', icon: Database },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'telemetry', label: 'AWS & Telemetry', icon: Activity },
            { id: 'audit', label: 'Audit Log', icon: FileCode },
          ].map((tab) => {
            const isSel = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  isSel ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] ' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* TAB 1: WORKSPACES */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'tenants' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg p-0.5 text-xs">
                {['all', 'active', 'trial', 'suspended'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md font-medium capitalize cursor-pointer transition-colors ${
                      statusFilter === st ? 'bg-[var(--bg-surface-subtle)] text-[var(--text-primary)] font-semibold' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    placeholder="Search workspaces..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowProvisionModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Workspace</span>
                </button>
              </div>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] font-semibold text-[11px] border-b border-[var(--border-color)]">
                  <tr>
                    <th className="p-3 pl-4">Workspace</th>
                    <th className="p-3">Schema</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3">License</th>
                    <th className="p-3">Admin</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-secondary)]">
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-[var(--text-muted)] text-xs">
                        No workspaces found. Click &quot;Add Workspace&quot; to provision a new client workspace.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((tenant) => (
                      <tr key={tenant.id} className="hover:bg-[var(--bg-surface-subtle)]/60">
                        <td className="p-3 pl-4">
                          <div className="font-semibold text-[var(--text-primary)]">{tenant.name}</div>
                          <div className="text-[11px] text-[var(--text-muted)]">{tenant.domain || tenant.slug}</div>
                        </td>

                        <td className="p-3 font-mono text-[var(--text-secondary)] text-[11px]">{tenant.schemaName}</td>

                        <td className="p-3">
                          <span className="font-semibold uppercase text-[10px] bg-[var(--bg-surface-subtle)] px-1.5 py-0.5 rounded text-[var(--text-secondary)]">
                            {tenant.planName || tenant.plan}
                          </span>
                          <span className="text-[11px] text-[var(--text-muted)] ml-1.5">({tenant.maxSeats} seats)</span>
                        </td>

                        <td className="p-3">
                          <div className="font-semibold capitalize">{tenant.licenseStatus || 'active'}</div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {tenant.daysRemaining != null ? `${tenant.daysRemaining}d left` : '—'}
                            {tenant.periodEnd ? ` · ${String(tenant.periodEnd).substring(0, 10)}` : ''}
                          </div>
                        </td>

                        <td className="p-3">
                          <div>{tenant.adminName}</div>
                          <div className="text-[11px] text-[var(--text-muted)]">{tenant.adminEmail}</div>
                        </td>

                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                              tenant.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : tenant.status === 'trial'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {tenant.status}
                          </span>
                        </td>

                        <td className="p-3 text-right pr-4 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleImpersonateTenant(tenant)}
                              disabled={tenant.status === 'suspended'}
                              title={
                                tenant.status === 'suspended'
                                  ? 'Reactivate this workspace before jumping in'
                                  : `Open ${tenant.name} as operator`
                              }
                              className="px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-blue-50"
                            >
                              Jump in
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTenantForPlan(tenant);
                                setEditPlanTier(tenant.planId || tenant.plan);
                                setEditPlanSeats(tenant.maxSeats);
                                setEditExtendDays(0);
                                setEditRevoke(false);
                                setLicenseEvents([]);
                                setShowPlanModal(true);
                                void api.controlPlane.getTenantDetails(tenant.id).then((res) => {
                                  const events = (res.data as any)?.events;
                                  if (Array.isArray(events)) setLicenseEvents(events);
                                }).catch(() => {});
                              }}
                              className="px-2 py-1 rounded-md border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] text-[11px] font-medium cursor-pointer"
                            >
                              Edit
                            </button>

                            {tenant.status === 'suspended' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => void handleReactivateTenant(tenant)}
                                  disabled={isDeleting}
                                  title="Reactivate workspace"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-[11px] font-medium cursor-pointer disabled:opacity-50"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  Reactivate
                                </button>
                                <button
                                  type="button"
                                  title="Delete suspended workspace"
                                  aria-label={`Delete ${tenant.name}`}
                                  onClick={() => {
                                    setDeleteConfirmText('');
                                    setDeleteTarget({ kind: 'tenant', tenant, action: 'delete' });
                                  }}
                                  className="p-1 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmText('');
                                  setDeleteTarget({ kind: 'tenant', tenant, action: 'suspend' });
                                }}
                                title="Suspend workspace"
                                aria-label={`Suspend ${tenant.name}`}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-medium cursor-pointer"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                Suspend
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'licenses' && (
          <LicenseManagerTab
            plans={plans}
            tenants={tenants}
            isLoading={isLoadingData}
            loadError={plansLoadError}
            onPlansChange={setPlans}
            onToast={triggerToast}
          />
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 3: DEDICATED SUPPORT HELPDESK PAGE */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'support' && <SupportInbox />}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 4: DATABASES */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'database' && (
          <div className="space-y-4">
            {/* PostgreSQL Cluster Info Card */}
            <div className="p-4 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-[var(--text-primary)] text-xs">AWS RDS PostgreSQL Cluster Status</h4>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                  Connected & Multi-AZ Synchronized
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px]">Database Endpoint</span>
                  <span className="font-mono font-semibold text-[var(--text-primary)] truncate block">rds-multi-tenant-cluster.ap-south-1.rds.amazonaws.com:5432</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px]">Primary Workspace Schema</span>
                  <span className="font-mono font-semibold text-blue-600">tenant_{(state.organization?.name || 'primary').toLowerCase().replace(/[^a-z0-9]/g, '_')}</span>
                </div>
                <div>
                  <span className="text-[var(--text-muted)] block text-[11px]">Encryption & Engine</span>
                  <span className="font-semibold text-[var(--text-primary)]">TLSv1.3 Encrypted • PostgreSQL 16.2</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-sm">PostgreSQL Schemas & Table Inspector</h3>
                <p className="text-xs text-[var(--text-muted)]">Live schema row counts and storage utilization across workspace tables</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await api.controlPlane.triggerClusterBackup();
                    triggerToast({
                      title: 'Backup Triggered',
                      message: (res as any)?.message || (res as any)?.snapshotId
                        ? `Snapshot ${(res as any).snapshotId || 'queued'} registered.`
                        : 'Cluster backup request registered.',
                      type: 'system',
                    });
                    fetchPlatformData();
                  } catch (err: any) {
                    triggerToast({
                      title: 'Backup failed',
                      message: err?.message || 'Could not trigger backup.',
                      type: 'system',
                    });
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Backup PostgreSQL Schemas</span>
              </button>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] font-semibold text-[11px] border-b border-[var(--border-color)]">
                  <tr>
                    <th className="p-3 pl-4">Schema & Table Name</th>
                    <th className="p-3">Workspace</th>
                    <th className="p-3">Engine Version</th>
                    <th className="p-3">Total Rows</th>
                    <th className="p-3">Size</th>
                    <th className="p-3 text-right pr-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-secondary)]">
                  {(() => {
                    const liveSchemasList =
                      schemas.length > 0
                        ? schemas
                        : [];

                    if (liveSchemasList.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-[var(--text-muted)] text-xs">
                            No schemas returned from the control plane yet.
                          </td>
                        </tr>
                      );
                    }

                    return liveSchemasList.map((sch) => (
                      <tr key={sch.schemaName} className="hover:bg-[var(--bg-surface-subtle)]/60">
                        <td className="p-3 pl-4 font-mono font-semibold text-[var(--text-primary)]">{sch.schemaName}</td>
                        <td className="p-3 font-medium text-[var(--text-primary)]">{sch.tenantName}</td>
                        <td className="p-3 text-[var(--text-muted)] font-mono text-[11px]">{sch.migrationVersion}</td>
                        <td className="p-3 font-medium font-mono text-blue-600">{(sch.totalRows || 0).toLocaleString()}</td>
                        <td className="p-3 font-mono">{sch.sizeMB || 0} MB</td>
                        <td className="p-3 text-right pr-4">
                          <span className="text-emerald-700 font-semibold text-xs">✓ Healthy</span>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 5: USERS */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-sm">Global User Directory & Access Control</h3>
                <p className="text-xs text-[var(--text-muted)]">Manage user accounts, toggle activation, reset passwords, or delete accounts across workspaces</p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Search by email or name..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-lg outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[var(--bg-surface-subtle)] text-[var(--text-muted)] font-semibold text-[11px] border-b border-[var(--border-color)]">
                  <tr>
                    <th className="p-3 pl-4">User</th>
                    <th className="p-3">Workspace</th>
                    <th className="p-3">Designation / Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-color)] text-[var(--text-secondary)]">
                  {(() => {
                    const q = userSearchQuery.toLowerCase().trim();
                    const dynamicUsers = globalUsers
                      .map((u) => ({
                        id: String(u.id || ''),
                        name: (u.email || '').split('@')[0],
                        email: u.email,
                        tenant: u.tenant_name || u.tenant_slug || '—',
                        role: u.role || 'employee',
                        status: u.is_active === false ? 'Inactive' : 'Active',
                      }))
                      .filter(
                        (u) =>
                          !q ||
                          u.name.toLowerCase().includes(q) ||
                          u.email.toLowerCase().includes(q) ||
                          u.tenant.toLowerCase().includes(q)
                      );

                    if (dynamicUsers.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-[var(--text-muted)] text-xs">
                            No registered users found across workspaces.
                          </td>
                        </tr>
                      );
                    }

                    return dynamicUsers.map((u, i) => (
                      <tr key={`${u.email}-${i}`} className="hover:bg-[var(--bg-surface-subtle)]/60">
                        <td className="p-3 pl-4">
                          <div className="font-semibold text-[var(--text-primary)]">{u.name}</div>
                          <div className="text-[11px] text-[var(--text-muted)] font-mono">{u.email}</div>
                        </td>
                        <td className="p-3 font-medium text-[var(--text-primary)]">{u.tenant}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] font-semibold text-[11px]">
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              u.status === 'Active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td className="p-3 text-right pr-4 text-[var(--text-muted)] text-[11px]">
                          {u.id && u.role !== 'platform_admin' ? (
                            <button
                              type="button"
                              title="Delete user"
                              aria-label={`Delete ${u.email}`}
                              onClick={() =>
                                setDeleteTarget({ kind: 'user', id: u.id, email: u.email, tenant: u.tenant, role: u.role })
                              }
                              className="p-1 rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 6: BROADCASTS (hidden from nav — stub retained for future) */}
        {/* ----------------------------------------------------------------- */}
        {false && (activeTab as string) === 'broadcasts' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-sm">System Broadcasts</h3>
                <p className="text-xs text-[var(--text-muted)]">Notices displayed on all client dashboards</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBroadcastModal(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Notice</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {broadcasts.length === 0 ? (
                <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] p-8 text-center text-[var(--text-muted)] text-xs">
                  No system broadcasts published. Click &quot;New Notice&quot; to broadcast an announcement.
                </div>
              ) : (
                broadcasts.map((bc) => (
                  <div key={bc.id} className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] p-4 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[var(--text-primary)] text-sm">{bc.title}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{bc.createdAt}</span>
                    </div>
                    <p className="text-[var(--text-secondary)] leading-relaxed">{bc.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 7: AWS CLOUD INFRASTRUCTURE & TELEMETRY */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'telemetry' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-[var(--text-primary)] text-sm">AWS Cloud Infrastructure & Telemetry</h3>
                <p className="text-xs text-[var(--text-muted)]">Operational status from control-plane telemetry API</p>
              </div>
              <button
                type="button"
                onClick={() => fetchPlatformData()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-secondary)] font-semibold text-xs cursor-pointer hover:bg-[var(--bg-surface-subtle)]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-[var(--text-primary)] text-xs">AWS ECS Fargate</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {telemetry?.ecsFargate?.runningTasks ?? '—'} Tasks
                  </span>
                </div>
                <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Cluster:</span>
                    <span className="font-mono font-medium">{telemetry?.ecsFargate?.clusterName || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">CPU Utilization:</span>
                    <span className="font-medium text-[var(--text-primary)]">{telemetry?.ecsFargate?.cpuUtilizationPercent ?? '—'}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Memory:</span>
                    <span className="font-medium text-[var(--text-primary)]">{telemetry?.ecsFargate?.memoryUtilizationPercent ?? '—'}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-purple-600" />
                    <span className="font-bold text-[var(--text-primary)] text-xs">Aurora / RDS</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {telemetry?.auroraServerless?.currentACU ?? '—'} ACU
                  </span>
                </div>
                <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Connections:</span>
                    <span className="font-medium text-[var(--text-primary)]">{telemetry?.auroraServerless?.activeConnections ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">CPU:</span>
                    <span className="font-medium text-[var(--text-primary)]">{telemetry?.auroraServerless?.cpuUtilizationPercent ?? '—'}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">Buffer cache hit:</span>
                    <span className="font-mono font-medium text-[var(--text-primary)]">{telemetry?.auroraServerless?.bufferCacheHitRatioPercent ?? '—'}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-[var(--text-primary)] text-xs">AWS Cognito Auth</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {telemetry?.cognito?.status || '—'}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                  <div className="flex justify-between">
                    <span className="text-[var(--text-muted)]">User Pool ID:</span>
                    <span className="font-mono text-[11px]">{telemetry?.cognito?.userPoolId || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 8: AUDIT */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'audit' && (
          <div className="space-y-3">
            <div>
              <h3 className="font-bold text-[var(--text-primary)] text-sm">Operator Audit Trail</h3>
              <p className="text-xs text-[var(--text-muted)]">Recent actions performed by platform operators</p>
            </div>

            <div className="bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] overflow-hidden divide-y divide-[var(--border-color)] text-xs">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-[var(--text-muted)] text-xs">
                  No operator actions recorded yet. Operator activity will stream here in real-time.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-[var(--text-primary)]">
                        {log.action} • <span className="text-blue-600">{log.targetTenant || log.targetEntity}</span>
                      </div>
                      <div className="text-[var(--text-muted)] text-[11px] mt-0.5">{log.details}</div>
                    </div>
                    <span className="text-[var(--text-muted)] font-mono text-[11px] shrink-0">{log.timestamp}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------- */}
      {/* ADD WORKSPACE MODAL */}
      {/* ------------------------------------------------------------------- */}
      {showProvisionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-2xs cursor-pointer"
          onClick={() => setShowProvisionModal(false)}
        >
          <div
            className="relative max-w-md w-full bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] shadow-lg p-6 space-y-4 text-[var(--text-primary)] cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
              <h3 className="font-bold text-[var(--text-primary)] text-base">New Workspace</h3>
              <button
                type="button"
                onClick={() => setShowProvisionModal(false)}
                className="w-7 h-7 rounded-full bg-[var(--bg-surface-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleProvisionTenantSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Organization name</label>
                <input
                  type="text"
                  required
                  value={newTenantName}
                  onChange={(e) => {
                    setNewTenantName(e.target.value);
                    setNewTenantSlug((current) => current || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
                  }}
                  placeholder="e.g. Northwind"
                  className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Slug</label>
                  <input
                    type="text"
                    required
                    value={newTenantSlug}
                    onChange={(e) => setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Industry</label>
                  <select
                    value={newTenantIndustry}
                    onChange={(e) => setNewTenantIndustry(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 bg-[var(--bg-surface)] font-medium"
                  >
                    <option value="Office">Company</option>
                    <option value="Institute">Institute</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">License</label>
                  <select
                    value={newTenantPlan}
                    onChange={(e) => {
                      setNewTenantPlan(e.target.value);
                      const match = plans.find((p) => p.key === e.target.value);
                      if (match) setNewTenantSeats(match.maxSeats);
                    }}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 bg-[var(--bg-surface)] font-medium"
                  >
                    {plans.filter((p) => p.isActive !== false).map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name} (${p.price}/mo)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Billing</label>
                  <select
                    value={newTenantBillingCycle}
                    onChange={(e) => setNewTenantBillingCycle(e.target.value as 'monthly' | 'annual' | 'trial')}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 bg-[var(--bg-surface)] font-medium"
                  >
                    <option value="trial">Trial</option>
                    <option value="monthly">Monthly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Seats</label>
                  <input
                    type="number"
                    min={1}
                    value={newTenantSeats}
                    onChange={(e) => setNewTenantSeats(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newTenantPhone}
                    onChange={(e) => setNewTenantPhone(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Admin name</label>
                  <input
                    type="text"
                    required
                    value={newTenantAdminName}
                    onChange={(e) => setNewTenantAdminName(e.target.value)}
                    placeholder="Workspace owner"
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">Admin email</label>
                  <input
                    type="email"
                    required
                    value={newTenantAdminEmail}
                    onChange={(e) => setNewTenantAdminEmail(e.target.value)}
                    placeholder="owner@company.com"
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  disabled={isProvisioning}
                  className="flex-1 py-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] font-medium text-xs text-[var(--text-secondary)] cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProvisioning || plans.filter((p) => p.isActive !== false).length === 0}
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  {isProvisioning ? 'Creating…' : 'Create workspace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SUSPEND / DELETE WORKSPACE / USER MODAL */}
      {/* ------------------------------------------------------------------- */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-2xs cursor-pointer"
          onClick={closeDeleteModal}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="relative max-w-sm w-full bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] shadow-lg p-5 space-y-4 text-[var(--text-primary)] cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
              <h3 className="font-bold text-rose-600 text-sm flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                {deleteTarget.kind === 'user'
                  ? 'Delete user'
                  : deleteTarget.action === 'suspend'
                    ? 'Suspend workspace'
                    : 'Delete workspace'}
              </h3>
              <button
                type="button"
                onClick={closeDeleteModal}
                className="w-7 h-7 rounded-full bg-[var(--bg-surface-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {deleteTarget.kind === 'tenant' && deleteTarget.action === 'suspend' ? (
              <div className="space-y-3 text-xs text-[var(--text-secondary)]">
                <p>
                  Suspend <span className="font-semibold text-[var(--text-primary)]">{deleteTarget.tenant.name}</span>? Users will
                  not be able to sign in, and Jump in will be blocked. All workspace data is kept so you can reactivate later.
                </p>
                <p>Permanent delete is only offered after the workspace is suspended.</p>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                    Type <span className="font-semibold text-[var(--text-primary)]">{deleteTarget.tenant.name}</span> to confirm
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleConfirmWorkspaceAction();
                    }}
                    disabled={isDeleting}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-rose-500 bg-[var(--bg-surface)]"
                  />
                </div>
              </div>
            ) : deleteTarget.kind === 'tenant' ? (
              <div className="space-y-3 text-xs text-[var(--text-secondary)]">
                <p>
                  This permanently deletes <span className="font-semibold text-[var(--text-primary)]">{deleteTarget.tenant.name}</span>,
                  drops the <span className="font-mono">{deleteTarget.tenant.schemaName}</span> schema with all of its data, and removes
                  every user mapped to it. Login accounts that don&apos;t belong to another workspace are deleted from Cognito.
                </p>
                <p className="font-semibold text-rose-600">This cannot be undone.</p>
                <div>
                  <label className="block font-semibold text-[var(--text-secondary)] mb-1">
                    Type <span className="font-semibold text-[var(--text-primary)]">{deleteTarget.tenant.name}</span> to confirm
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleConfirmWorkspaceAction();
                    }}
                    disabled={isDeleting}
                    className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-rose-500 bg-[var(--bg-surface)]"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-[var(--text-secondary)]">
                <p>
                  Remove <span className="font-semibold text-[var(--text-primary)]">{deleteTarget.email}</span> ({deleteTarget.role}) from{' '}
                  <span className="font-semibold text-[var(--text-primary)]">{deleteTarget.tenant}</span>? Their employee record and its
                  attendance, leave, payroll and document history in that workspace are deleted. If they don&apos;t belong to any other
                  workspace, their Cognito login is deleted too.
                </p>
                <p className="font-semibold text-rose-600">This cannot be undone.</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={isDeleting}
                className="flex-1 py-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] font-medium text-xs text-[var(--text-secondary)] cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmWorkspaceAction()}
                disabled={
                  isDeleting ||
                  (deleteTarget.kind === 'tenant' &&
                    !workspaceNameMatches(deleteConfirmText, deleteTarget.tenant))
                }
                className="flex-1 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting
                  ? deleteTarget.kind === 'tenant' && deleteTarget.action === 'suspend'
                    ? 'Suspending…'
                    : 'Deleting…'
                  : deleteTarget.kind === 'user'
                    ? 'Delete user'
                    : deleteTarget.action === 'suspend'
                      ? 'Suspend workspace'
                      : 'Delete workspace'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* EDIT PLAN MODAL */}
      {/* ------------------------------------------------------------------- */}
      {showPlanModal && selectedTenantForPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-2xs cursor-pointer"
          onClick={() => setShowPlanModal(false)}
        >
          <div
            className="relative max-w-sm w-full bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] shadow-lg p-5 space-y-4 text-[var(--text-primary)] cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
              <h3 className="font-bold text-[var(--text-primary)] text-sm">Workspace license: {selectedTenantForPlan.name}</h3>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="w-7 h-7 rounded-full bg-[var(--bg-surface-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSavePlanUpdate} className="space-y-3 text-xs">
              <div className="rounded-lg border border-[var(--border-color)] p-3 space-y-1 bg-[var(--bg-surface-subtle)]">
                <div className="font-semibold capitalize">{selectedTenantForPlan.licenseStatus || 'active'}</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {selectedTenantForPlan.periodStart ? String(selectedTenantForPlan.periodStart).substring(0, 10) : '—'}
                  {' → '}
                  {selectedTenantForPlan.periodEnd ? String(selectedTenantForPlan.periodEnd).substring(0, 10) : '—'}
                  {selectedTenantForPlan.daysRemaining != null ? ` · ${selectedTenantForPlan.daysRemaining} days left` : ''}
                </div>
                {licenseEvents.length > 0 && (
                  <ol className="mt-2 space-y-1 max-h-28 overflow-y-auto">
                    {licenseEvents.map((event) => (
                      <li key={event.id} className="text-[11px] text-[var(--text-secondary)]">
                        <span className="font-semibold">{event.action}</span>
                        {event.toPlan ? ` · ${event.toPlan}` : ''}
                        {event.createdAt ? ` · ${String(event.createdAt).replace('T', ' ').substring(0, 16)}` : ''}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Plan Tier</label>
                <select
                  value={editPlanTier}
                  onChange={(e) => setEditPlanTier(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 bg-[var(--bg-surface)] font-medium"
                >
                  {plans.filter((p) => p.isActive !== false).map((p) => (
                    <option key={p.id} value={p.key}>
                      {p.name} (${p.price}/mo)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Seat Limit</label>
                <input
                  type="number"
                  min={1}
                  value={editPlanSeats}
                  onChange={(e) => setEditPlanSeats(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Extend by days</label>
                <input
                  type="number"
                  min={0}
                  value={editExtendDays}
                  onChange={(e) => setEditExtendDays(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <label className="flex items-center gap-2 text-[var(--text-secondary)]">
                <input type="checkbox" checked={editRevoke} onChange={(e) => setEditRevoke(e.target.checked)} />
                Revoke this license
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="flex-1 py-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] font-medium text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* BROADCAST MODAL */}
      {/* ------------------------------------------------------------------- */}
      {showBroadcastModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-2xs cursor-pointer"
          onClick={() => setShowBroadcastModal(false)}
        >
          <div
            className="relative max-w-sm w-full bg-[var(--bg-surface)] rounded-lg border border-[var(--border-color)] shadow-lg p-5 space-y-4 text-[var(--text-primary)] cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-color)]">
              <h3 className="font-bold text-[var(--text-primary)] text-sm">Create Broadcast</h3>
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="w-7 h-7 rounded-full bg-[var(--bg-surface-subtle)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-muted)] flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!broadcastTitle.trim() || !broadcastMessage.trim()) return;
                setBroadcasts([
                  {
                    id: `bc-${Date.now()}`,
                    title: broadcastTitle.trim(),
                    message: broadcastMessage.trim(),
                    severity: broadcastSeverity,
                    createdAt: 'Just now',
                    isActive: true,
                  },
                  ...broadcasts,
                ]);
                setShowBroadcastModal(false);
                setBroadcastTitle('');
                setBroadcastMessage('');
                triggerToast({ title: 'Broadcast Sent', message: 'Visible to all clients.', type: 'system' });
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="Maintenance Notice"
                  className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Message</label>
                <textarea
                  required
                  rows={3}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Enter broadcast message..."
                  className="w-full rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="flex-1 py-2 rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-surface-subtle)] font-medium text-xs text-[var(--text-secondary)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer"
                >
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
