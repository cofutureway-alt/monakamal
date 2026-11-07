import { describe, expect, it } from "vitest";
import { SseParser } from "@/lib/ai-sse";

describe("SseParser", () => {
  it("parses complete events with JSON data", () => {
    const p = new SseParser();
    const evs = p.push('event: delta\ndata: {"text":"مرحبا"}\n\nevent: done\ndata: {}\n\n');
    expect(evs).toEqual([
      { event: "delta", data: { text: "مرحبا" } },
      { event: "done", data: {} },
    ]);
  });

  it("buffers events split across chunks, including mid-line", () => {
    const p = new SseParser();
    expect(p.push("event: del")).toEqual([]);
    expect(p.push('ta\ndata: {"te')).toEqual([]);
    expect(p.push('xt":"a"}\n')).toEqual([]);
    expect(p.push("\n")).toEqual([{ event: "delta", data: { text: "a" } }]);
  });

  it("handles CRLF, comments and default event name", () => {
    const p = new SseParser();
    const evs = p.push(': keep-alive\r\ndata: {"x":1}\r\n\r\n');
    expect(evs).toEqual([{ event: "message", data: { x: 1 } }]);
  });

  it("flushes a trailing event at stream end and keeps non-JSON as text", () => {
    const p = new SseParser();
    expect(p.push("event: status\ndata: plain text\n")).toEqual([]);
    expect(p.end()).toEqual([{ event: "status", data: "plain text" }]);
  });
});
