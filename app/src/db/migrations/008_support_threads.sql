-- =============================================================================
-- Migration 008: Platform support threads (cross-tenant Pixbe helpdesk)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.support_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    requester_employee_id UUID NOT NULL,
    requester_name VARCHAR(255) NOT NULL,
    requester_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_threads_tenant ON public.support_threads(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_threads_requester ON public.support_threads(tenant_id, requester_employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_threads_status ON public.support_threads(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES public.support_threads(id) ON DELETE CASCADE,
    author_kind VARCHAR(16) NOT NULL CHECK (author_kind IN ('user', 'support')),
    author_name VARCHAR(255),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_messages_thread ON public.support_messages(thread_id, created_at ASC);
