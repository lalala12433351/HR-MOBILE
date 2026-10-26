-- Allow one-time codes for changing a login email.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'auth_tokens'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%purpose%'
  LOOP
    EXECUTE format('ALTER TABLE public.auth_tokens DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.auth_tokens
  ADD CONSTRAINT auth_tokens_purpose_check
  CHECK (purpose IN ('invite', 'verify_email', 'password_reset', 'change_email'));
