/**
 * Dual-host origins for the tenant app vs platform master-admin console.
 * When both resolve to the same localhost host (local dev), host gating is relaxed.
 */

function trimOrigin(value: string | undefined, fallback: string): string {
  const raw = (value || fallback).trim().replace(/\/+$/, '');
  return raw || fallback;
}

export const APP_ORIGIN = trimOrigin(
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_APP_ORIGIN : undefined,
  'http://localhost:3000'
);

export const MASTER_ADMIN_ORIGIN = trimOrigin(
  typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_MASTER_ADMIN_ORIGIN : undefined,
  'http://localhost:3000'
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

function isLoopbackHost(hostname: string | null | undefined): boolean {
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
  if (SAME_ORIGIN_HOST) {
    return host === appHost || isLoopbackHost(host);
  }
  return host === appHost;
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
] as const;

export function isTenantAppPath(pathname: string): boolean {
  return TENANT_APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export const IMPERSONATION_TENANT_KEY = 'BOS_IMPERSONATED_TENANT';
