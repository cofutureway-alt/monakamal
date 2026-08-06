import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Search, BookOpen, SlidersHorizontal, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CourseCard } from "@/components/CourseCard";
import { usePublicCourses } from "@/hooks/use-public-courses";
import { useMyProgressMap } from "@/hooks/use-my-progress";
import { supabase } from "@/integrations/supabase/client";
import { EightPointStar } from "@/components/IslamicPatterns";

interface Named {
  id: string;
  name: string;
}

const Courses = () => {
  const courses = usePublicCourses();
  const progressMap = useMyProgressMap();
  const [stages, setStages] = useState<Named[]>([]);
  const [subjects, setSubjects] = useState<Named[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [stageId, setStageId] = useState<string | "all">(
    searchParams.get("stage") ?? "all",
  );
  const [subjectId, setSubjectId] = useState<string | "all">(
    searchParams.get("subject") ?? "all",
  );

  useEffect(() => {
    supabase
      .from("stages")
      .select("id, name")
      .order("order_index", { ascending: true })
      .then(({ data }) => setStages((data as Named[]) ?? []));
    (supabase as any)
      .from("subjects")
      .select("id, name")
      .order("name")
      .then(({ data }: any) => setSubjects((data as Named[]) ?? []));
  }, []);

  // Sync selected filters -> URL for shareable state
  useEffect(() => {
    const p = new URLSearchParams(searchParams);
    stageId === "all" ? p.delete("stage") : p.set("stage", stageId);
    subjectId === "all" ? p.delete("subject") : p.set("subject", subjectId);
    setSearchParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageId, subjectId]);

  const filtered = useMemo(() => {
    if (!courses) return null;
    return courses.filter((c) => {
      if (stageId !== "all" && c.stage_id !== stageId) return false;
      if (subjectId !== "all" && c.subject_id !== subjectId) return false;
      if (query && !c.title.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [courses, query, stageId, subjectId]);

  const activeCount =
    (stageId !== "all" ? 1 : 0) +
    (subjectId !== "all" ? 1 : 0) +
    (query.trim() ? 1 : 0);

  const resetAll = () => {
    setStageId("all");
    setSubjectId("all");
    setQuery("");
  };

  const stageName = stages.find((s) => s.id === stageId)?.name;
  const subjectName = subjects.find((s) => s.id === subjectId)?.name;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-28 pb-16 relative overflow-hidden">
        <EightPointStar
          size={80}
          className="absolute top-24 left-8 text-primary/5 animate-spin-slow pointer-events-none"
        />
        <EightPointStar
          size={50}
          className="absolute top-64 right-6 text-primary/5 animate-float pointer-events-none"
        />

        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl md:text-5xl font-bold text-foreground">
              كل الدورات
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              استكشف جميع الدورات المنشورة على المنصة وابدأ رحلتك التعليمية.
            </p>
          </motion.div>

          {/* Filter Toolbar */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mb-6 rounded-2xl border border-border bg-card p-3 md:p-4 shadow-sm"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث عن دورة..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pr-10 h-11 bg-background"
                />
              </div>

              {/* Desktop selects */}
              <div className="hidden md:flex items-center gap-2">
                <Select value={stageId} onValueChange={(v) => setStageId(v)}>
                  <SelectTrigger className="h-11 min-w-[180px] bg-background">
                    <SelectValue placeholder="المرحلة" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">جميع المراحل</SelectItem>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={subjectId} onValueChange={(v) => setSubjectId(v)}>
                  <SelectTrigger className="h-11 min-w-[180px] bg-background">
                    <SelectValue placeholder="المادة" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">جميع المواد</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {activeCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetAll}
                    className="h-11 gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                    مسح
                  </Button>
                )}
              </div>

              {/* Mobile filter sheet */}
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="w-full h-11 gap-2 justify-between">
                      <span className="flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4" />
                        الفلاتر
                      </span>
                      {activeCount > 0 && (
                        <Badge className="bg-primary text-primary-foreground rounded-full h-6 min-w-6 px-2">
                          {activeCount}
                        </Badge>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="rounded-t-3xl">
                    <SheetHeader>
                      <SheetTitle>تصفية الدورات</SheetTitle>
                    </SheetHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-muted-foreground">المرحلة</div>
                        <Select value={stageId} onValueChange={setStageId}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="المرحلة" /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value="all">جميع المراحل</SelectItem>
                            {stages.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-muted-foreground">المادة</div>
                        <Select value={subjectId} onValueChange={setSubjectId}>
                          <SelectTrigger className="h-11"><SelectValue placeholder="المادة" /></SelectTrigger>
                          <SelectContent className="max-h-72">
                            <SelectItem value="all">جميع المواد</SelectItem>
                            {subjects.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {activeCount > 0 && (
                        <Button variant="outline" className="w-full gap-2" onClick={resetAll}>
                          <X className="w-4 h-4" /> مسح الفلاتر
                        </Button>
                      )}
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Active filter chips */}
            {activeCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">مطبّق:</span>
                {stageName && (
                  <FilterChip label={stageName} onRemove={() => setStageId("all")} />
                )}
                {subjectName && (
                  <FilterChip label={subjectName} onRemove={() => setSubjectId("all")} />
                )}
                {query.trim() && (
                  <FilterChip label={`"${query}"`} onRemove={() => setQuery("")} />
                )}
              </div>
            )}
          </motion.div>

          {/* Results count */}
          {courses && (
            <div className="text-sm text-muted-foreground mb-4">
              {filtered?.length ?? 0} من {courses.length} دورة
            </div>
          )}

          {courses === null ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border overflow-hidden">
                  <Skeleton className="h-44 w-full" />
                  <div className="p-5 space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <motion.div
              layout
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              <AnimatePresence mode="popLayout">
                {filtered.map((c, i) => (
                  <CourseCard key={c.id} course={c} index={i} progress={progressMap[c.id]} />
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-border p-16 text-center max-w-lg mx-auto">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
                <BookOpen className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">
                {courses.length === 0
                  ? "لا توجد دورات منشورة بعد"
                  : "لا توجد نتائج مطابقة"}
              </h2>
              <p className="text-muted-foreground mb-4">
                {courses.length === 0
                  ? "سنضيف الدورات قريبًا. تابعنا للاطلاع على الجديد."
                  : "جرّب كلمات بحث أخرى أو غيّر الفلاتر."}
              </p>
              {activeCount > 0 && (
                <Button variant="outline" onClick={resetAll} className="gap-2">
                  <X className="w-4 h-4" /> مسح الفلاتر
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

const FilterChip = ({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) => (
  <button
    onClick={onRemove}
    className="inline-flex items-center gap-1.5 pr-3 pl-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold hover:bg-primary/15 transition-colors"
  >
    {label}
    <X className="w-3.5 h-3.5" />
  </button>
);

export default Courses;
