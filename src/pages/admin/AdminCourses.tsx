import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  BookOpen,
  Sparkles,
  Pencil,
  Trash2,
  AlertTriangle,
  Layers,
  FileText,
  ClipboardList,
  HelpCircle,
  LayoutGrid,
  List,
  EyeOff,
  Eye,
  Star,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSignedThumbnail } from "@/hooks/use-signed-thumbnail";

interface CourseRow {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  status: "draft" | "coming_soon" | "published";
  stage_id: string | null;
  created_at: string;
  stage_name: string | null;
  units_count: number;
  lessons_count: number;
  quizzes_count: number;
  assignments_count: number;
  questions_count: number;
  is_featured: boolean;
  course_type: "recorded" | "live";
}

interface StageOpt {
  id: string;
  name: string;
}

const CourseThumb = ({ path }: { path: string | null }) => {
  const url = useSignedThumbnail(path);
  return (
    <div className="relative w-full aspect-video bg-gradient-to-br from-primary/10 via-accent/40 to-primary/5 overflow-hidden">
      {url ? (
        <img src={url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
          <BookOpen className="w-10 h-10 opacity-40" />
        </div>
      )}
    </div>
  );
};

const AdminCourses = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [stages, setStages] = useState<StageOpt[]>([]);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [featuredFilter, setFeaturedFilter] = useState<"all" | "featured" | "not_featured">("all");
  const [deleting, setDeleting] = useState<CourseRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<null | "delete" | "draft" | "publish">(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: cRows, error }, { data: sRows }] = await Promise.all([
      supabase
        .from("courses")
        .select(
          "id, title, description, thumbnail_url, status, stage_id, is_featured, created_at, course_type, stages(name), units(id, lessons(id))",
        )
        .order("created_at", { ascending: false }),
      supabase.from("stages").select("id, name").order("name"),
    ]);

    if (error) {
      toast.error("تعذّر تحميل الدورات");
      setCourses([]);
      return;
    }
    setStages((sRows as StageOpt[]) ?? []);

    const courseIds = (cRows ?? []).map((c: any) => c.id);
    const quizzesByCourse: Record<string, number> = {};
    const questionsByCourse: Record<string, number> = {};
    if (courseIds.length) {
      const { data: quizzes } = await (supabase as any)
        .from("quizzes")
        .select("id, course_id")
        .in("course_id", courseIds);
      const quizToCourse: Record<string, string> = {};
      (quizzes ?? []).forEach((q: any) => {
        quizToCourse[q.id] = q.course_id;
        quizzesByCourse[q.course_id] = (quizzesByCourse[q.course_id] ?? 0) + 1;
      });
      const quizIds = Object.keys(quizToCourse);
      if (quizIds.length) {
        const { data: questions } = await (supabase as any)
          .from("quiz_questions")
          .select("quiz_id")
          .in("quiz_id", quizIds);
        (questions ?? []).forEach((qq: any) => {
          const cId = quizToCourse[qq.quiz_id];
          if (cId) questionsByCourse[cId] = (questionsByCourse[cId] ?? 0) + 1;
        });
      }
    }

    const assignmentsByCourse: Record<string, number> = {};
    if (courseIds.length) {
      const { data: assignments } = await (supabase as any)
        .from("assignments")
        .select("course_id")
        .in("course_id", courseIds);
      (assignments ?? []).forEach((a: any) => {
        assignmentsByCourse[a.course_id] = (assignmentsByCourse[a.course_id] ?? 0) + 1;
      });
    }

    setCourses(
      (cRows ?? []).map((c: any) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        thumbnail_url: c.thumbnail_url,
        status: c.status,
        stage_id: c.stage_id,
        created_at: c.created_at,
        stage_name: c.stages?.name ?? null,
        course_type: (c as any).course_type ?? "recorded",
        units_count: c.units?.length ?? 0,
        lessons_count:
          c.units?.reduce(
            (acc: number, u: any) => acc + (u.lessons?.length ?? 0),
            0,
          ) ?? 0,
        quizzes_count: quizzesByCourse[c.id] ?? 0,
        assignments_count: assignmentsByCourse[c.id] ?? 0,
        questions_count: questionsByCourse[c.id] ?? 0,
        is_featured: !!c.is_featured,
      })),
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!courses) return null;
    return courses.filter((c) => {
      if (query && !c.title.toLowerCase().includes(query.toLowerCase()))
        return false;
      if (stageFilter !== "all" && c.stage_id !== stageFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && (c.course_type ?? "recorded") !== typeFilter) return false;
      if (featuredFilter === "featured" && !c.is_featured) return false;
      if (featuredFilter === "not_featured" && c.is_featured) return false;
      return true;
    });
  }, [courses, query, stageFilter, statusFilter, featuredFilter, typeFilter]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletePending(true);
    try {
      if (deleting.thumbnail_url) {
        await supabase.storage.from("thumbnails").remove([deleting.thumbnail_url]);
      }
      const { error } = await supabase
        .from("courses")
        .delete()
        .eq("id", deleting.id);
      if (error) throw error;
      toast.success("تم حذف الدورة");
      setDeleting(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر حذف الدورة");
    } finally {
      setDeletePending(false);
    }
  };

  const toggleOne = (id: string) =>
    setSelectedIds((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAllVisible = () => {
    if (!filtered) return;
    setSelectedIds((p) =>
      p.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id))
    );
  };

  const runBulk = async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    try {
      if (bulkAction === "delete") {
        const { error } = await supabase.from("courses").delete().in("id", ids);
        if (error) throw error;
        toast.success(`تم حذف ${ids.length} دورة`);
      } else {
        const status = bulkAction === "draft" ? "draft" : "published";
        const { error } = await supabase.from("courses").update({ status }).in("id", ids);
        if (error) throw error;
        toast.success(`تم تحديث ${ids.length} دورة`);
      }
      setSelectedIds(new Set());
      setBulkAction(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "تعذّر التنفيذ");
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleFeatured = async (c: CourseRow) => {
    const next = !c.is_featured;
    // optimistic
    setCourses((prev) => prev ? prev.map((x) => x.id === c.id ? { ...x, is_featured: next } : x) : prev);
    const { error } = await (supabase as any).from("courses").update({ is_featured: next }).eq("id", c.id);
    if (error) {
      setCourses((prev) => prev ? prev.map((x) => x.id === c.id ? { ...x, is_featured: !next } : x) : prev);
      toast.error(error.message || "تعذّر تحديث حالة الإبراز");
    } else {
      toast.success(next ? "تم إبراز الدورة" : "تمّ إلغاء الإبراز");
    }
  };


  return (
    <div className="max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8"
      >
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">الدورات</h1>
          <p className="text-muted-foreground mt-2">
            إدارة الدورات وبناء المحتوى التعليمي.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 transition ${view === "grid" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"}`}
              title="عرض شبكي"
            >
              <LayoutGrid className="w-4 h-4" /> شبكة
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 transition ${view === "table" ? "bg-primary text-primary-foreground" : "bg-transparent hover:bg-muted"}`}
              title="عرض جدول"
            >
              <List className="w-4 h-4" /> جدول
            </button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="lg" className="shadow-lg shadow-primary/20">
                <Plus className="w-4 h-4 ml-2" />
                دورة جديدة
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate("/admin/courses/new")}>
                دورة مسجّلة
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/admin/courses/new?type=live")}>
                <Radio className="w-4 h-4" /> دورة مباشرة
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6"
      >
        <div className="relative md:col-span-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ابحث عن دورة..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pr-10"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger>
            <SelectValue placeholder="كل المراحل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المراحل</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="كل الحالات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="published">منشورة</SelectItem>
            <SelectItem value="coming_soon">قريبًا</SelectItem>
            <SelectItem value="draft">مسودة</SelectItem>

          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger>
            <SelectValue placeholder="النوع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأنواع</SelectItem>
            <SelectItem value="recorded">مسجّلة</SelectItem>
            <SelectItem value="live">مباشرة</SelectItem>
          </SelectContent>
        </Select>
        <Select value={featuredFilter} onValueChange={(v) => setFeaturedFilter(v as any)}>
          <SelectTrigger>
            <SelectValue placeholder="الإبراز" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل (مميز وغير مميز)</SelectItem>
            <SelectItem value="featured">المميزة فقط</SelectItem>
            <SelectItem value="not_featured">غير المميزة</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 mb-6"
          >
            <div className="text-sm font-semibold">تم تحديد {selectedIds.size} دورة</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setBulkAction("draft")} className="gap-1.5">
                <EyeOff className="w-4 h-4" /> تحويل إلى مسودة
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBulkAction("publish")} className="gap-1.5 text-emerald-600">
                <Eye className="w-4 h-4" /> نشر
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setBulkAction("delete")} className="gap-1.5">
                <Trash2 className="w-4 h-4" /> حذف
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>إلغاء</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {courses === null ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/60 overflow-hidden">
              <Skeleton className="aspect-video w-full" />
              <div className="p-5 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered && filtered.length > 0 && view === "table" ? (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="text-right">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary cursor-pointer"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filtered.length; }}
                      onChange={toggleAllVisible}
                    />
                  </th>
                  <th className="p-3 font-semibold">العنوان</th>
                  <th className="p-3 font-semibold hidden md:table-cell">المرحلة</th>
                  <th className="p-3 font-semibold">الحالة</th>
                  <th className="p-3 font-semibold text-center w-16" title="مميّز على الصفحة الرئيسية">مميّز</th>
                  <th className="p-3 font-semibold hidden lg:table-cell">المحتوى</th>
                  <th className="p-3 font-semibold text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border/60 hover:bg-accent/30">
                    <td className="p-3 w-10">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-primary cursor-pointer"
                        checked={selectedIds.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                      />
                    </td>
                    <td className="p-3 font-semibold">
                      <span className="inline-flex items-center gap-2">
                        {c.title}
                        {c.course_type === "live" && (
                          <Badge className="bg-primary/10 text-primary border-0">مباشر</Badge>
                        )}
                      </span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{c.stage_name || "—"}</td>
                    <td className="p-3">
                      <Badge
                        className={
                          c.status === "published"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0"
                            : c.status === "coming_soon"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0"
                              : "bg-muted text-muted-foreground border-0"
                        }
                      >
                        {c.status === "published" ? "منشورة" : c.status === "coming_soon" ? "قريبًا" : "مسودة"}
                      </Badge>
                    </td>

                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleFeatured(c)}
                        title={c.is_featured ? "إلغاء الإبراز" : "إبراز في الصفحة الرئيسية"}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
                          c.is_featured
                            ? "text-amber-500 hover:bg-amber-500/10"
                            : "text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10"
                        }`}
                      >
                        <Star className={`w-4 h-4 ${c.is_featured ? "fill-current" : ""}`} />
                      </button>
                    </td>

                    <td className="p-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {c.units_count} وحدة · {c.lessons_count} درس · {c.quizzes_count} اختبار · {c.assignments_count} واجب
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="icon" title="تعديل">
                          <Link to={`/admin/courses/${c.id}/builder`}><Pencil className="w-4 h-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleting(c)} title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtered && filtered.length > 0 ? (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence mode="popLayout">
            {filtered.map((c, i) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.04, type: "spring", damping: 22 }}
                whileHover={{ y: -4 }}
                className="group rounded-2xl border border-border/60 bg-card overflow-hidden hover:shadow-xl hover:shadow-primary/5 hover:border-primary/40 transition-all"
              >
                <div className="relative">
                  <CourseThumb path={c.thumbnail_url} />
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); toggleFeatured(c); }}
                    title={c.is_featured ? "إلغاء الإبراز" : "إبراز في الصفحة الرئيسية"}
                    className={`absolute top-2 right-2 inline-flex items-center justify-center w-9 h-9 rounded-full backdrop-blur transition-colors shadow ${
                      c.is_featured
                        ? "bg-amber-500 text-white"
                        : "bg-background/80 text-muted-foreground hover:text-amber-500"
                    }`}
                  >
                    <Star className={`w-4 h-4 ${c.is_featured ? "fill-current" : ""}`} />
                  </button>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      className={
                        c.status === "published"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20 border-0"
                          : c.status === "coming_soon"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0"
                            : "bg-muted text-muted-foreground border-0"
                      }
                    >
                      {c.status === "published" ? "منشورة" : c.status === "coming_soon" ? "قريبًا" : "مسودة"}
                    </Badge>

                    {c.stage_name && (
                      <span className="text-xs text-muted-foreground">
                        {c.stage_name}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-lg text-foreground mb-1 line-clamp-1">
                    {c.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                    {c.description || "بدون وصف"}
                  </p>

                  <div className="flex items-center gap-3 flex-wrap mt-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5" />
                      {c.units_count} وحدات
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5" />
                      {c.lessons_count} دروس
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" />
                      {c.quizzes_count} اختبار
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" />
                      {c.assignments_count} واجب
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <HelpCircle className="w-3.5 h-3.5" />
                      {c.questions_count} سؤال
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/60">
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      <Link to={`/admin/courses/${c.id}/builder`}>
                        <Pencil className="w-4 h-4 ml-2" />
                        تعديل
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleting(c)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : courses.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl border-2 border-dashed border-border/70 bg-card/40 p-12 md:p-20 text-center"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
            <BookOpen className="w-10 h-10 text-primary" />
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">
            <Sparkles className="w-3 h-3" />
            ابدأ رحلتك التعليمية
          </div>
          <h2 className="text-2xl font-bold mb-2">لا توجد دورات بعد</h2>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            أنشئ أول دورة، ثم أضف الوحدات والدروس والملفات لبناء منهج كامل.
          </p>
          <Button size="lg" onClick={() => navigate("/admin/courses/new")}>
            <Plus className="w-4 h-4 ml-2" />
            إنشاء دورة جديدة
          </Button>
        </motion.div>
      ) : (
        <div className="text-center py-16 text-muted-foreground">
          لا توجد نتائج مطابقة.
        </div>
      )}

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              حذف الدورة
            </AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف "{deleting?.title}" وجميع وحداتها ودروسها وملفاتها نهائيًا.
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deletePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف نهائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkAction === "delete" && `حذف ${selectedIds.size} دورة نهائيًا؟`}
              {bulkAction === "draft" && `تحويل ${selectedIds.size} دورة إلى مسودة؟`}
              {bulkAction === "publish" && `نشر ${selectedIds.size} دورة؟`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkAction === "delete"
                ? "سيتم حذف الدورات المحددة وكل محتواها نهائيًا. لا يمكن التراجع."
                : "سيتم تحديث حالة كل الدورات المحددة."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); runBulk(); }}
              disabled={bulkBusy}
              className={bulkAction === "delete" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCourses;
