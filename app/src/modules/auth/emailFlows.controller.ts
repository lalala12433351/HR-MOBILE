import { Request, Response } from 'express';
import { pool } from '../../config/database.js';
import { cognitoAdminConfirmUser, cognitoAdminSetUserPassword } from '../../config/cognito.js';
import { frontendUrl, sendEmail } from '../../config/ses.js';
import {
  passwordChangedEmail,
  passwordResetEmail,
  verifyEmailCodeEmail,
} from '../../emails/templates.js';
import { hashPassword, signJwt, verifyJwt } from '../../utils/crypto.js';
import { log } from '../../utils/logger.js';
import {
  AuthTokenError,
  OTP_TTL_MINUTES,
  PASSWORD_RESET_TTL_HOURS,
  assertResendCooldown,
  consumeLinkToken,
  findLinkToken,
  issueLinkToken,
  issueOtp,
  verifyOtp,
} from './authTokens.js';
import { validateCognitoPassword } from './auth.controller.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TOKEN_TTL_SECONDS = 30 * 60;

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

function rejectWeakPassword(res: Response, password: string): boolean {
  const check = validateCognitoPassword(password);
  if (check.isValid) return false;
  res.status(400).json({
    success: false,
    error: { code: 'INVALID_PASSWORD', message: check.message || 'Password does not meet the password policy.' },
  });
  return true;
}

const EMAIL_TAKEN_ERROR = {
  code: 'USER_ALREADY_EXISTS',
  message: 'An account with this email already exists. Please sign in instead.',
} as const;

/** Verification JWT proving the caller owns `email`; required by POST /auth/register. */
export function verifyEmailVerificationToken(token: unknown, email: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const payload = verifyJwt<{ purpose?: string; email?: string }>(token);
  return payload?.purpose === 'email_verified' && cleanEmailOf(payload.email) === cleanEmailOf(email);
}

export async function isEmailRegistered(
  email: string,
  queryable: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> } = pool
): Promise<boolean> {
  const existing = await queryable.query(
    `SELECT 1 FROM public.global_auth_mapping WHERE LOWER(email) = $1 LIMIT 1`,
    [cleanEmailOf(email)]
  );
  return existing.rows.length > 0;
}

async function loadEmployeeContext(tenantId: string | null, email: string) {
  if (!tenantId) return { tenantName: undefined, schemaName: undefined, firstName: undefined };
  const t = await pool.query('SELECT name, schema_name FROM public.tenants WHERE id = $1 LIMIT 1', [tenantId]);
  const tenantName = t.rows[0]?.name as string | undefined;
  const schemaName = t.rows[0]?.schema_name as string | undefined;
  let firstName: string | undefined;
  if (schemaName) {
    try {
      const e = await pool.query(
        `SELECT first_name FROM "${schemaName}".employees WHERE LOWER(email) = $1 LIMIT 1`,
        [email]
      );
      firstName = e.rows[0]?.first_name || undefined;
    } catch (_) {}
  }
  return { tenantName, schemaName, firstName };
}

/** Sets the password everywhere login reads it: Cognito, global_auth_mapping, and activates the employee row. */
async function applyNewPassword(params: {
  email: string;
  password: string;
  tenantId: string | null;
  schemaName?: string;
  activate: boolean;
}): Promise<void> {
  const { email, password, tenantId, schemaName, activate } = params;

  const mapping = await pool.query(
    `SELECT role FROM public.global_auth_mapping WHERE LOWER(email) = $1 ORDER BY is_active DESC LIMIT 1`,
    [email]
  );
  const isPlatformAdmin = mapping.rows[0]?.role === 'platform_admin';

  if (!isPlatformAdmin) {
    await cognitoAdminSetUserPassword({ username: email, password, permanent: true });
    await cognitoAdminConfirmUser(email).catch(() => false);
  }

  await pool.query(
    `UPDATE public.global_auth_mapping
     SET password_hash = $1, is_active = CASE WHEN $3::uuid IS NULL OR tenant_id = $3::uuid THEN true ELSE is_active END
     WHERE LOWER(email) = $2`,
    [hashPassword(password), email, tenantId]
  );

  if (activate && schemaName) {
    await pool
      .query(
        `UPDATE "${schemaName}".employees
         SET account_status = 'Active', updated_at = CURRENT_TIMESTAMP
         WHERE LOWER(email) = $1
           AND COALESCE(NULLIF(account_status, ''), 'Not Activated') IN ('Not Activated', 'Invited', 'Auth Error')`,
        [email]
      )
      .catch((err) => log.warn(`Could not activate employee ${email} in ${schemaName}`, err));
  }
}

// ---------------------------------------------------------------------------
// Signup email verification
// ---------------------------------------------------------------------------

export async function sendVerificationCode(req: Request, res: Response): Promise<void> {
  const email = cleanEmailOf(req.body?.email);
  const name = String(req.body?.name || '').trim();
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'A valid email address is required.' } });
    return;
  }

  try {
    if (await isEmailRegistered(email)) {
      res.status(409).json({ success: false, error: { ...EMAIL_TAKEN_ERROR } });
      return;
    }

    await assertResendCooldown('verify_email', email);
    const { code, expiresAt } = await issueOtp(email, { name });
    await sendEmail({ to: email, ...verifyEmailCodeEmail({ name, code, expiresInMinutes: OTP_TTL_MINUTES }) });

    res.json({ success: true, message: 'Verification code sent.', data: { expiresAt } });
  } catch (err: any) {
    if (sendTokenError(res, err)) return;
    log.error('Failed to send verification code', err);
    res.status(502).json({
      success: false,
      error: { code: 'EMAIL_SEND_FAILED', message: 'We could not send the verification email. Please try again shortly.' },
    });
  }
}

export async function verifyEmailCode(req: Request, res: Response): Promise<void> {
  const email = cleanEmailOf(req.body?.email);
  const code = String(req.body?.code || '').replace(/\D/g, '');
  if (!EMAIL_RE.test(email) || code.length !== 6) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Email and the 6-digit code are required.' } });
    return;
  }

  try {
    if (await isEmailRegistered(email)) {
      res.status(409).json({ success: false, error: { ...EMAIL_TAKEN_ERROR } });
      return;
    }
    await verifyOtp(email, code);
    const verificationToken = signJwt({ purpose: 'email_verified', email }, VERIFICATION_TOKEN_TTL_SECONDS);
    res.json({ success: true, message: 'Email verified.', data: { verificationToken, email } });
  } catch (err: any) {
    if (sendTokenError(res, err)) return;
    log.error('Email verification failed', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not verify the code.' } });
  }
}

// ---------------------------------------------------------------------------
// Employee invite
// ---------------------------------------------------------------------------

export async function getInvite(req: Request, res: Response): Promise<void> {
  try {
    const row = await findLinkToken('invite', String(req.params.token || ''));
    const ctx = await loadEmployeeContext(row.tenant_id, row.email);
    res.json({
      success: true,
      data: {
        email: row.email,
        firstName: ctx.firstName || row.metadata?.firstName || '',
        tenantName: ctx.tenantName || 'your workspace',
        role: row.metadata?.role || 'employee',
        invitedBy: row.metadata?.invitedBy || '',
        expiresAt: row.expires_at,
      },
    });
  } catch (err: any) {
    if (sendTokenError(res, err)) return;
    log.error('Invite lookup failed', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Could not load this invitation.' } });
  }
}

export async function acceptInvite(req: Request, res: Response): Promise<void> {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || '').trim();

  try {
    const row = await findLinkToken('invite', token);
    if (rejectWeakPassword(res, password)) return;

    const ctx = await loadEmployeeContext(row.tenant_id, row.email);
    await applyNewPassword({
      email: row.email,
      password,
      tenantId: row.tenant_id,
      schemaName: ctx.schemaName,
      activate: true,
    });
    await consumeLinkToken('invite', token);

    sendEmail({
      to: row.email,
      ...passwordChangedEmail({
        firstName: ctx.firstName,
        workspaceName: ctx.tenantName,
        reason: 'activated',
        loginUrl: frontendUrl('/login'),
      }),
    }).catch(() => {});

    log.success(`Invite accepted by ${row.email}`);
    res.json({ success: true, message: 'Your account is ready.', data: { email: row.email } });
  } catch (err: any) {
    if (sendTokenError(res, err)) return;
    log.error('Accept invite failed', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message || 'Could not activate your account.' } });
  }
}

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  const email = cleanEmailOf(req.body?.email);
  const genericResponse = {
    success: true,
    message: 'If an account exists for this email, a password reset link is on its way.',
  };
  if (!EMAIL_RE.test(email)) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'A valid email address is required.' } });
    return;
  }

  try {
    const mapping = await pool.query(
      `SELECT tenant_id FROM public.global_auth_mapping
       WHERE LOWER(email) = $1 AND is_active = true AND role <> 'student'
       ORDER BY created_at DESC
       LIMIT 1`,
      [email]
    );
    const account = mapping.rows[0];
    if (!account) {
      log.info(`Password reset requested for unknown email ${email}`);
      res.json(genericResponse);
      return;
    }

    await assertResendCooldown('password_reset', email);
    const ctx = await loadEmployeeContext(account.tenant_id, email);
    const { token } = await issueLinkToken({
      purpose: 'password_reset',
      email,
      ttlHours: PASSWORD_RESET_TTL_HOURS,
      tenantId: account.tenant_id,
    });
    await sendEmail({
      to: email,
      ...passwordResetEmail({
        firstName: ctx.firstName,
        workspaceName: ctx.tenantName,
        url: frontendUrl(`/reset-password?token=${encodeURIComponent(token)}`),
        expiresInHours: PASSWORD_RESET_TTL_HOURS,
      }),
    });
    res.json(genericResponse);
  } catch (err: any) {
    if (err instanceof AuthTokenError && err.code === 'RESEND_COOLDOWN') {
      sendTokenError(res, err);
      return;
    }
    log.error('Forgot password failed', err);
    res.status(502).json({
      success: false,
      error: { code: 'EMAIL_SEND_FAILED', message: 'We could not send the reset email. Please try again shortly.' },
    });
  }
}

export async function resetPasswordWithToken(req: Request, res: Response): Promise<void> {
  const token = String(req.body?.token || '');
  const password = String(req.body?.password || req.body?.newPassword || '').trim();

  try {
    const row = await findLinkToken('password_reset', token);
    if (rejectWeakPassword(res, password)) return;

    const ctx = await loadEmployeeContext(row.tenant_id, row.email);
    await applyNewPassword({
      email: row.email,
      password,
      tenantId: row.tenant_id,
      schemaName: ctx.schemaName,
      activate: true,
    });
    await consumeLinkToken('password_reset', token);

    sendEmail({
      to: row.email,
      ...passwordChangedEmail({
        firstName: ctx.firstName,
        workspaceName: ctx.tenantName,
        reason: 'reset',
        loginUrl: frontendUrl('/login'),
      }),
    }).catch(() => {});

    log.success(`Password reset completed for ${row.email}`);
    res.json({ success: true, message: 'Password updated. You can now sign in.', data: { email: row.email } });
  } catch (err: any) {
    if (sendTokenError(res, err)) return;
    log.error('Password reset failed', err);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err.message || 'Could not reset your password.' } });
  }
}
