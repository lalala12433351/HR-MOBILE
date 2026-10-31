'use client';

import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { isNativePlatform } from './platform';
import { initAppNotifications } from './notifications';
import { initNativePush } from './push';

let initialized = false;

type ThemeMode = 'light' | 'dark';

/** Match status-bar chrome to the active app theme (follows system dark/light). */
export async function applyNativeStatusBarTheme(mode: ThemeMode): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    // Style.Dark = dark icons (light bg); Style.Light = light icons (dark bg)
    await StatusBar.setStyle({ style: mode === 'dark' ? Style.Light : Style.Dark });
    await StatusBar.setBackgroundColor({ color: mode === 'dark' ? '#141a22' : '#f3f5f7' });
  } catch {
    // StatusBar unavailable on some platforms/simulators
  }
}

/**
 * One-time native shell bootstrap: status bar, splash, hardware back button, notifications.
 */
export async function initNativeShell(): Promise<() => void> {
  if (!isNativePlatform() || initialized) {
    return () => undefined;
  }
  initialized = true;

  const unsubscribers: Array<() => void> = [];

  const systemDark =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  await applyNativeStatusBarTheme(systemDark ? 'dark' : 'light');

  try {
    await SplashScreen.hide();
  } catch {
    // ignore
  }

  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch {
    // ignore
  }

  try {
    const disposeNotifications = await initAppNotifications();
    unsubscribers.push(disposeNotifications);
  } catch {
    // Local notifications plugin may be unavailable until cap sync
  }

  try {
    const disposePush = await initNativePush();
    unsubscribers.push(disposePush);
  } catch {
    // Push plugin may be unavailable until cap sync + google-services.json
  }

  const backListener = await CapApp.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack || window.history.length > 1) {
      window.history.back();
      return;
    }
    void CapApp.exitApp();
  });
  unsubscribers.push(() => {
    void backListener.remove();
  });

  return () => {
    unsubscribers.forEach((fn) => fn());
    initialized = false;
  };
}
