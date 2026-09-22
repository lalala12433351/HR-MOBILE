'use client';

import { useEffect } from 'react';
import { initNativeShell } from '@/lib/native';

/**
 * Boots Capacitor StatusBar / Splash / hardware back when running in the native shell.
 */
export function NativeShellBootstrap() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;
    void initNativeShell().then((dispose) => {
      cleanup = dispose;
    });
    return () => {
      cleanup?.();
    };
  }, []);

  return null;
}
