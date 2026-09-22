'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { useCommsData } from '@/hooks/useCommsData';
import { AnnouncementsModule } from '@/components/modules/AnnouncementsModule';
import { ListFeedPageSkeleton } from '@/components/skeletons';
import { AppState } from '@/services/store';

export default function AnnouncementsPage() {
  const { state, updateState, triggerToast } = useApp();
  const { businessData, updateBusinessData, loading } = useCommsData();

  if (loading) return <ListFeedPageSkeleton />;

  const combinedState = { ...state, ...businessData };

  const handleUpdateState = (updater: (prev: AppState) => AppState) => {
    const nextState = updater(combinedState as AppState);
    const businessKeys = ['announcements', 'notifications'];
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
    <AnnouncementsModule
      state={combinedState as any}
      onUpdateState={handleUpdateState}
      onTriggerToast={(toast) => triggerToast(toast as any)}
    />
  );
}
