// deno test --allow-net supabase/functions/_shared/ai/gateway_test.ts
// Exercises both provider adapters against a local mock server: request shape,
// tool-call parsing, history replay with tool results, and error mapping.
import { callModel, GatewayError, type GatewayMessage, type ProviderRow } from "./gateway.ts";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

// deno-lint-ignore no-explicit-any
type Captured = { path: string; headers: Headers; body: any };

async function withServer(
  handler: (c: Captured) => Response,
  fn: (base: string, seen: Captured[]) => Promise<void>,
) {
  const seen: Captured[] = [];
  const ac = new AbortController();
  const server = Deno.serve({ port: 0, signal: ac.signal, onListen: () => {} }, async (req) => {
    const c = { path: new URL(req.url).pathname, headers: req.headers, body: await req.json() };
    seen.push(c);
    return handler(c);
  });
  try {
    await fn(`http://127.0.0.1:${server.addr.port}`, seen);
  } finally {
    ac.abort();
    await server.finished;
  }
}

const provider = (format: ProviderRow["api_format"], base: string): ProviderRow => ({
  id: "p",
  name: "mock",
  api_format: format,
  base_url: base,
  model_id: "mock-model",
  temperature: 0.2,
  max_output_tokens: 256,
  supports_tools: true,
});

const history: GatewayMessage[] = [
  { role: "user", content: "أضف درساً" },
  { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "search_courses", arguments: { query: "جبر" } }] },
  { role: "tool", toolCallId: "c1", name: "search_courses", content: '{"matches":[]}' },
  { role: "user", content: "دورة الجبر" },
];
const tools = [{ name: "echo", description: "e", parameters: { type: "object", properties: { text: { type: "string" } } } }];

Deno.test("openai_compatible: request shape, tool calls parsed, usage", async () => {
  await withServer(
    () =>
      Response.json({
        choices: [{
          finish_reason: "tool_calls",
          message: { content: null, tool_calls: [{ id: "x1", type: "function", function: { name: "echo", arguments: '{"text":"ok"}' } }] },
        }],
        usage: { prompt_tokens: 11, completion_tokens: 3 },
      }),
    async (base, seen) => {
      const r = await callModel({ provider: provider("openai_compatible", `${base}/v1`), apiKey: "k", system: "S", messages: history, tools, toolChoice: "echo" });
      assert(seen[0].path === "/v1/chat/completions", "endpoint");
      assert(seen[0].headers.get("authorization") === "Bearer k", "bearer");
      const msgs = seen[0].body.messages;
      assert(msgs[0].role === "system" && msgs[0].content === "S", "system first");
      assert(msgs[2].tool_calls[0].function.arguments === '{"query":"جبر"}', "assistant tool_calls replayed");
      assert(msgs[3].role === "tool" && msgs[3].tool_call_id === "c1", "tool result replayed");
      assert(seen[0].body.tool_choice.function.name === "echo", "forced tool choice");
      assert(r.toolCalls[0].name === "echo" && r.toolCalls[0].arguments.text === "ok", "tool call parsed");
      assert(r.usage.in === 11 && r.usage.out === 3, "usage");
    },
  );
});

Deno.test("anthropic: alternating turns, tool_result in user turn, parsing", async () => {
  await withServer(
    () =>
      Response.json({
        content: [{ type: "text", text: "سأبحث" }, { type: "tool_use", id: "t9", name: "echo", input: { text: "ok" } }],
        stop_reason: "tool_use",
        usage: { input_tokens: 20, output_tokens: 5 },
      }),
    async (base, seen) => {
      const r = await callModel({ provider: provider("anthropic", base), apiKey: "k2", system: "S", messages: history, tools, toolChoice: "auto" });
      assert(seen[0].path === "/v1/messages", "endpoint");
      assert(seen[0].headers.get("x-api-key") === "k2", "x-api-key");
      assert(seen[0].headers.get("anthropic-version") === "2023-06-01", "version");
      const m = seen[0].body.messages;
      assert(seen[0].body.system === "S", "system top-level");
      assert(m.map((x: { role: string }) => x.role).join(",") === "user,assistant,user", "alternation (tool result + next user merged)");
      assert(m[1].content[0].type === "tool_use" && m[1].content[0].input.query === "جبر", "tool_use replayed");
      assert(m[2].content[0].type === "tool_result" && m[2].content[0].tool_use_id === "c1", "tool_result first in user turn");
      assert(m[2].content[1].text === "دورة الجبر", "user text merged after tool_result");
      assert(seen[0].body.tools[0].input_schema, "input_schema");
      assert(r.text === "سأبحث" && r.toolCalls[0].id === "t9", "parsed");
    },
  );
});

Deno.test("errors: 401 → AI_AUTH (no retry), 404 → AI_MODEL_NOT_FOUND, 500 retried once", async () => {
  let calls = 0;
  await withServer(
    () => {
      calls++;
      return new Response("nope", { status: 401 });
    },
    async (base) => {
      try {
        await callModel({ provider: provider("openai_compatible", base), apiKey: "k", system: "S", messages: [{ role: "user", content: "x" }] });
        throw new Error("should fail");
      } catch (e) {
        assert(e instanceof GatewayError && e.code === "AI_AUTH", "AI_AUTH");
      }
    },
  );
  assert(calls === 1, "401 is not retried");

  await withServer(() => new Response('{"error":{"message":"model not found"}}', { status: 404 }), async (base) => {
    try {
      await callModel({ provider: provider("anthropic", base), apiKey: "k", system: "S", messages: [{ role: "user", content: "x" }] });
      throw new Error("should fail");
    } catch (e) {
      assert(e instanceof GatewayError && e.code === "AI_MODEL_NOT_FOUND", "AI_MODEL_NOT_FOUND");
    }
  });

  let n = 0;
  await withServer(
    () => (++n === 1 ? new Response("boom", { status: 500 }) : Response.json({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] })),
    async (base) => {
      const r = await callModel({ provider: provider("openai_compatible", base), apiKey: "k", system: "S", messages: [{ role: "user", content: "x" }] });
      assert(r.text === "ok" && n === 2, "retried once after 500");
    },
  );
});

Deno.test("padded text/event-stream reply + stream:false + reasoning-only content (ai.fakarli.com)", async () => {
  const reply = {
    id: "gen-1",
    choices: [{ finish_reason: "length", message: { role: "assistant", content: null, reasoning: "The user said ping" } }],
    usage: { prompt_tokens: 794, completion_tokens: 16 },
  };
  await withServer(
    () => new Response(`\n         \n: OPENROUTER PROCESSING\n\n${JSON.stringify(reply)}`, { headers: { "Content-Type": "text/event-stream" } }),
    async (base, seen) => {
      const r = await callModel({ provider: provider("openai_compatible", `${base}/v1`), apiKey: "k", system: "S", messages: [{ role: "user", content: "ping" }] });
      assert(seen[0].body.stream === false, "stream:false sent");
      assert(r.text === "" && r.reasoning === "The user said ping", "reasoning kept, no error");
      assert(r.usage.in === 794, "usage parsed");
    },
  );
});

Deno.test("provider error text is surfaced (sanitised) on failures", async () => {
  await withServer(() => new Response('{"error":{"message":"Provider returned error"}}', { status: 502 }), async (base) => {
    try {
      await callModel({ provider: provider("openai_compatible", base), apiKey: "k", system: "S", messages: [{ role: "user", content: "x" }] });
      throw new Error("should fail");
    } catch (e) {
      assert(e instanceof GatewayError && e.code === "AI_BAD_RESPONSE" && e.detail === "Provider returned error", String(e));
    }
  });
});
