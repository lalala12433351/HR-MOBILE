'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { KiteLogoMark } from '@/components/common/KiteLogoMark';
import { Loader2 } from 'lucide-react';
import { isMasterAdminHost } from '@/config/origins';

export default function HomePage() {
  const router = useRouter();
  const { state, isLoaded } = useApp();
  const [redirectStep, setRedirectStep] = useState<string>('Verifying session...');
  const [hasRedirected, setHasRedirected] = useState(false);

  useEffect(() => {
    // Platform console host must never fall through to the tenant app home redirect
    if (typeof window !== 'undefined' && isMasterAdminHost(window.location.hostname)) {
      setRedirectStep('Opening platform console...');
      router.replace('/master-admin');
      return;
    }

    if (isLoaded && !hasRedirected) {
      setHasRedirected(true);
      if (state.isAuthenticated) {
        if (state.currentPersona?.role === 'student') {
          setRedirectStep('Connecting to Student Portal...');
          router.replace('/student-attendance');
        } else {
          setRedirectStep('Loading workspace...');
          router.replace('/dashboard');
        }
      } else {
        setRedirectStep('Redirecting to login...');
        router.replace('/login');
      }
    }
  }, [router, state.isAuthenticated, isLoaded, state.currentPersona?.role, hasRedirected]);

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-[#0b0f17] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-center p-6 select-none font-sans relative overflow-hidden">
      {/* Background Ambient Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 dark:bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

      {/* Minimalist Centered Content */}
      <div className="relative z-10 flex flex-col items-center text-center space-y-6 max-w-sm w-full animate-in fade-in duration-300">
        {/* Brand Icon Emblem */}
        <div className="relative flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl bg-blue-600/20 blur-md animate-pulse" />
          <div className="relative w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/20 ring-1 ring-white/20">
            <KiteLogoMark className="w-7 h-7 text-white" />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Pixbe HR
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Enterprise Workspace
          </p>
        </div>

        {/* Sleek Progress Line & Status Text */}
        <div className="w-full max-w-[200px] space-y-3 pt-2">
          <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full w-2/3 animate-pulse" />
          </div>

          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            <span>{redirectStep}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
