import type { Pool, PoolClient } from 'pg';
import { pool } from '../../config/database.js';

export type Queryable = Pool | PoolClient;

export type LicenseStatus = 'trialing' | 'active' | 'expiring' | 'expired' | 'canceled';
export type BillingCycle = 'monthly' | 'annual';
export type LicenseAction =
  | 'issued'
  | 'activated'
  | 'trial_started'
  | 'renewed'
  | 'extended'
  | 'upgraded'
  | 'downgraded'
  | 'expired'
  | 'revoked'
  | 'seats_changed';

export class LicenseError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface LicensePlan {
  id: string;
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
  maxSeats: number;
  trialDays: number;
  features: string[];
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
  activeClientsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface LicenseSummary {
  subscriptionId: string | null;
  planId: string | null;
  planKey: string;
  planName: string;
  status: LicenseStatus;
  maxSeats: number;
  seatsUsed: number;
  billingCycle: BillingCycle;
  periodStart: string | null;
  periodEnd: string | null;
  trialEndsAt: string | null;
  daysRemaining: number;
  features: string[];
}

const EXPIRING_WINDOW_DAYS = 14;

export function mapPlanRow(row: any): LicensePlan {
  let features: string[] = [];
  if (Array.isArray(row.features)) features = row.features.map(String);
  else if (typeof row.features === 'string') {
    try {
      const parsed = JSON.parse(row.features);
      if (Array.isArray(parsed)) features = parsed.map(String);
    } catch {
      features = [];
    }
  }
  return {
    id: String(row.id),
    key: String(row.key),
    name: String(row.name),
    description: row.description || '',
    priceMonthly: Number(row.price_monthly ?? 0) || 0,
    priceAnnual: Number(row.price_annual ?? 0) || 0,
    maxSeats: Math.max(1, Number(row.max_seats ?? 1) || 1),
    trialDays: Math.max(0, Number(row.trial_days ?? 0) || 0),
    features,
    isActive: row.is_active !== false,
    isPublic: row.is_public !== false,
    sortOrder: Number(row.sort_order ?? 100) || 100,
    activeClientsCount: Number(row.active_clients_count ?? 0) || 0,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export function resolveBillingIntent(raw?: string | null): { billingCycle: BillingCycle; startTrial: boolean } {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'trial') return { billingCycle: 'monthly', startTrial: true };
  if (value === 'annual') return { billingCycle: 'annual', startTrial: false };
  return { billingCycle: 'monthly', startTrial: false };
}

export function computePeriod(
  plan: LicensePlan,
  billingCycle: BillingCycle,
  start = new Date(),
  startTrial = false
) {
  const trialDays = startTrial ? (plan.trialDays > 0 ? plan.trialDays : 14) : 0;
  const trialEndsAt = trialDays > 0 ? addDays(start, trialDays) : null;
  const periodEnd = trialEndsAt
    ? trialEndsAt
    : billingCycle === 'annual'
      ? addMonths(start, 12)
      : addMonths(start, 1);
  const status: LicenseStatus = trialEndsAt ? 'trialing' : 'active';
  return { start, trialEndsAt, periodEnd, status };
}

export function computeLicenseStatus(row: {
  status?: string | null;
  trial_ends_at?: Date | string | null;
  current_period_end?: Date | string | null;
}, now = new Date()): LicenseStatus {
  const stored = String(row.status || '').toLowerCase();
  if (stored === 'canceled') return 'canceled';
  const trialEnd = toDate(row.trial_ends_at);
  if (trialEnd && trialEnd.getTime() > now.getTime()) return 'trialing';
  const periodEnd = toDate(row.current_period_end);
  if (periodEnd && periodEnd.getTime() < now.getTime()) return 'expired';
  if (periodEnd) {
    const windowMs = EXPIRING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (periodEnd.getTime() - now.getTime() <= windowMs) return 'expiring';
  }
  if (stored === 'trialing' || stored === 'expired' || stored === 'active') {
    return stored === 'trialing' ? 'active' : (stored as LicenseStatus);
  }
  return 'active';
}

export function daysRemaining(periodEnd: Date | string | null | undefined, now = new Date()): number {
  const end = toDate(periodEnd);
  if (!end) return 0;
  return Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export async function getPlanByIdOrKey(db: Queryable, idOrKey: string): Promise<LicensePlan | null> {
  const result = await db.query(
    `SELECT * FROM public.license_plans WHERE id::text = $1 OR key = $1 LIMIT 1`,
    [String(idOrKey || '').trim()]
  );
  return result.rows[0] ? mapPlanRow(result.rows[0]) : null;
}

export async function listPublicPlans(db: Queryable = pool): Promise<LicensePlan[]> {
  const result = await db.query(
    `SELECT * FROM public.license_plans
      WHERE is_active = true AND is_public = true
      ORDER BY sort_order ASC, name ASC`
  );
  return result.rows.map(mapPlanRow);
}

export async function listAllPlans(db: Queryable = pool): Promise<LicensePlan[]> {
  const result = await db.query(
    `SELECT p.*,
            COALESCE((
              SELECT COUNT(*)::int FROM public.tenant_subscriptions s
              WHERE s.plan_id = p.id AND s.status IS DISTINCT FROM 'canceled'
            ), 0) AS active_clients_count
       FROM public.license_plans p
      ORDER BY sort_order ASC, name ASC`
  );
  return result.rows.map(mapPlanRow);
}

export async function resolveTenantUuid(db: Queryable, tenantRef: string): Promise<string | null> {
  const result = await db.query(
    `SELECT id FROM public.tenants WHERE id::text = $1 OR slug = $1 LIMIT 1`,
    [String(tenantRef || '').trim()]
  );
  return result.rows[0]?.id || null;
}

export async function recordLicenseEvent(
  db: Queryable,
  input: {
    tenantId: string;
    subscriptionId?: string | null;
    actorEmail?: string | null;
    action: LicenseAction;
    fromPlan?: string | null;
    toPlan?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    periodStart?: Date | null;
    periodEnd?: Date | null;
    details?: Record<string, unknown>;
  }
): Promise<void> {
  await db.query(
    `INSERT INTO public.license_events
       (tenant_id, subscription_id, actor_email, action, from_plan, to_plan, from_status, to_status, period_start, period_end, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)`,
    [
      input.tenantId,
      input.subscriptionId || null,
      input.actorEmail || null,
      input.action,
      input.fromPlan || null,
      input.toPlan || null,
      input.fromStatus || null,
      input.toStatus || null,
      input.periodStart || null,
      input.periodEnd || null,
      JSON.stringify(input.details || {}),
    ]
  );
}

export async function issueLicense(
  db: Queryable,
  input: {
    tenantId: string;
    plan: LicensePlan;
    billingCycle?: BillingCycle | 'trial';
    startTrial?: boolean;
    maxSeats?: number;
    actorEmail?: string | null;
  }
) {
  const intent = resolveBillingIntent(input.billingCycle);
  const billingCycle = intent.billingCycle;
  const startTrial = input.startTrial === true || intent.startTrial;
  const { start, trialEndsAt, periodEnd, status } = computePeriod(input.plan, billingCycle, new Date(), startTrial);
  const maxSeats = Math.max(1, Number(input.maxSeats ?? input.plan.maxSeats) || input.plan.maxSeats);

  const existing = await db.query(
    `SELECT id FROM public.tenant_subscriptions WHERE tenant_id = $1 LIMIT 1`,
    [input.tenantId]
  );

  let subscriptionId: string;
  if (existing.rows[0]) {
    const updated = await db.query(
      `UPDATE public.tenant_subscriptions
          SET plan_id = $1, tier = $2, max_employees = $3, status = $4, billing_cycle = $5,
              current_period_start = $6, current_period_end = $7, trial_ends_at = $8, updated_at = CURRENT_TIMESTAMP
        WHERE tenant_id = $9
        RETURNING id`,
      [
        input.plan.id,
        input.plan.key,
        maxSeats,
        status === 'trialing' ? 'trialing' : 'active',
        billingCycle,
        start,
        periodEnd,
        trialEndsAt,
        input.tenantId,
      ]
    );
    subscriptionId = updated.rows[0].id;
  } else {
    const inserted = await db.query(
      `INSERT INTO public.tenant_subscriptions
         (tenant_id, plan_id, tier, max_employees, status, billing_cycle, current_period_start, current_period_end, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.tenantId,
        input.plan.id,
        input.plan.key,
        maxSeats,
        status === 'trialing' ? 'trialing' : 'active',
        billingCycle,
        start,
        periodEnd,
        trialEndsAt,
      ]
    );
    subscriptionId = inserted.rows[0].id;
  }

  await db.query(
    `UPDATE public.tenants SET plan = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [input.plan.key, input.tenantId]
  );

  await recordLicenseEvent(db, {
    tenantId: input.tenantId,
    subscriptionId,
    actorEmail: input.actorEmail,
    action: trialEndsAt ? 'trial_started' : 'issued',
    toPlan: input.plan.key,
    toStatus: status === 'trialing' ? 'trialing' : 'active',
    periodStart: start,
    periodEnd,
    details: { billingCycle, maxSeats, startTrial },
  });

  return { subscriptionId, status, start, periodEnd, trialEndsAt, maxSeats, billingCycle };
}

export async function countSeatsUsed(db: Queryable, tenantId: string, schemaName?: string | null): Promise<number> {
  if (schemaName && schemaName !== 'public') {
    try {
      const counted = await db.query(`SELECT COUNT(*)::int AS n FROM "${schemaName}".employees`);
      return Number(counted.rows[0]?.n || 0);
    } catch {
      // schema may not exist yet
    }
  }
  const mapped = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM public.global_auth_mapping
      WHERE tenant_id = $1
        AND role NOT IN ('platform_admin', 'student')
        AND is_active = true`,
    [tenantId]
  );
  return Number(mapped.rows[0]?.n || 0);
}

export async function loadLicenseRow(db: Queryable, tenantId: string) {
  const result = await db.query(
    `SELECT s.*, p.key AS plan_key, p.name AS plan_name, p.features, p.max_seats AS plan_max_seats,
            t.schema_name, t.slug AS tenant_slug, t.plan AS tenant_plan, t.name AS tenant_name
       FROM public.tenants t
       LEFT JOIN public.tenant_subscriptions s ON s.tenant_id = t.id
       LEFT JOIN public.license_plans p ON p.id = s.plan_id
      WHERE t.id = $1
      LIMIT 1`,
    [tenantId]
  );
  return result.rows[0] || null;
}

export async function syncAndSummarizeLicense(
  db: Queryable,
  tenantId: string,
  actorEmail?: string | null
): Promise<LicenseSummary | null> {
  const uuid = (await resolveTenantUuid(db, tenantId)) || tenantId;
  const row = await loadLicenseRow(db, uuid);
  if (!row) return null;
  tenantId = uuid;
  if (!row.id) {
    return {
      subscriptionId: null,
      planId: null,
      planKey: row.tenant_plan || 'professional',
      planName: row.tenant_plan || 'Professional',
      status: 'expired',
      maxSeats: 0,
      seatsUsed: await countSeatsUsed(db, tenantId, row.schema_name),
      billingCycle: 'monthly',
      periodStart: null,
      periodEnd: null,
      trialEndsAt: null,
      daysRemaining: 0,
      features: [],
    };
  }

  const computed = computeLicenseStatus(row);
  const stored = String(row.status || '').toLowerCase();
  if (computed === 'expired' && stored !== 'expired' && stored !== 'canceled') {
    await db.query(
      `UPDATE public.tenant_subscriptions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [row.id]
    );
    const already = await db.query(
      `SELECT 1 FROM public.license_events
        WHERE tenant_id = $1 AND action = 'expired' AND created_at > COALESCE($2::timestamptz, CURRENT_TIMESTAMP - INTERVAL '1 day')
        LIMIT 1`,
      [tenantId, row.current_period_end]
    );
    if (already.rows.length === 0) {
      await recordLicenseEvent(db, {
        tenantId,
        subscriptionId: row.id,
        actorEmail: actorEmail || 'system',
        action: 'expired',
        fromPlan: row.plan_key || row.tier,
        toPlan: row.plan_key || row.tier,
        fromStatus: stored,
        toStatus: 'expired',
        periodStart: row.current_period_start,
        periodEnd: row.current_period_end,
      });
    }
    row.status = 'expired';
  }

  const status = computeLicenseStatus(row);
  const seatsUsed = await countSeatsUsed(db, tenantId, row.schema_name);
  const billingCycle: BillingCycle = row.billing_cycle === 'annual' ? 'annual' : 'monthly';
  const summary: LicenseSummary = {
    subscriptionId: row.id,
    planId: row.plan_id,
    planKey: row.plan_key || row.tier || row.tenant_plan || 'professional',
    planName: row.plan_name || titleCase(row.plan_key || row.tier || 'professional'),
    status,
    maxSeats: Number(row.max_employees ?? row.plan_max_seats ?? 0) || 0,
    seatsUsed,
    billingCycle,
    periodStart: row.current_period_start ? new Date(row.current_period_start).toISOString() : null,
    periodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
    trialEndsAt: row.trial_ends_at ? new Date(row.trial_ends_at).toISOString() : null,
    daysRemaining: daysRemaining(row.current_period_end),
    features: mapPlanRow({ ...row, features: row.features, key: row.plan_key, name: row.plan_name, id: row.plan_id || row.id }).features,
  };
  if (status === 'expiring' || status === 'expired') {
    void import('./license.reminders.js')
      .then(({ maybeNotifyExpiry }) =>
        maybeNotifyExpiry({
          tenantId,
          schemaName: row.schema_name,
          tenantName: row.tenant_name || row.tenant_slug || 'Workspace',
          subscriptionId: row.id,
          periodStart: row.current_period_start,
          periodEnd: row.current_period_end,
          planName: summary.planName,
          planKey: summary.planKey,
          maxSeats: summary.maxSeats,
          seatsUsed,
        })
      )
      .catch(() => undefined);
  }
  return summary;
}

export async function assertCanAddEmployees(
  tenantRef: string,
  additional = 1,
  db: Queryable = pool
): Promise<LicenseSummary> {
  const tenantId = await resolveTenantUuid(db, tenantRef);
  if (!tenantId) {
    throw new LicenseError('TENANT_NOT_FOUND', 'Workspace not found.', 404);
  }
  const license = await syncAndSummarizeLicense(db, tenantId);
  if (!license) {
    throw new LicenseError('LICENSE_MISSING', 'This workspace has no license. Contact Pixbe support.', 403);
  }
  if (license.status === 'expired' || license.status === 'canceled') {
    throw new LicenseError(
      'LICENSE_INACTIVE',
      license.status === 'canceled'
        ? 'This workspace license was revoked. New people cannot be added until a license is restored.'
        : 'This workspace license has expired. New people cannot be added until the license is extended.',
      403
    );
  }
  if (license.seatsUsed + additional > license.maxSeats) {
    throw new LicenseError(
      'SEAT_LIMIT',
      `This ${license.planName} license includes ${license.maxSeats} seats. ${license.seatsUsed} are in use.`,
      403
    );
  }
  return license;
}

export async function listLicenseEvents(db: Queryable, tenantId: string, limit = 50) {
  const result = await db.query(
    `SELECT * FROM public.license_events WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [tenantId, Math.min(200, Math.max(1, limit))]
  );
  return result.rows.map((row: any) => ({
    id: row.id,
    action: row.action,
    actorEmail: row.actor_email,
    fromPlan: row.from_plan,
    toPlan: row.to_plan,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    details: row.details || {},
    createdAt: row.created_at,
  }));
}

export async function mutateTenantLicense(
  db: Queryable,
  tenantId: string,
  payload: {
    planId?: string;
    plan?: string;
    maxSeats?: number;
    billingCycle?: BillingCycle;
    extendDays?: number;
    periodEnd?: string;
    revoke?: boolean;
  },
  actorEmail?: string | null
) {
  const current = await loadLicenseRow(db, tenantId);
  if (!current?.id) {
    throw new LicenseError('LICENSE_MISSING', 'This workspace has no license to update.', 404);
  }

  if (payload.revoke) {
    await db.query(
      `UPDATE public.tenant_subscriptions
          SET status = 'canceled', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
      [current.id]
    );
    await recordLicenseEvent(db, {
      tenantId,
      subscriptionId: current.id,
      actorEmail,
      action: 'revoked',
      fromPlan: current.plan_key || current.tier,
      toPlan: current.plan_key || current.tier,
      fromStatus: current.status,
      toStatus: 'canceled',
      periodStart: current.current_period_start,
      periodEnd: current.current_period_end,
    });
    return syncAndSummarizeLicense(db, tenantId, actorEmail);
  }

  let nextPlan = current.plan_id ? await getPlanByIdOrKey(db, current.plan_id) : null;
  const requestedPlan = payload.planId || payload.plan;
  if (requestedPlan) {
    nextPlan = await getPlanByIdOrKey(db, requestedPlan);
    if (!nextPlan) throw new LicenseError('PLAN_NOT_FOUND', 'License plan not found.', 404);
  }
  if (!nextPlan) throw new LicenseError('PLAN_NOT_FOUND', 'License plan not found.', 404);

  const nextSeats = payload.maxSeats != null
    ? Math.max(1, Number(payload.maxSeats) || nextPlan.maxSeats)
    : Number(current.max_employees) || nextPlan.maxSeats;
  const nextCycle: BillingCycle =
    payload.billingCycle === 'annual' || payload.billingCycle === 'monthly'
      ? payload.billingCycle
      : current.billing_cycle === 'annual'
        ? 'annual'
        : 'monthly';

  let periodEnd = toDate(current.current_period_end) || new Date();
  let action: LicenseAction = 'activated';
  if (payload.periodEnd) {
    const explicit = toDate(payload.periodEnd);
    if (!explicit) throw new LicenseError('BAD_REQUEST', 'periodEnd must be a valid date.');
    periodEnd = explicit;
    action = 'extended';
  } else if (payload.extendDays != null) {
    const days = Number(payload.extendDays);
    if (!Number.isFinite(days) || days === 0) {
      throw new LicenseError('BAD_REQUEST', 'extendDays must be a non-zero number.');
    }
    const from = periodEnd.getTime() < Date.now() ? new Date() : periodEnd;
    periodEnd = addDays(from, days);
    action = 'extended';
  } else if (requestedPlan && nextPlan.key !== (current.plan_key || current.tier)) {
    action = nextPlan.maxSeats >= Number(current.max_employees || 0) ? 'upgraded' : 'downgraded';
  } else if (payload.maxSeats != null && Number(payload.maxSeats) !== Number(current.max_employees)) {
    action = 'seats_changed';
  } else if (payload.billingCycle && payload.billingCycle !== current.billing_cycle) {
    action = 'renewed';
  }

  const nextStatusStored =
    periodEnd.getTime() < Date.now()
      ? 'expired'
      : current.status === 'canceled'
        ? 'active'
        : current.trial_ends_at && toDate(current.trial_ends_at)!.getTime() > Date.now()
          ? 'trialing'
          : 'active';

  await db.query(
    `UPDATE public.tenant_subscriptions
        SET plan_id = $1, tier = $2, max_employees = $3, billing_cycle = $4,
            current_period_end = $5, status = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7`,
    [nextPlan.id, nextPlan.key, nextSeats, nextCycle, periodEnd, nextStatusStored, current.id]
  );
  await db.query(
    `UPDATE public.tenants SET plan = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [nextPlan.key, tenantId]
  );
  await recordLicenseEvent(db, {
    tenantId,
    subscriptionId: current.id,
    actorEmail,
    action,
    fromPlan: current.plan_key || current.tier,
    toPlan: nextPlan.key,
    fromStatus: current.status,
    toStatus: nextStatusStored,
    periodStart: current.current_period_start,
    periodEnd,
    details: {
      maxSeats: nextSeats,
      billingCycle: nextCycle,
      extendDays: payload.extendDays ?? null,
    },
  });
  return syncAndSummarizeLicense(db, tenantId, actorEmail);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(start: Date, days: number): Date {
  const next = new Date(start.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(start: Date, months: number): Date {
  const next = new Date(start.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function titleCase(value: string): string {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
