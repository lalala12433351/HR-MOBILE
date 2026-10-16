-- Company / institution registered address captured during workspace registration
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS city VARCHAR(128);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS state_province VARCHAR(128);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS postal_code VARCHAR(32);
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS country VARCHAR(128);
