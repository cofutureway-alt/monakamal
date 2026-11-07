import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, Download, FileText, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ActionState, ChatBlock } from "@/lib/ai-api";
import type { UiMessage } from "@/hooks/use-ai-chat";
import ActionProposalCard from "./ActionProposalCard";
import ClarificationBlock from "./ClarificationBlock";
import ReportBlock from "./ReportBlock";
import ToolActivity from "./ToolActivity";

/**
 * Markdown with no raw HTML; links open in a new tab; wide tables scroll.
 * Styled explicitly: the Tailwind typography plugin is not enabled in this
 * project (enabling it globally would restyle existing lesson / quiz content).
 */
export const Markdown = memo(({ text }: { text: string }) => (
  <div className="space-y-3 text-sm leading-7 [overflow-wrap:anywhere]">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p>{children}</p>,
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        h1: ({ children }) => <h3 className="pt-1 text-base font-bold">{children}</h3>,
        h2: ({ children }) => <h3 className="pt-1 text-base font-bold">{children}</h3>,
        h3: ({ children }) => <h4 className="pt-1 font-bold">{children}</h4>,
        ul: ({ children }) => <ul className="list-disc space-y-1 ps-5 marker:text-muted-foreground">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal space-y-1 ps-5 marker:text-muted-foreground">{children}</ol>,
        blockquote: ({ children }) => (
          <blockquote className="border-s-2 border-primary/40 ps-3 text-muted-foreground">{children}</blockquote>
        ),
        code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
        pre: ({ children }) => <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-xs" dir="ltr">{children}</pre>,
        hr: () => <hr className="border-border/60" />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-2">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
        th: ({ children }) => <th className="px-3 py-2 text-start font-semibold">{children}</th>,
        td: ({ children }) => <td className="border-t border-border/60 px-3 py-2 tabular-nums">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  </div>
));
Markdown.displayName = "Markdown";

interface Props {
  message: UiMessage;
  isLast: boolean;
  busy: boolean;
  actionStates: Record<string, ActionState>;
  /** Choice id the admin sent right after this message (history), if any. */
  answeredChoiceId?: string;
  onChoose: (label: string, id: string) => void;
  onFreeText: () => void;
  onRetry: () => void;
  onDecide: (
    actionId: string,
    decision: "confirm" | "cancel",
    extra?: { confirm_text?: string; client_result?: Record<string, unknown> },
  ) => Promise<{ payload?: Record<string, unknown> } | void>;
}

function BlockView({ block, props }: { block: ChatBlock; props: Props }) {
  switch (block.type) {
    case "clarification":
      return (
        <ClarificationBlock
          block={block}
          disabled={props.busy || !props.isLast}
          answeredId={props.answeredChoiceId}
          onChoose={props.onChoose}
          onFreeText={props.onFreeText}
        />
      );
    case "action_proposal":
      return (
        <ActionProposalCard
          block={block}
          state={props.actionStates[block.action_id]}
          onDecide={(d, extra) => props.onDecide(block.action_id, d, extra)}
        />
      );
    case "report":
      return <ReportBlock block={block} />;
    case "file":
      return (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
          <FileText className="h-5 w-5 text-primary" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{block.name}</span>
          <Button size="sm" variant="outline" asChild>
            <a href={block.url} download={block.name}>
              <Download className="h-4 w-4" /> تنزيل
            </a>
          </Button>
        </div>
      );
    default:
      return null;
  }
}

const MessageBubble = (props: Props) => {
  const { message: m, isLast, busy, onRetry } = props;
  const [copied, setCopied] = useState(false);

  if (m.role === "user") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-se-sm bg-primary px-4 py-2.5 text-primary-foreground">
          {m.text}
        </div>
      </div>
    );
  }

  const streaming = m.status === "streaming";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

  return (
    <div className="group flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <ToolActivity trace={m.trace} running={streaming && !m.text} />

        {streaming && !m.text && !m.blocks.length && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            <span className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <span key={d} className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />
              ))}
            </span>
            {m.statusLabel ?? "يفكّر…"}
          </div>
        )}

        {m.text && (
          <div className="relative">
            <Markdown text={m.text} />
            {streaming && <span className="ms-0.5 inline-block animate-pulse text-primary">▍</span>}
          </div>
        )}

        {m.blocks.map((b, i) => (
          <BlockView key={i} block={b} props={props} />
        ))}

        {m.status === "error" && (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{m.error?.message_ar ?? "حدث خطأ غير متوقع"}</span>
              {isLast && (
                <Button size="sm" variant="outline" onClick={onRetry} disabled={busy}>
                  <RotateCcw className="h-4 w-4" /> إعادة المحاولة
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}

        {!streaming && m.text && (
          <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} نسخ
            </Button>
            {isLast && m.status === "done" && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={onRetry} disabled={busy}>
                <RotateCcw className="h-3.5 w-3.5" /> إعادة المحاولة
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
