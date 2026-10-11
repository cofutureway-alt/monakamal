import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  MousePointerClick,
  Save,
  Type,
  AlignRight,
  Link2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_PLATFORM_SETTINGS,
  invalidatePlatformSettingsCache,
  notifyPlatformSettingsListeners,
  usePlatformSettings,
  type PlatformSettings,
} from "@/hooks/use-platform-settings";

const FALLBACK_HERO_IMAGE = "/images/hero-image.jpg";

// ─── Helpers ────────────────────────────────────────────────────

async function uploadHeroImage(file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `hero/hero-image.${ext}`;
  const { error } = await supabase.storage
    .from("thumbnails")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

// ─── Section Header ─────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center gap-3 pb-4 border-b border-border">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <div className="font-bold">{title}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  );
}

// ─── Mini Hero Preview ──────────────────────────────────────────

function MiniHeroPreview({
  headline,
  subtext,
  ctaLabel,
  imageUrl,
}: {
  headline: string;
  subtext: string;
  ctaLabel: string;
  imageUrl: string | null;
}) {
  const lines = headline.split("\n");
  const mainLine = lines[0] ?? "";
  const accentLine = lines[1] ?? "";

  return (
    <div
      className="rounded-2xl border border-border overflow-hidden bg-background scale-100 origin-top-right"
      dir="rtl"
    >
      {/* Mini navbar */}
      <div className="h-6 bg-secondary/60 border-b border-border flex items-center px-3 gap-1.5">
        <div className="w-8 h-2 rounded-full bg-primary/30" />
        <div className="flex-1" />
        {[1, 2, 3].map((k) => (
          <div key={k} className="w-5 h-1.5 rounded-full bg-muted-foreground/20" />
        ))}
      </div>

      {/* Hero area */}
      <div className="px-4 py-5 grid grid-cols-2 gap-3 items-center min-h-[100px]">
        {/* Text */}
        <div className="space-y-2">
          <div className="w-16 h-2 rounded-full bg-primary/20" />
          <div className="space-y-1">
            <div className="text-[10px] font-extrabold leading-tight text-foreground line-clamp-1">
              {mainLine}
            </div>
            {accentLine && (
              <div className="text-[10px] font-extrabold leading-tight text-primary line-clamp-1">
                {accentLine}
              </div>
            )}
          </div>
          <div className="text-[8px] text-muted-foreground line-clamp-2 leading-snug">
            {subtext}
          </div>
          <div className="flex gap-1 mt-1">
            <div className="h-4 px-2 rounded-md bg-primary flex items-center">
              <span className="text-[7px] text-primary-foreground font-bold">
                {ctaLabel}
              </span>
            </div>
            <div className="h-4 px-2 rounded-md border border-border flex items-center">
              <span className="text-[7px] font-bold">إنشاء حساب</span>
            </div>
          </div>
        </div>

        {/* Image */}
        <div className="flex justify-center">
          <div className="w-20 h-20 rounded-xl overflow-hidden border border-border bg-secondary">
            <img
              src={imageUrl ?? FALLBACK_HERO_IMAGE}
              alt="preview"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

const AdminHomepageSettings = () => {
  const { settings: loaded, loading } = usePlatformSettings();

  const [form, setForm] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [uploadingImage, setUploadingImage] = useState(false);
  const debouncerRef = useRef<number | null>(null);
  const firstLoad = useRef(true);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && firstLoad.current) {
      setForm(loaded);
      firstLoad.current = false;
    }
  }, [loading, loaded]);

  const scheduleSave = useCallback(async (next: PlatformSettings) => {
    if (debouncerRef.current) window.clearTimeout(debouncerRef.current);
    setStatus("saving");
    debouncerRef.current = window.setTimeout(async () => {
      try {
        const { error } = await (supabase as any)
          .from("platform_settings")
          .update({
            hero_image_url: next.hero_image_url || null,
            hero_headline: next.hero_headline || null,
            hero_subtext: next.hero_subtext || null,
            hero_cta_label: next.hero_cta_label || null,
            hero_cta_url: next.hero_cta_url || null,
          })
          .eq("id", 1);
        if (error) throw error;
        invalidatePlatformSettingsCache();
        notifyPlatformSettingsListeners(next);
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } catch (e: any) {
        toast.error(e?.message || "فشل الحفظ");
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    }, 700);
  }, []);

  const update = useCallback(
    (patch: Partial<PlatformSettings>) => {
      setForm((prev) => {
        const next = { ...prev, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5 ميجا");
      return;
    }
    const localUrl = URL.createObjectURL(f);
    setForm((prev) => ({ ...prev, hero_image_url: localUrl }));
    setUploadingImage(true);
    try {
      const url = await uploadHeroImage(f);
      update({ hero_image_url: url });
      toast.success("تم رفع صورة الهيرو بنجاح");
    } catch (err: any) {
      toast.error(err?.message || "فشل رفع الصورة");
      setForm((prev) => ({ ...prev, hero_image_url: loaded.hero_image_url }));
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8" dir="rtl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div className="flex items-center gap-3">
          <Link
            to="/admin/settings"
            className="p-2 rounded-xl hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              إعدادات الصفحة الرئيسية
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              تحكّم في محتوى القسم الترحيبي (Hero) للزوار
            </p>
          </div>
        </div>

        {/* Save status */}
        <AnimatePresence mode="wait">
          {status !== "idle" && (
            <motion.div
              key={status}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
                status === "saving"
                  ? "bg-secondary text-muted-foreground"
                  : status === "saved"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {status === "saving" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : status === "saved" ? (
                <Check className="w-4 h-4" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {status === "saving"
                ? "جارٍ الحفظ…"
                : status === "saved"
                ? "تم الحفظ"
                : "حدث خطأ"}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
        {/* Left col: settings */}
        <div className="lg:col-span-3 space-y-6">
          {/* ── Hero Image ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl border border-border bg-card p-6 space-y-5"
          >
            <SectionHeader
              icon={ImageIcon}
              title="صورة الهيرو"
              description="الصورة الكبيرة التي تظهر في قسم الترحيب. مقاس مربع مُفضَّل."
            />

            <div className="relative rounded-2xl border border-border overflow-hidden bg-secondary/30 flex items-center justify-center h-48">
              <AnimatePresence mode="wait">
                {form.hero_image_url ? (
                  <motion.img
                    key={form.hero_image_url}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    src={form.hero_image_url}
                    alt="hero preview"
                    className="h-full w-auto object-contain"
                  />
                ) : (
                  <motion.img
                    key="default"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    src={FALLBACK_HERO_IMAGE}
                    alt="hero default"
                    className="h-full w-auto object-contain opacity-50"
                  />
                )}
              </AnimatePresence>

              {uploadingImage && (
                <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                </div>
              )}

              {!form.hero_image_url && (
                <div className="absolute bottom-2 right-2 text-[10px] bg-background/80 text-muted-foreground rounded px-2 py-0.5 border border-border">
                  الصورة الافتراضية
                </div>
              )}
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageFile}
            />

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
              >
                <ImageIcon className="w-4 h-4" />
                رفع صورة
              </Button>
              {form.hero_image_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-destructive hover:text-destructive"
                  onClick={() => update({ hero_image_url: null })}
                >
                  <Trash2 className="w-4 h-4" />
                  استعادة الافتراضية
                </Button>
              )}
            </div>
          </motion.div>

          {/* ── Text Content ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-border bg-card p-6 space-y-5"
          >
            <SectionHeader
              icon={Type}
              title="نصوص القسم الترحيبي"
              description="العنوان الرئيسي والنص الداعم الذي يرى الزائر أولًا"
            />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="headline" className="text-sm font-semibold">
                  العنوان الرئيسي
                </Label>
                <Textarea
                  id="headline"
                  value={form.hero_headline ?? ""}
                  onChange={(e) => update({ hero_headline: e.target.value })}
                  rows={3}
                  placeholder="رحلتك في العلم&#10;تبدأ من هنا"
                  className="resize-none text-right font-bold text-lg leading-relaxed"
                  dir="rtl"
                />
                <p className="text-xs text-muted-foreground">
                  السطر الثاني يظهر بلون المنصة (Primary). استخدم Enter للفصل بين السطرين.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtext" className="text-sm font-semibold">
                  النص الداعم
                </Label>
                <Textarea
                  id="subtext"
                  value={form.hero_subtext ?? ""}
                  onChange={(e) => update({ hero_subtext: e.target.value })}
                  rows={3}
                  placeholder="وصف مختصر عن المنصة…"
                  className="resize-none text-right"
                  dir="rtl"
                />
              </div>
            </div>
          </motion.div>

          {/* ── CTA Button ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-border bg-card p-6 space-y-5"
          >
            <SectionHeader
              icon={MousePointerClick}
              title="زر الدعوة للتصرف (CTA)"
              description="الزر الرئيسي في قسم الترحيب"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cta_label" className="text-sm font-semibold">
                  نص الزر
                </Label>
                <Input
                  id="cta_label"
                  value={form.hero_cta_label ?? ""}
                  onChange={(e) => update({ hero_cta_label: e.target.value })}
                  placeholder="تصفح الكورسات"
                  dir="rtl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cta_url" className="text-sm font-semibold">
                  رابط الزر
                </Label>
                <Input
                  id="cta_url"
                  value={form.hero_cta_url ?? ""}
                  onChange={(e) => update({ hero_cta_url: e.target.value })}
                  placeholder="/courses"
                  dir="ltr"
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right col: live preview */}
        <div className="lg:col-span-2 space-y-4">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="sticky top-24 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <LayoutTemplate className="w-4 h-4" />
                معاينة مصغّرة
              </div>
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                الصفحة الحقيقية
              </a>
            </div>

            <div className="rounded-2xl border-2 border-dashed border-border p-2">
              <MiniHeroPreview
                headline={form.hero_headline ?? DEFAULT_PLATFORM_SETTINGS.hero_headline ?? ""}
                subtext={form.hero_subtext ?? DEFAULT_PLATFORM_SETTINGS.hero_subtext ?? ""}
                ctaLabel={form.hero_cta_label ?? DEFAULT_PLATFORM_SETTINGS.hero_cta_label ?? ""}
                imageUrl={form.hero_image_url}
              />
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              المعاينة تعكس التغييرات في الوقت الفعلي.
              <br />
              الحفظ يتم تلقائيًا بعد التوقف عن الكتابة.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default AdminHomepageSettings;
