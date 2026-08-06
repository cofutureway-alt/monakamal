import { Link } from "react-router-dom";
import { ArrowLeft, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollAnimation } from "@/hooks/use-scroll-animation";
import { EightPointStar, IslamicDivider } from "@/components/IslamicPatterns";
import { usePublicCourses } from "@/hooks/use-public-courses";
import { useMyProgressMap } from "@/hooks/use-my-progress";
import { CourseCard } from "@/components/CourseCard";

const FeaturedCoursesSection = () => {
  const { ref, isVisible } = useScrollAnimation();
  const courses = usePublicCourses(6, { featuredOnly: true });
  const progressMap = useMyProgressMap();

  if (courses === null) return null;
  if (courses.length === 0) return null;

  return (
    <section id="featured-courses" className="py-24 px-6 relative overflow-hidden bg-background">
      <EightPointStar size={70} className="absolute top-12 right-12 text-primary/5 animate-spin-slow pointer-events-none" />
      <EightPointStar size={50} className="absolute bottom-12 left-12 text-accent/20 animate-float pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10" ref={ref}>
        {/* Header row */}
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent font-bold text-xs uppercase tracking-widest border border-accent/20">
            <Star className="w-4 h-4 text-accent fill-accent/20" />
            <span>مختارة بعناية لك</span>
            <Sparkles className="w-4 h-4 text-accent" />
          </div>

          <h2 className="text-3xl md:text-5xl font-bold text-primary tracking-tight">
            الدورات التعليمية المميزة
          </h2>

          <p className="text-lg text-muted-foreground leading-relaxed">
            نخبة من أفضل الدورات التدريبية المتاحة على المنصة لمساعدتك على التفوق
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {courses.map((c, i) => (
            <CourseCard key={c.id} course={c} index={i} progress={progressMap[c.id]} />
          ))}
        </div>

        <div className="text-center mt-14">
          <Button asChild size="lg" className="bg-primary text-primary-foreground gap-3 font-bold text-lg px-10 py-6 rounded-2xl hover:shadow-xl hover:shadow-primary/20 transition-all">
            <Link to="/courses">
              عرض جميع الدورات
              <ArrowLeft size={20} />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FeaturedCoursesSection;
