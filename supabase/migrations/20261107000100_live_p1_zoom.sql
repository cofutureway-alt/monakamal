-- Phase 1 / Zoom OAuth: one Zoom account per admin user.
-- Tokens live in a separate table with RLS enabled and NO policies (service role only).

create table if not exists public.zoom_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  zoom_user_id text not null,
  zoom_email text,
  zoom_display_name text,
  zoom_account_type int,                 -- 1 = Basic, 2 = Licensed, others as returned by Zoom
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','revoked')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.zoom_connection_secrets (
  user_id uuid primary key references public.zoom_connections(user_id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

grant select on public.zoom_connections to authenticated;
grant all on public.zoom_connections to service_role;

alter table public.zoom_connections enable row level security;

drop policy if exists "zoom_connections_select_own_or_admin" on public.zoom_connections;
create policy "zoom_connections_select_own_or_admin" on public.zoom_connections
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- No insert/update/delete policies: only the service role (edge functions) writes here.

-- Secrets table: RLS on, zero policies. Revoke table privileges from the API roles as well.
alter table public.zoom_connection_secrets enable row level security;
revoke all on public.zoom_connection_secrets from anon, authenticated;
grant all on public.zoom_connection_secrets to service_role;
