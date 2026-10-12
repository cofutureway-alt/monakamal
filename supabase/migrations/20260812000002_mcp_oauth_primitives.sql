CREATE TABLE public.mcp_oauth_clients (
  client_id text PRIMARY KEY CHECK (length(client_id) BETWEEN 16 AND 128),
  client_name text NOT NULL CHECK (length(trim(client_name)) BETWEEN 1 AND 128),
  redirect_uris text[] NOT NULL CHECK (cardinality(redirect_uris) BETWEEN 1 AND 10),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.mcp_oauth_codes (
  code_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text NOT NULL DEFAULT '',
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE public.mcp_oauth_tokens (
  token_hash text PRIMARY KEY,
  client_id text NOT NULL REFERENCES public.mcp_oauth_clients(client_id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
ALTER TABLE public.mcp_oauth_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY mcp_oauth_clients_admin ON public.mcp_oauth_clients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
GRANT ALL ON public.mcp_oauth_clients, public.mcp_oauth_codes, public.mcp_oauth_tokens TO service_role;
CREATE INDEX mcp_oauth_codes_expiry ON public.mcp_oauth_codes(expires_at);
CREATE INDEX mcp_oauth_tokens_expiry ON public.mcp_oauth_tokens(expires_at);
