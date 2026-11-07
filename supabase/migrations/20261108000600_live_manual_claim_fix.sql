-- Phase 3 fix: the ingest queue must only claim recordings that have a Zoom
-- download source. Manual uploads are written by the browser straight to R2 and
-- are completed by the `upload_complete` action, so claiming them made the
-- worker fail them with NO_DOWNLOAD_URL while the upload was still in flight.

create or replace function public.live_recording_claim_next()
returns setof public.live_recordings
language sql security definer set search_path = public
as $$
  update public.live_recordings
  set locked_until = now() + interval '3 min',
      status = 'uploading',
      attempts = attempts + 1
  where id = (
    select r.id
    from public.live_recordings r
    where r.status in ('pending', 'uploading')
      and r.source = 'zoom_cloud'
      and r.download_url is not null
      and (r.locked_until is null or r.locked_until < now())
      and r.attempts < 8
    order by r.created_at
    limit 1
    for update skip locked
  )
  returning *;
$$;
revoke all on function public.live_recording_claim_next() from public;
grant execute on function public.live_recording_claim_next() to service_role;

-- A manual upload that never completed must not sit in 'uploading' forever.
create or replace function public.live_manual_upload_expire()
returns void
language sql security definer set search_path = public
as $$
  update public.live_recordings
  set status = 'failed',
      last_error = coalesce(last_error, 'UPLOAD_ABANDONED'),
      locked_until = null
  where source = 'manual_upload'
    and status = 'uploading'
    and created_at < now() - interval '24 hours';
$$;
revoke all on function public.live_manual_upload_expire() from public;
grant execute on function public.live_manual_upload_expire() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'live_manual_upload_expire') then
      perform cron.unschedule('live_manual_upload_expire');
    end if;
    perform cron.schedule('live_manual_upload_expire', '17 * * * *',
      'select public.live_manual_upload_expire();');
  end if;
end $$;
