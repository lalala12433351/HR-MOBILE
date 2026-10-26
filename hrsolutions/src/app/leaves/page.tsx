'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { KekaAttendanceModule } from '@/components/modules/KekaAttendanceModule';
import { TabsTablePageSkeleton } from '@/components/skeletons';

import { useAttendanceData } from '@/hooks/useAttendanceData';

function LeavesContent() {
  const { state: uiState, updateState: updateUiState, isLoaded } = useApp();
  const { businessData, updateBusinessData, loading } = useAttendanceData();
  const searchParams = useSearchParams();
  const applyParam = searchParams.get('apply') === 'true';

  const combinedState = { ...uiState, ...businessData };
  // Chain updates off the latest snapshot. A second save in the same click
  // (approve, then refresh balances) must not write the pre-approval leaves back.
  const combinedRef = React.useRef(combinedState);
  combinedRef.current = combinedState;

  const handleUpdateState = (updater: (prev: any) => any) => {
    const newState = updater(combinedRef.current);
    combinedRef.current = newState;

    updateBusinessData({
      employees: newState.employees,
      attendance: newState.attendance,
      leaves: newState.leaves,
      regularizations: newState.regularizations,
      projects: newState.projects,
      students: newState.students,
      auditLogs: newState.auditLogs,
    });

    const newUiState = { ...newState };
    delete newUiState.employees;
    delete newUiState.attendance;
    delete newUiState.leaves;
    delete newUiState.regularizations;
    delete newUiState.projects;
    delete newUiState.students;
    delete newUiState.auditLogs;

    updateUiState(() => newUiState);
  };

  if (loading || !isLoaded) {
    return <TabsTablePageSkeleton />;
  }

  return (
    <KekaAttendanceModule
      state={combinedState}
      onUpdateState={handleUpdateState}
      initialSubTab="leaves"
      initialOpenApplyModal={applyParam}
    />
  );
}

export default function LeavesPage() {
  return (
    <Suspense fallback={<TabsTablePageSkeleton />}>
      <LeavesContent />
    </Suspense>
  );
}
