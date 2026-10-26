'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { DashPanel } from './DashPanel';
import { formatShortDate, incompleteProfiles, joinersThisMonth } from '@/utils/dashboardPeople';

export const DirectorySnapshotCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();
  const employees = dashboardState.employees || state.employees || [];

  const incomplete = useMemo(() => incompleteProfiles(employees).slice(0, 4), [employees]);
  const joiners = useMemo(() => joinersThisMonth(employees).slice(0, 4), [employees]);
  const incompleteCount = incompleteProfiles(employees).length;
  const joinerCount = joinersThisMonth(employees).length;

  return (
    <DashPanel
      title="Directory"
      className={className}
      purpose="directory-snapshot"
      action={
        <button
          type="button"
          onClick={() => router.push('/hr')}
          className="text-xs font-semibold text-[var(--studio-navy)] hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          People
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      }
    >
      <div className="dash-quota-grid is-2 mb-3">
        <div className="dash-quota">
          <span className="dash-kpi-label block">Incomplete profiles</span>
          <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">{incompleteCount}</p>
        </div>
        <div className="dash-quota">
          <span className="dash-kpi-label block">Joined this month</span>
          <p className="text-xl font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">{joinerCount}</p>
        </div>
      </div>

      {incomplete.length > 0 ? (
        <>
          <span className="dash-section-label block mb-1">Needs a profile</span>
          <ul className="m-0 p-0 list-none mb-3">
            {incomplete.map((emp) => (
              <li key={emp.id} className="dash-people-row">
                <UserAvatar src={emp.avatar} name={emp.name} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <p className="dash-people-name">{emp.name}</p>
                  <p className="dash-people-meta">{emp.designation || emp.department || 'Onboarding'}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {joiners.length > 0 ? (
        <>
          <span className="dash-section-label block mb-1">New this month</span>
          <ul className="m-0 p-0 list-none">
            {joiners.map((emp) => (
              <li key={emp.id} className="dash-people-row">
                <UserAvatar src={emp.avatar} name={emp.name} className="h-8 w-8" />
                <div className="min-w-0 flex-1">
                  <p className="dash-people-name">{emp.name}</p>
                  <p className="dash-people-meta">
                    {emp.department || emp.designation}
                    {emp.joiningDate || emp.joinDate ? ` · ${formatShortDate(emp.joiningDate || emp.joinDate)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {incomplete.length === 0 && joiners.length === 0 ? (
        <p className="py-3 text-center text-[13px] text-[var(--text-muted)]">No onboarding or new joiners this month</p>
      ) : null}
    </DashPanel>
  );
};
