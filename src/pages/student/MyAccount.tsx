import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Camera, Loader2, Save, UserCircle2, IdCard, Eye, EyeOff, Trophy, FileText, Globe } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useRegistrationFields } from "@/hooks/use-registration-fields";
import DynamicRegistrationField from "@/components/auth/DynamicRegistrationField";
import {
  KNOWN_PROFILE_COLUMNS,
  PASSWORD_KEYS,
} from "@/lib/registration-fields";
import { SocialLinksEditor, type SocialLinkItem } from "@/components/SocialLinksEditor";
import ZoomConnectCard from "@/components/zoom/ZoomConnectCard";

// Fields that should stay read-only on the profile page (identity/security anchors)
const READ_ONLY_KEYS = new Set(["phone_number", "email"]);

const MyAccount = () => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = profile?.role === "admin";
  const { fields, loading: loadingFields } = useRegistrationFields();
  const [values, setValues] = useState<Record<string, any>>({});
  const [bio, setBio] = useState<string>("");
  const [socialLinks, setSocialLinks] = useState<SocialLinkItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [leaderboardVisible, setLeaderboardVisible] = useState<boolean>(true);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const editableFields = useMemo(
    () => fields.filter((f) => !PASSWORD_KEYS.has(f.field_key)),
    [fields],
  );

  useEffect(() => {
    if (!profile) return;
    const custom = (profile as any).custom_fields ?? {};
    const p = profile as any;
    const seed: Record<string, any> = {
      full_name: p.full_name ?? "",
      phone_number: p.phone_number ?? "",
      email: p.email ?? "",
      governorate: p.governorate ?? "",
      registration_type: p.registration_type ?? "",
      gender: p.gender ?? "",
      guardian_phone: p.guardian_phone ?? "",
      stage_id: p.stage_id ?? "",
      ...custom,
    };
    setValues(seed);
    setBio(p.bio ?? "");
    setSocialLinks(Array.isArray(p.social_links) ? p.social_links : []);
    setAvatarUrl(p.avatar_url ?? null);
    setLeaderboardVisible(p.leaderboard_visible !== false);
  }, [profile]);

  const handleToggleVisibility = async (next: boolean) => {
    if (!user) return;
    setSavingVisibility(true);
    setLeaderboardVisible(next);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ leaderboard_visible: next })
      .eq("id", user.id);
    setSavingVisibility(false);
    if (error) {
      setLeaderboardVisible(!next);
      toast.error("تعذّر تحديث الإعداد");
      return;
    }
    await refreshProfile();
    toast.success(next ? "أصبح ملفك ظاهرًا على المتصدرين العامة" : "تم إخفاء ملفك من المتصدرين العامة");
  };

  const setValue = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }));

  const handleAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 3 * 1024 * 1024) {
      toast.error("الحجم الأقصى للصورة 3 ميجابايت");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setUploading(false);
      toast.error("تعذّر رفع الصورة");
      return;
    }
    // Bucket is private → create a long-lived signed URL (10 years)
    const { data: signed, error: signErr } = await supabase.storage
      .from("avatars")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
    if (signErr || !signed?.signedUrl) {
      setUploading(false);
      toast.error("تعذّر إنشاء رابط الصورة");
      return;
    }
    const url = signed.signedUrl;
    await (supabase as any).from("profiles").update({ avatar_url: url }).eq("id", user.id);
    setAvatarUrl(url);
    await refreshProfile();
    setUploading(false);
    toast.success("تم تحديث الصورة");
  };

  const handleSave = async () => {
    if (!user) return;
    const knownUpdate: Record<string, any> = {};
    const customUpdate: Record<string, any> = {};

    for (const f of editableFields) {
      if (READ_ONLY_KEYS.has(f.field_key)) continue;
      const v = values[f.field_key];
      if (KNOWN_PROFILE_COLUMNS.has(f.field_key)) {
        knownUpdate[f.field_key] = v === "" ? null : v;
      } else {
        customUpdate[f.field_key] = v === "" ? null : v;
      }
    }

    setSaving(true);
    const payload: Record<string, any> = {
      ...knownUpdate,
      custom_fields: customUpdate,
      bio: bio.trim() || null,
      social_links: socialLinks,
    };
    const { error } = await (supabase as any)
      .from("profiles")
      .update(payload)
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("تعذّر الحفظ");
      return;
    }
    await refreshProfile();
    toast.success("تم حفظ بيانات الحساب");
  };

  const initials =
    profile?.full_name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() ||
    user?.email?.[0]?.toUpperCase() ||
    "ط";

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
            <UserCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-black">حسابي</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              أدر بياناتك الشخصية، النبذة التعريفية، وروابط التواصل الخاصة بك.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Zoom OAuth result (?zoom=connected|error) — toast once, then strip the params. */}
      {isAdmin && searchParams.get("zoom") && (
        <ZoomResultToast
          result={searchParams.get("zoom")!}
          reason={searchParams.get("reason")}
          onDone={() => {
            const next = new URLSearchParams(searchParams);
            next.delete("zoom");
            next.delete("reason");
            setSearchParams(next, { replace: true });
          }}
        />
      )}

      {isAdmin && <ZoomConnectCard />}

      {/* Avatar Header */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-3xl border border-border/60 bg-card p-6 flex flex-col md:flex-row items-center gap-6"
      >
        <div className="relative">
          <Avatar className="w-24 h-24 border-2 border-primary/40">
            <AvatarImage src={avatarUrl ?? undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -left-1 w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-60"
            aria-label="تغيير الصورة"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAvatar(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex-1 text-center md:text-right space-y-1">
          <div className="text-xl font-black">{profile?.full_name || "مستخدم"}</div>
          <div className="text-sm text-muted-foreground" dir="ltr">
            {(profile as any)?.email || user?.email}
          </div>
          {(profile as any)?.student_id && (
            <Badge variant="secondary" className="gap-1.5 mt-2">
              <IdCard className="w-3.5 h-3.5" />
              رقم الطالب: <span className="font-mono">{(profile as any).student_id}</span>
            </Badge>
          )}
        </div>
      </motion.section>

      {/* Bio and Social Links */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-3xl border border-border/60 bg-card p-6 space-y-5"
      >
        <div className="flex items-center gap-2 font-black text-lg">
          <FileText className="w-5 h-5 text-primary" />
          <span>النبذة التعريفية والتواصل</span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio-input" className="text-sm font-semibold">
            النبذة التعريفية (Bio)
          </Label>
          <Textarea
            id="bio-input"
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="اكتب نبذة مختصرة عن مؤهلاتك أو مجال دراستك أو خبراتك…"
            className="resize-none"
            dir="rtl"
          />
          <p className="text-xs text-muted-foreground">
            تظهر هذه النبذة على صفحتك الشخصية العامة وتظهر للطلاب عند نشر الدورات.
          </p>
        </div>

        <div className="pt-2">
          <SocialLinksEditor
            links={socialLinks}
            onChange={setSocialLinks}
            title="روابط التواصل الشخصية"
            description="حساباتك الشخصية على وسائل التواصل الاجتماعي."
          />
        </div>
      </motion.section>

      {/* Personal Fields */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl border border-border/60 bg-card p-6 space-y-5"
      >
        <h2 className="font-black text-lg">البيانات الشخصية</h2>

        {loadingFields || !profile ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {editableFields.map((f) => (
              <DynamicRegistrationField
                key={f.id}
                field={f}
                value={values[f.field_key]}
                onChange={(v) => setValue(f.field_key, v)}
                readOnly={READ_ONLY_KEYS.has(f.field_key)}
              />
            ))}

            <div className="pt-2 flex justify-end">
              <Button onClick={handleSave} disabled={saving} className="gap-2 min-w-32">
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جارٍ الحفظ...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    حفظ التغييرات
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </motion.section>

      {/* Leaderboard visibility */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-3xl border border-amber-500/30 bg-amber-500/5 p-6"
      >
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-black text-lg">الظهور في لوحة المتصدرين</h2>
              <Switch
                checked={leaderboardVisible}
                onCheckedChange={handleToggleVisibility}
                disabled={savingVisibility}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              {leaderboardVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {leaderboardVisible
                ? "اسمك وصورتك يظهران على صفحة المتصدرين العامة عند وجودك ضمن الأوائل."
                : "أنت مخفي من صفحة المتصدرين العامة (لا تزال تظهر في لوحة الإدارة)."}
            </p>
          </div>
        </div>
      </motion.section>
    </div>
  );
};

/** Fires the OAuth return toast exactly once per mount. */
const ZoomResultToast = ({
  result,
  reason,
  onDone,
}: {
  result: string;
  reason: string | null;
  onDone: () => void;
}) => {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (result === "connected") toast.success("تم ربط حساب Zoom بنجاح");
    else toast.error(`تعذّر ربط حساب Zoom. حاول مرة أخرى.${reason ? ` (${reason})` : ""}`);
    onDone();
  }, [result, reason, onDone]);
  return null;
};

export default MyAccount;
