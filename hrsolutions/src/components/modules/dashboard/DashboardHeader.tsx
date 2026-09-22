'use client';

import React, { useMemo } from 'react';
import { useApp } from '@/context/AppContext';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export const DashboardHeader: React.FC = () => {
  const { state } = useApp();
  const name = state.currentPersona?.name?.split(' ')[0] || 'there';

  const title = useMemo(() => {
    const hour = new Date().getHours();
    const greeting = greetingForHour(hour);
    return `Hello ${name}! ${greeting}`;
  }, [name]);

  return (
    <header className="dash-header">
      <div>
        <h1 className="dash-header-title">{title}</h1>
      </div>
    </header>
  );
};
