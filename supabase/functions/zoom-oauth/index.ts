// Zoom OAuth: start / callback / disconnect / status.
// config.toml sets verify_jwt = false because /callback is a browser redirect
// from Zoom (no Authorization header); POST routes verify the JWT themselves.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  CORS_HEADERS,
  signState,
  verifyState,
  zoomJson,
  zoomTokenExchange,
} from "../_shared/zoom.ts";

const REDIRECT = (reason: string) =>
  `${Deno.env.get("APP_SITE_URL")}/admin/account?zoom=error&reason=${reason}`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const url = new URL(req.url);
  // Path after the function name: "" | "/start" | "/callback" | ...
  const route = url.pathname.replace(/^.*\/zoom-oauth/, "").replace(/\/$/, "");
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // --- GET /callback (browser redirect target; no JWT) ---------------------
  if (route === "/callback" && req.method === "GET") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return redirect(REDIRECT("state_invalid"));

    const payload = await verifyState(state);
    if (!payload) return redirect(REDIRECT("state_invalid"));

    let tokens;
    try {
      tokens = await zoomTokenExchange(code);
    } catch {
      return redirect(REDIRECT("exchange_failed"));
    }

    let me: { id?: string; email?: string; display_name?: string; first_name?: string; last_name?: string; type?: number };
    try {
      const res = await fetch("https://api.zoom.us/v2/users/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      me = await zoomJson(res, "ZOOM_PROFILE_FAILED");
    } catch {
      return redirect(REDIRECT("profile_failed"));
    }

    const nowIso = new Date().toISOString();
    const scopes = (tokens.scope ?? "").split(" ").filter(Boolean);

    const { error: connError } = await service.from("zoom_connections").upsert(
      {
        user_id: payload.uid,
        zoom_user_id: String(me.id ?? ""),
        zoom_email: me.email ?? null,
        zoom_display_name:
          me.display_name ?? ([me.first_name, me.last_name].filter(Boolean).join(" ") || null),
        zoom_account_type: me.type ?? null,
        scopes,
        status: "active",
        updated_at: nowIso,
      },
      { onConflict: "user_id" },
    );
    if (connError) return redirect(REDIRECT("profile_failed"));

    const { error: secretError } = await service.from("zoom_connection_secrets").upsert(
      {
        user_id: payload.uid,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        updated_at: nowIso,
      },
      { onConflict: "user_id" },
    );
    if (secretError) return redirect(REDIRECT("exchange_failed"));

    return redirect(`${Deno.env.get("APP_SITE_URL")}/admin/account?zoom=connected`);
  }

  // --- POST routes: verify the caller's JWT themselves --------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "UNAUTHENTICATED" }, 401);

  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes } = await userClient.auth.getUser();
  if (!userRes.user) return json({ error: "UNAUTHENTICATED" }, 401);

  const { data: isAdmin } = await userClient.rpc("has_role", {
    _user_id: userRes.user.id,
    _role: "admin",
  });
  if (!isAdmin) return json({ error: "FORBIDDEN" }, 403);

  if (route === "/start" && req.method === "POST") {
    const state = await signState({ uid: userRes.user.id });
    const params = new URLSearchParams({
      response_type: "code",
      client_id: Deno.env.get("ZOOM_CLIENT_ID")!,
      redirect_uri: Deno.env.get("ZOOM_REDIRECT_URI")!,
      state,
    });
    return json({ url: `https://zoom.us/oauth/authorize?${params.toString()}` });
  }

  if (route === "/status" && req.method === "POST") {
    const { data } = await service
      .from("zoom_connections")
      .select("user_id, zoom_user_id, zoom_email, zoom_display_name, zoom_account_type, scopes, status, connected_at, updated_at")
      .eq("user_id", userRes.user.id)
      .maybeSingle();
    return json({ connection: data ?? null });
  }

  if (route === "/disconnect" && req.method === "POST") {
    const { data: secret } = await service
      .from("zoom_connection_secrets")
      .select("access_token")
      .eq("user_id", userRes.user.id)
      .maybeSingle();

    if (secret?.access_token) {
      // Best effort: a failed revoke at Zoom must not block the local disconnect.
      await fetch(
        `https://zoom.us/oauth/revoke?token=${encodeURIComponent(secret.access_token)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${Deno.env.get("ZOOM_CLIENT_ID")}:${Deno.env.get("ZOOM_CLIENT_SECRET")}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      ).catch(() => undefined);
    }

    await service.from("zoom_connection_secrets").delete().eq("user_id", userRes.user.id);
    await service.from("zoom_connections").delete().eq("user_id", userRes.user.id);
    return json({ ok: true });
  }

  // Unused import guard for tree-shaking clarity (zoomFetch/zoomJson are used above).
  void zoomFetch;

  return json({ error: "NOT_FOUND" }, 404);
});
