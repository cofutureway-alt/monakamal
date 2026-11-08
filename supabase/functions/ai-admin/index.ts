// AI administration: settings, providers (write-only keys), connection test,
// plan change requests and usage data. Admin only; owner-only for applying plans.
import { audit, CORS, fail, getCaller, json, serviceClient } from "../_shared/ai/http.ts";
import {
  callModel,
  GATEWAY_ERROR_AR,
  GatewayError,
  type ApiFormat,
  type ProviderRow,
} from "../_shared/ai/gateway.ts";

const SETTINGS_FIELDS: Record<string, { type: "boolean" | "int" | "enum"; min?: number; max?: number; values?: string[] }> = {
  chatbot_enabled: { type: "boolean" },
  admin_chat_enabled: { type: "boolean" },
  grading_enabled: { type: "boolean" },
  grading_mode: { type: "enum", values: ["suggest", "auto_apply"] },
  student_limit_per_hour: { type: "int", min: 0, max: 1000 },
  student_limit_per_day: { type: "int", min: 0, max: 10000 },
  guest_limit_per_hour: { type: "int", min: 0, max: 1000 },
  guest_limit_per_day: { type: "int", min: 0, max: 10000 },
  count_admin_usage: { type: "boolean" },
};

interface CheckResult {
  key: "reachable" | "auth" | "model" | "tools" | "arabic";
  ok: boolean | null; // null = skipped
  ms: number;
  detail_ar: string;
}

const CHECK_ORDER: CheckResult["key"][] = ["reachable", "auth", "model", "tools", "arabic"];

function validateProviderInput(b: Record<string, unknown>): string | null {
  const name = String(b.name ?? "").trim();
  if (!name || name.length > 80) return "الاسم مطلوب (حتى 80 حرفاً)";
  if (b.api_format !== "openai_compatible" && b.api_format !== "anthropic") return "اختر صيغة المزوّد";
  const url = String(b.base_url ?? "").trim();
  if (!/^https:\/\/[^\s]+$/.test(url)) return "Base URL يجب أن يبدأ بـ https://";
  const model = String(b.model_id ?? "").trim();
  if (!model || model.length > 200) return "معرّف النموذج مطلوب";
  const t = Number(b.temperature ?? 0.2);
  if (!Number.isFinite(t) || t < 0 || t > 2) return "الحرارة بين 0 و 2";
  const m = Number(b.max_output_tokens ?? 2048);
  if (!Number.isInteger(m) || m < 64 || m > 32000) return "أقصى طول للرد بين 64 و 32000";
  return null;
}

async function runChecks(provider: ProviderRow, apiKey: string): Promise<{ checks: CheckResult[]; supportsTools: boolean | null }> {
  const checks: CheckResult[] = [];
  let supportsTools: boolean | null = null;
  const timed = async <T>(fn: () => Promise<T>) => {
    const t0 = Date.now();
    const v = await fn();
    return { v, ms: Date.now() - t0 };
  };
  const stopWith = (key: CheckResult["key"], ms: number, detail: string) => {
    checks.push({ key, ok: false, ms, detail_ar: detail });
    for (const k of CHECK_ORDER.slice(CHECK_ORDER.indexOf(key) + 1)) {
      checks.push({ key: k, ok: null, ms: 0, detail_ar: "تم التخطي" });
    }
  };

  // 1. reachable — any HTTP answer counts.
  try {
    const origin = new URL(provider.base_url).origin;
    const { ms } = await timed(async () => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      try {
        await fetch(origin, { method: "GET", signal: ctrl.signal });
      } finally {
        clearTimeout(t);
      }
    });
    checks.push({ key: "reachable", ok: true, ms, detail_ar: "الخادم متاح" });
  } catch {
    stopWith("reachable", 0, "تعذّر الوصول إلى الخادم (تحقق من Base URL)");
    return { checks, supportsTools };
  }

  // 2 + 3. auth and model with one minimal call.
  let pingMs = 0;
  try {
    const { v, ms } = await timed(() =>
      callModel({ provider, apiKey, system: "Reply with: ok", messages: [{ role: "user", content: "ping" }], maxTokens: 16, timeoutMs: 30_000 })
    );
    pingMs = ms;
    checks.push({ key: "auth", ok: true, ms, detail_ar: "المفتاح صالح" });
    if (!v.text.trim() && !v.toolCalls.length) {
      stopWith("model", ms, "النموذج لم يُرجع أي نص");
      return { checks, supportsTools };
    }
    checks.push({ key: "model", ok: true, ms, detail_ar: "النموذج يستجيب" });
  } catch (e) {
    const code = e instanceof GatewayError ? e.code : "AI_UNREACHABLE";
    if (code === "AI_AUTH") stopWith("auth", pingMs, "مفتاح API غير صالح");
    else {
      checks.push({ key: "auth", ok: true, ms: pingMs, detail_ar: "تم قبول الطلب" });
      stopWith("model", pingMs, code === "AI_MODEL_NOT_FOUND" ? "معرّف النموذج غير موجود" : GATEWAY_ERROR_AR[code as keyof typeof GATEWAY_ERROR_AR] ?? "فشل الاستدعاء");
    }
    return { checks, supportsTools };
  }

  // 4. tools — forced echo call.
  try {
    const { v, ms } = await timed(() =>
      callModel({
        provider,
        apiKey,
        system: "Call the echo tool with text set to ok.",
        messages: [{ role: "user", content: "Call echo with text ok." }],
        tools: [{ name: "echo", description: "Echo text back.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }],
        toolChoice: "echo",
        maxTokens: 64,
        timeoutMs: 30_000,
      })
    );
    const call = v.toolCalls.find((c) => c.name === "echo");
    supportsTools = Boolean(call && typeof call.arguments.text === "string");
    checks.push({
      key: "tools",
      ok: supportsTools,
      ms,
      detail_ar: supportsTools ? "يدعم استدعاء الأدوات" : "النموذج لا يدعم استدعاء الأدوات",
    });
  } catch {
    supportsTools = false;
    checks.push({ key: "tools", ok: false, ms: 0, detail_ar: "النموذج لا يدعم استدعاء الأدوات" });
  }

  // 5. arabic — runs even when tools failed (chat-only models can still be useful).
  try {
    const { v, ms } = await timed(() =>
      callModel({
        provider,
        apiKey,
        system: "أنت مساعد مختصر.",
        messages: [{ role: "user", content: 'أجب بكلمة واحدة فقط: ما عكس كلمة "نعم"؟' }],
        maxTokens: 32,
        timeoutMs: 30_000,
      })
    );
    const ok = /[؀-ۿ]/.test(v.text);
    checks.push({ key: "arabic", ok, ms, detail_ar: ok ? "يدعم العربية" : "الرد لم يكن بالعربية" });
  } catch {
    checks.push({ key: "arabic", ok: false, ms: 0, detail_ar: "فشل اختبار العربية" });
  }
  return { checks, supportsTools };
}

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
  const action = String(body.action ?? "");

  // ------------------------------------------------------------ read model
  if (action === "get_settings") {
    const [settings, providers, plans, sub, requests, snapshot] = await Promise.all([
      service.from("ai_settings").select("*").eq("id", 1).single(),
      service.from("ai_providers").select("*").order("created_at"),
      service.from("ai_plans").select("*").order("sort"),
      service.from("ai_subscription").select("*").eq("id", 1).single(),
      service.from("ai_plan_change_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
      service.rpc("ai_usage_snapshot"),
    ]);
    return json({
      settings: settings.data,
      providers: providers.data ?? [],
      plans: plans.data ?? [],
      subscription: sub.data,
      pending_requests: requests.data ?? [],
      usage: snapshot.data,
      viewer: { is_primary_admin: caller.isPrimaryAdmin },
    });
  }

  if (action === "usage_snapshot") {
    const { data } = await service.rpc("ai_usage_snapshot");
    return json({ usage: data });
  }

  if (action === "usage_daily") {
    const { data, error } = await service.rpc("ai_usage_daily", { _days: 30 });
    if (error) return fail("QUERY_FAILED", 500);
    return json({ rows: data ?? [] });
  }

  if (action === "usage_log") {
    const actor = typeof body.actor_type === "string" ? body.actor_type : null;
    let q = service
      .from("ai_usage_events")
      .select("id, occurred_at, actor_type, actor_key, surface, counted, tokens_in, tokens_out, latency_ms, outcome")
      .order("occurred_at", { ascending: false })
      .limit(100);
    if (actor) q = q.eq("actor_type", actor);
    const { data } = await q;
    // Mask actor keys: last 6 chars only.
    const rows = (data ?? []).map((r) => ({ ...r, actor_key: `…${String(r.actor_key).slice(-6)}` }));
    return json({ rows });
  }

  // ------------------------------------------------------------ settings
  if (action === "update_settings") {
    const patch: Record<string, unknown> = {};
    for (const [k, rule] of Object.entries(SETTINGS_FIELDS)) {
      if (!(k in body)) continue;
      const v = body[k];
      if (rule.type === "boolean" && typeof v !== "boolean") return fail("INVALID", 400, `قيمة غير صالحة: ${k}`);
      if (rule.type === "int" && (!Number.isInteger(v) || v < rule.min! || v > rule.max!)) {
        return fail("INVALID", 400, `القيمة يجب أن تكون بين ${rule.min} و ${rule.max}`);
      }
      if (rule.type === "enum" && !rule.values!.includes(v)) return fail("INVALID", 400, `قيمة غير صالحة: ${k}`);
      patch[k] = v;
    }
    if (!Object.keys(patch).length) return fail("NOTHING_TO_UPDATE", 400);
    const { data, error } = await service
      .from("ai_settings")
      .update({ ...patch, updated_by: caller.uid, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("*")
      .single();
    if (error) return fail("UPDATE_FAILED", 500);
    await audit(service, caller.uid, "ai.settings.update", null, { changed: patch });
    return json({ settings: data });
  }

  // ------------------------------------------------------------ providers
  if (action === "save_provider") {
    const err = validateProviderInput(body);
    if (err) return fail("INVALID", 400, err);
    const row = {
      name: String(body.name).trim(),
      api_format: body.api_format as ApiFormat,
      base_url: String(body.base_url).trim().replace(/\/+$/, ""),
      model_id: String(body.model_id).trim(),
      temperature: Number(body.temperature ?? 0.2),
      max_output_tokens: Number(body.max_output_tokens ?? 2048),
    };
    const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
    let id = typeof body.id === "string" ? body.id : null;

    if (id) {
      const { error } = await service.from("ai_providers").update({
        ...row,
        ...(apiKey ? { key_last4: apiKey.slice(-4), supports_tools: null, last_test_at: null, last_test_result: null } : {}),
      }).eq("id", id);
      if (error) return fail("SAVE_FAILED", 500);
    } else {
      if (!apiKey) return fail("INVALID", 400, "مفتاح API مطلوب");
      const { data, error } = await service
        .from("ai_providers")
        .insert({ ...row, key_last4: apiKey.slice(-4), created_by: caller.uid })
        .select("id")
        .single();
      if (error || !data) return fail("SAVE_FAILED", 500);
      id = data.id;
    }
    if (apiKey) {
      const { error } = await service
        .from("ai_provider_secrets")
        .upsert({ provider_id: id, api_key: apiKey, updated_at: new Date().toISOString() }, { onConflict: "provider_id" });
      if (error) return fail("SAVE_FAILED", 500);
    }
    await audit(service, caller.uid, "ai.provider.save", id, { ...row, key_changed: Boolean(apiKey) });
    const { data: saved } = await service.from("ai_providers").select("*").eq("id", id).single();
    return json({ provider: saved });
  }

  if (action === "delete_provider") {
    const id = String(body.id ?? "");
    const { data: s } = await service.from("ai_settings").select("active_provider_id, grading_provider_id").eq("id", 1).single();
    if (s?.active_provider_id === id || s?.grading_provider_id === id) {
      return fail("PROVIDER_IN_USE", 409, "لا يمكن حذف المزوّد النشط");
    }
    const { error } = await service.from("ai_providers").delete().eq("id", id);
    if (error) return fail("DELETE_FAILED", 500);
    await audit(service, caller.uid, "ai.provider.delete", id, {});
    return json({ ok: true });
  }

  if (action === "set_active_provider") {
    const id = String(body.id ?? "");
    const kind = body.kind === "grading" ? "grading_provider_id" : "active_provider_id";
    const { data: p } = await service.from("ai_providers").select("id, supports_tools").eq("id", id).maybeSingle();
    if (!p) return fail("NOT_FOUND", 404, "المزوّد غير موجود");
    await service.from("ai_settings").update({ [kind]: id, updated_by: caller.uid, updated_at: new Date().toISOString() }).eq("id", 1);
    await audit(service, caller.uid, "ai.provider.activate", id, { kind });
    return json({ ok: true, warning: p.supports_tools === false ? "TOOLS_UNSUPPORTED" : null });
  }

  if (action === "test_provider") {
    let provider: ProviderRow;
    let apiKey: string;
    if (body.draft && typeof body.draft === "object") {
      const err = validateProviderInput(body.draft);
      if (err) return fail("INVALID", 400, err);
      provider = {
        id: "draft",
        name: String(body.draft.name),
        api_format: body.draft.api_format,
        base_url: String(body.draft.base_url).trim().replace(/\/+$/, ""),
        model_id: String(body.draft.model_id).trim(),
        temperature: Number(body.draft.temperature ?? 0.2),
        max_output_tokens: Number(body.draft.max_output_tokens ?? 2048),
        supports_tools: null,
      };
      apiKey = String(body.draft.api_key ?? "").trim();
      // Editing an existing provider without retyping the key: use the stored one.
      if (!apiKey && typeof body.id === "string") {
        const { data: s } = await service.from("ai_provider_secrets").select("api_key").eq("provider_id", body.id).maybeSingle();
        apiKey = s?.api_key ?? "";
      }
      if (!apiKey) return fail("INVALID", 400, "مفتاح API مطلوب للاختبار");
    } else {
      const id = String(body.id ?? "");
      const [{ data: p }, { data: s }] = await Promise.all([
        service.from("ai_providers").select("*").eq("id", id).maybeSingle(),
        service.from("ai_provider_secrets").select("api_key").eq("provider_id", id).maybeSingle(),
      ]);
      if (!p || !s) return fail("NOT_FOUND", 404, "المزوّد غير موجود");
      provider = p;
      apiKey = s.api_key;
    }

    const started = Date.now();
    const { checks, supportsTools } = await runChecks(provider, apiKey);
    const result = { checks, at: new Date().toISOString() };
    if (provider.id !== "draft") {
      await service.from("ai_providers").update({
        last_test_at: result.at,
        last_test_result: result,
        supports_tools: supportsTools,
      }).eq("id", provider.id);
    } else if (typeof body.id === "string") {
      await service.from("ai_providers").update({ last_test_at: result.at, last_test_result: result, supports_tools: supportsTools }).eq("id", body.id);
    }
    await service.from("ai_usage_events").insert({
      actor_type: "admin",
      actor_key: caller.uid,
      surface: "test",
      counted: false,
      latency_ms: Date.now() - started,
      outcome: checks.every((c) => c.ok !== false) ? "ok" : "test_failed",
      provider_id: provider.id === "draft" ? null : provider.id,
    });
    return json({ result, supports_tools: supportsTools });
  }

  // ------------------------------------------------------------ plans
  if (action === "request_plan_change") {
    const to = String(body.to_plan ?? "");
    const { data: plan } = await service.from("ai_plans").select("id, name_ar, price_usd_cents").eq("id", to).maybeSingle();
    if (!plan) return fail("NOT_FOUND", 404, "الباقة غير موجودة");
    const { data: sub } = await service.from("ai_subscription").select("plan_id").eq("id", 1).single();
    if (sub?.plan_id === to) return fail("SAME_PLAN", 409, "هذه هي باقتك الحالية");
    const { data: reqRow, error } = await service
      .from("ai_plan_change_requests")
      .insert({ requested_by: caller.uid, from_plan: sub?.plan_id ?? "base", to_plan: to })
      .select("*")
      .single();
    if (error) return fail("SAVE_FAILED", 500);
    const { data: owners } = await service.from("profiles").select("id").eq("is_primary_admin", true);
    if (owners?.length) {
      await service.from("notifications").insert(owners.map((o) => ({
        user_id: o.id,
        type: "ai_plan_change_requested",
        title: "طلب ترقية باقة الذكاء الاصطناعي",
        body: `طلب ${caller.fullName ?? "أحد المديرين"} الترقية إلى ${plan.name_ar} ($${plan.price_usd_cents / 100} شهرياً).`,
        template_data: { request_id: reqRow.id, to_plan: to },
        action_url: "/admin/settings/ai#plan",
        related_entity_type: "ai_plan_change_request",
        related_entity_id: reqRow.id,
      })));
    }
    await audit(service, caller.uid, "ai.plan.request", reqRow.id, { to_plan: to });
    return json({ request: reqRow });
  }

  if (action === "apply_plan_change") {
    if (!caller.isPrimaryAdmin) return fail("FORBIDDEN", 403, "تطبيق الباقات متاح لمالك المنصة فقط");
    const id = String(body.request_id ?? "");
    const decision = body.decision === "applied" ? "applied" : body.decision === "rejected" ? "rejected" : null;
    if (!decision) return fail("INVALID", 400);
    const { data: r } = await service.from("ai_plan_change_requests").select("*").eq("id", id).maybeSingle();
    if (!r || r.status !== "pending") return fail("NOT_PENDING", 409, "الطلب غير معلّق");
    await service.from("ai_plan_change_requests").update({
      status: decision,
      decided_at: new Date().toISOString(),
      decided_by: caller.uid,
    }).eq("id", id);
    if (decision === "applied") {
      await service.from("ai_subscription").update({
        plan_id: r.to_plan,
        updated_by: caller.uid,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
    }
    await audit(service, caller.uid, `ai.plan.${decision}`, id, { to_plan: r.to_plan });
    return json({ ok: true });
  }

  // ------------------------------------------------------------ grading
  if (action === "enqueue_grading") {
    const kind = body.kind === "quiz_attempt" ? "quiz_attempt" : body.kind === "assignment" ? "assignment" : null;
    const targetId = String(body.target_id ?? "");
    if (!kind || !/^[0-9a-f-]{36}$/i.test(targetId)) return fail("INVALID", 400);
    const { data: s } = await service.from("ai_settings").select("grading_enabled").eq("id", 1).single();
    if (!s?.grading_enabled) return fail("GRADING_DISABLED", 409, "فعّل التصحيح الآلي من إعدادات الذكاء الاصطناعي أولاً");
    const table = kind === "assignment" ? "assignment_submissions" : "quiz_attempts";
    const { data: target } = await service.from(table).select("id").eq("id", targetId).maybeSingle();
    if (!target) return fail("NOT_FOUND", 404, "العنصر غير موجود");
    const { data: job, error } = await service
      .from("ai_grading_jobs")
      .upsert(
        { kind, target_id: targetId, status: "pending", attempts: 0, locked_until: null, error: null, result: null, applied: false, applied_at: null },
        { onConflict: "kind,target_id" },
      )
      .select("*")
      .single();
    if (error || !job) return fail("SAVE_FAILED", 500);
    await audit(service, caller.uid, "ai.grading.enqueue", targetId, { kind });
    return json({ job });
  }

  return fail("UNKNOWN_ACTION", 400);
});
