-- Phase 0: pg_net is required so pg_cron can call Edge Functions in later phases.
-- supabase_vault and pg_cron are already installed on this project.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
