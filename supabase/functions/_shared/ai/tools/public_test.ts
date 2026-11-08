// deno test supabase/functions/_shared/ai/tools/public_test.ts
import { publicToolDefs, runPublicTool, type PublicCtx } from "./public.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

const explodingService = new Proxy({}, {
  get() {
    throw new Error("database must not be touched");
  },
});
// deno-lint-ignore no-explicit-any
const ctx = (role: PublicCtx["role"], uid: string | null = null): PublicCtx => ({ service: explodingService as any, uid, role });

Deno.test("role scoping: personal tools only exist for their role", () => {
  const names = (r: PublicCtx["role"]) => publicToolDefs(r).map((t) => t.name);
  assert(!names("guest").some((n) => n.startsWith("get_my_") || n.includes("child")), "guest has no personal tools");
  assert(names("student").includes("get_my_active_assessments"), "student integrity tool present");
  assert(!names("student").includes("get_child_summary"), "student has no parent tools");
  assert(names("parent").includes("get_child_summary") && !names("parent").includes("get_my_courses"), "parent scoped");
  for (const r of ["guest", "student", "parent"] as const) {
    assert(!names(r).some((n) => /^(create|update|delete|set|enroll|unenroll|ban|grade|schedule)_/.test(n)), `${r}: no write tools`);
    assert(names(r).includes("ask_clarification"), `${r}: can clarify`);
  }
});

Deno.test("calling another role's tool (or an admin tool) fails without touching the DB", async () => {
  for (const [role, tool] of [["guest", "get_my_courses"], ["student", "get_child_summary"], ["parent", "search_students"], ["guest", "update_course_price"]] as const) {
    const out = await runPublicTool(ctx(role), tool, {});
    assert(out.kind === "error" && out.modelContent.includes("UNKNOWN_TOOL"), `${role} → ${tool}`);
  }
});

Deno.test("invalid arguments are rejected before running", async () => {
  const out = await runPublicTool(ctx("guest"), "get_public_course", { course_id: "nope" });
  assert(out.kind === "error" && out.modelContent.includes("INVALID_ARGS"), "uuid validated");
});
