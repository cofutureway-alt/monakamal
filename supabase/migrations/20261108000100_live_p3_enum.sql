-- Phase 3 / R2 recordings: the new enum value must be committed alone before any
-- statement uses it (Postgres cannot add an enum value and reference it in the
-- same transaction).
alter type public.video_provider add value if not exists 'r2';
