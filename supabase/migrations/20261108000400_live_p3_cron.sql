-- Phase 3 / cron wiring. Kept separate from the schema migration because it
-- depends on Vault rows that are created out of band (one-off SQL), not by this
-- migration. Re-runnable: each job is unscheduled before it is (re)scheduled.

-- ---------------------------------------------------------------------------
-- Recording ingest: ping the edge worker once a minute with the cron secret.
-- The function keeps working for ~110 s per call, so the cadence is a floor,
-- not a limit.
-- ---------------------------------------------------------------------------
create or replace function public.live_recording_ingest_tick()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_base text;
  v_secret text;
begin
  select decrypted_secret into v_base
  from vault.decrypted_secrets where name = 'live_functions_base_url' limit 1;
  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'live_cron_secret' limit 1;

  if v_base is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_base || '/recording-ingest-tick',
    headers := jsonb_build_object(
      'x-cron-secret', v_secret,
      'content-type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 1000
  );
end;
$$;
revoke all on function public.live_recording_ingest_tick() from public;
grant execute on function public.live_recording_ingest_tick() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'live_recording_ingest') then
      perform cron.unschedule('live_recording_ingest');
    end if;
    perform cron.schedule('live_recording_ingest', '* * * * *',
      'select public.live_recording_ingest_tick();');

    if exists (select 1 from cron.job where jobname = 'live_session_auto_end') then
      perform cron.unschedule('live_session_auto_end');
    end if;
    perform cron.schedule('live_session_auto_end', '*/5 * * * *',
      'select public.live_session_auto_end();');
  end if;
end $$;
