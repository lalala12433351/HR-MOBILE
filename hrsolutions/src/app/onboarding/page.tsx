'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthOnboardingView } from '@/components/auth/AuthOnboardingView';
import { EmployeeOnboardingView } from '@/components/modules/EmployeeOnboardingView';

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const type = searchParams.get('type');
  const employeeId = searchParams.get('id') || searchParams.get('employeeId') || undefined;

  if (type === 'employee' || employeeId) {
    return (
      <EmployeeOnboardingView
        employeeId={employeeId}
        onComplete={() => router.push('/dashboard')}
      />
    );
  }

  return (
    <AuthOnboardingView
      initialView="onboarding"
      onComplete={(targetRoute) => router.push(targetRoute || '/dashboard')}
    />
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-white text-slate-500 font-medium">Loading...</div>}>
      <OnboardingContent />
    </Suspense>
  );
}
