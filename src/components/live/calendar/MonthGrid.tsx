import { formatCairo } from "@/lib/cairo-time";
import { buildMonthMatrix, cairoDate, cairoDayLabel, sameCairoDate } from "@/lib/calendar";
import { SHORT_DAYS } from "@/lib/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CalendarEvent } from "../LiveCalendar";

const STATUS_CHIP: Record<string, string> = {
  scheduled: "bg-primary/10 text-primary border-primary/30",
  live: "bg-destructive/15 text-destructive border-destructive/30",
  ended: "bg-muted text-muted-foreground border-transparent",
  completed: "bg-muted text-muted-foreground border-transparent",
  cancelled: "bg-muted text-muted-foreground border-transparent line-through",
};

function Chip({ event, onPick }: { event: CalendarEvent; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full text-start rounded-md px-1.5 py-0.5 text-[11px] truncate border ${
        STATUS_CHIP[event.status] ?? STATUS_CHIP.scheduled
      }`}
    >
      <span className="tabular-nums opacity-80">{formatCairo(event.scheduled_start_at, "time")}</span>
      {" · "}
      {event.title}
    </button>
  );
}

interface Props {
  year: number;
  month: number;
  events: CalendarEvent[];
  onPick: (event: CalendarEvent) => void;
}

/** Six-row, Saturday-first month grid. */
const MonthGrid = ({ year, month, events, onPick }: Props) => {
  const matrix = buildMonthMatrix(year, month);
  const today = cairoDate(Date.now());

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border/60 bg-muted/40">
        {SHORT_DAYS.map((d) => (
          <div key={d} className="p-2 text-center text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {matrix.flat().map(({ date, inMonth }) => {
          const key = `${date.year}-${date.month}-${date.day}`;
          const dayEvents = events.filter((e) => sameCairoDate(cairoDate(e.scheduled_start_at), date));
          const isToday = sameCairoDate(today, date);

          return (
            <div
              key={key}
              className={`min-h-[104px] p-1.5 border-border/60 border-t border-e ${
                isToday ? "bg-primary/5" : ""
              }`}
            >
              <div
                className={
                  isToday
                    ? "mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold"
                    : `mb-1 text-xs font-semibold ${
                        inMonth ? "text-foreground" : "text-muted-foreground/60"
                      }`
                }
              >
                {date.day}
              </div>

              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((e) => (
                  <Chip key={e.id} event={e} onPick={() => onPick(e)} />
                ))}

                {dayEvents.length > 3 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full text-start text-[11px] text-muted-foreground hover:underline"
                      >
                        +{dayEvents.length - 3} المزيد
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                      <div className="mb-1 px-1 text-xs font-semibold">{cairoDayLabel(date)}</div>
                      <div className="space-y-1">
                        {dayEvents.map((e) => (
                          <Chip key={e.id} event={e} onPick={() => onPick(e)} />
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthGrid;
