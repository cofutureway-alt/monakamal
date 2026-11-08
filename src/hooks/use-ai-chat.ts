import { useCallback, useEffect, useRef, useState } from "react";
import {
  AiApiError,
  decideAction,
  isQuotaError,
  loadActionStates,
  loadMessages,
  streamChat,
  type ActionState,
  type ChatBlock,
  type ChatStreamEvent,
  type ToolTraceItem,
} from "@/lib/ai-api";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks: ChatBlock[];
  trace: ToolTraceItem[];
  status: "streaming" | "done" | "error";
  statusLabel?: string;
  error?: { code: string; message_ar: string };
  /** For user messages created from a clarification choice. */
  choiceId?: string;
}

type Phase = "idle" | "loading" | "sending" | "streaming";

let localSeq = 0;
const localId = (p: string) => `${p}-${Date.now()}-${++localSeq}`;

/**
 * Conversation state machine for the admin assistant:
 * idle → sending (request out) → streaming (events in) → idle (done / error).
 */
export function useAiChat(opts: {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  onQuotaExceeded: (resetsAt: string | null, reason: string | null) => void;
  /** Widget visitors: anonymous id sent instead of a JWT. */
  guestId?: string;
  /** Do not fetch history from the database (guests cannot read it). */
  skipHistory?: boolean;
}) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Conversation id created by our own send; skip re-loading it from the DB. */
  const ownCreated = useRef<string | null>(null);
  const convRef = useRef<string | null>(opts.conversationId);
  convRef.current = opts.conversationId;

  // Load history when switching conversations.
  useEffect(() => {
    const id = opts.conversationId;
    abortRef.current?.abort();
    if (!id) {
      setMessages([]);
      setActionStates({});
      setPhase("idle");
      setLoadError(null);
      return;
    }
    if (ownCreated.current === id || opts.skipHistory) return; // already on screen / not readable
    let cancelled = false;
    setPhase("loading");
    setLoadError(null);
    Promise.all([loadMessages(id), loadActionStates(id)])
      .then(([rows, states]) => {
        if (cancelled) return;
        setMessages(
          rows.map((r) => ({
            id: r.id,
            role: r.role === "user" ? "user" : "assistant",
            text: r.content.text ?? "",
            blocks: r.content.blocks ?? [],
            trace: (r.content.tool_trace ?? []).map((t) => ({ ...t, ok: t.ok ?? true })),
            status: r.content.error ? "error" : "done",
            error: r.content.error,
            choiceId: r.content.choice_id,
          })),
        );
        setActionStates(states);
        setPhase("idle");
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof AiApiError ? e.messageAr : "تعذّر تحميل المحادثة");
        setPhase("idle");
      });
    return () => {
      cancelled = true;
    };
  }, [opts.conversationId]);

  const patchAssistant = (id: string, fn: (m: UiMessage) => UiMessage) =>
    setMessages((list) => list.map((m) => (m.id === id ? fn(m) : m)));

  const send = useCallback(
    async (text: string, choiceId?: string) => {
      const trimmed = text.trim();
      if (!trimmed || phase === "sending" || phase === "streaming") return;
      const userMsg: UiMessage = { id: localId("u"), role: "user", text: trimmed, blocks: [], trace: [], status: "done", choiceId };
      const asstId = localId("a");
      const asstMsg: UiMessage = { id: asstId, role: "assistant", text: "", blocks: [], trace: [], status: "streaming", statusLabel: "يفكّر…" };
      setMessages((list) => [...list, userMsg, asstMsg]);
      setPhase("sending");

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const onEvent = (e: ChatStreamEvent) => {
        setPhase("streaming");
        switch (e.event) {
          case "meta":
            if (!convRef.current && e.data.conversation_id) {
              ownCreated.current = e.data.conversation_id;
              opts.onConversationCreated(e.data.conversation_id);
            }
            break;
          case "status":
            patchAssistant(asstId, (m) => ({ ...m, statusLabel: e.data.label_ar }));
            break;
          case "tool_start":
            patchAssistant(asstId, (m) => ({
              ...m,
              statusLabel: e.data.label_ar,
              trace: [...m.trace, { name: e.data.name, label_ar: e.data.label_ar, kind: e.data.kind, ok: null }],
            }));
            break;
          case "tool_end":
            patchAssistant(asstId, (m) => {
              const trace = [...m.trace];
              for (let i = trace.length - 1; i >= 0; i--) {
                if (trace[i].name === e.data.name && trace[i].ok === null) {
                  trace[i] = { ...trace[i], ok: e.data.ok, summary_ar: e.data.summary_ar };
                  break;
                }
              }
              return { ...m, trace };
            });
            break;
          case "delta":
            patchAssistant(asstId, (m) => ({ ...m, text: m.text + e.data.text }));
            break;
          case "block":
            {
              const block = e.data;
              patchAssistant(asstId, (m) => ({ ...m, blocks: [...m.blocks, block] }));
              if (block.type === "action_proposal") {
                const actionId = block.action_id;
                setActionStates((s) => ({ ...s, [actionId]: { status: "pending" } }));
              }
            }
            break;
          case "done":
            patchAssistant(asstId, (m) => ({ ...m, status: "done", statusLabel: undefined }));
            break;
          case "error":
            patchAssistant(asstId, (m) => ({ ...m, status: "error", error: e.data, statusLabel: undefined }));
            break;
        }
      };

      try {
        await streamChat({ conversation_id: convRef.current, text: trimmed, choice_id: choiceId }, onEvent, ctrl.signal, opts.guestId);
        // Stream ended without done/error (aborted or cut): settle the bubble.
        patchAssistant(asstId, (m) =>
          m.status === "streaming"
            ? ctrl.signal.aborted
              ? { ...m, status: "done", statusLabel: undefined, text: m.text || "تم الإيقاف." }
              : { ...m, status: "error", statusLabel: undefined, error: { code: "NETWORK", message_ar: "انقطع الاتصال. حاول مرة أخرى." } }
            : m,
        );
      } catch (e) {
        if (isQuotaError(e)) {
          // Remove the optimistic pair; the dialog explains the situation.
          setMessages((list) => list.filter((m) => m.id !== asstId && m.id !== userMsg.id));
          opts.onQuotaExceeded((e.extra.resets_at as string | null) ?? null, (e.extra.reason as string | null) ?? null);
        } else {
          const err = e instanceof AiApiError ? { code: e.code, message_ar: e.messageAr } : { code: "UNKNOWN", message_ar: "حدث خطأ غير متوقع" };
          patchAssistant(asstId, (m) => ({ ...m, status: "error", statusLabel: undefined, error: err }));
        }
      } finally {
        abortRef.current = null;
        setPhase("idle");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, opts.onConversationCreated, opts.onQuotaExceeded],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /** Re-send the last user message (after an error). */
  const retry = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((list) => {
      const idx = list.lastIndexOf(lastUser);
      return list.slice(0, idx);
    });
    void send(lastUser.text, lastUser.choiceId);
  }, [messages, send]);

  const decide = useCallback(
    async (actionId: string, decision: "confirm" | "cancel", extra: { confirm_text?: string; client_result?: Record<string, unknown> } = {}) => {
      try {
        const res = await decideAction(actionId, decision, extra);
        setActionStates((s) => ({
          ...s,
          [actionId]: { status: res.status, result_summary_ar: res.result_summary_ar, links: res.links },
        }));
        return res;
      } catch (e) {
        const msg = e instanceof AiApiError ? e.messageAr : "تعذّر تنفيذ الإجراء";
        const code = e instanceof AiApiError ? e.code : "";
        setActionStates((s) => ({
          ...s,
          [actionId]:
            code === "EXPIRED"
              ? { status: "expired" }
              : code === "CONFIRM_MISMATCH"
                ? { ...(s[actionId] ?? { status: "pending" }), error_ar: msg }
                : { status: "failed", error_ar: msg },
        }));
        throw e;
      }
    },
    [],
  );

  return { messages, actionStates, phase, loadError, send, stop, retry, decide };
}
