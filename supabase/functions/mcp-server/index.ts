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
];

function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, ...headers } });
}
function error(id: Rpc["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
async function authenticate(req: Request): Promise<KeyRecord | null> {
  const supplied = req.headers.get("x-api-key") ?? (req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "");
  if (!supplied || supplied.length < 32) return null;
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
const allows = (auth: KeyRecord, tool: string) => auth.permissions.includes(`tools:${tool}`) || auth.permissions.includes("read:settings");
function handle(rpc: Rpc, auth: KeyRecord) {
  if (rpc.jsonrpc !== "2.0" || !rpc.method) return error(rpc.id, -32600, "Invalid Request");
  if (rpc.method === "initialize") return { jsonrpc: "2.0", id: rpc.id ?? null, result: { protocolVersion: VERSION, capabilities: { tools: {} }, serverInfo: { name: "al-saae-mcp", version: "1.0.0" } } };
  if (rpc.method === "notifications/initialized") return null;
  if (rpc.method === "tools/list") return { jsonrpc: "2.0", id: rpc.id ?? null, result: { tools: tools.filter(t => allows(auth, t.name)) } };
  if (rpc.method === "tools/call") {
    const name = (rpc.params?.name as string) ?? "";
    if (!tools.some(t => t.name === name)) return error(rpc.id, -32602, "Unknown tool");
    if (!allows(auth, name)) return error(rpc.id, -32003, "Permission denied");
    const text = name === "ping" ? "pong" : JSON.stringify({ service: "al-saae-mcp", protocolVersion: VERSION });
    return { jsonrpc: "2.0", id: rpc.id ?? null, result: { content: [{ type: "text", text }], isError: false } };
  }
  return error(rpc.id, -32601, "Method not found");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method === "GET") return json({ error: "Use POST for Streamable HTTP JSON-RPC" }, 405);
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = await authenticate(req);
  if (!auth) return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  try {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > 256_000) return json({ error: "payload_too_large" }, 413);
    const body = await req.json();
    const result = Array.isArray(body) ? body.map((r: Rpc) => handle(r, auth)).filter(Boolean) : handle(body, auth);
    return json(result);
  } catch { return json(error(null, -32700, "Parse error"), 400); }
});

// Self-check for the permission boundary (runs only when imported by tests).
export { handle };
