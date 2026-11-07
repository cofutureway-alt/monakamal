import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import { ArrowDown, PanelRight, Plus, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import AiUnavailableDialog from "@/components/ai/AiUnavailableDialog";
import Composer, { type ComposerHandle } from "@/components/ai/chat/Composer";
import ConversationList from "@/components/ai/chat/ConversationList";
import EmptyState from "@/components/ai/chat/EmptyState";
import MessageBubble from "@/components/ai/chat/MessageBubble";
import { useAiChat } from "@/hooks/use-ai-chat";
import { AiApiError, getAiSettings, listConversations, updateConversation, type ConversationRow } from "@/lib/ai-api";

const CONV_KEY = ["ai-conversations"] as const;

const AdminAiChat = () => {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<string | null>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);

  const conversations = useQuery({ queryKey: CONV_KEY, queryFn: listConversations });
  const settings = useQuery({ queryKey: ["ai-settings"], queryFn: getAiSettings, staleTime: 60_000 });
  const activeProvider = settings.data?.providers.find((p) => p.id === settings.data?.settings.active_provider_id);

  const onConversationCreated = useCallback(
    (id: string) => {
      navigate(`/admin/ai/${id}`, { replace: true });
      void qc.invalidateQueries({ queryKey: CONV_KEY });
    },
    [navigate, qc],
  );
  const onQuotaExceeded = useCallback((resetsAt: string | null) => {
    setBlockedUntil(resetsAt);
    setQuotaOpen(true);
  }, []);

  const chat = useAiChat({ conversationId: conversationId ?? null, onConversationCreated, onQuotaExceeded });
  const busy = chat.phase === "sending" || chat.phase === "streaming";

  // Refresh the list (titles / ordering) after each finished turn.
  const prevPhase = useRef(chat.phase);
  useEffect(() => {
    if (prevPhase.current !== "idle" && chat.phase === "idle") void qc.invalidateQueries({ queryKey: CONV_KEY });
    prevPhase.current = chat.phase;
  }, [chat.phase, qc]);

  // Unblock the composer when the quota window resets.
  useEffect(() => {
    if (!blockedUntil) return;
    const ms = new Date(blockedUntil).getTime() - Date.now();
    const id = window.setTimeout(() => setBlockedUntil(null), Math.max(0, Math.min(ms, 2 ** 31 - 1)));
    return () => window.clearTimeout(id);
  }, [blockedUntil]);

  // Auto-scroll unless the admin scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && pinnedToBottom) el.scrollTop = el.scrollHeight;
  }, [chat.messages, pinnedToBottom]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const active = useMemo(
    () => conversations.data?.find((c) => c.id === conversationId) ?? null,
    [conversations.data, conversationId],
  );

  const newChat = () => {
    setSheetOpen(false);
    navigate("/admin/ai");
  };
  const select = (id: string) => {
    setSheetOpen(false);
    navigate(`/admin/ai/${id}`);
  };
  const update = async (id: string, patch: Partial<Pick<ConversationRow, "title" | "pinned" | "archived">>) => {
    try {
      await updateConversation(id, patch);
      await qc.invalidateQueries({ queryKey: CONV_KEY });
      if (patch.archived && id === conversationId) navigate("/admin/ai");
    } catch (e) {
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر الحفظ");
    }
  };

  // For history: which choice id answered the clarification in message i.
  const answeredFor = (i: number) => {
    const next = chat.messages[i + 1];
    return next?.role === "user" ? next.choiceId : undefined;
  };

  const disabledReason = blockedUntil
    ? `متاح مجدداً ${formatDistanceToNowStrict(new Date(blockedUntil), { locale: ar, addSuffix: true })}`
    : settings.data && !settings.data.settings.admin_chat_enabled
      ? "مساعد الإدارة متوقف من الإعدادات"
      : null;

  const list = (
    <ConversationList
      items={conversations.data}
      loading={conversations.isLoading}
      activeId={conversationId ?? null}
      onSelect={select}
      onNew={newChat}
      onUpdate={update}
    />
  );

  return (
    <div
      className="-m-4 grid h-[calc(100dvh-4rem-var(--live-banner-h,0px)-96px)] grid-cols-[minmax(0,1fr)] overflow-hidden md:-m-8 md:h-[calc(100dvh-4rem-var(--live-banner-h,0px))] lg:grid-cols-[280px_minmax(0,1fr)]"
      dir="rtl"
    >
      <aside className="hidden border-e border-border/60 bg-card/50 lg:block">{list}</aside>

      <section className="flex min-h-0 min-w-0 flex-col">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSheetOpen(true)} aria-label="المحادثات">
            <PanelRight className="h-5 w-5" />
          </Button>
          <Sparkles className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="min-w-0 truncate font-bold">{active?.title || (conversationId ? "محادثة" : "محادثة جديدة")}</h1>
          {activeProvider && (
            <span className="hidden truncate rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline" dir="ltr">
              {activeProvider.model_id}
            </span>
          )}
          <div className="ms-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" asChild aria-label="إعدادات الذكاء الاصطناعي">
              <Link to="/admin/settings/ai">
                <Settings2 className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={newChat}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">محادثة جديدة</span>
            </Button>
          </div>
        </header>

        {/* Messages */}
        <div ref={scroller} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto">
          {settings.data && !activeProvider ? (
            <div className="mx-auto max-w-3xl p-4">
              <Alert>
                <AlertTitle>لم يتم إعداد مزوّد للذكاء الاصطناعي</AlertTitle>
                <AlertDescription className="mt-2">
                  <Button size="sm" asChild>
                    <Link to="/admin/settings/ai#providers">إضافة مزوّد</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : chat.loadError ? (
            <div className="mx-auto max-w-3xl p-4">
              <Alert variant="destructive">
                <AlertDescription>{chat.loadError}</AlertDescription>
              </Alert>
            </div>
          ) : chat.messages.length === 0 && chat.phase !== "loading" ? (
            <EmptyState onPick={(t) => composer.current?.setText(t)} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
              {chat.messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isLast={i === chat.messages.length - 1}
                  busy={busy}
                  actionStates={chat.actionStates}
                  answeredChoiceId={answeredFor(i)}
                  onChoose={(label, id) => void chat.send(label, id)}
                  onFreeText={() => composer.current?.focus("اكتب إجابتك")}
                  onRetry={chat.retry}
                  onDecide={chat.decide}
                />
              ))}
            </div>
          )}

          {!pinnedToBottom && busy && (
            <button
              type="button"
              onClick={() => setPinnedToBottom(true)}
              className="sticky bottom-3 mx-auto flex items-center gap-1 rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs shadow-md"
            >
              <ArrowDown className="h-3.5 w-3.5" /> رسائل جديدة
            </button>
          )}
        </div>

        <Composer
          ref={composer}
          busy={busy}
          disabledReason={disabledReason}
          onSend={(t) => {
            setPinnedToBottom(true);
            void chat.send(t);
          }}
          onStop={chat.stop}
        />
      </section>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[300px] p-0" dir="rtl">
          <SheetHeader className="border-b border-border/60 px-4 py-3">
            <SheetTitle>المحادثات</SheetTitle>
          </SheetHeader>
          {list}
        </SheetContent>
      </Sheet>

      <AiUnavailableDialog open={quotaOpen} onOpenChange={setQuotaOpen} />
    </div>
  );
};

export default AdminAiChat;
