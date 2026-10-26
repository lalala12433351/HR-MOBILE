import crypto from 'node:crypto';
import { pool } from '../../config/database.js';

export type AuthTokenPurpose = 'invite' | 'verify_email' | 'password_reset' | 'change_email';

export const INVITE_TTL_HOURS = 72;
export const PASSWORD_RESET_TTL_HOURS = 1;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SECONDS = 60;

export interface AuthTokenRow {
  id: string;
  purpose: AuthTokenPurpose;
  email: string;
  tenant_id: string | null;
  employee_id: string | null;
  metadata: Record<string, any>;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
}

export class AuthTokenError extends Error {
  constructor(
    public code: 'TOKEN_INVALID' | 'TOKEN_EXPIRED' | 'TOKEN_USED' | 'CODE_INVALID' | 'TOO_MANY_ATTEMPTS' | 'RESEND_COOLDOWN',
    message: string,
    public retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'AuthTokenError';
  }
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function otpHash(purpose: 'verify_email' | 'change_email', email: string, code: string): string {
  return sha256(`${purpose}:${normalizeEmail(email)}:${code}`);
}

/** Throws RESEND_COOLDOWN if a token of this purpose was issued to this email too recently. */
export async function assertResendCooldown(purpose: AuthTokenPurpose, email: string): Promise<void> {
  const res = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))::int AS age
     FROM public.auth_tokens
     WHERE purpose = $1 AND LOWER(email) = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [purpose, normalizeEmail(email)]
  );
  const age = res.rows[0]?.age as number | undefined;
  if (age !== undefined && age < RESEND_COOLDOWN_SECONDS) {
    const wait = RESEND_COOLDOWN_SECONDS - age;
    throw new AuthTokenError('RESEND_COOLDOWN', `Please wait ${wait}s before requesting another email.`, wait);
  }
}

/** Marks every unused token of this purpose for the email as consumed. */
export async function invalidateOpenTokens(purpose: AuthTokenPurpose, email: string): Promise<void> {
  await pool.query(
    `UPDATE public.auth_tokens
     SET consumed_at = CURRENT_TIMESTAMP
     WHERE purpose = $1 AND LOWER(email) = $2 AND consumed_at IS NULL`,
    [purpose, normalizeEmail(email)]
  );
}

/** Issues a single-use link token (invite / password reset). Returns the raw token for the URL. */
export async function issueLinkToken(params: {
  purpose: Exclude<AuthTokenPurpose, 'verify_email' | 'change_email'>;
  email: string;
  ttlHours: number;
  tenantId?: string | null;
  employeeId?: string | null;
  metadata?: Record<string, any>;
}): Promise<{ token: string; expiresAt: Date }> {
  await invalidateOpenTokens(params.purpose, params.email);
  const token = crypto.randomBytes(32).toString('base64url');
  const res = await pool.query(
    `INSERT INTO public.auth_tokens (purpose, token_hash, email, tenant_id, employee_id, metadata, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + ($7 || ' hours')::interval)
     RETURNING expires_at`,
    [
      params.purpose,
      sha256(token),
      normalizeEmail(params.email),
      params.tenantId || null,
      params.employeeId || null,
      JSON.stringify(params.metadata || {}),
      String(params.ttlHours),
    ]
  );
  return { token, expiresAt: res.rows[0].expires_at };
}

/** Looks up a link token without consuming it. Throws if invalid, used or expired. */
export async function findLinkToken(purpose: AuthTokenPurpose, token: string): Promise<AuthTokenRow> {
  if (!token || token.length < 20) {
    throw new AuthTokenError('TOKEN_INVALID', 'This link is invalid.');
  }
  const res = await pool.query(
    `SELECT * FROM public.auth_tokens WHERE purpose = $1 AND token_hash = $2 LIMIT 1`,
    [purpose, sha256(token)]
  );
  const row = res.rows[0] as AuthTokenRow | undefined;
  if (!row) throw new AuthTokenError('TOKEN_INVALID', 'This link is invalid.');
  if (row.consumed_at) throw new AuthTokenError('TOKEN_USED', 'This link has already been used or replaced by a newer one.');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AuthTokenError('TOKEN_EXPIRED', 'This link has expired.');
  }
  return row;
}

/** Atomically consumes a link token. Returns the row; throws if it was already consumed concurrently. */
export async function consumeLinkToken(purpose: AuthTokenPurpose, token: string): Promise<AuthTokenRow> {
  const row = await findLinkToken(purpose, token);
  const res = await pool.query(
    `UPDATE public.auth_tokens SET consumed_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND consumed_at IS NULL
     RETURNING *`,
    [row.id]
  );
  if (!res.rows[0]) throw new AuthTokenError('TOKEN_USED', 'This link has already been used.');
  return res.rows[0] as AuthTokenRow;
}

/** Issues a 6-digit email verification code. Returns the raw code. */
export async function issueOtp(
  email: string,
  metadata?: Record<string, any>,
  options?: {
    purpose?: 'verify_email' | 'change_email';
    tenantId?: string | null;
    employeeId?: string | null;
  }
): Promise<{ code: string; expiresAt: Date }> {
  const purpose = options?.purpose || 'verify_email';
  await invalidateOpenTokens(purpose, email);
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
  const res = await pool.query(
    `INSERT INTO public.auth_tokens (purpose, token_hash, email, tenant_id, employee_id, metadata, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP + ($7 || ' minutes')::interval)
     RETURNING expires_at`,
    [
      purpose,
      otpHash(purpose, email, code),
      normalizeEmail(email),
      options?.tenantId || null,
      options?.employeeId || null,
      JSON.stringify(metadata || {}),
      String(OTP_TTL_MINUTES),
    ]
  );
  return { code, expiresAt: res.rows[0].expires_at };
}

/** Verifies and consumes the latest open code for this email, counting failed attempts. */
export async function verifyOtp(
  email: string,
  code: string,
  purpose: 'verify_email' | 'change_email' = 'verify_email'
): Promise<AuthTokenRow> {
  const cleanEmail = normalizeEmail(email);
  const res = await pool.query(
    `SELECT *, (token_hash = $2) AS matches
     FROM public.auth_tokens
     WHERE purpose = $3 AND LOWER(email) = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [cleanEmail, otpHash(purpose, cleanEmail, String(code || '').trim()), purpose]
  );
  const row = res.rows[0] as (AuthTokenRow & { matches: boolean }) | undefined;
  if (!row) throw new AuthTokenError('CODE_INVALID', 'No active code for this email. Request a new one.');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new AuthTokenError('TOKEN_EXPIRED', 'This code has expired. Request a new one.');
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AuthTokenError('TOO_MANY_ATTEMPTS', 'Too many incorrect attempts. Request a new code.');
  }
  if (!row.matches) {
    const upd = await pool.query(
      `UPDATE public.auth_tokens SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
      [row.id]
    );
    const left = OTP_MAX_ATTEMPTS - Number(upd.rows[0]?.attempts || 0);
    throw new AuthTokenError(
      left > 0 ? 'CODE_INVALID' : 'TOO_MANY_ATTEMPTS',
      left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Request a new code.'
    );
  }
  await pool.query(`UPDATE public.auth_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = $1`, [row.id]);
  return row;
}
