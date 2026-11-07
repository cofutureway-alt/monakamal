-- Phase 2 / automatic enrollment for free live courses.
-- NOTE: switching a course away from an auto mode does NOT delete enrollments that
-- were already created — students keep the course they were given (roadmap §1.6).

create or replace function public.apply_course_auto_enrollment(_course_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_course public.courses;
  v_inserted int := 0;
begin
  select * into v_course from public.courses where id = _course_id;
  if v_course.id is null then
    return 0;
  end if;

  -- Only published, free courses may auto-enroll.
  if v_course.status <> 'published'
     or coalesce(v_course.is_paid, false) = true
     or v_course.enrollment_mode = 'standard' then
    return 0;
  end if;

  if v_course.enrollment_mode = 'auto_all_students' then
    with ins as (
      insert into public.enrollments (user_id, course_id)
      select p.id, v_course.id
      from public.profiles p
      where p.role = 'student'
        and coalesce(p.is_banned, false) = false
      on conflict (user_id, course_id) do nothing
      returning 1
    )
    select count(*) into v_inserted from ins;
  elsif v_course.enrollment_mode = 'auto_stages' then
    with ins as (
      insert into public.enrollments (user_id, course_id)
      select p.id, v_course.id
      from public.profiles p
      where p.role = 'student'
        and coalesce(p.is_banned, false) = false
        and p.stage_id = any (coalesce(v_course.stage_ids, '{}'::uuid[]))
      on conflict (user_id, course_id) do nothing
      returning 1
    )
    select count(*) into v_inserted from ins;
  end if;

  return v_inserted;
end;
$$;
revoke all on function public.apply_course_auto_enrollment(uuid) from public;
grant execute on function public.apply_course_auto_enrollment(uuid) to authenticated, service_role;

-- Enroll matching students when a course becomes publishable/auto.
create or replace function public.tg_courses_auto_enroll()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.apply_course_auto_enrollment(new.id);
  return new;
end;
$$;

drop trigger if exists courses_auto_enroll_trg on public.courses;
create trigger courses_auto_enroll_trg
  after insert or update of enrollment_mode, stage_ids, is_paid, status on public.courses
  for each row execute function public.tg_courses_auto_enroll();

-- Enroll a newly created / re-graded student into all matching published auto courses.
create or replace function public.tg_profiles_auto_enroll()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_course record;
begin
  if new.role <> 'student' then
    return new;
  end if;

  for v_course in
    select c.id
    from public.courses c
    where c.status = 'published'
      and coalesce(c.is_paid, false) = false
      and (
        c.enrollment_mode = 'auto_all_students'
        or (c.enrollment_mode = 'auto_stages'
            and new.stage_id = any (coalesce(c.stage_ids, '{}'::uuid[])))
      )
  loop
    insert into public.enrollments (user_id, course_id)
    values (new.id, v_course.id)
    on conflict (user_id, course_id) do nothing;
  end loop;

  return new;
end;
$$;

drop trigger if exists profiles_auto_enroll_trg on public.profiles;
create trigger profiles_auto_enroll_trg
  after insert or update of stage_id, role on public.profiles
  for each row execute function public.tg_profiles_auto_enroll();

-- ---------------------------------------------------------------------------
-- Storage: admins may upload live session files under live/{session_id}/
-- The `lesson-files` bucket is public, so reads happen by public URL (see handover).
-- ---------------------------------------------------------------------------
drop policy if exists "live_session_files_admin_upload" on storage.objects;
create policy "live_session_files_admin_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'lesson-files'
    and name like 'live/%'
    and public.has_role(auth.uid(), 'admin')
  );

drop policy if exists "live_session_files_admin_delete" on storage.objects;
create policy "live_session_files_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'lesson-files'
    and name like 'live/%'
    and public.has_role(auth.uid(), 'admin')
  );
