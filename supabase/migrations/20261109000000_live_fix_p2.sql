-- Phase-2 review fixes G2, G4, G8 (docs/handover/PHASE-02-REVIEW.md).

-- G2: recording-part lessons (video_provider = 'r2') are announced once by
-- live_session_finalize ('live_recording_ready'); skip the generic per-lesson
-- notification (and its WhatsApp fan-out) for them.
CREATE OR REPLACE FUNCTION public.trg_notify_enrolled_new_lesson()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_course_title text;
  v_student_id uuid;
BEGIN
  IF NEW.video_provider::text = 'r2' THEN
    RETURN NEW;
  END IF;

  SELECT u.course_id, c.title INTO v_course_id, v_course_title
  FROM public.units u
  JOIN public.courses c ON c.id = u.course_id
  WHERE u.id = NEW.unit_id;

  IF v_course_id IS NOT NULL THEN
    FOR v_student_id IN
      SELECT user_id FROM public.enrollments WHERE course_id = v_course_id
    LOOP
      PERFORM public.create_notification(
        v_student_id,
        'lesson_added',
        'درس جديد في دورة ' || COALESCE(v_course_title, ''),
        'تم إضافة درس جديد: ' || NEW.title || '.',
        jsonb_build_object('course_id', v_course_id, 'lesson_id', NEW.id),
        '/courses/' || v_course_id,
        'lesson',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- G4 + G8: live_session_finalize with a session row lock and full unit re-ordering.
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
  -- G4: serialize concurrent finalize calls for the same session (overlapping
  -- ingest ticks). The row lock is held until the calling transaction ends.
  perform 1 from public.live_sessions where id = _session_id for update;
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

      -- G8: quizzes and assignments share the unit ordering (order_index).
      update public.quizzes
      set order_index = order_index + v_shift
      where unit_id = v_unit_id
        and order_index > v_session.position;

      update public.assignments
      set order_index = order_index + v_shift
      where unit_id = v_unit_id
        and order_index > v_session.position;
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
