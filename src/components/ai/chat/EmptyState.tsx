import { Sparkles } from "lucide-react";

const SUGGESTIONS = [
  "أنشئ اختباراً من 10 أسئلة لدرس…",
  "تقرير المبيعات لهذا الشهر",
  "اعرض الواجبات غير المصححة",
  "أنشئ 20 كود شراء لدورة…",
  "سجّل طالباً جديداً",
  "ما الجلسات المباشرة هذا الأسبوع؟",
];

/** First screen of a new conversation. Suggestions fill the composer (they do not send). */
const EmptyState = ({ onPick }: { onPick: (text: string) => void }) => (
  <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-12 text-center">
    <div className="rounded-2xl bg-primary/10 p-4 text-primary">
      <Sparkles className="h-7 w-7" />
    </div>
    <h2 className="mt-4 text-xl font-bold md:text-2xl">كيف أساعدك في إدارة المنصة اليوم؟</h2>
    <p className="mt-2 max-w-md text-sm text-muted-foreground">
      اطلب تقريراً أو جهّز محتوى أو أدِر الطلاب بالمحادثة. لن يتغير أي شيء قبل أن تؤكده بنفسك.
    </p>
    <div className="mt-8 grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="rounded-xl border border-border/70 bg-card p-3 text-start text-sm transition-colors hover:bg-secondary"
        >
          {s}
        </button>
      ))}
    </div>
  </div>
);

export default EmptyState;
