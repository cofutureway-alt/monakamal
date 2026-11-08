// Read-only tools for the storefront / student / parent widget (Phase 8).
// No writes exist here. Personal tools are scoped to ctx.uid on the server,
// never to an id chosen by the model (parents: checked with is_active_parent_of).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { formatCairoAr } from "../pure/cairo.ts";
import { validateArgs } from "../pure/schema-validate.ts";
import type { ToolDef } from "../gateway.ts";
import { ASK_CLARIFICATION, toModelJson } from "./index.ts";
import { egp, ToolError, uuid, str } from "./types.ts";
import type { JsonSchema } from "../pure/schema-validate.ts";

export type WidgetRole = "guest" | "student" | "parent";

export interface PublicCtx {
  service: SupabaseClient;
  uid: string | null;
  role: WidgetRole;
}

interface PublicTool {
  name: string;
  label_ar: string;
  description: string;
  parameters: JsonSchema;
  roles: WidgetRole[];
  run: (ctx: PublicCtx, args: Record<string, unknown>) => Promise<{ result: Record<string, unknown>; summary_ar: string }>;
}

const like = (q: string) => `%${q.replace(/[%_\\]/g, (m) => `\\${m}`).trim()}%`;
const ALL: WidgetRole[] = ["guest", "student", "parent"];

function effectivePrice(row: { is_paid: boolean; price_piastres: number | null; discount_price_piastres: number | null; discount_expires_at: string | null }) {
  if (!row.is_paid) return { price: "مجانية", discount: null as string | null };
  const discountActive = row.discount_price_piastres != null && (!row.discount_expires_at || new Date(row.discount_expires_at) > new Date());
  return {
    price: egp(row.price_piastres),
    discount: discountActive ? `${egp(row.discount_price_piastres)} حتى ${row.discount_expires_at ? formatCairoAr(row.discount_expires_at, false) : "إشعار آخر"}` : null,
  };
}

async function stageNames(service: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await service.from("stages").select("id, name");
  return new Map((data ?? []).map((s) => [s.id, s.name]));
}

async function courseProgress(service: SupabaseClient, uid: string) {
  const { data: enr } = await service.from("enrollments").select("course_id, enrolled_at, courses(title, course_type)").eq("user_id", uid);
  const courseIds = (enr ?? []).map((e) => e.course_id);
  const totals = new Map<string, number>();
  if (courseIds.length) {
    const { data: units } = await service.from("units").select("id, course_id").in("course_id", courseIds);
    const u2c = new Map((units ?? []).map((u) => [u.id, u.course_id]));
    if (u2c.size) {
      const { data: lessons } = await service.from("lessons").select("unit_id").in("unit_id", [...u2c.keys()]);
      for (const l of lessons ?? []) totals.set(u2c.get(l.unit_id)!, (totals.get(u2c.get(l.unit_id)!) ?? 0) + 1);
    }
  }
  const { data: lp } = await service.from("lesson_progress").select("course_id").eq("user_id", uid);
  const done = new Map<string, number>();
  for (const r of lp ?? []) done.set(r.course_id, (done.get(r.course_id) ?? 0) + 1);
  return (enr ?? []).map((e) => ({
    // deno-lint-ignore no-explicit-any
    course: (e as any).courses?.title ?? null,
    progress_percent: totals.get(e.course_id) ? Math.round(((done.get(e.course_id) ?? 0) / totals.get(e.course_id)!) * 100) : 0,
    link: `/courses/${e.course_id}`,
  }));
}

async function results(service: SupabaseClient, uid: string) {
  const [{ data: qa }, { data: subs }] = await Promise.all([
    service.from("quiz_attempts").select("percentage, passed, status, submitted_at, quizzes(title)").eq("user_id", uid).eq("status", "graded").order("submitted_at", { ascending: false }).limit(10),
    service.from("assignment_submissions").select("grade, outcome, graded_at, assignments(title, total_grade)").eq("user_id", uid).not("graded_at", "is", null).order("graded_at", { ascending: false }).limit(10),
  ]);
  return {
    quizzes: (qa ?? []).map((r) => ({
      // deno-lint-ignore no-explicit-any
      quiz: (r as any).quizzes?.title,
      percent: r.percentage,
      passed: r.passed,
      date: r.submitted_at ? formatCairoAr(r.submitted_at, false) : null,
    })),
    assignments: (subs ?? []).map((r) => ({
      // deno-lint-ignore no-explicit-any
      assignment: (r as any).assignments?.title,
      // deno-lint-ignore no-explicit-any
      grade: `${r.grade} / ${(r as any).assignments?.total_grade}`,
      outcome: r.outcome === "passed" ? "ناجح" : r.outcome === "failed" ? "راسب" : r.outcome,
    })),
  };
}

async function upcomingSessions(service: SupabaseClient, uid: string) {
  const { data: enr } = await service.from("enrollments").select("course_id").eq("user_id", uid);
  const ids = (enr ?? []).map((e) => e.course_id);
  if (!ids.length) return [];
  const { data } = await service
    .from("live_sessions")
    .select("id, title, scheduled_start_at, duration_minutes, status, course_id, courses(title)")
    .in("course_id", ids)
    .in("status", ["scheduled", "live"])
    .gte("scheduled_start_at", new Date(Date.now() - 3 * 3600_000).toISOString())
    .lte("scheduled_start_at", new Date(Date.now() + 14 * 86400_000).toISOString())
    .order("scheduled_start_at")
    .limit(20);
  return (data ?? []).map((s) => ({
    title: s.title,
    // deno-lint-ignore no-explicit-any
    course: (s as any).courses?.title,
    starts: formatCairoAr(s.scheduled_start_at),
    duration_minutes: s.duration_minutes,
    live_now: s.status === "live",
    link: `/courses/${s.course_id}/learn/live_session/${s.id}`,
  }));
}

const TOOLS: PublicTool[] = [
  {
    name: "search_public_courses",
    label_ar: "يبحث في الدورات",
    description: "Search published courses (title, grade, price, link). Omit query to list them.",
    roles: ALL,
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { query: str("Part of the title.", 120, 0), stage_id: uuid("Grade id from list_stages.") },
    },
    async run(ctx, a) {
      let q = ctx.service
        .from("courses")
        .select("id, title, status, is_paid, price_piastres, discount_price_piastres, discount_expires_at, stage_ids, course_type")
        .in("status", ["published", "coming_soon"])
        .order("is_featured", { ascending: false })
        .limit(10);
      if (typeof a.query === "string" && a.query.trim()) q = q.ilike("title", like(a.query));
      if (a.stage_id) q = q.contains("stage_ids", [a.stage_id]);
      const [{ data }, names] = await Promise.all([q, stageNames(ctx.service)]);
      const courses = (data ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status === "coming_soon" ? "قريباً" : "متاحة",
        type: c.course_type === "live" ? "بث مباشر" : "مسجّلة",
        grades: (c.stage_ids ?? []).map((s: string) => names.get(s)).filter(Boolean),
        ...effectivePrice(c),
        link: `/courses/${c.id}`,
      }));
      return { result: { courses, total: courses.length }, summary_ar: `${courses.length} دورة` };
    },
  },
  {
    name: "get_public_course",
    label_ar: "يقرأ تفاصيل الدورة",
    description: "Public details of one published course: description, number of units / lessons, price, link.",
    roles: ALL,
    parameters: { type: "object", additionalProperties: false, required: ["course_id"], properties: { course_id: uuid("Course id.") } },
    async run(ctx, a) {
      const { data: c } = await ctx.service
        .from("courses")
        .select("id, title, description, status, is_paid, price_piastres, discount_price_piastres, discount_expires_at, course_type, stage_ids")
        .eq("id", String(a.course_id))
        .in("status", ["published", "coming_soon"])
        .maybeSingle();
      if (!c) throw new ToolError("NOT_FOUND", "الدورة غير متاحة");
      const { data: units } = await ctx.service.from("units").select("id, title").eq("course_id", c.id).order("position");
      const { count } = units?.length
        ? await ctx.service.from("lessons").select("id", { count: "exact", head: true }).in("unit_id", units.map((u) => u.id))
        : { count: 0 };
      const names = await stageNames(ctx.service);
      return {
        result: {
          title: c.title,
          description: String(c.description ?? "").slice(0, 1500),
          type: c.course_type === "live" ? "بث مباشر" : "مسجّلة",
          grades: (c.stage_ids ?? []).map((s: string) => names.get(s)).filter(Boolean),
          units: (units ?? []).map((u) => u.title).slice(0, 30),
          lessons_count: count ?? 0,
          ...effectivePrice(c),
          link: `/courses/${c.id}`,
        },
        summary_ar: c.title,
      };
    },
  },
  {
    name: "list_stages",
    label_ar: "يعرض المراحل الدراسية",
    description: "Grade levels offered on the platform.",
    roles: ALL,
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async run(ctx) {
      const { data } = await ctx.service.from("stages").select("id, name").order("order_index");
      return { result: { stages: data ?? [] }, summary_ar: `${data?.length ?? 0} مرحلة` };
    },
  },
  {
    name: "list_branches",
    label_ar: "يعرض أماكن التواجد",
    description: "In-person teaching locations (centres) by governorate.",
    roles: ALL,
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async run(ctx) {
      const { data } = await ctx.service.from("branches").select("governorate, branch_name, address_details").eq("is_active", true).order("order_index");
      return { result: { branches: data ?? [], page: "/branches" }, summary_ar: `${data?.length ?? 0} مكان` };
    },
  },
  {
    name: "get_how_to",
    label_ar: "يقرأ طريقة الاشتراك والدفع",
    description: "How to sign up, buy a course, pay (enabled methods) and redeem a code.",
    roles: ALL,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["topic"],
      properties: { topic: { type: "string", enum: ["signup", "payment", "redeem_code", "contact"] } },
    },
    async run(ctx, a) {
      if (a.topic === "payment") {
        const [{ data: gw }, { data: manual }] = await Promise.all([
          ctx.service.from("payment_gateways").select("display_name").eq("is_enabled", true),
          ctx.service.from("manual_payment_methods").select("method_type").eq("is_enabled", true),
        ]);
        return {
          result: {
            steps: ["افتح صفحة الدورة من /courses", "اضغط زر الاشتراك واختر طريقة الدفع", "بعد نجاح الدفع تظهر الدورة في /dashboard"],
            online_methods: (gw ?? []).map((g) => g.display_name),
            manual_methods: (manual ?? []).map((m) => m.method_type),
            wallet: "يمكن شحن المحفظة من /dashboard/wallet والدفع منها",
          },
          summary_ar: "طرق الدفع",
        };
      }
      if (a.topic === "contact") {
        const { data } = await ctx.service.from("platform_settings").select("social_links").limit(1).maybeSingle();
        return { result: { social_links: data?.social_links ?? [] }, summary_ar: "التواصل" };
      }
      const guides: Record<string, string[]> = {
        signup: ["افتح /signup", "أدخل الاسم ورقم الموبايل والمرحلة الدراسية وكلمة المرور", "سجّل الدخول من /login برقم الموبايل"],
        redeem_code: ["سجّل الدخول", "افتح /redeem", "اكتب كود الشراء لتفعيل الدورة أو الباقة"],
      };
      return { result: { steps: guides[String(a.topic)] ?? [] }, summary_ar: "الخطوات" };
    },
  },
  // ---------------------------------------------------------------- student
  {
    name: "get_my_courses",
    label_ar: "يعرض دوراتي",
    description: "The signed-in student's courses with progress %.",
    roles: ["student"],
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async run(ctx) {
      const courses = await courseProgress(ctx.service, ctx.uid!);
      return { result: { courses }, summary_ar: `${courses.length} دورة` };
    },
  },
  {
    name: "get_my_results",
    label_ar: "يعرض نتائجي",
    description: "The student's latest graded quizzes and assignments.",
    roles: ["student"],
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async run(ctx) {
      const r = await results(ctx.service, ctx.uid!);
      return { result: r, summary_ar: `${r.quizzes.length + r.assignments.length} نتيجة` };
    },
  },
  {
    name: "get_my_upcoming_sessions",
    label_ar: "يعرض جلساتي القادمة",
    description: "The student's live sessions in the next 14 days (and any live now).",
    roles: ["student"],
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async run(ctx) {
      const sessions = await upcomingSessions(ctx.service, ctx.uid!);
      return { result: { sessions }, summary_ar: `${sessions.length} جلسة` };
    },
  },
  {
    name: "get_my_active_assessments",
    label_ar: "يتحقق من الاختبارات والواجبات المفتوحة",
    description:
      "Quizzes the student is taking right now and assignments open and not yet submitted. Call before solving any problem; never give answers to these.",
    roles: ["student"],
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async run(ctx) {
      const uid = ctx.uid!;
      const now = new Date().toISOString();
      const { data: enr } = await ctx.service.from("enrollments").select("course_id").eq("user_id", uid);
      const ids = (enr ?? []).map((e) => e.course_id);
      const [{ data: attempts }, { data: openAsg }] = await Promise.all([
        ctx.service.from("quiz_attempts").select("quizzes(title)").eq("user_id", uid).eq("status", "in_progress"),
        ids.length
          ? ctx.service.from("assignments").select("id, title, description, end_at").in("course_id", ids).lte("start_at", now).gte("end_at", now)
          : Promise.resolve({ data: [] as { id: string; title: string; description: string | null; end_at: string }[] }),
      ]);
      const asgIds = (openAsg ?? []).map((a) => a.id);
      const { data: submitted } = asgIds.length
        ? await ctx.service.from("assignment_submissions").select("assignment_id").eq("user_id", uid).eq("status", "submitted").in("assignment_id", asgIds)
        : { data: [] as { assignment_id: string }[] };
      const done = new Set((submitted ?? []).map((s) => s.assignment_id));
      return {
        result: {
          // deno-lint-ignore no-explicit-any
          quizzes_in_progress: (attempts ?? []).map((a) => (a as any).quizzes?.title),
          open_assignments: (openAsg ?? [])
            .filter((a) => !done.has(a.id))
            .map((a) => ({ title: a.title, task: String(a.description ?? "").slice(0, 400), due: formatCairoAr(a.end_at) })),
        },
        summary_ar: "تم التحقق",
      };
    },
  },
  // ---------------------------------------------------------------- parent
  {
    name: "list_my_children",
    label_ar: "يعرض الأبناء المرتبطين",
    description: "Students linked to this parent account (ids for get_child_summary).",
    roles: ["parent"],
    parameters: { type: "object", additionalProperties: false, properties: {} },
    async run(ctx) {
      const { data } = await ctx.service
        .from("parent_student_links")
        .select("student_user_id, relationship, profiles:student_user_id(full_name, stages:stage_id(name))")
        .eq("parent_user_id", ctx.uid!)
        .eq("status", "approved"); // same rule as is_active_parent_of
      const children = (data ?? []).map((r) => ({
        child_id: r.student_user_id,
        // deno-lint-ignore no-explicit-any
        name: (r as any).profiles?.full_name,
        // deno-lint-ignore no-explicit-any
        grade: (r as any).profiles?.stages?.name ?? null,
      }));
      return { result: { children, link_page: "/parent/link" }, summary_ar: `${children.length} ابن` };
    },
  },
  {
    name: "get_child_summary",
    label_ar: "يقرأ متابعة الابن",
    description: "Courses with progress, latest results and upcoming live sessions for one linked child.",
    roles: ["parent"],
    parameters: { type: "object", additionalProperties: false, required: ["child_id"], properties: { child_id: uuid("From list_my_children.") } },
    async run(ctx, a) {
      const child = String(a.child_id);
      const { data: ok } = await ctx.service.rpc("is_active_parent_of", { _parent: ctx.uid, _student: child });
      if (!ok) throw new ToolError("NOT_LINKED", "هذا الطالب غير مرتبط بحسابك");
      const [courses, res, sessions, { data: p }] = await Promise.all([
        courseProgress(ctx.service, child),
        results(ctx.service, child),
        upcomingSessions(ctx.service, child),
        ctx.service.from("profiles").select("full_name").eq("id", child).maybeSingle(),
      ]);
      return { result: { name: p?.full_name, courses, results: res, upcoming_sessions: sessions }, summary_ar: p?.full_name ?? "الابن" };
    },
  },
];

export function publicToolsFor(role: WidgetRole) {
  return TOOLS.filter((t) => t.roles.includes(role));
}

export function publicToolDefs(role: WidgetRole): ToolDef[] {
  return [
    ...publicToolsFor(role).map((t) => ({ name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> })),
    { name: ASK_CLARIFICATION.name, description: ASK_CLARIFICATION.description, parameters: ASK_CLARIFICATION.parameters as Record<string, unknown> },
  ];
}

export function publicToolLabel(name: string): string {
  return TOOLS.find((t) => t.name === name)?.label_ar ?? (name === ASK_CLARIFICATION.name ? ASK_CLARIFICATION.label_ar : name);
}

export type PublicRunOutcome =
  | { kind: "read"; ok: true; summary_ar: string; modelContent: string }
  | { kind: "clarify"; ok: true; block: Record<string, unknown>; modelContent: string }
  | { kind: "error"; ok: false; message_ar: string; modelContent: string };

/** Never throws; tools outside the caller's role do not exist for the model. */
export async function runPublicTool(ctx: PublicCtx, name: string, args: Record<string, unknown>): Promise<PublicRunOutcome> {
  const err = (code: string, message_ar: string, detail = ""): PublicRunOutcome => ({
    kind: "error",
    ok: false,
    message_ar,
    modelContent: JSON.stringify({ error: code, message: message_ar, ...(detail ? { detail } : {}) }),
  });
  if (name === ASK_CLARIFICATION.name) {
    const problems = validateArgs(ASK_CLARIFICATION.parameters, args);
    if (problems.length) return err("INVALID_ARGS", "وسائط غير صالحة", problems.join("; "));
    return {
      kind: "clarify",
      ok: true,
      block: { type: "clarification", question: args.question, options: args.options, allow_free_text: args.allow_free_text },
      modelContent: JSON.stringify({ shown_to_user: true }),
    };
  }
  const tool = publicToolsFor(ctx.role).find((t) => t.name === name);
  if (!tool) return err("UNKNOWN_TOOL", "أداة غير متاحة");
  if ("__invalid_json" in args) return err("INVALID_ARGS", "وسائط غير صالحة");
  const problems = validateArgs(tool.parameters, args);
  if (problems.length) return err("INVALID_ARGS", "وسائط غير صالحة", problems.join("; "));
  try {
    const out = await tool.run(ctx, args);
    return { kind: "read", ok: true, summary_ar: out.summary_ar, modelContent: toModelJson(out.result) };
  } catch (e) {
    if (e instanceof ToolError) return err(e.code, e.message_ar);
    console.error("public_tool_failed", name, e instanceof Error ? e.message : String(e));
    return err("TOOL_FAILED", "حدث خطأ أثناء جلب المعلومات");
  }
}
