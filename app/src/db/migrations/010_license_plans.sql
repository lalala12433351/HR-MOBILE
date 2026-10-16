-- =============================================================================
-- Migration 010: License plan catalog, subscription timeline, license events
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.license_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    price_monthly NUMERIC(12, 2) NOT NULL DEFAULT 0,
    price_annual NUMERIC(12, 2) NOT NULL DEFAULT 0,
    max_seats INTEGER NOT NULL DEFAULT 25,
    trial_days INTEGER NOT NULL DEFAULT 0,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_public BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.license_plans (
  id, key, name, description, price_monthly, price_annual, max_seats, trial_days, features, is_active, is_public, sort_order
) VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'starter',
    'Starter',
    'Attendance, leave, and standard shifts for small teams.',
    49, 490, 25, 14,
    '["Up to 25 Users", "Standard Shifts", "Leave & Attendance", "10 GB Storage"]'::jsonb,
    true, true, 10
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'professional',
    'Professional',
    'Operations for growing companies, including payroll and geofencing.',
    199, 1990, 500, 14,
    '["Up to 500 Users", "Multi-Batch Bell Timings", "GPS Geofencing", "Payroll & Tax Engine"]'::jsonb,
    true, true, 20
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'enterprise',
    'Enterprise',
    'Dedicated schema, high seat capacity, and priority support.',
    599, 5990, 2500, 0,
    '["2,500+ Users", "Dedicated DB Schema", "Unlimited AI Queries", "Custom Domain", "24/7 SLA Support"]'::jsonb,
    true, true, 30
  )
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;

ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.license_plans(id);

ALTER TABLE public.tenant_subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

ALTER TABLE public.tenant_subscriptions DROP CONSTRAINT IF EXISTS tenant_subscriptions_status_check;
ALTER TABLE public.tenant_subscriptions
  ADD CONSTRAINT tenant_subscriptions_status_check
  CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'expired'));

-- Collapse duplicate subscription rows before unique index
DELETE FROM public.tenant_subscriptions a
USING public.tenant_subscriptions b
WHERE a.tenant_id = b.tenant_id
  AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id::text < b.id::text));

CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_subscriptions_tenant_id
  ON public.tenant_subscriptions(tenant_id);

UPDATE public.tenant_subscriptions s
SET plan_id = p.id,
    tier = p.key
FROM public.license_plans p
WHERE s.plan_id IS NULL
  AND LOWER(s.tier) = p.key;

UPDATE public.tenant_subscriptions s
SET plan_id = p.id,
    tier = p.key
FROM public.tenants t
JOIN public.license_plans p ON LOWER(t.plan) = p.key
WHERE s.tenant_id = t.id
  AND s.plan_id IS NULL;

UPDATE public.tenant_subscriptions s
SET plan_id = p.id,
    tier = p.key
FROM public.license_plans p
WHERE s.plan_id IS NULL
  AND p.key = 'professional';

UPDATE public.tenants t
SET plan = s.tier
FROM public.tenant_subscriptions s
WHERE s.tenant_id = t.id
  AND (t.plan IS NULL OR t.plan = '' OR t.plan IS DISTINCT FROM s.tier);

CREATE TABLE IF NOT EXISTS public.license_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.tenant_subscriptions(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    action VARCHAR(32) NOT NULL,
    from_plan VARCHAR(64),
    to_plan VARCHAR(64),
    from_status VARCHAR(32),
    to_status VARCHAR(32),
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_license_events_tenant_id ON public.license_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_license_events_created_at ON public.license_events(created_at);
CREATE INDEX IF NOT EXISTS idx_license_plans_public ON public.license_plans(is_public, is_active, sort_order);
