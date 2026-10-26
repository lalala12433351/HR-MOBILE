'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { UserAvatar } from '@/components/common/UserAvatar';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { DashPanel } from './DashPanel';
import { formatShortDate, localDateKey, peopleOnLeaveToday } from '@/utils/dashboardPeople';

type OnLeaveTodayCardProps = {
  className?: string;
  scope?: 'org' | 'coworkers';
  limit?: number;
};

export const OnLeaveTodayCard: React.FC<OnLeaveTodayCardProps> = ({
  className = '',
  scope = 'org',
  limit = 6,
}) => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();
  const today = localDateKey();

  const people = useMemo(() => {
    const persona = state.currentPersona;
    const employees = dashboardState.employees || state.employees || [];
    const self = employees.find(
      (e) =>
        e.id === persona?.id ||
        (persona?.email && e.email?.toLowerCase() === persona.email.toLowerCase())
    );
    return peopleOnLeaveToday({
      leaves: dashboardState.leaves || state.leaves || [],
      employees,
      day: today,
      excludeIds:
        scope === 'coworkers'
          ? [persona?.id, self?.id, self?.employeeId].filter(Boolean) as string[]
          : [],
    });
  }, [dashboardState.leaves, dashboardState.employees, state.leaves, state.employees, state.currentPersona, scope, today]);

  const visible = people.slice(0, limit);
  const extra = people.length - visible.length;

  return (
    <DashPanel
      title={scope === 'coworkers' ? 'Coworkers on leave' : 'On leave today'}
      className={className}
      purpose="on-leave-today"
      action={
        <button
          type="button"
          onClick={() => router.push('/leaves')}
          className="dash-quiet-link"
        >
          View leave ›
        </button>
      }
    >
      {people.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-[var(--text-muted)]">Nobody is on leave today</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {visible.map((person) => (
            <li key={person.id} className="dash-people-row">
              <UserAvatar src={person.avatar} name={person.name} className="h-8 w-8" />
              <div className="min-w-0 flex-1">
                <p className="dash-people-name">{person.name}</p>
                <p className="dash-people-meta">
                  {person.leaveType}
                  {person.department ? ` · ${person.department}` : ''}
                </p>
              </div>
              <span className="dash-people-return">
                {(() => {
                  const end = new Date(`${person.endDate}T00:00:00`);
                  if (Number.isNaN(end.getTime())) return formatShortDate(person.endDate) || 'Today';
                  const start = new Date();
                  start.setHours(0, 0, 0, 0);
                  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
                  if (days <= 0) return 'Today';
                  return days === 1 ? '1 day' : `${days} days`;
                })()}
              </span>
            </li>
          ))}
        </ul>
      )}
      {extra > 0 ? (
        <button
          type="button"
          onClick={() => router.push('/leaves')}
          className="mt-2 text-xs font-semibold text-[var(--studio-navy)] hover:underline cursor-pointer"
        >
          +{extra} more
        </button>
      ) : null}
    </DashPanel>
  );
};
