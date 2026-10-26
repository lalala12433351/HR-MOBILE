'use client';

import React from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { isInstitutionMode } from '@/utils/organizationMode';

export const DashboardHeader: React.FC<{ variant?: 'admin' | 'hr' | 'employee' }> = ({ variant = 'admin' }) => {
  const { state } = useApp();
  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);
  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <header className="dash-intro">
      <div>
        <p className="dash-intro-date">{today}</p>
        <h1 className="dash-header-title">
          {variant === 'hr' ? 'Review people today' : variant === 'employee' ? "Start with today's work" : isInstitution ? 'Review classes and staff today' : "Review today's operations"}
        </h1>
      </div>
      {variant !== 'employee' && (
        <Link href={variant === 'hr' ? '/hr' : '/reports'} className="dash-secondary-btn">
          {variant === 'hr' ? 'Open directory' : isInstitution ? 'View registers' : 'View reports'}
        </Link>
      )}
    </header>
  );
};
