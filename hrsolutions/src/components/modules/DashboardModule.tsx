'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { DashboardDataProvider, useDashboardContext } from './dashboard/DashboardDataContext';
import { DashboardPageSkeleton } from '@/components/skeletons';

import { DashboardHeader } from './dashboard/DashboardHeader';
import { MetricCards } from './dashboard/MetricCards';
import { CalendarWidget } from './dashboard/CalendarWidget';
import { SchedulesCard } from './dashboard/SchedulesCard';
import { TasksCard } from './dashboard/TasksCard';
import { AttendanceHeatmap } from './dashboard/AttendanceHeatmap';
import { EmploymentStatusBar } from './dashboard/EmploymentStatusBar';
import { RecentActivitiesCard } from './dashboard/RecentActivitiesCard';
import { EmployeeAttendanceTable } from './dashboard/EmployeeAttendanceTable';
import { SetupPromptModal } from './dashboard/SetupPromptModal';
import { UserDashboardView } from './dashboard/UserDashboardView';

function AdminDashboardContent() {
  const { loading } = useDashboardContext();

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  return (
    <div className="space-y-5 sm:space-y-6 pb-12">
      <DashboardHeader />
      <SetupPromptModal />
      <MetricCards />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 lg:gap-6">
        <section className="lg:col-span-4 space-y-4 sm:space-y-5 lg:space-y-6">
          <CalendarWidget />
          <SchedulesCard />
        </section>

        <section className="lg:col-span-4 space-y-4 sm:space-y-5 lg:space-y-6">
          <AttendanceHeatmap />
        </section>

        <section className="lg:col-span-4 space-y-4 sm:space-y-5 lg:space-y-6">
          <EmploymentStatusBar />
          <TasksCard />
          <RecentActivitiesCard />
        </section>
      </div>

      <EmployeeAttendanceTable />
    </div>
  );
}

export const DashboardModule: React.FC = () => {
  const { state } = useApp();

  const role = state.currentPersona?.role;
  const isAdmin =
    role === 'admin' || (role as string) === 'super_admin' || (role as string) === 'hr_manager';

  // For non-admin accounts (employees, managers, faculty, staff), render the dedicated user view
  if (!isAdmin) {
    return <UserDashboardView />;
  }

  return (
    <DashboardDataProvider>
      <AdminDashboardContent />
    </DashboardDataProvider>
  );
};
