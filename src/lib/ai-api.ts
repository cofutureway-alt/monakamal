import { supabase } from "@/integrations/supabase/client";
import { SseParser } from "@/lib/ai-sse";

// ---------------------------------------------------------------- types
export type ApiFormat = "openai_compatible" | "anthropic";

export interface AiSettings {
  chatbot_enabled: boolean;
  admin_chat_enabled: boolean;
  grading_enabled: boolean;
  grading_mode: "suggest" | "auto_apply";
  student_limit_per_hour: number;
  student_limit_per_day: number;
  guest_limit_per_hour: number;
  guest_limit_per_day: number;
  count_admin_usage: boolean;
  active_provider_id: string | null;
  grading_provider_id: string | null;
  updated_at: string;
}

export type CheckKey = "reachable" | "auth" | "model" | "tools" | "arabic";
export interface CheckResult {
  key: CheckKey;
  ok: boolean | null;
  ms: number;
  detail_ar: string;
}

export interface AiProvider {
  id: string;
  name: string;
  api_format: ApiFormat;
  base_url: string;
  model_id: string;
  temperature: number;
  max_output_tokens: number;
  supports_tools: boolean | null;
  key_last4: string | null;
  last_test_at: string | null;
  last_test_result: { checks: CheckResult[]; at: string } | null;
  is_active: boolean;
  created_at: string;
}

export interface AiPlan {
  id: "base" | "tier2" | "tier3";
  name_ar: string;
  price_usd_cents: number;
  per_hour: number;
  per_day: number;
  per_month: number;
  sort: number;
}

export interface AiUsageSnapshot {
  plan: AiPlan;
  renews_at: string;
  expired: boolean;
  used: { hour: number; day: number; month: number };
  limits: { hour: number; day: number; month: number };
  resets: { hour: string; day: string; month: string };
  server_now: string;
}

export interface PlanChangeRequest {
  id: string;
  requested_by: string;
  from_plan: string;
  to_plan: string;
  status: "pending" | "applied" | "rejected";
  created_at: string;
}

export interface AiSettingsBundle {
  settings: AiSettings;
  providers: AiProvider[];
  plans: AiPlan[];
  subscription: { plan_id: string; renews_at: string };
  pending_requests: PlanChangeRequest[];
  usage: AiUsageSnapshot;
  viewer: { is_primary_admin: boolean };
}

export interface ProviderInput {
  id?: string;
  name: string;
  api_format: ApiFormat;
  base_url: string;
  model_id: string;
  temperature: number;
  max_output_tokens: number;
  api_key?: string;
}

export class AiApiError extends Error {
  constructor(
    public code: string,
    public messageAr: string,
    public status: number,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

// ---------------------------------------------------------------- transport
const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function authHeaders(guestId?: string): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    // Signed-in users send their JWT; visitors send only the anonymous id.
    ...(token ? { Authorization: `Bearer ${token}` } : guestId ? { "x-ai-guest": guestId } : {}),
  };
}

/** Anonymous visitor id for the chat widget (per browser; regenerated if storage is unavailable). */
export function getGuestId(): string {
  const KEY = "ai_gid";
  try {
    const v = localStorage.getItem(KEY);
    if (v && /^[0-9a-f-]{36}$/i.test(v)) return v;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Whether the public widget should render (chatbot enabled + a provider set). */
export async function getPublicAiConfig(): Promise<{ chatbot_enabled: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rpc not in generated types yet
  const { data, error } = await (supabase as any).rpc("ai_public_config");
  if (error || !data) return { chatbot_enabled: false };
  return data as { chatbot_enabled: boolean };
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${FN_BASE}/${fn}`, { method: "POST", headers: await authHeaders(), body: JSON.stringify(body) });
  } catch {
    throw new AiApiError("NETWORK", "انقطع الاتصال. حاول مرة أخرى.", 0);
  }
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || payload.error || payload.code) {
    const code = String(payload.error ?? payload.code ?? `HTTP_${res.status}`);
    throw new AiApiError(code, String(payload.message_ar ?? "حدث خطأ غير متوقع"), res.status, payload);
  }
  return payload as T;
}

// ---------------------------------------------------------------- ai-admin
export const getAiSettings = () => invoke<AiSettingsBundle>("ai-admin", { action: "get_settings" });
export const getUsageSnapshot = () => invoke<{ usage: AiUsageSnapshot }>("ai-admin", { action: "usage_snapshot" });
export const updateAiSettings = (patch: Partial<AiSettings>) =>
  invoke<{ settings: AiSettings }>("ai-admin", { action: "update_settings", ...patch });
export const saveProvider = (input: ProviderInput) =>
  invoke<{ provider: AiProvider }>("ai-admin", { action: "save_provider", ...input });
export const deleteProvider = (id: string) => invoke<{ ok: true }>("ai-admin", { action: "delete_provider", id });
export const setActiveProvider = (id: string, kind: "chat" | "grading") =>
  invoke<{ ok: true; warning: string | null }>("ai-admin", { action: "set_active_provider", id, kind });
export const testProvider = (id: string) =>
  invoke<{ result: { checks: CheckResult[] }; supports_tools: boolean | null }>("ai-admin", { action: "test_provider", id });
export const testDraftProvider = (draft: ProviderInput) =>
  invoke<{ result: { checks: CheckResult[] }; supports_tools: boolean | null }>("ai-admin", {
    action: "test_provider",
    id: draft.id,
    draft,
  });
export const requestPlanChange = (toPlan: string) =>
  invoke<{ request: PlanChangeRequest }>("ai-admin", { action: "request_plan_change", to_plan: toPlan });
export const applyPlanChange = (requestId: string, decision: "applied" | "rejected") =>
  invoke<{ ok: true }>("ai-admin", { action: "apply_plan_change", request_id: requestId, decision });
export const enqueueGrading = (kind: "assignment" | "quiz_attempt", targetId: string) =>
  invoke<{ job: { id: string; status: string } }>("ai-admin", { action: "enqueue_grading", kind, target_id: targetId });
export const getUsageDaily = () =>
  invoke<{ rows: { day: string; actor_type: string; count: number }[] }>("ai-admin", { action: "usage_daily" });
export const getUsageLog = (actorType?: string) =>
  invoke<{
    rows: {
      id: number;
      occurred_at: string;
      actor_type: string;
      actor_key: string;
      surface: string;
      counted: boolean;
      tokens_in: number | null;
      tokens_out: number | null;
      latency_ms: number | null;
      outcome: string;
    }[];
  }>("ai-admin", { action: "usage_log", actor_type: actorType });

// ---------------------------------------------------------------- chat blocks
export interface ClarificationBlock {
  type: "clarification";
  question: string;
  options: { id: string; label: string; description?: string }[];
  allow_free_text: boolean;
}

export interface ProposalField {
  label: string;
  before?: string | null;
  after: string;
}

export interface ActionProposalBlock {
  type: "action_proposal";
  action_id: string;
  tool: string;
  title_ar: string;
  fields: ProposalField[];
  affected: number;
  destructive: boolean;
  confirm_phrase: string | null;
  expires_at: string;
  client_side?: "lesson_pdf";
  client_payload?: { lesson_id: string; title: string; outline_markdown: string; course_id?: string };
}

export interface ReportBlock {
  type: "report";
  title?: string;
  kpis: { label: string; value: string | number; unit?: string }[];
  chart?: { type: "bar" | "line"; x: string[]; series: { name: string; data: number[] }[] };
  table?: { columns: string[]; rows: (string | number)[][] };
}

export interface FileBlock {
  type: "file";
  name: string;
  size: number;
  url: string;
}

export type ChatBlock = ClarificationBlock | ActionProposalBlock | ReportBlock | FileBlock;

export interface ToolTraceItem {
  name: string;
  label_ar: string;
  kind: "read" | "write" | "meta";
  ok: boolean | null; // null = running
  summary_ar?: string;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: {
    text?: string;
    choice_id?: string;
    blocks?: ChatBlock[];
    tool_trace?: ToolTraceItem[];
    error?: { code: string; message_ar: string };
    action_states?: Record<string, ActionState>;
  };
  created_at: string;
}

export type ActionState = {
  status: "pending" | "executed" | "failed" | "cancelled" | "expired";
  result_summary_ar?: string;
  links?: { label_ar: string; href: string }[];
  error_ar?: string;
};

export interface ConversationRow {
  id: string;
  title: string | null;
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------- conversations (RLS reads)
export async function listConversations(): Promise<ConversationRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ai_* tables are not in the generated types until the migration is applied
  const { data, error } = await (supabase as any)
    .from("ai_conversations")
    .select("id, title, pinned, archived, created_at, updated_at")
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new AiApiError("QUERY_FAILED", "تعذّر تحميل المحادثات", 500);
  return data ?? [];
}

export async function loadMessages(conversationId: string): Promise<StoredMessage[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ai_* tables are not in the generated types until the migration is applied
  const { data, error } = await (supabase as any)
    .from("ai_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(400);
  if (error) throw new AiApiError("QUERY_FAILED", "تعذّر تحميل الرسائل", 500);
  return data ?? [];
}

export async function loadActionStates(conversationId: string): Promise<Record<string, ActionState>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ai_* tables are not in the generated types until the migration is applied
  const { data } = await (supabase as any)
    .from("ai_pending_actions")
    .select("id, status, result, error, expires_at")
    .eq("conversation_id", conversationId);
  const out: Record<string, ActionState> = {};
  for (const r of data ?? []) {
    const expired = r.status === "pending" && new Date(r.expires_at).getTime() < Date.now();
    out[r.id] = {
      status: expired ? "expired" : r.status === "confirmed" ? "pending" : r.status,
      result_summary_ar: r.result?.summary_ar,
      links: r.result?.links,
      error_ar: r.error ?? undefined,
    };
  }
  return out;
}

export async function updateConversation(id: string, patch: Partial<Pick<ConversationRow, "title" | "pinned" | "archived">>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ai_* tables are not in the generated types until the migration is applied
  const { error } = await (supabase as any).from("ai_conversations").update(patch).eq("id", id);
  if (error) throw new AiApiError("UPDATE_FAILED", "تعذّر حفظ التغيير", 500);
}

// ---------------------------------------------------------------- ai-actions
export const decideAction = (
  actionId: string,
  decision: "confirm" | "cancel",
  opts: { confirm_text?: string; client_result?: Record<string, unknown> } = {},
) =>
  invoke<{ status: ActionState["status"]; result_summary_ar?: string; links?: ActionState["links"]; payload?: Record<string, unknown> }>(
    "ai-actions",
    { action_id: actionId, decision, ...opts },
  );

// ---------------------------------------------------------------- ai-chat stream
export type ChatStreamEvent =
  | { event: "meta"; data: { conversation_id: string; message_id: string; model?: string } }
  | { event: "status"; data: { label_ar: string } }
  | { event: "tool_start"; data: { name: string; label_ar: string; kind: ToolTraceItem["kind"] } }
  | { event: "tool_end"; data: { name: string; ok: boolean; summary_ar?: string } }
  | { event: "delta"; data: { text: string } }
  | { event: "block"; data: ChatBlock }
  | { event: "done"; data: { usage?: { in: number; out: number } } }
  | { event: "error"; data: { code: string; message_ar: string } };

export async function streamChat(
  input: { conversation_id?: string | null; text: string; choice_id?: string },
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
  guestId?: string,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${FN_BASE}/ai-chat`, {
      method: "POST",
      headers: await authHeaders(guestId),
      body: JSON.stringify({
        conversation_id: input.conversation_id ?? null,
        message: { text: input.text, choice_id: input.choice_id },
      }),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return;
    throw new AiApiError("NETWORK", "انقطع الاتصال. حاول مرة أخرى.", 0);
  }

  if (!res.ok || !res.body) {
    const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const code = String(payload.code ?? payload.error ?? `HTTP_${res.status}`);
    throw new AiApiError(code, String(payload.message_ar ?? "حدث خطأ غير متوقع"), res.status, payload);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const ev of parser.push(decoder.decode(value, { stream: true }))) {
        onEvent(ev as ChatStreamEvent);
      }
    }
    for (const ev of parser.end()) onEvent(ev as ChatStreamEvent);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") return;
    throw new AiApiError("NETWORK", "انقطع الاتصال. حاول مرة أخرى.", 0);
  }
}

/** Quota-style errors that must show the AiUnavailableDialog instead of an inline error. */
export function isQuotaError(e: unknown): e is AiApiError {
  return e instanceof AiApiError && (e.code === "AI_QUOTA_EXCEEDED" || e.status === 429);
}

/** Per-user limit (student / guest) — shown inline, not as the platform dialog. */
export function isPersonalLimit(e: unknown): boolean {
  return isQuotaError(e) && /^actor_/.test(String(e.extra.reason ?? ""));
}
