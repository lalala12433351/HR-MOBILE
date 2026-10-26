import webpush from 'web-push';
import { env } from '../../config/env.js';
import { log } from '../../utils/logger.js';

type Query = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

let configured = false;

export function pushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

function ensureWebPush(): boolean {
  if (!pushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export function vapidPublicKey(): string | null {
  return pushConfigured() ? env.VAPID_PUBLIC_KEY : null;
}

export async function saveSubscription(
  q: Query,
  employeeId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null
) {
  await q(
    `INSERT INTO push_subscriptions (employee_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET employee_id = EXCLUDED.employee_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent`,
    [employeeId, input.endpoint, input.keys.p256dh, input.keys.auth, userAgent]
  );
}

export async function deleteSubscription(q: Query, employeeId: string, endpoint: string) {
  await q(`DELETE FROM push_subscriptions WHERE employee_id = $1 AND endpoint = $2`, [employeeId, endpoint]);
}

async function ensurePushTables(q: Query): Promise<void> {
  await q(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_push_subscription_endpoint UNIQUE (endpoint)
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_employee ON push_subscriptions(employee_id)`);
}

/** Best-effort desktop delivery. Stale subscriptions (404/410) are removed. Never throws. */
export async function sendPushToEmployees(q: Query, employeeIds: string[], payload: PushPayload): Promise<void> {
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (ids.length === 0 || !ensureWebPush()) return;

  try {
    await ensurePushTables(q);
    const res = await q(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE employee_id = ANY($1::uuid[])`,
      [ids]
    );
    const stale: string[] = [];
    await Promise.all(
      res.rows.map(async (row) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: row.endpoint,
              keys: { p256dh: row.p256dh, auth: row.auth },
            },
            JSON.stringify(payload),
            { TTL: 60 * 60 * 24 }
          );
        } catch (err: any) {
          const status = Number(err?.statusCode);
          if (status === 404 || status === 410) stale.push(String(row.id));
          else log.error('Web push delivery failed', err);
        }
      })
    );
    if (stale.length > 0) {
      await q(`DELETE FROM push_subscriptions WHERE id = ANY($1::uuid[])`, [stale]);
    }
  } catch (err) {
    log.error('Web push lookup failed', err);
  }
}
