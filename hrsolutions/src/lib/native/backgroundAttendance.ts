'use client';

import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { API_CONFIG } from '@/config/constants';
import { api } from '@/services/apiClient';
import { ensureAlwaysLocationPermission } from './alwaysLocation';
import { requestAppNotificationPermission } from './notifications';
import { isNativePlatform } from './platform';
import type { NativeCoords } from './geolocation';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

const MIN_PING_MS = 15_000;

export type BackgroundPresenceResult = {
  status: 'inside' | 'outside' | 'signed_out' | 'ignored';
  reason?: string;
  outsideSince?: string | null;
  signsOutAt?: string | null;
  workDate?: string;
  checkOutLabel?: string;
  firstOutside?: boolean;
};

export type BackgroundAttendanceHandlers = {
  onCoords?: (coords: NativeCoords) => void;
  onPresence?: (data: BackgroundPresenceResult) => void;
  onError?: (error: Error) => void;
};

let watcherId: string | null = null;
let lastPingAt = 0;
let handlers: BackgroundAttendanceHandlers | null = null;
let starting: Promise<void> | null = null;

function isUsableAuthToken(value: string): boolean {
  return Boolean(value) && value !== '1' && value !== 'true' && value !== 'present';
}

/**
 * Post presence over Capacitor's native HTTP stack so Android keeps delivering
 * pings after ~5 minutes in the background (WebView fetch is throttled).
 */
async function postPresenceNative(
  latitude: number,
  longitude: number,
  accuracy: number | null
): Promise<BackgroundPresenceResult | null> {
  const token = api.getToken();
  if (!isUsableAuthToken(token)) return null;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const tenantId = api.getTenantId();
  if (tenantId) headers['X-Tenant-ID'] = tenantId;

  const response = await CapacitorHttp.request({
    url: `${API_CONFIG.BASE_URL}/attendance/presence`,
    method: 'POST',
    headers,
    data: { latitude, longitude, accuracy },
  });

  const body = response.data as
    | { success?: boolean; data?: BackgroundPresenceResult; error?: { message?: string } }
    | string
    | null;

  const parsed =
    typeof body === 'string'
      ? (JSON.parse(body) as {
          success?: boolean;
          data?: BackgroundPresenceResult;
          error?: { message?: string };
        })
      : body;

  if (response.status < 200 || response.status >= 300 || !parsed?.success || !parsed.data) {
    throw new Error(parsed?.error?.message || `Presence ping failed (${response.status})`);
  }
  return parsed.data;
}

async function handleLocation(coords: NativeCoords) {
  handlers?.onCoords?.(coords);
  const now = Date.now();
  if (now - lastPingAt < MIN_PING_MS) return;
  lastPingAt = now;
  try {
    const data = await postPresenceNative(coords.latitude, coords.longitude, coords.accuracy ?? null);
    if (data) handlers?.onPresence?.(data);
  } catch (err) {
    handlers?.onError?.(err instanceof Error ? err : new Error('Presence ping failed'));
  }
}

export function isBackgroundAttendanceTracking(): boolean {
  return Boolean(watcherId);
}

/**
 * Native foreground-service / always-location watcher for open office punches.
 * Continues while the app is backgrounded (and on Android while the sticky
 * notification is shown). Force-stop / iOS force-quit still ends tracking until relaunch.
 */
export async function startBackgroundAttendanceTracking(
  nextHandlers: BackgroundAttendanceHandlers = {}
): Promise<void> {
  if (!isNativePlatform()) return;
  handlers = nextHandlers;
  if (watcherId) return;
  if (starting) {
    await starting;
    return;
  }

  starting = (async () => {
    const always = await ensureAlwaysLocationPermission();
    if (!always) {
      throw new Error(
        'Location must be set to “Allow all the time” before attendance can be tracked.'
      );
    }

    // Android 13+ needs notification permission for the ongoing location notice.
    await requestAppNotificationPermission();

    const id = await BackgroundGeolocation.addWatcher(
      {
        backgroundMessage:
          'Pixbe HR is verifying you remain at the workplace while you are clocked in.',
        backgroundTitle: 'Attendance location active',
        requestPermissions: true,
        stale: false,
        // ~office corridor scale; plugin is distance-based, not timer-based.
        distanceFilter: 25,
      },
      (location, error) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            handlers?.onError?.(
              new Error(
                'Location must be set to “Allow all the time” for attendance while the app is in the background.'
              )
            );
            void stopBackgroundAttendanceTracking();
          } else {
            handlers?.onError?.(new Error(error.message || 'Background location failed'));
          }
          return;
        }
        if (!location) return;
        void handleLocation({
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy ?? 5,
        });
      }
    );

    watcherId = id;
  })();

  try {
    await starting;
  } finally {
    starting = null;
  }
}

export async function stopBackgroundAttendanceTracking(): Promise<void> {
  handlers = null;
  lastPingAt = 0;
  const id = watcherId;
  watcherId = null;
  if (!id || !isNativePlatform()) return;
  try {
    await BackgroundGeolocation.removeWatcher({ id });
  } catch {
    // Watcher may already be gone after process recycle.
  }
}

export { openAlwaysLocationSettings as openBackgroundLocationSettings } from './alwaysLocation';
