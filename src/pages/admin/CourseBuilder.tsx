import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowRight,
  Plus,
  GripVertical,
  ChevronDown,
  MoreVertical,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  Layers,
  PlayCircle,
  Info,
  Settings,
  ClipboardList,
  ClipboardCheck,
  Clock,
} from "lucide-react";

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import LessonModal, { type LessonRecord } from "@/components/admin/LessonModal";
import QuizWizard, { type QuizRecord } from "@/components/admin/QuizWizard";
import AssignmentModal, { type AssignmentRecord } from "@/components/admin/AssignmentModal";
import LiveSessionFormModal, {
  type LiveSessionFormTarget,
} from "@/components/live/LiveSessionFormModal";
import LiveSessionAdminCard, {
  type AdminSessionView,
} from "@/components/live/LiveSessionAdminCard";
import LiveSessionsTimeline from "@/components/live/LiveSessionsTimeline";
import {
  cancelLiveSession,
  deleteLiveSession,
  liveErrorMessage,
} from "@/lib/live-sessions-api";
import { Radio } from "lucide-react";

// ---------- Types ----------
interface Course {
  id: string;
  title: string;
  status: "draft" | "coming_soon" | "published";
  scheduled_publish_at: string | null;
  course_type?: "recorded" | "live";
}


type ContentItem =
  | { kind: "lesson"; id: string; order: number; lesson: LessonRecord }
  | { kind: "quiz"; id: string; order: number; quiz: QuizRecord }
  | { kind: "assignment"; id: string; order: number; assignment: AssignmentRecord };

interface Unit {
  id: string;
  title: string;
  description: string | null;
  position: number;
  content: ContentItem[];
  /** Live sessions attached to this unit, ordered by position then start. */
  sessions: AdminSessionView[];
}

// ---------- Autosave indicator ----------
type SaveState = "idle" | "saving" | "saved";

// ---------- Unit modal ----------
const unitSchema = z.object({
  title: z.string().trim().min(2, "الاسم قصير جدًا").max(120),
  description: z.string().trim().max(500).optional(),
});
type UnitFormValues = z.infer<typeof unitSchema>;

const UnitModal = ({
  open,
  onOpenChange,
  unit,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unit: Unit | null;
  onSubmit: (values: UnitFormValues) => Promise<void>;
}) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UnitFormValues>({ resolver: zodResolver(unitSchema) });

  useEffect(() => {
    if (open) reset({ title: unit?.title ?? "", description: unit?.description ?? "" });
  }, [open, unit, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{unit ? "تعديل الوحدة" : "وحدة جديدة"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit(async (v) => {
            await onSubmit(v);
            onOpenChange(false);
          })}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>اسم الوحدة</Label>
            <Input placeholder="مثال: الوحدة الأولى" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>الوصف</Label>
            <Textarea rows={3} {...register("description")} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
              حفظ
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Sortable lesson row ----------
const LessonItem = ({
  lesson,
  onEdit,
  onDelete,
  isOverlay,
}: {
  lesson: LessonRecord;
  onEdit: () => void;
  onDelete: () => void;
  isOverlay?: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `lesson:${lesson.id}`, data: { type: "lesson", lesson } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 p-2.5 rounded-lg border border-border/60 bg-background hover:border-primary/40 hover:bg-accent/40 transition-colors ${
        isOverlay ? "shadow-2xl border-primary/60" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-1"
        aria-label="اسحب لإعادة الترتيب"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <PlayCircle className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{lesson.title}</div>
      </div>
      {!isOverlay && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

// ---------- Sortable quiz row ----------
const QuizItem = ({
  quiz,
  onEdit,
  onDelete,
  isOverlay,
}: {
  quiz: QuizRecord;
  onEdit: () => void;
  onDelete: () => void;
  isOverlay?: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `quiz:${quiz.id}`, data: { type: "quiz", quiz } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10 transition-colors ${
        isOverlay ? "shadow-2xl border-amber-500/70" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-1"
        aria-label="اسحب لإعادة الترتيب"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-7 h-7 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0">
        <ClipboardList className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{quiz.title}</div>
      </div>
      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400 shrink-0">
        اختبار
      </Badge>
      {!isOverlay && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

// ---------- Sortable assignment row ----------
const AssignmentItem = ({
  assignment,
  onEdit,
  onDelete,
  isOverlay,
}: {
  assignment: AssignmentRecord;
  onEdit: () => void;
  onDelete: () => void;
  isOverlay?: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `assignment:${assignment.id}`,
    data: { type: "assignment", assignment },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging && !isOverlay ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60 hover:bg-emerald-500/10 transition-colors ${
        isOverlay ? "shadow-2xl border-emerald-500/70" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-1"
        aria-label="اسحب لإعادة الترتيب"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="w-7 h-7 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0">
        <ClipboardCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{assignment.title}</div>
      </div>
      <Badge
        variant="outline"
        className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 shrink-0"
      >
        واجب
      </Badge>
      {!isOverlay && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} className="h-8 w-8">
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};

// ---------- Sortable unit card ----------
const UnitCard = ({
  unit,
  expanded,
  onToggle,
  onEdit,
  onDelete,
  onAddLesson,
  onAddQuiz,
  onAddAssignment,
  onAddLiveSession,
  onEditLiveSession,
  onCancelLiveSession,
  onDeleteLiveSession,
  onEditLesson,
  onDeleteLesson,
  onEditQuiz,
  onDeleteQuiz,
  onEditAssignment,
  onDeleteAssignment,
}: {
  unit: Unit;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddLesson: () => void;
  onAddQuiz: () => void;
  onAddAssignment: () => void;
  onAddLiveSession: () => void;
  onEditLiveSession: (s: AdminSessionView) => void;
  onCancelLiveSession: (s: AdminSessionView) => void;
  onDeleteLiveSession: (s: AdminSessionView) => void;
  onEditLesson: (l: LessonRecord) => void;
  onDeleteLesson: (l: LessonRecord) => void;
  onEditQuiz: (q: QuizRecord) => void;
  onDeleteQuiz: (q: QuizRecord) => void;
  onEditAssignment: (a: AssignmentRecord) => void;
  onDeleteAssignment: (a: AssignmentRecord) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `unit:${unit.id}`, data: { type: "unit" } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const lessonCount = unit.content.filter((c) => c.kind === "lesson").length;
  const quizCount = unit.content.filter((c) => c.kind === "quiz").length;
  const assignmentCount = unit.content.filter((c) => c.kind === "assignment").length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-2xl border border-border/60 bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2 p-4">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-1"
          aria-label="اسحب لإعادة ترتيب الوحدة"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <button onClick={onToggle} className="flex-1 flex items-center gap-3 text-right min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-foreground truncate">{unit.title}</div>
            <div className="text-xs text-muted-foreground">
              {lessonCount} دروس · {quizCount} اختبارات · {assignmentCount} واجبات
            </div>
          </div>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          </motion.div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="w-4 h-4 ml-2" />
              تعديل
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="w-4 h-4 ml-2" />
              حذف
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2 border-t border-border/60 pt-3">
              <SortableContext
                items={unit.content.map((c) => `${c.kind}:${c.id}`)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 min-h-[8px]">
                  {unit.content.map((c) => {
                    if (c.kind === "lesson") {
                      return (
                        <LessonItem
                          key={`l-${c.id}`}
                          lesson={c.lesson}
                          onEdit={() => onEditLesson(c.lesson)}
                          onDelete={() => onDeleteLesson(c.lesson)}
                        />
                      );
                    }
                    if (c.kind === "quiz") {
                      return (
                        <QuizItem
                          key={`q-${c.id}`}
                          quiz={c.quiz}
                          onEdit={() => onEditQuiz(c.quiz)}
                          onDelete={() => onDeleteQuiz(c.quiz)}
                        />
                      );
                    }
                    return (
                      <AssignmentItem
                        key={`a-${c.id}`}
                        assignment={c.assignment}
                        onEdit={() => onEditAssignment(c.assignment)}
                        onDelete={() => onDeleteAssignment(c.assignment)}
                      />
                    );
                  })}
                  {unit.sessions.map((s) => (
                    <LiveSessionAdminCard
                      key={`ls-${s.id}`}
                      session={s}
                      courseId={s.course_id}
                      onEdit={onEditLiveSession}
                      onCancel={onCancelLiveSession}
                      onDelete={onDeleteLiveSession}
                    />
                  ))}
                  {unit.content.length === 0 && unit.sessions.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-6 border border-dashed rounded-lg">
                      أضف درسًا أو اختبارًا أو واجبًا لهذه الوحدة
                    </div>
                  )}
                </div>
              </SortableContext>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={onAddLesson}>
                  <Plus className="w-4 h-4 ml-1" />
                  درس
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddQuiz}
                  className="border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  <ClipboardList className="w-4 h-4 ml-1" />
                  اختبار
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddAssignment}
                  className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
                >
                  <ClipboardCheck className="w-4 h-4 ml-1" />
                  واجب
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddLiveSession}
                  className="border-primary/40 text-primary hover:bg-primary/10"
                >
                  <Radio className="w-4 h-4 ml-1" />
                  جلسة مباشرة
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------- Main ----------
const CourseBuilder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState<Course | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [unitModalOpen, setUnitModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [deletingUnit, setDeletingUnit] = useState<Unit | null>(null);

  const [lessonModalOpen, setLessonModalOpen] = useState(false);
  const [lessonUnitId, setLessonUnitId] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<LessonRecord | null>(null);
  const [deletingLesson, setDeletingLesson] = useState<LessonRecord | null>(null);

  const [quizWizardOpen, setQuizWizardOpen] = useState(false);
  const [quizUnitId, setQuizUnitId] = useState<string | null>(null);
  const [editingQuiz, setEditingQuiz] = useState<QuizRecord | null>(null);
  const [deletingQuiz, setDeletingQuiz] = useState<QuizRecord | null>(null);

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentUnitId, setAssignmentUnitId] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<AssignmentRecord | null>(null);
  const [deletingAssignment, setDeletingAssignment] = useState<AssignmentRecord | null>(null);

  const [publishOpen, setPublishOpen] = useState(false);

  // ---- Live sessions (Phase 1) ----
  const [sessions, setSessions] = useState<AdminSessionView[]>([]);
  const [sessionModalOpen, setSessionModalOpen] = useState(false);
  const [sessionTarget, setSessionTarget] = useState<LiveSessionFormTarget>({ unitId: null });
  const [cancellingSession, setCancellingSession] = useState<AdminSessionView | null>(null);
  const [deletingSession, setDeletingSession] = useState<AdminSessionView | null>(null);

  const [activeDrag, setActiveDrag] = useState<
    | { type: "unit"; unit: Unit }
    | { type: "lesson"; lesson: LessonRecord }
    | { type: "quiz"; quiz: QuizRecord }
    | { type: "assignment"; assignment: AssignmentRecord }
    | null
  >(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const markSaving = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    setSaveState("saving");
    try {
      const r = await fn();
      setSaveState("saved");
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      return r;
    } catch (e: any) {
      setSaveState("idle");
      toast.error(e?.message || "فشل الحفظ");
      throw e;
    }
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: c, error: cErr } = await supabase
      .from("courses")
      .select("id, title, status, scheduled_publish_at, course_type")
      .eq("id", id)
      .maybeSingle();

    if (cErr || !c) {
      toast.error("لم يتم العثور على الدورة");
      navigate("/admin/courses");
      return;
    }
    setCourse(c as Course);

    const [{ data: u }, { data: qz }, { data: asg }, { data: liveRows }] = await Promise.all([
      supabase
        .from("units")
        .select(
          "id, title, description, position, lessons(id, title, description, video_provider, video_url, unit_id, position, unlock_quiz_id)",
        )
        .eq("course_id", id)
        .order("position"),
      supabase
        .from("quizzes")
        .select("*")
        .eq("course_id", id),
      (supabase as any)
        .from("assignments")
        .select("*")
        .eq("course_id", id),
      (supabase as any)
        .from("live_sessions")
        .select(
          "id, course_id, unit_id, title, scheduled_start_at, duration_minutes, status, host_user_id, link_version, position, recording_enabled",
        )
        .eq("course_id", id)
        .order("scheduled_start_at"),
    ]);

    const { data: hostRows } = await (supabase as any)
      .from("profiles")
      .select("id, full_name")
      .in(
        "id",
        Array.from(
          new Set(((liveRows ?? []) as any[]).map((r) => r.host_user_id).filter(Boolean)),
        ).length
          ? Array.from(
              new Set(((liveRows ?? []) as any[]).map((r) => r.host_user_id).filter(Boolean)),
            )
          : ["00000000-0000-0000-0000-000000000000"],
      );
    const hostName = new Map<string, string | null>(
      ((hostRows ?? []) as any[]).map((h) => [h.id, h.full_name]),
    );
    const liveSessions: AdminSessionView[] = ((liveRows ?? []) as any[]).map((r) => ({
      ...(r as AdminSessionView),
      host_name: hostName.get(r.host_user_id) ?? null,
    }));
    setSessions(liveSessions);

    const quizzesByUnit = new Map<string, QuizRecord[]>();
    (qz ?? []).forEach((q: any) => {
      const arr = quizzesByUnit.get(q.unit_id) ?? [];
      arr.push(q as QuizRecord);
      quizzesByUnit.set(q.unit_id, arr);
    });

    const assignmentsByUnit = new Map<string, AssignmentRecord[]>();
    (asg ?? []).forEach((a: any) => {
      const arr = assignmentsByUnit.get(a.unit_id) ?? [];
      arr.push(a as AssignmentRecord);
      assignmentsByUnit.set(a.unit_id, arr);
    });

    const mapped: Unit[] = (u ?? []).map((row: any) => {
      const lessonItems: ContentItem[] = (row.lessons ?? []).map((l: any) => ({
        kind: "lesson" as const,
        id: l.id,
        order: l.position,
        lesson: l as LessonRecord,
      }));
      const quizItems: ContentItem[] = (quizzesByUnit.get(row.id) ?? []).map((q) => ({
        kind: "quiz" as const,
        id: q.id,
        order: q.order_index,
        quiz: q,
      }));
      const assignmentItems: ContentItem[] = (assignmentsByUnit.get(row.id) ?? []).map((a) => ({
        kind: "assignment" as const,
        id: a.id,
        order: a.order_index,
        assignment: a,
      }));
      const content = [...lessonItems, ...quizItems, ...assignmentItems].sort(
        (a, b) => a.order - b.order,
      );
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        position: row.position,
        content,
        sessions: liveSessions
          .filter((s) => s.unit_id === row.id && s.status !== "cancelled")
          .sort((a, b) => a.position - b.position),
      };
    });
    setUnits(mapped);
    setExpanded((prev) => {
      const next = { ...prev };
      mapped.forEach((u) => {
        if (!(u.id in next)) next[u.id] = true;
      });
      return next;
    });
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Unit CRUD ----
  const saveUnit = async (values: UnitFormValues) => {
    await markSaving(async () => {
      if (editingUnit) {
        const { error } = await supabase
          .from("units")
          .update({ title: values.title, description: values.description || null })
          .eq("id", editingUnit.id);
        if (error) throw error;
      } else {
        const position = units.length;
        const { error } = await supabase.from("units").insert({
          course_id: id!,
          title: values.title,
          description: values.description || null,
          position,
        });
        if (error) throw error;
      }
    });
    await load();
    setEditingUnit(null);
  };

  const deleteUnit = async () => {
    if (!deletingUnit) return;
    await markSaving(async () => {
      const { error } = await supabase.from("units").delete().eq("id", deletingUnit.id);
      if (error) throw error;
    });
    setDeletingUnit(null);
    load();
  };

  const deleteLesson = async () => {
    if (!deletingLesson) return;
    await markSaving(async () => {
      // Remove files from storage first
      const { data: files } = await supabase
        .from("lesson_files")
        .select("file_url")
        .eq("lesson_id", deletingLesson.id);
      if (files?.length) {
        await supabase.storage
          .from("lesson-files")
          .remove(files.map((f: any) => f.file_url));
      }
      const { error } = await supabase.from("lessons").delete().eq("id", deletingLesson.id);
      if (error) throw error;
    });
    setDeletingLesson(null);
    load();
  };

  // ---- Drag & drop (content items share same order sequence) ----
  type ContentKind = "lesson" | "quiz" | "assignment";
  const findUnitByContentId = (kind: ContentKind, itemId: string) =>
    units.find((u) => u.content.some((c) => c.kind === kind && c.id === itemId));

  const parseDragId = (
    raw: string,
  ): { kind: ContentKind | "unit"; id: string } | null => {
    if (raw.startsWith("lesson:")) return { kind: "lesson", id: raw.slice(7) };
    if (raw.startsWith("quiz:")) return { kind: "quiz", id: raw.slice(5) };
    if (raw.startsWith("assignment:")) return { kind: "assignment", id: raw.slice(11) };
    if (raw.startsWith("unit:")) return { kind: "unit", id: raw.slice(5) };
    return null;
  };

  const onDragStart = (e: DragStartEvent) => {
    const data = e.active.data.current as any;
    if (data?.type === "unit") {
      const unit = units.find((u) => `unit:${u.id}` === e.active.id);
      if (unit) setActiveDrag({ type: "unit", unit });
    } else if (data?.type === "lesson") {
      setActiveDrag({ type: "lesson", lesson: data.lesson });
    } else if (data?.type === "quiz") {
      setActiveDrag({ type: "quiz", quiz: data.quiz });
    } else if (data?.type === "assignment") {
      setActiveDrag({ type: "assignment", assignment: data.assignment });
    }
  };

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as any;
    if (
      activeData?.type !== "lesson" &&
      activeData?.type !== "quiz" &&
      activeData?.type !== "assignment"
    )
      return;

    const parsedActive = parseDragId(String(active.id));
    const parsedOver = parseDragId(String(over.id));
    if (!parsedActive || parsedActive.kind === "unit") return;

    const activeUnit = findUnitByContentId(parsedActive.kind, parsedActive.id);
    if (!activeUnit) return;

    let targetUnitId: string | null = null;
    if (parsedOver?.kind === "unit") {
      targetUnitId = parsedOver.id;
    } else if (parsedOver) {
      const overUnit = findUnitByContentId(parsedOver.kind, parsedOver.id);
      targetUnitId = overUnit?.id ?? null;
    }
    if (!targetUnitId || targetUnitId === activeUnit.id) return;

    setUnits((prev) => {
      const from = prev.find((u) => u.id === activeUnit.id);
      const to = prev.find((u) => u.id === targetUnitId);
      if (!from || !to) return prev;
      const item = from.content.find(
        (c) => c.kind === parsedActive.kind && c.id === parsedActive.id,
      );
      if (!item) return prev;
      let movedItem: ContentItem;
      if (item.kind === "lesson") {
        movedItem = { ...item, lesson: { ...item.lesson, unit_id: to.id } };
      } else if (item.kind === "quiz") {
        movedItem = { ...item, quiz: { ...item.quiz, unit_id: to.id } };
      } else {
        movedItem = {
          ...item,
          assignment: { ...item.assignment, unit_id: to.id },
        };
      }
      return prev.map((u) => {
        if (u.id === from.id)
          return {
            ...u,
            content: u.content.filter(
              (c) => !(c.kind === parsedActive.kind && c.id === parsedActive.id),
            ),
          };
        if (u.id === to.id) return { ...u, content: [...u.content, movedItem] };
        return u;
      });
    });
  };

  const persistOrder = async (nextUnits: Unit[]) => {
    await markSaving(async () => {
      const ops: Promise<any>[] = [];
      nextUnits.forEach((u, i) => {
        ops.push(
          Promise.resolve(
            supabase.from("units").update({ position: i }).eq("id", u.id),
          ),
        );
        u.content.forEach((c, idx) => {
          if (c.kind === "lesson") {
            ops.push(
              Promise.resolve(
                supabase
                  .from("lessons")
                  .update({ position: idx, unit_id: u.id })
                  .eq("id", c.id),
              ),
            );
          } else if (c.kind === "quiz") {
            ops.push(
              Promise.resolve(
                supabase
                  .from("quizzes")
                  .update({ order_index: idx, unit_id: u.id })
                  .eq("id", c.id),
              ),
            );
          } else {
            ops.push(
              Promise.resolve(
                (supabase as any)
                  .from("assignments")
                  .update({ order_index: idx, unit_id: u.id })
                  .eq("id", c.id),
              ),
            );
          }
        });
      });
      const results = await Promise.all(ops);
      const err = results.find((r: any) => r.error)?.error;
      if (err) throw err;
    });
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = e;
    if (!over) return;
    const activeData = active.data.current as any;

    if (activeData?.type === "unit") {
      const oldIdx = units.findIndex((u) => `unit:${u.id}` === active.id);
      const newIdx = units.findIndex((u) => `unit:${u.id}` === over.id);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      const next = arrayMove(units, oldIdx, newIdx);
      setUnits(next);
      await persistOrder(next);
      return;
    }

    if (
      activeData?.type === "lesson" ||
      activeData?.type === "quiz" ||
      activeData?.type === "assignment"
    ) {
      const parsedActive = parseDragId(String(active.id));
      if (!parsedActive || parsedActive.kind === "unit") return;

      const activeUnit = findUnitByContentId(parsedActive.kind, parsedActive.id);
      if (!activeUnit) return;

      let next = [...units];
      const parsedOver = parseDragId(String(over.id));
      if (parsedOver && parsedOver.kind !== "unit") {
        const overUnit = findUnitByContentId(parsedOver.kind, parsedOver.id);
        if (overUnit && overUnit.id === activeUnit.id) {
          const oldIdx = activeUnit.content.findIndex(
            (c) => c.kind === parsedActive.kind && c.id === parsedActive.id,
          );
          const newIdx = activeUnit.content.findIndex(
            (c) => c.kind === parsedOver.kind && c.id === parsedOver.id,
          );
          if (oldIdx !== newIdx && oldIdx >= 0 && newIdx >= 0) {
            next = units.map((u) =>
              u.id === activeUnit.id
                ? { ...u, content: arrayMove(u.content, oldIdx, newIdx) }
                : u,
            );
            setUnits(next);
          }
        }
      }
      await persistOrder(next);
    }
  };

  // ---- Lifecycle change (draft / coming_soon / published) ----
  const [scheduleDraft, setScheduleDraft] = useState<string>("");
  const changeLifecycle = async (
    next: "draft" | "coming_soon" | "published",
    scheduledAt: string | null = null,
  ) => {
    if (!course) return;
    await markSaving(async () => {
      const patch: any = { status: next };
      if (next === "coming_soon") {
        patch.scheduled_publish_at = scheduledAt;
      } else {
        patch.scheduled_publish_at = null;
      }
      const { error } = await supabase
        .from("courses")
        .update(patch)
        .eq("id", course.id);
      if (error) throw error;
    });
    setCourse({ ...course, status: next, scheduled_publish_at: scheduledAt });
    setPublishOpen(false);
    toast.success(
      next === "published"
        ? "تم نشر الدورة"
        : next === "coming_soon"
          ? "تم ضبط الدورة كـ (قريبًا)"
          : "تم إرجاعها كمسودة",
    );
  };


  const openAddLesson = (unitId: string) => {
    setLessonUnitId(unitId);
    setEditingLesson(null);
    setLessonModalOpen(true);
  };
  const openEditLesson = (lesson: LessonRecord) => {
    setLessonUnitId(lesson.unit_id);
    setEditingLesson(lesson);
    setLessonModalOpen(true);
  };
  const openAddQuiz = (unitId: string) => {
    setQuizUnitId(unitId);
    setEditingQuiz(null);
    setQuizWizardOpen(true);
  };
  const openEditQuiz = (quiz: QuizRecord) => {
    setQuizUnitId(quiz.unit_id);
    setEditingQuiz(quiz);
    setQuizWizardOpen(true);
  };
  const deleteQuiz = async () => {
    if (!deletingQuiz) return;
    await markSaving(async () => {
      const { error } = await supabase.from("quizzes").delete().eq("id", deletingQuiz.id);
      if (error) throw error;
    });
    setDeletingQuiz(null);
    load();
  };

  const openAddAssignment = (unitId: string) => {
    setAssignmentUnitId(unitId);
    setEditingAssignment(null);
    setAssignmentModalOpen(true);
  };
  const openEditAssignment = (assignment: AssignmentRecord) => {
    setAssignmentUnitId(assignment.unit_id);
    setEditingAssignment(assignment);
    setAssignmentModalOpen(true);
  };
  // ---- Live session handlers ----
  const openNewLiveSession = (unitId: string | null, createUnitTitle?: string) => {
    setSessionTarget({ unitId, createUnitTitle: createUnitTitle ?? null });
    setSessionModalOpen(true);
  };

  const openEditLiveSession = (session: AdminSessionView) => {
    setSessionTarget({ unitId: session.unit_id, row: session });
    setSessionModalOpen(true);
  };

  const confirmCancelSession = async () => {
    if (!cancellingSession) return;
    try {
      await cancelLiveSession(cancellingSession.id);
      toast.success("تم إلغاء الجلسة");
    } catch (e) {
      toast.error(liveErrorMessage(e instanceof Error ? e.message : null));
    } finally {
      setCancellingSession(null);
      load();
    }
  };

  const confirmDeleteSession = async () => {
    if (!deletingSession) return;
    try {
      await deleteLiveSession(deletingSession.id);
      toast.success("تم حذف الجلسة");
    } catch (e) {
      toast.error(liveErrorMessage(e instanceof Error ? e.message : null));
    } finally {
      setDeletingSession(null);
      load();
    }
  };

  const deleteAssignment = async () => {
    if (!deletingAssignment) return;
    await markSaving(async () => {
      const { data: files } = await (supabase as any)
        .from("assignment_files")
        .select("file_url")
        .eq("assignment_id", deletingAssignment.id);
      if (files?.length) {
        await supabase.storage
          .from("assignment-files")
          .remove(files.map((f: any) => f.file_url));
      }
      const { error } = await (supabase as any)
        .from("assignments")
        .delete()
        .eq("id", deletingAssignment.id);
      if (error) throw error;
    });
    setDeletingAssignment(null);
    load();
  };

  const nextLessonPosition = useMemo(() => {
    if (!lessonUnitId) return 0;
    const u = units.find((x) => x.id === lessonUnitId);
    return u?.content.length ?? 0;
  }, [units, lessonUnitId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!course) return null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <Link
          to="/admin/courses"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowRight className="w-4 h-4" />
          العودة إلى الدورات
        </Link>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground truncate">
                {course.title}
              </h1>
              <Badge
                className={
                  course.status === "published"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0"
                    : course.status === "coming_soon"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-0"
                      : "bg-muted text-muted-foreground border-0"
                }
              >
                {course.status === "published"
                  ? "منشورة"
                  : course.status === "coming_soon"
                    ? "قريبًا"
                    : "مسودة"}
              </Badge>
              <SaveIndicator state={saveState} />
            </div>
            <p className="text-muted-foreground text-sm mt-1">
              نظّم وحدات ودروس الدورة، والسحب لإعادة الترتيب.
            </p>
          </div>
          <div className="flex flex-col items-stretch md:items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/admin/courses/${course.id}/edit`)}
              >
                <Settings className="w-4 h-4 ml-2" />
                بيانات الدورة
              </Button>
              <div className="inline-flex rounded-lg border border-border overflow-hidden">
                {(
                  [
                    { k: "draft", label: "مسودة" },
                    { k: "coming_soon", label: "قريبًا" },
                    { k: "published", label: "منشورة" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.k}
                    type="button"
                    onClick={() => {
                      if (opt.k === course.status) return;
                      if (opt.k === "coming_soon") {
                        setScheduleDraft(course.scheduled_publish_at ?? "");
                        setPublishOpen(true);
                      } else {
                        changeLifecycle(opt.k);
                      }
                    }}
                    className={
                      "px-3 py-2 text-xs font-bold transition " +
                      (opt.k === course.status
                        ? opt.k === "published"
                          ? "bg-emerald-600 text-white"
                          : opt.k === "coming_soon"
                            ? "bg-amber-500 text-white"
                            : "bg-muted text-foreground"
                        : "bg-transparent hover:bg-accent")
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {course.status === "coming_soon" && (
              <div className="flex items-center gap-2 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
                <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <input
                  type="datetime-local"
                  className="bg-transparent border-0 focus:outline-none text-foreground text-xs"
                  value={
                    course.scheduled_publish_at
                      ? new Date(course.scheduled_publish_at)
                          .toISOString()
                          .slice(0, 16)
                      : ""
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    const iso = v ? new Date(v).toISOString() : null;
                    changeLifecycle("coming_soon", iso);
                  }}
                />
                {course.scheduled_publish_at && (
                  <button
                    type="button"
                    onClick={() => changeLifecycle("coming_soon", null)}
                    className="text-muted-foreground hover:text-destructive"
                    title="إلغاء الجدولة"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

      </motion.div>

      {/* Add unit */}
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-muted-foreground inline-flex items-center gap-2">
          <Info className="w-4 h-4" />
          {units.length} وحدات
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => openNewLiveSession(null, null)}>
            <Radio className="w-4 h-4 ml-2" />
            جدولة جلسة مباشرة
          </Button>
          <Button
            onClick={() => {
              setEditingUnit(null);
              setUnitModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 ml-2" />
            إضافة وحدة
          </Button>
        </div>

      </div>

      {course?.course_type === "live" && (
        <LiveSessionsTimeline
          sessions={sessions}
          courseId={id!}
          onAdd={() => openNewLiveSession(null, null)}
          onEdit={openEditLiveSession}
          onCancel={setCancellingSession}
          onDelete={setDeletingSession}
        />
      )}

      {units.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl border-2 border-dashed border-border/70 bg-card/40 p-12 text-center"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Layers className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">ابدأ ببناء المحتوى</h2>
          <p className="text-muted-foreground mb-5 max-w-md mx-auto">
            أضف الوحدة الأولى، ثم أضف دروسها وارفع الملفات المرفقة بها.
          </p>
          <Button
            size="lg"
            onClick={() => {
              setEditingUnit(null);
              setUnitModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 ml-2" />
            أضف الوحدة الأولى
          </Button>
        </motion.div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={units.map((u) => `unit:${u.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {units.map((u) => (
                <UnitCard
                  key={u.id}
                  unit={u}
                  expanded={!!expanded[u.id]}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [u.id]: !prev[u.id] }))
                  }
                  onEdit={() => {
                    setEditingUnit(u);
                    setUnitModalOpen(true);
                  }}
                  onDelete={() => setDeletingUnit(u)}
                  onAddLesson={() => openAddLesson(u.id)}
                  onAddQuiz={() => openAddQuiz(u.id)}
                  onAddAssignment={() => openAddAssignment(u.id)}
                  onAddLiveSession={() => openNewLiveSession(u.id)}
                  onEditLiveSession={openEditLiveSession}
                  onCancelLiveSession={setCancellingSession}
                  onDeleteLiveSession={setDeletingSession}
                  onEditLesson={openEditLesson}
                  onDeleteLesson={setDeletingLesson}
                  onEditQuiz={openEditQuiz}
                  onDeleteQuiz={setDeletingQuiz}
                  onEditAssignment={openEditAssignment}
                  onDeleteAssignment={setDeletingAssignment}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeDrag?.type === "lesson" ? (
              <LessonItem
                lesson={activeDrag.lesson}
                onEdit={() => {}}
                onDelete={() => {}}
                isOverlay
              />
            ) : activeDrag?.type === "quiz" ? (
              <QuizItem
                quiz={activeDrag.quiz}
                onEdit={() => {}}
                onDelete={() => {}}
                isOverlay
              />
            ) : activeDrag?.type === "assignment" ? (
              <AssignmentItem
                assignment={activeDrag.assignment}
                onEdit={() => {}}
                onDelete={() => {}}
                isOverlay
              />
            ) : activeDrag?.type === "unit" ? (
              <div className="rounded-2xl border border-primary/60 bg-card p-4 shadow-2xl">
                <div className="font-bold">{activeDrag.unit.title}</div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modals */}
      <UnitModal
        open={unitModalOpen}
        onOpenChange={setUnitModalOpen}
        unit={editingUnit}
        onSubmit={saveUnit}
      />

      {lessonUnitId && (
        <LessonModal
          open={lessonModalOpen}
          onOpenChange={(v) => {
            setLessonModalOpen(v);
            if (!v) load();
          }}
          unitId={lessonUnitId}
          lesson={editingLesson}
          nextPosition={nextLessonPosition}
          onSaved={load}
        />
      )}

      {quizUnitId && id && (
        <QuizWizard
          open={quizWizardOpen}
          onOpenChange={(v) => {
            setQuizWizardOpen(v);
            if (!v) load();
          }}
          unitId={quizUnitId}
          courseId={id}
          quiz={editingQuiz}
          onSaved={load}
        />
      )}

      {assignmentUnitId && id && (
        <AssignmentModal
          open={assignmentModalOpen}
          onOpenChange={(v) => {
            setAssignmentModalOpen(v);
            if (!v) load();
          }}
          unitId={assignmentUnitId}
          courseId={id}
          assignment={editingAssignment}
          onSaved={load}
        />
      )}

      {/* Delete assignment */}
      <AlertDialog
        open={!!deletingAssignment}
        onOpenChange={(v) => !v && setDeletingAssignment(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الواجب</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف "{deletingAssignment?.title}" وجميع ملفاته.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteAssignment();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete quiz */}
      <AlertDialog
        open={!!deletingQuiz}
        onOpenChange={(v) => !v && setDeletingQuiz(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الاختبار</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف "{deletingQuiz?.title}" وجميع أسئلته ومحاولات الطلاب.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteQuiz();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      {/* Delete unit */}
      <AlertDialog
        open={!!deletingUnit}
        onOpenChange={(v) => !v && setDeletingUnit(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الوحدة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف "{deletingUnit?.title}" وجميع دروسها وملفاتها.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteUnit();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete lesson */}
      <AlertDialog
        open={!!deletingLesson}
        onOpenChange={(v) => !v && setDeletingLesson(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الدرس</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف "{deletingLesson?.title}" وجميع ملفاته.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteLesson();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Coming Soon schedule dialog */}
      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ضبط الدورة كـ "قريبًا"</AlertDialogTitle>
            <AlertDialogDescription>
              ستظهر الدورة للزوار مع شارة "قريبًا" ولن يتمكّن أحد من التسجيل حتى يتم النشر يدويًا
              أو يحين الموعد المجدول (اختياري).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <label className="text-xs text-muted-foreground mb-1 block">
              موعد النشر التلقائي (اختياري)
            </label>
            <input
              type="datetime-local"
              value={scheduleDraft ? scheduleDraft.slice(0, 16) : ""}
              onChange={(e) => setScheduleDraft(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                const iso = scheduleDraft ? new Date(scheduleDraft).toISOString() : null;
                changeLifecycle("coming_soon", iso);
              }}
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LiveSessionFormModal
        open={sessionModalOpen}
        onOpenChange={setSessionModalOpen}
        courseId={id!}
        target={sessionTarget}
        onSaved={load}
      />

      <AlertDialog
        open={Boolean(cancellingSession)}
        onOpenChange={(v) => !v && setCancellingSession(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الجلسة؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إلغاء اجتماع Zoom وإشعار الطلاب. لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmCancelSession(); }}>
              إلغاء الجلسة
            </AlertDialogAction>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deletingSession)}
        onOpenChange={(v) => !v && setDeletingSession(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الجلسة؟</AlertDialogTitle>
            <AlertDialogDescription>سيتم حذف الجلسة نهائياً.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void confirmDeleteSession(); }}>
              حذف
            </AlertDialogAction>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

const SaveIndicator = ({ state }: { state: SaveState }) => (
  <AnimatePresence mode="wait">
    {state === "saving" && (
      <motion.span
        key="s"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <Loader2 className="w-3 h-3 animate-spin" />
        جارٍ الحفظ...
      </motion.span>
    )}
    {state === "saved" && (
      <motion.span
        key="d"
        initial={{ opacity: 0, x: -6 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0 }}
        className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        تم حفظ التغييرات
      </motion.span>
    )}
  </AnimatePresence>
);

export default CourseBuilder;
