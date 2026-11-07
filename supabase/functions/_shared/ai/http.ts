// Shared HTTP + caller helpers for the AI edge functions.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-guest",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export function fail(code: string, status: number, message_ar?: string, extra: Record<string, unknown> = {}) {
  return json({ error: code, message_ar: message_ar ?? code, ...extra }, status);
}

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function userClientFor(authHeader: string): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Caller {
  uid: string;
  role: "admin" | "student" | "parent";
  fullName: string | null;
  isPrimaryAdmin: boolean;
  isBanned: boolean;
  authHeader: string;
  userClient: SupabaseClient;
}

/** Resolve the JWT caller (null when absent/invalid). Role comes from profiles, not the token. */
export async function getCaller(req: Request, service: SupabaseClient): Promise<Caller | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const userClient = userClientFor(authHeader);
  const { data } = await userClient.auth.getUser();
  const user = data?.user;
  if (!user) return null;
  const { data: profile } = await service
    .from("profiles")
    .select("role, full_name, is_primary_admin, is_banned")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return null;
  return {
    uid: user.id,
    role: profile.role,
    fullName: profile.full_name ?? null,
    isPrimaryAdmin: Boolean(profile.is_primary_admin),
    isBanned: Boolean(profile.is_banned),
    authHeader,
    userClient,
  };
}

export async function audit(
  service: SupabaseClient,
  actorId: string,
  action: string,
  target: string | null,
  detail: Record<string, unknown>,
) {
  await service.from("admin_audit_log").insert({ actor_id: actorId, action, target, detail });
}
