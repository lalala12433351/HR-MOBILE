'use client';

import { useCallback, useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark';
const storageKey = 'pixbe-theme';

/** Appearance belongs to this device, independently of workspace settings sync. */
export function useThemePreference(legacyMode?: ThemeMode) {
  const [preference, setPreference] = useState<ThemeMode | null>(null);
  const mode = preference ?? legacyMode ?? 'light';
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(storageKey); } catch { /* Storage can be unavailable. */ }
    setPreference(saved === 'dark' || saved === 'light' ? saved : legacyMode ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey && (event.newValue === 'dark' || event.newValue === 'light')) setPreference(event.newValue);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [legacyMode]);
  useEffect(() => {
    if (preference === null) return;
    const root = document.documentElement;
    root.dataset.theme = preference;
    root.classList.toggle('dark', preference === 'dark');
    root.classList.toggle('light', preference === 'light');
    root.style.colorScheme = preference;
    const color = preference === 'dark' ? '#141a22' : '#f3f5f7';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    try { localStorage.setItem(storageKey, preference); } catch { /* Theme still works in memory. */ }
  }, [preference]);
  const toggleThemeMode = useCallback(() => setPreference(current => (current ?? mode) === 'dark' ? 'light' : 'dark'), [mode]);
  return { themeMode: mode, toggleThemeMode };
}
