'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardPageSkeleton } from '@/components/skeletons';

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return <DashboardPageSkeleton />;
}
