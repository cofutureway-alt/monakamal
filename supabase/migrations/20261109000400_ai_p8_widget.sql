-- Phase 8 / storefront + student + parent chat widget.

-- Guests have no profile: conversations are keyed by an anonymous id instead.
alter table public.ai_conversations alter column user_id drop not null;
alter table public.ai_conversations add column if not exists guest_key text;
alter table public.ai_conversations drop constraint if exists ai_conversations_owner_chk;
alter table public.ai_conversations add constraint ai_conversations_owner_chk
  check (user_id is not null or guest_key is not null);
create index if not exists ai_conversations_guest_idx on public.ai_conversations (guest_key, updated_at desc)
  where guest_key is not null;

-- What the public widget needs to know before rendering (no secrets).
create or replace function public.ai_public_config()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'chatbot_enabled', coalesce(s.chatbot_enabled, false) and s.active_provider_id is not null
  )
  from public.ai_settings s where s.id = 1;
$$;
revoke all on function public.ai_public_config() from public;
grant execute on function public.ai_public_config() to anon, authenticated;

-- Guest conversations are kept 7 days.
create or replace function public.ai_purge_guest_conversations()
returns int
language sql security definer set search_path = public
as $$
  with d as (
    delete from public.ai_conversations
    where user_id is null and updated_at < now() - interval '7 days'
    returning 1
  )
  select count(*)::int from d;
$$;
revoke all on function public.ai_purge_guest_conversations() from public, anon, authenticated;
grant execute on function public.ai_purge_guest_conversations() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'ai_purge_guest_conversations') then
      perform cron.unschedule('ai_purge_guest_conversations');
    end if;
    perform cron.schedule('ai_purge_guest_conversations', '23 3 * * *',
      'select public.ai_purge_guest_conversations();');
  end if;
end $$;
