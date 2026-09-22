'use client';

import { Geolocation, type Position } from '@capacitor/geolocation';
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

function toNativeCoords(position: Position): NativeCoords {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? 5,
  };
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
    const permission = await Geolocation.checkPermissions();
    if (permission.location !== 'granted') {
      const requested = await Geolocation.requestPermissions();
      if (requested.location !== 'granted') {
        throw new Error('Location permission denied');
      }
    }

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
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy || 5,
        });
      },
      (error) => {
        reject(new Error(error.message || 'Failed to get location'));
      },
      { enableHighAccuracy, timeout, maximumAge }
    );
  });
}
