import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ArrowLeft, GraduationCap, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";
import DynamicRegistrationField from "@/components/auth/DynamicRegistrationField";
import { useRegistrationFields } from "@/hooks/use-registration-fields";
import {
  isValidEgPhone,
  normalizeEgPhone,
  syntheticAuthEmail,
} from "@/lib/phone";
import { getArabicAuthErrorMessage } from "@/lib/auth-errors";
import { KNOWN_PROFILE_COLUMNS, PASSWORD_KEYS } from "@/lib/registration-fields";

type Role = "student" | "parent";

const Signup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = new URLSearchParams(location.search).get("redirect") ?? "/dashboard";
  const initialRole: Role = location.pathname.includes("parent") ? "parent" : "student";
  const [role, setRole] = useState<Role>(initialRole);

  return (
    <AuthLayout
      title="إنشاء حساب جديد"
      subtitle={
        role === "student"
          ? "ابدأ رحلتك في تعلّم العلوم الشرعية"
          : "تابع تقدّم أبنائك واشترِ لهم الدورات"
      }
      footer={
        <>
          لديك حساب بالفعل؟{" "}
          <Link to="/login" className="text-primary font-bold hover:underline">
            سجّل الدخول
          </Link>
        </>
      }
    >
      {/* Role Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-secondary border border-border mb-6">
        <RoleTab
          active={role === "student"}
          onClick={() => setRole("student")}
          icon={<GraduationCap className="w-4 h-4" />}
          label="حساب طالب"
        />
        <RoleTab
          active={role === "parent"}
          onClick={() => setRole("parent")}
          icon={<Users className="w-4 h-4" />}
          label="حساب ولي أمر"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={role}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {role === "student" ? (
            <StudentForm redirectTo={redirectTo} navigate={navigate} />
          ) : (
            <ParentForm navigate={navigate} />
          )}
        </motion.div>
      </AnimatePresence>
    </AuthLayout>
  );
};

const RoleTab = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 z-10 ${
      active
        ? "text-primary-foreground shadow-sm"
        : "text-muted-foreground hover:text-foreground"
    }`}
  >
    {active && (
      <motion.span
        layoutId="role-tab-active"
        className="absolute inset-0 rounded-xl bg-primary z-0 shadow-sm"
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      />
    )}
    <span className="relative z-10 flex items-center gap-2">
      {icon}
      {label}
    </span>
  </button>
);

// ---------------- Student form ----------------
const StudentForm = ({
  redirectTo,
  navigate,
}: {
  redirectTo: string;
  navigate: ReturnType<typeof useNavigate>;
}) => {
  const { fields, loading: loadingFields } = useRegistrationFields();
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState<Record<string, boolean>>({});
  const setValue = (k: string, v: any) => setValues((p) => ({ ...p, [k]: v }));

  const submitFields = useMemo(
    () => fields.filter((f) => f.field_key !== "confirm_password"),
    [fields],
  );

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    for (const f of fields) {
      const raw = values[f.field_key];
      const val = typeof raw === "string" ? raw.trim() : raw;
      if (f.is_required) {
        if (val === undefined || val === null || val === "" || (f.field_type === "checkbox" && !val)) {
          e[f.field_key] = "هذا الحقل مطلوب";
          continue;
        }
      }
      if (!val && !f.is_required) continue;
      if (f.field_type === "phone" && !isValidEgPhone(String(val))) {
        e[f.field_key] = "أدخل رقم هاتف مصري صحيح (مثال: 01012345678)";
      }
      if (f.field_key === "email" && val && !/^\S+@\S+\.\S+$/.test(String(val))) {
        e[f.field_key] = "البريد الإلكتروني غير صالح";
      }
      if (f.field_key === "password" && val && String(val).length < 6) {
        e[f.field_key] = "كلمة المرور يجب ألا تقل عن 6 أحرف";
      }
    }
    if (values.password || values.confirm_password) {
      if ((values.password || "") !== (values.confirm_password || "")) {
        e.confirm_password = "كلمة المرور غير مطابقة";
      }
    }
    if (values.phone_number && values.guardian_phone) {
      if (
        normalizeEgPhone(String(values.phone_number)) ===
        normalizeEgPhone(String(values.guardian_phone))
      ) {
        e.guardian_phone = "رقم ولي الأمر يجب أن يختلف عن رقم الطالب";
      }
    }
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const eMap = validate();
    setErrors(eMap);
    if (Object.keys(eMap).length > 0) return;

    const canonicalPhone = normalizeEgPhone(String(values.phone_number || ""));
    const canonicalGuardian = values.guardian_phone
      ? normalizeEgPhone(String(values.guardian_phone))
      : null;
    const realEmail = (values.email || "").toString().trim().toLowerCase() || "";
    const authEmail = syntheticAuthEmail(canonicalPhone);
    const password = String(values.password || "");

    const knownData: Record<string, any> = {};
    const customData: Record<string, any> = {};
    for (const f of submitFields) {
      if (PASSWORD_KEYS.has(f.field_key)) continue;
      const v = values[f.field_key];
      if (v === undefined || v === null || v === "") continue;
      if (KNOWN_PROFILE_COLUMNS.has(f.field_key)) knownData[f.field_key] = v;
      else customData[f.field_key] = v;
    }
    knownData.full_name = knownData.full_name || "";
    knownData.phone_number = canonicalPhone;
    if (canonicalGuardian) knownData.guardian_phone = canonicalGuardian;
    if (realEmail) knownData.email = realEmail;

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { ...knownData, real_email: realEmail || null, custom_fields: customData },
      },
    });

    if (error) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (!signInErr) {
        setLoading(false);
        toast.success("تم تسجيل الدخول بنجاح، أهلاً بك في منصة الأستاذة منى كامل");
        navigate(redirectTo, { replace: true });
        return;
      }
      setLoading(false);
      toast.error(getArabicAuthErrorMessage(error));
      return;
    }

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
    setLoading(false);

    if (signInErr) {
      toast.success("تم إنشاء حسابك، يرجى تسجيل الدخول");
      navigate("/login", { replace: true });
      return;
    }
    toast.success("تم إنشاء حسابك بنجاح، أهلاً بك في منصة الأستاذة منى كامل");
    navigate(redirectTo, { replace: true });
  };

  if (loadingFields) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <AnimatePresence initial={false}>
        {fields.map((f) => (
          <motion.div
            key={f.id}
            layout
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <DynamicRegistrationField
              field={f}
              value={values[f.field_key]}
              onChange={(v) => setValue(f.field_key, v)}
              error={errors[f.field_key]}
              disabled={loading}
              showPassword={!!showPw[f.field_key]}
              onTogglePassword={
                PASSWORD_KEYS.has(f.field_key)
                  ? () => setShowPw((p) => ({ ...p, [f.field_key]: !p[f.field_key] }))
                  : undefined
              }
            />
          </motion.div>
        ))}
      </AnimatePresence>

      <Button type="submit" className="w-full gap-2 font-bold" size="lg" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            جارٍ إنشاء الحساب...
          </>
        ) : (
          <>
            إنشاء حساب طالب
            <ArrowLeft className="w-4 h-4" />
          </>
        )}
      </Button>
    </form>
  );
};

// ---------------- Parent form ----------------
const ParentForm = ({ navigate }: { navigate: ReturnType<typeof useNavigate> }) => {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("أدخل الاسم بالكامل");
    if (!isValidEgPhone(phone)) return toast.error("رقم هاتف غير صالح");
    if (password.length < 6) return toast.error("كلمة المرور يجب ألا تقل عن 6 أحرف");
    const canonical = normalizeEgPhone(phone);
    const realEmail = email.trim().toLowerCase();
    const authEmail = syntheticAuthEmail(canonical);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          intended_role: "parent",
          full_name: fullName.trim(),
          phone_number: canonical,
          real_email: realEmail || null,
        },
      },
    });
    if (error) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: authEmail, password });
      if (!signInErr) {
        setLoading(false);
        toast.success("تم تسجيل الدخول بنجاح");
        navigate("/parent", { replace: true });
        return;
      }
      setLoading(false);
      toast.error(getArabicAuthErrorMessage(error));
      return;
    }
    await supabase.auth.signInWithPassword({ email: authEmail, password });
    setLoading(false);
    toast.success("تم إنشاء حساب ولي الأمر");
    navigate("/parent", { replace: true });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-bold">الاسم بالكامل</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={loading} />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-bold">رقم الهاتف</Label>
        <Input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          dir="ltr"
          placeholder="01012345678"
          disabled={loading}
        />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-bold">البريد الإلكتروني (اختياري)</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" disabled={loading} />
      </div>
      <div className="space-y-2">
        <Label className="text-sm font-bold">كلمة المرور</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
      </div>
      <Button type="submit" size="lg" className="w-full gap-2 font-bold" disabled={loading}>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            إنشاء حساب ولي أمر
            <ArrowLeft className="w-4 h-4" />
          </>
        )}
      </Button>
    </form>
  );
};

export default Signup;
