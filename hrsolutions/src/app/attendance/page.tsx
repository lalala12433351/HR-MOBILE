'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { KekaAttendanceModule } from '@/components/modules/KekaAttendanceModule';
import { TabsTablePageSkeleton } from '@/components/skeletons';

import { useAttendanceData } from '@/hooks/useAttendanceData';

function AttendanceContent() {
  const { state: uiState, updateState: updateUiState, isLoaded } = useApp();
  const { businessData, updateBusinessData, loading } = useAttendanceData();
  const searchParams = useSearchParams();
  const router = useRouter();
  const tabParam = searchParams.get('tab') as 'my_attendance' | 'team_attendance' | 'leaves' | 'regularizations' | 'holidays' | 'settings' | null;
  const subTabParam = searchParams.get('subTab') as 'my_attendance' | 'team_attendance' | 'leaves' | 'regularizations' | 'holidays' | 'settings' | null;
  const applyParam = searchParams.get('apply') === 'true';

  React.useEffect(() => {
    if (searchParams.get('tab') === 'reports' || searchParams.get('subTab') === 'reports') {
      router.replace('/reports');
    } else if (searchParams.get('tab') === 'settings' || searchParams.get('subTab') === 'settings') {
      router.replace('/settings?section=attendance');
    }
  }, [searchParams, router]);

  const resolvedSubTab =
    tabParam === 'leaves' || subTabParam === 'leaves' || applyParam
      ? 'leaves'
      : tabParam === 'holidays' || subTabParam === 'holidays'
      ? 'holidays'
      : tabParam === 'regularizations' || subTabParam === 'regularizations'
      ? 'regularizations'
      : tabParam === 'team_attendance' || subTabParam === 'team_attendance'
      ? 'team_attendance'
      : tabParam === 'my_attendance' || subTabParam === 'my_attendance'
      ? 'my_attendance'
      : undefined;

  const combinedState = { ...uiState, ...businessData };
  const combinedRef = React.useRef(combinedState);
  combinedRef.current = combinedState;

  const handleUpdateState = (updater: (prev: any) => any) => {
    const previous = combinedRef.current;
    const newState = updater(previous);
    if (!newState.tasks) newState.tasks = previous.tasks;
    if (!newState.timesheets) newState.timesheets = previous.timesheets;
    combinedRef.current = newState;

    updateBusinessData({
      employees: newState.employees,
      attendance: newState.attendance,
      leaves: newState.leaves,
      regularizations: newState.regularizations,
      projects: newState.projects,
      tasks: newState.tasks,
      timesheets: newState.timesheets,
      students: newState.students,
      auditLogs: newState.auditLogs,
    });

    const newUiState = { ...newState };
    delete newUiState.employees;
    delete newUiState.attendance;
    delete newUiState.leaves;
    delete newUiState.regularizations;
    delete newUiState.projects;
    delete newUiState.tasks;
    delete newUiState.timesheets;
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
      initialSubTab={resolvedSubTab}
      initialOpenApplyModal={applyParam}
    />
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<TabsTablePageSkeleton />}>
      <AttendanceContent />
    </Suspense>
  );
}
