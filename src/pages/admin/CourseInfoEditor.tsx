import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowRight,
  Loader2,
  Upload,
  X,
  AlertTriangle,
  Layers,
  BookMarked,
  Wallet,
  Tag,
  Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { parseEgpToPiastres, piastresToEgpNumber, formatPiastres } from "@/lib/money";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import EnrollmentModeCard, {
  type EnrollmentMode,
} from "@/components/live/EnrollmentModeCard";

const schema = z
  .object({
    title: z.string().trim().min(2, "العنوان قصير جدًا").max(120),
    description: z.string().trim().max(1000).optional(),
    stage_id: z.string().optional(),
    subject_id: z.string().optional(),
    is_paid: z.boolean(),
    price_egp: z.string().optional(),
    discount_price_egp: z.string().optional(),
    discount_expires_at: z.string().optional(),
    content_drip_enabled: z.boolean().default(false),
    is_featured: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    if (val.is_paid) {
      const p = Number(val.price_egp);
      if (!val.price_egp || !Number.isFinite(p) || p < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["price_egp"],
          message: "أدخل سعرًا صالحًا",
        });
      }
      if (val.discount_price_egp) {
        const d = Number(val.discount_price_egp);
        if (!Number.isFinite(d) || d < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["discount_price_egp"],
            message: "سعر الخصم غير صالح",
          });
        } else if (Number.isFinite(p) && d >= p) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["discount_price_egp"],
            message: "يجب أن يكون سعر الخصم أقل من السعر الأصلي",
          });
        }
      }
    }
  });
type FormValues = z.infer<typeof schema>;

const MAX_MB = 3;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

interface Stage {
  id: string;
  name: string;
}
interface Subject {
  id: string;
  name: string;
}

const CourseInfoEditor = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [stages, setStages] = useState<Stage[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [existingThumb, setExistingThumb] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const existingSigned = useSignedThumbnail(existingThumb);

  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);

  // ?type=live arrives from the AdminCourses "new course" dropdown.
  const [searchParams] = useSearchParams();
  const [courseType, setCourseType] = useState<"recorded" | "live">(
    searchParams.get("type") === "live" ? "live" : "recorded",
  );
  const [enrollmentMode, setEnrollmentMode] = useState<EnrollmentMode>("standard");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      stage_id: "",
      subject_id: "",
      is_paid: false,
      price_egp: "",
      discount_price_egp: "",
      discount_expires_at: "",
      content_drip_enabled: false,
      is_featured: false,
    },
  });
  const stageVal = watch("stage_id");
  const subjectVal = watch("subject_id");
  const isPaid = watch("is_paid");
  const priceEgp = watch("price_egp");
  const discountEgp = watch("discount_price_egp");
  const dripEnabled = watch("content_drip_enabled");
  const isFeatured = watch("is_featured");

  useEffect(() => {
    supabase
      .from("stages")
      .select("id, name")
      .order("name")
      .then(({ data }) => setStages((data as Stage[]) ?? []));

    (supabase as any)
      .from("subjects")
      .select("id, name")
      .order("name")
      .then(({ data }: any) => setSubjects((data as Subject[]) ?? []));

    if (isEdit) {
      supabase
        .from("courses")
        .select("*")
        .eq("id", id!)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) {
            toast.error("لم يتم العثور على الدورة");
            navigate("/admin/courses");
            return;
          }
          const sIds = (data as any).stage_ids && (data as any).stage_ids.length > 0
            ? (data as any).stage_ids
            : data.stage_id ? [data.stage_id] : [];
          const subIds = (data as any).subject_ids && (data as any).subject_ids.length > 0
            ? (data as any).subject_ids
            : (data as any).subject_id ? [(data as any).subject_id] : [];

          setSelectedStageIds(sIds);
          setSelectedSubjectIds(subIds);
          if ((data as any).course_type) setCourseType((data as any).course_type);
          if ((data as any).enrollment_mode) setEnrollmentMode((data as any).enrollment_mode);

          reset({
            title: data.title,
            description: data.description ?? "",
            stage_id: data.stage_id ?? "",
            subject_id: (data as any).subject_id ?? "",
            is_paid: !!(data as any).is_paid,
            price_egp: piastresToEgpNumber((data as any).price_piastres),
            discount_price_egp: piastresToEgpNumber((data as any).discount_price_piastres),
            discount_expires_at: (data as any).discount_expires_at
              ? new Date((data as any).discount_expires_at).toISOString().slice(0, 16)
              : "",
            content_drip_enabled: !!(data as any).content_drip_enabled,
            is_featured: !!(data as any).is_featured,
          });
          setExistingThumb(data.thumbnail_url);
          setLoading(false);
        });
    }
  }, [id, isEdit, navigate, reset]);

  const displayPreview = useMemo(() => {
    if (preview) return preview;
    if (isEdit && existingSigned) return existingSigned;
    return null;
  }, [preview, isEdit, existingSigned]);

  const handleFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) {
      toast.error("صيغة غير مدعومة");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`الحجم يجب أن يكون أقل من ${MAX_MB}MB`);
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      let thumbPath = existingThumb;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `courses/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("thumbnails")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw upErr;
        if (existingThumb) {
          await supabase.storage.from("thumbnails").remove([existingThumb]);
        }
        thumbPath = path;
      }

      const pricePia = values.is_paid ? parseEgpToPiastres(values.price_egp) : null;
      const discountPia =
        values.is_paid && values.discount_price_egp
          ? parseEgpToPiastres(values.discount_price_egp)
          : null;
      const discountExp =
        values.is_paid && discountPia !== null && values.discount_expires_at
          ? new Date(values.discount_expires_at).toISOString()
          : null;

      const pricingPayload = {
        is_paid: values.is_paid,
        price_piastres: pricePia,
        discount_price_piastres: discountPia,
        discount_expires_at: discountExp,
        content_drip_enabled: !!values.content_drip_enabled,
        is_featured: !!values.is_featured,
      };

      const primaryStageId = selectedStageIds.length > 0 ? selectedStageIds[0] : (values.stage_id || null);
      const primarySubjectId = selectedSubjectIds.length > 0 ? selectedSubjectIds[0] : (values.subject_id || null);

      if (isEdit) {
        const { error } = await (supabase as any)
          .from("courses")
          .update({
            title: values.title,
            description: values.description || null,
            stage_id: primaryStageId,
            subject_id: primarySubjectId,
            stage_ids: selectedStageIds,
            subject_ids: selectedSubjectIds,
            thumbnail_url: thumbPath,
            course_type: courseType,
            // Paid courses can never keep an auto mode (DB CHECK enforces it too).
            enrollment_mode: values.is_paid ? "standard" : enrollmentMode,
            ...pricingPayload,
          })
          .eq("id", id!);
        if (error) throw error;
        toast.success("تم تحديث الدورة");
        navigate(`/admin/courses/${id}/builder`);
      } else {
        const { data: userRes } = await supabase.auth.getUser();
        const { data, error } = await (supabase as any)
          .from("courses")
          .insert({
            title: values.title,
            description: values.description || null,
            stage_id: primaryStageId,
            subject_id: primarySubjectId,
            stage_ids: selectedStageIds,
            subject_ids: selectedSubjectIds,
            thumbnail_url: thumbPath,
            course_type: courseType,
            enrollment_mode: values.is_paid ? "standard" : enrollmentMode,
            status: "draft",
            created_by: userRes.user?.id ?? null,
            ...pricingPayload,
          })
          .select("id")
          .single();
        if (error) throw error;
        toast.success("تم إنشاء الدورة — أضف الوحدات الآن");
        navigate(`/admin/courses/${data!.id}/builder`);
      }
    } catch (e: any) {
      toast.error(e?.message || "حدث خطأ أثناء الحفظ");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          to="/admin/courses"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowRight className="w-4 h-4" />
          العودة إلى الدورات
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          {isEdit ? "تعديل بيانات الدورة" : "دورة جديدة"}
        </h1>
        <p className="text-muted-foreground mt-2">
          {isEdit
            ? "قم بتحديث المعلومات الأساسية للدورة."
            : "الخطوة 1 من 2 — بيانات الدورة. ستنتقل بعدها لبناء المحتوى."}
        </p>
      </motion.div>

      {stages.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 mb-4 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-foreground">لا توجد مراحل بعد</div>
            <p className="text-sm text-muted-foreground">
              يجب إنشاء مرحلة واحدة على الأقل قبل إنشاء دورة.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/stages">
              <Layers className="w-4 h-4 ml-2" />
              إدارة المراحل
            </Link>
          </Button>
        </motion.div>
      )}

      {subjects.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 mb-6 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-foreground">لا توجد مواد دراسية بعد</div>
            <p className="text-sm text-muted-foreground">
              يجب إنشاء مادة دراسية واحدة على الأقل أولاً.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/subjects">
              <BookMarked className="w-4 h-4 ml-2" />
              إدارة المواد
            </Link>
          </Button>
        </motion.div>
      )}

      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-6 rounded-2xl border border-border/60 bg-card p-6 md:p-8"
      >
        <div className="space-y-2">
          <Label htmlFor="title">عنوان الدورة</Label>
          <Input id="title" placeholder="مثال: أساسيات الرياضيات" {...register("title")} />
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">وصف الدورة</Label>
          <Textarea id="description" rows={4} placeholder="نبذة عن الدورة" {...register("description")} />
          {errors.description && (
            <p className="text-xs text-destructive">{errors.description.message}</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>المواد الدراسية (يمكن اختيار أكثر من مادة)</span>
              <span className="text-xs text-muted-foreground">{selectedSubjectIds.length} مواد مختارة</span>
            </Label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-card">
              {subjects.map((s) => {
                const selected = selectedSubjectIds.includes(s.id);
                return (
                  <Badge
                    key={s.id}
                    variant={selected ? "default" : "outline"}
                    className={`cursor-pointer gap-1.5 py-1.5 px-3 transition-all ${
                      selected ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent"
                    }`}
                    onClick={() => {
                      const next = selected
                        ? selectedSubjectIds.filter((x) => x !== s.id)
                        : [...selectedSubjectIds, s.id];
                      setSelectedSubjectIds(next);
                      setValue("subject_id", next.length > 0 ? next[0] : "", { shouldValidate: true });
                    }}
                  >
                    {selected && <Check className="w-3.5 h-3.5" />}
                    {s.name}
                  </Badge>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              <span>المراحل الدراسية (يمكن اختيار أكثر من مرحلة)</span>
              <span className="text-xs text-muted-foreground">{selectedStageIds.length} مراحل مختارة</span>
            </Label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-border bg-card">
              {stages.map((s) => {
                const selected = selectedStageIds.includes(s.id);
                return (
                  <Badge
                    key={s.id}
                    variant={selected ? "default" : "outline"}
                    className={`cursor-pointer gap-1.5 py-1.5 px-3 transition-all ${
                      selected ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-accent"
                    }`}
                    onClick={() => {
                      const next = selected
                        ? selectedStageIds.filter((x) => x !== s.id)
                        : [...selectedStageIds, s.id];
                      setSelectedStageIds(next);
                      setValue("stage_id", next.length > 0 ? next[0] : "", { shouldValidate: true });
                    }}
                  >
                    {selected && <Check className="w-3.5 h-3.5" />}
                    {s.name}
                  </Badge>
                );
              })}
            </div>
          </div>
        </div>

        {isEdit && (
          <EnrollmentModeCard
            courseId={id!}
            isPaid={isPaid}
            mode={enrollmentMode}
            onModeChange={setEnrollmentMode}
            stageIds={selectedStageIds}
            onStageIdsChange={setSelectedStageIds}
          />
        )}

        {/* Pricing section */}
        <div className="rounded-xl border border-border/70 bg-accent/20 p-4 md:p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            <Label className="text-base font-bold">تسعير الدورة</Label>
          </div>

          <div className="space-y-2">
            <Label>نوع الكورس</Label>
            <RadioGroup
              value={isPaid ? "paid" : "free"}
              onValueChange={(v) => {
                const paid = v === "paid";
                setValue("is_paid", paid, { shouldValidate: true });
                if (!paid) {
                  setValue("price_egp", "");
                  setValue("discount_price_egp", "");
                  setValue("discount_expires_at", "");
                }
              }}
              className="grid grid-cols-2 gap-3"
            >
              <label
                htmlFor="type-free"
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  !isPaid ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <RadioGroupItem id="type-free" value="free" />
                <div className="flex-1">
                  <div className="text-sm font-bold">مجاني</div>
                  <div className="text-xs text-muted-foreground">تسجيل مباشر بدون دفع</div>
                </div>
              </label>
              <label
                htmlFor="type-paid"
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  isPaid ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <RadioGroupItem id="type-paid" value="paid" />
                <div className="flex-1">
                  <div className="text-sm font-bold">مدفوع</div>
                  <div className="text-xs text-muted-foreground">يشتري الطالب الوصول</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          <AnimatePresence initial={false}>
            {isPaid && (
              <motion.div
                key="paid-fields"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="space-y-4 overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="price_egp">السعر (ج.م)</Label>
                    <Input
                      id="price_egp"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="100"
                      {...register("price_egp")}
                    />
                    {errors.price_egp && (
                      <p className="text-xs text-destructive">{errors.price_egp.message}</p>
                    )}
                    {priceEgp && Number(priceEgp) > 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        يُخزَّن كـ {parseEgpToPiastres(priceEgp)?.toLocaleString("ar-EG")} قرش
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="discount_price_egp" className="flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5" />
                      سعر الخصم (اختياري)
                    </Label>
                    <Input
                      id="discount_price_egp"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="80"
                      {...register("discount_price_egp")}
                    />
                    {errors.discount_price_egp && (
                      <p className="text-xs text-destructive">
                        {errors.discount_price_egp.message}
                      </p>
                    )}
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {discountEgp && Number(discountEgp) >= 0 && (
                    <motion.div
                      key="expiry"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <Label htmlFor="discount_expires_at">تاريخ انتهاء الخصم (اختياري)</Label>
                      <Input
                        id="discount_expires_at"
                        type="datetime-local"
                        {...register("discount_expires_at")}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        اتركه فارغًا لجعل الخصم دائمًا (بدون عدّاد تنازلي).
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {priceEgp && Number(priceEgp) > 0 && (
                  <div className="rounded-lg bg-background border border-border p-3 flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs text-muted-foreground">السعر النهائي المعروض:</span>
                    {discountEgp &&
                    Number(discountEgp) >= 0 &&
                    Number(discountEgp) < Number(priceEgp) ? (
                      <>
                        <span className="text-lg font-extrabold text-primary">
                          {formatPiastres(parseEgpToPiastres(discountEgp))}
                        </span>
                        <span className="text-xs text-muted-foreground line-through">
                          {formatPiastres(parseEgpToPiastres(priceEgp))}
                        </span>
                      </>
                    ) : (
                      <span className="text-lg font-extrabold text-foreground">
                        {formatPiastres(parseEgpToPiastres(priceEgp))}
                      </span>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>


        {/* Content drip toggle */}
        <div className="rounded-xl border border-border/70 bg-accent/20 p-4 md:p-5 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <Label className="text-base font-bold">التسلسل الإجباري (Content Drip)</Label>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              عند التفعيل: لن يستطيع الطالب فتح أي درس أو اختبار أو واجب قبل إتمام العنصر الذي يسبقه مباشرةً في المنهج.
            </p>
          </div>
          <Switch
            checked={!!dripEnabled}
            onCheckedChange={(v) =>
              setValue("content_drip_enabled", v, { shouldDirty: true })
            }
          />
        </div>

        {/* Featured toggle */}
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 md:p-5 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <Label className="text-base font-bold flex items-center gap-2">
              <span className="text-amber-500">★</span> إبراز في الصفحة الرئيسية
            </Label>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              عند التفعيل: تظهر الدورة في قسم "الدورات المميزة" على الصفحة الرئيسية (بحدّ أقصى 6 دورات، مرتبة بالأحدث تمييزًا).
            </p>
          </div>
          <Switch
            checked={!!isFeatured}
            onCheckedChange={(v) => setValue("is_featured", v, { shouldDirty: true })}
          />
        </div>


        <div className="space-y-2">
          <Label>الصورة المصغّرة</Label>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
            className="relative overflow-hidden rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition-colors cursor-pointer aspect-video bg-accent/40 flex items-center justify-center"
          >
            <AnimatePresence mode="wait">
              {displayPreview ? (
                <motion.div
                  key="p"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0"
                >
                  <img src={displayPreview} alt="preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setPreview(null);
                    }}
                    className="absolute top-2 left-2 bg-background/90 hover:bg-background text-foreground rounded-full p-1.5 shadow"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="e"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center gap-2 text-muted-foreground"
                >
                  <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium">اسحب صورة أو انقر للرفع</p>
                  <p className="text-xs">PNG / JPG / WEBP — حتى {MAX_MB}MB</p>
                </motion.div>
              )}
            </AnimatePresence>
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED.join(",")}
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/admin/courses")}
            disabled={submitting}
          >
            إلغاء
          </Button>
          <Button type="submit" disabled={submitting || stages.length === 0 || subjects.length === 0}>
            {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
            {isEdit ? "حفظ التغييرات" : "التالي: بناء المحتوى"}
          </Button>
        </div>
      </motion.form>
    </div>
  );
};

export default CourseInfoEditor;
