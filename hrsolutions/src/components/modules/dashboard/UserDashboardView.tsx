'use client';

import React from 'react';
import { DashboardDataProvider, useDashboardContext } from './DashboardDataContext';
import { DashboardPageSkeleton } from '@/components/skeletons';
import { UserActionCards } from './UserActionCards';
import { CalendarWidget } from './CalendarWidget';
import { SchedulesCard } from './SchedulesCard';
import { TasksCard } from './TasksCard';
import { UserLeavesSummaryCard } from './UserLeavesSummaryCard';

function UserDashboardContent() {
  const { loading } = useDashboardContext();

  if (loading) {
    return <DashboardPageSkeleton variant="employee" />;
  }

  return (
    <div className="dash-page">
      <header className="dash-header">
        <h1 className="dash-header-title">Start with today’s work</h1>
      </header>

      <UserActionCards />

      <div className="dash-board">
        <TasksCard className="dash-span-7" />
        <CalendarWidget className="dash-span-5" />
        <SchedulesCard className="dash-span-7" />
        <UserLeavesSummaryCard className="dash-span-5" />
      </div>
    </div>
  );
}

export const UserDashboardView: React.FC = () => {
  return (
    <DashboardDataProvider>
      <UserDashboardContent />
    </DashboardDataProvider>
  );
};
