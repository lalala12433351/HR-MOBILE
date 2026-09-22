'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthService } from '@/services/authService';
import { api } from '@/services/apiClient';
import { APP_ORIGIN, IMPERSONATION_TENANT_KEY, isAppHost, SAME_ORIGIN_HOST } from '@/config/origins';
import type { ClientTenant } from '@/types';

/**
 * Accepts a platform-issued impersonation JWT on the tenant app host,
 * stores the operator session, and routes into the workspace.
 */
export default function ImpersonateAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : null;
    if (!SAME_ORIGIN_HOST && !isAppHost(hostname)) {
      window.location.href = `${APP_ORIGIN}/impersonate${window.location.search}`;
      return;
    }

    const token = searchParams.get('token');
    if (!token) {
      setError('Missing impersonation token.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Invalid token');
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (!payload.impersonation || !payload.tenant_id) {
          throw new Error('Not an impersonation token');
        }

        const tenant: ClientTenant = {
          id: payload.impersonated_tenant_id || payload.tenant_id,
          slug: payload.tenant_id,
          name: payload.impersonated_tenant_name || payload.tenant_id,
          domain: `${payload.tenant_id}.app`,
          industry: 'Corporate',
          schemaName: payload.db_schema || `tenant_${payload.tenant_id}`,
          plan: 'professional',
          maxSeats: 0,
          activeUsersCount: 0,
          adminName: payload.name || payload.operator_email || 'Operator',
          adminEmail: payload.operator_email || payload.email || '',
          status: 'active',
          createdAt: new Date().toISOString().substring(0, 10),
          lastActivityAt: 'Just now',
          dbSizeBytes: 0,
          totalPunchesRecorded: 0,
        };

        AuthService.setSession({
          token,
          sub: payload.sub,
          email: payload.email || payload.operator_email,
          role: 'super_admin',
          tenantId: payload.tenant_id,
          dbSchema: payload.db_schema,
          name: payload.name || payload.operator_email,
          persist: false,
        });

        try {
          sessionStorage.setItem(IMPERSONATION_TENANT_KEY, JSON.stringify(tenant));
        } catch (_) {}

        await api.auth.me().catch(() => null);

        if (!cancelled) {
          router.replace('/dashboard');
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to start operator session.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f8fafc] p-6 font-sans">
      <div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
        {error ? (
          <>
            <p className="text-sm font-semibold text-rose-700">Impersonation failed</p>
            <p className="text-xs text-slate-500">{error}</p>
          </>
        ) : (
          <>
            <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Starting operator session…</p>
          </>
        )}
      </div>
    </div>
  );
}
