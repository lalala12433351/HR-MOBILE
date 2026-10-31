'use client';

export { isNativePlatform, getNativePlatform } from './platform';
export {
  getCurrentPosition,
  watchPosition,
  ensureLocationPermission,
  distanceMeters,
} from './geolocation';
export type {
  NativeCoords,
  GetPositionOptions,
  WatchPositionOptions,
  PositionWatchHandle,
} from './geolocation';
export {
  getSelfieStream,
  captureSelfiePhoto,
  pickAvatarPhoto,
  canUseNativePhotoPicker,
} from './camera';
export { openExternalUrl } from './browser';
export { downloadBlob, downloadTextFile } from './download';
export { initNativeShell, applyNativeStatusBarTheme } from './shell';
export {
  getAppNotificationsEnabled,
  setAppNotificationsEnabled,
  getAppNotificationPermission,
  requestAppNotificationPermission,
  showAppNotification,
  seedSeenNotificationIds,
  initAppNotifications,
} from './notifications';
export type { AppNotificationPayload, AppNotificationPermission } from './notifications';
export { initNativePush, registerNativePush, unregisterNativePush } from './push';
