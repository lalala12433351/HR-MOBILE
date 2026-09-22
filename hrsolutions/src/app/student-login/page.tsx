'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StudentLoginView } from '@/components/auth/StudentLoginView';
import { useApp } from '@/context/AppContext';

export default function StudentLoginPage() {
  const router = useRouter();
  const { state, isLoaded } = useApp();

  useEffect(() => {
    if (isLoaded && state.isAuthenticated && state.currentPersona?.role === 'student') {
      router.replace('/student-attendance');
    }
  }, [isLoaded, state.isAuthenticated, state.currentPersona?.role, router]);

  return <StudentLoginView />;
}
