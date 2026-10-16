import { pool } from '../../config/database.js';
import { frontendUrl, sendEmail } from '../../config/ses.js';
import { inviteEmployeeEmail } from '../../emails/templates.js';
import { INVITE_TTL_HOURS, issueLinkToken } from '../auth/authTokens.js';
import { log } from '../../utils/logger.js';

export interface SendInviteInput {
  email: string;
  firstName?: string;
  role?: string;
  tenantId: string;
  employeeId?: string | null;
  invitedBy?: string;
}

/** Issues a fresh invite token (replacing older ones) and emails the setup link. */
export async function sendEmployeeInvite(input: SendInviteInput): Promise<{ expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  const tenantRes = await pool.query('SELECT name FROM public.tenants WHERE id = $1 LIMIT 1', [input.tenantId]);
  const workspaceName = (tenantRes.rows[0]?.name as string | undefined) || 'your workspace';

  const { token, expiresAt } = await issueLinkToken({
    purpose: 'invite',
    email,
    ttlHours: INVITE_TTL_HOURS,
    tenantId: input.tenantId,
    employeeId: input.employeeId || null,
    metadata: { firstName: input.firstName || '', role: input.role || 'employee', invitedBy: input.invitedBy || '' },
  });

  const url = frontendUrl(`/accept-invite?token=${encodeURIComponent(token)}`);
  await sendEmail({
    to: email,
    ...inviteEmployeeEmail({
      firstName: input.firstName,
      email,
      workspaceName,
      role: input.role,
      invitedBy: input.invitedBy,
      url,
      expiresInHours: INVITE_TTL_HOURS,
    }),
  });
  log.info(`Invite issued for ${email} (workspace "${workspaceName}")`);
  return { expiresAt };
}
