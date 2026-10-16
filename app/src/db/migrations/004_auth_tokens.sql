-- ============================================================================
-- MIGRATION 004: One-time auth tokens (email verification codes, invite links,
-- password reset links). Only SHA-256 hashes are stored, never raw tokens.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('invite', 'verify_email', 'password_reset')),
    token_hash TEXT NOT NULL,
    email VARCHAR(255) NOT NULL,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    employee_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON public.auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_purpose_email ON public.auth_tokens(purpose, LOWER(email));
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON public.auth_tokens(expires_at);
