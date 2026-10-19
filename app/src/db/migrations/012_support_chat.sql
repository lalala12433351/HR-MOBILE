-- =============================================================================
-- Migration 012: Pixbe support chat (categories, priority, attachments)
-- =============================================================================

ALTER TABLE public.support_threads
    ADD COLUMN IF NOT EXISTS category VARCHAR(64) NOT NULL DEFAULT 'General';

ALTER TABLE public.support_threads
    ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'medium';

ALTER TABLE public.support_threads
    DROP CONSTRAINT IF EXISTS support_threads_priority_check;

ALTER TABLE public.support_threads
    ADD CONSTRAINT support_threads_priority_check
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

ALTER TABLE public.support_messages
    ALTER COLUMN body SET DEFAULT '';

CREATE TABLE IF NOT EXISTS public.support_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.support_messages(id) ON DELETE CASCADE,
    file_key TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128),
    size_bytes BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_attachments_message ON public.support_attachments(message_id);
