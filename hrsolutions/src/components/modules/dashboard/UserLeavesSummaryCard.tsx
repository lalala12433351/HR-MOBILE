'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { getEffectiveLeaveQuotas, formatLeaveDays } from '@/utils/leaveRules';
import { DashPanel } from './DashPanel';

export const UserLeavesSummaryCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const currentPersona = state.currentPersona;
  const currentEmpId = currentPersona?.id;
  const currentEmpEmail = currentPersona?.email?.toLowerCase().trim();

  const matchedEmp = useMemo(() => {
    return (dashboardState.employees || state.employees || []).find(
      (e) =>
        (e.id && e.id === currentEmpId) ||
        (e.email && e.email.toLowerCase().trim() === currentEmpEmail)
    );
  }, [dashboardState.employees, state.employees, currentEmpId, currentEmpEmail]);

  const quotas = useMemo(() => {
    return getEffectiveLeaveQuotas(
      matchedEmp || currentPersona,
      state.customOptions?.leaveSettings,
      state.customOptions?.probationSettings
    );
  }, [matchedEmp, currentPersona, state.customOptions]);

  const userLeaves = useMemo(() => {
    return (dashboardState.leaves || state.leaves || [])
      .filter(
        (l) =>
          l.employeeId === currentEmpId ||
          (matchedEmp && l.employeeId === matchedEmp.id) ||
          l.employeeName?.toLowerCase() === currentPersona?.name?.toLowerCase()
      )
      .slice(0, 3);
  }, [dashboardState.leaves, state.leaves, currentEmpId, matchedEmp, currentPersona]);

  return (
    <DashPanel
      title="Leave balances"
      className={className}
      action={
        <button
          type="button"
          onClick={() => router.push('/leaves')}
          className="text-xs font-semibold text-[var(--studio-navy)] hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          Apply
          <GoogleIcon name="add" size={15} weight={600} />
        </button>
      }
    >
      <div className="dash-quota-grid">
        <div className="dash-quota">
          <span className="dash-kpi-label block">Paid / PL</span>
          <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
            {formatLeaveDays(quotas.effectiveQuotas.earnedLeave)}
            <span className="text-[11px] font-normal text-[var(--text-muted)] ml-1">
              / {formatLeaveDays(quotas.annualQuotas.earnedLeave)}
            </span>
          </p>
        </div>
        <div className="dash-quota">
          <span className="dash-kpi-label block">Casual / CL</span>
          <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
            {formatLeaveDays(quotas.effectiveQuotas.casualLeave)}
            <span className="text-[11px] font-normal text-[var(--text-muted)] ml-1">
              / {formatLeaveDays(quotas.annualQuotas.casualLeave)}
            </span>
          </p>
        </div>
        <div className="dash-quota">
          <span className="dash-kpi-label block">Sick / SL</span>
          <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
            {formatLeaveDays(quotas.effectiveQuotas.sickLeave)}
            <span className="text-[11px] font-normal text-[var(--text-muted)] ml-1">
              / {formatLeaveDays(quotas.annualQuotas.sickLeave)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-[var(--border-color)]">
        <span className="dash-section-label block mb-1">Recent applications</span>
        {userLeaves.length === 0 ? (
          <p className="py-3 text-center text-xs text-[var(--text-muted)]">
            No active or recent leave requests on file
          </p>
        ) : (
          userLeaves.map((l) => (
            <div key={l.id} className="dash-row">
              <div className="min-w-0">
                <span className="font-bold text-xs text-[var(--text-primary)]">{l.leaveType}</span>
                <span className="text-[11px] text-[var(--text-muted)] ml-2">
                  {l.startDate} {l.endDate && l.endDate !== l.startDate ? `to ${l.endDate}` : ''} ({l.daysCount || 1}d)
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded-[7px] text-[10.5px] font-bold ${
                  l.status === 'Approved'
                    ? 'dash-status-sage'
                    : l.status === 'Pending'
                    ? 'dash-status-navy'
                    : l.status === 'Cancelled'
                    ? 'dash-status-muted'
                    : 'dash-status-error'
                }`}
              >
                {l.status}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="pt-3">
        <button
          type="button"
          onClick={() => router.push('/leaves')}
          className="w-full h-9 rounded-[7px] text-xs font-semibold text-[var(--studio-navy)] bg-[var(--bg-surface)] hover:bg-[var(--studio-selected)] border border-[var(--border-color)] inline-flex items-center justify-center gap-1.5 cursor-pointer"
        >
          View all leaves
          <GoogleIcon name="arrow_forward" size={15} weight={500} />
        </button>
      </div>
    </DashPanel>
  );
};
