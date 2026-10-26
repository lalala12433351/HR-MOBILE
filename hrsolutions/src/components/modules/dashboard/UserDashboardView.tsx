'use client';

import React from 'react';
import { DashboardDataProvider, useDashboardContext } from './DashboardDataContext';
import { DashboardPageSkeleton } from '@/components/skeletons';
import { UserActionCards } from './UserActionCards';
import { DashboardClockInCard } from './DashboardClockInCard';
import { CalendarWidget } from './CalendarWidget';
import { SchedulesCard } from './SchedulesCard';
import { TasksCard } from './TasksCard';
import { UserLeavesSummaryCard } from './UserLeavesSummaryCard';
import { DashboardHeader } from './DashboardHeader';
import { OnLeaveTodayCard } from './OnLeaveTodayCard';
import { UpcomingHolidaysCard } from './UpcomingHolidaysCard';

function UserDashboardContent() {
  const { loading } = useDashboardContext();

  if (loading) {
    return <DashboardPageSkeleton variant="employee" />;
  }

  return (
    <div className="dash-page dash-page--employee">
      <DashboardHeader variant="employee" />

      <div className="dash-employee-columns">
        <div className="dash-employee-main">
          <UserActionCards showClock={false} />
          <TasksCard className="dash-employee-tasks" title="My open tasks" limit={8} />
        </div>
        <aside className="dash-employee-aside" aria-label="Time and team overview">
          <DashboardClockInCard />
          <CalendarWidget />
        </aside>
      </div>
      <div className="dash-board">
        <OnLeaveTodayCard className="dash-span-4 dash-employee-leave" scope="coworkers" limit={2} />
        <UpcomingHolidaysCard className="dash-span-4 dash-employee-holidays" limit={2} />
        <SchedulesCard className="dash-span-4 dash-employee-schedules" />
        <UserLeavesSummaryCard className="dash-span-12 dash-employee-balances" />
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
