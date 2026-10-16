'use client';

import React, { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { HRMSModule } from '@/components/modules/HRMSModule';
import { TabsTablePageSkeleton } from '@/components/skeletons';

import { useHRMSData } from '@/hooks/useHRMSData';

function HRMSContent() {
  const { state: uiState, updateState: updateUiState, isLoaded } = useApp();
  const { businessData, updateBusinessData, loading } = useHRMSData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as
    | 'employees'
    | 'my_team'
    | 'organization'
    | 'directory'
    | 'org_chart'
    | 'attendance'
    | 'attendance_leaves'
    | 'leaves'
    | 'timesheets'
    | 'payroll'
    | 'employee_settings'
    | 'settings'
    | null;
  const viewParam = searchParams.get('view');
  const applyParam = searchParams.get('apply') === 'true';
  const empParam = searchParams.get('emp') || searchParams.get('employeeId') || undefined;
  const empTabParam = (searchParams.get('empTab') as
    | 'general'
    | 'job'
    | 'attendance_leave'
    | 'payroll'
    | 'documents'
    | 'setting'
    | null) || (tabParam === 'attendance' || tabParam === 'attendance_leaves' ? 'attendance_leave' : undefined);

  useEffect(() => {
    if (isLoaded && !uiState.isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoaded, uiState.isAuthenticated, router]);

  // Keep legacy deep links working while keeping configuration in the dedicated settings workspace.
  useEffect(() => {
    if (tabParam === 'leaves' || applyParam) {
      router.replace(`/attendance?tab=leaves${applyParam ? '&apply=true' : ''}`);
    } else if (tabParam === 'attendance' || tabParam === 'attendance_leaves') {
      router.replace('/attendance');
    } else if (tabParam === 'employee_settings' || tabParam === 'settings') {
      router.replace('/settings?section=people');
    }
  }, [tabParam, applyParam, router]);

  const rawResolved =
    tabParam ||
    (viewParam === 'org_chart' ? 'org_chart' : viewParam === 'directory' ? 'directory' : undefined);

  // Ensure resolvedTab is strictly one of the employee tabs
  const validEmployeeTabs = ['employees', 'my_team', 'organization', 'directory', 'org_chart'];
  const resolvedTab = rawResolved && validEmployeeTabs.includes(rawResolved) ? rawResolved : 'employees';

  // Prefer fetched roster; fall back to AppContext sync so empty businessData never wipes employees
  const combinedState = {
    ...uiState,
    ...businessData,
    employees:
      businessData.employees?.length > 0
        ? businessData.employees
        : uiState.employees || [],
    leaves:
      businessData.leaves?.length > 0 ? businessData.leaves : uiState.leaves || [],
    attendance:
      businessData.attendance?.length > 0
        ? businessData.attendance
        : uiState.attendance || [],
  };

  const handleUpdateState = (updater: (prev: any) => any) => {
    const newState = updater(combinedState);

    // Split updates back into UI state and business state
    updateBusinessData({
      employees: newState.employees,
      leaves: newState.leaves,
      timesheets: newState.timesheets,
      projects: newState.projects,
      tasks: newState.tasks,
      auditLogs: newState.auditLogs,
      payrolls: newState.payrolls,
      students: newState.students,
      attendance: newState.attendance
    });

    // Keep AppContext roster in sync so other modules / fallback merge stay fresh
    updateUiState((prev) => ({
      ...prev,
      ...newState,
      employees: newState.employees,
      leaves: newState.leaves,
      timesheets: newState.timesheets,
      projects: newState.projects,
      tasks: newState.tasks,
      auditLogs: newState.auditLogs,
      payrolls: newState.payrolls,
      students: newState.students,
      attendance: newState.attendance,
    }));
  };

  if (loading || !isLoaded) {
    return <TabsTablePageSkeleton />;
  }

  return (
    <HRMSModule
      state={combinedState}
      onUpdateState={handleUpdateState}
      moduleScope="employees"
      initialTab={resolvedTab as any}
      initialEmployeeId={empParam}
      initialEmployeeTab={empTabParam}
    />
  );
}

export default function HRPage() {
  return (
    <Suspense fallback={<TabsTablePageSkeleton />}>
      <HRMSContent />
    </Suspense>
  );
}
