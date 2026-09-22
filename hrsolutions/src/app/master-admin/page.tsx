'use client';

import React, { Suspense } from 'react';
import { MasterAdminDashboard } from '@/components/modules/master-admin/MasterAdminDashboard';
import { AdminPageSkeleton } from '@/components/skeletons';
import { isMasterAdminHost, MASTER_ADMIN_ORIGIN, SAME_ORIGIN_HOST } from '@/config/origins';

function HostGate({ children }: { children: React.ReactNode }) {
  if (
    typeof window !== 'undefined' &&
    !SAME_ORIGIN_HOST &&
    !isMasterAdminHost(window.location.hostname)
  ) {
    window.location.replace(`${MASTER_ADMIN_ORIGIN}/master-admin`);
    return <AdminPageSkeleton fullPage />;
  }
  return <>{children}</>;
}

export default function MasterAdminPage() {
  return (
    <HostGate>
      <Suspense fallback={<AdminPageSkeleton fullPage />}>
        <MasterAdminDashboard />
      </Suspense>
    </HostGate>
  );
}
