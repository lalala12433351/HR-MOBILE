import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const LOCAL_APP_ORIGIN = 'http://localhost:3000';
const APP_ORIGIN = (
  process.env.NEXT_PUBLIC_APP_ORIGIN ||
  (process.env.NODE_ENV === 'production' ? 'https://app.pixbe.in' : LOCAL_APP_ORIGIN)
).replace(/\/+$/, '');
const MASTER_ADMIN_ORIGIN = (
  process.env.NEXT_PUBLIC_MASTER_ADMIN_ORIGIN ||
  (process.env.NODE_ENV === 'production' ? 'https://masteradmin.pixbe.in' : LOCAL_APP_ORIGIN)
).replace(/\/+$/, '');

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

function isLoopbackHost(hostname: string): boolean {
  const h = hostnameOnly(hostname);
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/** Env pair both point at loopback — local/dev same-host mode. */
const SAME_HOST =
  hostOf(APP_ORIGIN) === hostOf(MASTER_ADMIN_ORIGIN) && isLoopbackHost(hostOf(APP_ORIGIN));

function looksLikeMasterAdminHostname(hostname: string): boolean {
  const h = hostnameOnly(hostname);
  return (
    h === 'masteradmin' ||
    h.startsWith('masteradmin.') ||
    h === 'masteadmin' ||
    h.startsWith('masteadmin.')
  );
}

function requestHost(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-host');
  if (forwarded) {
    return forwarded.split(',')[0].trim().toLowerCase();
  }
  return (request.headers.get('host') || request.nextUrl.host || '').toLowerCase();
}

/** Public origin as the browser sees it (not the loopback URL behind nginx). */
function requestPublicOrigin(request: NextRequest): string {
  const host = requestHost(request);
  if (!host) return request.nextUrl.origin;
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const proto = (
    forwardedProto?.split(',')[0].trim() ||
    (isLoopbackHost(host) ? request.nextUrl.protocol.replace(/:$/, '') : 'https')
  ).replace(/:$/, '');
  return `${proto}://${host}`;
}

function isMasterAdminRequest(request: NextRequest): boolean {
  const host = hostnameOnly(requestHost(request));
  if (looksLikeMasterAdminHostname(host)) return true;
  const masterHost = hostnameOnly(hostOf(MASTER_ADMIN_ORIGIN));
  if (SAME_HOST) return host === masterHost || isLoopbackHost(host);
  return host === masterHost;
}

function isAppRequest(request: NextRequest): boolean {
  const host = hostnameOnly(requestHost(request));
  if (looksLikeMasterAdminHostname(host)) return false;
  const appHost = hostnameOnly(hostOf(APP_ORIGIN));
  if (host === appHost) return true;
  if (SAME_HOST && isLoopbackHost(host)) return true;
  // Public host while APP_ORIGIN still defaults to localhost (missing NEXT_PUBLIC_*).
  if (isLoopbackHost(appHost) && !isLoopbackHost(host)) return true;
  return false;
}

const TENANT_PREFIXES = [
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
];

function isTenantPath(pathname: string): boolean {
  return TENANT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function publicProto(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const host = hostnameOnly(requestHost(request));
  const proto = (
    forwardedProto?.split(',')[0].trim() ||
    (isLoopbackHost(host) ? request.nextUrl.protocol.replace(/:$/, '') : 'https')
  ).replace(/:$/, '');
  return `${proto}:`;
}

/** Never send a public visitor to a loopback URL baked into env defaults. */
function publicRedirectBase(preferred: string, request: NextRequest): string {
  const host = hostnameOnly(requestHost(request));
  if (!isLoopbackHost(host) && isLoopbackHost(hostOf(preferred))) {
    return requestPublicOrigin(request);
  }
  return preferred;
}

/** Prefer configured APP_ORIGIN; if unset, derive app.<root> from masteradmin.<root>. */
function resolveAppOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_ORIGIN) return APP_ORIGIN;
  const host = hostnameOnly(requestHost(request));
  if (looksLikeMasterAdminHostname(host) && host.includes('.')) {
    const root = host.replace(/^(masteradmin|masteadmin)\./, '');
    return `${publicProto(request)}//app.${root}`;
  }
  if (!isLoopbackHost(host) && host.includes('.')) {
    return requestPublicOrigin(request);
  }
  return APP_ORIGIN;
}

function resolveMasterAdminOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_MASTER_ADMIN_ORIGIN) return MASTER_ADMIN_ORIGIN;
  const host = hostnameOnly(requestHost(request));
  if (!isLoopbackHost(host) && host.includes('.')) {
    // app.pixbe.in → masteradmin.pixbe.in
    if (host.startsWith('app.')) {
      return `${publicProto(request)}//masteradmin.${host.slice(4)}`;
    }
    if (looksLikeMasterAdminHostname(host)) {
      return requestPublicOrigin(request);
    }
  }
  return MASTER_ADMIN_ORIGIN;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const onMasterHost = isMasterAdminRequest(request);
  const onAppHost = isAppRequest(request);
  const host = hostnameOnly(requestHost(request));
  const publicOrigin = requestPublicOrigin(request);
  // Loopback browser (local next dev) always serves both apps, even if NEXT_PUBLIC_*
  // points at production split hosts for emails and deployed links.
  const sameHost = isLoopbackHost(host);
  // Apply split-host rules whenever the request is clearly on the platform console,
  // even if NEXT_PUBLIC_* origins are unset (both defaulting to localhost).
  const enforceMasterHost = onMasterHost && !isLoopbackHost(host);
  const appOrigin = resolveAppOrigin(request);
  const masterOrigin = resolveMasterAdminOrigin(request);

  // --- Split-host enforcement ---
  if (!sameHost || enforceMasterHost) {
    // App host: never serve the platform console
    if (onAppHost && (pathname === '/master-admin' || pathname.startsWith('/master-admin/'))) {
      return NextResponse.redirect(new URL('/master-admin', publicRedirectBase(masterOrigin, request)));
    }

    // Master-admin host: console only — redirect (not rewrite) so client pathname is /master-admin
    if (onMasterHost) {
      if (pathname === '/' || pathname === '') {
        const dest = new URL('/master-admin', publicOrigin);
        return NextResponse.redirect(dest);
      }
      if (isTenantPath(pathname)) {
        const appBase = sameHost && !enforceMasterHost ? publicOrigin : publicRedirectBase(appOrigin, request);
        return NextResponse.redirect(new URL(pathname + request.nextUrl.search, appBase));
      }
    }
  }

  // Do not cookie-gate /dashboard or /setup here. Access tokens live in localStorage
  // (cookies are too small for Cognito JWTs and vanish on some browser restarts).
  // AppShell restores the session client-side and sends unauthenticated users to /login.

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/master-admin',
    '/master-admin/:path*',
    '/setup/:path*',
    '/dashboard/:path*',
    '/login',
    '/login/:path*',
    '/register',
    '/register/:path*',
    '/signup',
    '/signup/:path*',
    '/employee-onboarding',
    '/employee-onboarding/:path*',
    '/student-login',
    '/student-login/:path*',
    '/student-attendance',
    '/student-attendance/:path*',
    '/impersonate',
    '/impersonate/:path*',
    '/accept-invite',
    '/forgot-password',
    '/reset-password',
  ],
};
