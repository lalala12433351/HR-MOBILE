'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { TabsTablePageSkeleton } from '@/components/skeletons';

export default function ReportsSettingsPage() {
  const { isLoaded } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded) router.replace('/settings?section=reports');
  }, [isLoaded, router]);

  return <TabsTablePageSkeleton tabCount={4} rowCount={6} />;
}
