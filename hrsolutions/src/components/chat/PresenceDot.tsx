'use client';

import React from 'react';

export function PresenceDot({ online, className = '' }: { online: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={online ? 'Online' : 'Offline'}
      title={online ? 'Online' : 'Offline'}
      className={`inline-block h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg-surface)] ${
        online ? 'bg-[#53886b]' : 'bg-[#cad5dc] dark:bg-slate-600'
      } ${className}`}
    />
  );
}
