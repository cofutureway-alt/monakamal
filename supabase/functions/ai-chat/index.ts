// Admin AI chat (Phase 6). Streams Server-Sent Events:
//   meta · status · tool_start · tool_end · delta · block · done · error
// Writes are never executed here: write tools create ai_pending_actions rows
// that an admin confirms through ai-actions.
import { CORS, getCaller, json, serviceClient, type Caller } from "../_shared/ai/http.ts";
import {
  callModel,
  GATEWAY_ERROR_AR,
  GatewayError,
  loadProvider,
  type GatewayMessage,
  type ToolCall,
} from "../_shared/ai/gateway.ts";
import { buildAdminSystemPrompt } from "../_shared/ai/prompts/admin.ts";
import { buildGuestSystemPrompt, buildParentSystemPrompt, buildStudentSystemPrompt } from "../_shared/ai/prompts/public.ts";
import { publicToolDefs, publicToolLabel, runPublicTool, type PublicCtx, type WidgetRole } from "../_shared/ai/tools/public.ts";
import { ADMIN_TOOLS, getTool, runTool, toolDefs } from "../_shared/ai/tools/index.ts";
import type { ToolCtx } from "../_shared/ai/tools/types.ts";

const MAX_MODEL_CALLS = 6;
const BUDGET_MS = 100_000;
const HISTORY_MESSAGES = 30;
const MAX_INPUT_CHARS = 4000;
const WIDGET_MAX_INPUT_CHARS = 1500;
const WIDGET_MAX_MODEL_CALLS = 4;

interface Actor {
  type: "admin" | "student" | "parent" | "guest";
  uid: string | null;
  /** Per-actor quota key: user id, or sha256(ip|guest id) for guests. */
  quotaKey: string;
  /** sha256 of the guest id (conversation ownership); null for users. */
  guestKey: string | null;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface Round {
  text: string;
  calls: ToolCall[];
  results: { id: string; name: string; content: string }[];
}

interface TraceItem {
  name: string;
  label_ar: string;
  kind: "read" | "write" | "meta";
  ok: boolean;
  summary_ar?: string;
  ms: number;
}

// deno-lint-ignore no-explicit-any
type Json = any;

function quotaMessage(reason: string): string {
  if (reason === "plan_expired") return "انتهت صلاحية باقة الذكاء الاصطناعي.";
  if (reason === "actor_hour") return "وصلت إلى الحد المسموح من الرسائل في هذه الساعة.";
  if (reason === "actor_day") return "وصلت إلى الحد المسموح من الرسائل اليوم.";
  return "خدمة المحادثة الذكية غير متاحة حالياً. يرجى المحاولة لاحقاً.";
}

/** Rebuild provider-neutral history from stored messages. */
function buildHistory(rows: { role: string; content: Json }[]): GatewayMessage[] {
  const out: GatewayMessage[] = [];
  for (const r of rows) {
    const c = r.content ?? {};
    if (r.role === "user") {
      out.push({ role: "user", content: c.choice_id ? `${c.text}\n(اختيار: ${c.choice_id})` : String(c.text ?? "") });
    } else if (r.role === "assistant") {
      const rounds: Round[] = Array.isArray(c.rounds) ? c.rounds : [];
      if (!rounds.length) {
        if (c.text) out.push({ role: "assistant", content: String(c.text) });
        continue;
      }
      for (const rd of rounds) {
        if (rd.calls?.length) {
          out.push({ role: "assistant", content: rd.text ?? "", toolCalls: rd.calls });
          for (const res of rd.results ?? []) out.push({ role: "tool", toolCallId: res.id, name: res.name, content: res.content });
        } else if (rd.text) {
          out.push({ role: "assistant", content: rd.text });
        }
      }
    } else if (r.role === "tool") {
      // Outcome of a confirmed / cancelled proposal, as a system note in a user turn.
      out.push({
        role: "user",
        content: `[تحديث النظام — ليس من المدير] الإجراء ${c.tool ?? ""} (${c.action_id ?? ""}): ${c.status ?? ""}. ${c.result_summary_ar ?? c.error_ar ?? ""}`.trim(),
      });
    }
  }
  // Providers require the history to start with a user turn and contain no
  // dangling tool calls at the start.
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);

  const service = serviceClient();
  const caller = await getCaller(req, service);

  // ---- who is talking: admin / student / parent (JWT) or guest (anonymous id)
  let actor: Actor;
  if (caller) {
    if (caller.isBanned) return json({ code: "FORBIDDEN", message_ar: "هذا الحساب موقوف" }, 403);
    actor = { type: caller.role, uid: caller.uid, quotaKey: caller.uid, guestKey: null };
  } else {
    if (req.headers.get("Authorization")?.startsWith("Bearer ey")) {
      // A token was sent but is invalid/expired: do not silently downgrade to guest.
      return json({ code: "UNAUTHENTICATED", message_ar: "انتهت الجلسة، سجّل الدخول مرة أخرى" }, 401);
    }
    const gid = req.headers.get("x-ai-guest") ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gid)) {
      return json({ code: "UNAUTHENTICATED", message_ar: "يجب تسجيل الدخول" }, 401);
    }
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "0.0.0.0";
    actor = { type: "guest", uid: null, quotaKey: await sha256(`${ip}|${gid}`), guestKey: await sha256(`guest|${gid}`) };
  }
  const isAdmin = actor.type === "admin";

  let body: Json;
  try {
    body = await req.json();
  } catch {
    return json({ code: "BAD_REQUEST", message_ar: "طلب غير صالح" }, 400);
  }
  const text = String(body?.message?.text ?? "").trim();
  const choiceId = typeof body?.message?.choice_id === "string" ? body.message.choice_id.slice(0, 80) : undefined;
  const maxChars = isAdmin ? MAX_INPUT_CHARS : WIDGET_MAX_INPUT_CHARS;
  if (!text) return json({ code: "EMPTY", message_ar: "اكتب رسالتك أولاً" }, 400);
  if (text.length > maxChars) return json({ code: "TOO_LONG", message_ar: "الرسالة طويلة جداً" }, 400);

  const { data: settings } = await service.from("ai_settings").select("admin_chat_enabled, chatbot_enabled").eq("id", 1).maybeSingle();
  if (isAdmin && !settings?.admin_chat_enabled) {
    return json({ code: "AI_DISABLED", message_ar: "مساعد الإدارة متوقف من الإعدادات" }, 403);
  }
  if (!isAdmin && !settings?.chatbot_enabled) {
    return json({ code: "AI_DISABLED", message_ar: "المساعد الذكي غير متاح حالياً" }, 403);
  }

  let provider, apiKey: string;
  try {
    ({ provider, apiKey } = await loadProvider(service));
  } catch {
    return json({ code: "AI_NOT_CONFIGURED", message_ar: GATEWAY_ERROR_AR.AI_NOT_CONFIGURED }, 409);
  }
  if (provider.supports_tools === false) {
    return json({ code: "AI_TOOLS_UNSUPPORTED", message_ar: "النموذج النشط لا يدعم الأدوات. اختر مزوّداً آخر من الإعدادات." }, 409);
  }

  // Conversation (owner check) — create when absent.
  let conversationId: string | null = typeof body?.conversation_id === "string" ? body.conversation_id : null;
  if (conversationId) {
    const { data: conv } = await service.from("ai_conversations").select("id, user_id, guest_key, role").eq("id", conversationId).maybeSingle();
    const owns = conv && conv.role === actor.type &&
      (actor.uid ? conv.user_id === actor.uid : conv.guest_key === actor.guestKey);
    if (!owns) return json({ code: "NOT_FOUND", message_ar: "المحادثة غير موجودة" }, 404);
  } else {
    const { data: conv, error } = await service
      .from("ai_conversations")
      .insert({ user_id: actor.uid, guest_key: actor.guestKey, role: actor.type, title: null })
      .select("id")
      .single();
    if (error || !conv) return json({ code: "SAVE_FAILED", message_ar: "تعذّر بدء المحادثة" }, 500);
    conversationId = conv.id;
  }

  // Quota: one user message = one unit.
  const { data: quota, error: quotaError } = await service.rpc("ai_consume_quota", {
    _actor_type: actor.type,
    _actor_key: actor.quotaKey,
    _surface: isAdmin ? "admin_chat" : "widget",
    _conversation: conversationId,
  });
  if (quotaError) return json({ code: "QUOTA_CHECK_FAILED", message_ar: "تعذّر التحقق من الحصة" }, 500);
  if (!quota?.allowed) {
    return json(
      { code: "AI_QUOTA_EXCEEDED", reason: quota?.reason, resets_at: quota?.resets_at ?? null, message_ar: quotaMessage(quota?.reason) },
      429,
    );
  }
  const eventId: number = quota.event_id;

  // Store the user message, load context.
  await service.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: { text, ...(choiceId ? { choice_id: choiceId } : {}) },
  });
  const [{ data: recent }, { data: entities }] = await Promise.all([
    service
      .from("ai_messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_MESSAGES),
    service.from("ai_conversation_entities").select("entity_id").eq("conversation_id", conversationId),
  ]);
  const history = buildHistory((recent ?? []).reverse());

  const resolved = new Set<string>((entities ?? []).map((e) => String(e.entity_id).toLowerCase()));
  if (actor.uid) resolved.add(actor.uid.toLowerCase());
  // Admin tool context (only used when isAdmin; caller is non-null then).
  const ctx: ToolCtx = {
    service,
    caller: caller!,
    conversationId: conversationId!,
    resolved,
    async remember(items) {
      const fresh = items.filter((i) => i.id && !resolved.has(i.id.toLowerCase()));
      if (!fresh.length) return;
      for (const i of fresh) resolved.add(i.id.toLowerCase());
      await service
        .from("ai_conversation_entities")
        .upsert(fresh.map((i) => ({ conversation_id: conversationId, entity_id: i.id, entity_type: i.type })), {
          onConflict: "conversation_id,entity_id",
          ignoreDuplicates: true,
        });
    },
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // client went away; keep working so the message is still saved
        }
      };
      const started = Date.now();
      const usage = { in: 0, out: 0 };
      const rounds: Round[] = [];
      const trace: TraceItem[] = [];
      const blocks: Json[] = [];
      let finalText = "";
      let failed: { code: string; message_ar: string } | null = null;

      send("meta", { conversation_id: conversationId, model: provider.model_id });
      send("status", { label_ar: "يفكّر…" });

      try {
        const widgetRole = actor.type === "admin" ? null : (actor.type as WidgetRole);
        const system = !widgetRole
          ? buildAdminSystemPrompt({ adminName: caller?.fullName ?? null })
          : widgetRole === "student"
            ? buildStudentSystemPrompt({ name: caller?.fullName ?? null })
            : widgetRole === "parent"
              ? buildParentSystemPrompt({ name: caller?.fullName ?? null })
              : buildGuestSystemPrompt();
        const messages: GatewayMessage[] = [...history];
        const tools = widgetRole ? publicToolDefs(widgetRole) : toolDefs(ADMIN_TOOLS);
        const publicCtx: PublicCtx | null = widgetRole ? { service, uid: actor.uid, role: widgetRole } : null;
        const maxCalls = isAdmin ? MAX_MODEL_CALLS : WIDGET_MAX_MODEL_CALLS;
        let finished = false;

        for (let call = 0; call < maxCalls && !finished; call++) {
          if (Date.now() - started > BUDGET_MS) break;
          const res = await callModel({ provider, apiKey, system, messages, tools, toolChoice: "auto" });
          usage.in += res.usage.in;
          usage.out += res.usage.out;

          if (!res.toolCalls.length) {
            finalText = res.text;
            rounds.push({ text: res.text, calls: [], results: [] });
            finished = true;
            break;
          }

          const round: Round = { text: res.text, calls: res.toolCalls, results: [] };
          messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });
          let endTurn = false;
          let proposed = false;

          for (const tc of res.toolCalls) {
            const tool = publicCtx ? undefined : getTool(tc.name);
            const label = publicCtx ? publicToolLabel(tc.name) : tool?.label_ar ?? tc.name;
            const kind = publicCtx ? (tc.name === "ask_clarification" ? "meta" : "read") : tool?.kind ?? "read";
            send("tool_start", { name: tc.name, label_ar: label, kind });
            const t0 = Date.now();

            let content: string;
            // After a clarification or proposal in this round, the remaining
            // calls are skipped (the admin must answer / confirm first).
            if (endTurn) {
              content = JSON.stringify({ skipped: true, reason: "waiting for the user" });
              send("tool_end", { name: tc.name, ok: true, summary_ar: "تم التخطي" });
            } else if (publicCtx) {
              // Widget roles: read-only tools + clarification, nothing else exists.
              const out = await runPublicTool(publicCtx, tc.name, tc.arguments ?? {});
              content = out.modelContent;
              let summary = "";
              if (out.kind === "read") summary = out.summary_ar;
              else if (out.kind === "clarify") {
                blocks.push(out.block);
                summary = "سؤال توضيحي";
                endTurn = true;
              } else summary = out.message_ar;
              send("tool_end", { name: tc.name, ok: out.ok, summary_ar: summary });
              trace.push({ name: tc.name, label_ar: label, kind, ok: out.ok, summary_ar: summary, ms: Date.now() - t0 });
            } else {
              const out = await runTool(ctx, tc.name, tc.arguments ?? {});
              content = out.modelContent;
              let summary = "";
              if (out.kind === "read") {
                summary = out.output.summary_ar;
                if (out.output.report) blocks.push({ type: "report", ...out.output.report });
              } else if (out.kind === "write") {
                const p = out.proposal;
                const { data: action, error } = await service
                  .from("ai_pending_actions")
                  .insert({
                    conversation_id: conversationId,
                    created_by: actor.uid!, // admin branch: always a user
                    tool: tc.name,
                    args: tc.arguments,
                    preview: p,
                    destructive: Boolean(p.destructive),
                    confirm_phrase: p.destructive ? p.confirm_phrase ?? "تأكيد" : null,
                  })
                  .select("id, expires_at")
                  .single();
                if (error || !action) {
                  content = JSON.stringify({ error: "SAVE_FAILED", message: "تعذّر حفظ الاقتراح" });
                  summary = "تعذّر حفظ الاقتراح";
                } else {
                  blocks.push({
                    type: "action_proposal",
                    action_id: action.id,
                    tool: tc.name,
                    title_ar: p.title_ar,
                    fields: p.fields,
                    affected: p.affected ?? 1,
                    destructive: Boolean(p.destructive),
                    confirm_phrase: p.destructive ? p.confirm_phrase ?? "تأكيد" : null,
                    expires_at: action.expires_at,
                    ...(p.client_side ? { client_side: p.client_side, client_payload: p.client_payload } : {}),
                  });
                  content = JSON.stringify({ ...JSON.parse(out.modelContent), action_id: action.id });
                  summary = "اقتراح بانتظار التأكيد";
                  proposed = true;
                  endTurn = true;
                }
              } else if (out.kind === "clarify") {
                blocks.push(out.block);
                summary = "سؤال توضيحي";
                endTurn = true;
              } else {
                summary = out.message_ar;
              }
              send("tool_end", { name: tc.name, ok: out.ok, summary_ar: summary });
              trace.push({ name: tc.name, label_ar: label, kind, ok: out.ok, summary_ar: summary, ms: Date.now() - t0 });
            }
            round.results.push({ id: tc.id, name: tc.name, content });
            messages.push({ role: "tool", toolCallId: tc.id, name: tc.name, content });
          }

          rounds.push(round);
          if (endTurn) {
            finalText = res.text.trim() ||
              (proposed ? "جهّزت الإجراء التالي. راجع التفاصيل ثم اضغط «تأكيد التنفيذ» لتنفيذه، أو «إلغاء»." : "");
            finished = true;
          }
        }

        if (!finished) {
          finalText = "توقفت بعد عدة خطوات دون إكمال الطلب. حاول صياغة الطلب بشكل أدق أو قسّمه إلى خطوات.";
        }
      } catch (e) {
        const code = e instanceof GatewayError ? e.code : "AI_FAILED";
        failed = {
          code,
          message_ar: e instanceof GatewayError ? GATEWAY_ERROR_AR[e.code] : "حدث خطأ غير متوقع أثناء المعالجة",
        };
        console.error("ai_chat_failed", e instanceof Error ? e.message : String(e));
      }

      // Stream the final text in small chunks so the UI animates.
      if (!failed && finalText) {
        for (let i = 0; i < finalText.length; i += 40) {
          send("delta", { text: finalText.slice(i, i + 40) });
          await new Promise((r) => setTimeout(r, 12));
        }
      }
      for (const b of blocks) send("block", b);

      // Persist.
      const content: Json = failed
        ? { text: "", error: failed, tool_trace: trace }
        : { text: finalText, blocks, tool_trace: trace, rounds };
      const { data: saved } = await service
        .from("ai_messages")
        .insert({ conversation_id: conversationId, role: "assistant", content })
        .select("id")
        .single();
      const { data: conv } = await service.from("ai_conversations").select("title").eq("id", conversationId).single();
      await service
        .from("ai_conversations")
        .update({ updated_at: new Date().toISOString(), ...(conv?.title ? {} : { title: text.slice(0, 40) }) })
        .eq("id", conversationId);
      await service.rpc("ai_finish_usage", {
        _event_id: eventId,
        _tokens_in: usage.in,
        _tokens_out: usage.out,
        _provider: provider.id,
        _latency: Date.now() - started,
        _outcome: failed ? "error" : "ok",
      });

      if (failed) send("error", failed);
      else send("done", { usage, message_id: saved?.id ?? null });
      try {
        controller.close();
      } catch {
        // already closed
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

export type { Caller };
