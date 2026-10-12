// OAuth 2.1 Authorization Code + PKCE (S256) for the MCP gateway.
// Self-authenticating: verify_jwt = false in supabase/config.toml.
// Scope allowlist is mirrored from src/lib/mcp-oauth-scope.ts — keep in sync.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_SCOPES = new Set([
  "read:users", "read:courses", "read:bundles", "read:lessons", "read:quizzes", "read:orders", "read:settings",
  "create:*", "update:*", "delete:*",
]);
const CODE_TTL_S = 600;
const TOKEN_TTL_S = 3600;

const url = Deno.env.get("SUPABASE_URL")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
const oauthError = (error: string, status = 400) => json({ error }, status);
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(48)));
async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const sha256B64url = async (input: string) =>
  b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))));

const parseValidScopes = (csv: string): string[] | null => {
  const scopes = [...new Set(csv.split(",").map((s) => s.trim()).filter(Boolean))];
  return scopes.length > 0 && scopes.every((s) => VALID_SCOPES.has(s)) ? scopes : null;
};

async function requireAdmin(req: Request): Promise<string | null> {
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data } = await user.auth.getUser();
  if (!data.user) return null;
  const { data: profile } = await service.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
  return profile?.role === "admin" ? data.user.id : null;
}

async function authorize(req: Request) {
  const adminUserId = await requireAdmin(req);
  if (!adminUserId) return oauthError("access_denied", 401);
  const body = await req.json().catch(() => ({}));
  const { client_id, redirect_uri, code_challenge, code_challenge_method } = body ?? {};
  if (!client_id || !redirect_uri || !code_challenge || code_challenge_method !== "S256") return oauthError("invalid_request");
  if (!/^[A-Za-z0-9_-]{43}$/.test(code_challenge)) return oauthError("invalid_request");
  const scopes = parseValidScopes(String(body.scope ?? ""));
  if (!scopes) return oauthError("invalid_scope");
  const { data: client } = await service
    .from("mcp_oauth_clients")
    .select("redirect_uris")
    .eq("client_id", client_id)
    .maybeSingle();
  if (!client || !client.redirect_uris.includes(redirect_uri)) return oauthError("invalid_grant");
  const code = randomToken();
  const { error } = await service.from("mcp_oauth_codes").insert({
    code_hash: await sha256Hex(code),
    client_id,
    redirect_uri,
    code_challenge,
    scope: scopes.join(","),
    admin_user_id: adminUserId,
    expires_at: new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  });
  if (error) return oauthError("server_error", 500);
  return json({ code, expires_in: CODE_TTL_S });
}

async function token(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (body?.grant_type !== "authorization_code") return oauthError("unsupported_grant_type");
  const { code, code_verifier, client_id, redirect_uri } = body ?? {};
  if (!code || !code_verifier || !client_id || !redirect_uri) return oauthError("invalid_request");
  const codeHash = await sha256Hex(code);
  const { data: row } = await service.from("mcp_oauth_codes").select("*").eq("code_hash", codeHash).maybeSingle();
  if (!row || row.client_id !== client_id || row.redirect_uri !== redirect_uri) return oauthError("invalid_grant");
  if (new Date(row.expires_at).getTime() <= Date.now()) return oauthError("invalid_grant");
  if ((await sha256B64url(code_verifier)) !== row.code_challenge) return oauthError("invalid_grant");
  // Atomic single-use consume: only one concurrent redemption wins.
  const { data: consumed } = await service
    .from("mcp_oauth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .select("scope, admin_user_id")
    .maybeSingle();
  if (!consumed) return oauthError("invalid_grant");
  const accessToken = randomToken();
  const { error } = await service.from("mcp_oauth_tokens").insert({
    token_hash: await sha256Hex(accessToken),
    client_id,
    admin_user_id: consumed.admin_user_id,
    scope: consumed.scope,
    expires_at: new Date(Date.now() + TOKEN_TTL_S * 1000).toISOString(),
  });
  if (error) return oauthError("server_error", 500);
  return json({ access_token: accessToken, token_type: "Bearer", expires_in: TOKEN_TTL_S, scope: consumed.scope });
}

async function revoke(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body?.token === "string" && body.token) {
    await service
      .from("mcp_oauth_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", await sha256Hex(body.token))
      .is("revoked_at", null);
  }
  return json({}); // RFC 7009: always 200.
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return oauthError("method_not_allowed", 405);
  const route = new URL(req.url).pathname.replace(/\/+$/, "");
  try {
    if (route.endsWith("/authorize")) return await authorize(req);
    if (route.endsWith("/token")) return await token(req);
    if (route.endsWith("/revoke")) return await revoke(req);
    return oauthError("not_found", 404);
  } catch {
    return oauthError("server_error", 500);
  }
});

// ponytail: no refresh tokens in v1 — add refresh_token grant + rotation in token() when clients need offline access.
