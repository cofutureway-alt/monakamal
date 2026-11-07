// Write tools. `prepare` validates against live data and returns a preview;
// nothing changes until an admin confirms in the UI and ai-actions calls
// `execute` (which re-checks everything, because state may have changed).
import { cairoLocalToUtc, formatCairoAr } from "../pure/cairo.ts";
import { textToRichDoc } from "../pure/rich-doc.ts";
import { egp, maskPhone, str, ToolError, uuid, type ToolCtx, type WriteTool } from "./types.ts";

// ---------------------------------------------------------------- shared lookups
async function getCourse(ctx: ToolCtx, id: unknown) {
  const { data } = await ctx.service
    .from("courses")
    .select("id, title, status, is_paid, price_piastres, discount_price_piastres, discount_expires_at, enrollment_mode")
    .eq("id", String(id))
    .maybeSingle();
  if (!data) throw new ToolError("NOT_FOUND", "الدورة غير موجودة");
  return data;
}

async function getUnit(ctx: ToolCtx, id: unknown) {
  const { data } = await ctx.service
    .from("units")
    .select("id, title, course_id, courses(title)")
    .eq("id", String(id))
    .maybeSingle();
  if (!data) throw new ToolError("NOT_FOUND", "الوحدة غير موجودة");
  // deno-lint-ignore no-explicit-any
  return { ...data, course_title: (data as any).courses?.title as string };
}

async function getStudent(ctx: ToolCtx, id: unknown) {
  const { data } = await ctx.service
    .from("profiles")
    .select("id, full_name, role, is_banned, phone_number")
    .eq("id", String(id))
    .maybeSingle();
  if (!data || data.role !== "student") throw new ToolError("NOT_FOUND", "الطالب غير موجود");
  return data;
}

/** Next free slot in a unit across lessons, quizzes, assignments and live sessions. */
async function nextUnitSlot(ctx: ToolCtx, unitId: string): Promise<number> {
  const [l, q, a, s] = await Promise.all([
    ctx.service.from("lessons").select("position").eq("unit_id", unitId).order("position", { ascending: false }).limit(1).maybeSingle(),
    ctx.service.from("quizzes").select("order_index").eq("unit_id", unitId).order("order_index", { ascending: false }).limit(1).maybeSingle(),
    ctx.service.from("assignments").select("order_index").eq("unit_id", unitId).order("order_index", { ascending: false }).limit(1).maybeSingle(),
    ctx.service.from("live_sessions").select("position").eq("unit_id", unitId).order("position", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return Math.max(l.data?.position ?? 0, q.data?.order_index ?? 0, a.data?.order_index ?? 0, s.data?.position ?? 0) + 1;
}

const toPiastres = (egpValue: unknown) => Math.round(Number(egpValue) * 100);
const fail = (code: string, ar: string): never => {
  throw new ToolError(code, ar);
};

// ---------------------------------------------------------------- courses
const createCourseDraft: WriteTool = {
  kind: "write",
  name: "create_course_draft",
  label_ar: "يجهّز دورة جديدة",
  description:
    "Propose creating a new course as a DRAFT (not visible to students). stage_ids and subject_ids must come from list_stages / list_subjects.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["title", "stage_ids", "is_paid", "course_type"],
    properties: {
      title: str("Course title.", 200),
      description: str("Course description.", 4000, 0),
      stage_ids: { type: "array", minItems: 1, maxItems: 10, items: uuid("Stage id") },
      subject_ids: { type: "array", maxItems: 10, items: uuid("Subject id") },
      is_paid: { type: "boolean" },
      price_egp: { type: "number", minimum: 0, maximum: 1000000, description: "Required when is_paid=true." },
      course_type: { type: "string", enum: ["recorded", "live"] },
    },
  },
  async prepare(ctx, a) {
    if (a.is_paid && !(Number(a.price_egp) > 0)) fail("MISSING_PRICE", "حدد سعر الدورة المدفوعة");
    const stageIds = a.stage_ids as string[];
    const subjectIds = (a.subject_ids as string[] | undefined) ?? [];
    const [{ data: stages }, { data: subjects }] = await Promise.all([
      ctx.service.from("stages").select("id, name").in("id", stageIds),
      subjectIds.length ? ctx.service.from("subjects").select("id, name").in("id", subjectIds) : Promise.resolve({ data: [] }),
    ]);
    if ((stages ?? []).length !== stageIds.length) fail("NOT_FOUND", "مرحلة غير موجودة");
    return {
      title_ar: "إنشاء دورة جديدة (مسودة)",
      fields: [
        { label: "العنوان", after: String(a.title) },
        { label: "النوع", after: a.course_type === "live" ? "مباشرة" : "مسجّلة" },
        { label: "المراحل", after: (stages ?? []).map((s) => s.name).join("، ") },
        ...(subjects?.length ? [{ label: "المواد", after: subjects.map((s) => s.name).join("، ") }] : []),
        { label: "السعر", after: a.is_paid ? egp(toPiastres(a.price_egp)) : "مجانية" },
        { label: "الحالة", after: "مسودة (غير منشورة)" },
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const { data, error } = await ctx.service
      .from("courses")
      .insert({
        title: String(a.title).trim(),
        description: (a.description as string) ?? null,
        stage_ids: a.stage_ids,
        stage_id: (a.stage_ids as string[])[0],
        subject_ids: (a.subject_ids as string[]) ?? [],
        subject_id: ((a.subject_ids as string[]) ?? [])[0] ?? null,
        is_paid: Boolean(a.is_paid),
        price_piastres: a.is_paid ? toPiastres(a.price_egp) : null,
        course_type: a.course_type,
        status: "draft",
        created_by: ctx.caller.uid,
      })
      .select("id, title")
      .single();
    if (error || !data) fail("SAVE_FAILED", "تعذّر إنشاء الدورة");
    return {
      summary_ar: `تم إنشاء الدورة «${data!.title}» كمسودة`,
      links: [
        { label_ar: "فتح منشئ الدورة", href: `/admin/courses/${data!.id}/builder` },
        { label_ar: "تعديل البيانات", href: `/admin/courses/${data!.id}/edit` },
      ],
      data: { course_id: data!.id },
    };
  },
};

const createUnit: WriteTool = {
  kind: "write",
  name: "create_unit",
  label_ar: "يجهّز وحدة جديدة",
  description: "Propose adding a unit (chapter) to a course, at the end unless position is given.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["course_id", "title"],
    properties: {
      course_id: uuid("Course id."),
      title: str("Unit title.", 200),
      position: { type: "integer", minimum: 1, maximum: 500 },
    },
  },
  async prepare(ctx, a) {
    const course = await getCourse(ctx, a.course_id);
    const { count } = await ctx.service.from("units").select("id", { count: "exact", head: true }).eq("course_id", course.id);
    return {
      title_ar: "إضافة وحدة",
      target: course.id,
      fields: [
        { label: "الدورة", after: course.title },
        { label: "عنوان الوحدة", after: String(a.title) },
        { label: "الترتيب", after: String(a.position ?? (count ?? 0) + 1) },
      ],
    };
  },
  async execute(ctx, a) {
    const course = await getCourse(ctx, a.course_id);
    const { data: last } = await ctx.service.from("units").select("position").eq("course_id", course.id).order("position", { ascending: false }).limit(1).maybeSingle();
    let position = (last?.position ?? 0) + 1;
    if (a.position) {
      position = Number(a.position);
      const { data: after } = await ctx.service.from("units").select("id, position").eq("course_id", course.id).gte("position", position);
      for (const u of after ?? []) await ctx.service.from("units").update({ position: u.position + 1 }).eq("id", u.id);
    }
    const { data, error } = await ctx.service.from("units").insert({ course_id: course.id, title: String(a.title).trim(), position }).select("id").single();
    if (error || !data) fail("SAVE_FAILED", "تعذّر إضافة الوحدة");
    return {
      summary_ar: `تمت إضافة الوحدة «${a.title}» إلى «${course.title}»`,
      links: [{ label_ar: "فتح منشئ الدورة", href: `/admin/courses/${course.id}/builder` }],
      data: { unit_id: data!.id },
    };
  },
};

const createLesson: WriteTool = {
  kind: "write",
  name: "create_lesson",
  label_ar: "يجهّز درساً جديداً",
  description: "Propose adding a lesson at the end of a unit. Video is optional (youtube / vimeo / bunny URL).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["unit_id", "title"],
    properties: {
      unit_id: uuid("Unit id from get_course_outline."),
      title: str("Lesson title.", 200),
      description: str("Lesson description.", 4000, 0),
      video_provider: { type: "string", enum: ["youtube", "vimeo", "bunny"] },
      video_url: { type: "string", maxLength: 1000, pattern: "^https://" },
    },
  },
  async prepare(ctx, a) {
    if (a.video_url && !a.video_provider) fail("MISSING_PROVIDER", "حدد مصدر الفيديو (يوتيوب / فيميو / باني)");
    const unit = await getUnit(ctx, a.unit_id);
    return {
      title_ar: "إضافة درس",
      target: unit.id,
      fields: [
        { label: "الدورة", after: unit.course_title },
        { label: "الوحدة", after: unit.title },
        { label: "عنوان الدرس", after: String(a.title) },
        ...(a.video_url ? [{ label: "الفيديو", after: `${a.video_provider}: ${a.video_url}` }] : []),
      ],
    };
  },
  async execute(ctx, a) {
    const unit = await getUnit(ctx, a.unit_id);
    const position = await nextUnitSlot(ctx, unit.id);
    const { data, error } = await ctx.service
      .from("lessons")
      .insert({
        unit_id: unit.id,
        title: String(a.title).trim(),
        description: (a.description as string) ?? null,
        video_provider: (a.video_provider as string) ?? null,
        video_url: (a.video_url as string) ?? null,
        position,
      })
      .select("id")
      .single();
    if (error || !data) fail("SAVE_FAILED", "تعذّر إضافة الدرس");
    return {
      summary_ar: `تمت إضافة الدرس «${a.title}» إلى وحدة «${unit.title}»`,
      links: [{ label_ar: "فتح منشئ الدورة", href: `/admin/courses/${unit.course_id}/builder` }],
      data: { lesson_id: data!.id },
    };
  },
};

const QUESTION_SCHEMA = {
  type: "object" as const,
  additionalProperties: false,
  required: ["type", "text", "points"],
  properties: {
    type: { type: "string" as const, enum: ["single_choice", "multiple_choice", "true_false", "fill_blank"] },
    text: str("Question text.", 2000),
    points: { type: "number" as const, minimum: 0.5, maximum: 100 },
    options: {
      type: "array" as const,
      maxItems: 8,
      description: "single/multiple choice only: 2–8 options, at least one correct.",
      items: {
        type: "object" as const,
        additionalProperties: false,
        required: ["text", "is_correct"],
        properties: { text: str("Option text.", 500), is_correct: { type: "boolean" as const } },
      },
    },
    correct_answer: { type: "boolean" as const, description: "true_false only: true = صح." },
    model_answer: str("fill_blank only: the accepted answer.", 500),
  },
};

function checkQuestions(qs: Record<string, unknown>[]) {
  qs.forEach((q, i) => {
    const n = i + 1;
    if (q.type === "single_choice" || q.type === "multiple_choice") {
      const opts = (q.options as { is_correct: boolean }[] | undefined) ?? [];
      if (opts.length < 2) fail("BAD_QUESTION", `السؤال ${n}: يحتاج خيارين على الأقل`);
      const correct = opts.filter((o) => o.is_correct).length;
      if (correct < 1) fail("BAD_QUESTION", `السؤال ${n}: لا توجد إجابة صحيحة`);
      if (q.type === "single_choice" && correct !== 1) fail("BAD_QUESTION", `السؤال ${n}: اختيار واحد يجب أن تكون له إجابة صحيحة واحدة`);
    }
    if (q.type === "true_false" && typeof q.correct_answer !== "boolean") fail("BAD_QUESTION", `السؤال ${n}: حدد هل الإجابة صح أم خطأ`);
    if (q.type === "fill_blank" && !String(q.model_answer ?? "").trim()) fail("BAD_QUESTION", `السؤال ${n}: حدد الإجابة المقبولة`);
  });
}

const TYPE_AR: Record<string, string> = {
  single_choice: "اختيار من متعدد",
  multiple_choice: "اختيارات متعددة",
  true_false: "صح / خطأ",
  fill_blank: "أكمل الفراغ",
};

const createQuiz: WriteTool = {
  kind: "write",
  name: "create_quiz_with_questions",
  label_ar: "يجهّز اختباراً",
  description:
    "Propose creating a quiz at the end of a unit with 1–50 questions. Types: single_choice, multiple_choice, true_false, fill_blank. Write questions yourself only when the admin asked you to; never invent facts outside the lesson topic.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["unit_id", "title", "duration_minutes", "pass_percentage", "max_attempts", "questions"],
    properties: {
      unit_id: uuid("Unit id."),
      title: str("Quiz title.", 200),
      description: str("Instructions.", 2000, 0),
      duration_minutes: { type: "integer", minimum: 1, maximum: 600 },
      pass_percentage: { type: "integer", minimum: 0, maximum: 100 },
      max_attempts: { type: "integer", minimum: 1, maximum: 100 },
      questions: { type: "array", minItems: 1, maxItems: 50, items: QUESTION_SCHEMA },
    },
  },
  async prepare(ctx, a) {
    const qs = a.questions as Record<string, unknown>[];
    checkQuestions(qs);
    const unit = await getUnit(ctx, a.unit_id);
    const counts = new Map<string, number>();
    for (const q of qs) counts.set(String(q.type), (counts.get(String(q.type)) ?? 0) + 1);
    const totalPoints = qs.reduce((s, q) => s + Number(q.points), 0);
    return {
      title_ar: "إنشاء اختبار",
      target: unit.id,
      affected: qs.length,
      fields: [
        { label: "الدورة / الوحدة", after: `${unit.course_title} / ${unit.title}` },
        { label: "العنوان", after: String(a.title) },
        { label: "الأسئلة", after: [...counts].map(([t, c]) => `${c} ${TYPE_AR[t]}`).join("، ") },
        { label: "مجموع الدرجات", after: String(totalPoints) },
        { label: "المدة / النجاح / المحاولات", after: `${a.duration_minutes} دقيقة / ${a.pass_percentage}% / ${a.max_attempts}` },
        ...qs.slice(0, 3).map((q, i) => ({ label: `س${i + 1}`, after: String(q.text).slice(0, 140) })),
      ],
    };
  },
  async execute(ctx, a) {
    const qs = a.questions as Record<string, unknown>[];
    checkQuestions(qs);
    const unit = await getUnit(ctx, a.unit_id);
    const order = await nextUnitSlot(ctx, unit.id);
    const { data: quiz, error } = await ctx.service
      .from("quizzes")
      .insert({
        unit_id: unit.id,
        course_id: unit.course_id,
        title: String(a.title).trim(),
        description: (a.description as string) ?? null,
        duration_minutes: a.duration_minutes,
        pass_percentage: a.pass_percentage,
        max_attempts: a.max_attempts,
        order_index: order,
      })
      .select("id")
      .single();
    if (error || !quiz) fail("SAVE_FAILED", "تعذّر إنشاء الاختبار");
    try {
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        const { data: qrow, error: qe } = await ctx.service
          .from("quiz_questions")
          .insert({
            quiz_id: quiz!.id,
            form_number: 1,
            type: q.type,
            content: textToRichDoc(String(q.text)),
            points: q.points,
            model_answer_text: q.type === "fill_blank" ? String(q.model_answer).trim() : null,
            order_index: i,
          })
          .select("id")
          .single();
        if (qe || !qrow) throw qe ?? new Error("question");
        let options: { content: unknown; is_correct: boolean; order_index: number }[] = [];
        if (q.type === "true_false") {
          options = [
            { content: textToRichDoc("صح"), is_correct: q.correct_answer === true, order_index: 0 },
            { content: textToRichDoc("خطأ"), is_correct: q.correct_answer === false, order_index: 1 },
          ];
        } else if (q.type === "single_choice" || q.type === "multiple_choice") {
          options = (q.options as { text: string; is_correct: boolean }[]).map((o, j) => ({
            content: textToRichDoc(o.text),
            is_correct: o.is_correct,
            order_index: j,
          }));
        }
        if (options.length) {
          const { error: oe } = await ctx.service.from("quiz_question_options").insert(options.map((o) => ({ ...o, question_id: qrow.id })));
          if (oe) throw oe;
        }
      }
    } catch {
      await ctx.service.from("quizzes").delete().eq("id", quiz!.id); // cascades to questions/options
      fail("SAVE_FAILED", "تعذّر حفظ أسئلة الاختبار");
    }
    return {
      summary_ar: `تم إنشاء الاختبار «${a.title}» بـ ${qs.length} سؤالاً`,
      links: [{ label_ar: "فتح منشئ الدورة", href: `/admin/courses/${unit.course_id}/builder` }],
      data: { quiz_id: quiz!.id },
    };
  },
};

const createAssignment: WriteTool = {
  kind: "write",
  name: "create_assignment",
  label_ar: "يجهّز واجباً",
  description: "Propose adding a written assignment at the end of a unit. Start and end times are required (Cairo time, 'YYYY-MM-DD HH:mm').",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["unit_id", "title", "description", "total_grade", "pass_grade", "start_cairo", "end_cairo"],
    properties: {
      unit_id: uuid("Unit id."),
      title: str("Assignment title.", 200),
      description: str("What the student must do.", 8000),
      total_grade: { type: "number", minimum: 1, maximum: 1000 },
      pass_grade: { type: "number", minimum: 0, maximum: 1000 },
      start_cairo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$" },
      end_cairo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$" },
    },
  },
  async prepare(ctx, a) {
    if (Number(a.pass_grade) > Number(a.total_grade)) fail("BAD_GRADE", "درجة النجاح أكبر من الدرجة الكلية");
    const start = cairoLocalToUtc(String(a.start_cairo));
    const end = cairoLocalToUtc(String(a.end_cairo));
    if (!start || !end || end <= start) fail("BAD_DATES", "موعد النهاية يجب أن يكون بعد موعد البداية");
    const unit = await getUnit(ctx, a.unit_id);
    return {
      title_ar: "إضافة واجب",
      target: unit.id,
      fields: [
        { label: "الدورة / الوحدة", after: `${unit.course_title} / ${unit.title}` },
        { label: "العنوان", after: String(a.title) },
        { label: "الدرجة / النجاح", after: `${a.total_grade} / ${a.pass_grade}` },
        { label: "يبدأ", after: formatCairoAr(start!) },
        { label: "ينتهي", after: formatCairoAr(end!) },
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const unit = await getUnit(ctx, a.unit_id);
    const order = await nextUnitSlot(ctx, unit.id);
    const { data, error } = await ctx.service
      .from("assignments")
      .insert({
        unit_id: unit.id,
        course_id: unit.course_id,
        title: String(a.title).trim(),
        description: String(a.description),
        total_grade: a.total_grade,
        pass_grade: a.pass_grade,
        start_at: cairoLocalToUtc(String(a.start_cairo))!.toISOString(),
        end_at: cairoLocalToUtc(String(a.end_cairo))!.toISOString(),
        order_index: order,
      })
      .select("id")
      .single();
    if (error || !data) fail("SAVE_FAILED", "تعذّر إضافة الواجب");
    return {
      summary_ar: `تمت إضافة الواجب «${a.title}»`,
      links: [{ label_ar: "فتح منشئ الدورة", href: `/admin/courses/${unit.course_id}/builder` }],
      data: { assignment_id: data!.id },
    };
  },
};

const generateLessonPdf: WriteTool = {
  kind: "write",
  name: "generate_lesson_pdf",
  label_ar: "يجهّز ملف PDF للدرس",
  description:
    "Propose attaching a downloadable PDF (summary / worksheet) to a lesson. You write outline_markdown (headings with ##, bullet lists, short paragraphs). Use only content the admin gave you or general curriculum knowledge for the lesson topic.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["lesson_id", "title", "outline_markdown"],
    properties: {
      lesson_id: uuid("Lesson id."),
      title: str("PDF title.", 200),
      outline_markdown: str("Content in simple markdown.", 20000),
    },
  },
  async prepare(ctx, a) {
    const { data: lesson } = await ctx.service.from("lessons").select("id, title, unit_id, units(title, course_id, courses(title))").eq("id", String(a.lesson_id)).maybeSingle();
    if (!lesson) fail("NOT_FOUND", "الدرس غير موجود");
    // deno-lint-ignore no-explicit-any
    const u = (lesson as any).units;
    const md = String(a.outline_markdown);
    return {
      title_ar: "إرفاق ملف PDF بالدرس",
      target: lesson!.id,
      fields: [
        { label: "الدرس", after: `${u?.courses?.title ?? ""} / ${lesson!.title}` },
        { label: "عنوان الملف", after: String(a.title) },
        { label: "المحتوى", after: `${md.split("\n").filter((l) => l.startsWith("#")).length} عناوين، ${md.length.toLocaleString("en-US")} حرف` },
      ],
      client_side: "lesson_pdf",
      client_payload: { lesson_id: lesson!.id, title: String(a.title), outline_markdown: md, course_id: u?.course_id },
    };
  },
  async execute(ctx, a, clientResult) {
    const fileId = String(clientResult?.file_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) fail("MISSING_FILE", "لم يتم رفع الملف");
    const { data: file } = await ctx.service.from("lesson_files").select("id, lesson_id, file_name, file_url, file_size").eq("id", fileId).maybeSingle();
    if (!file || file.lesson_id !== String(a.lesson_id)) fail("FILE_MISMATCH", "الملف المرفوع لا يخص هذا الدرس");
    const { data: lesson } = await ctx.service.from("lessons").select("units(course_id)").eq("id", file!.lesson_id).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const courseId = (lesson as any)?.units?.course_id;
    return {
      summary_ar: `تم إرفاق «${file!.file_name}» بالدرس`,
      links: courseId ? [{ label_ar: "فتح منشئ الدورة", href: `/admin/courses/${courseId}/builder` }] : [],
      data: { file_id: file!.id, file_url: file!.file_url, file_name: file!.file_name, file_size: file!.file_size },
    };
  },
};

// ---------------------------------------------------------------- pricing & codes
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomCode(len = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

const createPurchaseCodes: WriteTool = {
  kind: "write",
  name: "create_purchase_codes",
  label_ar: "يجهّز أكواد شراء",
  description:
    "Propose generating purchase (activation) codes for a course or bundle. This platform's 'coupons' are these codes. Ask for count, uses per code and expiry if the admin did not say.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["target_type", "target_id", "count", "max_uses"],
    properties: {
      target_type: { type: "string", enum: ["course", "bundle"] },
      target_id: uuid("Course or bundle id."),
      count: { type: "integer", minimum: 1, maximum: 500 },
      max_uses: { type: "integer", minimum: 1, maximum: 1000 },
      expires_cairo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$", description: "Optional expiry (Cairo)." },
    },
  },
  async prepare(ctx, a) {
    const table = a.target_type === "bundle" ? "bundles" : "courses";
    const { data: target } = await ctx.service.from(table).select("id, title").eq("id", String(a.target_id)).maybeSingle();
    if (!target) fail("NOT_FOUND", a.target_type === "bundle" ? "الباقة غير موجودة" : "الدورة غير موجودة");
    const exp = a.expires_cairo ? cairoLocalToUtc(String(a.expires_cairo)) : null;
    if (a.expires_cairo && (!exp || exp < new Date())) fail("BAD_DATE", "تاريخ الانتهاء يجب أن يكون في المستقبل");
    return {
      title_ar: "توليد أكواد شراء",
      target: target!.id,
      affected: Number(a.count),
      fields: [
        { label: a.target_type === "bundle" ? "الباقة" : "الدورة", after: target!.title },
        { label: "عدد الأكواد", after: String(a.count) },
        { label: "مرات الاستخدام لكل كود", after: String(a.max_uses) },
        { label: "الانتهاء", after: exp ? formatCairoAr(exp) : "بدون انتهاء" },
      ],
    };
  },
  async execute(ctx, a) {
    const prep = await this.prepare(ctx, a);
    const count = Number(a.count);
    const codes = new Set<string>();
    for (let guard = 0; codes.size < count && guard < count * 50; guard++) codes.add(randomCode());
    const { data: clash } = await ctx.service.from("purchase_codes").select("code").in("code", [...codes]);
    for (const c of clash ?? []) codes.delete(c.code);
    while (codes.size < count) codes.add(randomCode(10));
    const batch_id = crypto.randomUUID();
    const exp = a.expires_cairo ? cairoLocalToUtc(String(a.expires_cairo))!.toISOString() : null;
    const rows = [...codes].map((code) => ({ code, target_type: a.target_type, target_id: a.target_id, max_uses: a.max_uses, expires_at: exp, batch_id }));
    const { error } = await ctx.service.from("purchase_codes").insert(rows);
    if (error) fail("SAVE_FAILED", "تعذّر حفظ الأكواد");
    return {
      summary_ar: `تم توليد ${count} كود شراء لـ «${prep.fields[0].after}»`,
      links: [{ label_ar: "إدارة أكواد الشراء", href: "/admin/purchase-codes" }],
      data: { batch_id, codes: [...codes], target_title: prep.fields[0].after },
    };
  },
};

const setCourseDiscount: WriteTool = {
  kind: "write",
  name: "set_course_discount",
  label_ar: "يجهّز خصماً على الدورة",
  description: "Propose a discounted price for a paid course until an expiry date (Cairo time).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["course_id", "discount_price_egp", "expires_cairo"],
    properties: {
      course_id: uuid("Course id."),
      discount_price_egp: { type: "number", minimum: 0, maximum: 1000000 },
      expires_cairo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$" },
    },
  },
  async prepare(ctx, a) {
    const c = await getCourse(ctx, a.course_id);
    if (!c.is_paid || !c.price_piastres) fail("NOT_PAID", "الدورة مجانية، لا يمكن إضافة خصم عليها");
    const newPrice = toPiastres(a.discount_price_egp);
    if (newPrice >= c.price_piastres!) fail("BAD_DISCOUNT", "سعر الخصم يجب أن يكون أقل من السعر الأصلي");
    const exp = cairoLocalToUtc(String(a.expires_cairo));
    if (!exp || exp < new Date()) fail("BAD_DATE", "تاريخ انتهاء الخصم يجب أن يكون في المستقبل");
    return {
      title_ar: "خصم على الدورة",
      target: c.id,
      fields: [
        { label: "الدورة", after: c.title },
        { label: "السعر الأصلي", after: egp(c.price_piastres) },
        { label: "سعر الخصم", before: c.discount_price_piastres != null ? egp(c.discount_price_piastres) : "—", after: egp(newPrice) },
        { label: "ينتهي الخصم", before: c.discount_expires_at ? formatCairoAr(c.discount_expires_at) : "—", after: formatCairoAr(exp!) },
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const { error } = await ctx.service
      .from("courses")
      .update({ discount_price_piastres: toPiastres(a.discount_price_egp), discount_expires_at: cairoLocalToUtc(String(a.expires_cairo))!.toISOString() })
      .eq("id", String(a.course_id));
    if (error) fail("SAVE_FAILED", "تعذّر حفظ الخصم");
    return { summary_ar: "تم تطبيق الخصم", links: [{ label_ar: "تعديل الدورة", href: `/admin/courses/${a.course_id}/edit` }] };
  },
};

const updateCoursePrice: WriteTool = {
  kind: "write",
  name: "update_course_price",
  label_ar: "يجهّز تعديل السعر",
  description: "Propose changing a course's price (EGP) or making it free/paid.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["course_id", "is_paid"],
    properties: {
      course_id: uuid("Course id."),
      is_paid: { type: "boolean" },
      price_egp: { type: "number", minimum: 1, maximum: 1000000, description: "Required when is_paid=true." },
    },
  },
  async prepare(ctx, a) {
    const c = await getCourse(ctx, a.course_id);
    if (a.is_paid && !(Number(a.price_egp) > 0)) fail("MISSING_PRICE", "حدد السعر الجديد بالجنيه");
    if (a.is_paid && c.enrollment_mode !== "standard") fail("AUTO_ENROLL_FREE_ONLY", "هذه الدورة بتسجيل تلقائي ويجب أن تبقى مجانية. غيّر طريقة الالتحاق أولاً.");
    const after = a.is_paid ? egp(toPiastres(a.price_egp)) : "مجانية";
    const before = c.is_paid ? egp(c.price_piastres) : "مجانية";
    if (before === after) fail("NO_CHANGE", "السعر الحالي هو نفسه");
    return {
      title_ar: "تعديل سعر الدورة",
      target: c.id,
      fields: [
        { label: "الدورة", after: c.title },
        { label: "السعر", before, after },
        ...(c.discount_price_piastres != null && a.is_paid && toPiastres(a.price_egp) <= c.discount_price_piastres
          ? [{ label: "تنبيه", after: "سعر الخصم الحالي أعلى من السعر الجديد وسيتم حذفه" }]
          : []),
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const c = await getCourse(ctx, a.course_id);
    const price = a.is_paid ? toPiastres(a.price_egp) : null;
    const dropDiscount = !a.is_paid || (c.discount_price_piastres != null && price != null && price <= c.discount_price_piastres);
    const { error } = await ctx.service
      .from("courses")
      .update({
        is_paid: Boolean(a.is_paid),
        price_piastres: price,
        ...(dropDiscount ? { discount_price_piastres: null, discount_expires_at: null } : {}),
      })
      .eq("id", c.id);
    if (error) fail("SAVE_FAILED", "تعذّر حفظ السعر");
    return { summary_ar: `تم تعديل سعر «${c.title}»`, links: [{ label_ar: "تعديل الدورة", href: `/admin/courses/${c.id}/edit` }] };
  },
};

// ---------------------------------------------------------------- users
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

function normalizeEgPhone(raw: string): string {
  const d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("20")) return d;
  if (d.startsWith("0")) return `2${d}`;
  if (/^1[0125]\d{8}$/.test(d)) return `20${d}`;
  return d;
}

const createStudent: WriteTool = {
  kind: "write",
  name: "create_student",
  label_ar: "يجهّز حساب طالب",
  description:
    "Propose creating a student account (phone login). A random password is generated and shown once to the admin after confirmation. stage_id must come from list_stages.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["full_name", "phone", "stage_id"],
    properties: {
      full_name: str("Student full name.", 120),
      phone: { type: "string", minLength: 10, maxLength: 20, description: "Egyptian mobile, e.g. 01012345678." },
      stage_id: uuid("Stage id."),
    },
  },
  async prepare(ctx, a) {
    const phone = normalizeEgPhone(String(a.phone));
    if (!/^201[0125]\d{8}$/.test(phone)) fail("BAD_PHONE", "رقم الهاتف غير صالح (رقم موبايل مصري)");
    const [{ data: stage }, { data: existing }] = await Promise.all([
      ctx.service.from("stages").select("name").eq("id", String(a.stage_id)).maybeSingle(),
      ctx.service.from("profiles").select("id").eq("phone_number", phone).maybeSingle(),
    ]);
    if (!stage) fail("NOT_FOUND", "المرحلة غير موجودة");
    if (existing) fail("PHONE_TAKEN", "يوجد حساب مسجّل بهذا الرقم بالفعل");
    return {
      title_ar: "إنشاء حساب طالب",
      fields: [
        { label: "الاسم", after: String(a.full_name) },
        { label: "الهاتف", after: maskPhone(phone) ?? "" },
        { label: "المرحلة", after: stage!.name },
        { label: "كلمة المرور", after: "ستُولَّد تلقائياً وتظهر لك مرة واحدة" },
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const phone = normalizeEgPhone(String(a.phone));
    const password = generatePassword();
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/admin-create-student`, {
      method: "POST",
      headers: {
        Authorization: ctx.caller.authHeader,
        apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_email: `${phone}@phone.fakarli.com`,
        password,
        full_name: String(a.full_name).trim(),
        phone_number: phone,
        stage_id: a.stage_id,
        registration_type: null,
        custom_fields: {},
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) fail("CREATE_FAILED", `تعذّر إنشاء الحساب${body?.error ? `: ${String(body.error).slice(0, 120)}` : ""}`);
    return {
      summary_ar: `تم إنشاء حساب «${a.full_name}»${body?.student_id ? ` (كود ${body.student_id})` : ""}`,
      links: body?.user_id ? [{ label_ar: "ملف الطالب", href: `/admin/students/${body.user_id}` }] : [],
      ephemeral: { password, login: phone },
      data: { user_id: body?.user_id ?? null, student_id: body?.student_id ?? null },
    };
  },
};

const enrollStudent: WriteTool = {
  kind: "write",
  name: "enroll_student",
  label_ar: "يجهّز تسجيل طالب في دورة",
  description: "Propose enrolling a student in a published course for free (no payment).",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["user_id", "course_id"],
    properties: { user_id: uuid("Student id."), course_id: uuid("Course id.") },
  },
  async prepare(ctx, a) {
    const [s, c] = await Promise.all([getStudent(ctx, a.user_id), getCourse(ctx, a.course_id)]);
    if (c.status !== "published") fail("NOT_PUBLISHED", "لا يمكن التسجيل في دورة غير منشورة");
    const { data: e } = await ctx.service.from("enrollments").select("id").eq("user_id", s.id).eq("course_id", c.id).maybeSingle();
    if (e) fail("ALREADY_ENROLLED", "الطالب مسجّل بالفعل في هذه الدورة");
    return {
      title_ar: "تسجيل طالب في دورة",
      target: s.id,
      fields: [
        { label: "الطالب", after: s.full_name ?? "" },
        { label: "الدورة", after: c.title },
        ...(c.is_paid ? [{ label: "تنبيه", after: `دورة مدفوعة (${egp(c.price_piastres)}) — سيُسجَّل مجاناً دون دفع` }] : []),
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const { error } = await ctx.service.from("enrollments").insert({ user_id: a.user_id, course_id: a.course_id });
    if (error) fail("SAVE_FAILED", "تعذّر تسجيل الطالب");
    return { summary_ar: "تم تسجيل الطالب في الدورة", links: [{ label_ar: "ملف الطالب", href: `/admin/students/${a.user_id}` }] };
  },
};

const unenrollStudent: WriteTool = {
  kind: "write",
  name: "unenroll_student",
  label_ar: "يجهّز إلغاء تسجيل طالب",
  description: "DESTRUCTIVE. Propose removing a student's access to a course. The admin must type the student's name to confirm.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["user_id", "course_id"],
    properties: { user_id: uuid("Student id."), course_id: uuid("Course id.") },
  },
  async prepare(ctx, a) {
    const [s, c] = await Promise.all([getStudent(ctx, a.user_id), getCourse(ctx, a.course_id)]);
    const { data: e } = await ctx.service.from("enrollments").select("id").eq("user_id", s.id).eq("course_id", c.id).maybeSingle();
    if (!e) fail("NOT_ENROLLED", "الطالب غير مسجّل في هذه الدورة");
    return {
      title_ar: "إلغاء تسجيل طالب من دورة",
      target: s.id,
      destructive: true,
      confirm_phrase: (s.full_name ?? "").trim() || "تأكيد",
      fields: [
        { label: "الطالب", after: s.full_name ?? "" },
        { label: "الدورة", after: c.title },
        { label: "النتيجة", after: "سيفقد الطالب الوصول للدورة (لا يتم استرداد أي مبلغ تلقائياً)" },
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const { error } = await ctx.service.from("enrollments").delete().eq("user_id", String(a.user_id)).eq("course_id", String(a.course_id));
    if (error) fail("SAVE_FAILED", "تعذّر إلغاء التسجيل");
    return { summary_ar: "تم إلغاء تسجيل الطالب من الدورة", links: [{ label_ar: "ملف الطالب", href: `/admin/students/${a.user_id}` }] };
  },
};

const banUser: WriteTool = {
  kind: "write",
  name: "ban_user",
  label_ar: "يجهّز حظر طالب",
  description: "DESTRUCTIVE. Propose banning a student account (blocks login). The admin must type the student's name to confirm.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["user_id", "reason"],
    properties: { user_id: uuid("Student id."), reason: str("Reason (for the audit log).", 500) },
  },
  async prepare(ctx, a) {
    const s = await getStudent(ctx, a.user_id);
    if (s.is_banned) fail("ALREADY_BANNED", "الحساب محظور بالفعل");
    return {
      title_ar: "حظر حساب طالب",
      target: s.id,
      destructive: true,
      confirm_phrase: (s.full_name ?? "").trim() || "تأكيد",
      fields: [
        { label: "الطالب", after: s.full_name ?? "" },
        { label: "السبب", after: String(a.reason) },
        { label: "النتيجة", after: "لن يتمكن الطالب من تسجيل الدخول" },
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const { error } = await ctx.service.from("profiles").update({ is_banned: true }).eq("id", String(a.user_id));
    if (error) fail("SAVE_FAILED", "تعذّر حظر الحساب");
    return { summary_ar: "تم حظر الحساب", links: [{ label_ar: "ملف الطالب", href: `/admin/students/${a.user_id}` }] };
  },
};

const unbanUser: WriteTool = {
  kind: "write",
  name: "unban_user",
  label_ar: "يجهّز رفع الحظر",
  description: "Propose lifting a ban on a student account.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["user_id"],
    properties: { user_id: uuid("Student id.") },
  },
  async prepare(ctx, a) {
    const s = await getStudent(ctx, a.user_id);
    if (!s.is_banned) fail("NOT_BANNED", "الحساب غير محظور");
    return { title_ar: "رفع الحظر عن طالب", target: s.id, fields: [{ label: "الطالب", before: "محظور", after: `${s.full_name ?? ""} — نشط` }] };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const { error } = await ctx.service.from("profiles").update({ is_banned: false }).eq("id", String(a.user_id));
    if (error) fail("SAVE_FAILED", "تعذّر رفع الحظر");
    return { summary_ar: "تم رفع الحظر", links: [{ label_ar: "ملف الطالب", href: `/admin/students/${a.user_id}` }] };
  },
};

// ---------------------------------------------------------------- grading & live
const gradeSubmission: WriteTool = {
  kind: "write",
  name: "grade_submission",
  label_ar: "يجهّز رصد درجة",
  description: "Propose saving a grade (and optional feedback) for one assignment submission, with the score the admin gave.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["submission_id", "grade"],
    properties: {
      submission_id: uuid("Submission id from list_ungraded_submissions."),
      grade: { type: "number", minimum: 0, maximum: 1000 },
      feedback: str("Feedback for the student.", 4000, 0),
    },
  },
  async prepare(ctx, a) {
    const { data: sub } = await ctx.service
      .from("assignment_submissions")
      .select("id, status, grade, user_id, assignments(title, total_grade, pass_grade), profiles:user_id(full_name)")
      .eq("id", String(a.submission_id))
      .maybeSingle();
    if (!sub) fail("NOT_FOUND", "التسليم غير موجود");
    // deno-lint-ignore no-explicit-any
    const asg = (sub as any).assignments;
    if (Number(a.grade) > Number(asg.total_grade)) fail("BAD_GRADE", `الدرجة أكبر من الدرجة الكلية (${asg.total_grade})`);
    const outcome = sub!.status === "draft" ? "لم يُسلَّم" : Number(a.grade) >= Number(asg.pass_grade) ? "ناجح" : "راسب";
    return {
      title_ar: "رصد درجة واجب",
      target: sub!.id,
      fields: [
        // deno-lint-ignore no-explicit-any
        { label: "الطالب", after: (sub as any).profiles?.full_name ?? "" },
        { label: "الواجب", after: asg.title },
        { label: "الدرجة", before: sub!.grade != null ? String(sub!.grade) : "—", after: `${a.grade} / ${asg.total_grade}` },
        { label: "النتيجة", after: outcome },
        ...(a.feedback ? [{ label: "ملاحظات", after: String(a.feedback).slice(0, 200) }] : []),
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const { data: sub } = await ctx.service
      .from("assignment_submissions")
      .select("id, status, assignments(total_grade, pass_grade, course_id)")
      .eq("id", String(a.submission_id))
      .single();
    // deno-lint-ignore no-explicit-any
    const asg = (sub as any).assignments;
    const never = sub!.status === "draft";
    const grade = never ? 0 : Math.max(0, Math.min(Number(a.grade), Number(asg.total_grade)));
    const now = new Date().toISOString();
    const { error } = await ctx.service
      .from("assignment_submissions")
      .update({
        grade,
        outcome: never ? "not_submitted" : grade >= Number(asg.pass_grade) ? "passed" : "failed",
        graded_at: now,
        graded_by: ctx.caller.uid,
        ...(a.feedback ? { feedback: String(a.feedback), feedback_given_at: now } : {}),
      })
      .eq("id", sub!.id);
    if (error) fail("SAVE_FAILED", "تعذّر حفظ الدرجة");
    return { summary_ar: `تم رصد الدرجة ${grade}`, links: [{ label_ar: "تسليمات الواجبات", href: "/admin/assignment-submissions" }] };
  },
};

const scheduleLiveSession: WriteTool = {
  kind: "write",
  name: "schedule_live_session",
  label_ar: "يجهّز جلسة مباشرة",
  description:
    "Propose scheduling a Zoom live session in a course (creates the Zoom meeting on confirm). start_cairo is Cairo time 'YYYY-MM-DD HH:mm'. Without unit_id a new unit titled like the session is created.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["course_id", "title", "start_cairo", "duration_minutes"],
    properties: {
      course_id: uuid("Course id."),
      unit_id: uuid("Optional existing unit."),
      title: str("Session title.", 200),
      description: str("Description.", 2000, 0),
      start_cairo: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}$" },
      duration_minutes: { type: "integer", minimum: 15, maximum: 480 },
    },
  },
  async prepare(ctx, a) {
    const c = await getCourse(ctx, a.course_id);
    const start = cairoLocalToUtc(String(a.start_cairo));
    if (!start || start.getTime() < Date.now() + 5 * 60_000) fail("BAD_DATE", "يجب أن يكون الموعد بعد 5 دقائق على الأقل من الآن");
    const { data: zoom } = await ctx.service.from("zoom_connections").select("status, zoom_account_type").eq("user_id", ctx.caller.uid).maybeSingle();
    if (!zoom || zoom.status !== "active") fail("ZOOM_NOT_CONNECTED", "اربط حساب Zoom أولاً من الملف الشخصي");
    let unitTitle = `وحدة جديدة: ${a.title}`;
    if (a.unit_id) {
      const u = await getUnit(ctx, a.unit_id);
      if (u.course_id !== c.id) fail("UNIT_MISMATCH", "الوحدة لا تتبع هذه الدورة");
      unitTitle = u.title;
    }
    return {
      title_ar: "جدولة جلسة مباشرة",
      target: c.id,
      fields: [
        { label: "الدورة", after: c.title },
        { label: "الوحدة", after: unitTitle },
        { label: "العنوان", after: String(a.title) },
        { label: "الموعد", after: formatCairoAr(start!) },
        { label: "المدة", after: `${a.duration_minutes} دقيقة` },
        ...(zoom!.zoom_account_type === 1 && Number(a.duration_minutes) > 40
          ? [{ label: "تنبيه", after: "حساب Zoom المجاني محدود بـ 40 دقيقة" }]
          : []),
      ],
    };
  },
  async execute(ctx, a) {
    await this.prepare(ctx, a);
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/live-sessions`, {
      method: "POST",
      headers: { Authorization: ctx.caller.authHeader, apikey: Deno.env.get("SUPABASE_ANON_KEY")!, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        course_id: a.course_id,
        unit_id: a.unit_id ?? null,
        create_unit_title: a.unit_id ? null : String(a.title),
        title: String(a.title),
        description: (a.description as string) ?? null,
        scheduled_start_at: cairoLocalToUtc(String(a.start_cairo))!.toISOString(),
        duration_minutes: a.duration_minutes,
        host_user_id: ctx.caller.uid,
        recording_enabled: true,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) fail("CREATE_FAILED", body?.message_ar ?? "تعذّر جدولة الجلسة");
    return {
      summary_ar: `تمت جدولة «${a.title}» وإشعار الطلاب`,
      links: [{ label_ar: "فتح منشئ الدورة", href: `/admin/courses/${a.course_id}/builder` }],
      data: { session_id: body?.session?.id ?? null },
    };
  },
};

export const WRITE_TOOLS: WriteTool[] = [
  createCourseDraft,
  createUnit,
  createLesson,
  createQuiz,
  createAssignment,
  generateLessonPdf,
  createPurchaseCodes,
  setCourseDiscount,
  updateCoursePrice,
  createStudent,
  enrollStudent,
  unenrollStudent,
  banUser,
  unbanUser,
  gradeSubmission,
  scheduleLiveSession,
];
