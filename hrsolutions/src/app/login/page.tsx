'use client';

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AuthOnboardingView } from '@/components/auth/AuthOnboardingView';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';

function needsEmployeeOnboarding(state: ReturnType<typeof useApp>['state']): boolean {
  const role = state.currentPersona?.role;
  if (!role || role === 'student' || role === 'super_admin') return false;

  const persona = state.currentPersona;
  const matched = (state.employees || []).find(
    (e) =>
      e.id === persona?.id ||
      (persona?.email && e.email?.toLowerCase() === persona.email.toLowerCase())
  );
  if (!matched) return false;
  if (matched.hasCompletedProfile === true) return false;
  if ((matched.onboardingProgress || 0) >= 100) return false;
  return true;
}

export default function LoginPage() {
  const router = useRouter();
  const { state, isLoaded } = useApp();
  // Only auto-redirect when the page loads already authenticated — never mid-login submit
  const coldStartHandled = useRef(false);

  useEffect(() => {
    if (!isLoaded || coldStartHandled.current) return;
    coldStartHandled.current = true;

    if (!state.isAuthenticated) return;

    const hasToken = Boolean(api.getToken());
    if (!hasToken) return;

    if (state.currentPersona?.role === 'student') {
      router.replace('/student-attendance');
      return;
    }

    if (needsEmployeeOnboarding(state)) {
      router.replace('/employee-onboarding');
      return;
    }

    router.replace('/dashboard');
  }, [isLoaded, state, router]);

  return (
    <AuthOnboardingView
      initialView="login"
      onComplete={(targetRoute) => router.push(targetRoute || '/dashboard')}
    />
  );
}
