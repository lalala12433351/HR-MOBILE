import { Request, Response, NextFunction } from 'express';
import { verifyCognitoToken } from '../config/cognito.js';
import { UserRole } from '../types/index.js';
import { pool } from '../config/database.js';
import { sanitizeSchemaName } from '../db/queryRunner.js';
import { verifyJwt } from '../utils/crypto.js';
import { log } from '../utils/logger.js';

type AppJwtPayload = {
  sub?: string;
  email?: string;
  role?: string;
  tenant_id?: string;
  db_schema?: string;
  name?: string;
  student_id?: string;
  impersonation?: boolean;
  impersonated_tenant_id?: string;
  impersonated_tenant_name?: string;
  operator_email?: string;
  exp?: number;
  iat?: number;
};

type AuthIdentityCacheEntry = {
  expiresAt: number;
  tenantRecord: any | null;
  effectiveRole: UserRole;
  tenantId: string;
  schemaName: string;
};

const AUTH_IDENTITY_TTL_MS = 60_000;
const authIdentityCache = new Map<string, AuthIdentityCacheEntry>();

function getCachedIdentity(sub: string): AuthIdentityCacheEntry | null {
  const hit = authIdentityCache.get(sub);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    authIdentityCache.delete(sub);
    return null;
  }
  return hit;
}

function setCachedIdentity(sub: string, entry: Omit<AuthIdentityCacheEntry, 'expiresAt'>): void {
  authIdentityCache.set(sub, { ...entry, expiresAt: Date.now() + AUTH_IDENTITY_TTL_MS });
}

async function resolveGlobalAuthMapping(sub: string, email: string): Promise<any | null> {
  try {
    const bySub = await pool.query(
      `SELECT gam.*, t.id as tenant_uuid, t.slug as tenant_slug, t.schema_name, t.status as tenant_status,
              t.name as tenant_name, t.industry as tenant_industry
       FROM public.global_auth_mapping gam
       JOIN public.tenants t ON gam.tenant_id = t.id
       WHERE gam.cognito_sub = $1
       ORDER BY gam.is_active DESC, gam.created_at DESC
       LIMIT 1`,
      [sub]
    );
    if (bySub.rows.length > 0) return bySub.rows[0];

    if (email) {
      const byEmail = await pool.query(
        `SELECT gam.*, t.id as tenant_uuid, t.slug as tenant_slug, t.schema_name, t.status as tenant_status,
                t.name as tenant_name, t.industry as tenant_industry
         FROM public.global_auth_mapping gam
         JOIN public.tenants t ON gam.tenant_id = t.id
         WHERE LOWER(gam.email) = $1
         ORDER BY gam.is_active DESC, gam.created_at DESC
         LIMIT 1`,
        [email]
      );
      if (byEmail.rows.length > 0) return byEmail.rows[0];
    }
  } catch (dbErr: any) {
    log.warn('Notice: Control plane lookup error in auth middleware', { error: dbErr.message });
  }
  return null;
}

async function resolveEmployeeRole(
  schemaName: string,
  sub: string,
  email: string
): Promise<UserRole | undefined> {
  try {
    const bySub = await pool.query(
      `SELECT role FROM "${schemaName}".employees WHERE cognito_sub = $1 LIMIT 1`,
      [sub]
    );
    if (bySub.rows[0]?.role) return bySub.rows[0].role as UserRole;

    if (email) {
      const byEmail = await pool.query(
        `SELECT role FROM "${schemaName}".employees WHERE LOWER(email) = $1 LIMIT 1`,
        [email]
      );
      if (byEmail.rows[0]?.role) return byEmail.rows[0].role as UserRole;
    }
  } catch (_) {}
  return undefined;
}

/**
 * AWS Cognito Multi-Tenant Authentication Middleware:
 * Verifies Bearer JWT tokens with AWS Cognito (staff) or app-signed JWT (students)
 * and resolves the tenant's isolated PostgreSQL schema.
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  // Extract Bearer token from header or query parameter
  let token: string | undefined;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    log.auth('Token Missing', { status: 'FAILED', reason: 'Missing Authorization Bearer header' });
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or malformed Authorization header. Expected format: Bearer <token>',
      },
    });
    return;
  }

  try {
    // 0. App-signed JWTs (students + platform impersonation sessions)
    const appJwt = verifyJwt<AppJwtPayload>(token);
    if (appJwt?.impersonation === true && appJwt.sub && appJwt.tenant_id && appJwt.db_schema) {
      let schemaName = appJwt.db_schema;
      try {
        schemaName = sanitizeSchemaName(schemaName);
      } catch (_) {
        schemaName = `tenant_${appJwt.tenant_id}`;
      }

      req.tenant = {
        id: appJwt.impersonated_tenant_id || appJwt.tenant_id,
        schema: schemaName,
        userSub: appJwt.sub,
        slug: appJwt.tenant_id,
        name: appJwt.impersonated_tenant_name || undefined,
      };
      req.user = {
        sub: appJwt.sub,
        email: (appJwt.email || `${appJwt.sub}@cognito.local`).toLowerCase(),
        role: 'super_admin',
        tenant_id: appJwt.tenant_id,
        db_schema: schemaName,
        name: appJwt.name || appJwt.operator_email || appJwt.email,
      };
      req.tenantId = appJwt.tenant_id;
      req.dbSchema = schemaName;
      (req as any).impersonation = {
        active: true,
        tenantId: appJwt.impersonated_tenant_id,
        tenantName: appJwt.impersonated_tenant_name,
        operatorEmail: appJwt.operator_email,
      };

      log.auth('Impersonation Token', {
        email: req.user.email,
        tenantId: appJwt.tenant_id,
        status: 'VERIFIED',
      });
      next();
      return;
    }

    // 0b. App-signed platform_admin JWT (password_hash login path)
    if (appJwt?.role === 'platform_admin' && appJwt.sub) {
      let schemaName = appJwt.db_schema || 'tenant_platform';
      try {
        schemaName = sanitizeSchemaName(schemaName);
      } catch (_) {
        schemaName = 'tenant_platform';
      }
      req.tenant = {
        id: appJwt.tenant_id || 'platform',
        schema: schemaName,
        userSub: appJwt.sub,
        slug: appJwt.tenant_id || 'platform',
      };
      req.user = {
        sub: appJwt.sub,
        email: (appJwt.email || `${appJwt.sub}@cognito.local`).toLowerCase(),
        role: 'platform_admin',
        tenant_id: appJwt.tenant_id || 'platform',
        db_schema: schemaName,
        name: appJwt.name || appJwt.email,
      };
      req.tenantId = appJwt.tenant_id || 'platform';
      req.dbSchema = schemaName;
      next();
      return;
    }

    if (appJwt?.role === 'student' && appJwt.sub) {
      try {
        await attachStudentContext(req, appJwt);
        next();
        return;
      } catch (studentErr: any) {
        if (studentErr?.code === 'TENANT_SUSPENDED') {
          res.status(403).json({
            success: false,
            error: {
              code: 'TENANT_SUSPENDED',
              message: 'The organization workspace associated with this account is currently suspended.',
            },
          });
          return;
        }
        if (studentErr?.code === 'ACCOUNT_DEACTIVATED') {
          res.status(403).json({
            success: false,
            error: {
              code: 'ACCOUNT_DEACTIVATED',
              message: 'Your account has been deactivated. Please contact your administrator.',
            },
          });
          return;
        }
        throw studentErr;
      }
    }

    // 1. Validate token signature, expiration, and issuer using AWS Cognito Verifier
    const payload = await verifyCognitoToken(token);

    if (!payload || !payload.sub) {
      log.auth('Token Verification', { status: 'FAILED', reason: 'Invalid or missing user sub in token' });
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'The provided authentication token is invalid or expired.',
        },
      });
      return;
    }

    const sub = payload.sub;
    const email = (payload.email || '').trim().toLowerCase();
    const role = ((payload['custom:role'] || payload.role || 'employee') as UserRole);

    const cached = getCachedIdentity(sub);
    let tenantRecord: any = null;
    let tenantId: string;
    let schemaName: string;
    let effectiveRole: UserRole;

    if (cached) {
      tenantRecord = cached.tenantRecord;
      tenantId = cached.tenantId;
      schemaName = cached.schemaName;
      effectiveRole = cached.effectiveRole;
    } else {
      // 2. Resolve Tenant Identity from PostgreSQL Control Plane
      tenantRecord = await resolveGlobalAuthMapping(sub, email);

      tenantId = tenantRecord?.tenant_slug || payload['custom:tenant_id'] || payload.tenant_id || 'demo';
      schemaName =
        tenantRecord?.schema_name || payload['custom:db_schema'] || payload.db_schema || `tenant_${tenantId}`;

      try {
        schemaName = sanitizeSchemaName(schemaName);
      } catch (_) {
        schemaName = 'tenant_demo';
      }

      // Prefer tenant employee.role for authorization (mapping / Cognito custom:role can lag)
      // Never demote platform_admin via a tenant employee row.
      effectiveRole = (tenantRecord?.role || role) as UserRole;
      if (effectiveRole !== 'platform_admin' && schemaName && (email || sub)) {
        const empRole = await resolveEmployeeRole(schemaName, sub, email);
        if (empRole) {
          effectiveRole = empRole;
          if (tenantRecord?.role && tenantRecord.role !== empRole && tenantRecord.id) {
            pool
              .query(
                `UPDATE public.global_auth_mapping SET role = $1
                 WHERE id = $2 OR (cognito_sub = $3 AND tenant_id = $4)`,
                [empRole, tenantRecord.id, sub, tenantRecord.tenant_uuid]
              )
              .catch(() => {});
          }
        }
      }

      setCachedIdentity(sub, {
        tenantRecord,
        effectiveRole,
        tenantId,
        schemaName,
      });
    }

    // Validate provided X-Tenant-ID header matches bound tenant context if present
    const headerTenant = req.headers['x-tenant-id'] as string;
    if (
      headerTenant &&
      tenantRecord?.tenant_slug &&
      headerTenant.trim().toLowerCase() !== tenantRecord.tenant_slug.trim().toLowerCase()
    ) {
      log.warn(
        `Security Warning: Header X-Tenant-ID mismatch "${headerTenant}" vs mapped "${tenantRecord.tenant_slug}"`
      );
    }

    // Check if organization is suspended
    if (tenantRecord && tenantRecord.tenant_status === 'suspended') {
      log.warn(`Access Denied: Tenant workspace "${tenantId}" is suspended`, { user: email });
      res.status(403).json({
        success: false,
        error: {
          code: 'TENANT_SUSPENDED',
          message: 'The organization workspace associated with this account is currently suspended.',
        },
      });
      return;
    }

    // Check if account is deactivated in global auth mapping
    if (tenantRecord && tenantRecord.is_active === false) {
      log.warn(`Access Denied: User account "${email}" is deactivated in global mapping`);
      res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Your account has been deactivated. Please contact your administrator.',
        },
      });
      return;
    }

    log.auth('Token Verification', {
      email,
      sub,
      role: effectiveRole,
      tenantId,
      status: 'VERIFIED',
    });

    log.tenant('Active Tenant Schema Context', {
      tenantId,
      schemaName,
      userEmail: email,
      userRole: effectiveRole,
      reason: tenantRecord
        ? cached
          ? 'Resolved via short-TTL auth identity cache'
          : 'Resolved via public.global_auth_mapping'
        : 'Resolved via JWT / Header fallback',
    });

    // 3. Attach Tenant & User Context to the Request
    req.tenant = {
      id: tenantRecord?.tenant_uuid || tenantId,
      schema: schemaName,
      userSub: sub,
      slug: tenantRecord?.tenant_slug || tenantId,
      name: tenantRecord?.tenant_name || undefined,
      industry: tenantRecord?.tenant_industry || undefined,
    };

    req.user = {
      sub,
      email: email || `${sub}@cognito.local`,
      role: effectiveRole,
      tenant_id: tenantId,
      db_schema: schemaName,
      name: payload.name || payload['cognito:username'] || email,
    };

    req.tenantId = tenantId;
    req.dbSchema = schemaName;

    next();
  } catch (error: any) {
    log.auth('Token Verification', {
      status: 'FAILED',
      reason: error.message || 'Token verification failed',
    });

    res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'The provided authentication token is invalid or expired.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
    });
  }
}

async function attachStudentContext(req: Request, appJwt: AppJwtPayload): Promise<void> {
  const sub = appJwt.sub!;
  const email = (appJwt.email || '').trim().toLowerCase();
  let tenantId = appJwt.tenant_id || 'demo';
  let schemaName = appJwt.db_schema || `tenant_${tenantId}`;
  let tenantUuid: string | undefined;
  let tenantStatus: string | undefined;
  let mappingActive: boolean | undefined;
  let tenantName: string | undefined;
  let tenantIndustry: string | undefined;

  try {
    const bySub = await pool.query(
      `SELECT gam.*, t.id as tenant_uuid, t.slug as tenant_slug, t.schema_name, t.status as tenant_status,
              t.name as tenant_name, t.industry as tenant_industry
       FROM public.global_auth_mapping gam
       JOIN public.tenants t ON gam.tenant_id = t.id
       WHERE gam.cognito_sub = $1
       ORDER BY gam.is_active DESC, gam.created_at DESC
       LIMIT 1`,
      [sub]
    );
    let row = bySub.rows[0];
    if (!row && email) {
      const byEmail = await pool.query(
        `SELECT gam.*, t.id as tenant_uuid, t.slug as tenant_slug, t.schema_name, t.status as tenant_status,
                t.name as tenant_name, t.industry as tenant_industry
         FROM public.global_auth_mapping gam
         JOIN public.tenants t ON gam.tenant_id = t.id
         WHERE LOWER(gam.email) = $1
         ORDER BY gam.is_active DESC, gam.created_at DESC
         LIMIT 1`,
        [email]
      );
      row = byEmail.rows[0];
    }
    if (row) {
      tenantUuid = row.tenant_uuid;
      tenantId = row.tenant_slug || tenantId;
      schemaName = row.schema_name || schemaName;
      tenantStatus = row.tenant_status;
      mappingActive = row.is_active;
      tenantName = row.tenant_name || undefined;
      tenantIndustry = row.tenant_industry || undefined;
    }
  } catch (dbErr: any) {
    log.warn('Notice: Control plane lookup error for student JWT', { error: dbErr.message });
  }

  try {
    schemaName = sanitizeSchemaName(schemaName);
  } catch (_) {
    schemaName = 'tenant_demo';
  }

  if (tenantStatus === 'suspended') {
    const err: any = new Error('TENANT_SUSPENDED');
    err.code = 'TENANT_SUSPENDED';
    throw err;
  }
  if (mappingActive === false) {
    const err: any = new Error('ACCOUNT_DEACTIVATED');
    err.code = 'ACCOUNT_DEACTIVATED';
    throw err;
  }

  log.auth('Token Verification', {
    email,
    sub,
    role: 'student',
    tenantId,
    status: 'VERIFIED',
  });

  req.tenant = {
    id: tenantUuid || tenantId,
    schema: schemaName,
    userSub: sub,
    slug: tenantId,
    name: tenantName,
    industry: tenantIndustry,
  };

  req.user = {
    sub,
    email: email || `${sub}@student.local`,
    role: 'student',
    tenant_id: tenantId,
    db_schema: schemaName,
    name: appJwt.name || email,
  };

  req.tenantId = tenantId;
  req.dbSchema = schemaName;
}
