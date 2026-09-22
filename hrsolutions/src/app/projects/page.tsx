'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { ProjectsModule } from '@/components/modules/ProjectsModule';
import { TabsTablePageSkeleton } from '@/components/skeletons';

import { useProjectsData } from '@/hooks/useProjectsData';

export default function ProjectsPage() {
  const { state: uiState, updateState: updateUiState, isLoaded } = useApp();
  const { businessData, updateBusinessData, loading } = useProjectsData();

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
      driveItems: newState.driveItems,
    });

    const newUiState = { ...newState };
    delete newUiState.employees;
    delete newUiState.attendance;
    delete newUiState.projects;
    delete newUiState.tasks;
    delete newUiState.timesheets;
    delete newUiState.auditLogs;
    delete newUiState.driveItems;

    updateUiState(() => newUiState);
  };

  if (loading || !isLoaded) {
    return <TabsTablePageSkeleton />;
  }

  return <ProjectsModule state={combinedState} onUpdateState={handleUpdateState} />;
}
