import { useState } from "react";
import { Check, HelpCircle, PenLine } from "lucide-react";
import type { ClarificationBlock as Block } from "@/lib/ai-api";

interface Props {
  block: Block;
  /** Disabled once answered or while a reply is in flight. */
  disabled: boolean;
  /** Choice previously sent for this question (when reloading history). */
  answeredId?: string;
  onChoose: (label: string, id: string) => void;
  onFreeText: () => void;
}

/** Multiple-choice question from the assistant (no guessing on ambiguity). */
const ClarificationBlock = ({ block, disabled, answeredId, onChoose, onFreeText }: Props) => {
  const [chosen, setChosen] = useState<string | null>(answeredId ?? null);
  const locked = disabled || chosen !== null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 flex items-start gap-2">
        <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="font-semibold leading-relaxed">{block.question}</p>
      </div>
      <div className="space-y-2">
        {block.options.map((o) => {
          const isChosen = chosen === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={locked}
              onClick={() => {
                setChosen(o.id);
                onChoose(o.label, o.id);
              }}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors disabled:cursor-default ${
                isChosen
                  ? "border-primary bg-primary/10"
                  : "border-border/70 bg-card hover:bg-secondary disabled:opacity-60 disabled:hover:bg-card"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{o.label}</span>
                {o.description && <span className="block text-xs text-muted-foreground">{o.description}</span>}
              </span>
              {isChosen && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          );
        })}
        {block.allow_free_text && (
          <button
            type="button"
            disabled={locked}
            onClick={onFreeText}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-start text-sm text-muted-foreground hover:bg-secondary disabled:opacity-60 disabled:hover:bg-transparent"
          >
            <PenLine className="h-4 w-4" />
            أخرى…
          </button>
        )}
      </div>
    </div>
  );
};

export default ClarificationBlock;
