import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AiGradeSuggestion from "@/components/ai/AiGradeSuggestion";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Info,
  MessageSquare,
  Save,
  Send,
  Loader2,
  AlertCircle,
} from "lucide-react";
import RichTextRenderer from "@/components/admin/quiz/RichTextRenderer";
import {
  getAttemptDetails,
  fetchQuizPassPercentage,
  adminSaveGrading,
  adminSaveFeedback,
  type AttemptDetailQuestion,
  type QuizAttempt,
  type GradingUpdate,
} from "@/lib/quiz-api";
import { getResultDisplay } from "@/lib/quiz-result";
import { cn } from "@/lib/utils";

const formatDuration = (secs: number) => {
  const s = Math.round(secs);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r} ث`;
  return `${m} د ${r} ث`;
};

const typeLabel: Record<string, string> = {
  single_choice: "اختيار من متعدد",
  multiple_choice: "اختيار متعدد",
  true_false: "صح / خطأ",
  fill_blank: "إجابة كتابية",
};

interface Props {
  attemptId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When true, render admin grading controls (toggles, save, feedback editor). */
  adminMode?: boolean;
  /** Called after admin saves grading or feedback so parent lists can refresh. */
  onSaved?: (attempt: QuizAttempt) => void;
  /** Optional student label shown in header (admin view). */
  studentLabel?: string;
}

/**
 * Local grading state for a single question during an admin edit session.
 * `is_correct = null` for fill-blank means "not graded yet — admin must choose".
 */
type GradingMap = Record<string, boolean | null>;

export default function AttemptDetailsModal({
  attemptId,
  open,
  onOpenChange,
  adminMode = false,
  onSaved,
  studentLabel,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [questions, setQuestions] = useState<AttemptDetailQuestion[]>([]);
  const [passPercentage, setPassPercentage] = useState<number>(50);

  // Admin editing state
  const [grading, setGrading] = useState<GradingMap>({});
  const [feedback, setFeedback] = useState("");
  const [savingGrade, setSavingGrade] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);

  useEffect(() => {
    if (!open || !attemptId) return;
    setLoading(true);
    getAttemptDetails(attemptId)
      .then(async (d) => {
        setAttempt(d.attempt);
        setQuestions(d.questions);
        setFeedback(d.attempt.feedback ?? "");
        const initial: GradingMap = {};
        d.questions.forEach((q) => {
          initial[q.id] = q.is_correct;
        });
        setGrading(initial);
        try {
          const pp = await fetchQuizPassPercentage(d.attempt.quiz_id);
          setPassPercentage(pp);
        } catch {
          setPassPercentage(50);
        }
      })
      .catch(() => {
        setAttempt(null);
        setQuestions([]);
      })
      .finally(() => setLoading(false));
  }, [open, attemptId]);

  const totalTime = questions.reduce((a, q) => a + (q.time_spent_seconds || 0), 0);

  // Live-recomputed score based on admin's current toggles (not yet saved).
  const liveScore = useMemo(() => {
    const earned = questions.reduce((sum, q) => {
      const g = grading[q.id];
      return sum + (g === true ? q.points : 0);
    }, 0);
    const total = attempt?.total_points ?? questions.reduce((s, q) => s + q.points, 0);
    const pct = total > 0 ? Math.round((earned / total) * 100) : 0;
    return { earned, total, pct };
  }, [grading, questions, attempt]);

  const hasUngradedFillBlank = useMemo(
    () => questions.some((q) => q.type === "fill_blank" && grading[q.id] == null),
    [questions, grading],
  );

  const dirty = useMemo(() => {
    if (!attempt) return false;
    return questions.some((q) => (grading[q.id] ?? null) !== (q.is_correct ?? null));
  }, [grading, questions, attempt]);

  const feedbackDirty = attempt ? feedback !== (attempt.feedback ?? "") : false;

  const handleToggle = (qId: string, value: boolean | null) => {
    setGrading((g) => ({ ...g, [qId]: value }));
  };

  const handleSaveGrading = async () => {
    if (!attemptId) return;
    setSavingGrade(true);
    try {
      const updates: GradingUpdate[] = questions.map((q) => ({
        question_id: q.id,
        is_correct: grading[q.id] ?? null,
      }));
      const updated = await adminSaveGrading(attemptId, updates);
      setAttempt(updated);
      // Reflect changes in the questions cache
      setQuestions((qs) =>
        qs.map((q) => ({
          ...q,
          is_correct: grading[q.id] ?? null,
          points_earned: grading[q.id] === true ? q.points : 0,
        })),
      );
      toast.success("تم حفظ التصحيح");
      onSaved?.(updated);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر حفظ التصحيح");
    } finally {
      setSavingGrade(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!attemptId) return;
    setSavingFeedback(true);
    try {
      const updated = await adminSaveFeedback(attemptId, feedback);
      setAttempt(updated);
      toast.success("تم إرسال الملاحظات للطالب");
      onSaved?.(updated);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر إرسال الملاحظات");
    } finally {
      setSavingFeedback(false);
    }
  };

  const savedResult = attempt ? getResultDisplay(attempt, passPercentage) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-4xl h-[92vh] p-0 flex flex-col">
        <DialogHeader className="p-4 md:p-6 pb-3 border-b">
          <DialogTitle className="text-lg md:text-xl">
            {adminMode ? "تصحيح المحاولة" : "تفاصيل المحاولة"}
          </DialogTitle>
          {adminMode && studentLabel && (
            <div className="text-sm text-muted-foreground mt-1">{studentLabel}</div>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 md:p-6 space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-24" />
                <Skeleton className="h-40" />
                <Skeleton className="h-40" />
              </div>
            ) : attempt ? (
              <>
                {/* AI grading suggestion for written answers (admin only) */}
                {adminMode && questions.some((q) => q.type === "fill_blank") && (
                  <AiGradeSuggestion
                    kind="quiz_attempt"
                    targetId={attempt.id}
                    questionTitle={(qid) => {
                      const i = questions.findIndex((q) => q.id === qid);
                      return i >= 0 ? `السؤال ${i + 1}` : "سؤال";
                    }}
                    onAdopt={(verdicts) => {
                      setGrading((g) => ({ ...g, ...verdicts }));
                      toast.success("تم تطبيق الاقتراحات على النموذج — راجعها ثم احفظ");
                    }}
                  />
                )}

                {/* Summary */}
                <div className="rounded-2xl border border-border bg-card p-4 md:p-5 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-primary text-primary-foreground">
                      المحاولة #{attempt.attempt_number}
                    </Badge>
                    <Badge variant="outline">النموذج {attempt.form_number}</Badge>
                    {savedResult && (
                      <Badge className={cn("gap-1", savedResult.badgeClass)}>
                        {savedResult.label}
                        {savedResult.showPercentage && savedResult.percentage != null && (
                          <span className="opacity-90">— {savedResult.percentage}%</span>
                        )}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <Stat
                      label={adminMode && dirty ? "النقاط (محفوظة)" : "النقاط"}
                      value={`${attempt.earned_points} / ${attempt.total_points}`}
                    />
                    <Stat
                      label="النسبة (محفوظة)"
                      value={attempt.percentage != null ? `${attempt.percentage}%` : "—"}
                    />
                    <Stat label="عدد الأسئلة" value={String(questions.length)} />
                    <Stat label="إجمالي الوقت" value={formatDuration(totalTime)} />
                  </div>

                  {/* Live score for admin */}
                  {adminMode && (
                    <motion.div
                      layout
                      className={cn(
                        "rounded-xl border p-3 md:p-4 flex flex-wrap items-center gap-3",
                        hasUngradedFillBlank
                          ? "border-blue-500/40 bg-blue-500/10"
                          : "border-primary/40 bg-primary/5",
                      )}
                    >
                      <div className="flex-1 min-w-[180px]">
                        <div className="text-xs text-muted-foreground">الدرجة الحالية (مباشرة)</div>
                        <div className="text-2xl md:text-3xl font-bold text-foreground tabular-nums">
                          {liveScore.earned} / {liveScore.total}
                        </div>
                      </div>
                      <div className="text-3xl md:text-4xl font-black tabular-nums text-primary">
                        {liveScore.pct}%
                      </div>
                      {hasUngradedFillBlank && (
                        <div className="w-full text-xs text-blue-700 dark:text-blue-300 inline-flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5" />
                          يوجد أسئلة كتابية بحاجة إلى تصحيح — لن يتم تحويل الحالة إلى "مصحّح" حتى تُصحّح جميعها.
                        </div>
                      )}
                    </motion.div>
                  )}

                  {!adminMode && attempt.feedback && (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex gap-2">
                      <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div className="text-sm whitespace-pre-wrap">{attempt.feedback}</div>
                    </div>
                  )}
                </div>

                {/* Questions */}
                <div className="space-y-4">
                  {questions.map((q, i) => (
                    <QuestionReview
                      key={q.id}
                      q={q}
                      index={i}
                      adminMode={adminMode}
                      gradingValue={grading[q.id] ?? null}
                      onGrade={(v) => handleToggle(q.id, v)}
                    />
                  ))}
                </div>

                {/* Admin feedback editor */}
                {adminMode && (
                  <div className="rounded-2xl border border-border bg-card p-4 md:p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-primary" />
                      <div className="font-bold">ملاحظات للطالب</div>
                      {attempt.feedback_given_at && (
                        <span className="text-xs text-muted-foreground">
                          آخر إرسال: {new Date(attempt.feedback_given_at).toLocaleString("ar-EG")}
                        </span>
                      )}
                    </div>
                    <Textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={4}
                      placeholder="اكتب ملاحظات ستظهر للطالب في تفاصيل محاولته..."
                      className="resize-y"
                    />
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSendFeedback}
                        disabled={savingFeedback || !feedbackDirty}
                        className="gap-2"
                      >
                        {savingFeedback ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        إرسال Feedback
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-muted-foreground">تعذّر تحميل المحاولة.</div>
            )}
          </div>
        </ScrollArea>

        {adminMode && attempt && (
          <div className="border-t border-border p-3 md:p-4 flex flex-wrap items-center gap-3 bg-background">
            <div className="text-sm text-muted-foreground">
              {dirty ? "لديك تغييرات غير محفوظة على التصحيح." : "لا تغييرات على التصحيح."}
            </div>
            <div className="flex-1" />
            <Button
              onClick={handleSaveGrading}
              disabled={savingGrade || !dirty}
              className="gap-2"
              size="lg"
            >
              {savingGrade ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              حفظ التصحيح
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-accent/40 p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="font-bold text-foreground">{value}</div>
  </div>
);

interface QRProps {
  q: AttemptDetailQuestion;
  index: number;
  adminMode: boolean;
  gradingValue: boolean | null;
  onGrade: (v: boolean | null) => void;
}

const QuestionReview = ({ q, index, adminMode, gradingValue, onGrade }: QRProps) => {
  const isAuto = q.type !== "fill_blank";
  const orderedOptions = q.option_order
    .map((id) => q.options.find((o) => o.id === id))
    .filter(Boolean) as AttemptDetailQuestion["options"];
  const displayOptions = orderedOptions.length ? orderedOptions : q.options;

  // For auto-graded questions: admin can override.
  // Override is "on" whenever local grading differs from the originally-computed q.is_correct.
  const overridden = isAuto && adminMode && gradingValue !== q.is_correct;
  const effectiveCorrect = adminMode ? gradingValue : q.is_correct;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="p-3 md:p-4 border-b border-border flex flex-wrap items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
          {index + 1}
        </div>
        <Badge variant="outline" className="text-xs">{typeLabel[q.type]}</Badge>
        <Badge variant="secondary" className="text-xs">{q.points} نقطة</Badge>
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" /> {formatDuration(q.time_spent_seconds)}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={String(effectiveCorrect)}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
          >
            {q.type === "fill_blank" && effectiveCorrect == null ? (
              <Badge className="bg-blue-500 text-white border-0 gap-1">
                <Info className="w-3.5 h-3.5" /> بحاجة إلى تصحيح
              </Badge>
            ) : effectiveCorrect ? (
              <Badge className="bg-emerald-500 text-white border-0 gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> صحيح
              </Badge>
            ) : (
              <Badge className="bg-red-500 text-white border-0 gap-1">
                <XCircle className="w-3.5 h-3.5" /> خاطئ
              </Badge>
            )}
          </motion.div>
        </AnimatePresence>
        {overridden && (
          <Badge className="bg-amber-500 text-white border-0 text-[10px]">مُعدَّل يدوياً</Badge>
        )}
      </div>

      <div className="p-3 md:p-4 space-y-3">
        <RichTextRenderer content={q.content} />
        {q.image_url && (
          <img src={q.image_url} alt="" className="max-h-64 rounded-lg border border-border" />
        )}

        {q.type === "fill_blank" ? (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-border p-3 bg-accent/40">
              <div className="text-xs text-muted-foreground mb-1">إجابة الطالب</div>
              <div className="whitespace-pre-wrap text-sm font-medium min-h-[1.5rem]">
                {q.fill_blank_text?.trim() ? (
                  q.fill_blank_text
                ) : (
                  <span className="text-muted-foreground">لم تتم الإجابة</span>
                )}
              </div>
            </div>
            {q.model_answer_text ? (
              <div className="rounded-lg border border-emerald-500/30 p-3 bg-emerald-500/5">
                <div className="text-xs text-emerald-700 dark:text-emerald-400 mb-1">
                  إجابة نموذجية (مرجع)
                </div>
                <div className="whitespace-pre-wrap text-sm">{q.model_answer_text}</div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                لا توجد إجابة نموذجية.
              </div>
            )}
          </div>
        ) : (
          <ul className="space-y-2">
            {displayOptions.map((o) => {
              const isSelected = q.selected_option_ids.includes(o.id);
              const showCorrect = o.is_correct;
              return (
                <li
                  key={o.id}
                  className={cn(
                    "rounded-lg border p-3 flex items-start gap-3 text-sm",
                    showCorrect
                      ? "border-emerald-500/60 bg-emerald-500/5"
                      : isSelected
                        ? "border-red-500/60 bg-red-500/5"
                        : "border-border bg-background",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
                      showCorrect
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : isSelected
                          ? "border-red-500 bg-red-500 text-white"
                          : "border-border",
                    )}
                  >
                    {showCorrect ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : isSelected ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <RichTextRenderer content={o.content} />
                    <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                      {isSelected && <span>اختيار الطالب</span>}
                      {showCorrect && <span>الإجابة الصحيحة</span>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Admin controls */}
        {adminMode && isAuto && (
          <div className="rounded-lg border border-dashed border-border p-3 flex flex-wrap items-center gap-3">
            <Switch
              checked={overridden}
              onCheckedChange={(on) => {
                // Turning override on: flip the auto result. Turning off: restore.
                if (on) onGrade(!(q.is_correct ?? false));
                else onGrade(q.is_correct ?? null);
              }}
              id={`override-${q.id}`}
            />
            <label htmlFor={`override-${q.id}`} className="text-sm cursor-pointer">
              تعديل التصحيح يدوياً
            </label>
            {overridden && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                الحالة بعد التعديل: {gradingValue ? "صحيح" : "خاطئ"}
              </span>
            )}
          </div>
        )}

        {adminMode && q.type === "fill_blank" && (
          <div className="rounded-lg border border-dashed border-border p-3 flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium ml-auto">تصحيح الإجابة:</div>
            <Button
              type="button"
              size="sm"
              variant={gradingValue === true ? "default" : "outline"}
              onClick={() => onGrade(true)}
              className={cn(
                "gap-1.5",
                gradingValue === true && "bg-emerald-500 hover:bg-emerald-600 text-white border-0",
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              صحيحة
            </Button>
            <Button
              type="button"
              size="sm"
              variant={gradingValue === false ? "default" : "outline"}
              onClick={() => onGrade(false)}
              className={cn(
                "gap-1.5",
                gradingValue === false && "bg-red-500 hover:bg-red-600 text-white border-0",
              )}
            >
              <XCircle className="w-4 h-4" />
              غير صحيحة
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
