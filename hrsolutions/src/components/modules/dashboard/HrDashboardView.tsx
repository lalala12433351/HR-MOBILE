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

function HrDashboardContent() {
  const { loading } = useDashboardContext();

  if (loading) {
    return <DashboardPageSkeleton variant="hr" />;
  }

  return (
    <div className="dash-page">
      <header className="dash-header">
        <h1 className="dash-header-title">Review people today</h1>
      </header>

      <SetupPromptModal />

      <section aria-label="Today’s people" className="dash-figures">
        <DashboardClockInCard />
        <HrPeopleFigures />
      </section>

      <div className="dash-board">
        <OnLeaveTodayCard className="dash-span-7" scope="org" limit={8} />
        <UpcomingHolidaysCard className="dash-span-5" manageHref />
        <PendingLeavesCard className="dash-span-7" />
        <DirectorySnapshotCard className="dash-span-5" />
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
