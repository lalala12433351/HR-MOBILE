'use client';

import React, { Suspense } from 'react';
import { PayrollPageShell } from '@/components/modules/payroll/PayrollPageShell';
import { TabsTablePageSkeleton } from '@/components/skeletons';

export default function PayrollExportPage() {
  return (
    <div className="flex flex-1 flex-col">
      <Suspense fallback={<TabsTablePageSkeleton />}>
        <PayrollPageShell step="export" />
      </Suspense>
    </div>
  );
}
