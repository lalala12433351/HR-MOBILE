'use client';

import React from 'react';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { MobileDashboard } from '@/components/mobile/MobileDashboard';
import './dashboard/dashboard.css';
import { useApp } from '@/context/AppContext';
import { DashboardDataProvider, useDashboardContext } from './dashboard/DashboardDataContext';
import { DashboardPageSkeleton } from '@/components/skeletons';

import { DashboardHeader } from './dashboard/DashboardHeader';
import { MetricCards } from './dashboard/MetricCards';
import { CalendarWidget } from './dashboard/CalendarWidget';
import { SchedulesCard } from './dashboard/SchedulesCard';
import { TasksCard } from './dashboard/TasksCard';
import { AttendanceHeatmap } from './dashboard/AttendanceHeatmap';
import { RecentActivitiesCard } from './dashboard/RecentActivitiesCard';
import { EmployeeAttendanceTable } from './dashboard/EmployeeAttendanceTable';
import { SetupPromptModal } from './dashboard/SetupPromptModal';
import { UserDashboardView } from './dashboard/UserDashboardView';
import { HrDashboardView } from './dashboard/HrDashboardView';
import { OnLeaveTodayCard } from './dashboard/OnLeaveTodayCard';
import { UpcomingHolidaysCard } from './dashboard/UpcomingHolidaysCard';

function AdminDashboardContent() {
  const { loading } = useDashboardContext();

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  return (
    <div className="dash-page">
      <DashboardHeader />
      <SetupPromptModal />
      <MetricCards />

      <div className="dash-board">
        <AttendanceHeatmap className="dash-span-8" />
        <CalendarWidget className="dash-span-4" />
        <OnLeaveTodayCard className="dash-span-4" scope="org" limit={2} />
        <UpcomingHolidaysCard className="dash-span-4" limit={2} manageHref />
        <SchedulesCard className="dash-span-4" />
        <TasksCard className="dash-span-6" />
        <RecentActivitiesCard className="dash-span-6" />
        <EmployeeAttendanceTable className="dash-span-12" />
      </div>
    </div>
  );
}

export const DashboardModule: React.FC = () => {
  const { state } = useApp();
  const mobile = useMobileViewport();

  const role = state.currentPersona?.role;
  const isHr = role === 'hr_manager' || (role as string) === 'hr';
  const isAdmin = role === 'admin' || role === 'super_admin';

  if (mobile) return <MobileDashboard />;

  if (isHr) {
    return <HrDashboardView />;
  }

  if (!isAdmin) {
    return <UserDashboardView />;
  }

  return (
    <DashboardDataProvider>
      <AdminDashboardContent />
    </DashboardDataProvider>
  );
};
