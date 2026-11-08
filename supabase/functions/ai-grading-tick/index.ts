// AI grading worker. Called by pg_cron (via pg_net) with `x-cron-secret`
// whenever ai_grading_jobs has work. Processes jobs for up to ~100 s.
//   suggest     → stores the suggestion (teacher adopts it in the grading modal)
//   auto_apply  → writes the grade when confidence >= 0.6 (else stays a suggestion)
import { serviceClient } from "../_shared/ai/http.ts";
import { callModel, GatewayError, loadProvider, type ProviderRow } from "../_shared/ai/gateway.ts";
import { richDocToText } from "../_shared/ai/pure/rich-doc.ts";
import {
  ASSIGNMENT_TOOL,
  assignmentOutcome,
  buildAssignmentPrompt,
  buildQuizPrompt,
  extractJsonObject,
  GRADER_SYSTEM_AR,
  MIN_AUTO_CONFIDENCE,
  normalizeAssignmentGrade,
  normalizeQuizGrades,
  QUIZ_TOOL,
} from "../_shared/ai/pure/grading.ts";

const BUDGET_MS = 100_000;

interface Job {
  id: string;
  kind: "assignment" | "quiz_attempt";
  target_id: string;
  attempts: number;
}

type Service = ReturnType<typeof serviceClient>;

class Skip extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Forced tool call when supported; JSON-in-text otherwise. */
async function grade(
  provider: ProviderRow,
  apiKey: string,
  prompt: string,
  tool: { name: string; description: string; parameters: Record<string, unknown> },
) {
  const useTools = provider.supports_tools !== false;
  const res = await callModel({
    provider,
    apiKey,
    system: useTools ? GRADER_SYSTEM_AR : `${GRADER_SYSTEM_AR}\nأعد النتيجة ككائن JSON فقط بالحقول: ${Object.keys((tool.parameters as { properties: object }).properties).join(", ")}.`,
    messages: [{ role: "user", content: prompt }],
    tools: useTools ? [tool] : [],
    toolChoice: useTools ? tool.name : undefined,
    maxTokens: 1200,
    timeoutMs: 45_000,
  });
  const call = res.toolCalls.find((c) => c.name === tool.name);
  return { raw: call?.arguments ?? extractJsonObject(res.text), usage: res.usage, latency: res.latencyMs };
}

async function processAssignment(service: Service, job: Job, provider: ProviderRow, apiKey: string, mode: string) {
  const { data: sub } = await service
    .from("assignment_submissions")
    .select("id, status, text_content, graded_at, assignments(title, description, total_grade, pass_grade, courses(title))")
    .eq("id", job.target_id)
    .maybeSingle();
  if (!sub) throw new Skip("NOT_FOUND");
  if (sub.graded_at) throw new Skip("ALREADY_GRADED");
  if (sub.status !== "submitted") throw new Skip("NOT_SUBMITTED");
  // deno-lint-ignore no-explicit-any
  const asg = (sub as any).assignments;
  const answer = richDocToText(sub.text_content);
  if (!answer.trim()) {
    const { count } = await service.from("assignment_submission_files").select("id", { count: "exact", head: true }).eq("submission_id", sub.id);
    throw new Skip(count ? "FILES_ONLY" : "EMPTY");
  }

  const prompt = buildAssignmentPrompt({
    courseTitle: asg?.courses?.title ?? null,
    title: asg?.title ?? "",
    description: typeof asg?.description === "string" ? asg.description : richDocToText(asg?.description),
    totalGrade: Number(asg?.total_grade ?? 0),
    passGrade: Number(asg?.pass_grade ?? 0),
    answer: answer.slice(0, 12_000),
  });
  const out = await grade(provider, apiKey, prompt, ASSIGNMENT_TOOL);
  const g = normalizeAssignmentGrade(out.raw, Number(asg?.total_grade ?? 0));
  if (!g) throw new Error("UNPARSEABLE");

  let applied = false;
  if (mode === "auto_apply" && g.confidence >= MIN_AUTO_CONFIDENCE) {
    const now = new Date().toISOString();
    // Only if a teacher has not graded it in the meantime.
    const { data: upd } = await service
      .from("assignment_submissions")
      .update({
        grade: g.score,
        outcome: assignmentOutcome(g.score, Number(asg.pass_grade)),
        graded_at: now,
        graded_by: null,
        ...(g.feedback_ar ? { feedback: g.feedback_ar, feedback_given_at: now } : {}),
      })
      .eq("id", sub.id)
      .is("graded_at", null)
      .select("id");
    applied = Boolean(upd?.length);
  }
  return { result: g, applied, usage: out.usage, latency: out.latency };
}

async function processQuiz(service: Service, job: Job, provider: ProviderRow, apiKey: string, mode: string) {
  const { data: attempt } = await service.from("quiz_attempts").select("id, status").eq("id", job.target_id).maybeSingle();
  if (!attempt) throw new Skip("NOT_FOUND");
  if (attempt.status !== "needs_review") throw new Skip("NOT_PENDING");
  const { data: answers } = await service
    .from("quiz_answers")
    .select("question_id, fill_blank_text, is_correct, quiz_questions!inner(type, content, model_answer_text)")
    .eq("attempt_id", attempt.id)
    .eq("quiz_questions.type", "fill_blank")
    .is("is_correct", null);
  const items = (answers ?? []).map((a) => ({
    question_id: a.question_id as string,
    // deno-lint-ignore no-explicit-any
    question: richDocToText((a as any).quiz_questions?.content),
    // deno-lint-ignore no-explicit-any
    model_answer: ((a as any).quiz_questions?.model_answer_text as string | null) ?? null,
    answer: String(a.fill_blank_text ?? "").slice(0, 2000),
  }));
  if (!items.length) throw new Skip("NOTHING_TO_GRADE");

  // Blank answers are wrong without asking the model.
  const blank = items.filter((i) => !i.answer.trim());
  const toAsk = items.filter((i) => i.answer.trim());
  let graded = blank.map((i) => ({ question_id: i.question_id, is_correct: false, confidence: 1, rationale_ar: "إجابة فارغة" }));
  let usage = { in: 0, out: 0 };
  let latency = 0;
  if (toAsk.length) {
    const out = await grade(provider, apiKey, buildQuizPrompt(toAsk), QUIZ_TOOL);
    graded = [...graded, ...normalizeQuizGrades(out.raw, toAsk.map((i) => i.question_id))];
    usage = out.usage;
    latency = out.latency;
  }
  if (!graded.length) throw new Error("UNPARSEABLE");

  let applied = false;
  if (mode === "auto_apply") {
    const confident = graded.filter((g) => g.confidence >= MIN_AUTO_CONFIDENCE);
    if (confident.length) {
      const { error } = await service.rpc("ai_apply_quiz_grading", {
        _attempt_id: attempt.id,
        _updates: confident.map((g) => ({ question_id: g.question_id, is_correct: g.is_correct })),
      });
      if (error) throw new Error(`APPLY_FAILED:${error.message.slice(0, 120)}`);
      applied = confident.length === graded.length;
    }
  }
  return { result: { answers: graded }, applied, usage, latency };
}

Deno.serve(async (req) => {
  const expected = Deno.env.get("LIVE_CRON_SECRET");
  if (!expected || req.headers.get("x-cron-secret") !== expected) return json({ error: "UNAUTHORIZED" }, 401);

  const service = serviceClient();
  const started = Date.now();
  const report = { processed: 0, applied: 0, skipped: 0, failed: 0, note: "" };

  const { data: settings } = await service.from("ai_settings").select("grading_enabled, grading_mode, grading_provider_id").eq("id", 1).single();
  if (!settings?.grading_enabled) return json({ ...report, note: "grading disabled" });

  let provider: ProviderRow;
  let apiKey: string;
  try {
    ({ provider, apiKey } = await loadProvider(service, settings.grading_provider_id ?? undefined));
  } catch {
    return json({ ...report, note: "no provider" });
  }

  while (Date.now() - started < BUDGET_MS) {
    const { data: claimed } = await service.rpc("ai_grading_claim_next");
    const job = (claimed as Job[] | null)?.[0];
    if (!job) {
      report.note = "queue empty";
      break;
    }
    // System usage: recorded, never counted against the plan.
    const { data: quota } = await service.rpc("ai_consume_quota", {
      _actor_type: "system",
      _actor_key: `grading:${job.id}`,
      _surface: "grading",
      _conversation: null,
    });
    const eventId = quota?.event_id ?? null;
    try {
      const out = job.kind === "assignment"
        ? await processAssignment(service, job, provider, apiKey, settings.grading_mode)
        : await processQuiz(service, job, provider, apiKey, settings.grading_mode);
      await service.from("ai_grading_jobs").update({
        status: "done",
        result: out.result,
        mode: settings.grading_mode,
        applied: out.applied,
        applied_at: out.applied ? new Date().toISOString() : null,
        provider_id: provider.id,
        locked_until: null,
        error: null,
      }).eq("id", job.id);
      if (eventId) {
        await service.rpc("ai_finish_usage", { _event_id: eventId, _tokens_in: out.usage.in, _tokens_out: out.usage.out, _provider: provider.id, _latency: out.latency, _outcome: "ok" });
      }
      report.processed++;
      if (out.applied) report.applied++;
    } catch (e) {
      if (e instanceof Skip) {
        await service.from("ai_grading_jobs").update({ status: "skipped", error: e.reason, locked_until: null }).eq("id", job.id);
        if (eventId) await service.rpc("ai_finish_usage", { _event_id: eventId, _tokens_in: 0, _tokens_out: 0, _provider: provider.id, _latency: 0, _outcome: "skipped" });
        report.skipped++;
        continue;
      }
      const msg = e instanceof GatewayError ? e.code : e instanceof Error ? e.message : String(e);
      const giveUp = job.attempts >= 5;
      await service.from("ai_grading_jobs").update({
        status: giveUp ? "failed" : "pending",
        error: msg.slice(0, 300),
        locked_until: giveUp ? null : new Date(Date.now() + Math.min(2 ** job.attempts, 30) * 60_000).toISOString(),
      }).eq("id", job.id);
      if (eventId) await service.rpc("ai_finish_usage", { _event_id: eventId, _tokens_in: 0, _tokens_out: 0, _provider: provider.id, _latency: 0, _outcome: "error" });
      report.failed++;
      // A provider-wide problem (auth, rate limit) will hit every job: stop this run.
      if (e instanceof GatewayError && (e.code === "AI_AUTH" || e.code === "AI_RATE_LIMITED" || e.code === "AI_NOT_CONFIGURED")) break;
    }
  }
  return json(report);
});
