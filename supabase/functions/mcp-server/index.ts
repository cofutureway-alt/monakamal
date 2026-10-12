// Minimal, deny-by-default MCP Streamable HTTP gateway.
// Configure MCP_API_KEYS as JSON: {"key":["tools:ping","tools:system_info"]}
// Or MCP_API_KEY plus MCP_PERMISSIONS (comma-separated) for one key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type Permission = string;
type KeyRecord = { permissions: Permission[]; apiKeyId?: string };
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const VERSION = "2024-11-05";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};
const tools = [
  { name: "ping", description: "Health check. No side effects.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "system_info", description: "Returns non-sensitive gateway metadata.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "list_users", description: "List users through the existing admin RPC.", inputSchema: { type: "object", properties: { search: { type: "string" }, limit: { type: "number", maximum: 100 }, offset: { type: "number", minimum: 0 } }, additionalProperties: false } },
  { name: "get_student", description: "Get one student through the existing admin RPC.", inputSchema: { type: "object", required: ["user_id"], properties: { user_id: { type: "string", format: "uuid" } }, additionalProperties: false } },
  { name: "list_courses", description: "List courses with optional filters.", inputSchema: { type: "object", properties: { stage_id: { type: "string", format: "uuid" }, status: { type: "string", enum: ["draft", "published", "archived"] }, limit: { type: "number", maximum: 100 }, offset: { type: "number", minimum: 0 } }, additionalProperties: false } },
  { name: "get_course", description: "Get one course by id.", inputSchema: { type: "object", required: ["course_id"], properties: { course_id: { type: "string", format: "uuid" } }, additionalProperties: false } },
  { name: "update_course", description: "Update mutable course fields. Requires confirm:true.", inputSchema: { type: "object", required: ["course_id", "confirm"], properties: { course_id: { type: "string", format: "uuid" }, title: { type: "string", maxLength: 300 }, description: { type: "string", maxLength: 8000 }, status: { type: "string", enum: ["draft", "published", "archived"] }, is_paid: { type: "boolean" }, price_piastres: { type: "number", minimum: 0 }, discount_price_piastres: { type: "number", minimum: 0 }, confirm: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "delete_course", description: "Permanently delete a course. Requires confirm:true and explicit course_id.", inputSchema: { type: "object", required: ["course_id", "confirm"], properties: { course_id: { type: "string", format: "uuid" }, confirm: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "list_bundles", description: "List bundles with optional filters.", inputSchema: { type: "object", properties: { status: { type: "string", enum: ["draft", "published", "archived"] }, limit: { type: "number", maximum: 100 }, offset: { type: "number", minimum: 0 } }, additionalProperties: false } },
  { name: "get_bundle", description: "Get one bundle by id.", inputSchema: { type: "object", required: ["bundle_id"], properties: { bundle_id: { type: "string", format: "uuid" } }, additionalProperties: false } },
  { name: "update_bundle", description: "Update mutable bundle fields. Requires confirm:true.", inputSchema: { type: "object", required: ["bundle_id", "confirm"], properties: { bundle_id: { type: "string", format: "uuid" }, title: { type: "string", maxLength: 300 }, description: { type: "string", maxLength: 8000 }, status: { type: "string", enum: ["draft", "published", "archived"] }, is_paid: { type: "boolean" }, price_piastres: { type: "number", minimum: 0 }, discount_price_piastres: { type: "number", minimum: 0 }, confirm: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "delete_bundle", description: "Permanently delete a bundle. Requires confirm:true.", inputSchema: { type: "object", required: ["bundle_id", "confirm"], properties: { bundle_id: { type: "string", format: "uuid" }, confirm: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "list_lessons", description: "List lessons for a course unit or all.", inputSchema: { type: "object", properties: { limit: { type: "number", maximum: 100 }, offset: { type: "number", minimum: 0 } }, additionalProperties: false } },
  { name: "get_lesson", description: "Get one lesson by id.", inputSchema: { type: "object", required: ["lesson_id"], properties: { lesson_id: { type: "string", format: "uuid" } }, additionalProperties: false } },
  { name: "update_lesson", description: "Update mutable lesson fields. Requires confirm:true.", inputSchema: { type: "object", required: ["lesson_id", "confirm"], properties: { lesson_id: { type: "string", format: "uuid" }, title: { type: "string", maxLength: 300 }, description: { type: "string", maxLength: 8000 }, video_url: { type: "string", maxLength: 1000 }, position: { type: "number", minimum: 0 }, confirm: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "delete_lesson", description: "Permanently delete a lesson. Requires confirm:true.", inputSchema: { type: "object", required: ["lesson_id", "confirm"], properties: { lesson_id: { type: "string", format: "uuid" }, confirm: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "list_quizzes", description: "List quizzes with optional course filter.", inputSchema: { type: "object", properties: { course_id: { type: "string", format: "uuid" }, limit: { type: "number", maximum: 100 }, offset: { type: "number", minimum: 0 } }, additionalProperties: false } },
  { name: "get_quiz", description: "Get one quiz by id.", inputSchema: { type: "object", required: ["quiz_id"], properties: { quiz_id: { type: "string", format: "uuid" } }, additionalProperties: false } },
  { name: "update_quiz", description: "Update mutable quiz fields. Requires confirm:true.", inputSchema: { type: "object", required: ["quiz_id", "confirm"], properties: { quiz_id: { type: "string", format: "uuid" }, title: { type: "string", maxLength: 300 }, description: { type: "string", maxLength: 8000 }, duration_minutes: { type: "number", minimum: 1, maximum: 600 }, pass_percentage: { type: "number", minimum: 0, maximum: 100 }, max_attempts: { type: "number", minimum: 1, maximum: 100 }, confirm: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "delete_quiz", description: "Permanently delete a quiz. Requires confirm:true.", inputSchema: { type: "object", required: ["quiz_id", "confirm"], properties: { quiz_id: { type: "string", format: "uuid" }, confirm: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "update_platform_settings", description: "Update homepage/platform settings. Requires confirm:true.", inputSchema: { type: "object", required: ["confirm"], properties: { hero_image_url: { type: "string", maxLength: 1000 }, hero_headline: { type: "string", maxLength: 300 }, hero_subtext: { type: "string", maxLength: 1000 }, hero_cta_label: { type: "string", maxLength: 100 }, hero_cta_url: { type: "string", maxLength: 500 }, confirm: { type: "boolean", const: true } }, additionalProperties: false } },
  { name: "get_platform_settings", description: "Read platform/homepage settings.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
];

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, ...headers } });
}
function error(id: Rpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const attempts = new Map<string, { count: number; reset: number }>();
async function authenticate(req: Request): Promise<KeyRecord | null> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now(); const current = attempts.get(ip);
  if (current && current.reset > now && current.count >= 60) return null;
  if (!current || current.reset <= now) attempts.set(ip, { count: 1, reset: now + 60_000 }); else current.count++;
  const supplied = req.headers.get("x-api-key") ?? (req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "");
  const { data: setting } = await admin.from("mcp_settings").select("value").eq("key", "enabled").maybeSingle();
  if (setting?.value && (setting.value as { enabled?: boolean }).enabled === false) return null;
  if (!supplied || supplied.length < 32) return null;
  if (supplied.startsWith("mcp_")) {
    const { data, error } = await admin.rpc("mcp_verify_api_key", { _key: supplied });
    if (error || !data?.[0]) return null;
    await admin.rpc("mcp_touch_api_key", { _api_key_id: data[0].api_key_id });
    const permissions = Object.entries(data[0].permissions ?? {}).flatMap(([resource, value]) => {
      if (Array.isArray(value)) return value.map((a) => `${a}:${resource}`);
      if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).filter(([, enabled]) => enabled === true).map(([action]) => `${action}:${resource}`);
      return [];
    });
    return { apiKeyId: data[0].api_key_id, permissions };
  }
  // OAuth access token (issued by mcp-oauth): look up by SHA-256 hash.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied));
  const tokenHash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { data: oauthToken } = await admin
    .from("mcp_oauth_tokens")
    .select("scope")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!oauthToken) return null;
  return { permissions: oauthToken.scope.split(",").map((s) => s.trim()).filter(Boolean) };
}
const TOOL_SCOPE: Record<string, string> = {
  ping: "read:settings", system_info: "read:settings",
  list_users: "read:users", get_student: "read:users",
  list_courses: "read:courses", get_course: "read:courses", update_course: "update:courses", delete_course: "delete:courses",
  list_bundles: "read:bundles", get_bundle: "read:bundles", update_bundle: "update:bundles", delete_bundle: "delete:bundles",
  list_lessons: "read:lessons", get_lesson: "read:lessons", update_lesson: "update:lessons", delete_lesson: "delete:lessons",
  list_quizzes: "read:quizzes", get_quiz: "read:quizzes", update_quiz: "update:quizzes", delete_quiz: "delete:quizzes",
  get_platform_settings: "read:settings", update_platform_settings: "update:settings",
};
const allows = (auth: KeyRecord, tool: string) => auth.permissions.includes(`tools:${tool}`) || auth.permissions.includes(TOOL_SCOPE[tool] ?? "");
async function callTool(name: string, args: Record<string, unknown>, auth: KeyRecord) {
  if (name === "ping") return "pong";
  if (name === "system_info") return { service: "al-saae-mcp", protocolVersion: VERSION };
  if (name === "list_users") {
    const limit = Math.min(Math.max(Number(args.limit ?? 25), 1), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    let query = admin.from("profiles").select("id,full_name,phone_number,email,role,stage_id,created_at").range(offset, offset + limit - 1).order("created_at", { ascending: false });
    const search = String(args.search ?? "").trim().slice(0, 80).replace(/[(),%]/g, "");
    if (search) query = query.or(`full_name.ilike.%${search}%,phone_number.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "get_student") {
    const id = String(args.user_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_user_id");
    const { data, error } = await admin.from("profiles").select("id,full_name,phone_number,email,role,stage_id,student_id,created_at,is_banned").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  if (name === "list_courses") {
    const limit = Math.min(Math.max(Number(args.limit ?? 25), 1), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    let query = admin.from("courses").select("id,stage_id,title,status,is_paid,price_piastres,discount_price_piastres,created_at").range(offset, offset + limit - 1).order("created_at", { ascending: false });
    if (args.stage_id) {
      const stageId = String(args.stage_id);
      if (!/^[0-9a-f-]{36}$/i.test(stageId)) throw new Error("invalid_stage_id");
      query = query.eq("stage_id", stageId);
    }
    if (args.status && ["draft", "published", "archived"].includes(String(args.status))) query = query.eq("status", args.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "get_course") {
    const id = String(args.course_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_course_id");
    const { data, error } = await admin.from("courses").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  if (name === "update_course") {
    const id = String(args.course_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_course_id");
    if (args.confirm !== true) throw new Error("confirmation_required");
    const patch: Record<string, unknown> = {};
    if (typeof args.title === "string" && args.title.trim()) patch.title = args.title.trim().slice(0, 300);
    if (typeof args.description === "string") patch.description = args.description.slice(0, 8000);
    if (typeof args.status === "string" && ["draft", "published", "archived"].includes(args.status)) patch.status = args.status;
    if (typeof args.is_paid === "boolean") patch.is_paid = args.is_paid;
    if (args.price_piastres != null) {
      const price = Number(args.price_piastres);
      if (!Number.isInteger(price) || price < 0) throw new Error("invalid_price");
      patch.price_piastres = price;
    }
    if (args.discount_price_piastres != null) {
      const discount = Number(args.discount_price_piastres);
      if (!Number.isInteger(discount) || discount < 0) throw new Error("invalid_discount");
      patch.discount_price_piastres = discount;
    }
    if (Object.keys(patch).length === 0) throw new Error("no_fields_to_update");
    patch.updated_at = new Date().toISOString();
    const { data, error } = await admin.from("courses").update(patch).eq("id", id).select("id,title,status,is_paid,price_piastres,discount_price_piastres").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  if (name === "delete_course") {
    const id = String(args.course_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_course_id");
    if (args.confirm !== true) throw new Error("confirmation_required");
    const { data, error } = await admin.from("courses").delete().eq("id", id).select("id,title").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return { deleted: true, id: data.id, title: data.title };
  }
  if (name === "list_bundles") {
    const limit = Math.min(Math.max(Number(args.limit ?? 25), 1), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    let query = admin.from("bundles").select("id,title,status,is_paid,price_piastres,discount_price_piastres,created_at").range(offset, offset + limit - 1).order("created_at", { ascending: false });
    if (args.status && ["draft", "published", "archived"].includes(String(args.status))) query = query.eq("status", args.status);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "get_bundle") {
    const id = String(args.bundle_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_bundle_id");
    const { data, error } = await admin.from("bundles").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  if (name === "update_bundle") {
    const id = String(args.bundle_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_bundle_id");
    if (args.confirm !== true) throw new Error("confirmation_required");
    const patch: Record<string, unknown> = {};
    if (typeof args.title === "string" && args.title.trim()) patch.title = args.title.trim().slice(0, 300);
    if (typeof args.description === "string") patch.description = args.description.slice(0, 8000);
    if (typeof args.status === "string" && ["draft", "published", "archived"].includes(args.status)) patch.status = args.status;
    if (typeof args.is_paid === "boolean") patch.is_paid = args.is_paid;
    for (const key of ["price_piastres", "discount_price_piastres"] as const) {
      if (args[key] != null) {
        const v = Number(args[key]);
        if (!Number.isInteger(v) || v < 0) throw new Error(`invalid_${key}`);
        patch[key] = v;
      }
    }
    if (Object.keys(patch).length === 0) throw new Error("no_fields_to_update");
    patch.updated_at = new Date().toISOString();
    const { data, error } = await admin.from("bundles").update(patch).eq("id", id).select("id,title,status,is_paid,price_piastres").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  if (name === "delete_bundle") {
    const id = String(args.bundle_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_bundle_id");
    if (args.confirm !== true) throw new Error("confirmation_required");
    const { data, error } = await admin.from("bundles").delete().eq("id", id).select("id,title").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return { deleted: true, id: data.id, title: data.title };
  }
  if (name === "list_lessons") {
    const limit = Math.min(Math.max(Number(args.limit ?? 25), 1), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    const { data, error } = await admin.from("lessons").select("id,unit_id,title,position,created_at").range(offset, offset + limit - 1).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "get_lesson") {
    const id = String(args.lesson_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_lesson_id");
    const { data, error } = await admin.from("lessons").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  if (name === "update_lesson") {
    const id = String(args.lesson_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_lesson_id");
    if (args.confirm !== true) throw new Error("confirmation_required");
    const patch: Record<string, unknown> = {};
    if (typeof args.title === "string" && args.title.trim()) patch.title = args.title.trim().slice(0, 300);
    if (typeof args.description === "string") patch.description = args.description.slice(0, 8000);
    if (typeof args.video_url === "string") patch.video_url = args.video_url.slice(0, 1000);
    if (args.position != null) {
      const pos = Number(args.position);
      if (!Number.isInteger(pos) || pos < 0) throw new Error("invalid_position");
      patch.position = pos;
    }
    if (Object.keys(patch).length === 0) throw new Error("no_fields_to_update");
    patch.updated_at = new Date().toISOString();
    const { data, error } = await admin.from("lessons").update(patch).eq("id", id).select("id,title,position").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  if (name === "delete_lesson") {
    const id = String(args.lesson_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_lesson_id");
    if (args.confirm !== true) throw new Error("confirmation_required");
    const { data, error } = await admin.from("lessons").delete().eq("id", id).select("id,title").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return { deleted: true, id: data.id, title: data.title };
  }
  if (name === "list_quizzes") {
    const limit = Math.min(Math.max(Number(args.limit ?? 25), 1), 100);
    const offset = Math.max(Number(args.offset ?? 0), 0);
    let query = admin.from("quizzes").select("id,course_id,title,duration_minutes,pass_percentage,max_attempts,created_at").range(offset, offset + limit - 1).order("created_at", { ascending: false });
    if (args.course_id) {
      const cid = String(args.course_id);
      if (!/^[0-9a-f-]{36}$/i.test(cid)) throw new Error("invalid_course_id");
      query = query.eq("course_id", cid);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
  }
  if (name === "get_quiz") {
    const id = String(args.quiz_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_quiz_id");
    const { data, error } = await admin.from("quizzes").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  if (name === "update_quiz") {
    const id = String(args.quiz_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_quiz_id");
    if (args.confirm !== true) throw new Error("confirmation_required");
    const patch: Record<string, unknown> = {};
    if (typeof args.title === "string" && args.title.trim()) patch.title = args.title.trim().slice(0, 300);
    if (typeof args.description === "string") patch.description = args.description.slice(0, 8000);
    for (const [key, min, max] of [["duration_minutes", 1, 600], ["pass_percentage", 0, 100], ["max_attempts", 1, 100]] as const) {
      if (args[key] != null) {
        const v = Number(args[key]);
        if (!Number.isInteger(v) || v < min || v > max) throw new Error(`invalid_${key}`);
        patch[key] = v;
      }
    }
    if (Object.keys(patch).length === 0) throw new Error("no_fields_to_update");
    patch.updated_at = new Date().toISOString();
    const { data, error } = await admin.from("quizzes").update(patch).eq("id", id).select("id,title,duration_minutes,pass_percentage,max_attempts").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  if (name === "delete_quiz") {
    const id = String(args.quiz_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("invalid_quiz_id");
    if (args.confirm !== true) throw new Error("confirmation_required");
    const { data, error } = await admin.from("quizzes").delete().eq("id", id).select("id,title").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return { deleted: true, id: data.id, title: data.title };
  }
  if (name === "get_platform_settings") {
    const { data, error } = await admin.from("platform_settings").select("logo_light_url,logo_dark_url,social_links,hero_image_url,hero_headline,hero_subtext,hero_cta_label,hero_cta_url,updated_at").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? {};
  }
  if (name === "update_platform_settings") {
    if (args.confirm !== true) throw new Error("confirmation_required");
    const patch: Record<string, unknown> = {};
    for (const key of ["hero_image_url", "hero_headline", "hero_subtext", "hero_cta_label", "hero_cta_url"] as const) {
      if (typeof args[key] === "string") patch[key] = (args[key] as string).slice(0, key === "hero_subtext" ? 1000 : 500);
    }
    if (Object.keys(patch).length === 0) throw new Error("no_fields_to_update");
    patch.updated_at = new Date().toISOString();
    const { data, error } = await admin.from("platform_settings").update(patch).eq("id", 1).select("hero_headline,hero_subtext,hero_cta_label,updated_at").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("not_found");
    return data;
  }
  throw new Error("Unknown tool");
}
async function handle(rpc: Rpc, auth: KeyRecord) {
  if (rpc.jsonrpc !== "2.0" || !rpc.method) return error(rpc.id, -32600, "Invalid Request");
  if (rpc.method === "initialize") return { jsonrpc: "2.0", id: rpc.id ?? null, result: { protocolVersion: VERSION, capabilities: { tools: {} }, serverInfo: { name: "al-saae-mcp", version: "1.0.0" } } };
  if (rpc.method === "notifications/initialized") return null;
  if (rpc.method === "tools/list") return { jsonrpc: "2.0", id: rpc.id ?? null, result: { tools: tools.filter(t => allows(auth, t.name)) } };
  if (rpc.method === "tools/call") {
    const name = (rpc.params?.name as string) ?? "";
    if (!tools.some(t => t.name === name)) return error(rpc.id, -32602, "Unknown tool");
    if (!allows(auth, name)) return error(rpc.id, -32003, "Permission denied");
    try {
      const value = await callTool(name, (rpc.params?.arguments as Record<string, unknown>) ?? {}, auth);
      await admin.rpc("mcp_write_audit", { _action: `tool.${name}`, _resource: name, _metadata: { ok: true }, _api_key_id: auth.apiKeyId });
      return { jsonrpc: "2.0", id: rpc.id ?? null, result: { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }], isError: false } };
    } catch (e) {
      await admin.rpc("mcp_write_audit", { _action: `tool.${name}`, _resource: name, _metadata: { ok: false, error: String(e instanceof Error ? e.message : e).slice(0, 200) }, _api_key_id: auth.apiKeyId });
      return { jsonrpc: "2.0", id: rpc.id ?? null, result: { content: [{ type: "text", text: "Tool execution failed" }], isError: true } };
    }
  }
  return error(rpc.id, -32601, "Method not found");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET") {
    const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mcp-server`;
    const oauthBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mcp-oauth`;
    const url = new URL(req.url);
    // Site URL for the human-facing authorize page — configurable from admin MCP settings.
    const { data: siteSetting } = await admin.from("mcp_settings").select("value").eq("key", "site_url").maybeSingle();
    const siteUrl = String((siteSetting?.value as { site_url?: string } | null)?.site_url ?? "https://www.miss-mona-kamel.com").replace(/\/$/, "");
    if (url.pathname.endsWith("/.well-known/oauth-authorization-server")) {
      return json({
        issuer: base,
        authorization_endpoint: `${siteUrl}/mcp/authorize`,
        token_endpoint: `${oauthBase}/token`,
        revocation_endpoint: `${oauthBase}/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["read:users", "read:courses", "read:bundles", "read:lessons", "read:quizzes", "read:orders", "read:settings"],
      });
    }
    if (url.pathname.endsWith("/.well-known/oauth-protected-resource") || url.pathname.replace(/\/$/, "") === new URL(base).pathname) {
      return json({
        resource: base,
        authorization_servers: [base],
        bearer_methods_supported: ["header"],
        scopes_supported: ["read:users", "read:courses", "read:bundles", "read:lessons", "read:quizzes", "read:orders", "read:settings"],
      });
    }
    return json({
      resource: base,
      authorization_servers: [base],
      bearer_methods_supported: ["header"],
      scopes_supported: ["read:users", "read:courses", "read:bundles", "read:lessons", "read:quizzes", "read:orders", "read:settings"],
    });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  try {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > 256_000) return json({ error: "payload_too_large" }, 413);
    const body = await req.json();
    const result = Array.isArray(body) ? await Promise.all(body.map((r: Rpc) => handle(r, auth))).then((items) => items.filter(Boolean)) : await handle(body, auth);
    return json(result);
  } catch { return json(error(null, -32700, "Parse error"), 400); }
});

// Self-check for the permission boundary (runs only when imported by tests).
export { handle };
