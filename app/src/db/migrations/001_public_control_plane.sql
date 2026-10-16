-- =============================================================================
-- Migration 001: Public Control Plane Schema
-- Global registries for multi-tenant management and auth mapping
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tenants Registry
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    schema_name VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'provisioning', 'decommissioned')),
    plan VARCHAR(32) NOT NULL DEFAULT 'professional' CHECK (plan IN ('starter', 'professional', 'enterprise')),
    admin_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(32),
    industry VARCHAR(64) DEFAULT 'Office',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug ON public.tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON public.tenants(status);

-- 2. Tenant Subscriptions
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    tier VARCHAR(32) NOT NULL DEFAULT 'professional',
    max_employees INTEGER NOT NULL DEFAULT 50,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'trialing')),
    billing_cycle VARCHAR(16) NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenant_subs_tenant_id ON public.tenant_subscriptions(tenant_id);

-- 3. Global Auth Mapping (Cognito sub <-> Tenant Mapping)
CREATE TABLE IF NOT EXISTS public.global_auth_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_sub VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash TEXT,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'employee' CHECK (role IN ('platform_admin', 'super_admin', 'hr_manager', 'manager', 'employee', 'faculty', 'teacher', 'student')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_cognito_tenant UNIQUE (cognito_sub, tenant_id)
);

ALTER TABLE public.global_auth_mapping ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_global_auth_cognito_sub ON public.global_auth_mapping(cognito_sub);
CREATE INDEX IF NOT EXISTS idx_global_auth_email ON public.global_auth_mapping(email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_auth_email_lower ON public.global_auth_mapping (LOWER(email));

-- 4. Global Control Plane Audit Logs
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    actor_sub VARCHAR(128) NOT NULL,
    actor_email VARCHAR(255) NOT NULL,
    action VARCHAR(64) NOT NULL,
    resource VARCHAR(128) NOT NULL,
    details JSONB,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
