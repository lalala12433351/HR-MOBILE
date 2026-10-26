'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { getEffectiveLeaveQuotas, formatLeaveDays } from '@/utils/leaveRules';
import { leaveBelongsToEmployee } from '@/utils/mapLeaveRow';
import { DashPanel } from './DashPanel';

export const UserLeavesSummaryCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const currentPersona = state.currentPersona;
  const currentEmpEmail = currentPersona?.email?.toLowerCase().trim();

  const matchedEmp = useMemo(() => {
    return (dashboardState.employees || state.employees || []).find(
      (e) =>
        (e.id && e.id === currentPersona?.id) ||
        (e.email && e.email.toLowerCase().trim() === currentEmpEmail)
    );
  }, [dashboardState.employees, state.employees, currentPersona?.id, currentEmpEmail]);

  const owner = matchedEmp || currentPersona;

  const quotas = useMemo(() => {
    return getEffectiveLeaveQuotas(
      owner,
      state.customOptions?.leaveSettings,
      state.customOptions?.probationSettings
    );
  }, [owner, state.customOptions]);

  const ownerLeaves = useMemo(() => {
    return (dashboardState.leaves || state.leaves || []).filter((l) =>
      leaveBelongsToEmployee(l, owner)
    );
  }, [dashboardState.leaves, state.leaves, owner]);

  const userLeaves = useMemo(() => ownerLeaves.slice(0, 3), [ownerLeaves]);

  const counters = useMemo(() => {
    const fromServer = !!quotas.balancesFromServer;
    const totals = matchedEmp?.leaveBalanceTotals;
    const usedOf = (...types: string[]) =>
      formatLeaveDays(
        ownerLeaves
          .filter(
            (l) =>
              types.includes(l.leaveType as string) &&
              l.status !== 'Rejected' &&
              l.status !== 'Cancelled'
          )
          .reduce((sum, l) => sum + (l.daysCount || 1), 0)
      );

    const remainingOf = (key: 'earnedLeave' | 'casualLeave' | 'sickLeave', used: number) => {
      const quota = formatLeaveDays(quotas.effectiveQuotas[key]);
      if (quotas.inProbation) return 0;
      return fromServer ? quota : formatLeaveDays(Math.max(0, quota - used));
    };

    const totalOf = (key: 'earnedLeave' | 'casualLeave' | 'sickLeave') => {
      const fromTotals = totals?.[key];
      if (fromTotals !== undefined && fromTotals !== null) return formatLeaveDays(fromTotals);
      return formatLeaveDays(quotas.annualQuotas[key]);
    };

    return [
      {
        label: 'Paid / PL',
        remaining: remainingOf('earnedLeave', usedOf('Earned Leave', 'Earned / Privilege')),
        total: totalOf('earnedLeave'),
      },
      {
        label: 'Casual / CL',
        remaining: remainingOf('casualLeave', usedOf('Casual Leave')),
        total: totalOf('casualLeave'),
      },
      {
        label: 'Sick / SL',
        remaining: remainingOf('sickLeave', usedOf('Sick Leave')),
        total: totalOf('sickLeave'),
      },
    ];
  }, [quotas, matchedEmp?.leaveBalanceTotals, ownerLeaves]);

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
          <Plus size={15} aria-hidden="true" />
        </button>
      }
    >
      <div className="dash-quota-grid">
        {counters.map((item) => (
          <div key={item.label} className="dash-quota">
            <span className="dash-kpi-label block">{item.label}</span>
            <p className="dash-kpi-split mt-0.5">
              <b>{item.remaining}</b>
              <span>/ {item.total}</span>
            </p>
          </div>
        ))}
      </div>
      {quotas.inProbation ? (
        <p className="mt-2 text-[11px] leading-snug text-[var(--text-muted)]">
          Paid leave is restricted during probation. Absences should be logged as Loss of Pay.
        </p>
      ) : null}

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
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </div>
    </DashPanel>
  );
};
