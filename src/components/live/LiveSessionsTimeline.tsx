import { useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCairo } from "@/lib/cairo-time";
import type { AdminSessionView } from "./LiveSessionAdminCard";
import LiveSessionAdminCard from "./LiveSessionAdminCard";

interface Props {
  sessions: AdminSessionView[];
  courseId: string;
  onAdd: () => void;
  onEdit: (session: AdminSessionView) => void;
  onCancel: (session: AdminSessionView) => void;
  onDelete: (session: AdminSessionView) => void;
}

const DOT_COLOR: Record<string, string> = {
  scheduled: "bg-primary",
  live: "bg-destructive",
  ended: "bg-muted-foreground",
  completed: "bg-secondary-foreground",
  cancelled: "bg-muted-foreground",
};

/** Chronological timeline of every session in a live course, grouped by Cairo month. */
const LiveSessionsTimeline = ({ sessions, courseId, onAdd, onEdit, onCancel, onDelete }: Props) => {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime(),
  );

  const groups = sorted.reduce<Record<string, AdminSessionView[]>>((acc, s) => {
    const key = formatCairo(s.scheduled_start_at, "monthYear");
    (acc[key] ??= []).push(s);
    return acc;
  }, {});

  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">الجلسات المباشرة</h2>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" /> إضافة جلسة
        </Button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-10">
          <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <CalendarPlus className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="font-semibold">لا توجد جلسات بعد</div>
          <p className="text-sm text-muted-foreground">أضف أول جلسة مباشرة لهذه الدورة</p>
          <Button className="mt-4" onClick={onAdd}>
            إضافة جلسة
          </Button>
        </div>
      ) : (
        <div className="border-s-2 border-border ps-4 space-y-5">
          {Object.entries(groups).map(([month, list]) => (
            <div key={month} className="space-y-3">
              <div className="text-sm font-semibold text-muted-foreground">{month}</div>
              {list.map((s) => (
                <div key={s.id} className="relative">
                  <span
                    className={`absolute -start-[22px] top-5 h-3 w-3 rounded-full ${
                      DOT_COLOR[s.status] ?? "bg-border"
                    }`}
                  />
                  <LiveSessionAdminCard
                    session={s}
                    courseId={courseId}
                    onEdit={onEdit}
                    onCancel={onCancel}
                    onDelete={onDelete}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default LiveSessionsTimeline;
