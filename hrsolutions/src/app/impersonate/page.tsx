'use client';

import React, { Suspense } from 'react';
import ImpersonateAcceptPage from './ImpersonateAcceptClient';

export default function ImpersonatePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full flex items-center justify-center bg-[#f8fafc]">
          <div className="w-7 h-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ImpersonateAcceptPage />
    </Suspense>
  );
}
