import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, PlayCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyCourses, type MyCourse } from "@/hooks/use-my-courses";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { toast } from "sonner";
import UpcomingLiveSessionsCard from "@/components/live/UpcomingLiveSessionsCard";

const MyCourses = () => {
  const courses = useMyCourses();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <UpcomingLiveSessionsCard />

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">دوراتي</h1>
        <p className="text-muted-foreground mt-1">
          تابع تقدّمك وواصل الدرس من حيث توقّفت.
        </p>
      </motion.div>

      {courses === null ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border overflow-hidden">
              <Skeleton className="h-40 w-full" />
              <div className="p-5 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : courses.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border-2 border-dashed border-border p-16 text-center max-w-lg mx-auto"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">لم تسجّل في أي دورة بعد</h2>
          <p className="text-muted-foreground mb-6">
            تصفّح الدورات المتاحة وابدأ رحلتك التعليمية مجانًا.
          </p>
          <Button asChild size="lg" className="font-bold">
            <a href="/courses">استعرض الدورات</a>
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((c, i) => (
            <MyCourseCard key={c.id} course={c} index={i} />
          ))}
        </div>
      )}
    </div>
  );
};

const MyCourseCard = ({ course, index }: { course: MyCourse; index: number }) => {
  const thumb = useSignedThumbnail(course.thumbnail_url);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleContinue = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: units } = await supabase
        .from("units")
        .select("id, position")
        .eq("course_id", course.id)
        .order("position");
      const unitIds = (units ?? []).map((u: any) => u.id);
      if (!unitIds.length) {
        toast.info("لم تُضف دروس بعد");
        return;
      }
      const { data: lessons } = await supabase
        .from("lessons_public")
        .select("id, unit_id, position")
        .in("unit_id", unitIds)
        .order("position");
      const unitOrder = new Map(unitIds.map((id, idx) => [id, idx]));
      const ordered = (lessons ?? []).slice().sort((a: any, b: any) => {
        const ua = unitOrder.get(a.unit_id) ?? 0;
        const ub = unitOrder.get(b.unit_id) ?? 0;
        if (ua !== ub) return ua - ub;
        return a.position - b.position;
      });
      if (!ordered.length) {
        toast.info("لم تُضف دروس بعد");
        return;
      }
      const { data: done } = await supabase
        .from("lesson_progress")
        .select("lesson_id")
        .eq("course_id", course.id)
        .eq("user_id", user.id);
      const doneSet = new Set<string>((done ?? []).map((d: any) => d.lesson_id));
      const next = ordered.find((l: any) => !doneSet.has(l.id)) ?? ordered[0];
      navigate(`/courses/${course.id}/learn/lesson/${next.id}`);
    } finally {
      setLoading(false);
    }
  };

  const completed = course.percent === 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4 }}
      whileHover={{ y: -4 }}
      className="rounded-2xl border border-border bg-card overflow-hidden shadow-md hover:shadow-xl hover:border-primary/40 transition-all flex flex-col"
    >
      <div className="relative h-40 bg-accent overflow-hidden">
        {thumb ? (
          <img
            src={thumb}
            alt={course.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <BookOpen className="w-10 h-10 opacity-30" />
          </div>
        )}
        {course.stage_name && (
          <span className="absolute top-3 right-3 text-[11px] font-bold px-3 py-1 rounded-full bg-background/95 backdrop-blur text-foreground border border-border shadow">
            {course.stage_name}
          </span>
        )}
        {completed && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500 text-white shadow">
            <CheckCircle2 className="w-3.5 h-3.5" />
            مكتملة
          </span>
        )}
      </div>

      <div className="p-5 flex-1 flex flex-col">
        <h3 className="text-lg font-bold line-clamp-1">{course.title}</h3>
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem] mt-1">
          {course.description || "دورة تعليمية على المنصة"}
        </p>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">تقدّمك</span>
            <span className="font-bold text-foreground">
              {course.completed_count}/{course.lessons_count} · {course.percent}%
            </span>
          </div>
          <Progress value={course.percent} className="h-2" />
        </div>

        <Button
          onClick={handleContinue}
          disabled={loading}
          size="lg"
          className="w-full mt-5 font-bold gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PlayCircle className="w-5 h-5" />
          )}
          {completed
            ? "مراجعة الدورة"
            : course.completed_count > 0
              ? "متابعة التعلّم"
              : "بدء الدورة"}
        </Button>
      </div>
    </motion.div>
  );
};

export default MyCourses;
