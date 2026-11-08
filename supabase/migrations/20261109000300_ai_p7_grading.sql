-- Phase 7 / AI grading of open-ended answers.
--   * assignment submissions (written text)          → score 0..total_grade + feedback
--   * quiz attempts in 'needs_review' (fill_blank)    → correct / incorrect per answer
-- Jobs are queued by triggers only while ai_settings.grading_enabled is on and
-- processed by the `ai-grading-tick` edge function (pg_cron → pg_net, Vault).
-- grading_mode 'suggest' stores a suggestion the teacher can adopt in the UI;
-- 'auto_apply' writes the grade when the model is confident (>= 0.6).

create table if not exists public.ai_grading_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('assignment','quiz_attempt')),
  target_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending','processing','done','failed','skipped')),
  attempts int not null default 0,
  locked_until timestamptz,
  result jsonb,          -- assignment: {score,max,feedback_ar,rationale_ar,confidence}
                         -- quiz: {answers:[{question_id,is_correct,confidence,rationale_ar}]}
  mode text,             -- grading_mode at processing time
  applied boolean not null default false,
  applied_at timestamptz,
  error text,
  provider_id uuid references public.ai_providers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, target_id)
);
create index if not exists ai_grading_jobs_status_idx on public.ai_grading_jobs (status, created_at);

drop trigger if exists ai_grading_jobs_set_updated_at on public.ai_grading_jobs;
create trigger ai_grading_jobs_set_updated_at before update on public.ai_grading_jobs
  for each row execute function public.update_updated_at_column();

alter table public.ai_grading_jobs enable row level security;
revoke all on public.ai_grading_jobs from anon, authenticated;
grant select on public.ai_grading_jobs to authenticated;
grant all on public.ai_grading_jobs to service_role;

drop policy if exists "ai_grading_jobs_admin_select" on public.ai_grading_jobs;
create policy "ai_grading_jobs_admin_select" on public.ai_grading_jobs
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Enqueue triggers (no-ops while grading is disabled)
-- ---------------------------------------------------------------------------
create or replace function public.tg_ai_enqueue_assignment_grading()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'submitted'
     and (tg_op = 'INSERT' or old.status is distinct from 'submitted')
     and new.graded_at is null
     and exists (select 1 from public.ai_settings where id = 1 and grading_enabled) then
    insert into public.ai_grading_jobs (kind, target_id)
    values ('assignment', new.id)
    on conflict (kind, target_id) do update
      set status = 'pending', attempts = 0, locked_until = null, error = null,
          result = null, applied = false, applied_at = null
      where public.ai_grading_jobs.status in ('failed','skipped','done')
        and public.ai_grading_jobs.applied = false;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_enqueue_assignment_grading on public.assignment_submissions;
create trigger ai_enqueue_assignment_grading
  after insert or update of status on public.assignment_submissions
  for each row execute function public.tg_ai_enqueue_assignment_grading();

create or replace function public.tg_ai_enqueue_quiz_grading()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'needs_review'
     and (tg_op = 'INSERT' or old.status is distinct from 'needs_review')
     and exists (select 1 from public.ai_settings where id = 1 and grading_enabled) then
    insert into public.ai_grading_jobs (kind, target_id)
    values ('quiz_attempt', new.id)
    on conflict (kind, target_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ai_enqueue_quiz_grading on public.quiz_attempts;
create trigger ai_enqueue_quiz_grading
  after insert or update of status on public.quiz_attempts
  for each row execute function public.tg_ai_enqueue_quiz_grading();

-- ---------------------------------------------------------------------------
-- Worker lease (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.ai_grading_claim_next()
returns setof public.ai_grading_jobs
language sql security definer set search_path = public
as $$
  update public.ai_grading_jobs j
  set status = 'processing',
      attempts = j.attempts + 1,
      locked_until = now() + interval '3 minutes'
  where j.id = (
    select id from public.ai_grading_jobs
    where status in ('pending','processing')
      and (locked_until is null or locked_until < now())
      and attempts < 5
    order by created_at
    limit 1
    for update skip locked
  )
  returning j.*;
$$;
revoke all on function public.ai_grading_claim_next() from public, anon, authenticated;
grant execute on function public.ai_grading_claim_next() to service_role;

-- ---------------------------------------------------------------------------
-- System version of admin_save_grading (same rules, no caller check) used for
-- auto-apply. Service role only; admin_save_grading itself is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.ai_apply_quiz_grading(_attempt_id uuid, _updates jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  a record;
  quiz record;
  upd jsonb;
  q_id uuid;
  new_correct boolean;
  q_points numeric;
  earned numeric;
  pct numeric;
  has_ungraded_fb boolean;
begin
  select * into a from public.quiz_attempts where id = _attempt_id for update;
  if a is null then raise exception 'attempt not found'; end if;
  select * into quiz from public.quizzes where id = a.quiz_id;

  for upd in select * from jsonb_array_elements(coalesce(_updates, '[]'::jsonb))
  loop
    q_id := (upd->>'question_id')::uuid;
    -- Only touch fill_blank answers that are still ungraded.
    if not exists (
      select 1 from public.quiz_answers ans
      join public.quiz_questions q on q.id = ans.question_id
      where ans.attempt_id = _attempt_id and ans.question_id = q_id
        and q.type = 'fill_blank' and ans.is_correct is null
    ) then
      continue;
    end if;
    new_correct := (upd->>'is_correct')::boolean;
    select points into q_points from public.quiz_questions where id = q_id;
    update public.quiz_answers
       set is_correct = new_correct,
           points_earned = case when new_correct is true then coalesce(q_points, 0) else 0 end
     where attempt_id = _attempt_id and question_id = q_id;
  end loop;

  select coalesce(sum(points_earned), 0) into earned
    from public.quiz_answers where attempt_id = _attempt_id;

  select exists (
    select 1 from public.quiz_answers ans
    join public.quiz_questions q on q.id = ans.question_id
    where ans.attempt_id = _attempt_id and q.type = 'fill_blank' and ans.is_correct is null
  ) into has_ungraded_fb;

  if has_ungraded_fb then
    update public.quiz_attempts set status = 'needs_review', earned_points = earned where id = _attempt_id;
  else
    pct := case when a.total_points > 0 then round((earned / a.total_points) * 100) else 0 end;
    update public.quiz_attempts
      set status = 'graded',
          earned_points = earned,
          percentage = pct,
          passed = pct >= quiz.pass_percentage,
          submitted_at = coalesce(submitted_at, now())
      where id = _attempt_id;
  end if;

  return (select to_jsonb(x) from public.quiz_attempts x where x.id = _attempt_id);
end;
$$;
revoke all on function public.ai_apply_quiz_grading(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_apply_quiz_grading(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Cron: ping the worker once a minute, only when there is work.
-- ---------------------------------------------------------------------------
create or replace function public.ai_grading_tick()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_base text;
  v_secret text;
begin
  if not exists (
    select 1 from public.ai_grading_jobs
    where status in ('pending','processing') and attempts < 5
      and (locked_until is null or locked_until < now())
  ) then
    return;
  end if;
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'live_functions_base_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'live_cron_secret' limit 1;
  if v_base is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_base || '/ai-grading-tick',
    headers := jsonb_build_object('x-cron-secret', v_secret, 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 1000
  );
end;
$$;
revoke all on function public.ai_grading_tick() from public;
grant execute on function public.ai_grading_tick() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'ai_grading_tick') then
      perform cron.unschedule('ai_grading_tick');
    end if;
    perform cron.schedule('ai_grading_tick', '* * * * *', 'select public.ai_grading_tick();');
  end if;
end $$;

insert into public.notification_type_channels (notification_type, whatsapp_enabled) values
  ('ai_grading_suggestion_ready', false)
on conflict (notification_type) do nothing;
