import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { Caller } from "../http.ts";
import type { JsonSchema } from "../pure/schema-validate.ts";

export interface ToolCtx {
  service: SupabaseClient;
  caller: Caller;
  conversationId: string;
  /** Lower-cased UUIDs that read tools returned in this conversation. */
  resolved: Set<string>;
  /** Register entities returned by a read tool (persisted for later turns). */
  remember: (items: { id: string; type: string }[]) => Promise<void>;
}

export interface ReportPayload {
  title?: string;
  kpis: { label: string; value: string | number; unit?: string }[];
  chart?: { type: "bar" | "line"; x: string[]; series: { name: string; data: number[] }[] };
  table?: { columns: string[]; rows: (string | number)[][] };
}

export interface ReadOutput {
  /** JSON the model sees (keep small; truncated by the runner at ~6 KB). */
  result: Record<string, unknown>;
  summary_ar: string;
  report?: ReportPayload;
}

export interface ProposalField {
  label: string;
  before?: string | null;
  after: string;
}

export interface Proposal {
  title_ar: string;
  fields: ProposalField[];
  affected?: number;
  destructive?: boolean;
  confirm_phrase?: string | null;
  /** The main entity, for the audit log target. */
  target?: string | null;
  /** Execution happens in the browser (lesson PDF); the server only records it. */
  client_side?: "lesson_pdf";
  /** Extra data the browser needs for client-side execution. */
  client_payload?: Record<string, unknown>;
}

export interface ExecOutput {
  summary_ar: string;
  links?: { label_ar: string; href: string }[];
  /** Returned to the browser once; never persisted (e.g. a generated password). */
  ephemeral?: Record<string, unknown>;
  /** Persisted with the action result. */
  data?: Record<string, unknown>;
}

/** Thrown by handlers for problems the model (or admin) should see in Arabic. */
export class ToolError extends Error {
  constructor(public code: string, public message_ar: string) {
    super(code);
  }
}

interface BaseTool {
  name: string;
  label_ar: string;
  description: string;
  parameters: JsonSchema;
}

export interface ReadTool extends BaseTool {
  kind: "read";
  run: (ctx: ToolCtx, args: Record<string, unknown>) => Promise<ReadOutput>;
}

export interface WriteTool extends BaseTool {
  kind: "write";
  /** Validate against current data and build the preview. No side effects. */
  prepare: (ctx: ToolCtx, args: Record<string, unknown>) => Promise<Proposal>;
  /** Re-run after confirmation (state may have changed), then perform the change. */
  execute: (
    ctx: ToolCtx,
    args: Record<string, unknown>,
    clientResult?: Record<string, unknown>,
  ) => Promise<ExecOutput>;
}

export interface MetaTool extends BaseTool {
  kind: "meta";
}

export type AnyTool = ReadTool | WriteTool | MetaTool;

// ---------------------------------------------------------------- helpers
export const uuid = (description: string): JsonSchema => ({ type: "string", format: "uuid", description });
export const str = (description: string, maxLength = 300, minLength = 1): JsonSchema => ({
  type: "string",
  description,
  maxLength,
  minLength,
});

export function egp(piastres: number | null | undefined): string {
  if (piastres === null || piastres === undefined) return "—";
  return `${(piastres / 100).toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
}

/** Mask a phone number to its last 4 digits. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, "");
  return d.length > 4 ? `••••${d.slice(-4)}` : "••••";
}
