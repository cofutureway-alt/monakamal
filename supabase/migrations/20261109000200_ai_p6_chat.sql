-- Phase 6 / Admin AI Control Center: conversations, messages, resolved entities
-- (server-side anti-hallucination guard) and pending actions (human-confirmed
-- writes). All inserts happen in edge functions with the service role.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin','student','parent','guest')),
  title text,
  summary text,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- Every UUID a read tool returned in this conversation. Write tools may only
-- reference ids in this set (ENTITY_NOT_RESOLVED otherwise).
create table if not exists public.ai_conversation_entities (
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  entity_id uuid not null,
  entity_type text not null,
  created_at timestamptz not null default now(),
  primary key (conversation_id, entity_id)
);

create table if not exists public.ai_pending_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  tool text not null,
  args jsonb not null,
  preview jsonb not null,
  destructive boolean not null default false,
  confirm_phrase text,
  status text not null default 'pending'
    check (status in ('pending','confirmed','executed','failed','cancelled','expired')),
  expires_at timestamptz not null default now() + interval '15 minutes',
  executed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_pending_actions_conversation_idx on public.ai_pending_actions (conversation_id);

drop trigger if exists ai_conversations_set_updated_at on public.ai_conversations;
create trigger ai_conversations_set_updated_at before update on public.ai_conversations
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS: owners read their own rows; owners may only rename / pin / archive.
-- ---------------------------------------------------------------------------
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_conversation_entities enable row level security;
alter table public.ai_pending_actions enable row level security;

revoke all on public.ai_conversations, public.ai_messages, public.ai_conversation_entities,
  public.ai_pending_actions from anon, authenticated;
grant select on public.ai_conversations, public.ai_messages, public.ai_pending_actions to authenticated;
grant update (title, pinned, archived) on public.ai_conversations to authenticated;
grant all on public.ai_conversations, public.ai_messages, public.ai_conversation_entities,
  public.ai_pending_actions to service_role;

drop policy if exists "ai_conversations_owner_select" on public.ai_conversations;
create policy "ai_conversations_owner_select" on public.ai_conversations
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "ai_conversations_owner_update" on public.ai_conversations;
create policy "ai_conversations_owner_update" on public.ai_conversations
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "ai_messages_owner_select" on public.ai_messages;
create policy "ai_messages_owner_select" on public.ai_messages
  for select to authenticated using (exists (
    select 1 from public.ai_conversations c
    where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
  ));

drop policy if exists "ai_pending_actions_owner_select" on public.ai_pending_actions;
create policy "ai_pending_actions_owner_select" on public.ai_pending_actions
  for select to authenticated using (created_by = auth.uid());

-- Expire stale proposals (cheap; called by ai-actions before reading a row too).
create or replace function public.ai_expire_pending_actions()
returns int
language sql security definer set search_path = public
as $$
  with x as (
    update public.ai_pending_actions
    set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning 1
  )
  select count(*)::int from x;
$$;
revoke all on function public.ai_expire_pending_actions() from public, anon, authenticated;
grant execute on function public.ai_expire_pending_actions() to service_role;
