import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";

const LIMIT = 4000;
const COUNTER_FROM = 3500;

export interface ComposerHandle {
  setText: (t: string) => void;
  focus: (placeholder?: string) => void;
}

interface Props {
  busy: boolean;
  disabledReason?: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
}

/** Auto-growing textarea (1–8 rows). Enter sends, Shift+Enter adds a line. */
const Composer = forwardRef<ComposerHandle, Props>(({ busy, disabledReason, onSend, onStop }, ref) => {
  const [text, setText] = useState("");
  const [placeholder, setPlaceholder] = useState<string | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    setText: (t) => {
      setText(t);
      requestAnimationFrame(() => ta.current?.focus());
    },
    focus: (p) => {
      setPlaceholder(p ?? null);
      ta.current?.focus();
    },
  }));

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24;
    el.style.height = `${Math.min(el.scrollHeight, line * 8 + 16)}px`;
  }, [text]);

  const tooLong = text.length > LIMIT;
  const disabled = Boolean(disabledReason);
  const canSend = !busy && !disabled && text.trim().length > 0 && !tooLong;

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText("");
    setPlaceholder(null);
  };

  return (
    <div className="border-t border-border/60 bg-background/95 p-3 backdrop-blur">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
          <textarea
            ref={ta}
            rows={1}
            value={text}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={disabledReason ?? placeholder ?? "اكتب أمراً أو سؤالاً… (Enter للإرسال، Shift+Enter لسطر جديد)"}
            aria-label="رسالة إلى المساعد"
            className="max-h-60 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="إيقاف"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              aria-label="إرسال"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
        {(text.length >= COUNTER_FROM || tooLong) && (
          <p className={`mt-1 px-2 text-xs tabular-nums ${tooLong ? "text-destructive" : "text-muted-foreground"}`}>
            {tooLong ? "الرسالة طويلة جداً" : ""} {text.length.toLocaleString("en-US")} / {LIMIT.toLocaleString("en-US")}
          </p>
        )}
      </div>
    </div>
  );
});
Composer.displayName = "Composer";

export default Composer;
