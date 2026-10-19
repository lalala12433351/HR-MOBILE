'use client';

import { Geolocation, type Position, type PermissionStatus } from '@capacitor/geolocation';
import { isNativePlatform } from './platform';

export type NativeCoords = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export type GetPositionOptions = {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
};

export type WatchPositionOptions = GetPositionOptions & {
  /** Minimum interval between callbacks (native may deliver faster). */
  minIntervalMs?: number;
};

function toNativeCoords(position: Position): NativeCoords {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? 5,
  };
}

function fromBrowserCoords(coords: GeolocationCoordinates): NativeCoords {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy || 5,
  };
}

/**
 * Request location permission. On native, also asks for "always" when supported
 * so workplace monitoring can continue while the app is backgrounded.
 */
export async function ensureLocationPermission(options: { always?: boolean } = {}): Promise<boolean> {
  if (isNativePlatform()) {
    try {
      let permission: PermissionStatus = await Geolocation.checkPermissions();
      if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
        permission = await Geolocation.requestPermissions();
      }
      const granted =
        permission.location === 'granted' || permission.coarseLocation === 'granted';
      // Capacitor Geolocation maps "always" via OS settings after when-in-use is granted.
      // A second request helps surface the Android background-location prompt when declared.
      if (granted && options.always) {
        try {
          await Geolocation.requestPermissions();
        } catch {
          // Foreground tracking still works without always/background.
        }
      }
      return granted;
    } catch {
      return false;
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return false;
  return true;
}

/**
 * Cross-platform geolocation: Capacitor plugin on native, browser API on web.
 */
export async function getCurrentPosition(
  options: GetPositionOptions = {}
): Promise<NativeCoords> {
  const {
    enableHighAccuracy = true,
    timeout = 15000,
    maximumAge = 0,
  } = options;

  if (isNativePlatform()) {
    const ok = await ensureLocationPermission({ always: true });
    if (!ok) throw new Error('Location permission denied');

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy,
      timeout,
      maximumAge,
    });
    return toNativeCoords(position);
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation is not supported');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(fromBrowserCoords(position.coords)),
      (error) => reject(new Error(error.message || 'Failed to get location')),
      { enableHighAccuracy, timeout, maximumAge }
    );
  });
}

export type PositionWatchHandle = {
  clear: () => void;
};

/**
 * Continuous location updates while the app process is alive.
 * On native Capacitor this uses the plugin watch; on web, navigator.watchPosition.
 */
export async function watchPosition(
  onUpdate: (coords: NativeCoords) => void,
  onError?: (error: Error) => void,
  options: WatchPositionOptions = {}
): Promise<PositionWatchHandle> {
  const {
    enableHighAccuracy = true,
    timeout = 15000,
    maximumAge = 30_000,
    minIntervalMs = 15_000,
  } = options;

  let lastEmit = 0;
  const emit = (coords: NativeCoords) => {
    const now = Date.now();
    if (now - lastEmit < minIntervalMs) return;
    lastEmit = now;
    onUpdate(coords);
  };

  if (isNativePlatform()) {
    const ok = await ensureLocationPermission({ always: true });
    if (!ok) {
      onError?.(new Error('Location permission denied'));
      return { clear: () => undefined };
    }

    const watchId = await Geolocation.watchPosition(
      { enableHighAccuracy, timeout, maximumAge },
      (position, err) => {
        if (err || !position) {
          onError?.(new Error(err?.message || 'Location watch failed'));
          return;
        }
        emit(toNativeCoords(position));
      }
    );

    return {
      clear: () => {
        void Geolocation.clearWatch({ id: watchId });
      },
    };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError?.(new Error('Geolocation is not supported'));
    return { clear: () => undefined };
  }

  const id = navigator.geolocation.watchPosition(
    (position) => emit(fromBrowserCoords(position.coords)),
    (error) => onError?.(new Error(error.message || 'Location watch failed')),
    { enableHighAccuracy, timeout, maximumAge }
  );

  return {
    clear: () => navigator.geolocation.clearWatch(id),
  };
}

/** Haversine distance in metres. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (n: number) => (n * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
