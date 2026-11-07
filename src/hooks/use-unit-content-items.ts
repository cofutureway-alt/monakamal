import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { listUnitQuizzes } from "@/lib/quiz-api";
import { resolveCourseLockState, type CourseLockRow } from "@/lib/course-lock-api";

/**
 * A generic content item that can be a lesson, a quiz, or an assignment.
 * All new types must slot in here — the sidebar, routing, and completion
 * aggregation consume this normalized shape.
 */
export type ContentItemType = "lesson" | "quiz" | "assignment" | "live_session";

export interface ContentItem {
  id: string;
  type: ContentItemType;
  unitId: string;
  title: string;
  orderIndex: number;
  isCompleted: boolean;
  isLocked: boolean;
  lockReason: "ok" | "drip" | "quiz_gate";
  gateQuizTitle: string | null;
  routePath: string;
  extra?: {
    durationMinutes?: number;
    endAt?: string;
    startAt?: string;
    status?: string;
  };
}

export interface ContentUnit {
  id: string;
  title: string;
  position: number;
  items: ContentItem[];
}

export interface UnitContentBundle {
  units: ContentUnit[];
  allItems: ContentItem[];
  totalCount: number;
  completedCount: number;
  percent: number;
}

/**
 * Build the canonical route to a content item within a course.
 * Single pattern used across the whole app.
 */
export function contentRoute(
  courseId: string,
  type: ContentItemType,
  id: string,
): string {
  return `/courses/${courseId}/learn/${type}/${id}`;
}

/**
 * Load the merged, ordered list of content items for an entire course
 * (all units), together with per-item completion status for the current user.
 *
 * Completion rules:
 *  - lesson: has a `lesson_progress` row
 *  - quiz: has ANY `quiz_attempts` row (any status — first attempt marks done)
 *  - assignment: always false in Phase 29 — submission-based completion
 *    is defined in Phase 30/31 and will be wired in there.
 */
export function useCourseContent(courseId: string | undefined) {
  const { user } = useAuth();
  const [data, setData] = useState<UnitContentBundle | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!courseId) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: unitRows } = await supabase
      .from("units")
      .select("id, title, position")
      .eq("course_id", courseId)
      .order("position");
    const uList = (unitRows ?? []) as { id: string; title: string; position: number }[];
    const unitIds = uList.map((u) => u.id);

    // Lessons + quizzes + assignments for these units, in parallel.
    const [lessonsRes, quizzesArrays, assignmentsRes, sessionsRes] = await Promise.all([
      unitIds.length
        ? supabase
            .from("lessons_public")
            .select("id, unit_id, title, position")
            .in("unit_id", unitIds)
        : Promise.resolve({ data: [] as any[] }),
      unitIds.length
        ? Promise.all(unitIds.map((uid) => listUnitQuizzes(uid).catch(() => [])))
        : Promise.resolve([] as any[]),
      unitIds.length
        ? (supabase as any)
            .from("assignments")
            .select("id, unit_id, title, order_index, end_at")
            .in("unit_id", unitIds)
        : Promise.resolve({ data: [] as any[] }),
      unitIds.length
        ? (supabase as any)
            .from("live_sessions")
            .select("id, unit_id, title, position, status, scheduled_start_at, duration_minutes")
            .in("unit_id", unitIds)
            .neq("status", "cancelled")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const lessons = (lessonsRes.data ?? []) as {
      id: string;
      unit_id: string;
      title: string;
      position: number;
    }[];

    const quizzesByUnit = new Map<string, any[]>();
    const allQuizIds: string[] = [];
    unitIds.forEach((uid, i) => {
      const list = (quizzesArrays[i] ?? []) as any[];
      quizzesByUnit.set(uid, list);
      list.forEach((q) => allQuizIds.push(q.id));
    });

    const liveSessions = ((sessionsRes as any).data ?? []) as {
      id: string;
      unit_id: string;
      title: string;
      position: number;
      status: string;
      scheduled_start_at: string;
      duration_minutes: number;
    }[];

    const assignments = ((assignmentsRes as any).data ?? []) as {
      id: string;
      unit_id: string;
      title: string;
      order_index: number;
      end_at: string;
    }[];

    // Completion lookups
    let completedLessonIds = new Set<string>();
    let attemptedQuizIds = new Set<string>();
    let evaluatedAssignmentIds = new Set<string>();
    const assignmentIds = assignments.map((a) => a.id);
    if (user) {
      const [{ data: prog }, attemptsRes, subsRes] = await Promise.all([
        supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("course_id", courseId)
          .eq("user_id", user.id),
        allQuizIds.length
          ? (supabase as any)
              .from("quiz_attempts")
              .select("quiz_id")
              .eq("user_id", user.id)
              .in("quiz_id", allQuizIds)
          : Promise.resolve({ data: [] as any[] }),
        assignmentIds.length
          ? (supabase as any)
              .from("assignment_submissions")
              .select("assignment_id, outcome")
              .eq("user_id", user.id)
              .in("assignment_id", assignmentIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      completedLessonIds = new Set((prog ?? []).map((p: any) => p.lesson_id));
      attemptedQuizIds = new Set(
        ((attemptsRes.data ?? []) as any[]).map((a) => a.quiz_id),
      );
      // Phase 32: an assignment counts as done only when the admin has
      // finalized its outcome (passed OR failed). Ungraded pending
      // submissions do NOT count — the platform can't yet judge them.
      evaluatedAssignmentIds = new Set(
        ((subsRes.data ?? []) as any[])
          .filter((s) => s.outcome === "passed" || s.outcome === "failed")
          .map((s) => s.assignment_id),
      );
    }

    // Fetch server-side lock resolution for this student (if logged in)
    let lockMap = new Map<string, CourseLockRow>();
    if (user) {
      try {
        const rows = await resolveCourseLockState(courseId, user.id);
        rows.forEach((r) => lockMap.set(`${r.item_type}-${r.item_id}`, r));
      } catch {
        // If RPC fails, treat everything as unlocked
      }
    }
    const lockOf = (type: ContentItemType, id: string) => {
      const r = lockMap.get(`${type}-${id}`);
      return {
        isLocked: r?.is_locked ?? false,
        lockReason: (r?.reason ?? "ok") as ContentItem["lockReason"],
        gateQuizTitle: r?.gate_quiz_title ?? null,
      };
    };

    const units: ContentUnit[] = uList.map((u) => {
      const uLessons: ContentItem[] = lessons
        .filter((l) => l.unit_id === u.id)
        .map((l) => ({
          id: l.id,
          type: "lesson" as const,
          unitId: u.id,
          title: l.title,
          orderIndex: l.position,
          isCompleted: completedLessonIds.has(l.id),
          ...lockOf("lesson", l.id),
          routePath: contentRoute(courseId, "lesson", l.id),
        }));
      const uQuizzes: ContentItem[] = (quizzesByUnit.get(u.id) ?? []).map((q: any) => ({
        id: q.id,
        type: "quiz" as const,
        unitId: u.id,
        title: q.title,
        orderIndex: q.order_index,
        isCompleted: attemptedQuizIds.has(q.id),
        ...lockOf("quiz", q.id),
        routePath: contentRoute(courseId, "quiz", q.id),
        extra: { durationMinutes: q.duration_minutes },
      }));
      const uAssignments: ContentItem[] = assignments
        .filter((a) => a.unit_id === u.id)
        .map((a) => ({
          id: a.id,
          type: "assignment" as const,
          unitId: u.id,
          title: a.title,
          orderIndex: a.order_index,
          isCompleted: evaluatedAssignmentIds.has(a.id),
          ...lockOf("assignment", a.id),
          routePath: contentRoute(courseId, "assignment", a.id),
          extra: { endAt: a.end_at },
        }));
      // Live sessions interleave with lessons by `position`, same ordering rule.
      const uSessions: ContentItem[] = liveSessions
        .filter((ls) => ls.unit_id === u.id)
        .map((ls) => ({
          id: ls.id,
          type: "live_session" as const,
          unitId: u.id,
          title: ls.title,
          orderIndex: ls.position,
          isCompleted: ls.status === "completed",
          isLocked: false,
          lockReason: "ok" as const,
          gateQuizTitle: null,
          routePath: contentRoute(courseId, "live_session", ls.id),
          extra: {
            startAt: ls.scheduled_start_at,
            status: ls.status,
            durationMinutes: ls.duration_minutes,
          },
        }));
      const items = [...uLessons, ...uQuizzes, ...uAssignments, ...uSessions].sort(
        (a, b) => a.orderIndex - b.orderIndex,
      );
      return { id: u.id, title: u.title, position: u.position, items };
    });

    const allItems = units.flatMap((u) => u.items);
    const totalCount = allItems.length;
    const completedCount = allItems.filter((it) => it.isCompleted).length;
    const percent = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

    setData({ units, allItems, totalCount, completedCount, percent });
    setLoading(false);
  }, [courseId, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}
