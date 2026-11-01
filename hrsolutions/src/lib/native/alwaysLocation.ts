'use client';

import { registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import { isNativePlatform } from './platform';

type AlwaysLocationStatus = {
  always: boolean;
  whenInUse: boolean;
};

type AlwaysLocationPlugin = {
  check(): Promise<AlwaysLocationStatus>;
  request(): Promise<AlwaysLocationStatus>;
};

const AlwaysLocation = registerPlugin<AlwaysLocationPlugin>('AlwaysLocation');
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export async function checkAlwaysLocationPermission(): Promise<AlwaysLocationStatus> {
  if (!isNativePlatform()) {
    return { always: true, whenInUse: true };
  }
  try {
    return await AlwaysLocation.check();
  } catch {
    return { always: false, whenInUse: false };
  }
}

/**
 * Ensure OS location is "Allow all the time". Returns false when the user only
 * granted while-in-use / denied — callers must not start attendance tracking.
 */
export async function ensureAlwaysLocationPermission(): Promise<boolean> {
  if (!isNativePlatform()) return true;
  try {
    let status = await AlwaysLocation.check();
    if (status.always) return true;
    status = await AlwaysLocation.request();
    return status.always;
  } catch {
    return false;
  }
}

export async function openAlwaysLocationSettings(): Promise<void> {
  if (!isNativePlatform()) return;
  await BackgroundGeolocation.openSettings();
}
