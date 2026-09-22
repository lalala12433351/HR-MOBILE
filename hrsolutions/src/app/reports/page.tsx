'use client';

import React, { Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Settings } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useAttendanceData } from '@/hooks/useAttendanceData';
import { AttendanceReportsSection } from '@/components/modules/AttendanceReportsSection';
import { OpsOverview } from '@/components/modules/reports/OpsOverview';
import { isAdminPersona, isHRPersona } from '@/utils/teamAccess';
import { getDefaultReportSettings } from '@/utils/reportCatalog';
import { TabsTablePageSkeleton } from '@/components/skeletons';

function ReportsContent() {
  const { state: uiState, updateState: updateUiState, isLoaded } = useApp();
  const { businessData, updateBusinessData, loading } = useAttendanceData();
  const searchParams = useSearchParams();
  const router = useRouter();

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
      students: businessData.students.length ? businessData.students : uiState.students,
      auditLogs: businessData.auditLogs.length ? businessData.auditLogs : uiState.auditLogs,
    }),
    [uiState, businessData]
  );

  const reportSettings = {
    ...getDefaultReportSettings(),
    ...(combinedState.customOptions?.reportSettings || {}),
  };

  const tabParam = searchParams.get('tab');
  const activeTab: 'overview' | 'attendance' =
    tabParam === 'overview' || tabParam === 'attendance'
      ? tabParam
      : reportSettings.defaultTab || 'overview';

  const isExecutive =
    isAdminPersona(combinedState.currentPersona) || isHRPersona(combinedState.currentPersona);

  const setTab = (tab: 'overview' | 'attendance') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/reports?${params.toString()}`, { scroll: false });
  };

  const handleUpdateState = (updater: (prev: any) => any) => {
    const newState = updater(combinedState);

    updateBusinessData({
      employees: newState.employees,
      attendance: newState.attendance,
      leaves: newState.leaves,
      regularizations: newState.regularizations,
      projects: newState.projects,
      tasks: newState.tasks,
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
    delete newUiState.students;
    delete newUiState.auditLogs;

    updateUiState(() => newUiState);
  };

  if (loading || !isLoaded) {
    return <TabsTablePageSkeleton />;
  }

  return (
    <div className="-mx-3.5 sm:-mx-6 md:-mx-10 -mt-3 -mb-20 sm:-mb-24 min-h-[calc(100vh-1rem)] flex flex-col">
      <div className="px-4 sm:px-6 lg:px-7 pt-5 sm:pt-6 pb-4 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
          Reports
        </h1>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-0.5 rounded-xl bg-slate-100 border border-slate-200/80">
            <button
              type="button"
              onClick={() => setTab('overview')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-[transform,background-color,color,box-shadow] duration-150 ease-out cursor-pointer active:scale-[0.97] ${
                activeTab === 'overview'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setTab('attendance')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-[transform,background-color,color,box-shadow] duration-150 ease-out cursor-pointer active:scale-[0.97] ${
                activeTab === 'attendance'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Attendance
            </button>
          </div>

          {isExecutive && (
            <Link
              href="/reports/settings"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 shadow-xs transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Link>
          )}
        </div>
      </div>

      {activeTab === 'overview' ? (
        <OpsOverview state={combinedState} />
      ) : (
        <AttendanceReportsSection
          state={combinedState}
          onUpdateState={handleUpdateState}
          isFullBleed={true}
        />
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<TabsTablePageSkeleton />}>
      <ReportsContent />
    </Suspense>
  );
}
