'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useAttendanceData } from '@/hooks/useAttendanceData';
import { StudentAttendanceModule } from '@/components/modules/StudentAttendanceModule';
import { TabsTablePageSkeleton } from '@/components/skeletons';
import { isInstitutionMode } from '@/utils/organizationMode';
import { AppState } from '@/services/store';

export default function StudentAttendancePage() {
  const router = useRouter();
  const { state, updateState } = useApp();
  const { businessData, updateBusinessData, loading } = useAttendanceData();

  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);
  const isStudent = state.currentPersona?.role === 'student';

  useEffect(() => {
    if (!isInstitution && !isStudent) {
      router.replace('/attendance');
    }
  }, [isInstitution, isStudent, router]);

  if ((!isInstitution && !isStudent) || loading) {
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
    <StudentAttendanceModule
      state={combinedState as any}
      onUpdateState={handleUpdateState}
    />
  );
}
