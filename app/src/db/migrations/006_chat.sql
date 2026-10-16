-- =============================================================================
-- Migration 006: Chat (team channels, group/direct chats, HR tickets)
-- Executes within an isolated tenant schema (search_path set by the caller)
-- =============================================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(16) NOT NULL CHECK (type IN ('team_channel', 'group', 'direct', 'hr_ticket')),
    name VARCHAR(255),
    description TEXT,
    avatar TEXT,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    created_by UUID REFERENCES employees(id) ON DELETE SET NULL,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    ticket_status VARCHAR(16) CHECK (ticket_status IN ('open', 'in_progress', 'resolved', 'closed')),
    ticket_category VARCHAR(64),
    ticket_priority VARCHAR(16) CHECK (ticket_priority IN ('low', 'medium', 'high', 'urgent')),
    assigned_hr_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_team_channel ON chat_conversations(team_id) WHERE type = 'team_channel' AND team_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_department_channel ON chat_conversations(department_id) WHERE type = 'team_channel' AND team_id IS NULL AND department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_conv_type ON chat_conversations(type, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conv_ticket ON chat_conversations(ticket_status, assigned_hr_id) WHERE type = 'hr_ticket';

CREATE TABLE IF NOT EXISTS chat_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id UUID,
    last_read_at TIMESTAMPTZ,
    muted BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT uq_chat_participant UNIQUE (conversation_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_employee ON chat_participants(employee_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    body TEXT NOT NULL DEFAULT '',
    type VARCHAR(16) NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'system', 'file')),
    parent_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    edited_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- clock_timestamp keeps messages written in one transaction (e.g. a message plus its system notes) in order.
ALTER TABLE chat_messages ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created ON chat_messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    file_key TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(128),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message ON chat_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_key ON chat_attachments(file_key);

CREATE TABLE IF NOT EXISTS chat_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_chat_reaction UNIQUE (message_id, employee_id, emoji)
);
