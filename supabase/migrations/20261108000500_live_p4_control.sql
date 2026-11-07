-- Phase 4 / host controls: start, replace link, end + calendar range RPCs.

-- ---------------------------------------------------------------------------
-- Calendar ranges. Both are capped at 62 days so a bad client cannot ask for
-- a decade of rows.
-- ---------------------------------------------------------------------------
create or replace function public.admin_live_sessions_range(
  _from timestamptz,
  _to timestamptz,
  _course uuid default null,
  _host uuid default null,
  _status text default null
)
returns table (
  id uuid, course_id uuid, course_title text, course_thumbnail_url text,
  title text, scheduled_start_at timestamptz, duration_minutes int, status text,
  link_version int, unit_id uuid, host_user_id uuid, host_name text,
  segment_count int, attendee_count int
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'FORBIDDEN';
  end if;
  if _to - _from > interval '62 days' then
    raise exception 'RANGE_TOO_LARGE';
  end if;

  return query
  select s.id, s.course_id, c.title, c.thumbnail_url,
         s.title, s.scheduled_start_at, s.duration_minutes, s.status,
         s.link_version, s.unit_id, s.host_user_id, p.full_name,
         (select count(*)::int from public.live_session_segments seg where seg.session_id = s.id),
         (select count(distinct a.user_id)::int from public.live_session_attendance a where a.session_id = s.id)
  from public.live_sessions s
  join public.courses c on c.id = s.course_id
  left join public.profiles p on p.id = s.host_user_id
  where s.scheduled_start_at >= _from
    and s.scheduled_start_at <= _to
    and (_course is null or s.course_id = _course)
    and (_host is null or s.host_user_id = _host)
    and (_status is null or s.status = _status)
  order by s.scheduled_start_at;
end;
$$;
revoke all on function public.admin_live_sessions_range(timestamptz, timestamptz, uuid, uuid, text) from public;
grant execute on function public.admin_live_sessions_range(timestamptz, timestamptz, uuid, uuid, text) to authenticated;

create or replace function public.student_live_sessions_range(_from timestamptz, _to timestamptz)
returns table (
  id uuid, course_id uuid, course_title text, course_thumbnail_url text,
  title text, scheduled_start_at timestamptz, duration_minutes int, status text,
  link_version int, unit_id uuid
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if _to - _from > interval '62 days' then
    raise exception 'RANGE_TOO_LARGE';
  end if;

  return query
  select s.id, s.course_id, c.title, c.thumbnail_url,
         s.title, s.scheduled_start_at, s.duration_minutes, s.status,
         s.link_version, s.unit_id
  from public.live_sessions s
  join public.courses c on c.id = s.course_id
  where public.is_enrolled_in_course(auth.uid(), s.course_id)
    and s.scheduled_start_at >= _from
    and s.scheduled_start_at <= _to
  order by s.scheduled_start_at;
end;
$$;
revoke all on function public.student_live_sessions_range(timestamptz, timestamptz) from public;
grant execute on function public.student_live_sessions_range(timestamptz, timestamptz) to authenticated;
