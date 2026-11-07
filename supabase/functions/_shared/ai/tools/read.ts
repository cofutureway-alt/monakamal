// Read tools for the admin assistant. All run with the service client after
// the caller was verified as admin (ai-chat). Every UUID they return is
// remembered so write tools may reference it (entity guard).
import { formatCairoAr, periodStart } from "../pure/cairo.ts";
import { egp, maskPhone, str, ToolError, uuid, type ReadOutput, type ReadTool, type ToolCtx } from "./types.ts";

const like = (q: string) => `%${q.replace(/[%_\\]/g, (m) => `\\${m}`).trim()}%`;

function ambiguity<T>(matches: T[], total: number) {
  return {
    matches,
    total,
    ambiguous: total !== 1,
    ...(total !== 1
      ? {
          hint: total === 0
            ? "لا يوجد تطابق. أخبر المدير بذلك أو استدعِ ask_clarification لطلب اسم أدق."
            : "أكثر من تطابق. استدعِ ask_clarification بهذه الخيارات قبل أي إجراء.",
        }
      : {}),
  };
}

const STATUS_AR: Record<string, string> = {
  draft: "مسودة",
  coming_soon: "قريباً",
  published: "منشورة",
  archived: "مؤرشفة",
};

// ---------------------------------------------------------------- courses
const searchCourses: ReadTool = {
  kind: "read",
  name: "search_courses",
  label_ar: "يبحث في الدورات",
  description:
    "Search courses by (partial) title. Use before any action on a course. Returns at most 10 matches with ids; ambiguous=true means you must ask the admin which one.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      query: str("Part of the course title (Arabic or English). Omit to list recent courses.", 120, 0),
      status: { type: "string", enum: ["draft", "coming_soon", "published", "archived"] },
      course_type: { type: "string", enum: ["recorded", "live"] },
      stage_id: uuid("Filter by grade/stage id (from list_stages)."),
    },
  },
  async run(ctx, a) {
    let q = ctx.service
      .from("courses")
      .select("id, title, status, is_paid, price_piastres, discount_price_piastres, course_type, enrollment_mode, stage_ids", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(10);
    if (typeof a.query === "string" && a.query.trim()) q = q.ilike("title", like(a.query));
    if (a.status) q = q.eq("status", a.status);
    if (a.course_type) q = q.eq("course_type", a.course_type);
    if (a.stage_id) q = q.contains("stage_ids", [a.stage_id]);
    const { data, count, error } = await q;
    if (error) throw new ToolError("QUERY_FAILED", "تعذّر البحث في الدورات");
    const rows = data ?? [];
    await ctx.remember(rows.map((r) => ({ id: r.id, type: "course" })));
    const matches = rows.map((r) => ({
      id: r.id,
      title: r.title,
      status: STATUS_AR[r.status] ?? r.status,
      type: r.course_type === "live" ? "مباشرة" : "مسجّلة",
      price: r.is_paid ? egp(r.price_piastres) : "مجانية",
      discount_price: r.discount_price_piastres != null ? egp(r.discount_price_piastres) : null,
    }));
    return {
      result: ambiguity(matches, count ?? rows.length),
      summary_ar: `${count ?? rows.length} دورة`,
    };
  },
};

const getCourseOutline: ReadTool = {
  kind: "read",
  name: "get_course_outline",
  label_ar: "يقرأ محتوى الدورة",
  description:
    "Get one course with its units in order and every lesson, quiz, assignment and live session inside each unit (ids, titles, positions). Use to find a unit or lesson by name.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["course_id"],
    properties: { course_id: uuid("Course id from search_courses.") },
  },
  async run(ctx, a) {
    const id = String(a.course_id);
    const { data: course } = await ctx.service
      .from("courses")
      .select("id, title, status, is_paid, price_piastres, discount_price_piastres, discount_expires_at, course_type, enrollment_mode")
      .eq("id", id)
      .maybeSingle();
    if (!course) throw new ToolError("NOT_FOUND", "الدورة غير موجودة");
    const { data: units } = await ctx.service.from("units").select("id, title, position").eq("course_id", id).order("position");
    const unitIds = (units ?? []).map((u) => u.id);
    const empty = { data: [] as Record<string, unknown>[] };
    const [lessons, quizzes, assignments, sessions, enrolled] = await Promise.all([
      unitIds.length ? ctx.service.from("lessons").select("id, unit_id, title, position, video_provider").in("unit_id", unitIds) : empty,
      unitIds.length ? ctx.service.from("quizzes").select("id, unit_id, title, order_index").in("unit_id", unitIds) : empty,
      unitIds.length ? ctx.service.from("assignments").select("id, unit_id, title, order_index").in("unit_id", unitIds) : empty,
      ctx.service.from("live_sessions").select("id, unit_id, title, position, status, scheduled_start_at").eq("course_id", id).neq("status", "cancelled"),
      ctx.service.from("enrollments").select("id", { count: "exact", head: true }).eq("course_id", id),
    ]);
    // deno-lint-ignore no-explicit-any
    const pick = (rows: any[] | null | undefined, unitId: string, type: string, order: string) =>
      (rows ?? [])
        .filter((r) => r.unit_id === unitId)
        .map((r) => ({ id: r.id, type, title: r.title, order: r[order] }));
    const outline = (units ?? []).map((u, i) => ({
      unit_id: u.id,
      unit_number: i + 1,
      unit_title: u.title,
      items: [
        ...pick(lessons.data, u.id, "lesson", "position"),
        ...pick(quizzes.data, u.id, "quiz", "order_index"),
        ...pick(assignments.data, u.id, "assignment", "order_index"),
        ...pick(sessions.data, u.id, "live_session", "position"),
      ].sort((x, y) => Number(x.order) - Number(y.order)),
    }));
    await ctx.remember([
      { id: course.id, type: "course" },
      ...(units ?? []).map((u) => ({ id: u.id, type: "unit" })),
      ...(lessons.data ?? []).map((r) => ({ id: String(r.id), type: "lesson" })),
      ...(quizzes.data ?? []).map((r) => ({ id: String(r.id), type: "quiz" })),
      ...(assignments.data ?? []).map((r) => ({ id: String(r.id), type: "assignment" })),
      ...(sessions.data ?? []).map((r) => ({ id: String(r.id), type: "live_session" })),
    ]);
    return {
      result: {
        course: {
          id: course.id,
          title: course.title,
          status: STATUS_AR[course.status] ?? course.status,
          price: course.is_paid ? egp(course.price_piastres) : "مجانية",
          discount_price: course.discount_price_piastres != null ? egp(course.discount_price_piastres) : null,
          type: course.course_type === "live" ? "مباشرة" : "مسجّلة",
          enrolled_students: enrolled.count ?? 0,
        },
        units: outline,
      },
      summary_ar: `${outline.length} وحدة`,
    };
  },
};

// ---------------------------------------------------------------- students
const searchStudents: ReadTool = {
  kind: "read",
  name: "search_students",
  label_ar: "يبحث عن الطلاب",
  description:
    "Search students by name, phone (any part) or student code. Phones are masked. ambiguous=true means you must ask which student.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: str("Name, phone digits or student code.", 120),
      stage_id: uuid("Optional grade filter."),
    },
  },
  async run(ctx, a) {
    const q = String(a.query).trim();
    const digits = q.replace(/\D/g, "");
    const ors = [`full_name.ilike.${like(q)}`, `student_id.ilike.${like(q)}`];
    if (digits.length >= 4) ors.push(`phone_number.ilike.%${digits.slice(-9)}%`);
    let query = ctx.service
      .from("profiles")
      .select("id, full_name, student_id, phone_number, stage_id, is_banned, stages:stage_id(name)", { count: "exact" })
      .eq("role", "student")
      .or(ors.join(","))
      .limit(10);
    if (a.stage_id) query = query.eq("stage_id", a.stage_id);
    const { data, count, error } = await query;
    if (error) throw new ToolError("QUERY_FAILED", "تعذّر البحث عن الطلاب");
    const rows = data ?? [];
    await ctx.remember(rows.map((r) => ({ id: r.id, type: "student" })));
    const matches = rows.map((r) => ({
      id: r.id,
      name: r.full_name,
      code: r.student_id,
      phone: maskPhone(r.phone_number),
      // deno-lint-ignore no-explicit-any
      stage: (r as any).stages?.name ?? null,
      banned: r.is_banned,
    }));
    return { result: ambiguity(matches, count ?? rows.length), summary_ar: `${count ?? rows.length} طالب` };
  },
};

const getStudentSummary: ReadTool = {
  kind: "read",
  name: "get_student_summary",
  label_ar: "يقرأ ملف الطالب",
  description: "One student's enrollments with progress %, quiz average and last activity.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["user_id"],
    properties: { user_id: uuid("Student id from search_students.") },
  },
  async run(ctx, a) {
    const uid = String(a.user_id);
    const { data: p } = await ctx.service
      .from("profiles")
      .select("id, full_name, student_id, phone_number, is_banned, role, created_at, stages:stage_id(name)")
      .eq("id", uid)
      .maybeSingle();
    if (!p || p.role !== "student") throw new ToolError("NOT_FOUND", "الطالب غير موجود");
    const { data: enr } = await ctx.service
      .from("enrollments")
      .select("course_id, enrolled_at, courses(title)")
      .eq("user_id", uid);
    const courseIds = (enr ?? []).map((e) => e.course_id);
    const [{ data: lp }, { data: qa }] = await Promise.all([
      ctx.service.from("lesson_progress").select("course_id, completed_at").eq("user_id", uid),
      ctx.service.from("quiz_attempts").select("percentage, submitted_at, started_at").eq("user_id", uid).not("submitted_at", "is", null),
    ]);
    const totals = new Map<string, number>();
    if (courseIds.length) {
      const { data: units } = await ctx.service.from("units").select("id, course_id").in("course_id", courseIds);
      const unitToCourse = new Map((units ?? []).map((u) => [u.id, u.course_id]));
      if (unitToCourse.size) {
        const { data: lessons } = await ctx.service.from("lessons").select("unit_id").in("unit_id", [...unitToCourse.keys()]);
        for (const l of lessons ?? []) {
          const c = unitToCourse.get(l.unit_id)!;
          totals.set(c, (totals.get(c) ?? 0) + 1);
        }
      }
    }
    const done = new Map<string, number>();
    for (const r of lp ?? []) done.set(r.course_id, (done.get(r.course_id) ?? 0) + 1);
    const percents = (qa ?? []).map((r) => Number(r.percentage)).filter((n) => Number.isFinite(n));
    const lastTimes = [...(lp ?? []).map((r) => r.completed_at), ...(qa ?? []).map((r) => r.submitted_at)].filter(Boolean).sort();
    await ctx.remember([{ id: uid, type: "student" }, ...courseIds.map((id) => ({ id, type: "course" }))]);
    return {
      result: {
        student: {
          id: p.id,
          name: p.full_name,
          code: p.student_id,
          phone: maskPhone(p.phone_number),
          // deno-lint-ignore no-explicit-any
          stage: (p as any).stages?.name ?? null,
          banned: p.is_banned,
          joined: formatCairoAr(p.created_at, false),
        },
        enrollments: (enr ?? []).map((e) => ({
          course_id: e.course_id,
          // deno-lint-ignore no-explicit-any
          course: (e as any).courses?.title ?? null,
          progress_percent: totals.get(e.course_id) ? Math.round(((done.get(e.course_id) ?? 0) / totals.get(e.course_id)!) * 100) : 0,
          enrolled: formatCairoAr(e.enrolled_at, false),
        })),
        quiz_average_percent: percents.length ? Math.round(percents.reduce((s, n) => s + n, 0) / percents.length) : null,
        quizzes_submitted: percents.length,
        last_activity: lastTimes.length ? formatCairoAr(lastTimes[lastTimes.length - 1]) : null,
      },
      summary_ar: p.full_name ?? "طالب",
    };
  },
};

// ---------------------------------------------------------------- assessments
const listUngraded: ReadTool = {
  kind: "read",
  name: "list_ungraded_submissions",
  label_ar: "يعرض الواجبات غير المصححة",
  description: "Submitted assignment answers that have no grade yet (oldest first).",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      course_id: uuid("Optional course filter."),
      limit: { type: "integer", minimum: 1, maximum: 50 },
    },
  },
  async run(ctx, a) {
    let q = ctx.service
      .from("assignment_submissions")
      .select("id, submitted_at, user_id, assignment_id, assignments!inner(title, course_id, total_grade, pass_grade), profiles:user_id(full_name)", { count: "exact" })
      .eq("status", "submitted")
      .is("graded_at", null)
      .order("submitted_at", { ascending: true })
      .limit(Number(a.limit ?? 20));
    if (a.course_id) q = q.eq("assignments.course_id", a.course_id);
    const { data, count, error } = await q;
    if (error) throw new ToolError("QUERY_FAILED", "تعذّر تحميل التسليمات");
    const rows = data ?? [];
    await ctx.remember(rows.map((r) => ({ id: r.id, type: "submission" })));
    return {
      result: {
        total: count ?? rows.length,
        submissions: rows.map((r) => ({
          submission_id: r.id,
          // deno-lint-ignore no-explicit-any
          student: (r as any).profiles?.full_name ?? null,
          // deno-lint-ignore no-explicit-any
          assignment: (r as any).assignments?.title,
          // deno-lint-ignore no-explicit-any
          total_grade: (r as any).assignments?.total_grade,
          submitted: r.submitted_at ? formatCairoAr(r.submitted_at) : null,
        })),
      },
      summary_ar: `${count ?? rows.length} تسليم`,
    };
  },
};

const getQuizStats: ReadTool = {
  kind: "read",
  name: "get_quiz_stats",
  label_ar: "يحسب إحصائيات الاختبار",
  description: "Attempts, average score and pass rate for one quiz (submitted attempts only).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["quiz_id"],
    properties: { quiz_id: uuid("Quiz id from get_course_outline.") },
  },
  async run(ctx, a) {
    const { data: quiz } = await ctx.service.from("quizzes").select("id, title, pass_percentage").eq("id", a.quiz_id).maybeSingle();
    if (!quiz) throw new ToolError("NOT_FOUND", "الاختبار غير موجود");
    const { data: att } = await ctx.service
      .from("quiz_attempts")
      .select("user_id, percentage, passed")
      .eq("quiz_id", quiz.id)
      .not("submitted_at", "is", null);
    const rows = att ?? [];
    const pcts = rows.map((r) => Number(r.percentage)).filter(Number.isFinite);
    const avg = pcts.length ? Math.round(pcts.reduce((s, n) => s + n, 0) / pcts.length) : 0;
    const passRate = rows.length ? Math.round((rows.filter((r) => r.passed).length / rows.length) * 100) : 0;
    const buckets = [0, 0, 0, 0, 0];
    for (const p of pcts) buckets[Math.min(4, Math.floor(p / 20))]++;
    return {
      result: { quiz: quiz.title, attempts: rows.length, students: new Set(rows.map((r) => r.user_id)).size, average_percent: avg, pass_rate_percent: passRate },
      summary_ar: `${rows.length} محاولة`,
      report: {
        title: `إحصائيات: ${quiz.title}`,
        kpis: [
          { label: "المحاولات", value: rows.length },
          { label: "الطلاب", value: new Set(rows.map((r) => r.user_id)).size },
          { label: "متوسط الدرجة", value: avg, unit: "%" },
          { label: "نسبة النجاح", value: passRate, unit: "%" },
        ],
        chart: { type: "bar", x: ["0–19", "20–39", "40–59", "60–79", "80–100"], series: [{ name: "عدد المحاولات", data: buckets }] },
      },
    };
  },
};

// ---------------------------------------------------------------- reports
const PERIOD_SCHEMA = { type: "string" as const, enum: ["today", "7d", "30d", "month", "custom"] };

function resolvePeriod(a: Record<string, unknown>): { from: Date; to: Date; label: string } {
  const to = new Date();
  if (a.period === "custom") {
    const from = new Date(String(a.from ?? ""));
    const end = a.to ? new Date(String(a.to)) : to;
    if (Number.isNaN(from.getTime()) || Number.isNaN(end.getTime()) || from > end) {
      throw new ToolError("BAD_PERIOD", "حدد تاريخ البداية والنهاية بصيغة صحيحة");
    }
    return { from, to: end, label: `${formatCairoAr(from, false)} — ${formatCairoAr(end, false)}` };
  }
  const p = (a.period ?? "30d") as "today" | "7d" | "30d" | "month";
  const labels = { today: "اليوم", "7d": "آخر 7 أيام", "30d": "آخر 30 يوماً", month: "هذا الشهر" };
  return { from: periodStart(p), to, label: labels[p] };
}

const getSalesReport: ReadTool = {
  kind: "read",
  name: "get_sales_report",
  label_ar: "يُعدّ تقرير المبيعات",
  description: "Successful course and bundle sales in a period: totals, count and top items (EGP).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["period"],
    properties: {
      period: PERIOD_SCHEMA,
      from: { type: "string", format: "date-time", description: "Required when period=custom." },
      to: { type: "string", format: "date-time" },
    },
  },
  async run(ctx, a) {
    const { from, to, label } = resolvePeriod(a);
    const { data, error } = await ctx.service
      .from("payment_transactions")
      .select("amount_piastres, purpose, course_id, bundle_id, created_at, courses(title), bundles(title)")
      .eq("status", "success")
      .in("purpose", ["course_purchase", "bundle_purchase"])
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .limit(5000);
    if (error) throw new ToolError("QUERY_FAILED", "تعذّر حساب المبيعات");
    const rows = data ?? [];
    const total = rows.reduce((s, r) => s + Number(r.amount_piastres ?? 0), 0);
    const byItem = new Map<string, { title: string; count: number; amount: number }>();
    for (const r of rows) {
      // deno-lint-ignore no-explicit-any
      const anyR = r as any;
      const key = r.course_id ?? r.bundle_id ?? "other";
      const title = anyR.courses?.title ?? (anyR.bundles?.title ? `باقة: ${anyR.bundles.title}` : "غير معروف");
      const it = byItem.get(key) ?? { title, count: 0, amount: 0 };
      it.count++;
      it.amount += Number(r.amount_piastres ?? 0);
      byItem.set(key, it);
    }
    const top = [...byItem.values()].sort((x, y) => y.amount - x.amount).slice(0, 10);
    return {
      result: {
        period: label,
        total_egp: total / 100,
        sales_count: rows.length,
        top_items: top.map((t) => ({ title: t.title, count: t.count, amount_egp: t.amount / 100 })),
      },
      summary_ar: `${rows.length} عملية بيع`,
      report: {
        title: `تقرير المبيعات — ${label}`,
        kpis: [
          { label: "إجمالي المبيعات", value: (total / 100).toLocaleString("ar-EG"), unit: "ج.م" },
          { label: "عدد العمليات", value: rows.length },
          { label: "متوسط العملية", value: rows.length ? Math.round(total / rows.length / 100).toLocaleString("ar-EG") : 0, unit: "ج.م" },
        ],
        ...(top.length
          ? {
              chart: { type: "bar" as const, x: top.map((t) => t.title), series: [{ name: "المبيعات (ج.م)", data: top.map((t) => t.amount / 100) }] },
              table: { columns: ["الدورة / الباقة", "العدد", "المبلغ (ج.م)"], rows: top.map((t) => [t.title, t.count, t.amount / 100]) },
            }
          : {}),
      },
    };
  },
};

const getEngagementReport: ReadTool = {
  kind: "read",
  name: "get_engagement_report",
  label_ar: "يُعدّ تقرير النشاط",
  description: "Active students, completed lessons and quiz attempts in a period, optionally for one course.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["period"],
    properties: {
      period: PERIOD_SCHEMA,
      from: { type: "string", format: "date-time" },
      to: { type: "string", format: "date-time" },
      course_id: uuid("Optional course filter."),
    },
  },
  async run(ctx, a) {
    const { from, to, label } = resolvePeriod(a);
    let lpq = ctx.service.from("lesson_progress").select("user_id, completed_at, course_id").gte("completed_at", from.toISOString()).lte("completed_at", to.toISOString()).limit(10000);
    if (a.course_id) lpq = lpq.eq("course_id", a.course_id);
    let quizIds: string[] | null = null;
    if (a.course_id) {
      const { data: qz } = await ctx.service.from("quizzes").select("id").eq("course_id", a.course_id);
      quizIds = (qz ?? []).map((q) => q.id);
    }
    let qaq = ctx.service.from("quiz_attempts").select("user_id, started_at").gte("started_at", from.toISOString()).lte("started_at", to.toISOString()).limit(10000);
    if (quizIds) qaq = quizIds.length ? qaq.in("quiz_id", quizIds) : qaq.eq("quiz_id", "00000000-0000-0000-0000-000000000000");
    const [{ data: lp }, { data: qa }] = await Promise.all([lpq, qaq]);
    const active = new Set([...(lp ?? []).map((r) => r.user_id), ...(qa ?? []).map((r) => r.user_id)]);
    const byDay = new Map<string, number>();
    for (const r of lp ?? []) {
      const d = new Date(r.completed_at).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
      byDay.set(d, (byDay.get(d) ?? 0) + 1);
    }
    const days = [...byDay.keys()].sort();
    return {
      result: { period: label, active_students: active.size, lessons_completed: lp?.length ?? 0, quiz_attempts: qa?.length ?? 0 },
      summary_ar: `${active.size} طالب نشط`,
      report: {
        title: `تقرير النشاط — ${label}`,
        kpis: [
          { label: "طلاب نشطون", value: active.size },
          { label: "دروس مكتملة", value: lp?.length ?? 0 },
          { label: "محاولات اختبارات", value: qa?.length ?? 0 },
        ],
        ...(days.length > 1 ? { chart: { type: "line" as const, x: days, series: [{ name: "دروس مكتملة", data: days.map((d) => byDay.get(d)!) }] } } : {}),
      },
    };
  },
};

// ---------------------------------------------------------------- reference data
const listStages: ReadTool = {
  kind: "read",
  name: "list_stages",
  label_ar: "يعرض المراحل الدراسية",
  description: "All grade levels / stages with ids.",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  async run(ctx) {
    const { data } = await ctx.service.from("stages").select("id, name").order("order_index", { ascending: true });
    await ctx.remember((data ?? []).map((r) => ({ id: r.id, type: "stage" })));
    return { result: { stages: data ?? [] }, summary_ar: `${data?.length ?? 0} مرحلة` };
  },
};

const listSubjects: ReadTool = {
  kind: "read",
  name: "list_subjects",
  label_ar: "يعرض المواد",
  description: "All subjects with ids.",
  parameters: { type: "object", additionalProperties: false, properties: {} },
  async run(ctx) {
    const { data } = await ctx.service.from("subjects").select("id, name").order("name");
    await ctx.remember((data ?? []).map((r) => ({ id: r.id, type: "subject" })));
    return { result: { subjects: data ?? [] }, summary_ar: `${data?.length ?? 0} مادة` };
  },
};

const listLiveSessions: ReadTool = {
  kind: "read",
  name: "list_live_sessions",
  label_ar: "يعرض الجلسات المباشرة",
  description: "Live sessions in a date range (default: today → +14 days), optionally for one course. Times are Cairo.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      from: { type: "string", format: "date-time" },
      to: { type: "string", format: "date-time" },
      course_id: uuid("Optional course filter."),
    },
  },
  async run(ctx, a) {
    const from = a.from ? new Date(String(a.from)) : periodStart("today");
    const to = a.to ? new Date(String(a.to)) : new Date(Date.now() + 14 * 86_400_000);
    let q = ctx.service
      .from("live_sessions")
      .select("id, title, status, scheduled_start_at, duration_minutes, course_id, courses(title), host:host_user_id(full_name)")
      .gte("scheduled_start_at", from.toISOString())
      .lte("scheduled_start_at", to.toISOString())
      .order("scheduled_start_at")
      .limit(50);
    if (a.course_id) q = q.eq("course_id", a.course_id);
    const { data } = await q;
    await ctx.remember((data ?? []).map((r) => ({ id: r.id, type: "live_session" })));
    const STATUS = { scheduled: "مجدولة", live: "مباشر", ended: "انتهت", completed: "مكتملة", cancelled: "ملغاة" } as Record<string, string>;
    return {
      result: {
        sessions: (data ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          // deno-lint-ignore no-explicit-any
          course: (r as any).courses?.title,
          // deno-lint-ignore no-explicit-any
          host: (r as any).host?.full_name ?? null,
          starts: formatCairoAr(r.scheduled_start_at),
          duration_minutes: r.duration_minutes,
          status: STATUS[r.status] ?? r.status,
        })),
      },
      summary_ar: `${data?.length ?? 0} جلسة`,
    };
  },
};

export const READ_TOOLS: ReadTool[] = [
  searchCourses,
  getCourseOutline,
  searchStudents,
  getStudentSummary,
  listUngraded,
  getSalesReport,
  getEngagementReport,
  getQuizStats,
  listStages,
  listSubjects,
  listLiveSessions,
];

export type { ReadOutput, ToolCtx };
