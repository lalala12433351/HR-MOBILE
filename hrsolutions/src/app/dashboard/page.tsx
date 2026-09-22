'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { DashboardModule } from '@/components/modules/DashboardModule';
import { DashboardPageSkeleton } from '@/components/skeletons';

export default function DashboardPage() {
  const router = useRouter();
  const { state } = useApp();

  useEffect(() => {
    if (state.currentPersona?.role === 'student') {
      router.replace('/student-attendance');
      return;
    }

    const role = state.currentPersona?.role;
    if (!role || role === 'super_admin') return;

    const matched = (state.employees || []).find(
      (e) =>
        e.id === state.currentPersona?.id ||
        (state.currentPersona?.email &&
          e.email?.toLowerCase() === state.currentPersona.email.toLowerCase())
    );
    if (
      matched &&
      matched.hasCompletedProfile !== true &&
      (matched.onboardingProgress || 0) < 100
    ) {
      router.replace('/employee-onboarding');
    }
  }, [state.currentPersona, state.employees, router]);

  if (state.currentPersona?.role === 'student') {
    return <DashboardPageSkeleton />;
  }

  return <DashboardModule />;
}
