import { describe, expect, it } from "vitest";
import { collectUuids, validateArgs, type JsonSchema } from "../../supabase/functions/_shared/ai/pure/schema-validate";
import { richDocToText, textToRichDoc } from "../../supabase/functions/_shared/ai/pure/rich-doc";
import { cairoLocalToUtc, periodStart } from "../../supabase/functions/_shared/ai/pure/cairo";

const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

const schema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["course_id", "title"],
  properties: {
    course_id: { type: "string", format: "uuid" },
    title: { type: "string", minLength: 1, maxLength: 10 },
    count: { type: "integer", minimum: 1, maximum: 5 },
    kind: { type: "string", enum: ["a", "b"] },
    stage_ids: { type: "array", items: { type: "string", format: "uuid" }, maxItems: 3 },
  },
};

describe("validateArgs", () => {
  it("accepts valid args", () => {
    expect(validateArgs(schema, { course_id: U1, title: "ok", count: 2, kind: "a", stage_ids: [U2] })).toEqual([]);
  });

  it("reports missing, unknown, type, range, enum and uuid errors", () => {
    const errs = validateArgs(schema, { title: "x".repeat(11), count: 9.5, kind: "z", extra: 1, stage_ids: ["nope"] });
    expect(errs).toEqual(
      expect.arrayContaining([
        "args.course_id: required",
        "args.title: too long (max 10)",
        "args.count: expected integer",
        "args.count: must be <= 5",
        "args.kind: must be one of a, b",
        "args.extra: unknown property",
        "args.stage_ids[0]: expected uuid",
      ]),
    );
  });

  it("collects every uuid argument for the entity guard", () => {
    expect(collectUuids(schema, { course_id: U1.toUpperCase(), title: "t", stage_ids: [U2] })).toEqual([U1, U2]);
  });
});

describe("rich doc", () => {
  it("produces the TipTap shape stored in quiz_questions.content", () => {
    expect(textToRichDoc("سؤال؟")).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "سؤال؟" }] }],
    });
  });

  it("round-trips multi-line text and reads inline math", () => {
    expect(richDocToText(textToRichDoc("أ\nب"))).toBe("أ\nب");
    expect(
      richDocToText({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "طول " }, { type: "inlineMath", attrs: { latex: "\\pi" } }] }],
      }),
    ).toBe("طول \\pi");
  });
});

describe("cairo time", () => {
  it("converts Cairo wall clock to UTC in winter (UTC+2) and summer (UTC+3)", () => {
    expect(cairoLocalToUtc("2026-12-10 20:00")?.toISOString()).toBe("2026-12-10T18:00:00.000Z");
    expect(cairoLocalToUtc("2026-07-10 20:00")?.toISOString()).toBe("2026-07-10T17:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(cairoLocalToUtc("10/12/2026 8pm")).toBeNull();
    expect(cairoLocalToUtc("2026-13-01 10:00")).toBeNull();
  });

  it("computes period starts on the Cairo calendar", () => {
    const now = new Date("2026-11-08T21:30:00Z"); // 23:30 Cairo, 8 Nov
    expect(periodStart("today", now).toISOString()).toBe("2026-11-07T22:00:00.000Z");
    expect(periodStart("month", now).toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(periodStart("7d", now).toISOString()).toBe("2026-11-01T22:00:00.000Z");
  });
});

import { parseOutline, pdfFileName } from "@/lib/lesson-pdf";

describe("lesson PDF outline", () => {
  it("parses headings, bullets, numbered items, paragraphs and gaps", () => {
    const md = "# العنوان\n\n## الفكرة الأولى\n- **نقطة** مهمة\n2. خطوة ثانية\n\nفقرة [رابط](https://x)";
    expect(parseOutline(md)).toEqual([
      { kind: "h1", text: "العنوان" },
      { kind: "gap" },
      { kind: "h2", text: "الفكرة الأولى" },
      { kind: "bullet", marker: "•", text: "نقطة مهمة" },
      { kind: "bullet", marker: "2.", text: "خطوة ثانية" },
      { kind: "gap" },
      { kind: "p", text: "فقرة رابط" },
    ]);
  });

  it("makes storage-safe file names", () => {
    expect(pdfFileName("ملخص: الدرس / الأول?")).toBe("ملخص-الدرس-الأول.pdf");
    expect(pdfFileName("   ")).toBe("lesson.pdf");
  });
});
