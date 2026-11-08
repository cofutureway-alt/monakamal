import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, Loader2, Sparkles, Wand2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { AiApiError, enqueueGrading } from "@/lib/ai-api";

interface AssignmentResult {
  score: number;
  max: number;
  feedback_ar: string;
  rationale_ar: string;
  confidence: number;
}
interface QuizResult {
  answers: { question_id: string; is_correct: boolean; confidence: number; rationale_ar: string }[];
}
interface Job {
  id: string;
  status: "pending" | "processing" | "done" | "failed" | "skipped";
  result: AssignmentResult | QuizResult | null;
  mode: string | null;
  applied: boolean;
  error: string | null;
}

const SKIP_AR: Record<string, string> = {
  FILES_ONLY: "التسليم ملفات فقط — لا يمكن تصحيحه آلياً",
  EMPTY: "لا توجد إجابة مكتوبة",
  ALREADY_GRADED: "تم رصد الدرجة بالفعل",
  NOT_SUBMITTED: "لم يُسلَّم بعد",
  NOTHING_TO_GRADE: "لا توجد إجابات كتابية تنتظر التصحيح",
  NOT_PENDING: "المحاولة لا تنتظر المراجعة",
};

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = value >= 0.8 ? "bg-primary/10 text-primary" : value >= 0.6 ? "bg-accent/15 text-accent" : "bg-destructive/15 text-destructive";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}>ثقة {pct}%</span>;
}

type Props =
  | { kind: "assignment"; targetId: string; onAdopt: (score: number, feedback: string) => void; questionTitle?: never }
  | {
      kind: "quiz_attempt";
      targetId: string;
      onAdopt: (verdicts: Record<string, boolean>) => void;
      /** question_id → short label for the list (e.g. "س3"). */
      questionTitle: (questionId: string) => string;
    };

/**
 * AI grading suggestion inside the teacher's grading modals.
 * "اعتماد الاقتراح" only fills the form — the teacher still saves.
 */
const AiGradeSuggestion = (props: Props) => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const key = ["ai-grading-job", props.kind, props.targetId];

  const { data: job, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table not in generated types yet
      const { data } = await (supabase as any)
        .from("ai_grading_jobs")
        .select("id, status, result, mode, applied, error")
        .eq("kind", props.kind)
        .eq("target_id", props.targetId)
        .maybeSingle();
      return (data ?? null) as Job | null;
    },
    refetchInterval: (q) => {
      const s = (q.state.data as Job | null | undefined)?.status;
      return s === "pending" || s === "processing" ? 5000 : false;
    },
  });

  const request = async () => {
    setRequesting(true);
    try {
      await enqueueGrading(props.kind, props.targetId);
      await qc.invalidateQueries({ queryKey: key });
      toast.success("تمت إضافة الطلب إلى قائمة التصحيح الآلي");
    } catch (e) {
      toast.error(e instanceof AiApiError ? e.messageAr : "تعذّر طلب التصحيح");
    } finally {
      setRequesting(false);
    }
  };

  if (isLoading) return null;

  const shell = (children: React.ReactNode) => (
    <div className="space-y-3 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/5 to-accent/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" />
        اقتراح الذكاء الاصطناعي
      </div>
      {children}
    </div>
  );

  if (!job) {
    return shell(
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">لم يُطلب تصحيح آلي لهذا التسليم.</p>
        <Button size="sm" variant="outline" onClick={request} disabled={requesting}>
          {requesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          اطلب تصحيحاً آلياً
        </Button>
      </div>,
    );
  }

  if (job.status === "pending" || job.status === "processing") {
    return shell(
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin text-primary" /> جارٍ التصحيح بالذكاء الاصطناعي…
      </p>,
    );
  }

  if (job.status === "skipped" || job.status === "failed" || !job.result) {
    return shell(
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {job.status === "skipped" ? SKIP_AR[job.error ?? ""] ?? "تم التخطي" : "تعذّر التصحيح الآلي"}
        </p>
        {job.status === "failed" && (
          <Button size="sm" variant="outline" onClick={request} disabled={requesting}>
            إعادة المحاولة
          </Button>
        )}
      </div>,
    );
  }

  const appliedBadge = job.applied && (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
      <CheckCircle2 className="h-3.5 w-3.5" /> رُصدت تلقائياً
    </span>
  );

  if (props.kind === "assignment") {
    const r = job.result as AssignmentResult;
    return shell(
      <>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2xl font-bold tabular-nums">
            {r.score} <span className="text-base font-medium text-muted-foreground">/ {r.max}</span>
          </span>
          <Confidence value={r.confidence} />
          {appliedBadge}
        </div>
        {r.feedback_ar && <p className="whitespace-pre-line text-sm leading-relaxed">{r.feedback_ar}</p>}
        {r.rationale_ar && (
          <div>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={open}
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} /> سبب التقييم
            </button>
            {open && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{r.rationale_ar}</p>}
          </div>
        )}
        {!job.applied && (
          <Button size="sm" onClick={() => props.onAdopt(r.score, r.feedback_ar)}>
            <CheckCircle2 className="h-4 w-4" /> اعتماد الاقتراح
          </Button>
        )}
      </>,
    );
  }

  const r = job.result as QuizResult;
  return shell(
    <>
      <div className="flex items-center gap-2">{appliedBadge}</div>
      <ul className="space-y-2">
        {r.answers.map((a) => (
          <li key={a.question_id} className="rounded-xl border border-border/60 bg-card p-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {a.is_correct ? (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
              <span className="font-medium">{props.questionTitle(a.question_id)}</span>
              <span className="text-muted-foreground">{a.is_correct ? "صحيحة" : "خاطئة"}</span>
              <Confidence value={a.confidence} />
            </div>
            {a.rationale_ar && <p className="mt-1 text-xs text-muted-foreground">{a.rationale_ar}</p>}
          </li>
        ))}
      </ul>
      {!job.applied && (
        <Button
          size="sm"
          onClick={() => props.onAdopt(Object.fromEntries(r.answers.map((a) => [a.question_id, a.is_correct])))}
        >
          <CheckCircle2 className="h-4 w-4" /> اعتماد الاقتراحات
        </Button>
      )}
    </>,
  );
};

export default AiGradeSuggestion;
