'use client';

import React, { useMemo } from 'react';
import { useApp } from '@/context/AppContext';
import { DashboardDataProvider, useDashboardContext } from './DashboardDataContext';
import { DashboardPageSkeleton } from '@/components/skeletons';
import { UserActionCards } from './UserActionCards';
import { CalendarWidget } from './CalendarWidget';
import { SchedulesCard } from './SchedulesCard';
import { TasksCard } from './TasksCard';
import { UserLeavesSummaryCard } from './UserLeavesSummaryCard';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function UserDashboardContent() {
  const { state } = useApp();
  const { loading } = useDashboardContext();
  const currentPersona = state.currentPersona;
  const role = currentPersona?.role;
  const isManager = role === 'manager' || (role as string) === 'team_lead';
  const firstName = currentPersona?.name?.split(' ')[0] || (isManager ? 'Manager' : 'there');

  const formattedDate = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  if (loading) {
    return <DashboardPageSkeleton />;
  }

  const title = `Hello ${firstName}! ${greetingForHour(new Date().getHours())}`;

  const meta = [
    isManager ? 'Manager' : currentPersona?.designation,
    currentPersona?.department,
    formattedDate,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-5 sm:space-y-6 pb-12 font-sans">
      <header className="dash-header">
        <div>
          <h1 className="dash-header-title">{title}</h1>
          <p className="dash-header-sub">{meta}</p>
        </div>
      </header>

      <UserActionCards />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 lg:gap-6">
        <section className="lg:col-span-6 space-y-4 sm:space-y-5 lg:space-y-6">
          <CalendarWidget />
          <SchedulesCard />
        </section>

        <section className="lg:col-span-6 space-y-4 sm:space-y-5 lg:space-y-6">
          <TasksCard />
          <UserLeavesSummaryCard />
        </section>
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
