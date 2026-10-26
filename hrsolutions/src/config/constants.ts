/**
 * Application Constants & Configuration
 * Centralizes all geographical coordinates, API endpoints, and system defaults.
 */

export const DEFAULT_GEO_COORDINATES = {
  latitude: 12.9279,
  longitude: 77.6271,
} as const;

export const DEFAULT_OFFICE_RADIUS_METERS = 150;
export const MAX_GEOFENCE_LIMIT_METERS = 1000;
export const MIN_GEOFENCE_LIMIT_METERS = 20;

export const API_CONFIG = {
  BASE_URL:
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BACKEND_URL
      ? `${process.env.NEXT_PUBLIC_BACKEND_URL.replace(/\/+$/, '')}/api/v1`
      : '') || '/api/v1',
} as const;

export const DEFAULT_WORKING_HOURS = {
  start: '09:00',
  end: '18:00',
} as const;

export const DEFAULT_WORKING_DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
] as const;

export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_CURRENCY_SYMBOL = '₹';
