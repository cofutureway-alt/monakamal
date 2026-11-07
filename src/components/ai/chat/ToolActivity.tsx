import { useState } from "react";
import { CheckCircle2, ChevronDown, HelpCircle, Loader2, PencilLine, Search, XCircle } from "lucide-react";
import type { ToolTraceItem } from "@/lib/ai-api";

const KIND_ICON = { read: Search, write: PencilLine, meta: HelpCircle } as const;

function Row({ t }: { t: ToolTraceItem }) {
  const Icon = KIND_ICON[t.kind] ?? Search;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{t.label_ar}</span>
      {t.summary_ar && t.ok !== null && <span className="truncate text-muted-foreground/70">— {t.summary_ar}</span>}
      <span className="ms-auto shrink-0">
        {t.ok === null ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : t.ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-destructive" />
        )}
      </span>
    </div>
  );
}

/** Compact list of tool calls; collapses into one summary row once finished. */
const ToolActivity = ({ trace, running }: { trace: ToolTraceItem[]; running: boolean }) => {
  const [open, setOpen] = useState(false);
  if (!trace.length) return null;
  if (running) {
    return (
      <div className="space-y-1.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
        {trace.map((t, i) => (
          <Row key={`${t.name}-${i}`} t={t} />
        ))}
      </div>
    );
  }
  const reads = trace.filter((t) => t.kind === "read").length;
  const failed = trace.filter((t) => t.ok === false).length;
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        <Search className="h-3.5 w-3.5" />
        <span>
          {reads ? `تم تنفيذ ${reads} ${reads === 1 ? "عملية بحث" : "عمليات بحث"}` : `${trace.length} خطوات`}
          {failed ? ` · ${failed} تعذّرت` : ""}
        </span>
        <ChevronDown className={`ms-auto h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-border/60 px-3 py-2">
          {trace.map((t, i) => (
            <Row key={`${t.name}-${i}`} t={t} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolActivity;
