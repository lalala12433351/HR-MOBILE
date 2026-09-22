import { pool } from '../../config/database.js';
import {
  cognitoAdminCreateUser,
  cognitoAdminSetUserPassword,
  cognitoFindUserSubByEmail,
} from '../../config/cognito.js';
import { hashPassword } from '../../utils/crypto.js';
import { log } from '../../utils/logger.js';

const DEFAULT_TEMP_PASSWORD = 'Welcome@123';

export type ProvisionEmployeeAuthInput = {
  employeeId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  password?: string;
  tenantId?: string;
  tenantSlug?: string;
  schemaName?: string;
  /** Tenant-scoped query helper (optional). Updates cognito_sub on the employee row. */
  tenantQuery?: (text: string, params?: any[]) => Promise<{ rows: any[] }>;
};

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isPlaceholderCognitoSub(sub: string | null | undefined): boolean {
  if (!sub) return true;
  return sub.startsWith('sub_dev_') || sub.startsWith('user_') || sub.startsWith('sub_');
}

/**
 * Creates (or reuses) a Cognito user, links global_auth_mapping, and updates the
 * tenant employee row so login works.
 */
export async function provisionEmployeeAuth(input: ProvisionEmployeeAuthInput): Promise<{
  cognitoSub: string;
  temporaryPassword: string;
  created: boolean;
}> {
  const cleanEmail = input.email.trim().toLowerCase();
  const temporaryPassword = (input.password || DEFAULT_TEMP_PASSWORD).trim();
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || cleanEmail.split('@')[0];
  const role = input.role || 'employee';

  let tenantUuid = input.tenantId || null;
  let tenantSlug = input.tenantSlug || null;

  // Resolve real tenant UUID — JWT/header tenant ids are often slugs, not UUIDs.
  if (!tenantUuid || !isLikelyUuid(tenantUuid)) {
    const schemaName = input.schemaName || '';
    const slugHint = (tenantSlug || tenantUuid || schemaName.replace(/^tenant_/, '') || '').trim();
    const tenantRes = await pool.query(
      `SELECT id, slug FROM public.tenants
       WHERE ($1 <> '' AND schema_name = $1)
          OR ($2 <> '' AND slug = $2)
          OR ($2 <> '' AND schema_name = 'tenant_' || $2)
       LIMIT 1`,
      [schemaName, slugHint]
    );
    tenantUuid = tenantRes.rows[0]?.id || null;
    tenantSlug = tenantRes.rows[0]?.slug || tenantSlug;
  }

  let cognitoSub: string;
  let created = false;

  try {
    const createdUser = await cognitoAdminCreateUser({
      email: cleanEmail,
      password: temporaryPassword,
      name: fullName,
      role,
      tenantSlug: tenantSlug || undefined,
      suppressEmail: true,
    });
    cognitoSub = createdUser.userSub;
    created = true;
  } catch (err: any) {
    if (err?.name === 'UsernameExistsException') {
      try {
        await cognitoAdminSetUserPassword({
          username: cleanEmail,
          password: temporaryPassword,
          permanent: true,
        });
      } catch (pwdErr: any) {
        log.warn(`Could not reset Cognito password for existing user ${cleanEmail}`, pwdErr);
      }

      const lookedUp = await cognitoFindUserSubByEmail(cleanEmail);
      if (lookedUp) {
        cognitoSub = lookedUp;
      } else {
        const existing = await pool.query(
          'SELECT cognito_sub FROM public.global_auth_mapping WHERE LOWER(email) = $1 LIMIT 1',
          [cleanEmail]
        );
        const mappedSub = existing.rows[0]?.cognito_sub as string | undefined;
        if (mappedSub && !isPlaceholderCognitoSub(mappedSub)) {
          cognitoSub = mappedSub;
        } else {
          throw new Error(`Cognito user exists for ${cleanEmail} but sub could not be resolved`);
        }
      }
      log.info(`Cognito user already exists for ${cleanEmail}; reusing sub ${cognitoSub}`);
    } else {
      throw err;
    }
  }

  if (isPlaceholderCognitoSub(cognitoSub)) {
    throw new Error(`Refusing to persist placeholder Cognito sub for ${cleanEmail}`);
  }

  if (tenantUuid) {
    const passwordHash = hashPassword(temporaryPassword);
    await pool.query(
      `INSERT INTO public.global_auth_mapping (cognito_sub, email, password_hash, tenant_id, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         is_active = true`,
      [cognitoSub, cleanEmail, passwordHash, tenantUuid, role]
    );
  } else {
    log.warn(`No tenant UUID resolved while provisioning ${cleanEmail}; Cognito user created without global_auth_mapping`);
  }

  if (input.tenantQuery) {
    if (isLikelyUuid(input.employeeId)) {
      await input.tenantQuery(
        `UPDATE employees
         SET cognito_sub = $1,
             account_status = COALESCE(NULLIF(account_status, ''), 'Not Activated')
         WHERE id = $2::uuid OR LOWER(email) = $3`,
        [cognitoSub, input.employeeId, cleanEmail]
      );
    } else {
      await input.tenantQuery(
        `UPDATE employees
         SET cognito_sub = $1,
             account_status = COALESCE(NULLIF(account_status, ''), 'Not Activated')
         WHERE LOWER(email) = $2`,
        [cognitoSub, cleanEmail]
      );
    }
  }

  return { cognitoSub, temporaryPassword, created };
}

export { DEFAULT_TEMP_PASSWORD, isPlaceholderCognitoSub };
