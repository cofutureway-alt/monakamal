import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  GraduationCap,
  KeyRound,
  Layers,
  ListChecks,
  Loader2,
  PencilLine,
  Tag,
  Ticket,
  UserMinus,
  UserPlus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { AiApiError, type ActionProposalBlock, type ActionState } from "@/lib/ai-api";
import { buildLessonPdf, pdfFileName } from "@/lib/lesson-pdf";

const TOOL_ICON: Record<string, typeof Check> = {
  create_course_draft: BookOpen,
  create_unit: Layers,
  create_lesson: FileText,
  create_quiz_with_questions: ListChecks,
  create_assignment: PencilLine,
  generate_lesson_pdf: FileText,
  create_purchase_codes: Ticket,
  set_course_discount: Tag,
  update_course_price: Tag,
  create_student: UserPlus,
  enroll_student: GraduationCap,
  unenroll_student: UserMinus,
  ban_user: Ban,
  unban_user: UserPlus,
  grade_submission: Check,
  schedule_live_session: CalendarClock,
};

function useCountdown(expiresAt: string, active: boolean) {
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setLeft(new Date(expiresAt).getTime() - Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, active]);
  const s = Math.max(0, Math.floor(left / 1000));
  return { expired: left <= 0, label: `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` };
}

function downloadCsv(name: string, rows: string[][]) {
  const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Uploads the browser-built lesson PDF and records it as a lesson file. */
async function runLessonPdf(payload: NonNullable<ActionProposalBlock["client_payload"]>) {
  const blob = await buildLessonPdf({ title: payload.title, outline_markdown: payload.outline_markdown });
  const path = `${payload.lesson_id}/${crypto.randomUUID()}.pdf`;
  const { error: upErr } = await supabase.storage.from("lesson-files").upload(path, blob, { contentType: "application/pdf" });
  if (upErr) throw new Error("UPLOAD_FAILED");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("lesson_files")
    .insert({
      lesson_id: payload.lesson_id,
      file_name: pdfFileName(payload.title),
      file_size: blob.size,
      file_type: "application/pdf",
      file_url: path,
      allow_download: true,
    })
    .select("id")
    .single();
  if (error || !data) {
    await supabase.storage.from("lesson-files").remove([path]);
    throw new Error("SAVE_FAILED");
  }
  return { file_id: data.id as string, blob, name: pdfFileName(payload.title) };
}

interface Props {
  block: ActionProposalBlock;
  state: ActionState | undefined;
  onDecide: (
    decision: "confirm" | "cancel",
    extra?: { confirm_text?: string; client_result?: Record<string, unknown> },
  ) => Promise<{ payload?: Record<string, unknown> } | void>;
}

const ActionProposalCard = ({ block, state, onDecide }: Props) => {
  const status = state?.status ?? "pending";
  const pending = status === "pending";
  const { expired, label } = useCountdown(block.expires_at, pending);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [secret, setSecret] = useState<{ login: string; password: string } | null>(null);
  const [codes, setCodes] = useState<{ codes: string[]; title: string } | null>(null);
  const [pdf, setPdf] = useState<{ url: string; name: string } | null>(null);
  const Icon = TOOL_ICON[block.tool] ?? PencilLine;
  const phraseOk = !block.destructive || typed.trim() === (block.confirm_phrase ?? "").trim();
  const showActions = (pending || status === "failed") && !expired;

  const confirm = async () => {
    setBusy("confirm");
    try {
      let clientResult: Record<string, unknown> | undefined;
      let pdfResult: Awaited<ReturnType<typeof runLessonPdf>> | null = null;
      if (block.client_side === "lesson_pdf" && block.client_payload) {
        try {
          pdfResult = await runLessonPdf(block.client_payload);
          clientResult = { file_id: pdfResult.file_id };
        } catch {
          toast.error("تعذّر إنشاء الملف أو رفعه");
          return;
        }
      }
      const res = await onDecide("confirm", { confirm_text: block.destructive ? typed : undefined, client_result: clientResult });
      const payload = (res && res.payload) || {};
      if (typeof payload.password === "string") setSecret({ login: String(payload.login ?? ""), password: payload.password });
      if (Array.isArray(payload.codes)) setCodes({ codes: payload.codes as string[], title: String(payload.target_title ?? "") });
      if (pdfResult) setPdf({ url: URL.createObjectURL(pdfResult.blob), name: pdfResult.name });
    } catch (e) {
      if (e instanceof AiApiError && e.code === "CONFIRM_MISMATCH") toast.error(e.messageAr);
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      await onDecide("cancel");
    } catch {
      // state already updated by the hook
    } finally {
      setBusy(null);
    }
  };

  const tone =
    status === "executed"
      ? "border-primary/30 bg-primary/5"
      : block.destructive && (pending || status === "failed")
        ? "border-destructive/40 bg-card"
        : "border-border/60 bg-card";

  return (
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${tone}`}>
      <div className={`flex items-center gap-2 border-b border-border/60 px-4 py-3 ${block.destructive ? "text-destructive" : ""}`}>
        {block.destructive ? <AlertTriangle className="h-5 w-5" /> : <Icon className="h-5 w-5 text-primary" />}
        <h4 className="font-bold">{block.title_ar}</h4>
      </div>

      <div className="space-y-1 px-4 py-3">
        {block.fields.map((f, i) => (
          <div key={`${f.label}-${i}`} className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-3 py-1 text-sm">
            <span className="text-muted-foreground">{f.label}</span>
            <span className="min-w-0 break-words">
              {f.before != null && f.before !== "" && (
                <>
                  <span className="text-muted-foreground line-through">{f.before}</span>
                  <span className="mx-1.5 text-muted-foreground">←</span>
                </>
              )}
              <span className="font-semibold">{f.after}</span>
            </span>
          </div>
        ))}
        {block.affected > 1 && <p className="pt-1 text-xs text-muted-foreground">عدد العناصر المتأثرة: {block.affected}</p>}
      </div>

      {showActions && block.destructive && (
        <div className="px-4 pb-2">
          <label className="mb-1.5 block text-xs text-muted-foreground" htmlFor={`confirm-${block.action_id}`}>
            اكتب «{block.confirm_phrase}» للتأكيد
          </label>
          <Input
            id={`confirm-${block.action_id}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            aria-invalid={typed.length > 0 && !phraseOk}
          />
        </div>
      )}

      {/* Footer by state */}
      <div className="border-t border-border/60 px-4 py-3">
        {showActions ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={block.destructive ? "destructive" : "default"}
              disabled={!phraseOk || busy !== null}
              onClick={confirm}
            >
              {busy === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {busy === "confirm" ? "جارٍ التنفيذ…" : status === "failed" ? "إعادة المحاولة" : "تأكيد التنفيذ"}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={cancel}>
              إلغاء
            </Button>
            <span className="ms-auto text-xs text-muted-foreground tabular-nums">ينتهي هذا الاقتراح خلال {label}</span>
            {status === "failed" && state?.error_ar && (
              <p className="flex w-full items-center gap-1.5 text-sm text-destructive">
                <XCircle className="h-4 w-4" /> {state.error_ar}
              </p>
            )}
            {pending && state?.error_ar && <p className="w-full text-xs text-destructive">{state.error_ar}</p>}
          </div>
        ) : status === "executed" ? (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
              <CheckCircle2 className="h-4 w-4" /> تم التنفيذ{state?.result_summary_ar ? ` — ${state.result_summary_ar}` : ""}
            </p>
            {secret && (
              <div className="rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
                <p className="mb-2 flex items-center gap-1.5 font-semibold">
                  <KeyRound className="h-4 w-4" /> بيانات الدخول — تظهر مرة واحدة فقط
                </p>
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1" dir="ltr">
                  <span className="text-muted-foreground">Login</span>
                  <code className="font-mono">{secret.login}</code>
                  <span />
                  <span className="text-muted-foreground">Password</span>
                  <code className="font-mono">{secret.password}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    aria-label="نسخ كلمة المرور"
                    onClick={() => navigator.clipboard.writeText(secret.password).then(() => toast.success("تم النسخ"))}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {codes && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadCsv(`codes-${codes.codes.length}.csv`, [["الكود", "الهدف"], ...codes.codes.map((c) => [c, codes.title])])
                  }
                >
                  <Download className="h-4 w-4" /> تنزيل الأكواد ({codes.codes.length})
                </Button>
              )}
              {pdf && (
                <Button size="sm" variant="outline" asChild>
                  <a href={pdf.url} download={pdf.name}>
                    <Download className="h-4 w-4" /> {pdf.name}
                  </a>
                </Button>
              )}
              {state?.links?.map((l) => (
                <Button key={l.href} size="sm" variant="outline" asChild>
                  <Link to={l.href}>{l.label_ar}</Link>
                </Button>
              ))}
            </div>
          </div>
        ) : status === "cancelled" ? (
          <p className="text-sm text-muted-foreground">تم الإلغاء</p>
        ) : (
          <p className="text-sm text-muted-foreground">انتهت صلاحية الاقتراح — اطلبه مجدداً</p>
        )}
      </div>
    </div>
  );
};

export default ActionProposalCard;
