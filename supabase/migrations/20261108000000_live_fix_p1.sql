-- Phase 1 review fixes that need SQL (F7, F9-trigger).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- F7: apply_course_auto_enrollment must not be a free-for-all.
-- Triggers and cron call it with no auth context (auth.uid() is null); admins
-- may call it explicitly. Everyone else is refused.
-- ---------------------------------------------------------------------------
create or replace function public.apply_course_auto_enrollment(_course_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_course public.courses;
  v_mode text;
  v_inserted int := 0;
begin
  if auth.uid() is not null and not public.has_role(auth.uid(), 'admin') then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_course from public.courses where id = _course_id;
  if v_course.id is null then
    return 0;
  end if;

  v_mode := v_course.enrollment_mode;
  if v_course.status <> 'published' or coalesce(v_course.is_paid, false) or v_mode = 'standard' then
    return 0;
  end if;

  insert into public.enrollments (user_id, course_id)
  select p.id, _course_id
  from public.profiles p
  where p.role = 'student'
    and coalesce(p.is_banned, false) = false
    and (
      v_mode = 'auto_all_students'
      or (v_mode = 'auto_stages' and p.stage_id = any (v_course.stage_ids))
    )
  on conflict (user_id, course_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function public.apply_course_auto_enrollment(uuid) from public;
grant execute on function public.apply_course_auto_enrollment(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- F9: the profile trigger must not enrol banned students.
-- ---------------------------------------------------------------------------
create or replace function public.tg_profiles_auto_enroll()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_course record;
begin
  if new.role <> 'student' or coalesce(new.is_banned, false) then
    return new;
  end if;

  for v_course in
    select c.id, c.enrollment_mode, c.stage_ids
    from public.courses c
    where c.status = 'published'
      and coalesce(c.is_paid, false) = false
      and (
        c.enrollment_mode = 'auto_all_students'
        or (c.enrollment_mode = 'auto_stages' and new.stage_id = any (c.stage_ids))
      )
  loop
    insert into public.enrollments (user_id, course_id)
    values (new.id, v_course.id)
    on conflict (user_id, course_id) do nothing;
  end loop;

  return new;
end;
$$;
revoke all on function public.tg_profiles_auto_enroll() from public;
