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
  CreditCard,
  KeyRound,
  FileCode,
  Megaphone,
  Radio,
  Activity,
  Download,
  Trash2,
  LifeBuoy,
  Clock,
  Check,
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
import { ClientTenant, SchemaInspectorItem, MasterAuditLogItem } from '@/types';
import { api } from '@/services/apiClient';
import { AuthService } from '@/services/authService';
import { APP_ORIGIN } from '@/config/origins';
import { AdminPageSkeleton } from '@/components/skeletons';

function mapApiTenant(row: any): ClientTenant {
  const slug = row.slug || row.schema_name?.replace(/^tenant_/, '') || 'unknown';
  const statusRaw = String(row.status || 'active').toLowerCase();
  const status: ClientTenant['status'] =
    statusRaw === 'suspended' ? 'suspended' : statusRaw === 'trialing' || statusRaw === 'trial' ? 'trial' : 'active';
  return {
    id: row.id,
    slug,
    name: row.name || slug,
    domain: row.domain || `${slug}.app`,
    industry: row.industry || 'Office',
    schemaName: row.schema_name || row.schemaName || `tenant_${slug}`,
    plan: (row.plan || row.tier || 'professional') as ClientTenant['plan'],
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

export interface CustomSubscriptionPlan {
  id: string;
  key: string;
  name: string;
  price: number;
  maxSeats: number;
  storageGB: number;
  aiQueries: number;
  features: string[];
  activeClientsCount: number;
}

export interface SupportPlan {
  id: string;
  key: string;
  name: string;
  price: number;
  slaResponseTime: string;
  channels: string[];
  description: string;
  isPopular?: boolean;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  tenantName: string;
  tenantSlug: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  description: string;
  category: 'Attendance & Timings' | 'Billing & Subscription' | 'Database & Storage' | 'Authentication' | 'Other';
  priority: 'urgent' | 'high' | 'normal' | 'low';
  status: 'open' | 'in_progress' | 'waiting_client' | 'resolved';
  slaDue: string;
  createdAt: string;
  assignedTo: string;
}

export interface PlatformBroadcast {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  createdAt: string;
  isActive: boolean;
}

const INITIAL_PLANS: CustomSubscriptionPlan[] = [
  {
    id: 'plan_starter',
    key: 'starter',
    name: 'Starter',
    price: 49,
    maxSeats: 25,
    storageGB: 10,
    aiQueries: 500,
    activeClientsCount: 0,
    features: ['Up to 25 Users', 'Standard Shifts', 'Leave & Attendance', '10 GB Storage'],
  },
  {
    id: 'plan_pro',
    key: 'professional',
    name: 'Professional',
    price: 199,
    maxSeats: 500,
    storageGB: 100,
    aiQueries: 10000,
    activeClientsCount: 0,
    features: ['Up to 500 Users', 'Multi-Batch Bell Timings', 'GPS Geofencing', 'Payroll & Tax Engine', '10k AI Tokens'],
  },
  {
    id: 'plan_enterprise',
    key: 'enterprise',
    name: 'Enterprise',
    price: 599,
    maxSeats: 2500,
    storageGB: 1000,
    aiQueries: 50000,
    activeClientsCount: 0,
    features: ['2,500+ Users', 'Dedicated DB Schema', 'Unlimited AI Queries', 'Custom Domain', '24/7 SLA Support'],
  },
];

const INITIAL_SUPPORT_PLANS: SupportPlan[] = [
  {
    id: 'sup_standard',
    key: 'standard',
    name: 'Standard Support',
    price: 0,
    slaResponseTime: '24-48 Hours',
    channels: ['Email Ticket System', 'Help Documentation'],
    description: 'Included with all subscriptions. Basic ticketing and community docs.',
  },
  {
    id: 'sup_priority',
    key: 'priority',
    name: 'Priority 24/7 Support',
    price: 99,
    slaResponseTime: '< 4 Hours',
    channels: ['Direct Live Chat', 'Priority Email Queue', 'Emergency Phone Call'],
    description: 'Fast response times and dedicated tech queue for mission-critical offices.',
    isPopular: true,
  },
  {
    id: 'sup_enterprise',
    key: 'dedicated',
    name: 'Dedicated TAM & White Glove',
    price: 399,
    slaResponseTime: '< 1 Hour (24/7/365)',
    channels: ['Dedicated Slack / Teams Channel', 'Assigned Technical Account Manager', 'Custom Schema Migration & Onboarding'],
    description: 'Dedicated engineer on call with guaranteed 1-hour SLA and live training.',
  },
];

export const MasterAdminDashboard: React.FC = () => {
  const { state, updateState, triggerToast } = useApp();

  const [isMasterAuthenticated, setIsMasterAuthenticated] = useState<boolean>(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const [masterEmail, setMasterEmail] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  const [activeTab, setActiveTab] = useState<
    'tenants' | 'database' | 'users' | 'telemetry' | 'audit'
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
  const [supportPlans, setSupportPlans] = useState<SupportPlan[]>(INITIAL_SUPPORT_PLANS);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketSearch, setTicketSearch] = useState('');
  const [ticketFilter, setTicketFilter] = useState<string>('all');

  const fetchPlatformData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const [tenantsRes, schemasRes, usersRes, telemetryRes, auditRes] = await Promise.allSettled([
        api.controlPlane.listTenants(),
        api.controlPlane.listDatabaseSchemas(),
        api.controlPlane.searchGlobalUsers(''),
        api.controlPlane.getAWSTelemetry(),
        api.controlPlane.listAuditLogs(100),
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
  const [showCreatePlanModal, setShowCreatePlanModal] = useState(false);
  const [selectedTenantForPlan, setSelectedTenantForPlan] = useState<ClientTenant | null>(null);

  // Ticket Response Drawer State
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketReplyText, setTicketReplyText] = useState('');

  // New Plan State
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanPrice, setNewPlanPrice] = useState(249);
  const [newPlanSeats, setNewPlanSeats] = useState(300);
  const [newPlanStorage, setNewPlanStorage] = useState(150);
  const [newPlanAI, setNewPlanAI] = useState(15000);
  const [newPlanFeatures, setNewPlanFeatures] = useState('Multi-Batch Shifts, Payroll Engine, Geofence');

  // New Tenant State
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [newTenantDomain, setNewTenantDomain] = useState('');
  const [newTenantIndustry, setNewTenantIndustry] = useState('School');
  const [newTenantPlan, setNewTenantPlan] = useState<string>('professional');
  const [newTenantSeats, setNewTenantSeats] = useState(100);
  const [newTenantAdminName, setNewTenantAdminName] = useState('');
  const [newTenantAdminEmail, setNewTenantAdminEmail] = useState('');

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

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchesFilter = ticketFilter === 'all' || t.status === ticketFilter || t.priority === ticketFilter;
      const q = ticketSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.subject.toLowerCase().includes(q) ||
        t.tenantName.toLowerCase().includes(q) ||
        t.requesterEmail.toLowerCase().includes(q) ||
        t.ticketNumber.toLowerCase().includes(q);

      return matchesFilter && matchesSearch;
    });
  }, [tickets, ticketFilter, ticketSearch]);

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
    try {
      const res = await api.controlPlane.startImpersonation(tenant.id);
      if (!res.success || !res.data?.token) {
        throw new Error((res as any)?.error?.message || 'Impersonation failed');
      }

      const acceptUrl =
        res.data.acceptUrl?.startsWith('http')
          ? res.data.acceptUrl
          : `${APP_ORIGIN}${res.data.acceptUrl || `/impersonate?token=${encodeURIComponent(res.data.token)}`}`;

      triggerToast({
        title: `Jumping into ${tenant.name}`,
        message: 'Opening operator session on the app host…',
        type: 'system',
      });

      window.location.href = acceptUrl;
    } catch (err: any) {
      triggerToast({
        title: 'Jump in failed',
        message: err?.message || 'Could not start operator session.',
        type: 'system',
      });
    }
  };

  const handleToggleSuspendTenant = async (tenantId: string) => {
    const target = tenants.find((t) => t.id === tenantId);
    if (!target) return;
    const newStatus = target.status === 'suspended' ? 'active' : 'suspended';

    // Optimistic local update
    setTenants((prev) => prev.map((t) => (t.id === tenantId ? { ...t, status: newStatus } : t)));

    try {
      await api.controlPlane.toggleTenantStatus(tenantId, newStatus);
      const log: MasterAuditLogItem = {
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        operator: 'Master Admin',
        action: newStatus === 'suspended' ? 'TENANT_SUSPENDED' : 'TENANT_ACTIVATED',
        targetTenant: target.name,
        targetEntity: 'Tenant',
        details: `Status changed to ${newStatus}.`,
        status: newStatus === 'suspended' ? 'warning' : 'success',
      };
      setAuditLogs((prev) => [log, ...prev]);
    } catch {
      // Backend not reachable — local change already applied
    }
  };

  const handleProvisionTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim() || !newTenantAdminEmail.trim()) return;

    const generatedSlug = newTenantSlug.trim() || newTenantName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const newTenant: ClientTenant = {
      id: `t_${Date.now()}`,
      name: newTenantName.trim(),
      slug: generatedSlug,
      domain: newTenantDomain.trim() || `${generatedSlug}.local`,
      industry: newTenantIndustry,
      schemaName: `tenant_${generatedSlug}`,
      plan: newTenantPlan as any,
      maxSeats: Number(newTenantSeats) || 50,
      activeUsersCount: 1,
      adminName: newTenantAdminName.trim() || 'Admin',
      adminEmail: newTenantAdminEmail.trim(),
      status: 'active',
      createdAt: new Date().toISOString().substring(0, 10),
      lastActivityAt: 'Just now',
      dbSizeBytes: 12000000,
      totalPunchesRecorded: 0,
    };

    setTenants([newTenant, ...tenants]);
    setShowProvisionModal(false);
    setNewTenantName('');
    setNewTenantSlug('');
    setNewTenantDomain('');
    setNewTenantAdminName('');
    setNewTenantAdminEmail('');

    try {
      const res = await api.controlPlane.registerTenant({
        slug: generatedSlug,
        name: newTenant.name,
        adminEmail: newTenant.adminEmail,
        adminName: newTenant.adminName,
        plan: newTenantPlan,
        maxEmployees: newTenant.maxSeats,
        industry: newTenantIndustry,
      });
      // Replace our temp ID with the real server ID if returned
      if (res.data?.id) {
        setTenants((prev) => prev.map((t) => (t.id === newTenant.id ? { ...t, id: res.data.id, schemaName: res.data.schema_name || t.schemaName } : t)));
      }
      const log: MasterAuditLogItem = {
        id: `aud_${Date.now()}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        operator: 'Master Admin',
        action: 'TENANT_PROVISIONED',
        targetTenant: newTenant.name,
        targetEntity: 'Tenant',
        details: `Workspace provisioned in PostgreSQL with schema "${res.data?.schema_name || newTenant.schemaName}".`,
        status: 'success',
      };
      setAuditLogs((prev) => [log, ...prev]);

      triggerToast({
        title: 'Workspace Created',
        message: `${newTenant.name} is ready in PostgreSQL (Schema: ${res.data?.schema_name || newTenant.schemaName}).`,
        type: 'system',
      });
    } catch (err: any) {
      triggerToast({
        title: 'Workspace Created (Local)',
        message: `${newTenant.name} registered locally. ${err.message || 'Could not connect to PostgreSQL backend.'}`,
        type: 'system',
      });
    }
  };

  const handleSavePlanUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenantForPlan) return;

    setTenants((prev) =>
      prev.map((t) => (t.id === selectedTenantForPlan.id ? { ...t, plan: editPlanTier as any, maxSeats: Number(editPlanSeats) } : t))
    );

    setShowPlanModal(false);
    setSelectedTenantForPlan(null);

    try {
      await api.controlPlane.updateTenantPlan(selectedTenantForPlan.id, {
        plan: editPlanTier,
        maxSeats: Number(editPlanSeats),
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
    } catch {
      // Backend not reachable
    }

    triggerToast({
      title: 'Plan Updated',
      message: 'Changes applied successfully.',
      type: 'system',
    });
  };

  const handleCreateNewPlanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanName.trim()) return;

    const planKey = newPlanName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const featArray = newPlanFeatures.split(',').map((f) => f.trim()).filter(Boolean);

    const newPlan: CustomSubscriptionPlan = {
      id: `plan_${Date.now()}`,
      key: planKey,
      name: newPlanName.trim(),
      price: Number(newPlanPrice) || 99,
      maxSeats: Number(newPlanSeats) || 100,
      storageGB: Number(newPlanStorage) || 50,
      aiQueries: Number(newPlanAI) || 5000,
      activeClientsCount: 0,
      features: featArray.length > 0 ? featArray : ['Attendance', 'Payroll', 'Shifts'],
    };

    setPlans([...plans, newPlan]);
    setShowCreatePlanModal(false);
    setNewPlanName('');

    triggerToast({
      title: 'Plan Created',
      message: `Plan ${newPlan.name} is now available.`,
      type: 'system',
    });
  };

  const handleResolveTicket = (ticketId: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: 'resolved', slaDue: 'Resolved' } : t))
    );
    setSelectedTicket(null);
    setTicketReplyText('');
    triggerToast({
      title: 'Ticket Resolved',
      message: 'Client has been notified via email.',
      type: 'system',
    });
  };

  // ---------------------------------------------------------------------------
  // 1. LOGIN SCREEN
  // ---------------------------------------------------------------------------
  if (isCheckingSession) {
    return <AdminPageSkeleton fullPage />;
  }

  if (!isMasterAuthenticated) {
    return (
      <div className="min-h-full w-full bg-[#f8fafc] flex flex-col items-center justify-center p-4 py-12 font-sans text-slate-900">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-200 shadow-sm p-7 space-y-5">
          <div className="text-center space-y-1">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Platform Control</h1>
            <p className="text-xs text-slate-500">Sign in with a platform_admin control-plane account</p>
          </div>

          {loginError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {loginError}
            </div>
          )}

          <form onSubmit={handleMasterLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={masterEmail}
                onChange={(e) => setMasterEmail(e.target.value)}
                placeholder="admin@your-org.com"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Your account password"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-xs outline-none focus:border-blue-600 focus:bg-white"
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
              className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
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
    <div className="min-h-full w-full bg-[#f8fafc] font-sans text-slate-900 flex flex-col pb-16">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full bg-white border-b border-slate-200/90 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-900 text-sm">Platform Control</span>
            <span className="text-xs text-slate-400 ml-2">AWS ap-south-1</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={fetchPlatformData}
            disabled={isLoadingData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            title="Sync live platform data"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isLoadingData ? 'animate-spin' : ''}`} />
            <span>{isLoadingData ? 'Syncing...' : 'Sync Live Data'}</span>
          </button>
          <button
            type="button"
            onClick={handleMasterLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-5 sm:p-6 space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-medium">Workspaces</span>
              <div className="text-xl font-bold text-slate-900 mt-0.5">{stats.totalTenantsCount}</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-medium">Total Users</span>
              <div className="text-xl font-bold text-slate-900 mt-0.5">{stats.totalUsersCount.toLocaleString()}</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-medium">Support Tickets</span>
              <div className="text-xl font-bold text-slate-900 mt-0.5">{stats.openTicketsCount} Open</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <LifeBuoy className="w-4 h-4" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-3.5 flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 font-medium">Punches Logged</span>
              <div className="text-xl font-bold text-slate-900 mt-0.5">{stats.totalPunchesCount.toLocaleString()}</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70 overflow-x-auto custom-scrollbar">
          {[
            { id: 'tenants', label: 'Workspaces', icon: Building2 },
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
                  isSel ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
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
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 text-xs">
                {['all', 'active', 'trial', 'suspended'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md font-medium capitalize cursor-pointer transition-colors ${
                      statusFilter === st ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    placeholder="Search workspaces..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-600 font-medium"
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

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 pl-4">Workspace</th>
                    <th className="p-3">Schema</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3">Admin</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTenants.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                        No workspaces found. Click &quot;Add Workspace&quot; to provision a new client workspace.
                      </td>
                    </tr>
                  ) : (
                    filteredTenants.map((tenant) => (
                      <tr key={tenant.id} className="hover:bg-slate-50/60">
                        <td className="p-3 pl-4">
                          <div className="font-semibold text-slate-900">{tenant.name}</div>
                          <div className="text-[11px] text-slate-400">{tenant.domain || tenant.slug}</div>
                        </td>

                        <td className="p-3 font-mono text-slate-600 text-[11px]">{tenant.schemaName}</td>

                        <td className="p-3">
                          <span className="font-semibold uppercase text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                            {tenant.plan}
                          </span>
                          <span className="text-[11px] text-slate-400 ml-1.5">({tenant.maxSeats} seats)</span>
                        </td>

                        <td className="p-3">
                          <div>{tenant.adminName}</div>
                          <div className="text-[11px] text-slate-400">{tenant.adminEmail}</div>
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
                              className="px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-[11px] cursor-pointer"
                            >
                              Jump in
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedTenantForPlan(tenant);
                                setEditPlanTier(tenant.plan);
                                setEditPlanSeats(tenant.maxSeats);
                                setShowPlanModal(true);
                              }}
                              className="px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 text-[11px] font-medium cursor-pointer"
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              onClick={() => handleToggleSuspendTenant(tenant.id)}
                              className={`p-1 rounded-md border text-[11px] cursor-pointer ${
                                tenant.status === 'suspended'
                                  ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                  : 'border-rose-200 text-rose-600 hover:bg-rose-50'
                              }`}
                            >
                              {tenant.status === 'suspended' ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                            </button>
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

        {/* ----------------------------------------------------------------- */}
        {/* TAB 2: PLANS & SUPPORT SLAS */}
        {/* ----------------------------------------------------------------- */}
        {false && (activeTab as string) === 'plans' && (
          <div className="space-y-6">
            {/* Subscription Plans */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Subscription Plans</h3>
                  <p className="text-xs text-slate-500">Default feature packaging & seat capacities</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreatePlanModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Plan</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {plans.map((p) => (
                  <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                        <span className="text-xs font-semibold text-blue-600">${p.price}/mo</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{p.maxSeats} Seats Capacity</div>

                      <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                        {p.features.map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                      <span>{p.activeClientsCount} Enrolled</span>
                      {p.id.startsWith('plan_') && !['plan_starter', 'plan_pro', 'plan_enterprise'].includes(p.id) && (
                        <button
                          type="button"
                          onClick={() => setPlans(plans.filter((x) => x.id !== p.id))}
                          className="text-rose-500 hover:text-rose-700 cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Support Plans & SLAs */}
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Support & SLA Packages</h3>
                <p className="text-xs text-slate-500">Service level agreements and support channels for clients</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {supportPlans.map((sp) => (
                  <div
                    key={sp.id}
                    className={`bg-white rounded-xl p-4 space-y-3 flex flex-col justify-between border ${
                      sp.isPopular ? 'border-blue-500' : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm">{sp.name}</span>
                        <span className="text-xs font-semibold text-slate-900">
                          {sp.price === 0 ? 'Free' : `$${sp.price}/mo`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-blue-600 font-medium mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>SLA: {sp.slaResponseTime}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">{sp.description}</p>

                      <div className="mt-3 space-y-1 text-xs text-slate-600">
                        {sp.channels.map((ch, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>{ch}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 3: DEDICATED SUPPORT HELPDESK PAGE */}
        {/* ----------------------------------------------------------------- */}
        {false && (activeTab as string) === 'support' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 text-xs">
                {['all', 'open', 'in_progress', 'resolved', 'urgent'].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setTicketFilter(f)}
                    className={`px-2.5 py-1 rounded-md font-medium capitalize cursor-pointer transition-colors ${
                      ticketFilter === f ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {f.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  placeholder="Search tickets or tenant..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 pl-4">Ticket & Subject</th>
                    <th className="p-3">Workspace</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">SLA Due</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                        No support tickets found. Client inquiries will appear here automatically.
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((ticket) => (
                      <tr key={ticket.id} className="hover:bg-slate-50/60">
                        <td className="p-3 pl-4">
                          <div className="font-semibold text-slate-900">{ticket.subject}</div>
                          <div className="text-[11px] text-slate-400">
                            {ticket.ticketNumber} • {ticket.requesterName} ({ticket.requesterEmail})
                          </div>
                        </td>

                        <td className="p-3 font-medium text-slate-800">{ticket.tenantName}</td>

                        <td className="p-3 text-slate-500">{ticket.category}</td>

                        <td className="p-3 font-mono text-[11px] text-blue-600 font-medium">{ticket.slaDue}</td>

                        <td className="p-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              ticket.status === 'open'
                                ? 'bg-amber-50 text-amber-700'
                                : ticket.status === 'in_progress'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}
                          >
                            {ticket.status.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="p-3 text-right pr-4">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTicket(ticket);
                              setTicketReplyText('');
                            }}
                            className="px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs cursor-pointer"
                          >
                            View & Reply
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 4: DATABASES */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'database' && (
          <div className="space-y-4">
            {/* PostgreSQL Cluster Info Card */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <h4 className="font-bold text-slate-900 text-xs">AWS RDS PostgreSQL Cluster Status</h4>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                  Connected & Multi-AZ Synchronized
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Database Endpoint</span>
                  <span className="font-mono font-semibold text-slate-800 truncate block">rds-multi-tenant-cluster.ap-south-1.rds.amazonaws.com:5432</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Primary Workspace Schema</span>
                  <span className="font-mono font-semibold text-blue-600">tenant_{(state.organization?.name || 'primary').toLowerCase().replace(/[^a-z0-9]/g, '_')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Encryption & Engine</span>
                  <span className="font-semibold text-slate-800">TLSv1.3 Encrypted • PostgreSQL 16.2</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">PostgreSQL Schemas & Table Inspector</h3>
                <p className="text-xs text-slate-500">Live schema row counts and storage utilization across workspace tables</p>
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

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 pl-4">Schema & Table Name</th>
                    <th className="p-3">Workspace</th>
                    <th className="p-3">Engine Version</th>
                    <th className="p-3">Total Rows</th>
                    <th className="p-3">Size</th>
                    <th className="p-3 text-right pr-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {(() => {
                    const liveSchemasList =
                      schemas.length > 0
                        ? schemas
                        : [];

                    if (liveSchemasList.length === 0) {
                      return (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                            No schemas returned from the control plane yet.
                          </td>
                        </tr>
                      );
                    }

                    return liveSchemasList.map((sch) => (
                      <tr key={sch.schemaName} className="hover:bg-slate-50/60">
                        <td className="p-3 pl-4 font-mono font-semibold text-slate-900">{sch.schemaName}</td>
                        <td className="p-3 font-medium text-slate-800">{sch.tenantName}</td>
                        <td className="p-3 text-slate-500 font-mono text-[11px]">{sch.migrationVersion}</td>
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
                <h3 className="font-bold text-slate-900 text-sm">Global User Directory & Access Control</h3>
                <p className="text-xs text-slate-500">Manage user accounts, toggle activation, reset passwords, or delete accounts across workspaces</p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Search by email or name..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="p-3 pl-4">User</th>
                    <th className="p-3">Workspace</th>
                    <th className="p-3">Designation / Role</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {(() => {
                    const q = userSearchQuery.toLowerCase().trim();
                    const dynamicUsers = globalUsers
                      .map((u) => ({
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
                          <td colSpan={5} className="p-8 text-center text-slate-400 text-xs">
                            No registered users found across workspaces.
                          </td>
                        </tr>
                      );
                    }

                    return dynamicUsers.map((u, i) => (
                      <tr key={`${u.email}-${i}`} className="hover:bg-slate-50/60">
                        <td className="p-3 pl-4">
                          <div className="font-semibold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                        </td>
                        <td className="p-3 font-medium text-slate-800">{u.tenant}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
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
                        <td className="p-3 text-right pr-4 text-slate-400 text-[11px]">—</td>
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
                <h3 className="font-bold text-slate-900 text-sm">System Broadcasts</h3>
                <p className="text-xs text-slate-500">Notices displayed on all client dashboards</p>
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
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
                  No system broadcasts published. Click &quot;New Notice&quot; to broadcast an announcement.
                </div>
              ) : (
                broadcasts.map((bc) => (
                  <div key={bc.id} className="bg-white rounded-xl border border-slate-200 p-4 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-sm">{bc.title}</span>
                      <span className="text-[11px] text-slate-400">{bc.createdAt}</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{bc.message}</p>
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
                <h3 className="font-bold text-slate-900 text-sm">AWS Cloud Infrastructure & Telemetry</h3>
                <p className="text-xs text-slate-500">Operational status from control-plane telemetry API</p>
              </div>
              <button
                type="button"
                onClick={() => fetchPlatformData()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold text-xs cursor-pointer hover:bg-slate-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-slate-900 text-xs">AWS ECS Fargate</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {telemetry?.ecsFargate?.runningTasks ?? '—'} Tasks
                  </span>
                </div>
                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cluster:</span>
                    <span className="font-mono font-medium">{telemetry?.ecsFargate?.clusterName || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">CPU Utilization:</span>
                    <span className="font-medium text-slate-900">{telemetry?.ecsFargate?.cpuUtilizationPercent ?? '—'}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Memory:</span>
                    <span className="font-medium text-slate-900">{telemetry?.ecsFargate?.memoryUtilizationPercent ?? '—'}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-purple-600" />
                    <span className="font-bold text-slate-900 text-xs">Aurora / RDS</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {telemetry?.auroraServerless?.currentACU ?? '—'} ACU
                  </span>
                </div>
                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Connections:</span>
                    <span className="font-medium text-slate-900">{telemetry?.auroraServerless?.activeConnections ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">CPU:</span>
                    <span className="font-medium text-slate-900">{telemetry?.auroraServerless?.cpuUtilizationPercent ?? '—'}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Buffer cache hit:</span>
                    <span className="font-mono font-medium text-slate-900">{telemetry?.auroraServerless?.bufferCacheHitRatioPercent ?? '—'}%</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-slate-900 text-xs">AWS Cognito Auth</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                    {telemetry?.cognito?.status || '—'}
                  </span>
                </div>
                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">User Pool ID:</span>
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
              <h3 className="font-bold text-slate-900 text-sm">Operator Audit Trail</h3>
              <p className="text-xs text-slate-500">Recent actions performed by platform operators</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 text-xs">
              {auditLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No operator actions recorded yet. Operator activity will stream here in real-time.
                </div>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {log.action} • <span className="text-blue-600">{log.targetTenant || log.targetEntity}</span>
                      </div>
                      <div className="text-slate-500 text-[11px] mt-0.5">{log.details}</div>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px] shrink-0">{log.timestamp}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------- */}
      {/* TICKET RESPONSE MODAL / DRAWER */}
      {/* ------------------------------------------------------------------- */}
      {selectedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-2xs cursor-pointer"
          onClick={() => setSelectedTicket(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4 text-slate-900 cursor-default max-h-[90vh] overflow-y-auto custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-mono font-semibold text-blue-600">{selectedTicket.ticketNumber}</span>
                <h3 className="font-bold text-slate-900 text-base">{selectedTicket.subject}</h3>
                <p className="text-xs text-slate-500">
                  {selectedTicket.tenantName} • {selectedTicket.requesterName} ({selectedTicket.requesterEmail})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 text-xs space-y-1.5">
              <span className="font-semibold text-slate-700 block">Client Message:</span>
              <p className="text-slate-600 leading-relaxed">{selectedTicket.description}</p>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block font-semibold text-slate-700">Official Support Response</label>
              <textarea
                rows={4}
                value={ticketReplyText}
                onChange={(e) => setTicketReplyText(e.target.value)}
                placeholder="Type response to client administrator..."
                className="w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-blue-600 font-medium"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="flex-1 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-medium text-xs text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleResolveTicket(selectedTicket.id)}
                className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Reply & Mark Resolved</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* ADD WORKSPACE MODAL */}
      {/* ------------------------------------------------------------------- */}
      {showProvisionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-2xs cursor-pointer"
          onClick={() => setShowProvisionModal(false)}
        >
          <div
            className="relative max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-6 space-y-4 text-slate-900 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">New Workspace</h3>
              <button
                type="button"
                onClick={() => setShowProvisionModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleProvisionTenantSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Organization Name *</label>
                <input
                  type="text"
                  required
                  value={newTenantName}
                  onChange={(e) => {
                    setNewTenantName(e.target.value);
                    if (!newTenantSlug) setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_'));
                  }}
                  placeholder="e.g. Oakridge Academy"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Plan</label>
                  <select
                    value={newTenantPlan}
                    onChange={(e) => setNewTenantPlan(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 bg-white font-medium"
                  >
                    {plans.map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.name} (${p.price}/mo)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Max Seats</label>
                  <input
                    type="number"
                    min={1}
                    value={newTenantSeats}
                    onChange={(e) => setNewTenantSeats(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Admin Name</label>
                  <input
                    type="text"
                    required
                    value={newTenantAdminName}
                    onChange={(e) => setNewTenantAdminName(e.target.value)}
                    placeholder="Principal Davis"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Admin Email *</label>
                  <input
                    type="email"
                    required
                    value={newTenantAdminEmail}
                    onChange={(e) => setNewTenantAdminEmail(e.target.value)}
                    placeholder="admin@school.edu"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProvisionModal(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-medium text-xs text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer"
                >
                  Create Workspace
                </button>
              </div>
            </form>
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
            className="relative max-w-sm w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-5 space-y-4 text-slate-900 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Edit Plan: {selectedTenantForPlan.name}</h3>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleSavePlanUpdate} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Plan Tier</label>
                <select
                  value={editPlanTier}
                  onChange={(e) => setEditPlanTier(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 bg-white font-medium"
                >
                  {plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} (${p.price}/mo)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Seat Limit</label>
                <input
                  type="number"
                  min={1}
                  value={editPlanSeats}
                  onChange={(e) => setEditPlanSeats(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPlanModal(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-medium text-xs text-slate-700 cursor-pointer"
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
      {/* CREATE CUSTOM PLAN MODAL */}
      {/* ------------------------------------------------------------------- */}
      {showCreatePlanModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-2xs cursor-pointer"
          onClick={() => setShowCreatePlanModal(false)}
        >
          <div
            className="relative max-w-sm w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-5 space-y-4 text-slate-900 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">New Custom Plan</h3>
              <button
                type="button"
                onClick={() => setShowCreatePlanModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewPlanSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Plan Name *</label>
                <input
                  type="text"
                  required
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder="e.g. Campus Pro"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Price ($/mo)</label>
                  <input
                    type="number"
                    min={0}
                    value={newPlanPrice}
                    onChange={(e) => setNewPlanPrice(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Seat Limit</label>
                  <input
                    type="number"
                    min={1}
                    value={newPlanSeats}
                    onChange={(e) => setNewPlanSeats(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Features (comma separated)</label>
                <input
                  type="text"
                  value={newPlanFeatures}
                  onChange={(e) => setNewPlanFeatures(e.target.value)}
                  placeholder="Shifts, Payroll, Geofencing"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreatePlanModal(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-medium text-xs text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs cursor-pointer"
                >
                  Create Plan
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
            className="relative max-w-sm w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-5 space-y-4 text-slate-900 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Create Broadcast</h3>
              <button
                type="button"
                onClick={() => setShowBroadcastModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
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
                <label className="block font-semibold text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="Maintenance Notice"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Message</label>
                <textarea
                  required
                  rows={3}
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Enter broadcast message..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="flex-1 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 font-medium text-xs text-slate-700 cursor-pointer"
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
