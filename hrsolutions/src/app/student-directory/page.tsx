'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StudentDirectoryModule } from '@/components/modules/StudentDirectoryModule';
import { TabsTablePageSkeleton } from '@/components/skeletons';
import { useApp } from '@/context/AppContext';
import { useAttendanceData } from '@/hooks/useAttendanceData';
import { isInstitutionMode } from '@/utils/organizationMode';
import { AppState } from '@/services/store';

export default function StudentDirectoryPage() {
  const router = useRouter();
  const { state, updateState } = useApp();
  const { businessData, updateBusinessData, loading } = useAttendanceData();

  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);

  useEffect(() => {
    if (!isInstitution) {
      router.replace('/hr');
      return;
    }
    if (state.currentPersona?.role === 'student') {
      router.replace('/student-attendance');
    }
  }, [isInstitution, state.currentPersona?.role, router]);

  if (!isInstitution || state.currentPersona?.role === 'student' || loading) {
    return <TabsTablePageSkeleton />;
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
    <StudentDirectoryModule
      state={combinedState as any}
      onUpdateState={handleUpdateState}
    />
  );
}
