'use client';

import React, { Suspense, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useAttendanceData } from '@/hooks/useAttendanceData';
import { ReportsWorkspace } from '@/components/modules/reports/ReportsWorkspace';
import { TabsTablePageSkeleton } from '@/components/skeletons';
import { isExecutiveOrAdmin } from '@/utils/teamAccess';

function ReportsContent() {
  const router = useRouter();
  const { state: uiState, isLoaded } = useApp();
  const { businessData, loading } = useAttendanceData();
  const canAccessReports = isExecutiveOrAdmin(uiState.currentPersona);

  useEffect(() => {
    if (!isLoaded) return;
    if (!uiState.isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (!canAccessReports) {
      router.replace('/dashboard');
    }
  }, [isLoaded, uiState.isAuthenticated, canAccessReports, router]);

  const combinedState = useMemo(
    () => ({
      ...uiState,
      employees: businessData.employees.length ? businessData.employees : uiState.employees,
      attendance: businessData.attendance.length ? businessData.attendance : uiState.attendance,
      leaves: businessData.leaves.length ? businessData.leaves : uiState.leaves,
      regularizations: businessData.regularizations.length
        ? businessData.regularizations
        : (uiState as any).regularizations || [],
      projects: businessData.projects.length ? businessData.projects : uiState.projects,
      tasks: businessData.tasks.length ? businessData.tasks : uiState.tasks,
      timesheets: uiState.timesheets || [],
      students: businessData.students.length ? businessData.students : uiState.students,
      auditLogs: businessData.auditLogs.length ? businessData.auditLogs : uiState.auditLogs,
    }),
    [uiState, businessData]
  );

  if (loading || !isLoaded || !canAccessReports) {
    return <TabsTablePageSkeleton />;
  }

  return <ReportsWorkspace state={combinedState} />;
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<TabsTablePageSkeleton />}>
      <ReportsContent />
    </Suspense>
  );
}
