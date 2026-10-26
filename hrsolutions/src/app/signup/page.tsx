'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthOnboardingView } from '@/components/auth/AuthOnboardingView';
import { useApp } from '@/context/AppContext';
import { useMobileViewport } from '@/hooks/useMobileViewport';

export default function SignupPage() {
  const router = useRouter();
  const mobile = useMobileViewport();
  const { state, isLoaded } = useApp();

  useEffect(() => {
    if (mobile) {
      router.replace('/login');
      return;
    }
    if (isLoaded && state.isAuthenticated) {
      if (state.currentPersona?.role === 'student') {
        router.replace('/student-attendance');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [isLoaded, state.isAuthenticated, state.currentPersona?.role, router, mobile]);

  if (mobile) return null;

  return (
    <AuthOnboardingView
      initialView="signup"
      onComplete={(targetRoute) => router.push(targetRoute || '/dashboard')}
    />
  );
}
