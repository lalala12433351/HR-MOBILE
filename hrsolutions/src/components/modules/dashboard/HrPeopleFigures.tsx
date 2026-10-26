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

  const employeeCount = (dashboardState.employees || []).length;
  const rail = [
    { label: 'Attendance today', tone: 'attendance', value: `${employeeCount ? Math.min(100, Math.round(stats.present / employeeCount * 1000) / 10) : 0}%`, path: '/attendance' },
    { label: 'People', tone: 'people', value: employeeCount, path: '/hr' },
    { label: 'Pending leave', tone: 'leave', value: stats.pending, path: '/leaves' },
  ];

  return (
    <div className="dash-hr-metrics">
      {rail.map((card) => (
        <button key={card.label} type="button" onClick={() => router.push(card.path)} className="dash-metric" data-tone={card.tone}>
          <span className="dash-kpi-label">{card.label}</span>
          <span className="dash-kpi">{card.value}</span>
        </button>
      ))}
    </div>
  );
};
