-- One login identity per email across the control plane.
CREATE UNIQUE INDEX IF NOT EXISTS uq_global_auth_email_lower ON public.global_auth_mapping (LOWER(email));
