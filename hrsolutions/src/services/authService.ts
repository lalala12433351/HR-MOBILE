import { api } from './apiClient';
import { DISABLE_LOCAL_STORAGE } from './store';

export type AuthSessionRole = 'platform_admin' | 'super_admin' | 'hr_manager' | 'manager' | 'employee' | 'student';

export interface UserAuthSession {
  sub: string;
  email: string;
  role: AuthSessionRole;
  tenantId: string;
  dbSchema: string;
  name?: string;
  token: string;
}

export class AuthService {
  private static STORAGE_KEY = 'BOS_AUTH_SESSION';

  /**
   * Get active user session
   */
  public static getSession(): UserAuthSession | null {
    if (typeof window === 'undefined') return null;
    try {
      if ((window as any).__BOS_AUTH_SESSION__) {
        return (window as any).__BOS_AUTH_SESSION__;
      }
      try {
        const sessionRaw = sessionStorage.getItem(this.STORAGE_KEY);
        if (sessionRaw) return JSON.parse(sessionRaw);
      } catch (_) {}
      if (!DISABLE_LOCAL_STORAGE) {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      }
      if (typeof document !== 'undefined') {
        const cookieStr = document.cookie.split('; ').find((row) => row.startsWith(`${this.STORAGE_KEY}=`));
        if (cookieStr) {
          const val = decodeURIComponent(cookieStr.split('=')[1]);
          if (val && val.startsWith('{')) return JSON.parse(val);
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Persist a verified backend session (Cognito staff JWT or student app JWT).
   */
  public static setSession(params: {
    token: string;
    sub: string;
    email: string;
    role: AuthSessionRole;
    tenantId: string;
    dbSchema?: string;
    name?: string;
    persist?: boolean;
    refreshToken?: string | null;
  }): UserAuthSession {
    const persist = params.persist !== false;
    const session: UserAuthSession = {
      sub: params.sub,
      email: params.email,
      role: params.role,
      tenantId: params.tenantId,
      dbSchema: params.dbSchema || `tenant_${params.tenantId}`,
      name: params.name || params.email,
      token: params.token,
    };

    if (typeof window !== 'undefined') {
      (window as any).__BOS_AUTH_SESSION__ = session;
      try {
        if (persist) {
          if (!DISABLE_LOCAL_STORAGE) {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
          }
          sessionStorage.removeItem(this.STORAGE_KEY);
        } else {
          sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
          if (!DISABLE_LOCAL_STORAGE) {
            localStorage.removeItem(this.STORAGE_KEY);
          }
        }
      } catch (_) {}
      api.setAuth(params.token, params.tenantId, {
        persist,
        refreshToken: params.refreshToken,
        email: params.email,
      });
    }

    return session;
  }

  /** @deprecated Prefer setSession — kept for call-site compatibility */
  public static setCognitoSession(params: {
    token: string;
    sub: string;
    email: string;
    role: AuthSessionRole;
    tenantId: string;
    dbSchema?: string;
    name?: string;
    persist?: boolean;
  }): UserAuthSession {
    return this.setSession(params);
  }

  /**
   * Logout and clear token
   */
  public static logout() {
    if (typeof document !== 'undefined') {
      document.cookie = `${this.STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`;
    }
    if (typeof window !== 'undefined') {
      delete (window as any).__BOS_AUTH_SESSION__;
      try {
        sessionStorage.removeItem(this.STORAGE_KEY);
      } catch (_) {}
      if (!DISABLE_LOCAL_STORAGE) {
        try {
          localStorage.removeItem(this.STORAGE_KEY);
        } catch (_) {}
      }
      api.clearAuth();
    }
  }
}
