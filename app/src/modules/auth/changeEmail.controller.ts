import { Request, Response } from 'express';
import { pool } from '../../config/database.js';
import {
  cognitoAdminCreateUser,
  cognitoAdminDeleteUserByEmail,
  cognitoLogin,
  isLocalAuthFallbackEnabled,
} from '../../config/cognito.js';
import { frontendUrl, sendEmail } from '../../config/ses.js';
import {
  changeLoginEmailCodeEmail,
  changeLoginEmailNoticeEmail,
} from '../../emails/templates.js';
import { sanitizeSchemaName } from '../../db/queryRunner.js';
import { hashPassword } from '../../utils/crypto.js';
import { log } from '../../utils/logger.js';
import { isOrgWideRole } from '../../utils/employeeScope.js';
import {
  isPlaceholderCognitoSub,
  provisionEmployeeAuth,
  resolveTenant,
} from '../identity/provisionEmployeeAuth.js';
import { validateCognitoPassword } from './auth.controller.js';
import {
  AuthTokenError,
  OTP_TTL_MINUTES,
  assertResendCooldown,
  invalidateOpenTokens,
  issueOtp,
  verifyOtp,
} from './authTokens.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ChangeMode = 'self' | 'admin';

type ChangeMeta = {
  oldEmail: string;
  employeeId: string;
  tenantId: string;
  mode: ChangeMode;
  schemaName: string;
  role: string;
  firstName: string;
  lastName: string;
};

function cleanEmailOf(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function sendTokenError(res: Response, err: unknown): boolean {
  if (!(err instanceof AuthTokenError)) return false;
  const status =
    err.code === 'RESEND_COOLDOWN' || err.code === 'TOO_MANY_ATTEMPTS'
      ? 429
      : err.code === 'TOKEN_EXPIRED' || err.code === 'TOKEN_USED'
        ? 410
        : 400;
  if (err.retryAfterSeconds) res.setHeader('Retry-After', String(err.retryAfterSeconds));
  res.status(status).json({
    success: false,
    error: {
      code: err.code,
      message: err.message,
      details: err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : undefined,
    },
  });
  return true;
}

function asMeta(value: unknown): ChangeMeta | null {
  const raw = typeof value === 'string' ? safeJson(value) : value;
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const mode = row.mode === 'admin' ? 'admin' : row.mode === 'self' ? 'self' : null;
  const oldEmail = cleanEmailOf(row.oldEmail);
  const employeeId = String(row.employeeId || '');
  const tenantId = String(row.tenantId || '');
  const schemaName = String(row.schemaName || '');
  if (!mode || !EMAIL_RE.test(oldEmail) || !employeeId || !tenantId || !schemaName) return null;
  return {
    oldEmail,
    employeeId,
    tenantId,
    mode,
    schemaName,
    role: String(row.role || 'employee'),
    firstName: String(row.firstName || ''),
    lastName: String(row.lastName || ''),
  };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function emailTaken(schema: string, email: string, employeeId: string): Promise<boolean> {
  const takenMapping = await pool.query(
    `SELECT 1 FROM public.global_auth_mapping
     WHERE LOWER(email) = $1
       AND LOWER(email) <> (SELECT LOWER(email) FROM "${schema}".employees WHERE id = $2::uuid LIMIT 1)
     LIMIT 1`,
    [email, employeeId]
  );
  if (takenMapping.rows.length > 0) return true;
  const takenEmployee = await pool.query(
    `SELECT 1 FROM "${schema}".employees WHERE LOWER(email) = $1 AND id <> $2::uuid LIMIT 1`,
    [email, employeeId]
  );
  return takenEmployee.rows.length > 0;
}

async function loadEmployee(schema: string, whereSql: string, params: unknown[]) {
  const res = await pool.query(
    `SELECT id, email, cognito_sub, first_name, last_name, role, employee_code, account_status
     FROM "${schema}".employees
     WHERE ${whereSql}
     LIMIT 1`,
    params
  );
  return res.rows[0] || null;
}

async function findCaller(schema: string, sub: string, email: string) {
  const res = await pool.query(
    `SELECT id, email, cognito_sub, first_name, last_name, role, employee_code, account_status
     FROM "${schema}".employees
     WHERE ($1 <> '' AND cognito_sub = $1) OR ($2 <> '' AND LOWER(email) = $2)
     ORDER BY CASE WHEN cognito_sub = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [sub, email]
  );
  return res.rows[0] || null;
}

async function openChangeToken(email: string) {
  const res = await pool.query(
    `SELECT * FROM public.auth_tokens
     WHERE purpose = 'change_email' AND LOWER(email) = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [cleanEmailOf(email)]
  );
  return res.rows[0] || null;
}

async function retireOtherChangeTokens(employeeId: string): Promise<void> {
  await pool.query(
    `UPDATE public.auth_tokens
     SET consumed_at = CURRENT_TIMESTAMP
     WHERE purpose = 'change_email' AND employee_id = $1::uuid AND consumed_at IS NULL`,
    [employeeId]
  );
}

async function sendChangeCode(meta: ChangeMeta, newEmail: string, code: string): Promise<void> {
  const url = frontendUrl(`/change-email?email=${encodeURIComponent(newEmail)}`);
  await sendEmail({
    to: newEmail,
    ...changeLoginEmailCodeEmail({
      firstName: meta.firstName,
      code,
      newEmail,
      url,
      expiresInMinutes: OTP_TTL_MINUTES,
    }),
  });
}

async function notifyOldInbox(meta: ChangeMeta, newEmail: string): Promise<void> {
  if (!meta.oldEmail || meta.oldEmail === newEmail) return;
  try {
    await sendEmail({
      to: meta.oldEmail,
      ...changeLoginEmailNoticeEmail({ firstName: meta.firstName, newEmail }),
    });
  } catch (err) {
    log.warn(`Could not notify ${meta.oldEmail} about a login email change`, err);
  }
}

async function applyLoginEmailSwap(meta: ChangeMeta, newEmail: string, password: string, cognitoSub: string): Promise<void> {
  const schema = sanitizeSchemaName(meta.schemaName);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const employee = await client.query(
      `SELECT id, email FROM "${schema}".employees WHERE id = $1::uuid FOR UPDATE`,
      [meta.employeeId]
    );
    const current = cleanEmailOf(employee.rows[0]?.email);
    if (!employee.rows.length || current !== meta.oldEmail) {
      throw Object.assign(new Error('This code is no longer valid.'), { status: 409, code: 'CODE_STALE' });
    }
    const clash = await client.query(
      `SELECT 1 FROM "${schema}".employees WHERE LOWER(email) = $1 AND id <> $2::uuid LIMIT 1`,
      [newEmail, meta.employeeId]
    );
    if (clash.rows.length) {
      throw Object.assign(new Error('An account with this email already exists.'), { status: 409, code: 'EMAIL_TAKEN' });
    }

    await client.query(
      `UPDATE "${schema}".employees
       SET email = $1, cognito_sub = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3::uuid`,
      [newEmail, cognitoSub, meta.employeeId]
    );

    const mapping = await client.query(
      `UPDATE public.global_auth_mapping
       SET email = $1, cognito_sub = $2, password_hash = $3
       WHERE LOWER(email) = $4
       RETURNING id`,
      [newEmail, cognitoSub, hashPassword(password), meta.oldEmail]
    );
    if (!mapping.rows.length) {
      await client.query(
        `INSERT INTO public.global_auth_mapping (cognito_sub, email, password_hash, tenant_id, role, is_active)
         VALUES ($1, $2, $3, $4::uuid, $5, true)
         ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET
           email = EXCLUDED.email,
           password_hash = EXCLUDED.password_hash`,
        [cognitoSub, newEmail, hashPassword(password), meta.tenantId, meta.role || 'employee']
      );
    }

    await client.query(
      `UPDATE public.tenants SET admin_email = $1 WHERE id = $2::uuid AND LOWER(admin_email) = $3`,
      [newEmail, meta.tenantId, meta.oldEmail]
    );
    await client.query(
      `UPDATE public.support_threads
       SET requester_email = $1
       WHERE tenant_id = $2::uuid AND requester_employee_id = $3::uuid`,
      [newEmail, meta.tenantId, meta.employeeId]
    );
    await client.query(
      `UPDATE public.auth_tokens
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE consumed_at IS NULL
         AND purpose IN ('invite', 'password_reset')
         AND LOWER(email) = $1`,
      [meta.oldEmail]
    );
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function applyPendingInvite(input: {
  schema: string;
  employee: any;
  newEmail: string;
  tenantUuid: string;
  tenantSlug: string | null;
  invitedBy?: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE "${input.schema}".employees SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid`,
      [input.newEmail, input.employee.id]
    );
    await client.query(`DELETE FROM public.global_auth_mapping WHERE LOWER(email) = $1`, [
      cleanEmailOf(input.employee.email),
    ]);
    await client.query(
      `UPDATE public.tenants SET admin_email = $1 WHERE id = $2::uuid AND LOWER(admin_email) = $3`,
      [input.newEmail, input.tenantUuid, cleanEmailOf(input.employee.email)]
    );
    await client.query(
      `UPDATE public.support_threads SET requester_email = $1
       WHERE tenant_id = $2::uuid AND requester_employee_id = $3::uuid`,
      [input.newEmail, input.tenantUuid, input.employee.id]
    );
    await client.query(
      `UPDATE public.auth_tokens SET consumed_at = CURRENT_TIMESTAMP
       WHERE consumed_at IS NULL AND purpose IN ('invite', 'password_reset', 'change_email') AND LOWER(email) = $1`,
      [cleanEmailOf(input.employee.email)]
    );
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw err;
  } finally {
    client.release();
  }

  const oldEmail = cleanEmailOf(input.employee.email);
  if (oldEmail && !isPlaceholderCognitoSub(input.employee.cognito_sub)) {
    await cognitoAdminDeleteUserByEmail(oldEmail);
  }

  try {
    await provisionEmployeeAuth({
      employeeId: input.employee.id,
      email: input.newEmail,
      firstName: input.employee.first_name,
      lastName: input.employee.last_name,
      role: input.employee.role || 'employee',
      tenantId: input.tenantUuid,
      tenantSlug: input.tenantSlug || undefined,
      schemaName: input.schema,
      sendInvite: true,
      invitedBy: input.invitedBy,
      tenantQuery: (text, params) => pool.query(text.replace(/\bemployees\b/g, `"${input.schema}".employees`), params),
    });
  } catch (err) {
    log.error(`Login email saved for ${input.newEmail} but the invite could not be issued`, err);
    throw Object.assign(new Error('The login email was updated, but the invite email could not be sent. Resend the invite from the employee profile.'), {
      status: 502,
      code: 'INVITE_SEND_FAILED',
    });
  }
}

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ success: false, error: { code, message } });
}

function httpError(err: any, res: Response): boolean {
  if (err?.status && err?.code) {
    fail(res, err.status, err.code, err.message);
    return true;
  }
  return false;
}

export async function requestChangeEmail(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      fail(res, 401, 'UNAUTHORIZED', 'Sign in to change a login email.');
      return;
    }
    let schema = '';
    try {
      schema = sanitizeSchemaName(req.dbSchema || req.tenant?.schema || '');
    } catch {
      fail(res, 400, 'BAD_REQUEST', 'This account is not attached to a workspace.');
      return;
    }

    const newEmail = cleanEmailOf(req.body?.newEmail);
    const requestedId = String(req.body?.employeeId || '').trim();
    const currentPassword = String(req.body?.currentPassword || '');
    if (!EMAIL_RE.test(newEmail)) {
      fail(res, 400, 'BAD_REQUEST', 'Enter a valid email address.');
      return;
    }

    const caller = await findCaller(schema, String(req.user.sub || ''), cleanEmailOf(req.user.email));
    if (!caller) {
      fail(res, 403, 'FORBIDDEN', 'Your employee profile could not be found in this workspace.');
      return;
    }
    const target = requestedId
      ? await loadEmployee(schema, 'id = $1::uuid', [requestedId])
      : caller;
    if (!target) {
      fail(res, 404, 'NOT_FOUND', 'Employee not found.');
      return;
    }

    const isSelf = String(target.id) === String(caller.id);
    if (!isSelf && !isOrgWideRole(req.user.role)) {
      fail(res, 403, 'FORBIDDEN', 'Only HR or an administrator can change another person’s login email.');
      return;
    }

    const oldEmail = cleanEmailOf(target.email);
    if (!EMAIL_RE.test(oldEmail)) {
      fail(res, 400, 'BAD_REQUEST', 'This profile has no login email to change.');
      return;
    }
    if (oldEmail === newEmail) {
      fail(res, 400, 'BAD_REQUEST', 'That is already the login email.');
      return;
    }
    if (await emailTaken(schema, newEmail, String(target.id))) {
      fail(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      return;
    }

    const { tenantUuid, tenantSlug } = await resolveTenant({
      tenantId: req.tenant?.id,
      tenantSlug: req.tenant?.slug || req.tenantId,
      schemaName: schema,
    });
    if (!tenantUuid) {
      fail(res, 400, 'BAD_REQUEST', 'This workspace could not be resolved.');
      return;
    }
    const tenant = await pool.query('SELECT admin_email, name FROM public.tenants WHERE id = $1::uuid LIMIT 1', [tenantUuid]);
    const movesOrganizationEmail = cleanEmailOf(tenant.rows[0]?.admin_email) === oldEmail;
    const mode: ChangeMode = isSelf ? 'self' : 'admin';

    if (isPlaceholderCognitoSub(target.cognito_sub)) {
      await applyPendingInvite({
        schema,
        employee: target,
        newEmail,
        tenantUuid,
        tenantSlug,
        invitedBy: req.user.name,
      });
      res.json({
        success: true,
        message: `Invite sent to ${newEmail}.`,
        data: { status: 'invite_sent', email: newEmail, movesOrganizationEmail },
      });
      return;
    }

    if (isSelf) {
      if (!currentPassword) {
        fail(res, 400, 'BAD_REQUEST', 'Enter your current password.');
        return;
      }
      try {
        await cognitoLogin({ email: oldEmail, password: currentPassword });
      } catch (err: any) {
        const rejected = err?.name === 'NotAuthorizedException' || err?.name === 'UserNotFoundException';
        if (rejected || !isLocalAuthFallbackEnabled()) {
          fail(res, 401, 'INVALID_PASSWORD', 'Current password is incorrect.');
          return;
        }
      }
    }

    const meta: ChangeMeta = {
      oldEmail,
      employeeId: String(target.id),
      tenantId: tenantUuid,
      mode,
      schemaName: schema,
      role: String(target.role || 'employee'),
      firstName: String(target.first_name || ''),
      lastName: String(target.last_name || ''),
    };

    await assertResendCooldown('change_email', newEmail);
    await retireOtherChangeTokens(meta.employeeId);
    const { code, expiresAt } = await issueOtp(newEmail, meta, {
      purpose: 'change_email',
      tenantId: tenantUuid,
      employeeId: meta.employeeId,
    });
    try {
      await sendChangeCode(meta, newEmail, code);
    } catch (err) {
      log.error(`Could not send login email change code to ${newEmail}`, err);
      fail(res, 502, 'EMAIL_SEND_FAILED', 'We could not send the verification email. Please try again shortly.');
      return;
    }
    await notifyOldInbox(meta, newEmail);

    res.json({
      success: true,
      message: 'Verification code sent.',
      data: { status: 'code_sent', email: newEmail, expiresAt, movesOrganizationEmail, mode },
    });
  } catch (err: any) {
    if (sendTokenError(res, err)) return;
    if (httpError(err, res)) return;
    log.error('Failed to start login email change', err);
    fail(res, 500, 'SERVER_ERROR', 'Could not start the login email change.');
  }
}

export async function changeEmailStatus(req: Request, res: Response): Promise<void> {
  const email = cleanEmailOf(req.query.email);
  if (!EMAIL_RE.test(email)) {
    fail(res, 400, 'BAD_REQUEST', 'Enter the email address the code was sent to.');
    return;
  }
  const row = await openChangeToken(email);
  const meta = asMeta(row?.metadata);
  if (!row || !meta) {
    fail(res, 404, 'CODE_INVALID', 'There is no active code for this email. Request a new one from the profile.');
    return;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    fail(res, 410, 'TOKEN_EXPIRED', 'This code has expired. Request a new one.');
    return;
  }
  res.json({
    success: true,
    data: { email, mode: meta.mode, expiresAt: row.expires_at },
  });
}

export async function resendChangeEmail(req: Request, res: Response): Promise<void> {
  try {
    const email = cleanEmailOf(req.body?.email);
    if (!EMAIL_RE.test(email)) {
      fail(res, 400, 'BAD_REQUEST', 'Enter the email address the code was sent to.');
      return;
    }
    const row = await openChangeToken(email);
    const meta = asMeta(row?.metadata);
    if (!row || !meta) {
      fail(res, 404, 'CODE_INVALID', 'There is no active code for this email. Request a new one from the profile.');
      return;
    }
    await assertResendCooldown('change_email', email);
    const { code, expiresAt } = await issueOtp(email, meta, {
      purpose: 'change_email',
      tenantId: meta.tenantId,
      employeeId: meta.employeeId,
    });
    await sendChangeCode(meta, email, code);
    res.json({ success: true, message: 'Verification code sent.', data: { email, expiresAt, mode: meta.mode } });
  } catch (err: any) {
    if (sendTokenError(res, err)) return;
    log.error('Failed to resend login email change code', err);
    fail(res, 502, 'EMAIL_SEND_FAILED', 'We could not send the verification email. Please try again shortly.');
  }
}

export async function confirmChangeEmail(req: Request, res: Response): Promise<void> {
  const newEmail = cleanEmailOf(req.body?.email);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  const password = String(req.body?.password || '');
  if (!EMAIL_RE.test(newEmail) || code.length !== 6) {
    fail(res, 400, 'BAD_REQUEST', 'Email and the 6-digit code are required.');
    return;
  }

  const pending = await openChangeToken(newEmail);
  const meta = asMeta(pending?.metadata);
  if (!pending || !meta) {
    fail(res, 400, 'CODE_INVALID', 'No active code for this email. Request a new one.');
    return;
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    fail(res, 410, 'TOKEN_EXPIRED', 'This code has expired. Request a new one.');
    return;
  }

  if (meta.mode === 'self') {
    if (!password) {
      fail(res, 400, 'BAD_REQUEST', 'Enter your current password.');
      return;
    }
    try {
      await cognitoLogin({ email: meta.oldEmail, password });
    } catch (err: any) {
      const rejected = err?.name === 'NotAuthorizedException' || err?.name === 'UserNotFoundException';
      if (rejected || !isLocalAuthFallbackEnabled()) {
        fail(res, 401, 'INVALID_PASSWORD', 'Current password is incorrect.');
        return;
      }
    }
  } else {
    const check = validateCognitoPassword(password);
    if (!check.isValid) {
      fail(res, 400, 'INVALID_PASSWORD', check.message || 'Password does not meet the password policy.');
      return;
    }
  }

  let consumed;
  try {
    consumed = await verifyOtp(newEmail, code, 'change_email');
  } catch (err) {
    if (sendTokenError(res, err)) return;
    fail(res, 400, 'CODE_INVALID', 'That code is incorrect.');
    return;
  }
  const confirmed = asMeta(consumed.metadata) || meta;

    let createdSub = '';
  try {
    const tenant = await pool.query('SELECT slug FROM public.tenants WHERE id = $1::uuid LIMIT 1', [confirmed.tenantId]);
    const created = await cognitoAdminCreateUser({
      email: newEmail,
      password,
      name: [confirmed.firstName, confirmed.lastName].filter(Boolean).join(' ') || newEmail,
      role: confirmed.role,
      tenantSlug: tenant.rows[0]?.slug || undefined,
      suppressEmail: true,
    });
    createdSub = created.userSub;
    if (isPlaceholderCognitoSub(createdSub) && !isLocalAuthFallbackEnabled()) {
      throw new Error('Cognito did not return a user id for the new email.');
    }
    await applyLoginEmailSwap(confirmed, newEmail, password, createdSub);
  } catch (err: any) {
    if (createdSub) {
      await cognitoAdminDeleteUserByEmail(newEmail);
    }
    if (err?.name === 'UsernameExistsException') {
      fail(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      return;
    }
    if (httpError(err, res)) return;
    log.error(`Login email change failed for ${newEmail}`, err);
    fail(res, 500, 'SERVER_ERROR', 'The code was accepted, but the login email could not be changed. Request a new code.');
    return;
  }

  await cognitoAdminDeleteUserByEmail(confirmed.oldEmail);
  await invalidateOpenTokens('change_email', newEmail);
  res.json({ success: true, message: 'Login email updated.', data: { email: newEmail } });
}
