'use client';

import React, { Suspense } from 'react';
import { useApp } from '@/context/AppContext';
import { SettingsWorkspace } from '@/components/modules/SettingsWorkspace';
import { SettingsLoading } from '@/components/modules/settings/SettingsPrimitives';

function SettingsContent() {
  const { state, updateState, isLoaded } = useApp();

  if (!isLoaded) return <SettingsLoading />;

  return <SettingsWorkspace state={state} onUpdateState={updateState} />;
}

export default function SettingsPage() {
  return <Suspense fallback={<SettingsLoading />}><SettingsContent /></Suspense>;
}
