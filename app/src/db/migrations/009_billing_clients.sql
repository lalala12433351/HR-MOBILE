-- =============================================================================
-- Migration 009: Billing clients and invoice client/period columns
-- Executes within an isolated tenant schema (search_path set by the caller).
-- Safe to re-run: CREATE/ALTER IF NOT EXISTS plus idempotent backfill.
-- =============================================================================

CREATE TABLE IF NOT EXISTS billing_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    company_name VARCHAR(128),
    email VARCHAR(255),
    phone VARCHAR(32),
    billing_address TEXT,
    gstin VARCHAR(32),
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    payment_terms_days INTEGER NOT NULL DEFAULT 15,
    default_hourly_rate NUMERIC(12, 2),
    notes TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_billing_clients_name ON billing_clients (lower(name));

ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES billing_clients(id) ON DELETE SET NULL;
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES billing_clients(id) ON DELETE SET NULL;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES billing_clients(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_start DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_end DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'project';

ALTER TABLE invoices ALTER COLUMN project_id DROP NOT NULL;

INSERT INTO billing_clients (name, company_name, currency)
SELECT DISTINCT
    TRIM(p.client_name),
    TRIM(p.client_name),
    COALESCE(NULLIF(TRIM(p.currency), ''), 'INR')
FROM projects p
WHERE p.client_name IS NOT NULL
  AND TRIM(p.client_name) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM billing_clients c
    WHERE lower(c.name) = lower(TRIM(p.client_name))
  );

UPDATE projects p
SET client_id = c.id
FROM billing_clients c
WHERE p.client_id IS NULL
  AND p.client_name IS NOT NULL
  AND lower(TRIM(p.client_name)) = lower(c.name);

UPDATE invoices i
SET client_id = p.client_id,
    customer_name = COALESCE(NULLIF(TRIM(i.customer_name), ''), p.client_name, p.name)
FROM projects p
WHERE i.project_id = p.id
  AND i.client_id IS NULL;
