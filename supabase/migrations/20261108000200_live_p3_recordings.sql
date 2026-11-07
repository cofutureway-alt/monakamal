-- Phase 3 / recordings: one row per Zoom cloud recording file (or manual upload),
-- moved into private R2 storage and then published as part-lessons.

create table if not exists public.live_recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  segment_id uuid references public.live_session_segments(id) on delete set null,
  source text not null check (source in ('zoom_cloud','manual_upload')),
  zoom_file_id text unique,
  recording_type text,
  file_size bigint,
  recording_start timestamptz,
  recording_end timestamptz,
  download_url text,
  download_token text,
  status text not null default 'pending'
    check (status in ('pending','uploading','ready','failed','skipped')),
  attempts int not null default 0,
  last_error text,
  upload_id text,
  parts jsonb not null default '[]'::jsonb,
  bytes_done bigint not null default 0,
  part_size bigint not null default 33554432,
  r2_key text,
  part_index int,
  lesson_id uuid references public.lessons(id) on delete set null,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists live_recordings_session_idx on public.live_recordings(session_id);
create index if not exists live_recordings_status_idx on public.live_recordings(status);

alter table public.live_sessions add column if not exists no_recording_reason text;

-- RLS: admins may read; every write arrives from the service role.
grant select on public.live_recordings to authenticated;
grant all on public.live_recordings to service_role;
alter table public.live_recordings enable row level security;

drop policy if exists "live_recordings_admin_select" on public.live_recordings;
create policy "live_recordings_admin_select" on public.live_recordings
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop trigger if exists live_recordings_set_updated_at on public.live_recordings;
create trigger live_recordings_set_updated_at
  before update on public.live_recordings
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Claim the next job for the ingest worker (worker lease, skip locked).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Publish every ready recording of a session as an ordered lesson, then close
-- the session. Idempotent: safe to call after every upload and from cron.
-- ---------------------------------------------------------------------------
create or replace function public.live_session_finalize(_session_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.live_sessions;
  v_pending int;
  v_ready int;
  v_unit_id uuid;
  v_position int;
  v_rec record;
  v_lesson_id uuid;
  v_first_lesson uuid;
  v_shift int;
  v_inserted int;
begin
  select * into v_session from public.live_sessions where id = _session_id;
  if v_session.id is null then
    return;
  end if;
  if v_session.status not in ('ended', 'completed') then
    return;
  end if;

  select count(*) into v_pending
  from public.live_recordings
  where session_id = _session_id and status in ('pending', 'uploading');
  if v_pending > 0 then
    return;
  end if;

  select count(*) into v_ready
  from public.live_recordings
  where session_id = _session_id and status = 'ready';

  -- Order the parts once; the same order is used for numbering every call.
  with ordered as (
    select id, row_number() over (order by coalesce(recording_start, created_at), created_at) as rn
    from public.live_recordings
    where session_id = _session_id and status = 'ready'
  )
  update public.live_recordings r
  set part_index = o.rn
  from ordered o
  where r.id = o.id and r.part_index is distinct from o.rn;

  if v_ready > 0 then
    -- The session may have been created without a unit (live-course timeline).
    v_unit_id := v_session.unit_id;
    if v_unit_id is null then
      insert into public.units (course_id, title, position)
      values (
        v_session.course_id,
        v_session.title,
        coalesce((select max(position) from public.units where course_id = v_session.course_id), 0) + 1
      )
      returning id into v_unit_id;

      update public.live_sessions set unit_id = v_unit_id where id = _session_id;
      v_session.unit_id := v_unit_id;
    end if;

    -- Make room: every existing item at or after the session's slot shifts by
    -- the number of parts, excluding lessons this function already created.
    select count(*) into v_shift
    from public.live_recordings
    where session_id = _session_id and status = 'ready' and lesson_id is null;

    if v_shift > 0 then
      update public.lessons
      set position = position + v_shift
      where unit_id = v_unit_id
        and position > v_session.position
        and id not in (
          select lesson_id from public.live_recordings
          where session_id = _session_id and lesson_id is not null
        );

      update public.live_sessions
      set position = position + v_shift
      where unit_id = v_unit_id
        and position > v_session.position
        and id <> _session_id;
    end if;

    for v_rec in
      select * from public.live_recordings
      where session_id = _session_id and status = 'ready'
      order by part_index
    loop
      if v_rec.lesson_id is null then
        insert into public.lessons (unit_id, title, description, video_provider, video_url, position)
        values (
          v_unit_id,
          v_session.title || ' — الجزء ' || v_rec.part_index,
          null,
          'r2',
          v_rec.r2_key,
          v_session.position + v_rec.part_index
        )
        returning id into v_lesson_id;

        update public.live_recordings set lesson_id = v_lesson_id where id = v_rec.id;
      else
        update public.lessons
        set title = v_session.title || ' — الجزء ' || v_rec.part_index,
            video_provider = 'r2',
            video_url = v_rec.r2_key,
            position = v_session.position + v_rec.part_index
        where id = v_rec.lesson_id;
        v_lesson_id := v_rec.lesson_id;
      end if;

      if v_first_lesson is null then
        v_first_lesson := v_lesson_id;
      end if;
    end loop;
  end if;

  update public.live_sessions
  set status = 'completed',
      ended_at = coalesce(ended_at, now())
  where id = _session_id
    and status <> 'completed';

  -- One notification per session, ever.
  insert into public.live_session_notification_log (session_id, kind)
  values (_session_id, 'recording_ready')
  on conflict (session_id, kind) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    insert into public.notifications (
      user_id, type, title, body, template_data, action_url,
      related_entity_type, related_entity_id
    )
    select e.user_id,
           'live_recording_ready',
           'تسجيل الجلسة جاهز',
           v_session.title,
           jsonb_build_object('session_id', _session_id, 'course_id', v_session.course_id),
           case
             when v_first_lesson is not null
               then '/courses/' || v_session.course_id || '/learn/lesson/' || v_first_lesson
             else '/courses/' || v_session.course_id || '/learn/live_session/' || _session_id
           end,
           'live_session',
           _session_id
    from public.enrollments e
    where e.course_id = v_session.course_id;
  end if;
end;
$$;
revoke all on function public.live_session_finalize(uuid) from public;
grant execute on function public.live_session_finalize(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Auto-end: a session that ran past its window is closed by the clock, not by
-- a host click.
-- ---------------------------------------------------------------------------
create or replace function public.live_session_auto_end()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_s record;
  v_account_type int;
  v_reason text;
  v_zero int;
begin
  for v_s in
    select s.*
    from public.live_sessions s
    where s.status in ('scheduled', 'live')
      and now() > s.scheduled_start_at + make_interval(mins => s.duration_minutes) + interval '60 min'
  loop
    update public.live_sessions
    set status = 'ended', ended_at = coalesce(ended_at, now())
    where id = v_s.id;

    update public.live_session_segments
    set ended_at = coalesce(ended_at, now())
    where session_id = v_s.id and ended_at is null;

    select zoom_account_type into v_account_type
    from public.zoom_connections where user_id = v_s.host_user_id;

    v_reason := null;
    if v_s.recording_enabled = false then
      v_reason := 'disabled';
    elsif v_account_type = 1 then
      v_reason := 'basic_account';
    end if;

    if v_reason is not null then
      update public.live_sessions set no_recording_reason = v_reason where id = v_s.id;
      perform public.live_session_finalize(v_s.id);
    end if;
  end loop;

  -- Ended more than a day ago and nothing arrived from Zoom: give up loudly.
  for v_s in
    select s.*
    from public.live_sessions s
    where s.status = 'ended'
      and s.ended_at is not null
      and s.ended_at < now() - interval '24 hours'
      and not exists (select 1 from public.live_recordings r where r.session_id = s.id)
  loop
    update public.live_sessions
    set status = 'completed', no_recording_reason = 'not_received'
    where id = v_s.id;

    insert into public.notifications (
      user_id, type, title, body, template_data, action_url,
      related_entity_type, related_entity_id
    )
    values (
      v_s.host_user_id,
      'live_recording_missing',
      'لم يصل تسجيل الجلسة',
      v_s.title,
      jsonb_build_object('session_id', v_s.id, 'course_id', v_s.course_id),
      '/admin/courses/' || v_s.course_id || '/builder',
      'live_session',
      v_s.id
    );
    v_zero := 0;
  end loop;
end;
$$;
revoke all on function public.live_session_auto_end() from public;
grant execute on function public.live_session_auto_end() to service_role;

-- ---------------------------------------------------------------------------
-- Notification channels for the Phase 3 types (WhatsApp off by default).
-- ---------------------------------------------------------------------------
insert into public.notification_type_channels (notification_type, whatsapp_enabled) values
  ('live_recording_ready', false),
  ('live_recording_failed', false),
  ('live_recording_missing', false)
on conflict (notification_type) do nothing;
