'use client';

import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from '@/services/apiClient';
import { isNativePlatform } from './platform';
import {
  getAppNotificationsEnabled,
  markNotificationIdsSeen,
  requestAppNotificationPermission,
  setAppNotificationsEnabled,
} from './notifications';

const TOKEN_KEY = 'pixbe_native_push_token';
const PLATFORM_KEY = 'pixbe_native_push_platform';

let listenersReady = false;
let registering = false;

function canUseDom(): boolean {
  return typeof window !== 'undefined';
}

function nativePlatform(): 'android' | 'ios' | null {
  if (!isNativePlatform()) return null;
  const platform = Capacitor.getPlatform();
  if (platform === 'android' || platform === 'ios') return platform;
  return null;
}

function readStoredToken(): string | null {
  if (!canUseDom()) return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Whether this device already registered an FCM/APNs token with the backend. */
export function hasNativePushToken(): boolean {
  return Boolean(readStoredToken());
}

function markPushPayloadSeen(data: Record<string, unknown>): void {
  markNotificationIdsSeen([
    typeof data.notificationId === 'string' ? data.notificationId : null,
    typeof data.tag === 'string' ? data.tag : null,
  ]);
}

function storeToken(token: string, platform: 'android' | 'ios'): void {
  if (!canUseDom()) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(PLATFORM_KEY, platform);
  } catch {
    // ignore
  }
}

function clearStoredToken(): void {
  if (!canUseDom()) return;
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PLATFORM_KEY);
  } catch {
    // ignore
  }
}

async function publishToken(token: string, platform: 'android' | 'ios'): Promise<boolean> {
  try {
    const res = await api.push.saveDevice({ token, platform });
    if (!res.success) return false;
    storeToken(token, platform);
    return true;
  } catch {
    return false;
  }
}

function openDeepLink(url?: string | null): void {
  if (!url || typeof url !== 'string') return;
  const path = url.startsWith('http')
    ? (() => {
        try {
          const parsed = new URL(url);
          return `${parsed.pathname}${parsed.search}${parsed.hash}`;
        } catch {
          return '/notifications';
        }
      })()
    : url.startsWith('/')
      ? url
      : `/${url}`;
  if (path.startsWith('/')) window.location.assign(path);
}

async function ensureListeners(): Promise<void> {
  if (!isNativePlatform() || listenersReady) return;
  listenersReady = true;

  await PushNotifications.addListener('registration', (event) => {
    const platform = nativePlatform();
    if (!platform || !event.value) return;
    void publishToken(event.value, platform);
  });

  await PushNotifications.addListener('registrationError', (event) => {
    console.debug('[NativePush] registration failed', event.error);
  });

  await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
    const data = (event.notification?.data || {}) as Record<string, unknown>;
    markPushPayloadSeen(data);
    const url = (data.url || data.linkUrl || data.path) as string | undefined;
    openDeepLink(url);
  });

  await PushNotifications.addListener('pushNotificationReceived', () => {
    // Foreground only: the OS does not show a tray item here. Inbox bridge
    // schedules the single local alert. Background duplicates are avoided by
    // skipping the bridge while remote push owns delivery.
  });
}

/**
 * Register this device for FCM/APNs remote push. No-op on web.
 */
export async function registerNativePush(): Promise<boolean> {
  const platform = nativePlatform();
  if (!platform || registering) return false;
  if (!getAppNotificationsEnabled()) return false;

  registering = true;
  try {
    await ensureListeners();
    const granted = await requestAppNotificationPermission();
    if (!granted) return false;

    const perm = await PushNotifications.checkPermissions();
    let receive = perm.receive;
    if (receive !== 'granted') {
      const requested = await PushNotifications.requestPermissions();
      receive = requested.receive;
    }
    if (receive !== 'granted') {
      setAppNotificationsEnabled(false);
      return false;
    }

    await PushNotifications.register();
    return true;
  } catch (err) {
    console.debug('[NativePush] register failed', err);
    return false;
  } finally {
    registering = false;
  }
}

export async function unregisterNativePush(): Promise<void> {
  if (!isNativePlatform()) return;
  const token = readStoredToken();
  clearStoredToken();
  setAppNotificationsEnabled(false);
  if (!token) return;
  try {
    await api.push.deleteDevice(token);
  } catch {
    // ignore offline / expired session
  }
}

/**
 * Bootstrap remote push after login / shell init.
 */
export async function initNativePush(): Promise<() => void> {
  if (!isNativePlatform()) return () => undefined;
  try {
    await ensureListeners();
    if (getAppNotificationsEnabled() && api.getToken()) {
      void registerNativePush();
    }
  } catch {
    // Plugin may be missing until cap sync
  }
  return () => undefined;
}
