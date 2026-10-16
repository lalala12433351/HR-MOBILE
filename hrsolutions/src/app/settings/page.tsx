'use client';

import React, { Suspense } from 'react';
import { useApp } from '@/context/AppContext';
import { SettingsWorkspace } from '@/components/modules/SettingsWorkspace';
import { TabsTablePageSkeleton } from '@/components/skeletons';

function SettingsContent() {
  const { state, updateState, isLoaded } = useApp();

  if (!isLoaded) return <TabsTablePageSkeleton tabCount={4} rowCount={6} />;

  return <SettingsWorkspace state={state} onUpdateState={updateState} />;
}

export default function SettingsPage() {
  return <Suspense fallback={<TabsTablePageSkeleton tabCount={4} rowCount={6} />}><SettingsContent /></Suspense>;
}
