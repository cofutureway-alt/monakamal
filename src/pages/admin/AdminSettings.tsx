import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Settings2,
  PlaySquare,
  ChevronLeft,
  FormInput,
  QrCode,
  Palette,
  Home,
  MessageSquare,
  FileText,
  ShieldCheck,
} from "lucide-react";

const CARDS = [
  { to: "/admin/settings/mcp", icon: ShieldCheck, title: "إعدادات MCP", desc: "إنشاء مفاتيح وربط أدوات الذكاء الاصطناعي مع صلاحيات دقيقة وسجل عمليات." },
  {
    to: "/admin/settings/video-player",
    icon: PlaySquare,
    title: "إعدادات مشغّل الفيديو",
    desc: "التحكم بالتقديم والسرعة، وشرط نسبة المشاهدة، والعلامة المائية.",
  },
  {
    to: "/admin/settings/registration-form",
    icon: FormInput,
    title: "إعدادات نموذج التسجيل",
    desc: "أضف، احذف، وأعد ترتيب الحقول التي يراها الطالب عند إنشاء حساب.",
  },
  {
    to: "/admin/settings/student-qr",
    icon: QrCode,
    title: "إعدادات QR الطلاب",
    desc: "اختر البيانات التي تظهر عند مسح كود الطالب من الصفحة العامة.",
  },
  {
    to: "/admin/settings/branding",
    icon: Palette,
    title: "الهوية البصرية والتواصل",
    desc: "شعار المنصة (فاتح/داكن) وروابط التواصل الاجتماعي في التذييل.",
  },
  {
    to: "/admin/settings/homepage",
    icon: Home,
    title: "إعدادات الصفحة الرئيسية",
    desc: "صورة وعنوان ونص وزر الدعوة في قسم الترحيب (Hero) للزوار.",
  },
  {
    to: "/admin/settings/whatsapp",
    icon: MessageSquare,
    title: "إعدادات واتساب (Rasvio)",
    desc: "إدارة أرقام واتساب المربوطة، تفعيل إشعارات الطلاب والأبناء والإدارة، وتخصيص نماذج الرسائل.",
  },
  {
    to: "/admin/whatsapp-log",
    icon: FileText,
    title: "سجل رسائل واتساب",
    desc: "متابعة طابور الرسائل الصادرة، معاينة النصوص، وإلغاء الإرسال لأرقام محددة.",
  },
];

const AdminSettings = () => {
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">الإعدادات</h1>
        <p className="text-muted-foreground mt-2">
          إعدادات المنصة، الهوية البصرية، ومشغّل الفيديو.
        </p>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.to}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={card.to}
                className="group block h-full rounded-2xl border border-border/60 bg-card p-6 hover:border-primary/50 hover:shadow-lg transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-lg mb-1">{card.title}</div>
                    <p className="text-sm text-muted-foreground">{card.desc}</p>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminSettings;
