import { useCountUp } from "@/hooks/use-count-up";
import { BookOpen, Users, ClipboardCheck, GraduationCap } from "lucide-react";
import { IslamicDivider, EightPointStar } from "@/components/IslamicPatterns";

const stats = [
  { icon: Users, label: "طالب مسجل", value: 1250 },
  { icon: BookOpen, label: "درس متاح", value: 340 },
  { icon: ClipboardCheck, label: "اختبار مكتمل", value: 5600 },
  { icon: GraduationCap, label: "شهادة صادرة", value: 890 },
];

const StatItem = ({ label, value }: { label: string; value: number }) => {
  const { ref, count } = useCountUp(value);
  return (
    <div ref={ref} className="text-center">
      <div className="text-4xl md:text-5xl font-bold mb-2 tracking-tight">+{count.toLocaleString("ar-EG")}</div>
      <div className="text-sm opacity-80 font-medium">{label}</div>
    </div>
  );
};

const StatsSection = () => {
  return (
    <section id="stats" className="bg-primary text-primary-foreground py-16 px-6">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
        {stats.map((s) => (
          <StatItem key={s.label} label={s.label} value={s.value} />
        ))}
      </div>
    </section>
  );
};

export default StatsSection;
