import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Lock,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  contentRoute,
  useCourseContent,
  type ContentItem,
  type ContentUnit,
} from "@/hooks/use-unit-content-items";
import ContentSidebarItem from "@/components/course-content/ContentSidebarItem";
import LessonContentPanel from "@/components/course-content/LessonContentPanel";
import QuizInlinePanel from "@/components/course-content/QuizInlinePanel";
import AssignmentInlinePanel from "@/components/course-content/AssignmentInlinePanel";
import LiveSessionPanel from "@/components/live/LiveSessionPanel";

interface CourseLite {
  id: string;
  title: string;
}

/**
 * Unified course content page (Phase 17).
 *
 * Route: /courses/:courseId/learn/:contentType/:contentId
 *
 * Renders the curriculum sidebar plus whichever content item is currently
 * active. Lessons and quizzes are peers — they share the same outer layout,
 * sidebar styling, "next" navigation, and progress aggregation.
 */
const CourseContentPage = () => {
  const { courseId, contentType, contentId } = useParams();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [course, setCourse] = useState<CourseLite | null>(null);
  const [enrolled, setEnrolled] = useState(false);
  const [loadingCourse, setLoadingCourse] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collapsedUnits, setCollapsedUnits] = useState<Record<string, boolean>>({});

  const { data: content, loading: loadingContent, reload } = useCourseContent(courseId);

  useEffect(() => {
    let cancelled = false;
    if (!courseId) return;
    (async () => {
      setLoadingCourse(true);
      const { data: c } = await supabase
        .from("courses")
        .select("id, title")
        .eq("id", courseId)
        .maybeSingle();
      if (cancelled) return;
      setCourse((c as CourseLite) ?? null);

      let isEnrolled = false;
      if (user) {
        const { data: e } = await supabase
          .from("enrollments")
          .select("id")
          .eq("course_id", courseId)
          .eq("user_id", user.id)
          .maybeSingle();
        isEnrolled = !!e;
      }
      if (cancelled) return;
      setEnrolled(isEnrolled);

      if (!isEnrolled && !isAdmin) {
        toast.error("يجب التسجيل في الدورة أولًا");
        navigate(`/courses/${courseId}`, { replace: true });
        return;
      }
      setLoadingCourse(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, user?.id, isAdmin, navigate]);

  const activeItem: ContentItem | undefined = useMemo(
    () =>
      content?.allItems.find(
        (it) => it.id === contentId && it.type === contentType,
      ),
    [content, contentId, contentType],
  );
  const activeIndex = useMemo(
    () =>
      content?.allItems.findIndex(
        (it) => it.id === contentId && it.type === contentType,
      ) ?? -1,
    [content, contentId, contentType],
  );
  const nextItem =
    activeIndex >= 0 && content ? content.allItems[activeIndex + 1] : undefined;
  const prevItem =
    activeIndex > 0 && content ? content.allItems[activeIndex - 1] : undefined;

  const toggleUnit = (unitId: string) =>
    setCollapsedUnits((prev) => ({ ...prev, [unitId]: !prev[unitId] }));

  // ---------- Loading / not-found guards ----------
  if (authLoading || loadingCourse || loadingContent || !content) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8" dir="rtl">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <h1 className="text-xl font-bold mb-2">المحتوى غير متاح</h1>
          <p className="text-muted-foreground mb-6">
            الدورة غير موجودة أو ليس لديك صلاحية.
          </p>
          <Button asChild>
            <Link to="/courses">
              <ArrowLeft className="w-4 h-4 ml-2" />
              العودة إلى الدورات
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Missing content item → redirect to first available item in course
  if (!activeItem) {
    const first = content.allItems[0];
    if (first) {
      return <Navigate to={first.routePath} replace />;
    }
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <div className="max-w-md rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <h1 className="text-xl font-bold mb-2">لا يوجد محتوى بعد</h1>
          <p className="text-muted-foreground mb-6">لم تُضف دروس أو اختبارات لهذه الدورة بعد.</p>
          <Button asChild>
            <Link to={`/courses/${courseId}`}>
              <ArrowLeft className="w-4 h-4 ml-2" />
              العودة للدورة
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const { units, totalCount, completedCount, percent } = content;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Top bar */}
      <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/85 backdrop-blur-md flex items-center gap-3 px-3 md:px-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/courses/${courseId}`)}
          className="gap-1"
        >
          <ChevronRight className="w-4 h-4" />
          <span className="hidden sm:inline">للدورة</span>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground truncate">{course.title}</div>
          <div className="text-sm font-bold truncate">{activeItem.title}</div>
        </div>
        <div className="hidden md:flex items-center gap-3 min-w-[200px]">
          <Progress value={percent} className="h-1.5 flex-1" />
          <span className="text-xs font-bold tabular-nums">{percent}%</span>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="hidden lg:inline-flex"
          onClick={() => setSidebarCollapsed((v) => !v)}
          title={sidebarCollapsed ? "إظهار المنهج" : "إخفاء المنهج"}
        >
          {sidebarCollapsed ? (
            <PanelRightOpen className="w-5 h-5" />
          ) : (
            <PanelRightClose className="w-5 h-5" />
          )}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="lg:hidden"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="w-5 h-5" />
        </Button>
      </header>

      <div
        className={`grid grid-cols-1 ${sidebarCollapsed ? "" : "lg:grid-cols-[1fr_360px]"}`}
      >
        {/* Main content — swaps based on active item type */}
        <main className="p-3 md:p-6 space-y-5 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeItem.type}-${activeItem.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {activeItem.isLocked && !isAdmin ? (
                <div className="rounded-2xl border-2 border-dashed border-amber-500/40 bg-amber-500/5 p-8 md:p-12 text-center">
                  <motion.div
                    animate={{ rotate: [0, -6, 6, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 1 }}
                    className="w-16 h-16 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 mx-auto mb-4 flex items-center justify-center"
                  >
                    <Lock className="w-8 h-8" />
                  </motion.div>
                  <h2 className="text-xl md:text-2xl font-bold mb-2">هذا العنصر مقفل</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {activeItem.lockReason === "quiz_gate"
                      ? `يجب اجتياز اختبار "${activeItem.gateQuizTitle ?? "المطلوب"}" أولاً لفتح هذا الدرس.`
                      : "يجب إكمال العنصر السابق أولاً قبل الوصول إلى هذا العنصر."}
                  </p>
                </div>
              ) : activeItem.type === "lesson" ? (
                <LessonContentPanel
                  key={activeItem.id}
                  lessonId={activeItem.id}
                  courseId={courseId!}
                  isAdmin={isAdmin}
                  nextItem={nextItem}
                  currentIndex={activeIndex}
                  totalItems={totalCount}
                  onCompleted={reload}
                />
              ) : activeItem.type === "quiz" ? (
                <QuizInlinePanel
                  key={activeItem.id}
                  quizId={activeItem.id}
                  onAttemptCreated={reload}
                />
              ) : activeItem.type === "live_session" ? (
                <LiveSessionPanel
                  key={activeItem.id}
                  sessionId={activeItem.id}
                  courseId={courseId!}
                  courseTitle={course?.title}
                />
              ) : (
                <AssignmentInlinePanel
                  key={activeItem.id}
                  assignmentId={activeItem.id}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {percent === 100 && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 md:p-6 flex items-center gap-4"
            >
              <motion.div
                animate={{ rotate: [0, 8, -8, 0] }}
                transition={{ duration: 1.8, repeat: Infinity }}
                className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shrink-0"
              >
                <Sparkles className="w-7 h-7" />
              </motion.div>
              <div>
                <div className="font-bold text-lg">مبارك! أكملت الدورة بالكامل</div>
                <div className="text-sm text-muted-foreground">
                  أتممت جميع الدروس والاختبارات. يمكنك مراجعة أي عنصر متى شئت.
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              disabled={!prevItem}
              onClick={() => prevItem && navigate(prevItem.routePath)}
              className="gap-1"
            >
              <ArrowLeft className="w-4 h-4 rotate-180" />
              السابق
            </Button>
            <Button
              variant="ghost"
              disabled={!nextItem}
              onClick={() => nextItem && navigate(nextItem.routePath)}
              className="gap-1"
            >
              التالي
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </main>

        {/* Desktop curriculum */}
        {!sidebarCollapsed && (
          <aside className="hidden lg:block border-r border-border bg-card/40">
            <div className="sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto">
              <CurriculumPanel
                course={course}
                units={units}
                activeItem={activeItem}
                percent={percent}
                completedCount={completedCount}
                totalItems={totalCount}
                collapsedUnits={collapsedUnits}
                onToggleUnit={toggleUnit}
              />
            </div>
          </aside>
        )}
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="fixed inset-y-0 right-0 z-50 w-[85%] max-w-sm bg-card border-l border-border shadow-2xl lg:hidden overflow-y-auto"
            >
              <div className="flex items-center justify-between p-3 border-b border-border sticky top-0 bg-card">
                <div className="font-bold">المنهج</div>
                <Button variant="ghost" size="icon" onClick={() => setDrawerOpen(false)}>
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <CurriculumPanel
                course={course}
                units={units}
                activeItem={activeItem}
                percent={percent}
                completedCount={completedCount}
                totalItems={totalCount}
                collapsedUnits={collapsedUnits}
                onToggleUnit={toggleUnit}
                onNavigate={() => setDrawerOpen(false)}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------- Curriculum panel ----------
const CurriculumPanel = ({
  course,
  units,
  activeItem,
  percent,
  completedCount,
  totalItems,
  collapsedUnits,
  onToggleUnit,
  onNavigate,
}: {
  course: CourseLite;
  units: ContentUnit[];
  activeItem: ContentItem;
  percent: number;
  completedCount: number;
  totalItems: number;
  collapsedUnits: Record<string, boolean>;
  onToggleUnit: (unitId: string) => void;
  onNavigate?: () => void;
}) => {
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="text-xs text-muted-foreground mb-1">الدورة</div>
        <div className="font-bold text-sm mb-3 line-clamp-2">{course.title}</div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-muted-foreground">التقدّم</span>
          <span className="font-bold tabular-nums">
            {completedCount}/{totalItems} · {percent}%
          </span>
        </div>
        <Progress value={percent} className="h-2" />
      </div>

      <div className="space-y-3">
        {units.map((u, ui) => {
          const collapsed = !!collapsedUnits[u.id];
          return (
            <div key={u.id} className="space-y-1">
              <button
                onClick={() => onToggleUnit(u.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider hover:bg-accent/50 rounded-md transition-colors"
              >
                <span className="w-6 h-6 rounded bg-primary/10 text-primary inline-flex items-center justify-center text-[10px]">
                  {ui + 1}
                </span>
                <span className="flex-1 min-w-0 truncate text-right">{u.title}</span>
                <span className="text-[10px] opacity-70 tabular-nums shrink-0">
                  {u.items.length}
                </span>
                <motion.span animate={{ rotate: collapsed ? -90 : 0 }}>
                  <ChevronDown className="w-4 h-4" />
                </motion.span>
              </button>

              <AnimatePresence initial={false}>
                {!collapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {u.items.length === 0 ? (
                      <div className="px-2 py-2 text-xs text-muted-foreground">
                        لا يوجد محتوى
                      </div>
                    ) : (
                      u.items.map((it) => (
                        <ContentSidebarItem
                          key={`${it.type}-${it.id}`}
                          item={it}
                          isCurrent={
                            it.id === activeItem.id && it.type === activeItem.type
                          }
                          onNavigate={onNavigate}
                        />
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------- Legacy redirect helpers ----------
export const LegacyLessonRedirect = () => {
  const { courseId, lessonId } = useParams();
  if (!courseId || !lessonId) return <Navigate to="/courses" replace />;
  return <Navigate to={contentRoute(courseId, "lesson", lessonId)} replace />;
};

export const LegacyQuizRedirect = () => {
  const { courseId, quizId } = useParams();
  if (!courseId || !quizId) return <Navigate to="/courses" replace />;
  return <Navigate to={contentRoute(courseId, "quiz", quizId)} replace />;
};

export default CourseContentPage;
