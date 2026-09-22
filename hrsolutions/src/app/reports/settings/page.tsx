'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { ReportsSettingsView } from '@/components/modules/reports/ReportsSettingsView';
import { TabsTablePageSkeleton } from '@/components/skeletons';
import { isAdminPersona, isHRPersona } from '@/utils/teamAccess';

export default function ReportsSettingsPage() {
  const { state, updateState, isLoaded } = useApp();
  const router = useRouter();

  const isExecutive =
    isAdminPersona(state.currentPersona) || isHRPersona(state.currentPersona);

  useEffect(() => {
    if (isLoaded && !isExecutive) {
      router.replace('/reports');
    }
  }, [isLoaded, isExecutive, router]);

  if (!isLoaded || !isExecutive) {
    return <TabsTablePageSkeleton tabCount={3} rowCount={6} />;
  }

  return (
    <div className="px-1 sm:px-0 py-2">
      <ReportsSettingsView state={state} onUpdateState={updateState} />
    </div>
  );
}
