-- Phase 1 / live sessions data model + RPCs + reminders cron.
-- Every statement is idempotent so the file can be re-run safely.

-- ---------------------------------------------------------------------------
-- 1. Course flags
-- ---------------------------------------------------------------------------
alter table public.courses
  add column if not exists course_type text not null default 'recorded',
  add column if not exists enrollment_mode text not null default 'standard';

alter table public.courses drop constraint if exists courses_course_type_chk;
alter table public.courses add constraint courses_course_type_chk
  check (course_type in ('recorded','live'));

alter table public.courses drop constraint if exists courses_enrollment_mode_chk;
alter table public.courses add constraint courses_enrollment_mode_chk
  check (enrollment_mode in ('standard','auto_all_students','auto_stages'));

-- Auto-enrollment is only allowed for free courses (roadmap §1 decision 9).
alter table public.courses drop constraint if exists courses_auto_enroll_free_chk;
alter table public.courses add constraint courses_auto_enroll_free_chk
  check (enrollment_mode = 'standard' or coalesce(is_paid, false) = false);

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  description text,
  scheduled_start_at timestamptz not null,
  duration_minutes int not null check (duration_minutes between 15 and 480),
  host_user_id uuid not null references public.profiles(id),
  status text not null default 'scheduled'
    check (status in ('scheduled','live','ended','completed','cancelled')),
  current_segment_id uuid,
  link_version int not null default 1,
  recording_enabled boolean not null default true,
  position int not null default 0,          -- order inside the unit, same semantics as lessons.position
  started_at timestamptz, ended_at timestamptz, cancelled_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists live_sessions_course_idx on public.live_sessions(course_id);
create index if not exists live_sessions_start_idx on public.live_sessions(scheduled_start_at);

create table if not exists public.live_session_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  segment_index int not null check (segment_index >= 1),
  source text not null check (source in ('zoom_api','manual_url')),
  zoom_meeting_id bigint, zoom_meeting_uuid text,
  join_url text not null, password text,
  replace_reason text,
  started_at timestamptz, ended_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (session_id, segment_index)
);

alter table public.live_sessions drop constraint if exists live_sessions_current_segment_fk;
alter table public.live_sessions add constraint live_sessions_current_segment_fk
  foreign key (current_segment_id) references public.live_session_segments(id) on delete set null;

create table if not exists public.live_session_secrets (
  segment_id uuid primary key references public.live_session_segments(id) on delete cascade,
  start_url text, start_url_fetched_at timestamptz
);

create table if not exists public.live_session_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  file_name text not null, storage_path text not null, file_type text, file_size bigint,
  allow_download boolean not null default true, position int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.live_session_attendance (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  segment_id uuid not null references public.live_session_segments(id) on delete cascade,
  first_joined_at timestamptz not null default now(),
  last_joined_at timestamptz not null default now(),
  join_count int not null default 1,
  primary key (session_id, user_id, segment_id)
);

create table if not exists public.live_session_notification_log (
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (session_id, kind)
);

-- ---------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists live_sessions_set_updated_at on public.live_sessions;
create trigger live_sessions_set_updated_at
  before update on public.live_sessions
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_enrolled_in_course(_user uuid, _course uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.enrollments e
    where e.user_id = _user and e.course_id = _course
  );
$$;
revoke all on function public.is_enrolled_in_course(uuid, uuid) from public;
grant execute on function public.is_enrolled_in_course(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.live_sessions to authenticated;
grant all on public.live_sessions to service_role;
alter table public.live_sessions enable row level security;

drop policy if exists "live_sessions_admin_all" on public.live_sessions;
create policy "live_sessions_admin_all" on public.live_sessions
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "live_sessions_select_enrolled" on public.live_sessions;
create policy "live_sessions_select_enrolled" on public.live_sessions
  for select to authenticated
  using (public.is_enrolled_in_course(auth.uid(), course_id));

grant select, insert, update, delete on public.live_session_segments to authenticated;
grant all on public.live_session_segments to service_role;
alter table public.live_session_segments enable row level security;

drop policy if exists "live_session_segments_admin_all" on public.live_session_segments;
create policy "live_session_segments_admin_all" on public.live_session_segments
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Secrets: RLS on, zero policies, no table privileges for API roles.
alter table public.live_session_secrets enable row level security;
revoke all on public.live_session_secrets from anon, authenticated;
grant all on public.live_session_secrets to service_role;

grant select, insert, update, delete on public.live_session_files to authenticated;
grant all on public.live_session_files to service_role;
alter table public.live_session_files enable row level security;

drop policy if exists "live_session_files_admin_all" on public.live_session_files;
create policy "live_session_files_admin_all" on public.live_session_files
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "live_session_files_select_enrolled" on public.live_session_files;
create policy "live_session_files_select_enrolled" on public.live_session_files
  for select to authenticated
  using (exists (
    select 1 from public.live_sessions s
    where s.id = live_session_files.session_id
      and public.is_enrolled_in_course(auth.uid(), s.course_id)
  ));

grant select on public.live_session_attendance to authenticated;
grant all on public.live_session_attendance to service_role;
alter table public.live_session_attendance enable row level security;

drop policy if exists "live_session_attendance_admin_select" on public.live_session_attendance;
create policy "live_session_attendance_admin_select" on public.live_session_attendance
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "live_session_attendance_select_own" on public.live_session_attendance;
create policy "live_session_attendance_select_own" on public.live_session_attendance
  for select to authenticated
  using (user_id = auth.uid());

-- Notification log: RLS on, zero policies (written by SECURITY DEFINER function only).
alter table public.live_session_notification_log enable row level security;
revoke all on public.live_session_notification_log from anon, authenticated;
grant all on public.live_session_notification_log to service_role;

-- ---------------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_sessions'
  ) then
    alter publication supabase_realtime add table public.live_sessions;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 7. RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_live_session_state(_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_session public.live_sessions;
  v_is_admin boolean := public.has_role(auth.uid(), 'admin');
  v_files jsonb;
  v_segment_count int;
begin
  select * into v_session from public.live_sessions where id = _session_id;
  if v_session.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if not v_is_admin and not public.is_enrolled_in_course(auth.uid(), v_session.course_id) then
    raise exception 'NOT_ENROLLED';
  end if;

  select count(*) into v_segment_count
  from public.live_session_segments where session_id = _session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id,
           'file_name', f.file_name,
           'file_type', f.file_type,
           'file_size', f.file_size,
           'allow_download', f.allow_download,
           'storage_path', f.storage_path
         ) order by f.position, f.created_at), '[]'::jsonb)
    into v_files
  from public.live_session_files f
  where f.session_id = _session_id;

  return jsonb_build_object(
    'id', v_session.id,
    'course_id', v_session.course_id,
    'unit_id', v_session.unit_id,
    'title', v_session.title,
    'description', v_session.description,
    'status', v_session.status,
    'scheduled_start_at', v_session.scheduled_start_at,
    'duration_minutes', v_session.duration_minutes,
    'server_now', now(),
    'join_opens_at', v_session.scheduled_start_at,
    'host_start_opens_at', v_session.scheduled_start_at - interval '10 min',
    'can_join', (
      v_session.status in ('scheduled','live')
      and now() >= v_session.scheduled_start_at
      and now() <= v_session.scheduled_start_at + make_interval(mins => v_session.duration_minutes) + interval '120 min'
    ),
    'link_version', v_session.link_version,
    'segment_count', v_segment_count,
    'files', v_files
  );
end;
$$;
revoke all on function public.get_live_session_state(uuid) from public;
grant execute on function public.get_live_session_state(uuid) to authenticated;

create or replace function public.get_live_session_join(_session_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.live_sessions;
  v_is_admin boolean := public.has_role(auth.uid(), 'admin');
  v_segment public.live_session_segments;
  v_window_end timestamptz;
begin
  select * into v_session from public.live_sessions where id = _session_id;
  if v_session.id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if not v_is_admin and not public.is_enrolled_in_course(auth.uid(), v_session.course_id) then
    raise exception 'NOT_ENROLLED';
  end if;

  if v_session.status = 'cancelled' then
    raise exception 'SESSION_CANCELLED';
  end if;

  v_window_end := v_session.scheduled_start_at
    + make_interval(mins => v_session.duration_minutes) + interval '120 min';

  if v_session.status in ('ended','completed') or now() > v_window_end then
    raise exception 'SESSION_OVER';
  end if;

  if now() < v_session.scheduled_start_at then
    raise exception 'NOT_OPEN_YET';
  end if;

  if v_session.current_segment_id is null then
    raise exception 'NOT_OPEN_YET';
  end if;

  select * into v_segment
  from public.live_session_segments
  where id = v_session.current_segment_id;

  if v_segment.id is null then
    raise exception 'NOT_OPEN_YET';
  end if;

  -- Attendance is recorded for students only (admins host, they do not "attend").
  if not v_is_admin and auth.uid() is not null then
    insert into public.live_session_attendance as a (session_id, user_id, segment_id, join_count)
    values (_session_id, auth.uid(), v_segment.id, 1)
    on conflict (session_id, user_id, segment_id) do update
      set last_joined_at = now(),
          join_count = a.join_count + 1;
  end if;

  return jsonb_build_object(
    'join_url', v_segment.join_url,
    'password', v_segment.password,
    'segment_index', v_segment.segment_index,
    'link_version', v_session.link_version,
    'server_now', now()
  );
end;
$$;
revoke all on function public.get_live_session_join(uuid) from public;
grant execute on function public.get_live_session_join(uuid) to authenticated;

create or replace function public.student_upcoming_live_sessions(_from timestamptz, _to timestamptz)
returns table (
  id uuid, course_id uuid, course_title text, course_thumbnail_url text,
  title text, scheduled_start_at timestamptz, duration_minutes int, status text,
  link_version int, unit_id uuid
)
language sql stable security definer set search_path = public
as $$
  select s.id, s.course_id, c.title, c.thumbnail_url,
         s.title, s.scheduled_start_at, s.duration_minutes, s.status,
         s.link_version, s.unit_id
  from public.live_sessions s
  join public.courses c on c.id = s.course_id
  where public.is_enrolled_in_course(auth.uid(), s.course_id)
    and s.status <> 'cancelled'
    and (
      (s.scheduled_start_at between _from and _to)
      or s.status = 'live'
    )
  order by s.scheduled_start_at
  limit 50;
$$;
revoke all on function public.student_upcoming_live_sessions(timestamptz, timestamptz) from public;
grant execute on function public.student_upcoming_live_sessions(timestamptz, timestamptz) to authenticated;

create or replace function public.admin_upcoming_live_sessions(_from timestamptz, _to timestamptz)
returns table (
  id uuid, course_id uuid, course_title text, course_thumbnail_url text,
  title text, scheduled_start_at timestamptz, duration_minutes int, status text,
  link_version int, unit_id uuid, host_user_id uuid, host_name text
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select s.id, s.course_id, c.title, c.thumbnail_url,
         s.title, s.scheduled_start_at, s.duration_minutes, s.status,
         s.link_version, s.unit_id, s.host_user_id, p.full_name
  from public.live_sessions s
  join public.courses c on c.id = s.course_id
  left join public.profiles p on p.id = s.host_user_id
  where s.status <> 'cancelled'
    and (
      (s.scheduled_start_at between _from and _to)
      or s.status = 'live'
    )
  order by s.scheduled_start_at
  limit 50;
end;
$$;
revoke all on function public.admin_upcoming_live_sessions(timestamptz, timestamptz) from public;
grant execute on function public.admin_upcoming_live_sessions(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Reminders (pg_cron, every minute)
-- ---------------------------------------------------------------------------
create or replace function public.live_session_dispatch_reminders()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_session record;
  v_kind text;
  v_inserted int;
begin
  for v_session in
    select s.*, c.title as course_title
    from public.live_sessions s
    join public.courses c on c.id = s.course_id
    where s.status = 'scheduled'
      and (
        (now() between s.scheduled_start_at - interval '60 min' and s.scheduled_start_at - interval '55 min')
        or (now() between s.scheduled_start_at - interval '10 min' and s.scheduled_start_at - interval '5 min')
      )
  loop
    v_kind := case
      when now() between v_session.scheduled_start_at - interval '60 min'
                       and v_session.scheduled_start_at - interval '55 min'
        then 'reminder_60'
      else 'reminder_10'
    end;

    insert into public.live_session_notification_log (session_id, kind)
    values (v_session.id, v_kind)
    on conflict (session_id, kind) do nothing;

    get diagnostics v_inserted = row_count;

    if v_inserted > 0 then
      insert into public.notifications (user_id, type, title, body, template_data, action_url,
                                       related_entity_type, related_entity_id)
      select e.user_id,
             'live_session_' || v_kind,
             case when v_kind = 'reminder_60'
                  then 'تذكير: جلستك المباشرة بعد ساعة'
                  else 'تذكير: جلستك المباشرة بعد 10 دقائق' end,
             v_session.title || ' — ' || v_session.course_title,
             jsonb_build_object('session_id', v_session.id, 'course_id', v_session.course_id,
                                'start_at', v_session.scheduled_start_at),
             '/courses/' || v_session.course_id || '/learn/live_session/' || v_session.id,
             'live_session',
             v_session.id
      from public.enrollments e
      where e.course_id = v_session.course_id;

      if v_kind = 'reminder_10' then
        insert into public.notifications (user_id, type, title, body, template_data, action_url,
                                         related_entity_type, related_entity_id)
        values (v_session.host_user_id,
                'live_session_reminder_10',
                'جلستك المباشرة تبدأ خلال 10 دقائق',
                v_session.title || ' — ' || v_session.course_title,
                jsonb_build_object('session_id', v_session.id, 'course_id', v_session.course_id,
                                   'start_at', v_session.scheduled_start_at),
                '/admin/courses/' || v_session.course_id || '/builder',
                'live_session',
                v_session.id);
      end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.live_session_dispatch_reminders() from public;
grant execute on function public.live_session_dispatch_reminders() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'live_session_reminders') then
      perform cron.unschedule('live_session_reminders');
    end if;
    perform cron.schedule('live_session_reminders', '* * * * *',
      'select public.live_session_dispatch_reminders();');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Notification channels (WhatsApp disabled by default for the new types)
-- ---------------------------------------------------------------------------
insert into public.notification_type_channels (notification_type, whatsapp_enabled) values
  ('live_session_scheduled', false),
  ('live_session_reminder_60', false),
  ('live_session_reminder_10', false),
  ('live_session_started', false),
  ('live_session_link_replaced', false),
  ('live_session_cancelled', false),
  ('live_recording_ready', false)
on conflict (notification_type) do nothing;
