import { CalendarX, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCairo } from "@/lib/cairo-time";
import { cairoDate, cairoDayLabel } from "@/lib/calendar";
import LiveStatusPill from "../LiveStatusPill";
import type { CalendarEvent } from "../LiveCalendar";

interface Props {
  events: CalendarEvent[];
  isAdmin: boolean;
  onPick: (event: CalendarEvent) => void;
}

/** Grouped list, one heading per Cairo day. */
const AgendaList = ({ events, isAdmin, onPick }: Props) => {
  const sorted = [...events].sort(
    (a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime(),
  );

  const groups = sorted.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const key = cairoDayLabel(cairoDate(e.scheduled_start_at));
    (acc[key] ??= []).push(e);
    return acc;
  }, {});

  if (!sorted.length) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
        <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <CalendarX className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="font-semibold">لا توجد جلسات في هذه الفترة</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([day, list]) => (
        <div key={day} className="space-y-2">
          <div className="text-sm font-semibold">{day}</div>
          <div className="space-y-2">
            {list.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3"
              >
                <span className="rounded-lg bg-primary/10 text-primary p-2">
                  <Radio className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{e.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{e.course_title}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <LiveStatusPill status={e.status} size="xs" />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatCairo(e.scheduled_start_at, "time")} · {e.duration_minutes} دقيقة
                    </span>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => onPick(e)}>
                  {isAdmin ? "التفاصيل" : "التفاصيل"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AgendaList;
