'use client';

import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard, KeyboardResize } from '@capacitor/keyboard';
import { isNativePlatform } from './platform';

let initialized = false;

/**
 * One-time native shell bootstrap: status bar, splash, hardware back button.
 */
export async function initNativeShell(): Promise<() => void> {
  if (!isNativePlatform() || initialized) {
    return () => undefined;
  }
  initialized = true;

  const unsubscribers: Array<() => void> = [];

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#f8fafc' });
  } catch {
    // StatusBar unavailable on some platforms/simulators
  }

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
