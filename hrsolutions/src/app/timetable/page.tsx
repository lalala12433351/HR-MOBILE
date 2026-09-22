'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { useAttendanceData } from '@/hooks/useAttendanceData';
import { StudentTimetableModule } from '@/components/modules/students/StudentTimetableModule';
import { TabsTablePageSkeleton } from '@/components/skeletons';
import { AppState } from '@/services/store';

export default function TimetablePage() {
  const { state, updateState } = useApp();
  const { businessData, updateBusinessData, loading } = useAttendanceData();

  if (loading) {
    return <TabsTablePageSkeleton tabCount={3} rowCount={6} />;
  }

  const combinedState = { ...state, ...businessData };

  const handleUpdateState = (updater: (prev: AppState) => AppState) => {
    const nextState = updater(combinedState as AppState);
    const businessKeys = ['employees', 'attendance', 'leaves', 'projects', 'students', 'auditLogs', 'regularizations'];
    const bUpdates: any = {};
    const uiUpdates: any = {};
    Object.keys(nextState).forEach(key => {
      if (nextState[key as keyof AppState] !== (combinedState as AppState)[key as keyof AppState]) {
        if (businessKeys.includes(key)) {
          bUpdates[key] = nextState[key as keyof AppState];
        } else {
          uiUpdates[key] = nextState[key as keyof AppState];
        }
      }
    });
    if (Object.keys(bUpdates).length > 0) updateBusinessData(bUpdates);
    if (Object.keys(uiUpdates).length > 0) updateState((prev) => ({ ...prev, ...uiUpdates }));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <StudentTimetableModule
        state={combinedState as any}
        onUpdateState={handleUpdateState}
      />
    </div>
  );
}
