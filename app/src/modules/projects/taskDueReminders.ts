import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import { withTenantContext } from '../../db/queryRunner.js';
import { log } from '../../utils/logger.js';
import { sendDueRemindersForTenant } from './taskNotifications.js';

const INTERVAL_MS = 60 * 60 * 1000;

let reminderTimer: NodeJS.Timeout | null = null;
let running = false;

async function listActiveTenants(): Promise<Array<{ name: string; schema_name: string }>> {
  const result = await pool.query(
    `SELECT name, schema_name
     FROM public.tenants
     WHERE status = 'active'
       AND schema_name IS NOT NULL
       AND schema_name <> ''
       AND COALESCE(slug, '') <> 'platform'`
  );
  return result.rows;
}

export async function runTaskDueReminders(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const tenants = await listActiveTenants();
    let sent = 0;
    for (const tenant of tenants) {
      try {
        const n = await withTenantContext(tenant.schema_name, async (_client, query) =>
          sendDueRemindersForTenant(query, tenant.name, tenant.schema_name)
        );
        sent += n;
      } catch (err) {
        log.warn(`Task due reminders failed for ${tenant.schema_name}`, err);
      }
    }
    if (sent > 0) {
      log.success(`Sent ${sent} task due-date reminder email(s)`);
    }
  } catch (err) {
    log.warn('Task due reminder sweep failed', err);
  } finally {
    running = false;
  }
}

export function startTaskDueReminderJob(): void {
  if (env.NODE_ENV === 'test') return;
  const run = () => {
    void runTaskDueReminders().catch((err) => log.warn('Task due reminder scan failed', err));
  };
  run();
  if (reminderTimer) clearInterval(reminderTimer);
  reminderTimer = setInterval(run, INTERVAL_MS);
  reminderTimer.unref?.();
  log.info('Task due-date reminder job scheduled (hourly).');
}

export function stopTaskDueReminderJob(): void {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
}
