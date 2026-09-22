'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { StudentSetupWizard } from '@/components/modules/StudentSetupWizard';
import { isInstitutionMode } from '@/utils/organizationMode';

export default function SetupStudentsPage() {
  const router = useRouter();
  const { state } = useApp();

  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);

  useEffect(() => {
    if (!isInstitution) {
      router.replace('/hr');
    }
  }, [isInstitution, router]);

  if (!isInstitution) {
    return null;
  }

  return <StudentSetupWizard />;
}
