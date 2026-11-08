import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Award,
  CalendarClock,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Save,
  Send,
  User as UserIcon,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AiGradeSuggestion from "@/components/ai/AiGradeSuggestion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import RichTextRenderer, { isEmptyDoc } from "@/components/admin/quiz/RichTextRenderer";
import {
  adminSaveFeedback,
  adminSaveGrade,
  deriveOutcome,
  getSubmissionDetail,
  getSubmissionFileSignedUrl,
  type SubmissionDetail,
} from "@/lib/assignment-submissions-api";
import { outcomeDisplay } from "@/lib/assignment-outcome";

interface Props {
  submissionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isReadOnly?: boolean;
  onSaved?: () => void;
}

const fmt = (iso: string | null) =>
  !iso
    ? "—"
    : new Date(iso).toLocaleString("ar-EG", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

export default function SubmissionGradingModal({
  submissionId,
  open,
  onOpenChange,
  isReadOnly = false,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [gradeInput, setGradeInput] = useState<string>("");
  const [feedback, setFeedback] = useState("");
  const [savingGrade, setSavingGrade] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!submissionId) return;
    setLoading(true);
    try {
      const d = await getSubmissionDetail(submissionId, { asAdmin: !isReadOnly });
      setDetail(d);
      setGradeInput(d.submission.grade != null ? String(d.submission.grade) : "");
      setFeedback(d.submission.feedback ?? "");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل تفاصيل التسليم");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [submissionId, isReadOnly, onOpenChange]);

  useEffect(() => {
    if (open && submissionId) load();
    if (!open) {
      setDetail(null);
      setGradeInput("");
      setFeedback("");
    }
  }, [open, submissionId, load]);

  const isNeverSubmitted = useMemo(() => {
    if (!detail) return false;
    if (detail.submission.outcome === "not_submitted") return true;
    return (
      detail.submission.status === "draft" &&
      new Date(detail.assignment.end_at).getTime() < Date.now()
    );
  }, [detail]);

  const currentOutcome = useMemo(() => {
    if (!detail) return null;
    return deriveOutcome({
      outcome: detail.submission.outcome,
      status: detail.submission.status,
      end_at: detail.assignment.end_at,
    });
  }, [detail]);

  const projectedOutcome = useMemo<
    "passed" | "failed" | "not_submitted" | null
  >(() => {
    if (!detail) return null;
    if (isNeverSubmitted) return "not_submitted";
    const num = Number(gradeInput);
    if (Number.isNaN(num)) return null;
    return num >= detail.assignment.pass_grade ? "passed" : "failed";
  }, [detail, gradeInput, isNeverSubmitted]);

  const feedbackDirty = detail ? feedback !== (detail.submission.feedback ?? "") : false;

  const openFile = async (file: SubmissionDetail["files"][number]) => {
    try {
      setDownloadingId(file.id);
      const url = await getSubmissionFileSignedUrl(file.file_url, file.file_name);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر فتح الملف");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSaveGrade = async () => {
    if (!detail) return;
    const num = Number(gradeInput);
    if (!isNeverSubmitted) {
      if (gradeInput === "" || Number.isNaN(num)) {
        toast.error("أدخل درجة صحيحة");
        return;
      }
      if (num < 0 || num > detail.assignment.total_grade) {
        toast.error(`الدرجة يجب أن تكون بين 0 و ${detail.assignment.total_grade}`);
        return;
      }
    }
    setSavingGrade(true);
    try {
      const updated = await adminSaveGrade({
        submissionId: detail.submission.id,
        grade: isNeverSubmitted ? 0 : num,
        passGrade: detail.assignment.pass_grade,
        status: detail.submission.status,
        totalGrade: detail.assignment.total_grade,
      });
      setDetail((prev) => (prev ? { ...prev, submission: { ...prev.submission, ...updated } } : prev));
      toast.success("تم حفظ التقييم");
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حفظ التقييم");
    } finally {
      setSavingGrade(false);
    }
  };

  const handleSaveFeedback = async () => {
    if (!detail) return;
    setSavingFeedback(true);
    try {
      const updated = await adminSaveFeedback(detail.submission.id, feedback);
      setDetail((prev) => (prev ? { ...prev, submission: { ...prev.submission, ...updated } } : prev));
      toast.success("تم إرسال Feedback");
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر إرسال Feedback");
    } finally {
      setSavingFeedback(false);
    }
  };

  const currentDisplay = outcomeDisplay(currentOutcome);
  const projectedDisplay = outcomeDisplay(projectedOutcome);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isReadOnly ? "تفاصيل تسليم الواجب" : "تصحيح تسليم الواجب"}
            {detail && (
              <Badge className={cn("gap-1", currentDisplay.badgeClass)}>{currentDisplay.label}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading || !detail ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Header meta */}
            <div className="rounded-2xl border border-border bg-muted/30 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-bold text-lg text-foreground">{detail.assignment.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {detail.assignment.courses?.title || "—"}
                  </div>
                </div>
                <div className="text-right text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center gap-1.5 justify-end">
                    <CalendarClock className="w-3.5 h-3.5" />
                    الموعد النهائي: {fmt(detail.assignment.end_at)}
                  </div>
                  <div>التسليم: {fmt(detail.submission.submitted_at)}</div>
                </div>
              </div>

              {!isReadOnly && detail.student && (
                <div className="flex items-center gap-2 pt-2 border-t border-border/50 text-sm">
                  <UserIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{detail.student.full_name || "بدون اسم"}</span>
                  <span className="text-muted-foreground text-xs">
                    {detail.student.email || detail.student.phone_number || detail.student.student_id}
                  </span>
                </div>
              )}
            </div>

            {/* Submitted text */}
            <div>
              <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4" /> نص التسليم
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 min-h-[100px]">
                {isEmptyDoc(detail.submission.text_content) ? (
                  <div className="text-sm text-muted-foreground italic">
                    {isNeverSubmitted
                      ? "لم يقم الطالب بتقديم أي محتوى — انتهت مهلة الواجب."
                      : "لم يُدخل الطالب نصًا."}
                  </div>
                ) : (
                  <RichTextRenderer content={detail.submission.text_content} />
                )}
              </div>
            </div>

            {/* Files */}
            <div>
              <div className="text-sm font-semibold mb-2">الملفات المرفقة ({detail.files.length})</div>
              {detail.files.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground text-center">
                  لا توجد ملفات مرفقة.
                </div>
              ) : (
                <div className="space-y-2">
                  {detail.files.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => openFile(f)}
                      className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-accent/40 transition-colors text-right"
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{f.file_name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {(f.file_size_bytes / 1024 / 1024).toFixed(2)} MB
                        </div>
                      </div>
                      {downloadingId === f.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Download className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* AI grading suggestion (admin only; fills the form, teacher still saves) */}
            {!isReadOnly && detail.submission.status === "submitted" && (
              <AiGradeSuggestion
                kind="assignment"
                targetId={detail.submission.id}
                onAdopt={(score, fb) => {
                  setGradeInput(String(score));
                  if (fb) setFeedback(fb);
                  toast.success("تم ملء الدرجة والملاحظات — راجعها ثم احفظ");
                }}
              />
            )}

            {/* Grading (admin only) */}
            {!isReadOnly && (
              <motion.div
                layout
                className="rounded-2xl border border-primary/25 bg-primary/5 p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Award className="w-4 h-4 text-primary" />
                  التقييم
                </div>

                {isNeverSubmitted ? (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-700 dark:text-red-300 p-3">
                    لم يقم الطالب بتسليم الواجب قبل انتهاء المهلة. سيتم تسجيل النتيجة تلقائيًا
                    كـ<span className="font-bold"> «لم يتم التسليم» </span>
                    مع درجة صفر عند الحفظ.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">
                        الدرجة (من {detail.assignment.total_grade})
                      </label>
                      <Input
                        type="number"
                        min={0}
                        max={detail.assignment.total_grade}
                        step="any"
                        value={gradeInput}
                        onChange={(e) => setGradeInput(e.target.value)}
                        placeholder="0"
                        className="text-lg font-semibold tabular-nums"
                      />
                      <div className="text-[11px] text-muted-foreground mt-1">
                        درجة النجاح: {detail.assignment.pass_grade}
                      </div>
                    </div>

                    <AnimatePresence mode="wait">
                      {projectedOutcome && gradeInput !== "" && (
                        <motion.div
                          key={projectedOutcome}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="pb-1"
                        >
                          <div className="text-[11px] text-muted-foreground mb-1">النتيجة المتوقعة</div>
                          <Badge className={cn("text-sm px-3 py-1.5", projectedDisplay.badgeClass)}>
                            {projectedDisplay.label}
                          </Badge>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 justify-between pt-1">
                  <div className="text-[11px] text-muted-foreground">
                    آخر تعديل تقييم: {fmt(detail.submission.graded_at)}
                  </div>
                  <Button onClick={handleSaveGrade} disabled={savingGrade} className="gap-2">
                    {savingGrade ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    حفظ التقييم
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Feedback */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="w-4 h-4" /> Feedback
                {detail.submission.feedback_given_at && (
                  <span className="text-[11px] text-muted-foreground font-normal">
                    · {fmt(detail.submission.feedback_given_at)}
                  </span>
                )}
              </div>
              {isReadOnly ? (
                detail.submission.feedback ? (
                  <div className="text-sm whitespace-pre-wrap rounded-xl bg-muted/40 p-3">
                    {detail.submission.feedback}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground italic">
                    لم يتم إرسال Feedback بعد.
                  </div>
                )
              ) : (
                <>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    rows={4}
                    placeholder="اكتب ملاحظاتك للطالب…"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveFeedback}
                      disabled={savingFeedback || !feedbackDirty}
                      variant="secondary"
                      className="gap-2"
                    >
                      {savingFeedback ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      إرسال Feedback
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="gap-2">
                <X className="w-4 h-4" /> إغلاق
              </Button>
            </div>
          </motion.div>
        )}
      </DialogContent>
    </Dialog>
  );
}
