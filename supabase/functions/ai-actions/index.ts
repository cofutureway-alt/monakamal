// Executes (or cancels) an AI action proposal after the admin clicks in the UI.
// Re-validates against live data, enforces the type-to-confirm phrase for
// destructive actions, audits, and tells the conversation what happened.
import { audit, CORS, fail, getCaller, json, serviceClient } from "../_shared/ai/http.ts";
import { getWriteTool } from "../_shared/ai/tools/index.ts";
import { ToolError, type ToolCtx } from "../_shared/ai/tools/types.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", 405);

  const service = serviceClient();
  const caller = await getCaller(req, service);
  if (!caller) return fail("UNAUTHENTICATED", 401, "يجب تسجيل الدخول");
  if (caller.role !== "admin") return fail("FORBIDDEN", 403, "ليس لديك صلاحية");

  // deno-lint-ignore no-explicit-any
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return fail("BAD_REQUEST", 400);
  }
  const actionId = String(body.action_id ?? "");
  const decision = body.decision === "confirm" ? "confirm" : body.decision === "cancel" ? "cancel" : null;
  if (!/^[0-9a-f-]{36}$/i.test(actionId) || !decision) return fail("BAD_REQUEST", 400);

  await service.rpc("ai_expire_pending_actions");
  const { data: action } = await service.from("ai_pending_actions").select("*").eq("id", actionId).maybeSingle();
  if (!action) return fail("NOT_FOUND", 404, "الاقتراح غير موجود");
  if (action.created_by !== caller.uid) return fail("FORBIDDEN", 403, "هذا الاقتراح يخص مديراً آخر");
  if (action.status === "expired") return fail("EXPIRED", 410, "انتهت صلاحية الاقتراح — اطلبه مجدداً");
  if (!["pending", "failed"].includes(action.status)) return fail("ALREADY_DECIDED", 409, "تم التعامل مع هذا الاقتراح بالفعل");

  const tool = getWriteTool(action.tool);
  if (!tool) return fail("UNKNOWN_TOOL", 400, "أداة غير معروفة");

  const note = async (status: string, summary: string) => {
    await service.from("ai_messages").insert({
      conversation_id: action.conversation_id,
      role: "tool",
      content: { action_id: action.id, tool: action.tool, status, result_summary_ar: summary },
    });
    await service.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", action.conversation_id);
  };

  if (decision === "cancel") {
    const { data: claimed } = await service
      .from("ai_pending_actions")
      .update({ status: "cancelled" })
      .eq("id", action.id)
      .in("status", ["pending", "failed"])
      .select("id");
    if (!claimed?.length) return fail("ALREADY_DECIDED", 409, "تم التعامل مع هذا الاقتراح بالفعل");
    await note("cancelled", "ألغى المدير الإجراء");
    return json({ status: "cancelled" });
  }

  if (action.destructive) {
    const typed = String(body.confirm_text ?? "").trim();
    if (!action.confirm_phrase || typed !== String(action.confirm_phrase).trim()) {
      return fail("CONFIRM_MISMATCH", 400, "النص المكتوب لا يطابق عبارة التأكيد");
    }
  }

  // Claim atomically so a double click cannot execute twice.
  const { data: claimed } = await service
    .from("ai_pending_actions")
    .update({ status: "confirmed", error: null })
    .eq("id", action.id)
    .in("status", ["pending", "failed"])
    .gt("expires_at", new Date().toISOString())
    .select("id");
  if (!claimed?.length) return fail("ALREADY_DECIDED", 409, "تم التعامل مع هذا الاقتراح بالفعل");

  const ctx: ToolCtx = {
    service,
    caller,
    conversationId: action.conversation_id,
    resolved: new Set(),
    remember: async () => {},
  };

  try {
    const clientResult = body.client_result && typeof body.client_result === "object" ? body.client_result : undefined;
    const out = await tool.execute(ctx, action.args, clientResult);
    const result = { summary_ar: out.summary_ar, links: out.links ?? [], ...(out.data ?? {}) };
    await service
      .from("ai_pending_actions")
      .update({ status: "executed", executed_at: new Date().toISOString(), result })
      .eq("id", action.id);
    await audit(service, caller.uid, `ai.${action.tool}`, action.preview?.target ?? null, {
      args: action.args,
      conversation_id: action.conversation_id,
      action_id: action.id,
    });
    await note("executed", out.summary_ar);
    return json({
      status: "executed",
      result_summary_ar: out.summary_ar,
      links: out.links ?? [],
      payload: { ...(out.data ?? {}), ...(out.ephemeral ?? {}) },
    });
  } catch (e) {
    const message = e instanceof ToolError ? e.message_ar : "تعذّر تنفيذ الإجراء";
    if (!(e instanceof ToolError)) console.error("ai_action_failed", action.tool, e instanceof Error ? e.message : String(e));
    await service.from("ai_pending_actions").update({ status: "failed", error: message }).eq("id", action.id);
    await note("failed", message);
    return fail(e instanceof ToolError ? e.code : "EXECUTION_FAILED", 422, message);
  }
});
