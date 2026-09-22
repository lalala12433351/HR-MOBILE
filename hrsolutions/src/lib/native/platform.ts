'use client';

import { Capacitor } from '@capacitor/core';

export function isNativePlatform(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

export function getNativePlatform(): 'ios' | 'android' | 'web' {
  if (!isNativePlatform()) return 'web';
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') return platform;
  return 'web';
}
