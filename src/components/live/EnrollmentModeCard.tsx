import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";

export type EnrollmentMode = "standard" | "auto_all_students" | "auto_stages";

interface Props {
  courseId: string;
  isPaid: boolean;
  mode: EnrollmentMode;
  onModeChange: (mode: EnrollmentMode) => void;
  stageIds: string[];
  onStageIdsChange: (ids: string[]) => void;
  onSaved?: () => void;
}

const OPTIONS: { value: EnrollmentMode; title: string; hint: string }[] = [
  {
    value: "standard",
    title: "عادية",
    hint: "يلتحق الطالب بالشراء أو التسجيل المجاني من صفحة الدورة.",
  },
  {
    value: "auto_all_students",
    title: "لجميع طلاب المنصة",
    hint: "يُسجَّل كل الطلاب الحاليين والجدد تلقائياً.",
  },
  {
    value: "auto_stages",
    title: "لصفوف محددة",
    hint: "يُسجَّل طلاب الصفوف المختارة في الدورة تلقائياً.",
  },
];

/** Enrollment rules card. Auto modes are free-course only (mirrored by a DB CHECK). */
const EnrollmentModeCard = ({
  courseId,
  isPaid,
  mode,
  onModeChange,
  stageIds,
  onStageIdsChange,
  onSaved,
}: Props) => {
  const [applying, setApplying] = useState(false);
  const autoDisabled = isPaid;

  const applyNow = async () => {
    if (mode === "standard") {
      onSaved?.();
      return;
    }
    setApplying(true);
    try {
      const { data, error } = await supabase.rpc("apply_course_auto_enrollment", {
        _course_id: courseId,
      });
      if (error) throw error;
      toast.success(`تم تسجيل ${data ?? 0} طالب تلقائياً`);
      onSaved?.();
    } catch {
      toast.error("تعذّر تطبيق التسجيل التلقائي");
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 md:p-6 space-y-4">
      <h2 className="text-lg font-bold">طريقة الالتحاق</h2>

      <RadioGroup
        value={mode}
        onValueChange={(v) => onModeChange(v as EnrollmentMode)}
        className="space-y-3"
      >
        {OPTIONS.map((option) => {
          const disabled = option.value !== "standard" && autoDisabled;
          const selected = mode === option.value;
          return (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                selected ? "border-primary bg-primary/5" : "border-border"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <RadioGroupItem value={option.value} disabled={disabled} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{option.title}</span>
                <span className="block text-sm text-muted-foreground">{option.hint}</span>
                {disabled && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    متاح للدورات المجانية فقط
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </RadioGroup>

      {mode === "auto_stages" && stageIds.length === 0 && (
        <p className="text-sm text-destructive">اختر صفاً واحداً على الأقل</p>
      )}

      {mode !== "standard" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={applyNow}
            disabled={applying || (mode === "auto_stages" && stageIds.length === 0)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-60"
          >
            {applying && <Loader2 className="h-4 w-4 animate-spin" />}
            تطبيق التسجيل التلقائي الآن
          </button>
          <span className="text-xs text-muted-foreground">
            يُطبق تلقائياً عند الحفظ أيضاً.
          </span>
        </div>
      )}

    </section>
  );
};

export default EnrollmentModeCard;
