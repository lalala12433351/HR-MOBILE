'use client';

import React from 'react';
import { DashboardDataProvider, useDashboardContext } from './DashboardDataContext';
import { DashboardPageSkeleton } from '@/components/skeletons';
import { DashboardClockInCard } from './DashboardClockInCard';
import { SetupPromptModal } from './SetupPromptModal';
import { HrPeopleFigures } from './HrPeopleFigures';
import { OnLeaveTodayCard } from './OnLeaveTodayCard';
import { UpcomingHolidaysCard } from './UpcomingHolidaysCard';
import { PendingLeavesCard } from './PendingLeavesCard';
import { DirectorySnapshotCard } from './DirectorySnapshotCard';
import { EmployeeAttendanceTable } from './EmployeeAttendanceTable';
import { DashboardHeader } from './DashboardHeader';
import { TasksCard } from './TasksCard';

function HrDashboardContent() {
  const { loading } = useDashboardContext();

  if (loading) {
    return <DashboardPageSkeleton variant="hr" />;
  }

  return (
    <div className="dash-page dash-page--hr">
      <DashboardHeader variant="hr" />

      <SetupPromptModal />

      <section aria-label="Today’s people" className="dash-figures">
        <DashboardClockInCard />
        <HrPeopleFigures />
      </section>

      <div className="dash-board">
        <OnLeaveTodayCard className="dash-span-4" scope="org" limit={2} />
        <UpcomingHolidaysCard className="dash-span-4" limit={2} manageHref />
        <DirectorySnapshotCard className="dash-span-4" />
        <PendingLeavesCard className="dash-span-8" />
        <TasksCard className="dash-span-4" title="People follow-ups" />
        <EmployeeAttendanceTable className="dash-span-12" />
      </div>
    </div>
  );
}

export const HrDashboardView: React.FC = () => {
  return (
    <DashboardDataProvider>
      <HrDashboardContent />
    </DashboardDataProvider>
  );
};
