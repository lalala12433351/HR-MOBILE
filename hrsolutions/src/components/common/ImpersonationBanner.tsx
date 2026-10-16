'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, ArrowLeft, Building2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';
import { AuthService } from '@/services/authService';
import { IMPERSONATION_TENANT_KEY, masterAdminHref } from '@/config/origins';
import type { ClientTenant } from '@/types';

export const ImpersonationBanner: React.FC = () => {
  const { state, updateState } = useApp();
  const [storedTenant, setStoredTenant] = useState<ClientTenant | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(IMPERSONATION_TENANT_KEY);
      if (raw) setStoredTenant(JSON.parse(raw));
    } catch {
      setStoredTenant(null);
    }
  }, []);

  const targetTenant = ((state as any).impersonatedTenant as ClientTenant | undefined) || storedTenant;
  const isImpersonating = Boolean(targetTenant);

  useEffect(() => {
    if (!targetTenant || (state as any).impersonatedTenant) return;
    updateState((prev) => ({ ...prev, impersonatedTenant: targetTenant }));
  }, [targetTenant]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isImpersonating || !targetTenant) return null;

  const handleExitImpersonation = () => {
    try {
      sessionStorage.removeItem(IMPERSONATION_TENANT_KEY);
    } catch (_) {}
    updateState((prev) => {
      const next = { ...prev };
      delete (next as any).impersonatedTenant;
      return next;
    });
    AuthService.logout();
    api.clearAuth();
    window.location.href = masterAdminHref('/master-admin');
  };

  return (
    <aside aria-label="Operator Session" className="sticky top-0 z-50 w-full bg-amber-50 border-b border-amber-200/90 text-amber-950 px-4 py-2 text-xs animate-in slide-in-from-top duration-200">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-md bg-amber-500 text-white flex items-center justify-center shrink-0">
            <ShieldAlert className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 font-medium">
            <span className="font-bold text-amber-900">OPERATOR SESSION:</span>
            <span>You are viewing workspace</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-surface)] border border-amber-200 text-amber-950 font-bold">
              <Building2 className="w-3 h-3 text-amber-700" />
              {targetTenant.name}
            </span>
            <span className="text-amber-800/80">({targetTenant.domain || targetTenant.slug}) as Super Admin.</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExitImpersonation}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs transition-all shadow-2xs cursor-pointer shrink-0 self-start sm:self-auto"
          style={{ color: '#ffffff' }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Exit to Master Admin</span>
        </button>
      </div>
    </aside>
  );
};
