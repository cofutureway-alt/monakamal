// Model gateway: one call shape for OpenAI-compatible and Anthropic providers.
// Non-streaming on purpose — tool loops need whole responses; the user-facing
// stream is produced by ai-chat itself.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type ApiFormat = "openai_compatible" | "anthropic";

export interface ProviderRow {
  id: string;
  name: string;
  api_format: ApiFormat;
  base_url: string;
  model_id: string;
  temperature: number;
  max_output_tokens: number;
  supports_tools: boolean | null;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema (object)
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Provider-neutral history. `tool` messages answer one tool call each. */
export type GatewayMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ModelResult {
  text: string;
  toolCalls: ToolCall[];
  usage: { in: number; out: number };
  stopReason: string;
  latencyMs: number;
}

export type GatewayErrorCode =
  | "AI_AUTH"
  | "AI_MODEL_NOT_FOUND"
  | "AI_RATE_LIMITED"
  | "AI_TIMEOUT"
  | "AI_BAD_RESPONSE"
  | "AI_UNREACHABLE"
  | "AI_NOT_CONFIGURED";

export class GatewayError extends Error {
  constructor(public code: GatewayErrorCode, public status = 0, detail = "") {
    super(`${code}${status ? `:${status}` : ""}${detail ? `:${detail}` : ""}`);
  }
}

export const GATEWAY_ERROR_AR: Record<GatewayErrorCode, string> = {
  AI_AUTH: "مفتاح API غير صالح",
  AI_MODEL_NOT_FOUND: "معرّف النموذج غير موجود",
  AI_RATE_LIMITED: "تجاوز المزوّد حد الطلبات، حاول بعد قليل",
  AI_TIMEOUT: "استغرق النموذج وقتاً طويلاً في الرد",
  AI_BAD_RESPONSE: "ردّ غير متوقع من المزوّد",
  AI_UNREACHABLE: "تعذّر الوصول إلى خادم المزوّد",
  AI_NOT_CONFIGURED: "لم يتم إعداد مزوّد للذكاء الاصطناعي",
};

const TIMEOUT_MS = 60_000;

function endpoint(p: Pick<ProviderRow, "api_format" | "base_url">): string {
  const base = p.base_url.replace(/\/+$/, "");
  if (p.api_format === "openai_compatible") {
    return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  }
  if (base.endsWith("/v1/messages")) return base;
  if (base.endsWith("/v1")) return `${base}/messages`;
  return `${base}/v1/messages`;
}

function classify(status: number, body: string): GatewayError {
  const short = body.replace(/\s+/g, " ").slice(0, 160);
  if (status === 401 || status === 403) return new GatewayError("AI_AUTH", status);
  if (status === 404 || /model/i.test(body) && status === 400 && /not.?found|does not exist|invalid model/i.test(body)) {
    return new GatewayError("AI_MODEL_NOT_FOUND", status);
  }
  if (status === 429) return new GatewayError("AI_RATE_LIMITED", status);
  return new GatewayError("AI_BAD_RESPONSE", status, short);
}

// ---------------------------------------------------------------- request shapes
function openaiBody(
  p: ProviderRow,
  system: string,
  messages: GatewayMessage[],
  tools: ToolDef[],
  toolChoice: string | undefined,
  maxTokens: number,
) {
  const out: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length
          ? {
              tool_calls: m.toolCalls.map((c) => ({
                id: c.id,
                type: "function",
                function: { name: c.name, arguments: JSON.stringify(c.arguments) },
              })),
            }
          : {}),
      });
    } else out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
  }
  const body: Record<string, unknown> = {
    model: p.model_id,
    messages: out,
    temperature: Number(p.temperature),
    max_tokens: maxTokens,
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    if (toolChoice) {
      body.tool_choice = toolChoice === "auto" ? "auto" : { type: "function", function: { name: toolChoice } };
    }
  }
  return body;
}

function anthropicBody(
  p: ProviderRow,
  system: string,
  messages: GatewayMessage[],
  tools: ToolDef[],
  toolChoice: string | undefined,
  maxTokens: number,
) {
  // Anthropic wants alternating user/assistant turns; tool results ride in a
  // user turn as tool_result blocks. Consecutive tool messages are merged.
  const out: { role: "user" | "assistant"; content: unknown[] }[] = [];
  const push = (role: "user" | "assistant", block: unknown) => {
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(block);
    else out.push({ role, content: [block] });
  };
  for (const m of messages) {
    if (m.role === "user") push("user", { type: "text", text: m.content });
    else if (m.role === "assistant") {
      if (m.content) push("assistant", { type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) {
        push("assistant", { type: "tool_use", id: c.id, name: c.name, input: c.arguments });
      }
    } else {
      push("user", { type: "tool_result", tool_use_id: m.toolCallId, content: m.content });
    }
  }
  const body: Record<string, unknown> = {
    model: p.model_id,
    system,
    messages: out,
    max_tokens: maxTokens,
    temperature: Math.min(1, Number(p.temperature)),
  };
  if (tools.length) {
    body.tools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    if (toolChoice) body.tool_choice = toolChoice === "auto" ? { type: "auto" } : { type: "tool", name: toolChoice };
  }
  return body;
}

// ---------------------------------------------------------------- response parsing
function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? v : {};
    } catch {
      return { __invalid_json: raw.slice(0, 200) };
    }
  }
  return {};
}

// deno-lint-ignore no-explicit-any
function parseOpenAI(json: any): Omit<ModelResult, "latencyMs"> {
  const choice = json?.choices?.[0];
  if (!choice?.message) throw new GatewayError("AI_BAD_RESPONSE", 200, "no choices");
  const msg = choice.message;
  const text = typeof msg.content === "string"
    ? msg.content
    // deno-lint-ignore no-explicit-any
    : Array.isArray(msg.content) ? msg.content.map((p: any) => p?.text ?? "").join("") : "";
  // deno-lint-ignore no-explicit-any
  const toolCalls: ToolCall[] = (msg.tool_calls ?? []).map((c: any, i: number) => ({
    id: String(c.id ?? `call_${i}`),
    name: String(c.function?.name ?? ""),
    arguments: parseArgs(c.function?.arguments),
  }));
  return {
    text,
    toolCalls,
    usage: { in: json.usage?.prompt_tokens ?? 0, out: json.usage?.completion_tokens ?? 0 },
    stopReason: String(choice.finish_reason ?? ""),
  };
}

// deno-lint-ignore no-explicit-any
function parseAnthropic(json: any): Omit<ModelResult, "latencyMs"> {
  if (!Array.isArray(json?.content)) throw new GatewayError("AI_BAD_RESPONSE", 200, "no content");
  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const b of json.content) {
    if (b.type === "text") text += b.text ?? "";
    if (b.type === "tool_use") toolCalls.push({ id: String(b.id), name: String(b.name), arguments: parseArgs(b.input) });
  }
  return {
    text,
    toolCalls,
    usage: { in: json.usage?.input_tokens ?? 0, out: json.usage?.output_tokens ?? 0 },
    stopReason: String(json.stop_reason ?? ""),
  };
}

// ---------------------------------------------------------------- public API
export async function callModel(opts: {
  provider: ProviderRow;
  apiKey: string;
  system: string;
  messages: GatewayMessage[];
  tools?: ToolDef[];
  toolChoice?: "auto" | string;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<ModelResult> {
  const p = opts.provider;
  const tools = opts.tools ?? [];
  const maxTokens = opts.maxTokens ?? p.max_output_tokens ?? 2048;
  const body = p.api_format === "openai_compatible"
    ? openaiBody(p, opts.system, opts.messages, tools, opts.toolChoice, maxTokens)
    : anthropicBody(p, opts.system, opts.messages, tools, opts.toolChoice, maxTokens);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (p.api_format === "openai_compatible") headers.Authorization = `Bearer ${opts.apiKey}`;
  else {
    headers["x-api-key"] = opts.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  const attempt = async (): Promise<ModelResult> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? TIMEOUT_MS);
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(endpoint(p), { method: "POST", headers, body: JSON.stringify(body), signal: ctrl.signal });
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof DOMException && e.name === "AbortError") throw new GatewayError("AI_TIMEOUT");
      throw new GatewayError("AI_UNREACHABLE");
    }
    const raw = await res.text().catch(() => "");
    clearTimeout(timer);
    if (!res.ok) throw classify(res.status, raw);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new GatewayError("AI_BAD_RESPONSE", res.status, "not json");
    }
    const parsed = p.api_format === "openai_compatible" ? parseOpenAI(json) : parseAnthropic(json);
    return { ...parsed, latencyMs: Date.now() - started };
  };

  try {
    return await attempt();
  } catch (e) {
    const retryable = e instanceof GatewayError &&
      (e.code === "AI_RATE_LIMITED" || e.code === "AI_UNREACHABLE" || (e.code === "AI_BAD_RESPONSE" && e.status >= 500));
    if (!retryable) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return await attempt();
  }
}

/** Active (or given) provider row + its write-only key. */
export async function loadProvider(
  service: SupabaseClient,
  providerId?: string | null,
): Promise<{ provider: ProviderRow; apiKey: string }> {
  let id = providerId ?? null;
  if (!id) {
    const { data: s } = await service.from("ai_settings").select("active_provider_id").eq("id", 1).maybeSingle();
    id = s?.active_provider_id ?? null;
  }
  if (!id) throw new GatewayError("AI_NOT_CONFIGURED");
  const [{ data: provider }, { data: secret }] = await Promise.all([
    service.from("ai_providers").select("*").eq("id", id).maybeSingle<ProviderRow & { is_active: boolean }>(),
    service.from("ai_provider_secrets").select("api_key").eq("provider_id", id).maybeSingle<{ api_key: string }>(),
  ]);
  if (!provider || !secret?.api_key) throw new GatewayError("AI_NOT_CONFIGURED");
  return { provider, apiKey: secret.api_key };
}
