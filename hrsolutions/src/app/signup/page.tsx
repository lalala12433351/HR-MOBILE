'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthOnboardingView } from '@/components/auth/AuthOnboardingView';
import { useApp } from '@/context/AppContext';

export default function SignupPage() {
  const router = useRouter();
  const { state, isLoaded } = useApp();

  useEffect(() => {
    if (isLoaded && state.isAuthenticated) {
      if (state.currentPersona?.role === 'student') {
        router.replace('/student-attendance');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [isLoaded, state.isAuthenticated, state.currentPersona?.role, router]);

  return (
    <AuthOnboardingView
      initialView="signup"
      onComplete={(targetRoute) => router.push(targetRoute || '/dashboard')}
    />
  );
}
