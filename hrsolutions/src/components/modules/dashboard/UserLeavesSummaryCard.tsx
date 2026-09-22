'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { getEffectiveLeaveQuotas, formatLeaveDays } from '@/utils/leaveRules';

export const UserLeavesSummaryCard: React.FC = () => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const currentPersona = state.currentPersona;
  const currentEmpId = currentPersona?.id;
  const currentEmpEmail = currentPersona?.email?.toLowerCase().trim();

  // Matched employee
  const matchedEmp = useMemo(() => {
    return (dashboardState.employees || state.employees || []).find(
      (e) =>
        (e.id && e.id === currentEmpId) ||
        (e.email && e.email.toLowerCase().trim() === currentEmpEmail)
    );
  }, [dashboardState.employees, state.employees, currentEmpId, currentEmpEmail]);

  // Quotas & Balances
  const quotas = useMemo(() => {
    return getEffectiveLeaveQuotas(
      matchedEmp || currentPersona,
      state.customOptions?.leaveSettings,
      state.customOptions?.probationSettings
    );
  }, [matchedEmp, currentPersona, state.customOptions]);

  // Recent Leave Applications for this user
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
    <div className="dash-card p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Leave Balances & Requests
          </h2>
        </div>

        <button
          type="button"
          onClick={() => router.push('/leaves')}
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>Apply</span>
          <GoogleIcon name="add" size={15} weight={600} />
        </button>
      </div>

      {/* 3 Leave Quota Chips */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830]">
          <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Paid / PL
          </span>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
            {formatLeaveDays(quotas.effectiveQuotas.earnedLeave)}
            <span className="text-[11px] font-normal text-slate-400 ml-1">
              / {formatLeaveDays(quotas.annualQuotas.earnedLeave)}
            </span>
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830]">
          <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Casual / CL
          </span>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
            {formatLeaveDays(quotas.effectiveQuotas.casualLeave)}
            <span className="text-[11px] font-normal text-slate-400 ml-1">
              / {formatLeaveDays(quotas.annualQuotas.casualLeave)}
            </span>
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-50/70 dark:bg-[#18181d] border border-slate-100 dark:border-[#282830]">
          <span className="text-[10.5px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Sick / SL
          </span>
          <p className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 tabular-nums">
            {formatLeaveDays(quotas.effectiveQuotas.sickLeave)}
            <span className="text-[11px] font-normal text-slate-400 ml-1">
              / {formatLeaveDays(quotas.annualQuotas.sickLeave)}
            </span>
          </p>
        </div>
      </div>

      {/* Recent Applications List */}
      <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-[#282830]">
        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
          Recent Applications
        </span>

        {userLeaves.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400 dark:text-slate-500">
            No active or recent leave requests on file
          </div>
        ) : (
          userLeaves.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/50 dark:bg-[#18181d]/50 border border-slate-100 dark:border-[#282830] text-xs"
            >
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {l.leaveType}
                </span>
                <span className="text-[11px] text-slate-400 ml-2">
                  {l.startDate} {l.endDate && l.endDate !== l.startDate ? `to ${l.endDate}` : ''} ({l.daysCount || 1}d)
                </span>
              </div>

              <span
                className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${
                  l.status === 'Approved'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/40'
                    : l.status === 'Pending'
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/40'
                    : l.status === 'Cancelled'
                    ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/40'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800/40'
                }`}
              >
                {l.status}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="pt-2">
        <button
          type="button"
          onClick={() => router.push('/leaves')}
          className="w-full py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 bg-slate-50 hover:bg-blue-50/50 dark:bg-[#18181d] dark:hover:bg-blue-950/20 border border-slate-100 dark:border-[#282830] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>View All Leaves & Quotas</span>
          <GoogleIcon name="arrow_forward" size={15} weight={500} />
        </button>
      </div>
    </div>
  );
};
