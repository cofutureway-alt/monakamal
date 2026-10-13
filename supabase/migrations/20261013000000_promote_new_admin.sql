-- One-time admin promotion requested by the site owner.
-- The profile protection trigger intentionally resets privileged roles; bypass it only for this explicit promotion.
ALTER TABLE public.profiles DISABLE TRIGGER trg_prevent_privileged_profile_updates;
UPDATE public.profiles
SET role = 'admin'
WHERE id = '7a9e1e50-a5e9-4bdb-ad21-8f117d3e0b8e';
ALTER TABLE public.profiles ENABLE TRIGGER trg_prevent_privileged_profile_updates;
