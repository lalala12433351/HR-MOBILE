'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmployeeOnboardingView } from '@/components/modules/EmployeeOnboardingView';

function EmployeeOnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const employeeId = searchParams.get('id') || searchParams.get('employeeId') || undefined;

  return (
    <EmployeeOnboardingView
      employeeId={employeeId}
      onComplete={() => router.push('/dashboard')}
    />
  );
}

export default function EmployeeOnboardingPage() {
  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-white text-slate-500 font-medium">Loading Onboarding...</div>}>
      <EmployeeOnboardingContent />
    </Suspense>
  );
}
