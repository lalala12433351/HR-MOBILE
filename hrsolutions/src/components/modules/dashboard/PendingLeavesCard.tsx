'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { DashPanel } from './DashPanel';
import { formatShortDate, pendingLeaveRequests } from '@/utils/dashboardPeople';

export const PendingLeavesCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const pending = useMemo(
    () => pendingLeaveRequests(dashboardState.leaves || state.leaves || [], 6),
    [dashboardState.leaves, state.leaves]
  );
  const totalPending = (dashboardState.leaves || state.leaves || []).filter((l) => l.status === 'Pending').length;

  return (
    <DashPanel
      title="Pending leave requests"
      className={className}
      purpose="pending-leaves"
      action={
        <button
          type="button"
          onClick={() => router.push('/leaves')}
          className="text-xs font-semibold text-[var(--studio-navy)] hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          Review
          <GoogleIcon name="arrow_forward" size={15} weight={600} />
        </button>
      }
    >
      {pending.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-[var(--text-muted)]">No leave requests waiting</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {pending.map((leave) => (
            <li key={leave.id} className="dash-people-row">
              <div className="min-w-0 flex-1">
                <p className="dash-people-name">{leave.employeeName}</p>
                <p className="dash-people-meta">
                  {leave.leaveType} · {formatShortDate(leave.startDate)}
                  {leave.endDate && leave.endDate !== leave.startDate ? `–${formatShortDate(leave.endDate)}` : ''}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-[7px] text-[12px] font-semibold dash-status-navy">Pending</span>
            </li>
          ))}
        </ul>
      )}
      {totalPending > pending.length ? (
        <p className="mt-2 text-xs font-semibold text-[var(--text-muted)] tabular-nums">
          {totalPending - pending.length} more waiting
        </p>
      ) : null}
    </DashPanel>
  );
};
