import { pool } from '../../config/database.js';
import { env } from '../../config/env.js';
import { withTenantContext } from '../../db/queryRunner.js';
import { log } from '../../utils/logger.js';
import { completeDueGeofenceSignOuts, markMissedCheckouts } from './attendancePolicy.js';

const INTERVAL_MS = 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function listActiveTenants(): Promise<Array<{ schema_name: string }>> {
  const result = await pool.query(
    `SELECT schema_name
     FROM public.tenants
     WHERE status = 'active'
       AND schema_name IS NOT NULL
       AND schema_name <> ''
       AND COALESCE(slug, '') <> 'platform'`
  );
  return result.rows;
}

export async function runMissedCheckoutSweep(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const tenants = await listActiveTenants();
    for (const tenant of tenants) {
      try {
        await withTenantContext(tenant.schema_name, async (_client, query) => {
          await markMissedCheckouts(query);
          await completeDueGeofenceSignOuts(query);
        });
      } catch (err) {
        log.warn(`Attendance sweep failed for ${tenant.schema_name}`, err);
      }
    }
  } catch (err) {
    log.warn('Attendance sweep failed', err);
  } finally {
    running = false;
  }
}

export function startMissedCheckoutJob(): void {
  if (env.NODE_ENV === 'test') return;
  const run = () => {
    void runMissedCheckoutSweep().catch((err) => log.warn('Attendance sweep failed', err));
  };
  run();
  if (timer) clearInterval(timer);
  timer = setInterval(run, INTERVAL_MS);
  timer.unref?.();
  log.info('Forgotten punch-out sweep scheduled (every minute).');
}

export function stopMissedCheckoutJob(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
