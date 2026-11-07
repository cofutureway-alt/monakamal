import { CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react";
import type { CheckKey, CheckResult } from "@/lib/ai-api";

const LABELS: Record<CheckKey, string> = {
  reachable: "الوصول إلى الخادم",
  auth: "التحقق من المفتاح",
  model: "وجود النموذج",
  tools: "دعم استدعاء الأدوات",
  arabic: "دعم اللغة العربية",
};

const ORDER: CheckKey[] = ["reachable", "auth", "model", "tools", "arabic"];

interface Props {
  /** null = never run; [] while running = all pending with the first spinning */
  results: CheckResult[] | null;
  running: boolean;
}

/** Vertical 5-step checklist for "اختبار الاتصال". */
const TestConnectionChecklist = ({ results, running }: Props) => {
  if (!results && !running) return null;
  const byKey = new Map((results ?? []).map((r) => [r.key, r]));

  const allOk = results?.length === 5 && results.every((r) => r.ok === true);
  const onlyToolsFailed =
    results?.length === 5 &&
    results.filter((r) => r.ok === false).map((r) => r.key).join() === "tools";

  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2.5" aria-live="polite">
      {ORDER.map((key, i) => {
        const r = byKey.get(key);
        const isRunning = running && !r && i === (results?.length ?? 0);
        return (
          <div key={key} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : !r ? (
                <Circle className="h-4 w-4 text-muted-foreground/60" />
              ) : r.ok === true ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : r.ok === false ? (
                <XCircle className="h-4 w-4 text-destructive" />
              ) : (
                <MinusCircle className="h-4 w-4 text-muted-foreground" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{LABELS[key]}</div>
              {r?.ok === false && <div className="text-xs text-destructive mt-0.5">{r.detail_ar}</div>}
            </div>
            {r && r.ok !== null && (
              <span className="text-xs text-muted-foreground tabular-nums">{r.ms} م.ث</span>
            )}
          </div>
        );
      })}

      {!running && allOk && (
        <p className="pt-1 text-sm font-medium text-primary">الاتصال يعمل بشكل كامل</p>
      )}
      {!running && onlyToolsFailed && (
        <p className="pt-1 text-sm font-medium text-accent">
          يعمل للمحادثة البسيطة فقط — مساعد الإدارة يحتاج دعم الأدوات
        </p>
      )}
    </div>
  );
};

export default TestConnectionChecklist;
