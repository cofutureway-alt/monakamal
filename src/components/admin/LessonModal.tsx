import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  Trash2,
  FileText,
  FileImage,
  File as FileIcon,
  Youtube,
  Play,
  Film,
  Info,
  Paperclip,
  Lock,
  Infinity as InfinityIcon,
  Settings2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseVideoUrl, type VideoProvider } from "@/lib/video";

export interface LessonRecord {
  id: string;
  title: string;
  description: string | null;
  video_provider: VideoProvider | null;
  video_url: string | null;
  unit_id: string;
  position: number;
  unlock_quiz_id?: string | null;
}

interface FileRow {
  id: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  file_url: string;
  allow_download: boolean;
  download_limit: number | null;
}

const schema = z.object({
  title: z.string().trim().min(2, "العنوان قصير جدًا").max(160),
  description: z.string().trim().max(1000).optional(),
});
type FormValues = z.infer<typeof schema>;

const providers: {
  key: VideoProvider;
  label: string;
  icon: typeof Youtube;
  placeholder: string;
}[] = [
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "https://youtube.com/watch?v=..." },
  { key: "bunny", label: "Bunny", icon: Play, placeholder: "https://iframe.mediadelivery.net/embed/…/…" },
  { key: "vimeo", label: "Vimeo", icon: Film, placeholder: "https://vimeo.com/…" },
];

// Phase 10: restricted file types
const ALLOWED_UPLOAD_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
const ALLOWED_TYPES_LABEL = "PNG / JPG / WEBP / PDF / PPT / PPTX فقط";

const fileIcon = (type?: string | null) => {
  if (!type) return FileIcon;
  if (type.startsWith("image/")) return FileImage;
  if (type.includes("pdf")) return FileText;
  if (type.includes("presentation") || type.includes("powerpoint")) return FileText;
  return FileIcon;
};

const formatSize = (bytes?: number | null) => {
  if (!bytes) return "";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unitId: string;
  lesson: LessonRecord | null;
  nextPosition: number;
  onSaved: () => void;
}

const LessonModal = ({ open, onOpenChange, unitId, lesson, nextPosition, onSaved }: Props) => {
  const isEdit = !!lesson;
  const [tab, setTab] = useState<"details" | "files">("details");
  const [provider, setProvider] = useState<VideoProvider>("youtube");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoError, setVideoError] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedLessonId, setSavedLessonId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [unlockQuizId, setUnlockQuizId] = useState<string | null>(null);
  const [courseQuizzes, setCourseQuizzes] = useState<{ id: string; title: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", description: "" },
  });

  const activeLessonId = savedLessonId ?? lesson?.id ?? null;

  useEffect(() => {
    if (!open) return;
    setTab("details");
    setSavedLessonId(null);
    reset({
      title: lesson?.title ?? "",
      description: lesson?.description ?? "",
    });
    setProvider(lesson?.video_provider ?? "youtube");
    setVideoUrl(lesson?.video_url ?? "");
    setVideoError(null);
    setThumbnail(null);
    setFiles([]);
    setUnlockQuizId(lesson?.unlock_quiz_id ?? null);
    if (lesson?.video_url && lesson?.video_provider) {
      const parsed = parseVideoUrl(lesson.video_provider, lesson.video_url);
      if ("thumbnail" in parsed && parsed.thumbnail) setThumbnail(parsed.thumbnail);
    }

    // Load quizzes in this lesson's course for the gate picker
    (async () => {
      const { data: u } = await supabase
        .from("units")
        .select("course_id")
        .eq("id", unitId)
        .maybeSingle();
      const courseId = (u as any)?.course_id;
      if (!courseId) return;
      const { data: qs } = await (supabase as any)
        .from("quizzes")
        .select("id, title")
        .eq("course_id", courseId)
        .order("title");
      setCourseQuizzes(((qs ?? []) as any[]).map((r) => ({ id: r.id, title: r.title })));
    })();
  }, [open, lesson, reset, unitId]);

  // Load lesson files when we have a lesson id
  useEffect(() => {
    if (!activeLessonId || !open) return;
    supabase
      .from("lesson_files")
      .select("*")
      .eq("lesson_id", activeLessonId)
      .order("created_at")
      .then(({ data }) => setFiles((data as FileRow[]) ?? []));
  }, [activeLessonId, open]);

  const handleProviderChange = (p: VideoProvider) => {
    setProvider(p);
    setVideoUrl("");
    setVideoError(null);
    setThumbnail(null);
  };

  const handleUrlBlur = () => {
    if (!videoUrl.trim()) {
      setVideoError(null);
      setThumbnail(null);
      return;
    }
    const parsed = parseVideoUrl(provider, videoUrl);
    if ("error" in parsed) {
      setVideoError(parsed.error);
      setThumbnail(null);
    } else {
      setVideoError(null);
      setThumbnail(parsed.thumbnail ?? null);
    }
  };

  const onSubmit = async (values: FormValues) => {
    // Video link is required — every lesson must have exactly one video source
    if (!videoUrl.trim()) {
      setVideoError("رابط الفيديو مطلوب — كل درس يجب أن يحتوي على فيديو واحد");
      setTab("details");
      return;
    }
    const parsed = parseVideoUrl(provider, videoUrl);
    if ("error" in parsed) {
      setVideoError(parsed.error);
      setTab("details");
      return;
    }
    const finalUrl: string | null = parsed.url;
    const finalProvider: VideoProvider | null = parsed.provider;

    setSubmitting(true);
    try {
      if (isEdit || savedLessonId) {
        const idToUpdate = savedLessonId ?? lesson!.id;
        const { error } = await (supabase as any)
          .from("lessons")
          .update({
            title: values.title,
            description: values.description || null,
            video_provider: finalProvider,
            video_url: finalUrl,
            unlock_quiz_id: unlockQuizId,
          })
          .eq("id", idToUpdate);
        if (error) throw error;
        toast.success("تم حفظ الدرس");
        onSaved();
      } else {
        const { data, error } = await (supabase as any)
          .from("lessons")
          .insert({
            unit_id: unitId,
            title: values.title,
            description: values.description || null,
            video_provider: finalProvider,
            video_url: finalUrl,
            position: nextPosition,
            unlock_quiz_id: unlockQuizId,
          })
          .select("id")
          .single();
        if (error) throw error;
        setSavedLessonId(data!.id);
        toast.success("تم إنشاء الدرس — يمكنك رفع الملفات الآن");
        setTab("files");
        onSaved();
      }
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حفظ الدرس");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async (fs: FileList | null) => {
    if (!fs || !activeLessonId) return;
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const f of Array.from(fs)) {
      if (ALLOWED_UPLOAD_TYPES.includes(f.type)) {
        accepted.push(f);
      } else {
        rejected.push(f.name);
      }
    }
    if (rejected.length) {
      toast.error(
        `نوع الملف غير مسموح: ${rejected.join(", ")} — يُسمح فقط بـ ${ALLOWED_TYPES_LABEL}`,
      );
    }
    if (!accepted.length) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      for (const f of accepted) {
        const path = `${activeLessonId}/${crypto.randomUUID()}-${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("lesson-files")
          .upload(path, f, { contentType: f.type });
        if (upErr) throw upErr;
        const { data: row, error } = await (supabase as any)
          .from("lesson_files")
          .insert({
            lesson_id: activeLessonId,
            file_name: f.name,
            file_size: f.size,
            file_type: f.type || null,
            file_url: path,
          })
          .select("*")
          .single();
        if (error) throw error;
        setFiles((prev) => [...prev, row as FileRow]);
      }
      toast.success("تم رفع الملفات");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر رفع الملف");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const updateFilePerms = async (
    id: string,
    patch: { allow_download?: boolean; download_limit?: number | null },
  ) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    );
    try {
      const { error } = await (supabase as any)
        .from("lesson_files")
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحديث الإعدادات");
    }
  };

  const deleteFile = async (row: FileRow) => {
    try {
      await supabase.storage.from("lesson-files").remove([row.file_url]);
      await supabase.from("lesson_files").delete().eq("id", row.id);
      setFiles((prev) => prev.filter((f) => f.id !== row.id));
    } catch (e: any) {
      toast.error(e?.message || "تعذّر الحذف");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col" dir="rtl">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>{isEdit ? "تعديل الدرس" : "درس جديد"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="flex-1 min-h-0 flex flex-col">
          <div className="px-6 shrink-0">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="details" className="gap-2">
                <Info className="w-4 h-4" />
                تفاصيل الدرس
              </TabsTrigger>
              <TabsTrigger value="files" disabled={!activeLessonId} className="gap-2">
                <Paperclip className="w-4 h-4" />
                الملفات{files.length ? ` (${files.length})` : ""}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="details" className="mt-0 flex-1 min-h-0 overflow-y-auto">
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="ltitle">عنوان الدرس</Label>
                <Input id="ltitle" {...register("title")} placeholder="مثال: مقدمة في الجبر" />
                {errors.title && (
                  <p className="text-xs text-destructive">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="ldesc">الوصف</Label>
                <Textarea id="ldesc" rows={3} {...register("description")} />
              </div>

              <div className="space-y-2">
                <Label>مصدر الفيديو</Label>
                {provider === "r2" ? (
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                    تسجيل جلسة مباشرة
                  </div>
                ) : (
                <div className="grid grid-cols-3 gap-2 p-1 bg-muted rounded-lg">
                  {providers.map((p) => {
                    const Icon = p.icon;
                    const active = provider === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => handleProviderChange(p.key)}
                        className={`relative flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                          active
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="lesson-provider-active"
                            className="absolute inset-0 bg-background rounded-md shadow-sm"
                            transition={{ type: "spring", stiffness: 350, damping: 28 }}
                          />
                        )}
                        <Icon className="w-4 h-4 relative z-10" />
                        <span className="relative z-10">{p.label}</span>
                      </button>
                    );
                  })}
                </div>
                )}
                <AnimatePresence>
                  {provider === "youtube" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-200 p-3 text-xs">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>
                          ملاحظة للإدارة: بسبب قيود منصة يوتيوب لا يمكن التحكم الكامل في جودة الفيديو من داخل المشغّل. تعمل بقية الميزات (منع التقديم، السرعة، العلامة المائية) بشكل طبيعي.
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vurl">
                  {provider === "r2" ? "التسجيل" : "رابط الفيديو"}{" "}
                  {provider !== "r2" && <span className="text-destructive">*</span>}
                </Label>
                {provider === "r2" ? (
                  // The R2 object key belongs to the recording pipeline; editing
                  // it by hand would break the lesson.
                  <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
                    تسجيل جلسة مباشرة
                    <span className="block text-xs text-muted-foreground mt-0.5" dir="ltr">
                      {videoUrl}
                    </span>
                  </div>
                ) : (
                <Input
                  id="vurl"
                  dir="ltr"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onBlur={handleUrlBlur}
                  placeholder={providers.find((p) => p.key === provider)?.placeholder}
                />
                )}
                {videoError && (
                  <p className="text-xs text-destructive">{videoError}</p>
                )}
                <AnimatePresence>
                  {thumbnail && !videoError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 aspect-video rounded-lg overflow-hidden bg-muted">
                        <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Quiz gate picker — lock this lesson until a specific quiz is passed */}
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                <Label className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-500" />
                  قفل هذا الدرس حتى اجتياز اختبار (اختياري)
                </Label>
                <Select
                  value={unlockQuizId ?? "__none__"}
                  onValueChange={(v) => setUnlockQuizId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="بدون قفل — الدرس متاح دائمًا" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">بدون قفل</SelectItem>
                    {courseQuizzes
                      .filter((q) => q.id !== lesson?.id)
                      .map((q) => (
                        <SelectItem key={q.id} value={q.id}>
                          {q.title}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  عند الاختيار: لن يفتح هذا الدرس للطالب إلا بعد اجتياز الاختبار المحدد.
                </p>
              </div>


              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  إلغاء
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                  {isEdit || savedLessonId ? "حفظ الدرس" : "حفظ ومتابعة إلى الملفات"}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="files" className="mt-0 flex-1 min-h-0 overflow-y-auto">
            <div className="p-6 space-y-4">
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleUpload(e.dataTransfer.files);
                }}
                className="rounded-xl border-2 border-dashed border-border hover:border-primary/60 transition-colors cursor-pointer p-8 text-center bg-accent/30"
              >
                {uploading ? (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جارٍ الرفع...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium">اسحب الملفات أو انقر للرفع</p>
                    <p className="text-xs">{ALLOWED_TYPES_LABEL}</p>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept={ALLOWED_UPLOAD_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => handleUpload(e.target.files)}
                />
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto">
                <AnimatePresence>
                  {files.map((f) => {
                    const Icon = fileIcon(f.file_type);
                    return (
                      <motion.div
                        key={f.id}
                        layout
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="flex flex-col gap-2 p-3 rounded-lg border border-border/60 bg-card"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{f.file_name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{formatSize(f.file_size)}</span>
                              <span className="opacity-40">·</span>
                              <PermBadge file={f} />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteFile(f)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="pt-2 border-t border-border/40 grid gap-3">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
                              السماح بالتحميل
                            </Label>
                            <Switch
                              checked={f.allow_download}
                              onCheckedChange={(v) =>
                                updateFilePerms(f.id, { allow_download: v })
                              }
                            />
                          </div>
                          {f.allow_download && (
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="flex items-center gap-2">
                                <Label className="text-xs font-semibold">
                                  الحد الأقصى للتحميل لكل طالب
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 text-xs">
                                  <InfinityIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span>غير محدود</span>
                                  <Switch
                                    checked={f.download_limit === null}
                                    onCheckedChange={(unlimited) =>
                                      updateFilePerms(f.id, {
                                        download_limit: unlimited ? null : 3,
                                      })
                                    }
                                  />
                                </div>
                                {f.download_limit !== null && (
                                  <Input
                                    type="number"
                                    min={1}
                                    value={f.download_limit ?? ""}
                                    onChange={(e) => {
                                      const n = Number(e.target.value);
                                      updateFilePerms(f.id, {
                                        download_limit: Number.isFinite(n) && n > 0 ? Math.floor(n) : 1,
                                      });
                                    }}
                                    className="w-20 h-8"
                                  />
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {files.length === 0 && !uploading && (
                  <p className="text-center text-xs text-muted-foreground py-4">
                    لا توجد ملفات مرفقة بعد.
                  </p>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-border/60">
                <Button onClick={() => onOpenChange(false)}>تم</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default LessonModal;

const PermBadge = ({ file }: { file: FileRow }) => {
  if (!file.allow_download) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-destructive">
        <Lock className="w-3 h-3" />
        التحميل غير مسموح
      </span>
    );
  }
  if (file.download_limit === null) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
        <InfinityIcon className="w-3 h-3" />
        غير محدود
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
      <Settings2 className="w-3 h-3" />
      محدود ({file.download_limit})
    </span>
  );
};
