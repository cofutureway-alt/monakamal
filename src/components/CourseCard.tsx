import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Layers, ArrowLeft, ClipboardList, ClipboardCheck, HelpCircle, Tag, Lock } from "lucide-react";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";
import { EightPointStar } from "@/components/IslamicPatterns";
import type { PublicCourse } from "@/hooks/use-public-courses";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatPiastres, getEffectiveCoursePrice } from "@/lib/money";
import { ComingSoonBadge, ComingSoonCountdown } from "@/components/ComingSoon";


interface Props {
  course: PublicCourse;
  index?: number;
  progress?: number | null;
}

export const CourseCard = forwardRef<HTMLDivElement, Props>(function CourseCard({ course, index = 0, progress }, ref) {
  const thumb = useSignedThumbnail(course.thumbnail_url);
  const price = getEffectiveCoursePrice(course);
  const isComingSoon = course.status === "coming_soon";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, delay: index * 0.07 }}
      whileHover={{ y: -6 }}
    >
      <Link
        to={`/courses/${course.id}`}
        className={
          "group block h-full rounded-[2rem] border border-border/70 bg-card overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-primary/10 hover:border-primary transition-all duration-300 " +
          (isComingSoon ? "ring-1 ring-amber-500/30" : "")
        }
      >
        <div className="relative h-44 overflow-hidden bg-accent">
          {thumb ? (
            <img
              src={thumb}
              alt={course.title}
              className={
                "w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 " +
                (isComingSoon ? "grayscale-[35%]" : "")
              }
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <BookOpen className="w-10 h-10 opacity-30" />
            </div>
          )}
          <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
            {isComingSoon && <ComingSoonBadge />}
            {course.stage_name && (
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-background/95 backdrop-blur text-foreground border border-border shadow">
                {course.stage_name}
              </span>
            )}
            {course.subject_name && (
              <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-primary/95 backdrop-blur text-primary-foreground border border-primary/40 shadow">
                {course.subject_name}
              </span>
            )}
          </div>
          <EightPointStar
            size={36}
            className="absolute bottom-3 left-3 text-primary-foreground/70 opacity-70"
          />
        </div>

        <div className="p-5">
          <h3 className="text-lg font-bold text-foreground mb-2 line-clamp-1">
            {course.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem] mb-4">
            {course.description || "دورة تعليمية على المنصة"}
          </p>

          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pt-4 border-t border-border">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              {course.units_count} وحدات
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              {course.lessons_count} دروس
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" />
              {course.quizzes_count} اختبار
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ClipboardCheck className="w-3.5 h-3.5" />
              {course.assignments_count} واجب
            </span>
            <span className="inline-flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" />
              {course.questions_count} سؤال
            </span>
          </div>

          {isComingSoon && course.scheduled_publish_at && (
            <div className="mt-4">
              <ComingSoonCountdown target={course.scheduled_publish_at} />
            </div>
          )}

          {typeof progress === "number" && !isComingSoon && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                <span>تقدّمك</span>
                <span className="font-semibold text-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex flex-col">
              {isComingSoon ? (
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  التسجيل لم يُفتح بعد
                </span>
              ) : price.isFree ? (
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">مجانًا</span>
              ) : price.discountActive && price.originalAmount !== null ? (
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-base font-extrabold text-primary">{formatPiastres(price.amount)}</span>
                  <span className="text-[11px] text-muted-foreground line-through">
                    {formatPiastres(price.originalAmount)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                    <Tag className="w-3 h-3" />
                    خصم
                  </span>
                </div>
              ) : (
                <span className="text-base font-extrabold text-foreground">{formatPiastres(price.amount)}</span>
              )}
              {typeof progress === "number" && !isComingSoon && (
                <span className="text-[10px] text-muted-foreground mt-0.5">تابع التعلم</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className={
                "gap-1.5 font-bold transition-colors " +
                (isComingSoon
                  ? "text-muted-foreground"
                  : "group-hover:bg-primary group-hover:text-primary-foreground")
              }
            >
              {isComingSoon ? (
                <>
                  <Lock className="w-4 h-4" />
                  عرض التفاصيل
                </>
              ) : (
                <>
                  عرض الدورة
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

export default CourseCard;

