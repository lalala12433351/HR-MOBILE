'use client';

import { useCallback, useEffect, useState } from 'react';
import { applyNativeStatusBarTheme } from '@/lib/native/shell';

type ThemeMode = 'light' | 'dark';
const storageKey = 'pixbe-theme';

function systemTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  root.style.colorScheme = mode;
  const color = mode === 'dark' ? '#141a22' : '#f3f5f7';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  void applyNativeStatusBarTheme(mode);
}

/** Appearance always follows the device system setting (no in-app override). */
export function useThemePreference(_legacyMode?: ThemeMode) {
  const [preference, setPreference] = useState<ThemeMode | null>(null);
  const mode = preference ?? 'light';

  useEffect(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* Storage can be unavailable. */
    }

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setPreference(systemTheme());
    sync();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
      return () => media.removeEventListener('change', sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (preference === null) return;
    applyTheme(preference);
  }, [preference]);

  const toggleThemeMode = useCallback(() => {
    /* Theme is locked to the system preference. */
  }, []);

  return { themeMode: mode, toggleThemeMode };
}
