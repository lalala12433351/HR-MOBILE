'use client';

import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapApp } from '@capacitor/app';
import { isNativePlatform } from './platform';

const PREF_KEY = 'pixbe_app_notifications_enabled';
const SEEN_KEY = 'pixbe_app_notifications_seen';
const CHANNEL_ID = 'pixbe_alerts';
const MAX_SEEN = 200;

export type AppNotificationPayload = {
  id?: string;
  title: string;
  body: string;
  /** Deep-link path inside the app, e.g. /notifications or /chat?c=… */
  linkUrl?: string;
};

let channelReady = false;
let actionListenerReady = false;
const shownSessionIds = new Set<string>();

function canUseDom(): boolean {
  return typeof window !== 'undefined';
}

export function getAppNotificationsEnabled(): boolean {
  if (!canUseDom()) return false;
  try {
    const raw = localStorage.getItem(PREF_KEY);
    // Default on so “normal notifications” work once permission is granted.
    if (raw === null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

export function setAppNotificationsEnabled(enabled: boolean): void {
  if (!canUseDom()) return;
  try {
    localStorage.setItem(PREF_KEY, enabled ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}

function loadSeenIds(): Set<string> {
  if (!canUseDom()) return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistSeenIds(ids: Set<string>): void {
  if (!canUseDom()) return;
  try {
    const list = Array.from(ids).slice(-MAX_SEEN);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

function markSeen(id: string): void {
  shownSessionIds.add(id);
  const seen = loadSeenIds();
  seen.add(id);
  persistSeenIds(seen);
}

function wasSeen(id: string): boolean {
  if (shownSessionIds.has(id)) return true;
  return loadSeenIds().has(id);
}

/** Stable numeric id for Capacitor (32-bit safe). */
function toNumericId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const n = Math.abs(hash);
  return n === 0 ? 1 : n;
}

async function ensureNativeChannel(): Promise<void> {
  if (!isNativePlatform() || channelReady) return;
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Pixbe HR alerts',
      description: 'Leave, attendance, tasks, chat, and system alerts',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    channelReady = true;
  } catch {
    // Channel APIs differ by OS version; schedule still works without it.
  }
}

async function ensureActionListener(): Promise<void> {
  if (!isNativePlatform() || actionListenerReady) return;
  actionListenerReady = true;
  try {
    await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const link = event.notification.extra?.linkUrl as string | undefined;
      if (link && typeof link === 'string' && link.startsWith('/')) {
        window.location.assign(link);
      }
    });
  } catch {
    actionListenerReady = false;
  }
}

export type AppNotificationPermission = 'granted' | 'denied' | 'prompt';

export async function getAppNotificationPermission(): Promise<AppNotificationPermission> {
  if (isNativePlatform()) {
    try {
      const { display } = await LocalNotifications.checkPermissions();
      if (display === 'granted') return 'granted';
      if (display === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'denied';
    }
  }

  if (!canUseDom() || typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

/**
 * Ask the OS / browser for notification permission and remember the preference.
 */
export async function requestAppNotificationPermission(): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      await ensureNativeChannel();
      const current = await LocalNotifications.checkPermissions();
      let display = current.display;
      if (display !== 'granted') {
        const requested = await LocalNotifications.requestPermissions();
        display = requested.display;
      }
      const granted = display === 'granted';
      setAppNotificationsEnabled(granted);
      if (granted) await ensureActionListener();
      return granted;
    } catch {
      setAppNotificationsEnabled(false);
      return false;
    }
  }

  if (!canUseDom() || typeof Notification === 'undefined') {
    setAppNotificationsEnabled(false);
    return false;
  }

  try {
    const result = await Notification.requestPermission();
    const granted = result === 'granted';
    setAppNotificationsEnabled(granted);
    return granted;
  } catch {
    setAppNotificationsEnabled(false);
    return false;
  }
}

async function showNative(payload: AppNotificationPayload, dedupeKey: string): Promise<void> {
  await ensureNativeChannel();
  await ensureActionListener();
  const numericId = toNumericId(dedupeKey);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: numericId,
        title: payload.title,
        body: payload.body,
        channelId: CHANNEL_ID,
        extra: { linkUrl: payload.linkUrl || '/notifications', sourceId: dedupeKey },
        schedule: { at: new Date(Date.now() + 250) },
      },
    ],
  });
}

async function showWeb(payload: AppNotificationPayload, force = false): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  // Avoid stacking OS + in-page toasts when the tab is focused — still show when hidden/minimized.
  if (!force && document.visibilityState === 'visible') return;

  const n = new Notification(payload.title, {
    body: payload.body,
    tag: payload.id || payload.title,
    icon: '/favicon.ico',
    data: { linkUrl: payload.linkUrl || '/notifications' },
  });
  n.onclick = () => {
    window.focus();
    const link = (n.data as { linkUrl?: string } | undefined)?.linkUrl;
    if (link && link.startsWith('/')) window.location.assign(link);
    n.close();
  };
}

export type ShowAppNotificationOptions = {
  /** When true, still notify even if the app/tab is focused (default for inbox items). */
  force?: boolean;
};

/**
 * Show a normal system notification (native tray or browser Notification API).
 * Dedupes by id across session + localStorage so sync refreshes do not spam.
 */
export async function showAppNotification(
  payload: AppNotificationPayload,
  options: ShowAppNotificationOptions = {},
): Promise<void> {
  if (!canUseDom()) return;
  if (!getAppNotificationsEnabled()) return;

  const title = (payload.title || '').trim();
  const body = (payload.body || '').trim();
  if (!title && !body) return;

  const dedupeKey = payload.id || `${title}|${body}`;
  if (wasSeen(dedupeKey)) return;

  const permission = await getAppNotificationPermission();
  if (permission !== 'granted') return;

  markSeen(dedupeKey);

  try {
    if (isNativePlatform()) {
      await showNative({ ...payload, title: title || 'Pixbe HR', body: body || title }, dedupeKey);
      return;
    }
    await showWeb({ ...payload, title: title || 'Pixbe HR', body: body || title }, options.force === true);
  } catch (err) {
    console.debug('[AppNotifications] failed to show', err);
  }
}

/**
 * Seed seen-ids from the current inbox so the first sync does not fire historical alerts.
 */
export function seedSeenNotificationIds(ids: string[]): void {
  const seen = loadSeenIds();
  for (const id of ids) {
    if (!id) continue;
    seen.add(id);
    shownSessionIds.add(id);
  }
  persistSeenIds(seen);
}

/** Mark ids as already delivered (e.g. remote push showed the tray). */
export function markNotificationIdsSeen(ids: Array<string | null | undefined>): void {
  seedSeenNotificationIds(ids.filter((id): id is string => Boolean(id)));
}

/** True when the web page / Capacitor WebView is in the foreground. */
export function isAppNotificationSurfaceActive(): boolean {
  if (!canUseDom()) return false;
  return document.visibilityState === 'visible';
}

/**
 * Bring app to foreground helpers — call once from native shell bootstrap.
 */
export async function initAppNotifications(): Promise<() => void> {
  if (!isNativePlatform()) return () => undefined;

  await ensureNativeChannel();
  await ensureActionListener();

  const listeners: Array<{ remove: () => Promise<void> }> = [];

  try {
    const resume = await CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        // no-op; reserved for future badge clear
      }
    });
    listeners.push(resume);
  } catch {
    // ignore
  }

  return () => {
    listeners.forEach((l) => {
      void l.remove();
    });
  };
}
