'use client';

import React from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import type { LicenseSummary } from '@/types';
import { isAdminPersona } from '@/utils/teamAccess';

export function LicenseBanner() {
  const { state } = useApp();
  const license = (state.license || null) as LicenseSummary | null;
  if (!license) return null;
  if (license.status !== 'trialing' && license.status !== 'expiring' && license.status !== 'expired' && license.status !== 'canceled') {
    return null;
  }

  const days = license.daysRemaining;
  const copy =
    license.status === 'trialing'
      ? `${license.planName} trial · ${Math.max(0, days)} day${Math.max(0, days) === 1 ? '' : 's'} remaining`
      : license.status === 'expiring'
        ? `${license.planName} expires in ${Math.max(0, days)} day${Math.max(0, days) === 1 ? '' : 's'}`
        : license.status === 'canceled'
          ? `${license.planName} was revoked. New people cannot be added until a license is restored.`
          : `${license.planName} has expired. New people cannot be added until the license is extended.`;

  const tone =
    license.status === 'expired' || license.status === 'canceled'
      ? 'bg-[#faeeee] text-[#8b3133]'
      : 'bg-[#fff6e8] text-[#8a5a16]';
  const href = isAdminPersona(state.currentPersona) ? '/settings?section=license' : undefined;

  return (
    <div className={`px-4 py-2 text-[13px] font-medium ${tone}`} role="status">
      {href ? (
        <Link href={href} className="underline-offset-2 hover:underline">
          {copy}
        </Link>
      ) : (
        copy
      )}
    </div>
  );
}
