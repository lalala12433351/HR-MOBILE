import React, { createContext, useContext } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';

const DashboardContext = createContext<ReturnType<typeof useDashboardData> | null>(null);

export const DashboardDataProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const data = useDashboardData();
  return <DashboardContext.Provider value={data}>{children}</DashboardContext.Provider>;
};

export const useDashboardContext = () => {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboardContext must be used within DashboardDataProvider');
  return ctx;
};

/** Setup prompts are also used outside dashboard screens. */
export const useOptionalDashboardContext = () => useContext(DashboardContext);
