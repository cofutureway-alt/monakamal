// Tolerant parsing of provider responses (dependency-free; tested from
// src/test/provider-body.test.ts).
//
// Some OpenAI-compatible gateways (OpenRouter-style proxies) answer with
// `text/event-stream` even for non-streaming requests: whitespace or
// ": PROCESSING" keep-alive comments first, then either one JSON document or
// real `data:` chunks. Strict JSON.parse rejected those bodies.

// deno-lint-ignore no-explicit-any
type Json = any;

/** Parse a provider body into one JSON object, or null when it is not JSON at all. */
export function parseProviderBody(raw: string): Json | null {
  const text = String(raw ?? "");
  const lines = text.split(/\r?\n/);
  const dataLines = lines.filter((l) => l.startsWith("data:"));

  if (dataLines.length) return mergeSseChunks(dataLines.map((l) => l.slice(5).trim()));

  // Drop SSE comments (": …") and blank padding, keep the rest.
  const cleaned = lines.filter((l) => !l.startsWith(":")).join("\n").trim();
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(cleaned.slice(start));
  } catch {
    return null;
  }
}

/** Reassemble OpenAI-style streaming chunks into a single chat.completion. */
function mergeSseChunks(payloads: string[]): Json | null {
  let id = "";
  let model = "";
  let content = "";
  let reasoning = "";
  let finish: string | null = null;
  let usage: Json = null;
  let error: Json = null;
  const tools = new Map<number, { id: string; name: string; args: string }>();

  for (const p of payloads) {
    if (!p || p === "[DONE]") continue;
    let chunk: Json;
    try {
      chunk = JSON.parse(p);
    } catch {
      continue;
    }
    if (chunk.error) error = chunk.error;
    id ||= chunk.id ?? "";
    model ||= chunk.model ?? "";
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finish = choice.finish_reason;
    // Full message (non-delta) chunks are also accepted.
    const d = choice.delta ?? choice.message ?? {};
    if (typeof d.content === "string") content += d.content;
    if (typeof d.reasoning === "string") reasoning += d.reasoning;
    for (const tc of d.tool_calls ?? []) {
      const idx = typeof tc.index === "number" ? tc.index : tools.size;
      const cur = tools.get(idx) ?? { id: "", name: "", args: "" };
      cur.id ||= tc.id ?? "";
      cur.name ||= tc.function?.name ?? "";
      cur.args += tc.function?.arguments ?? "";
      tools.set(idx, cur);
    }
  }

  if (error && !content && !tools.size) return { error };
  if (!id && !content && !tools.size && !reasoning && !finish) return null;
  return {
    id,
    model,
    choices: [
      {
        index: 0,
        finish_reason: finish,
        message: {
          role: "assistant",
          content: content || null,
          ...(reasoning ? { reasoning } : {}),
          ...(tools.size
            ? {
                tool_calls: [...tools.entries()]
                  .sort((a, b) => a[0] - b[0])
                  .map(([i, t]) => ({ id: t.id || `call_${i}`, type: "function", function: { name: t.name, arguments: t.args } })),
              }
            : {}),
        },
      },
    ],
    usage,
  };
}

/** Short, single-line provider error text for admins (never includes headers or keys). */
export function providerErrorDetail(raw: string): string {
  const parsed = parseProviderBody(raw);
  const msg = parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? raw;
  return String(typeof msg === "string" ? msg : JSON.stringify(msg))
    .replace(/\s+/g, " ")
    .replace(/(sk|key)[-_][A-Za-z0-9_-]{8,}/gi, "$1-…")
    .trim()
    .slice(0, 160);
}
