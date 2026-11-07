-- Phase 5 / AI gateway core: settings, providers (+ write-only keys), plans,
-- subscription, usage events and the platform quota function.
-- Every write to settings/providers goes through the `ai-admin` edge function
-- (service role) so it can be validated and audited; clients only read.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  api_format text not null check (api_format in ('openai_compatible','anthropic')),
  base_url text not null check (base_url ~ '^https://'),
  model_id text not null check (char_length(model_id) between 1 and 200),
  temperature numeric not null default 0.2 check (temperature between 0 and 2),
  max_output_tokens int not null default 2048 check (max_output_tokens between 64 and 32000),
  supports_tools boolean,                    -- null = never tested
  key_last4 text,
  last_test_at timestamptz,
  last_test_result jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_provider_secrets (
  provider_id uuid primary key references public.ai_providers(id) on delete cascade,
  api_key text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_settings (
  id int primary key default 1 check (id = 1),
  chatbot_enabled boolean not null default false,
  admin_chat_enabled boolean not null default true,
  grading_enabled boolean not null default false,
  grading_mode text not null default 'suggest' check (grading_mode in ('suggest','auto_apply')),
  student_limit_per_hour int not null default 10 check (student_limit_per_hour between 0 and 1000),
  student_limit_per_day int not null default 30 check (student_limit_per_day between 0 and 10000),
  guest_limit_per_hour int not null default 3 check (guest_limit_per_hour between 0 and 1000),
  guest_limit_per_day int not null default 10 check (guest_limit_per_day between 0 and 10000),
  count_admin_usage boolean not null default false,
  active_provider_id uuid references public.ai_providers(id) on delete set null,
  grading_provider_id uuid references public.ai_providers(id) on delete set null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.ai_plans (
  id text primary key check (id in ('base','tier2','tier3')),
  name_ar text not null,
  price_usd_cents int not null,
  per_hour int not null,
  per_day int not null,
  per_month int not null,
  sort int not null
);
insert into public.ai_plans (id, name_ar, price_usd_cents, per_hour, per_day, per_month, sort) values
  ('base',  'الباقة الأساسية',   2000,  50, 300,  700, 1),
  ('tier2', 'الباقة المتقدمة',   3000,  75, 450, 1050, 2),
  ('tier3', 'الباقة الاحترافية', 5000, 125, 750, 1750, 3)
on conflict (id) do update set
  name_ar = excluded.name_ar, price_usd_cents = excluded.price_usd_cents,
  per_hour = excluded.per_hour, per_day = excluded.per_day,
  per_month = excluded.per_month, sort = excluded.sort;

create table if not exists public.ai_subscription (
  id int primary key default 1 check (id = 1),
  plan_id text not null default 'base' references public.ai_plans(id),
  -- 1 December 2027 00:00 Africa/Cairo (UTC+2 in winter)
  renews_at timestamptz not null default '2027-11-30 22:00:00+00',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.ai_subscription (id) values (1) on conflict (id) do nothing;

create table if not exists public.ai_plan_change_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  from_plan text not null references public.ai_plans(id),
  to_plan text not null references public.ai_plans(id),
  status text not null default 'pending' check (status in ('pending','applied','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id)
);

create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('admin','student','parent','guest','system')),
  actor_key text not null,                   -- user uuid, or sha256 hex for guests
  surface text not null check (surface in ('admin_chat','widget','grading','test')),
  conversation_id uuid,
  counted boolean not null,                  -- counts toward the platform plan
  tokens_in int,
  tokens_out int,
  provider_id uuid references public.ai_providers(id) on delete set null,
  latency_ms int,
  outcome text not null default 'pending'
);
create index if not exists ai_usage_events_time_idx on public.ai_usage_events (occurred_at);
create index if not exists ai_usage_events_actor_idx on public.ai_usage_events (actor_key, occurred_at);

-- updated_at triggers (shared helper from earlier migrations)
drop trigger if exists ai_providers_set_updated_at on public.ai_providers;
create trigger ai_providers_set_updated_at before update on public.ai_providers
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 2. RLS — admins read; nobody writes from the client (service role only)
-- ---------------------------------------------------------------------------
alter table public.ai_settings enable row level security;
alter table public.ai_providers enable row level security;
alter table public.ai_provider_secrets enable row level security;
alter table public.ai_plans enable row level security;
alter table public.ai_subscription enable row level security;
alter table public.ai_plan_change_requests enable row level security;
alter table public.ai_usage_events enable row level security;

grant select on public.ai_settings, public.ai_providers, public.ai_plans, public.ai_subscription,
  public.ai_plan_change_requests, public.ai_usage_events to authenticated;
grant all on public.ai_settings, public.ai_providers, public.ai_provider_secrets, public.ai_plans,
  public.ai_subscription, public.ai_plan_change_requests, public.ai_usage_events to service_role;
revoke all on public.ai_provider_secrets from anon, authenticated;

drop policy if exists "ai_settings_admin_select" on public.ai_settings;
create policy "ai_settings_admin_select" on public.ai_settings
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ai_providers_admin_select" on public.ai_providers;
create policy "ai_providers_admin_select" on public.ai_providers
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ai_plans_select" on public.ai_plans;
create policy "ai_plans_select" on public.ai_plans
  for select to authenticated using (true);

drop policy if exists "ai_subscription_admin_select" on public.ai_subscription;
create policy "ai_subscription_admin_select" on public.ai_subscription
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ai_plan_change_requests_admin_select" on public.ai_plan_change_requests;
create policy "ai_plan_change_requests_admin_select" on public.ai_plan_change_requests
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "ai_usage_events_admin_select" on public.ai_usage_events;
create policy "ai_usage_events_admin_select" on public.ai_usage_events
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 3. Time windows (Africa/Cairo calendar hour / day / month)
-- ---------------------------------------------------------------------------
create or replace function public.ai_window_starts()
returns jsonb
language sql stable set search_path = public
as $$
  with b as (
    select
      (date_trunc('hour',  now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo') as hour_start,
      (date_trunc('day',   now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo') as day_start,
      (date_trunc('month', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo') as month_start,
      ((date_trunc('hour',  now() at time zone 'Africa/Cairo') + interval '1 hour')  at time zone 'Africa/Cairo') as next_hour,
      ((date_trunc('day',   now() at time zone 'Africa/Cairo') + interval '1 day')   at time zone 'Africa/Cairo') as next_day,
      ((date_trunc('month', now() at time zone 'Africa/Cairo') + interval '1 month') at time zone 'Africa/Cairo') as next_month
  )
  select jsonb_build_object(
    'hour_start', hour_start, 'day_start', day_start, 'month_start', month_start,
    'next_hour', next_hour, 'next_day', next_day, 'next_month', next_month
  ) from b;
$$;
revoke all on function public.ai_window_starts() from public;
grant execute on function public.ai_window_starts() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Usage snapshot for the admin dashboard
-- ---------------------------------------------------------------------------
create or replace function public.ai_usage_snapshot()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  w jsonb := public.ai_window_starts();
  v_plan public.ai_plans;
  v_sub public.ai_subscription;
  v_h int; v_d int; v_m int;
begin
  if not public.has_role(auth.uid(), 'admin') and auth.uid() is not null then
    raise exception 'FORBIDDEN';
  end if;
  select * into v_sub from public.ai_subscription where id = 1;
  select * into v_plan from public.ai_plans where id = v_sub.plan_id;

  select count(*) filter (where occurred_at >= (w->>'hour_start')::timestamptz),
         count(*) filter (where occurred_at >= (w->>'day_start')::timestamptz),
         count(*)
    into v_h, v_d, v_m
  from public.ai_usage_events
  where counted and occurred_at >= (w->>'month_start')::timestamptz;

  return jsonb_build_object(
    'plan', to_jsonb(v_plan),
    'renews_at', v_sub.renews_at,
    'expired', now() > v_sub.renews_at,
    'used', jsonb_build_object('hour', v_h, 'day', v_d, 'month', v_m),
    'limits', jsonb_build_object('hour', v_plan.per_hour, 'day', v_plan.per_day, 'month', v_plan.per_month),
    'resets', jsonb_build_object('hour', w->'next_hour', 'day', w->'next_day', 'month', w->'next_month'),
    'server_now', now()
  );
end;
$$;
revoke all on function public.ai_usage_snapshot() from public;
grant execute on function public.ai_usage_snapshot() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Quota: one user message = one unit. Service role only.
-- ---------------------------------------------------------------------------
create or replace function public.ai_consume_quota(
  _actor_type text, _actor_key text, _surface text, _conversation uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  w jsonb := public.ai_window_starts();
  v_settings public.ai_settings;
  v_sub public.ai_subscription;
  v_plan public.ai_plans;
  v_counted boolean;
  v_n int;
  v_limit_h int; v_limit_d int;
  v_event bigint;
begin
  if _actor_type not in ('admin','student','parent','guest','system') then
    raise exception 'BAD_ACTOR';
  end if;

  -- Serialize quota decisions so two requests cannot both take the last slot.
  perform pg_advisory_xact_lock(hashtext('ai_quota'));

  select * into v_settings from public.ai_settings where id = 1;
  select * into v_sub from public.ai_subscription where id = 1;
  select * into v_plan from public.ai_plans where id = v_sub.plan_id;

  v_counted := _actor_type in ('student','parent','guest')
               or (_actor_type = 'admin' and v_settings.count_admin_usage);

  if v_counted then
    if now() > v_sub.renews_at then
      return jsonb_build_object('allowed', false, 'reason', 'plan_expired', 'resets_at', null);
    end if;

    select count(*) into v_n from public.ai_usage_events
      where counted and occurred_at >= (w->>'hour_start')::timestamptz;
    if v_n >= v_plan.per_hour then
      return jsonb_build_object('allowed', false, 'reason', 'platform_hour', 'resets_at', w->'next_hour');
    end if;

    select count(*) into v_n from public.ai_usage_events
      where counted and occurred_at >= (w->>'day_start')::timestamptz;
    if v_n >= v_plan.per_day then
      return jsonb_build_object('allowed', false, 'reason', 'platform_day', 'resets_at', w->'next_day');
    end if;

    select count(*) into v_n from public.ai_usage_events
      where counted and occurred_at >= (w->>'month_start')::timestamptz;
    if v_n >= v_plan.per_month then
      return jsonb_build_object('allowed', false, 'reason', 'platform_month', 'resets_at', w->'next_month');
    end if;
  end if;

  -- Per-actor limits (admins and the system are not limited per actor).
  if _actor_type in ('student','parent','guest') then
    if _actor_type = 'guest' then
      v_limit_h := v_settings.guest_limit_per_hour;
      v_limit_d := v_settings.guest_limit_per_day;
    else
      v_limit_h := v_settings.student_limit_per_hour;
      v_limit_d := v_settings.student_limit_per_day;
    end if;

    select count(*) into v_n from public.ai_usage_events
      where actor_key = _actor_key and outcome <> 'error'
        and occurred_at >= (w->>'hour_start')::timestamptz;
    if v_n >= v_limit_h then
      return jsonb_build_object('allowed', false, 'reason', 'actor_hour', 'resets_at', w->'next_hour');
    end if;

    select count(*) into v_n from public.ai_usage_events
      where actor_key = _actor_key and outcome <> 'error'
        and occurred_at >= (w->>'day_start')::timestamptz;
    if v_n >= v_limit_d then
      return jsonb_build_object('allowed', false, 'reason', 'actor_day', 'resets_at', w->'next_day');
    end if;
  end if;

  insert into public.ai_usage_events (actor_type, actor_key, surface, conversation_id, counted, outcome)
  values (_actor_type, _actor_key, _surface, _conversation, v_counted and _actor_type <> 'system', 'pending')
  returning id into v_event;

  return jsonb_build_object('allowed', true, 'event_id', v_event, 'counted', v_counted);
end;
$$;
revoke all on function public.ai_consume_quota(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.ai_consume_quota(text, text, text, uuid) to service_role;

-- A failed model call must not burn quota: outcome 'error' refunds the unit.
create or replace function public.ai_finish_usage(
  _event_id bigint, _tokens_in int, _tokens_out int, _provider uuid, _latency int, _outcome text
)
returns void
language sql security definer set search_path = public
as $$
  update public.ai_usage_events
  set tokens_in = _tokens_in,
      tokens_out = _tokens_out,
      provider_id = _provider,
      latency_ms = _latency,
      outcome = coalesce(_outcome, 'ok'),
      counted = case when _outcome = 'error' then false else counted end
  where id = _event_id;
$$;
revoke all on function public.ai_finish_usage(bigint, int, int, uuid, int, text) from public, anon, authenticated;
grant execute on function public.ai_finish_usage(bigint, int, int, uuid, int, text) to service_role;

-- 30-day chart data, by Cairo day and actor type.
create or replace function public.ai_usage_daily(_days int default 30)
returns table (day date, actor_type text, count bigint)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'admin') and auth.uid() is not null then
    raise exception 'FORBIDDEN';
  end if;
  return query
    select (e.occurred_at at time zone 'Africa/Cairo')::date as day, e.actor_type, count(*)
    from public.ai_usage_events e
    where e.occurred_at >= now() - make_interval(days => least(greatest(_days, 1), 90))
      and e.surface <> 'test'
      and e.outcome <> 'error'
    group by 1, 2
    order by 1, 2;
end;
$$;
revoke all on function public.ai_usage_daily(int) from public;
grant execute on function public.ai_usage_daily(int) to authenticated, service_role;

-- Notification channel rows for the new types (WhatsApp off).
insert into public.notification_type_channels (notification_type, whatsapp_enabled) values
  ('ai_plan_change_requested', false)
on conflict (notification_type) do nothing;
