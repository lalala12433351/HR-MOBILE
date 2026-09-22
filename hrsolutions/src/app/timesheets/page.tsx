'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { TimesheetsModule } from '@/components/modules/TimesheetsModule';
import { TabsTablePageSkeleton } from '@/components/skeletons';

import { useTimesheetsData } from '@/hooks/useTimesheetsData';

export default function TimesheetsPage() {
  const { state: uiState, updateState: updateUiState, isLoaded } = useApp();
  const { businessData, updateBusinessData, loading } = useTimesheetsData();

  const combinedState = { ...uiState, ...businessData };

  const handleUpdateState = (updater: (prev: any) => any) => {
    const newState = updater(combinedState);

    updateBusinessData({
      employees: newState.employees,
      attendance: newState.attendance,
      projects: newState.projects,
      tasks: newState.tasks,
      timesheets: newState.timesheets,
      auditLogs: newState.auditLogs,
    });

    const newUiState = { ...newState };
    delete newUiState.employees;
    delete newUiState.attendance;
    delete newUiState.projects;
    delete newUiState.tasks;
    delete newUiState.timesheets;
    delete newUiState.auditLogs;

    updateUiState(() => newUiState);
  };

  if (loading || !isLoaded) {
    return <TabsTablePageSkeleton />;
  }

  return <TimesheetsModule state={combinedState} onUpdateState={handleUpdateState} />;
}
