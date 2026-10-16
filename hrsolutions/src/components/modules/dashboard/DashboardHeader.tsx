'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { isInstitutionMode } from '@/utils/organizationMode';

export const DashboardHeader: React.FC = () => {
  const { state } = useApp();
  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);

  return (
    <header className="dash-header">
      <h1 className="dash-header-title">
        {isInstitution ? 'Review classes and staff today' : "Review today's operations"}
      </h1>
    </header>
  );
};
