import { describe, expect, it } from "vitest";
import { parseProviderBody, providerErrorDetail } from "../../supabase/functions/_shared/ai/pure/provider-body";

const completion = { id: "gen-1", choices: [{ finish_reason: "stop", message: { role: "assistant", content: "لا" } }] };

describe("parseProviderBody", () => {
  it("accepts plain JSON", () => {
    expect(parseProviderBody(JSON.stringify(completion))).toEqual(completion);
  });

  it("accepts whitespace padding and SSE keep-alive comments before JSON (seen on ai.fakarli.com)", () => {
    const raw = `\n         \n: OPENROUTER PROCESSING\n\n: OPENROUTER PROCESSING\n\n${JSON.stringify(completion)}`;
    expect(parseProviderBody(raw)).toEqual(completion);
  });

  it("merges real streaming chunks, including tool-call argument fragments", () => {
    const chunks = [
      { id: "g", model: "m", choices: [{ delta: { role: "assistant", content: "مر" } }] },
      { id: "g", choices: [{ delta: { content: "حبا" } }] },
      { id: "g", choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "echo", arguments: '{"te' } }] } }] },
      { id: "g", choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'xt":"ok"}' } }] }, finish_reason: "tool_calls" }] },
      { id: "g", choices: [], usage: { prompt_tokens: 5, completion_tokens: 3 } },
    ];
    const raw = `: ping\n\n${chunks.map((c) => `data: ${JSON.stringify(c)}`).join("\n\n")}\n\ndata: [DONE]\n\n`;
    const out = parseProviderBody(raw);
    expect(out.choices[0].message.content).toBe("مرحبا");
    expect(out.choices[0].message.tool_calls).toEqual([{ id: "c1", type: "function", function: { name: "echo", arguments: '{"text":"ok"}' } }]);
    expect(out.choices[0].finish_reason).toBe("tool_calls");
    expect(out.usage).toEqual({ prompt_tokens: 5, completion_tokens: 3 });
  });

  it("keeps reasoning-only replies (content null) instead of failing", () => {
    const r = { id: "g", choices: [{ finish_reason: "length", message: { content: null, reasoning: "The user said ping" } }] };
    expect(parseProviderBody(`\n   \n${JSON.stringify(r)}`).choices[0].message.reasoning).toBe("The user said ping");
  });

  it("returns null for non-JSON bodies", () => {
    expect(parseProviderBody("error code: 1010")).toBeNull();
    expect(parseProviderBody("<html>Bad gateway</html>")).toBeNull();
  });
});

describe("providerErrorDetail", () => {
  it("extracts the provider's message and never echoes keys", () => {
    expect(providerErrorDetail('{"error":{"message":"model not found"}}')).toBe("model not found");
    expect(providerErrorDetail('{"error":"bad key sk-or-v1-abcdef1234567890"}')).toBe("bad key sk-…");
    expect(providerErrorDetail("error code: 1010")).toBe("error code: 1010");
  });
});
