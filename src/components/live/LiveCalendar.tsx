import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCairo } from "@/lib/cairo-time";
import {
  addDays,
  addMonths,
  buildMonthMatrix,
  cairoDate,
  cairoKey,
  cairoWeekdayIndex,
  type CairoDate,
} from "@/lib/calendar";
import {
  listAdminRange,
  listStudentRange,
  type LiveSessionStatus,
} from "@/lib/live-sessions-api";
import MonthGrid from "./calendar/MonthGrid";
import WeekGrid from "./calendar/WeekGrid";
import AgendaList from "./calendar/AgendaList";
import EventSheet from "./calendar/EventSheet";

export interface CalendarEvent {
  id: string;
  course_id: string;
  course_title: string;
  title: string;
  scheduled_start_at: string;
  duration_minutes: number;
  status: LiveSessionStatus;
  link_version: number;
  unit_id?: string | null;
  host_user_id?: string;
  host_name?: string | null;
  segment_count?: number;
  attendee_count?: number;
}

type View = "month" | "week" | "list";
const VIEW_KEY = "live-calendar-view";

function readView(): View | null {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "month" || v === "week" || v === "list" ? v : null;
  } catch {
    return null;
  }
}

function defaultView(): View {
  if (typeof window === "undefined") return "month";
  return window.innerWidth < 768 ? "list" : "month";
}

interface Props {
  mode: "student" | "admin";
  /** Admin filters + editor hooks. */
  onEdit?: (session: CalendarEvent) => void;
  hostOptions?: { user_id: string; full_name: string | null }[];
  courseOptions?: { id: string; title: string }[];
}

/** Shared month / week / agenda calendar for both roles. */
const LiveCalendar = ({ mode, onEdit, hostOptions, courseOptions }: Props) => {
  const isAdmin = mode === "admin";
  const [view, setView] = useState<View>(() => readView() ?? defaultView());
  const [anchor, setAnchor] = useState<CairoDate>(() => cairoDate(Date.now()));
  const [course, setCourse] = useState<string>("all");
  const [host, setHost] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [picked, setPicked] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage may be unavailable; the view still works for this session */
    }
  }, [view]);

  // The queried window is the visible one, rounded to whole Cairo days.
  const range = useMemo(() => {
    if (view === "month") {
      const matrix = buildMonthMatrix(anchor.year, anchor.month);
      const first = matrix[0][0].date;
      const last = matrix[5][6].date;
      return { from: first, to: last };
    }
    if (view === "week") {
      const first = addDays(anchor, -cairoWeekdayIndex(Date.UTC(anchor.year, anchor.month - 1, anchor.day, 12)));
      return { from: first, to: addDays(first, 6) };
    }
    // Agenda: 30 days from today.
    const today = cairoDate(Date.now());
    return { from: today, to: addDays(today, 30) };
  }, [view, anchor.year, anchor.month, anchor.day]);

  const fromIso = useMemo(() => {
    const d = range.from;
    return new Date(Date.UTC(d.year, d.month - 1, d.day, 0, 0, 0)).toISOString();
  }, [cairoKey(range.from)]);

  const toIso = useMemo(() => {
    const d = range.to;
    return new Date(Date.UTC(d.year, d.month - 1, d.day, 23, 59, 59)).toISOString();
  }, [cairoKey(range.to)]);

  const query = useQuery<CalendarEvent[]>({
    // Stable keys: Cairo day strings, never raw timestamps.
    queryKey: [
      "live-calendar",
      mode,
      cairoKey(range.from),
      cairoKey(range.to),
      course,
      host,
      status,
    ],
    queryFn: async () => {
      if (isAdmin) {
        const rows = await listAdminRange(fromIso, toIso, {
          course: course === "all" ? null : course,
          host: host === "all" ? null : host,
          status: status === "all" ? null : status,
        });
        return rows as unknown as CalendarEvent[];
      }
      const rows = await listStudentRange(fromIso, toIso);
      return rows as unknown as CalendarEvent[];
    },
    staleTime: 60_000,
  });

  const events = query.data ?? [];
  const title =
    view === "month"
      ? formatCairo(Date.UTC(anchor.year, anchor.month - 1, 15), "monthYear")
      : view === "week"
        ? `${range.from.day} – ${range.to.day} ${formatCairo(
            Date.UTC(anchor.year, anchor.month - 1, 15),
            "monthYear",
          )}`
        : "القادم خلال 30 يوماً";

  const step = (dir: -1 | 1) => {
    if (view === "month") setAnchor((a) => addMonths(a, dir));
    else if (view === "week") setAnchor((a) => addDays(a, dir * 7));
    else setAnchor(cairoDate(Date.now()));
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-[var(--live-banner-h,0px)] z-20 -mx-1 flex flex-wrap items-center gap-2 bg-background/95 px-1 py-2 backdrop-blur">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="السابق" onClick={() => step(-1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="التالي" onClick={() => step(1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={() => setAnchor(cairoDate(Date.now()))}>
            اليوم
          </Button>
        </div>

        <div className="text-sm font-semibold md:text-base">{title}</div>

        <div className="ms-auto">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            size="sm"
          >
            <ToggleGroupItem value="month">شهر</ToggleGroupItem>
            <ToggleGroupItem value="week">أسبوع</ToggleGroupItem>
            <ToggleGroupItem value="list">قائمة</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {courseOptions && (
            <Select value={course} onValueChange={setCourse}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="الدورة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الدورات</SelectItem>
                {courseOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hostOptions && (
            <Select value={host} onValueChange={setHost}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="المضيف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المضيفين</SelectItem>
                {hostOptions.map((h) => (
                  <SelectItem key={h.user_id} value={h.user_id}>
                    {h.full_name ?? h.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="scheduled">مجدولة</SelectItem>
              <SelectItem value="live">مباشر</SelectItem>
              <SelectItem value="ended">انتهت</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {query.isLoading ? (
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      ) : view === "month" ? (
        <MonthGrid
          year={anchor.year}
          month={anchor.month}
          events={events}
          onPick={setPicked}
        />
      ) : view === "week" ? (
        <WeekGrid anchor={anchor} events={events} onPick={setPicked} />
      ) : (
        <AgendaList events={events} isAdmin={isAdmin} onPick={setPicked} />
      )}

      <EventSheet
        event={picked}
        open={Boolean(picked)}
        onOpenChange={(v) => !v && setPicked(null)}
        isAdmin={isAdmin}
        onEdit={onEdit}
        onRefresh={() => void query.refetch()}
      />
    </div>
  );
};

export default LiveCalendar;
