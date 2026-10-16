'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import {
  incompleteProfiles,
  localDateKey,
  peopleOnLeaveToday,
  presentTodayCount,
} from '@/utils/dashboardPeople';

export const HrPeopleFigures: React.FC = () => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();
  const today = localDateKey();

  const stats = useMemo(() => {
    const employees = dashboardState.employees || state.employees || [];
    const leaves = dashboardState.leaves || state.leaves || [];
    const attendance = dashboardState.attendance || [];
    return {
      present: presentTodayCount(attendance, today),
      onLeave: peopleOnLeaveToday({ leaves, employees, day: today }).length,
      pending: leaves.filter((l) => l.status === 'Pending').length,
      incomplete: incompleteProfiles(employees).length,
    };
  }, [dashboardState, state.employees, state.leaves, today]);

  const rail = [
    { label: 'On leave today', value: stats.onLeave, onClick: () => router.push('/leaves') },
    { label: 'Pending leave', value: stats.pending, onClick: () => router.push('/leaves') },
    { label: 'Incomplete profiles', value: stats.incomplete, onClick: () => router.push('/hr') },
  ];

  return (
    <div className="dash-figure-rail">
      <button type="button" onClick={() => router.push('/attendance')} className="dash-figure-item">
        <span className="dash-kpi-label">Present today</span>
        <span className="dash-kpi">{stats.present}</span>
      </button>
      {rail.map((card) => (
        <button key={card.label} type="button" onClick={card.onClick} className="dash-figure-item">
          <span className="dash-kpi-label">{card.label}</span>
          <span className="dash-kpi">{card.value}</span>
        </button>
      ))}
    </div>
  );
};
