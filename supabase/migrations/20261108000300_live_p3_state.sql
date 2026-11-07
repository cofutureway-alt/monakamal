-- Phase 3/4 bridge: get_live_session_state must expose the recording parts, the
-- in-flight count, the no-recording reason and whether the caller already joined
-- (the "link replaced" dialog keys off that).

create or replace function public.get_live_session_state(_session_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_session public.live_sessions;
  v_is_admin boolean := public.has_role(auth.uid(), 'admin');
  v_files jsonb;
  v_recordings jsonb;
  v_segment_count int;
  v_processing int;
  v_joined boolean := false;
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

  -- Only published parts are exposed; nothing about R2 keys leaves the server.
  select coalesce(jsonb_agg(jsonb_build_object(
           'part_index', r.part_index,
           'lesson_id', r.lesson_id,
           'status', r.status,
           'duration_minutes',
             case
               when r.recording_start is not null and r.recording_end is not null
                 then greatest(1, round(extract(epoch from (r.recording_end - r.recording_start)) / 60))
               else null
             end
         ) order by r.part_index), '[]'::jsonb)
    into v_recordings
  from public.live_recordings r
  where r.session_id = _session_id
    and r.status = 'ready'
    and r.part_index is not null;

  select count(*) into v_processing
  from public.live_recordings
  where session_id = _session_id and status in ('pending', 'uploading');

  if auth.uid() is not null then
    select exists (
      select 1 from public.live_session_attendance
      where session_id = _session_id and user_id = auth.uid()
    ) into v_joined;
  end if;

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
    'files', v_files,
    'recordings', v_recordings,
    'processing_count', v_processing,
    'no_recording_reason', v_session.no_recording_reason,
    'i_joined', v_joined
  );
end;
$$;
revoke all on function public.get_live_session_state(uuid) from public;
grant execute on function public.get_live_session_state(uuid) to authenticated;
