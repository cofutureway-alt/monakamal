-- MCP security primitives: configuration, hashed credentials, scoped access, audit trail.
-- Existing migrations use public.has_role(auth.uid(), 'admin') for administrator checks.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.mcp_settings (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_.-]{0,63}$'),
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.mcp_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 128),
  key_prefix text NOT NULL CHECK (key_prefix ~ '^mcp_[A-Za-z0-9]{4,16}$'),
  key_hash text NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(permissions) = 'object'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE TABLE public.mcp_audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  api_key_id uuid REFERENCES public.mcp_api_keys(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.:-]{1,127}$'),
  resource text,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mcp_api_keys_active_idx ON public.mcp_api_keys (key_prefix) WHERE revoked_at IS NULL;
CREATE INDEX mcp_audit_logs_created_idx ON public.mcp_audit_logs (created_at DESC);
CREATE INDEX mcp_audit_logs_actor_idx ON public.mcp_audit_logs (actor_id, created_at DESC);

ALTER TABLE public.mcp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_api_keys TO authenticated;
GRANT SELECT ON public.mcp_audit_logs TO authenticated;
GRANT ALL ON public.mcp_settings, public.mcp_api_keys, public.mcp_audit_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.mcp_audit_logs_id_seq TO service_role;

CREATE POLICY mcp_settings_admin_all ON public.mcp_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY mcp_api_keys_admin_all ON public.mcp_api_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY mcp_audit_logs_admin_read ON public.mcp_audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.mcp_verify_api_key(_key text)
RETURNS TABLE (api_key_id uuid, permissions jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT id, permissions
  FROM public.mcp_api_keys
  WHERE key_hash = encode(digest(_key, 'sha256'), 'hex')
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.mcp_verify_api_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_verify_api_key(text) TO service_role;

CREATE OR REPLACE FUNCTION public.mcp_touch_api_key(_api_key_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.mcp_api_keys SET last_used_at = now()
  WHERE id = _api_key_id AND revoked_at IS NULL;
$$;
REVOKE ALL ON FUNCTION public.mcp_touch_api_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_touch_api_key(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mcp_write_audit(
  _action text, _resource text DEFAULT NULL, _resource_id text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb, _api_key_id uuid DEFAULT NULL
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF jsonb_typeof(_metadata) <> 'object' THEN RAISE EXCEPTION 'metadata must be a JSON object'; END IF;
  INSERT INTO public.mcp_audit_logs(actor_id, api_key_id, action, resource, resource_id, metadata)
  VALUES (auth.uid(), _api_key_id, _action, _resource, _resource_id, _metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.mcp_write_audit(text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_write_audit(text, text, text, jsonb, uuid) TO service_role;

COMMENT ON TABLE public.mcp_api_keys IS 'Only SHA-256 hashes are stored; plaintext keys are never persisted.';
COMMENT ON COLUMN public.mcp_api_keys.permissions IS 'Granular MCP scopes, e.g. {"tools": ["read:lessons"]}.';
COMMENT ON TABLE public.mcp_audit_logs IS 'Append-only audit records; writes go through mcp_write_audit for service_role.';

CREATE OR REPLACE FUNCTION public.mcp_create_api_key(p_name text, p_secret text, p_permissions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_id uuid; v_prefix text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF length(trim(p_name)) NOT BETWEEN 1 AND 128 OR length(p_secret) < 32 THEN RAISE EXCEPTION 'invalid_key'; END IF;
  IF jsonb_typeof(p_permissions) <> 'object' THEN RAISE EXCEPTION 'invalid_permissions'; END IF;
  v_prefix := left(p_secret, 12);
  INSERT INTO public.mcp_api_keys(name, key_prefix, key_hash, permissions, created_by)
  VALUES (trim(p_name), v_prefix, encode(digest(p_secret, 'sha256'), 'hex'), p_permissions, auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'secret', p_secret, 'key_prefix', v_prefix);
END; $$;
REVOKE ALL ON FUNCTION public.mcp_create_api_key(text,text,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_create_api_key(text,text,jsonb) TO authenticated;

-- No deployment performed.
