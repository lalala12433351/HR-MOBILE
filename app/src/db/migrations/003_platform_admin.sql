-- =============================================================================
-- Migration 003: Platform Admin role + control-plane operator tenant
-- =============================================================================

-- Expand global auth role CHECK to include platform_admin
ALTER TABLE public.global_auth_mapping DROP CONSTRAINT IF EXISTS global_auth_mapping_role_check;
ALTER TABLE public.global_auth_mapping
  ADD CONSTRAINT global_auth_mapping_role_check
  CHECK (role IN (
    'platform_admin',
    'super_admin',
    'hr_manager',
    'manager',
    'employee',
    'faculty',
    'teacher',
    'student'
  ));

-- Dedicated platform control tenant (home for platform_admin operators)
INSERT INTO public.tenants (
  slug, name, schema_name, status, plan, admin_email, industry
) VALUES (
  'platform',
  'Platform Control Plane',
  'tenant_platform',
  'active',
  'enterprise',
  'platform@pixbe.in',
  'Platform'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.tenant_subscriptions (tenant_id, tier, max_employees, status)
SELECT t.id, 'enterprise', 10, 'active'
FROM public.tenants t
WHERE t.slug = 'platform'
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_subscriptions s WHERE s.tenant_id = t.id
  );

-- Default platform operator (password: Platform@123) — change in production
INSERT INTO public.global_auth_mapping (
  cognito_sub, email, password_hash, tenant_id, role, is_active
)
SELECT
  'sub_platform_admin_001',
  'platform@pixbe.in',
  -- PBKDF2 salt:hash for Platform@123 is applied by seed scripts; placeholder hash for SQL-only path
  'platform_seed:pending',
  t.id,
  'platform_admin',
  true
FROM public.tenants t
WHERE t.slug = 'platform'
ON CONFLICT (cognito_sub, tenant_id) DO UPDATE
  SET role = 'platform_admin', is_active = true, email = EXCLUDED.email;
