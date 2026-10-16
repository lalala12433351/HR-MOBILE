'use client';

import React, { Suspense } from 'react';
import { PayrollPageShell } from '@/components/modules/payroll/PayrollPageShell';
import { TabsTablePageSkeleton } from '@/components/skeletons';

export default function PayrollBillablePage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Suspense fallback={<TabsTablePageSkeleton />}>
        <PayrollPageShell step="billable" />
      </Suspense>
    </div>
  );
}
