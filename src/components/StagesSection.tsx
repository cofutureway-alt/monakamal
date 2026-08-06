import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { GraduationCap, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { EightPointStar, IslamicDivider } from "@/components/IslamicPatterns";
import { Skeleton } from "@/components/ui/skeleton";

interface Stage {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
}

const StagesSection = () => {
  const navigate = useNavigate();
  const { ref, isVisible } = useScrollAnimation();
  const [stages, setStages] = useState<Stage[] | null>(null);

  useEffect(() => {
    (supabase as any)
      .from("stages")
      .select("id, name, description, thumbnail_url")
      .order("name")
      .then(({ data }: any) => setStages((data ?? []) as Stage[]));
  }, []);

  if (stages !== null && stages.length === 0) return null;

  return (
    <section id="stages" className="py-24 px-6 bg-secondary/30 relative overflow-hidden">
      <EightPointStar size={70} className="absolute top-10 left-10 text-primary/5 animate-spin-slow pointer-events-none" />
      <EightPointStar size={50} className="absolute bottom-10 right-10 text-primary/5 animate-float pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10" ref={ref}>
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent font-bold text-xs uppercase tracking-widest border border-accent/20">
            <GraduationCap className="w-4 h-4 text-accent" />
            <span>الصفوف والمراحل الدراسية</span>
          </div>

          <h2 className="text-3xl md:text-5xl font-bold text-primary tracking-tight">
            المراحل والصفوف الدراسية
          </h2>

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            اختر مرحلتك الدراسية واستعرض المقررات التعليمية المصممة لتمكينك من التفوق
          </p>
        </div>

        {stages === null ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-80 rounded-[2rem]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {stages.map((s, i) => (
              <StageCard
                key={s.id}
                stage={s}
                index={i}
                isVisible={isVisible}
                onSelect={() => navigate(`/courses?stage=${s.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

interface StageCardProps {
  stage: Stage;
  index: number;
  isVisible: boolean;
  onSelect: () => void;
}

const StageCard = ({ stage, index, isVisible, onSelect }: StageCardProps) => {
  const signed = useSignedThumbnail(stage.thumbnail_url);
  const [errored, setErrored] = useState(false);
  const showImage = !!signed && !errored;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={isVisible ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: 0.1 + index * 0.07 }}
      onClick={onSelect}
      className="group p-8 rounded-[2rem] border border-border bg-card hover:border-primary hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300 text-right cursor-pointer flex flex-col justify-between"
    >
      <div>
        {showImage ? (
          <div className="mb-6 h-44 w-full rounded-2xl overflow-hidden bg-muted">
            <img
              src={signed!}
              alt={stage.name}
              loading="lazy"
              onError={() => setErrored(true)}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        ) : (
          <div className="mb-6 inline-flex p-3.5 rounded-2xl bg-secondary text-primary font-bold text-xs uppercase tracking-widest items-center gap-2">
            <GraduationCap size={18} />
            <span>مرحلة تعليمية</span>
          </div>
        )}

        <h3 className="text-2xl font-bold group-hover:text-primary transition-colors mb-3">
          {stage.name}
        </h3>

        <p className="text-muted-foreground mb-8 leading-relaxed text-sm line-clamp-3">
          {stage.description || "برنامج تعليمي متكامل مخصص لهذه المرحلة الدراسية بمتابعة واختبارات شاملة."}
        </p>
      </div>

      <button className="w-full py-4 rounded-xl border border-primary/20 text-primary font-bold group-hover:bg-primary group-hover:text-white transition-all flex items-center justify-center gap-2">
        <span>استعراض المواد والدورات</span>
        <ArrowLeft size={18} />
      </button>
    </motion.div>
  );
};

export default StagesSection;
