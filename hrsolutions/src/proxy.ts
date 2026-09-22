import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
const MASTER_ADMIN_ORIGIN = (process.env.NEXT_PUBLIC_MASTER_ADMIN_ORIGIN || 'http://localhost:3000').replace(
  /\/+$/,
  ''
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
  if (SAME_HOST) return host === appHost || isLoopbackHost(host);
  return host === appHost;
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
];

function isTenantPath(pathname: string): boolean {
  return TENANT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Prefer configured APP_ORIGIN; if unset, derive app.<root> from masteradmin.<root>. */
function resolveAppOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_ORIGIN) return APP_ORIGIN;
  const host = hostnameOnly(requestHost(request));
  if (looksLikeMasterAdminHostname(host) && host.includes('.')) {
    const root = host.replace(/^(masteradmin|masteadmin)\./, '');
    const proto = request.nextUrl.protocol === 'http:' ? 'http:' : 'https:';
    return `${proto}//app.${root}`;
  }
  return APP_ORIGIN;
}

function resolveMasterAdminOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_MASTER_ADMIN_ORIGIN) return MASTER_ADMIN_ORIGIN;
  const host = hostnameOnly(requestHost(request));
  if (!isLoopbackHost(host) && host.includes('.')) {
    const proto = request.nextUrl.protocol === 'http:' ? 'http:' : 'https:';
    // app.pixbe.in → masteradmin.pixbe.in
    if (host.startsWith('app.')) {
      return `${proto}//masteradmin.${host.slice(4)}`;
    }
  }
  return MASTER_ADMIN_ORIGIN;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const onMasterHost = isMasterAdminRequest(request);
  const onAppHost = isAppRequest(request);
  const host = hostnameOnly(requestHost(request));
  // Apply split-host rules whenever the request is clearly on the platform console,
  // even if NEXT_PUBLIC_* origins are unset (both defaulting to localhost).
  const enforceMasterHost = onMasterHost && !isLoopbackHost(host);
  const appOrigin = resolveAppOrigin(request);
  const masterOrigin = resolveMasterAdminOrigin(request);

  // --- Split-host enforcement ---
  if (!SAME_HOST || enforceMasterHost) {
    // App host: never serve the platform console
    if (onAppHost && (pathname === '/master-admin' || pathname.startsWith('/master-admin/'))) {
      return NextResponse.redirect(new URL('/master-admin', masterOrigin));
    }

    // Master-admin host: console only — redirect (not rewrite) so client pathname is /master-admin
    if (onMasterHost) {
      if (pathname === '/' || pathname === '') {
        const dest = new URL('/master-admin', request.url);
        return NextResponse.redirect(dest);
      }
      if (isTenantPath(pathname)) {
        const appBase = SAME_HOST && !enforceMasterHost ? request.url : appOrigin;
        return NextResponse.redirect(new URL(pathname + request.nextUrl.search, appBase));
      }
    }
  }

  // Auth cookie gate for setup/dashboard (tenant app)
  if (pathname.startsWith('/setup') || pathname.startsWith('/dashboard')) {
    const token = request.cookies.get('BOS_AUTH_TOKEN')?.value;

    if (!token && !pathname.startsWith('/register') && !pathname.startsWith('/login')) {
      const loginBase = SAME_HOST || onAppHost ? request.url : appOrigin;
      return NextResponse.redirect(new URL('/login', loginBase));
    }
  }

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
  ],
};
