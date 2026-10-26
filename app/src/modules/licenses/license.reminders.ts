import { pool } from '../../config/database.js';
import { frontendUrl, sendEmail } from '../../config/ses.js';
import { withTenantContext } from '../../db/queryRunner.js';
import { licenseExpiryEmail } from '../../emails/templates.js';
import { log } from '../../utils/logger.js';
import { sendPushToEmployees } from '../push/push.service.js';

const SCAN_MS = 6 * 60 * 60 * 1000;
const SETTINGS_PATH = '/settings?section=license';

export type ReminderBucket = '14' | '7' | '1' | 'expired';

export function reminderBucket(daysRemaining: number): ReminderBucket | null {
  if (daysRemaining <= 0) return 'expired';
  if (daysRemaining <= 1) return '1';
  if (daysRemaining <= 7) return '7';
  if (daysRemaining <= 14) return '14';
  return null;
}

function daysUntil(periodEnd: Date | string | null | undefined, now = new Date()): number {
  if (!periodEnd) return 0;
  const end = periodEnd instanceof Date ? periodEnd : new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return 0;
  return Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export async function maybeNotifyExpiry(input: {
  tenantId: string;
  schemaName?: string | null;
  tenantName: string;
  subscriptionId?: string | null;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  planName: string;
  planKey?: string;
  maxSeats?: number;
  seatsUsed?: number;
}): Promise<void> {
  const days = daysUntil(input.periodEnd);
  const bucket = reminderBucket(days);
  if (!bucket) return;
  const schema = String(input.schemaName || '').trim();
  if (!schema || schema === 'public') return;

  const already = await pool.query(
    `SELECT 1 FROM public.license_events
      WHERE tenant_id = $1
        AND action = 'expiry_reminded'
        AND details->>'bucket' = $2
        AND period_end IS NOT DISTINCT FROM $3
      LIMIT 1`,
    [input.tenantId, bucket, input.periodEnd || null]
  );
  if (already.rows.length > 0) return;

  const expired = bucket === 'expired';
  const title = expired ? 'License expired' : 'License ending soon';
  const message = expired
    ? `${input.planName} has expired. New people cannot be added until the license is extended.`
    : `${input.planName} expires in ${days} day${days === 1 ? '' : 's'}.`;
  const settingsUrl = frontendUrl(SETTINGS_PATH);

  await withTenantContext(schema, async (_client, query) => {
    const admins = await query(
      `SELECT id, email, first_name
         FROM employees
        WHERE role = 'super_admin'
          AND COALESCE(employment_status, 'active') NOT IN ('terminated', 'exited')`
    );
    const notified: string[] = [];
    for (const admin of admins.rows) {
      try {
        await query(
          `INSERT INTO notifications (recipient_employee_id, title, message, category, priority, link_url, is_read)
           VALUES ($1, $2, $3, 'System', $4, $5, false)`,
          [admin.id, title, message, expired ? 'high' : 'medium', SETTINGS_PATH]
        );
        notified.push(String(admin.id));
      } catch (err) {
        log.warn('Could not write license expiry notification', err);
      }
      const email = String(admin.email || '').trim();
      if (!email) continue;
      try {
        const rendered = licenseExpiryEmail({
          firstName: admin.first_name,
          workspaceName: input.tenantName,
          planName: input.planName,
          daysRemaining: days,
          expired,
          seatsUsed: input.seatsUsed,
          maxSeats: input.maxSeats,
          settingsUrl,
        });
        await sendEmail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text });
      } catch (err) {
        log.warn(`Could not email license expiry notice to ${email}`, err);
      }
    }
    await sendPushToEmployees(query, notified, {
      title,
      body: message.slice(0, 180),
      url: SETTINGS_PATH,
      tag: `license-${input.tenantId}-${bucket}`,
    });
  });

  await pool.query(
    `INSERT INTO public.license_events
       (tenant_id, subscription_id, actor_email, action, from_plan, to_plan, from_status, to_status, period_start, period_end, details)
     VALUES ($1, $2, $3, 'expiry_reminded', $4, $4, $5, $5, $6, $7, $8::jsonb)`,
    [
      input.tenantId,
      input.subscriptionId || null,
      'system',
      input.planKey || null,
      expired ? 'expired' : 'expiring',
      input.periodStart || null,
      input.periodEnd || null,
      JSON.stringify({ bucket, daysRemaining: days }),
    ]
  );
}

export async function scanLicenseExpiryReminders(): Promise<void> {
  const result = await pool.query(
    `SELECT s.id AS subscription_id, s.tenant_id, s.current_period_start, s.current_period_end, s.max_employees,
            t.schema_name, t.name AS tenant_name,
            COALESCE(p.name, s.tier, t.plan) AS plan_name,
            COALESCE(p.key, s.tier, t.plan) AS plan_key
       FROM public.tenant_subscriptions s
       JOIN public.tenants t ON t.id = s.tenant_id
       LEFT JOIN public.license_plans p ON p.id = s.plan_id
      WHERE t.slug <> 'platform'
        AND s.status IS DISTINCT FROM 'canceled'
        AND s.current_period_end IS NOT NULL
        AND s.current_period_end <= CURRENT_TIMESTAMP + INTERVAL '14 days'`
  );

  for (const row of result.rows) {
    try {
      await maybeNotifyExpiry({
        tenantId: row.tenant_id,
        schemaName: row.schema_name,
        tenantName: row.tenant_name,
        subscriptionId: row.subscription_id,
        periodStart: row.current_period_start,
        periodEnd: row.current_period_end,
        planName: row.plan_name || 'Pixbe',
        planKey: row.plan_key,
        maxSeats: Number(row.max_employees) || undefined,
      });
    } catch (err) {
      log.warn(`License expiry reminder failed for tenant ${row.tenant_id}`, err);
    }
  }
}

let reminderTimer: NodeJS.Timeout | null = null;

export function startLicenseReminderJob(): void {
  const run = () => {
    void scanLicenseExpiryReminders().catch((err) => log.warn('License expiry scan failed', err));
  };
  run();
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(run, SCAN_MS);
  reminderTimer.unref?.();
}

export function stopLicenseReminderJob(): void {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}
