import { cairoParts, formatCairo } from "@/lib/cairo-time";
import { addDays, cairoDate, cairoDayLabel, sameCairoDate, SHORT_DAYS } from "@/lib/calendar";
import type { CalendarEvent } from "../LiveCalendar";

const START_HOUR = 8;
const END_HOUR = 24;
const HOUR_PX = 56; // h-14

const STATUS_BLOCK: Record<string, string> = {
  scheduled: "bg-primary/15 border-primary/40 text-primary",
  live: "bg-destructive/15 border-destructive/40 text-destructive",
  ended: "bg-muted border-transparent text-muted-foreground",
  completed: "bg-muted border-transparent text-muted-foreground",
  cancelled: "bg-muted border-transparent text-muted-foreground line-through",
};

interface Props {
  /** Any Cairo date inside the week; the week is recomputed from it. */
  anchor: { year: number; month: number; day: number };
  events: CalendarEvent[];
  onPick: (event: CalendarEvent) => void;
}

/** Seven columns (Sat→Fri) × hours 08:00–24:00, events positioned to scale. */
const WeekGrid = ({ anchor, events, onPick }: Props) => {
  const anchorStamp = Date.UTC(anchor.year, anchor.month - 1, anchor.day, 12);
  const weekday = (() => {
    const order = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      weekday: "short",
    }).format(new Date(anchorStamp));
    return Math.max(0, order.indexOf(name));
  })();

  const startOfWeek = addDays(anchor, -weekday);
  const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek, i));
  const today = cairoDate(Date.now());
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border/60 bg-muted/40">
          <div />
          {days.map((d) => (
            <div key={`${d.year}-${d.month}-${d.day}`} className="p-2 text-center">
              <div className="text-xs font-semibold text-muted-foreground">{SHORT_DAYS[days.indexOf(d)]}</div>
              <div
                className={`mt-0.5 text-sm font-bold ${
                  sameCairoDate(d, today) ? "text-primary" : "text-foreground"
                }`}
              >
                {d.day}
              </div>
            </div>
          ))}
        </div>

        <div className="relative grid grid-cols-[56px_repeat(7,1fr)]">
          <div>
            {hours.map((h) => (
              <div key={h} className="h-14 border-t border-border/40 pe-2 text-end text-xs text-muted-foreground">
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {days.map((d) => {
            const dayEvents = events.filter((e) => sameCairoDate(cairoDate(e.scheduled_start_at), d));
            return (
              <div key={`${d.year}-${d.month}-${d.day}`} className="relative border-s border-border/40">
                {hours.map((h) => (
                  <div key={h} className="h-14 border-t border-border/40" />
                ))}

                {dayEvents.map((e) => {
                  const p = cairoParts(e.scheduled_start_at);
                  const startMin = (p.hour - START_HOUR) * 60 + p.minute;
                  const top = (startMin / 60) * HOUR_PX;
                  const height = Math.max(22, (e.duration_minutes / 60) * HOUR_PX);
                  if (top < 0 || top > (END_HOUR - START_HOUR) * HOUR_PX) return null;

                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onPick(e)}
                      style={{ top, height }}
                      className={`absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-start text-[11px] ${
                        STATUS_BLOCK[e.status] ?? STATUS_BLOCK.scheduled
                      }`}
                    >
                      <span className="block font-semibold tabular-nums">
                        {formatCairo(e.scheduled_start_at, "time")}
                      </span>
                      <span className="block truncate">{e.title}</span>
                    </button>
                  );
                })}

                {sameCairoDate(d, today) && (
                  <div
                    className="pointer-events-none absolute inset-x-0 border-t-2 border-destructive"
                    style={{
                      top:
                        ((cairoParts(Date.now()).hour - START_HOUR) * 60 +
                          cairoParts(Date.now()).minute) /
                        60 *
                        HOUR_PX,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-3 py-2 text-xs text-muted-foreground">
        {cairoDayLabel(days[0])} — {cairoDayLabel(days[6])}
      </div>
    </div>
  );
};

export default WeekGrid;
