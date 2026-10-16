import { Request, Response } from 'express';
import { log } from '../../utils/logger.js';
import { AuthTokenError, assertResendCooldown } from '../auth/authTokens.js';
import { sendEmployeeInvite } from './employeeInvites.js';
import { isPlaceholderCognitoSub, provisionEmployeeAuth, resolveTenant } from './provisionEmployeeAuth.js';

const ACTIVE_STATUSES = new Set(['active', 'activated']);
const BLOCKED_STATUSES = new Set(['deactivated', 'terminated', 'suspended']);

/** POST /identity/employees/:id/resend-invite — replaces any open invite with a fresh link. */
export async function resendInvite(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const empRes = await req.tenantQuery!(
      `SELECT id, email, first_name, last_name, role, cognito_sub, account_status
       FROM employees WHERE id::text = $1 OR employee_code = $1 LIMIT 1`,
      [id]
    );
    const emp = empRes.rows[0];
    if (!emp) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found.' } });
      return;
    }

    const email = String(emp.email || '').trim().toLowerCase();
    if (!email) {
      res.status(400).json({ success: false, error: { code: 'NO_EMAIL', message: 'This employee has no email address.' } });
      return;
    }

    const status = String(emp.account_status || '').trim().toLowerCase();
    if (ACTIVE_STATUSES.has(status)) {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_ACTIVE', message: 'This employee has already activated their account.' },
      });
      return;
    }
    if (BLOCKED_STATUSES.has(status)) {
      res.status(409).json({
        success: false,
        error: { code: 'ACCOUNT_BLOCKED', message: `This account is ${status}. Reactivate it before sending an invite.` },
      });
      return;
    }

    await assertResendCooldown('invite', email);

    const tenantCtx = {
      tenantId: req.tenant?.id,
      tenantSlug: req.tenant?.slug,
      schemaName: req.dbSchema || req.tenant?.schema,
    };

    if (!emp.cognito_sub || isPlaceholderCognitoSub(emp.cognito_sub)) {
      const auth = await provisionEmployeeAuth({
        employeeId: emp.id,
        email,
        firstName: emp.first_name,
        lastName: emp.last_name,
        role: emp.role || 'employee',
        ...tenantCtx,
        sendInvite: true,
        invitedBy: req.user?.name,
        tenantQuery: req.tenantQuery!,
      });
      if (!auth.inviteSent) throw new Error('Invite email could not be sent');
    } else {
      const { tenantUuid } = await resolveTenant(tenantCtx);
      if (!tenantUuid) throw new Error('Could not resolve the workspace for this employee');
      await sendEmployeeInvite({
        email,
        firstName: emp.first_name,
        role: emp.role || 'employee',
        tenantId: tenantUuid,
        employeeId: emp.id,
        invitedBy: req.user?.name,
      });
      await req.tenantQuery!(
        `UPDATE employees SET account_status = 'Invited', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [emp.id]
      );
    }

    res.json({ success: true, message: `Invite sent to ${email}.`, data: { email, accountStatus: 'Invited' } });
  } catch (err: any) {
    if (err instanceof AuthTokenError && err.code === 'RESEND_COOLDOWN') {
      res.setHeader('Retry-After', String(err.retryAfterSeconds || 60));
      res.status(429).json({ success: false, error: { code: err.code, message: err.message, details: { retryAfterSeconds: err.retryAfterSeconds } } });
      return;
    }
    log.error('Resend invite failed', err);
    res.status(502).json({
      success: false,
      error: { code: 'INVITE_FAILED', message: err.message || 'Could not send the invite email.' },
    });
  }
}
