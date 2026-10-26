/**
 * Dual-host origins for the tenant app vs platform master-admin console.
 * When both resolve to the same localhost host (local dev), host gating is relaxed.
 */

const LOCAL_APP_ORIGIN = 'http://localhost:3000';
/** Canonical tenant app host — used whenever env is missing or still points at localhost. */
export const APP_PIXBE_IN = 'https://app.pixbe.in';
const PROD_MASTER_ADMIN_ORIGIN = 'https://masteradmin.pixbe.in';

function isLoopbackOrigin(value: string): boolean {
  return /https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/i.test(value.trim());
}

function trimOrigin(value: string | undefined, fallback: string): string {
  const raw = (value || '').trim().replace(/\/+$/, '');
  if (!raw || isLoopbackOrigin(raw)) return fallback;
  return raw;
}

function isProductionRuntime(): boolean {
  return (typeof process !== 'undefined' ? process.env.NODE_ENV : undefined) === 'production';
}

export const APP_ORIGIN = trimOrigin(
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_APP_ORIGIN : undefined,
  isProductionRuntime() ? APP_PIXBE_IN : LOCAL_APP_ORIGIN
);

export const MASTER_ADMIN_ORIGIN = trimOrigin(
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_MASTER_ADMIN_ORIGIN : undefined,
  isProductionRuntime() ? PROD_MASTER_ADMIN_ORIGIN : LOCAL_APP_ORIGIN
);

function hostOf(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return origin.toLowerCase();
  }
}

function hostnameOnly(host: string): string {
  return host.split(':')[0].toLowerCase();
}

export function isLoopbackHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const h = hostnameOnly(hostname);
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/**
 * Hostname looks like the platform console (independent of env — survives missing NEXT_PUBLIC_*).
 * Matches masteradmin.pixbe.in and common typo masteadmin.pixbe.in.
 */
export function looksLikeMasterAdminHostname(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const h = hostnameOnly(hostname);
  return (
    h === 'masteradmin' ||
    h.startsWith('masteradmin.') ||
    h === 'masteadmin' ||
    h.startsWith('masteadmin.')
  );
}

/** True when app + master-admin share a loopback hostname (typical local/dev). */
export const SAME_ORIGIN_HOST =
  hostOf(APP_ORIGIN) === hostOf(MASTER_ADMIN_ORIGIN) && isLoopbackHost(hostOf(APP_ORIGIN));

/**
 * Local `next dev` on localhost/127.0.0.1. Production dual-host env vars must not
 * bounce this browser to app.pixbe.in / masteradmin.pixbe.in.
 */
export function isLocalDevHost(hostname: string | null | undefined): boolean {
  return isLoopbackHost(hostname);
}

/** Console URL for the current browser — loopback stays on this origin. */
export function masterAdminHref(path = '/master-admin'): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined' && isLocalDevHost(window.location.hostname)) {
    return `${window.location.origin}${suffix}`;
  }
  return `${MASTER_ADMIN_ORIGIN}${suffix}`;
}

export function isMasterAdminHost(hostname: string | null | undefined): boolean {
  if (looksLikeMasterAdminHostname(hostname)) return true;
  if (!hostname) return SAME_ORIGIN_HOST;
  const host = hostnameOnly(hostname);
  const masterHost = hostnameOnly(hostOf(MASTER_ADMIN_ORIGIN));
  if (SAME_ORIGIN_HOST) {
    return host === masterHost || isLoopbackHost(host);
  }
  return host === masterHost;
}

export function isAppHost(hostname: string | null | undefined): boolean {
  if (!hostname) return SAME_ORIGIN_HOST;
  // Never treat the platform console hostname as the tenant app
  if (looksLikeMasterAdminHostname(hostname)) return false;
  const host = hostnameOnly(hostname);
  const appHost = hostnameOnly(hostOf(APP_ORIGIN));
  if (host === appHost) return true;
  if (SAME_ORIGIN_HOST && isLoopbackHost(host)) return true;
  if (isLoopbackHost(appHost) && !isLoopbackHost(host)) return true;
  return false;
}

/** Paths that belong to the tenant HR app (blocked on master-admin host). */
export const TENANT_APP_PATH_PREFIXES = [
  '/dashboard',
  '/login',
  '/register',
  '/signup',
  '/setup',
  '/employee-onboarding',
  '/student-login',
  '/student-attendance',
  '/impersonate',
  '/accept-invite',
  '/forgot-password',
  '/reset-password',
] as const;

export function isTenantAppPath(pathname: string): boolean {
  return TENANT_APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export const IMPERSONATION_TENANT_KEY = 'BOS_IMPERSONATED_TENANT';
