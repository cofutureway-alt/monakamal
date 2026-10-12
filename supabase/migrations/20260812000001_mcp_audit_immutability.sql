CREATE OR REPLACE FUNCTION public.mcp_prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'mcp_audit_logs is append-only' USING ERRCODE = '42501';
END; $$;
DROP TRIGGER IF EXISTS mcp_audit_immutable ON public.mcp_audit_logs;
CREATE TRIGGER mcp_audit_immutable
  BEFORE UPDATE OR DELETE ON public.mcp_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.mcp_prevent_audit_mutation();
REVOKE ALL ON FUNCTION public.mcp_prevent_audit_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_prevent_audit_mutation() TO service_role;
