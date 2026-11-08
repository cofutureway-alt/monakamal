import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import { MessageCircle, RotateCcw, Sparkles, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AiUnavailableDialog from "@/components/ai/AiUnavailableDialog";
import Composer, { type ComposerHandle } from "@/components/ai/chat/Composer";
import MessageBubble from "@/components/ai/chat/MessageBubble";
import { useAiChat } from "@/hooks/use-ai-chat";
import { getGuestId, getPublicAiConfig } from "@/lib/ai-api";

const HIDDEN_PREFIXES = ["/admin", "/mcp", "/login", "/signup", "/parent-signup", "/quizzes/attempts"];

const QUICK: Record<"guest" | "student" | "parent", string[]> = {
  guest: ["ما الدورات المتاحة؟", "كيف أشترك؟", "ما طرق الدفع؟", "أين أماكن التواجد؟"],
  student: ["جلساتي المباشرة القادمة", "ما تقدّمي في الدورات؟", "نتائجي الأخيرة"],
  parent: ["كيف مستوى ابني؟", "الجلسات القادمة لأبنائي"],
};

const convKey = (role: string, uid: string | null) => `ai-widget-conv:${role}:${uid ?? "guest"}`;

function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string | null) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // storage unavailable: the conversation simply does not survive a reload
  }
}

/**
 * Floating assistant for visitors, students and parents (Phase 8).
 * Rendered only when the chatbot is enabled and a provider is configured;
 * hidden on admin, auth and quiz-taking pages.
 */
const AiChatWidget = () => {
  const { pathname } = useLocation();
  const { user, profile } = useAuth();
  const reduce = useReducedMotion();
  const role: "guest" | "student" | "parent" | "admin" = !user ? "guest" : (profile?.role ?? "student");
  const hidden = role === "admin" || HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const config = useQuery({
    queryKey: ["ai-public-config"],
    queryFn: getPublicAiConfig,
    staleTime: 5 * 60_000,
    enabled: !hidden,
  });

  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => readStored("ai-widget-opened") === "1");
  const [unread, setUnread] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [limitUntil, setLimitUntil] = useState<string | null>(null);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const widgetRole = role === "admin" ? "student" : role;
  const storageKey = convKey(widgetRole, user?.id ?? null);
  const guestId = useMemo(() => (user ? undefined : getGuestId()), [user]);
  // Guests cannot read stored history (no account), so their chat starts fresh on reload.
  const [conversationId, setConversationId] = useState<string | null>(() => (user ? readStored(storageKey) : null));

  // Switching account (login / logout) starts a different conversation.
  useEffect(() => {
    setConversationId(user ? readStored(storageKey) : null);
  }, [storageKey, user]);

  const onConversationCreated = useCallback(
    (id: string) => {
      setConversationId(id);
      if (user) writeStored(storageKey, id);
    },
    [storageKey, user],
  );
  const onQuotaExceeded = useCallback((resetsAt: string | null, reason: string | null) => {
    if (reason?.startsWith("actor_")) setLimitUntil(resetsAt);
    else setQuotaOpen(true);
  }, []);

  const chat = useAiChat({ conversationId, onConversationCreated, onQuotaExceeded, guestId, skipHistory: !user });
  const busy = chat.phase === "sending" || chat.phase === "streaming";

  // Unread dot when an answer finishes while the panel is closed.
  const lastStatus = chat.messages[chat.messages.length - 1]?.status;
  useEffect(() => {
    if (!open && lastStatus === "done" && chat.messages.length) setUnread(true);
  }, [lastStatus, open, chat.messages.length]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, open]);

  // Lift the per-user limit when its window resets.
  useEffect(() => {
    if (!limitUntil) return;
    const id = window.setTimeout(() => setLimitUntil(null), Math.max(0, new Date(limitUntil).getTime() - Date.now()));
    return () => window.clearTimeout(id);
  }, [limitUntil]);

  // Escape closes the panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidden || !config.data?.chatbot_enabled) return null;

  const toggle = () => {
    setOpen((o) => !o);
    setUnread(false);
    if (!seen) {
      setSeen(true);
      writeStored("ai-widget-opened", "1");
    }
  };

  const reset = () => {
    chat.stop();
    setConversationId(null);
    writeStored(storageKey, null);
  };

  const subtitle = role === "guest" ? "زائر" : profile?.full_name ?? (role === "parent" ? "ولي أمر" : "طالب");
  const limitText = limitUntil
    ? `وصلت إلى الحد المسموح من الرسائل، حاول ${formatDistanceToNowStrict(new Date(limitUntil), { locale: ar, addSuffix: true })}`
    : null;

  return (
    <>
      {/* Launcher — bottom-left (the end side in RTL), above the mobile bottom nav */}
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? "إغلاق المساعد الذكي" : "فتح المساعد الذكي"}
        aria-expanded={open}
        className={`fixed left-4 z-[55] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 bottom-[calc(env(safe-area-inset-bottom)+104px)] md:bottom-6 ${
          !seen && !open && !reduce ? "animate-float" : ""
        } ${open ? "max-sm:hidden" : ""}`}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {unread && !open && (
          <span className="absolute right-1 top-1 h-3 w-3 rounded-full border-2 border-primary bg-accent" aria-label="رد جديد" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label="المساعد الذكي"
            dir="rtl"
            initial={reduce ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
            animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="fixed z-[60] flex flex-col overflow-hidden border border-border/60 bg-background shadow-2xl inset-0 sm:inset-auto sm:bottom-24 sm:left-4 sm:h-[min(600px,calc(100dvh-8rem))] sm:w-[380px] sm:rounded-2xl"
          >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-border/60 bg-card px-4 py-3">
              <div className="relative">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold">المساعد الذكي</div>
                <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
              </div>
              <button
                type="button"
                onClick={reset}
                disabled={busy || !chat.messages.length}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-40"
                aria-label="محادثة جديدة"
                title="محادثة جديدة"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            {/* Messages */}
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              {chat.messages.length === 0 ? (
                <div className="flex flex-col items-center px-2 pt-6 text-center">
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <p className="mt-3 font-bold">أهلاً بك! كيف أساعدك؟</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {role === "guest"
                      ? "اسألني عن الدورات والأسعار وطريقة الاشتراك."
                      : role === "parent"
                        ? "اسألني عن تقدّم أبنائك ونتائجهم وجلساتهم."
                        : "اسألني عن دوراتك ونتائجك وجلساتك، أو اطلب شرح فكرة."}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {QUICK[widgetRole].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void chat.send(q)}
                        disabled={busy || Boolean(limitText)}
                        className="rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs transition-colors hover:bg-secondary disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {chat.messages.map((m, i) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      isLast={i === chat.messages.length - 1}
                      busy={busy}
                      actionStates={chat.actionStates}
                      answeredChoiceId={chat.messages[i + 1]?.role === "user" ? chat.messages[i + 1].choiceId : undefined}
                      onChoose={(label, id) => void chat.send(label, id)}
                      onFreeText={() => composer.current?.focus("اكتب إجابتك")}
                      onRetry={chat.retry}
                      onDecide={async () => {}}
                    />
                  ))}
                </div>
              )}
              {limitText && (
                <p className="mt-4 rounded-xl bg-accent/10 px-3 py-2 text-center text-xs text-accent" role="status">
                  {limitText}
                </p>
              )}
            </div>

            <Composer
              ref={composer}
              compact
              limit={1500}
              busy={busy}
              disabledReason={limitText}
              placeholder="اكتب سؤالك…"
              onSend={(t) => void chat.send(t)}
              onStop={chat.stop}
            />
            <p className="bg-background px-3 pb-2 text-center text-[11px] text-muted-foreground">
              قد يخطئ المساعد أحياناً — تحقق من المعلومات المهمة.
            </p>
          </motion.section>
        )}
      </AnimatePresence>

      <AiUnavailableDialog open={quotaOpen} onOpenChange={setQuotaOpen} />
    </>
  );
};

export default AiChatWidget;
