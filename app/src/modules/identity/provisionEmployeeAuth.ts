import { pool } from '../../config/database.js';
import {
  cognitoAdminCreateUser,
  cognitoAdminSetUserPassword,
  cognitoFindUserSubByEmail,
} from '../../config/cognito.js';
import { generateUnusablePassword, hashPassword } from '../../utils/crypto.js';
import { log } from '../../utils/logger.js';
import { sendEmployeeInvite } from './employeeInvites.js';

export type ProvisionEmployeeAuthInput = {
  employeeId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  /** Explicit password set by an admin. When omitted the account is created locked until the invite is accepted. */
  password?: string;
  tenantId?: string;
  tenantSlug?: string;
  schemaName?: string;
  /** Email the employee a one-time setup link. */
  sendInvite?: boolean;
  invitedBy?: string;
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

/** Resolves the real tenant UUID + slug; JWT/header tenant ids are often slugs, not UUIDs. */
export async function resolveTenant(input: {
  tenantId?: string | null;
  tenantSlug?: string | null;
  schemaName?: string | null;
}): Promise<{ tenantUuid: string | null; tenantSlug: string | null }> {
  let tenantUuid = input.tenantId || null;
  let tenantSlug = input.tenantSlug || null;
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
  return { tenantUuid, tenantSlug };
}

/**
 * Creates (or reuses) a Cognito user, links global_auth_mapping, and updates the
 * tenant employee row. Without an explicit password the Cognito user gets a random
 * password nobody knows; the employee sets their own via the emailed invite link.
 */
export async function provisionEmployeeAuth(input: ProvisionEmployeeAuthInput): Promise<{
  cognitoSub: string;
  created: boolean;
  inviteSent: boolean;
}> {
  const cleanEmail = input.email.trim().toLowerCase();
  const explicitPassword = input.password?.trim() || '';
  const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || cleanEmail.split('@')[0];
  const role = input.role || 'employee';

  const { tenantUuid, tenantSlug } = await resolveTenant(input);

  let cognitoSub: string;
  let created = false;

  try {
    // Cognito's own emails stay suppressed: the app sends branded invites through SES instead.
    const createdUser = await cognitoAdminCreateUser({
      email: cleanEmail,
      password: explicitPassword || generateUnusablePassword(),
      name: fullName,
      role,
      tenantSlug: tenantSlug || undefined,
      suppressEmail: true,
    });
    cognitoSub = createdUser.userSub;
    created = true;
  } catch (err: any) {
    if (err?.name === 'UsernameExistsException') {
      if (explicitPassword) {
        try {
          await cognitoAdminSetUserPassword({ username: cleanEmail, password: explicitPassword, permanent: true });
        } catch (pwdErr: any) {
          log.warn(`Could not reset Cognito password for existing user ${cleanEmail}`, pwdErr);
        }
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
    const passwordHash = explicitPassword ? hashPassword(explicitPassword) : null;
    // No password yet means the login stays off until the invite is accepted.
    const accountIsLive = Boolean(explicitPassword);
    await pool.query(
      `INSERT INTO public.global_auth_mapping (cognito_sub, email, password_hash, tenant_id, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = COALESCE(EXCLUDED.password_hash, public.global_auth_mapping.password_hash),
         role = EXCLUDED.role,
         is_active = CASE WHEN $6 THEN true ELSE public.global_auth_mapping.is_active END`,
      [cognitoSub, cleanEmail, passwordHash, tenantUuid, role, accountIsLive]
    );
  } else {
    log.warn(`No tenant UUID resolved while provisioning ${cleanEmail}; Cognito user created without global_auth_mapping`);
  }

  let employeeRowId: string | null = isLikelyUuid(input.employeeId) ? input.employeeId : null;
  if (input.tenantQuery) {
    const nextStatus = input.sendInvite && !explicitPassword ? 'Invited' : 'Not Activated';
    const res = await input.tenantQuery(
      `UPDATE employees
       SET cognito_sub = $1,
           account_status = CASE
             WHEN COALESCE(NULLIF(account_status, ''), 'Not Activated') IN ('Not Activated', 'Invited', 'Auth Error') THEN $2
             ELSE account_status
           END
       WHERE ($3::uuid IS NOT NULL AND id = $3::uuid) OR LOWER(email) = $4
       RETURNING id`,
      [cognitoSub, nextStatus, employeeRowId, cleanEmail]
    );
    employeeRowId = res.rows[0]?.id || employeeRowId;
  }

  let inviteSent = false;
  if (input.sendInvite && !explicitPassword && tenantUuid) {
    try {
      await sendEmployeeInvite({
        email: cleanEmail,
        firstName: input.firstName,
        role,
        tenantId: tenantUuid,
        employeeId: employeeRowId,
        invitedBy: input.invitedBy,
      });
      inviteSent = true;
    } catch (inviteErr: any) {
      log.warn(`Invite email failed for ${cleanEmail}; admin can resend from the employee list`, inviteErr);
    }
  }

  return { cognitoSub, created, inviteSent };
}

export { isPlaceholderCognitoSub };
