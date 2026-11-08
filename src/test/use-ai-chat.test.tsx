import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatStreamEvent } from "@/lib/ai-api";

// Controlled fake stream: the test pushes events and decides when it ends.
const stream = vi.hoisted(() => ({
  push: null as null | ((e: ChatStreamEvent) => void),
  end: null as null | (() => void),
  signal: null as null | AbortSignal,
  calls: 0,
}));

vi.mock("@/lib/ai-api", async (orig) => {
  const actual = await orig<typeof import("@/lib/ai-api")>();
  return {
    ...actual,
    loadMessages: vi.fn(async () => []),
    loadActionStates: vi.fn(async () => ({})),
    streamChat: vi.fn(
      (_input: unknown, onEvent: (e: ChatStreamEvent) => void, signal?: AbortSignal) =>
        new Promise<void>((resolve) => {
          stream.calls++;
          stream.push = onEvent;
          stream.signal = signal ?? null;
          stream.end = resolve;
        }),
    ),
  };
});

import { useAiChat } from "@/hooks/use-ai-chat";

describe("useAiChat — first reply in a new conversation", () => {
  beforeEach(() => {
    stream.calls = 0;
  });

  it("keeps streaming when the page adopts the new conversation id (no abort, no reload)", async () => {
    const { loadMessages } = await import("@/lib/ai-api");
    let convId: string | null = null;
    const { result, rerender } = renderHook(
      ({ id }) => useAiChat({ conversationId: id, onConversationCreated: (c) => (convId = c), onQuotaExceeded: () => {} }),
      { initialProps: { id: null as string | null } },
    );

    act(() => void result.current.send("أنشئ اختباراً"));
    await waitFor(() => expect(stream.push).toBeTruthy());

    // Server announces the conversation; the page navigates to /admin/ai/:id.
    act(() => stream.push!({ event: "meta", data: { conversation_id: "c-1", message_id: "" } }));
    expect(convId).toBe("c-1");
    rerender({ id: "c-1" });

    expect(stream.signal?.aborted).toBe(false);
    expect(loadMessages).not.toHaveBeenCalled();

    // The clarification block arriving after the id change is still shown.
    act(() => {
      stream.push!({
        event: "block",
        data: { type: "clarification", question: "أي دورة؟", options: [{ id: "a", label: "أ" }, { id: "b", label: "ب" }], allow_free_text: false },
      });
      stream.push!({ event: "done", data: {} });
    });
    await act(async () => stream.end!());

    const last = result.current.messages[result.current.messages.length - 1];
    expect(result.current.messages).toHaveLength(2);
    expect(last.status).toBe("done");
    expect(last.blocks[0]).toMatchObject({ type: "clarification", question: "أي دورة؟" });
    expect(stream.calls).toBe(1);
  });

  it("switching to a different conversation aborts the in-flight request", async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useAiChat({ conversationId: id, onConversationCreated: () => {}, onQuotaExceeded: () => {} }),
      { initialProps: { id: "c-1" as string | null } },
    );
    await waitFor(() => expect(result.current.phase).toBe("idle"));
    act(() => void result.current.send("سؤال"));
    await waitFor(() => expect(stream.signal).toBeTruthy());
    rerender({ id: "c-2" });
    expect(stream.signal?.aborted).toBe(true);
  });
});
