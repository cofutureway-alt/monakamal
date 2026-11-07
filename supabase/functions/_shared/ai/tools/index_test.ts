// deno test supabase/functions/_shared/ai/tools/index_test.ts
// Guard rails that must hold without touching a database.
import { ADMIN_TOOLS, runTool } from "./index.ts";
import type { ToolCtx } from "./types.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const COURSE = "11111111-1111-4111-8111-111111111111";

// A service client that fails loudly if a guarded path touches the database.
const explodingService = new Proxy({}, {
  get() {
    throw new Error("database must not be touched");
  },
});

function ctx(resolved: string[] = []): ToolCtx {
  return {
    // deno-lint-ignore no-explicit-any
    service: explodingService as any,
    // deno-lint-ignore no-explicit-any
    caller: { uid: "u", role: "admin" } as any,
    conversationId: "c",
    resolved: new Set(resolved),
    remember: async () => {},
  };
}

Deno.test("write tool with an id no read tool returned → ENTITY_NOT_RESOLVED, no DB access", async () => {
  const out = await runTool(ctx(), "update_course_price", { course_id: COURSE, is_paid: true, price_egp: 200 });
  assert(out.kind === "error" && out.code === "ENTITY_NOT_RESOLVED", JSON.stringify(out));
  assert(out.modelContent.includes(COURSE), "model is told which id is unknown");
});

Deno.test("invalid arguments are rejected before running", async () => {
  const out = await runTool(ctx([COURSE]), "update_course_price", { course_id: "not-a-uuid", is_paid: "yes" });
  assert(out.kind === "error" && out.code === "INVALID_ARGS", JSON.stringify(out));
});

Deno.test("hallucinated tool names are rejected", async () => {
  const out = await runTool(ctx(), "delete_all_courses", {});
  assert(out.kind === "error" && out.code === "UNKNOWN_TOOL", "unknown tool");
});

Deno.test("ask_clarification returns a block and ends the turn", async () => {
  const out = await runTool(ctx(), "ask_clarification", {
    question: "أي دورة تقصد؟",
    options: [{ id: "a", label: "الجبر" }, { id: "b", label: "الهندسة" }],
    allow_free_text: true,
  });
  assert(out.kind === "clarify" && (out.block as { type: string }).type === "clarification", "clarify block");
});

Deno.test("ask_clarification needs 2–6 options", async () => {
  const out = await runTool(ctx(), "ask_clarification", { question: "؟؟؟", options: [{ id: "a", label: "x" }], allow_free_text: false });
  assert(out.kind === "error" && out.code === "INVALID_ARGS", "min options");
});

Deno.test("every tool schema is a closed object with unique names", () => {
  const names = new Set<string>();
  for (const t of ADMIN_TOOLS) {
    assert(!names.has(t.name), `duplicate ${t.name}`);
    names.add(t.name);
    assert(t.parameters.type === "object" && t.parameters.additionalProperties === false, `${t.name} schema closed`);
    assert(/^[a-z_]{3,64}$/.test(t.name), `${t.name} name format`);
  }
  assert(names.size === 28, `expected 28 tools, got ${names.size}`);
});
