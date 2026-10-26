-- =============================================================================
-- Migration 013: Chat mentions and desktop Web Push subscriptions
-- Executes within an isolated tenant schema (search_path set by the caller)
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_mentions (
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_chat_mention UNIQUE (message_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_employee ON chat_mentions(employee_id);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_push_subscription_endpoint UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_employee ON push_subscriptions(employee_id);
