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

let webConfigured = false;
let messaging: import('firebase-admin/messaging').Messaging | null | undefined;

export function pushConfigured(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export function nativePushConfigured(): boolean {
  return Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY);
}

function ensureWebPush(): boolean {
  if (!pushConfigured()) return false;
  if (!webConfigured) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    webConfigured = true;
  }
  return true;
}

export function vapidPublicKey(): string | null {
  return pushConfigured() ? env.VAPID_PUBLIC_KEY : null;
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
  await q(`
    CREATE TABLE IF NOT EXISTS push_device_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      platform VARCHAR(16) NOT NULL DEFAULT 'android',
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_push_device_token UNIQUE (token)
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_push_device_tokens_employee ON push_device_tokens(employee_id)`);
}

export async function saveSubscription(
  q: Query,
  employeeId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null
) {
  await ensurePushTables(q);
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
  await ensurePushTables(q);
  await q(`DELETE FROM push_subscriptions WHERE employee_id = $1 AND endpoint = $2`, [employeeId, endpoint]);
}

export async function saveDeviceToken(
  q: Query,
  employeeId: string,
  input: { token: string; platform: 'android' | 'ios' },
  userAgent: string | null
) {
  await ensurePushTables(q);
  await q(
    `INSERT INTO push_device_tokens (employee_id, token, platform, user_agent, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (token) DO UPDATE
       SET employee_id = EXCLUDED.employee_id,
           platform = EXCLUDED.platform,
           user_agent = EXCLUDED.user_agent,
           updated_at = NOW()`,
    [employeeId, input.token, input.platform, userAgent]
  );
}

export async function deleteDeviceToken(q: Query, employeeId: string, token: string) {
  await ensurePushTables(q);
  await q(`DELETE FROM push_device_tokens WHERE employee_id = $1 AND token = $2`, [employeeId, token]);
}

async function getMessaging(): Promise<import('firebase-admin/messaging').Messaging | null> {
  if (messaging !== undefined) return messaging;
  if (!nativePushConfigured()) {
    messaging = null;
    return null;
  }
  try {
    const mod = await import('firebase-admin');
    const admin = (mod as any).default ?? mod;
    if (!admin.apps?.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.FCM_PROJECT_ID,
          clientEmail: env.FCM_CLIENT_EMAIL,
          privateKey: env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }
    const next = admin.messaging() as import('firebase-admin/messaging').Messaging;
    messaging = next;
    return next;
  } catch (err) {
    log.error('FCM init failed', err);
    messaging = null;
    return null;
  }
}

async function sendWebPush(q: Query, ids: string[], payload: PushPayload): Promise<void> {
  if (!ensureWebPush()) return;
  try {
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

async function sendNativePush(q: Query, ids: string[], payload: PushPayload): Promise<void> {
  const fcm = await getMessaging();
  if (!fcm) return;
  try {
    const res = await q(
      `SELECT id, token, platform FROM push_device_tokens WHERE employee_id = ANY($1::uuid[])`,
      [ids]
    );
    if (!res.rows.length) return;
    const stale: string[] = [];
    await Promise.all(
      res.rows.map(async (row) => {
        try {
          await fcm.send({
            token: String(row.token),
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              title: payload.title,
              body: payload.body,
              url: payload.url || '/notifications',
              tag: payload.tag || 'pixbe-notice',
            },
            android: {
              priority: 'high',
              notification: {
                channelId: 'pixbe_alerts',
                tag: payload.tag || 'pixbe-notice',
                clickAction: 'FCM_PLUGIN_ACTIVITY',
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  threadId: payload.tag || 'pixbe-notice',
                },
              },
            },
          });
        } catch (err: any) {
          const code = String(err?.code || err?.errorInfo?.code || '');
          if (
            code.includes('registration-token-not-registered') ||
            code.includes('invalid-registration-token') ||
            code.includes('messaging/registration-token-not-registered') ||
            code.includes('messaging/invalid-registration-token')
          ) {
            stale.push(String(row.id));
          } else {
            log.error('Native push delivery failed', err);
          }
        }
      })
    );
    if (stale.length > 0) {
      await q(`DELETE FROM push_device_tokens WHERE id = ANY($1::uuid[])`, [stale]);
    }
  } catch (err) {
    log.error('Native push lookup failed', err);
  }
}

/** Best-effort desktop + mobile delivery. Stale endpoints/tokens are removed. Never throws. */
export async function sendPushToEmployees(q: Query, employeeIds: string[], payload: PushPayload): Promise<void> {
  const ids = Array.from(new Set(employeeIds.filter(Boolean)));
  if (ids.length === 0) return;
  if (!pushConfigured() && !nativePushConfigured()) return;

  try {
    await ensurePushTables(q);
  } catch (err) {
    log.error('Push table ensure failed', err);
    return;
  }

  await Promise.all([sendWebPush(q, ids, payload), sendNativePush(q, ids, payload)]);
}
