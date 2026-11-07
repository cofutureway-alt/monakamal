// Tool registry + runner for the admin assistant.
import type { ToolDef } from "../gateway.ts";
import { collectUuids, validateArgs } from "../pure/schema-validate.ts";
import { READ_TOOLS } from "./read.ts";
import { WRITE_TOOLS } from "./write.ts";
import { ToolError, type AnyTool, type MetaTool, type Proposal, type ReadOutput, type ToolCtx, type WriteTool } from "./types.ts";

export const ASK_CLARIFICATION: MetaTool = {
  kind: "meta",
  name: "ask_clarification",
  label_ar: "يطلب توضيحاً",
  description:
    "Ask the admin ONE clarifying question with 2–6 concrete options (taken from tool results). Use whenever the target entity is ambiguous or not found, or a required field is missing. Ends your turn; the admin's choice arrives as the next message.",
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["question", "options", "allow_free_text"],
    properties: {
      question: { type: "string", minLength: 3, maxLength: 300 },
      options: {
        type: "array",
        minItems: 2,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 80 },
            label: { type: "string", minLength: 1, maxLength: 120 },
            description: { type: "string", maxLength: 200 },
          },
        },
      },
      allow_free_text: { type: "boolean" },
    },
  },
};

export const ADMIN_TOOLS: AnyTool[] = [...READ_TOOLS, ...WRITE_TOOLS, ASK_CLARIFICATION];
const BY_NAME = new Map(ADMIN_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): AnyTool | undefined {
  return BY_NAME.get(name);
}

export function getWriteTool(name: string): WriteTool | undefined {
  const t = BY_NAME.get(name);
  return t?.kind === "write" ? t : undefined;
}

export function toolDefs(tools: AnyTool[] = ADMIN_TOOLS): ToolDef[] {
  return tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters as Record<string, unknown> }));
}

const MAX_RESULT_CHARS = 6000;

/** JSON for the model, truncated to keep the context small. */
export function toModelJson(value: unknown): string {
  const s = JSON.stringify(value);
  if (s.length <= MAX_RESULT_CHARS) return s;
  return `${s.slice(0, MAX_RESULT_CHARS)}… [truncated: ${s.length - MAX_RESULT_CHARS} more chars — narrow your query]`;
}

export type RunOutcome =
  | { kind: "read"; ok: true; output: ReadOutput; modelContent: string }
  | { kind: "write"; ok: true; proposal: Proposal; modelContent: string }
  | { kind: "clarify"; ok: true; block: Record<string, unknown>; modelContent: string }
  | { kind: "error"; ok: false; code: string; message_ar: string; modelContent: string };

/**
 * Validate args, enforce the entity guard for write tools, run the tool.
 * Never throws: every failure becomes a tool error the model can read and fix.
 */
export async function runTool(ctx: ToolCtx, name: string, args: Record<string, unknown>): Promise<RunOutcome> {
  const tool = getTool(name);
  const err = (code: string, message_ar: string, detail = ""): RunOutcome => ({
    kind: "error",
    ok: false,
    code,
    message_ar,
    modelContent: JSON.stringify({ error: code, message: message_ar, ...(detail ? { detail } : {}) }),
  });
  if (!tool) return err("UNKNOWN_TOOL", "أداة غير معروفة");
  if ("__invalid_json" in args) return err("INVALID_ARGS", "وسائط غير صالحة", "arguments were not valid JSON");

  const problems = validateArgs(tool.parameters, args);
  if (problems.length) return err("INVALID_ARGS", "وسائط غير صالحة", problems.join("; "));

  if (tool.kind === "meta") {
    return {
      kind: "clarify",
      ok: true,
      block: { type: "clarification", question: args.question, options: args.options, allow_free_text: args.allow_free_text },
      modelContent: JSON.stringify({ shown_to_admin: true, note: "Wait for the admin's answer in the next message." }),
    };
  }

  if (tool.kind === "write") {
    // Entity guard: every UUID must have been returned by a read tool earlier.
    const ids = collectUuids(tool.parameters, args);
    const unknown = ids.filter((id) => !ctx.resolved.has(id));
    if (unknown.length) {
      return err(
        "ENTITY_NOT_RESOLVED",
        "ابحث عن الكيان أولاً باستخدام أداة البحث",
        `ids not returned by any read tool in this conversation: ${unknown.join(", ")}`,
      );
    }
  }

  try {
    if (tool.kind === "read") {
      const output = await tool.run(ctx, args);
      return { kind: "read", ok: true, output, modelContent: toModelJson(output.result) };
    }
    const proposal = await tool.prepare(ctx, args);
    return {
      kind: "write",
      ok: true,
      proposal,
      modelContent: JSON.stringify({
        proposed: true,
        status: "awaiting_admin_confirmation",
        note: "Nothing has changed yet. Tell the admin briefly what will happen and that they must confirm on the card.",
      }),
    };
  } catch (e) {
    if (e instanceof ToolError) return err(e.code, e.message_ar);
    console.error("tool_failed", name, e instanceof Error ? e.message : String(e));
    return err("TOOL_FAILED", "حدث خطأ أثناء تنفيذ الأداة");
  }
}

export type { ToolCtx };
