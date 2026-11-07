import { formatCairo } from "@/lib/cairo-time";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import LiveStatusPill from "../LiveStatusPill";
import StartMeetingButton from "../StartMeetingButton";
import type { CalendarEvent } from "../LiveCalendar";
import type { LiveSessionRow } from "@/lib/live-sessions-api";

interface Props {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onEdit?: (session: CalendarEvent) => void;
  onRefresh?: () => void;
}

/** Detail panel for one calendar event. */
const EventSheet = ({ event, open, onOpenChange, isAdmin, onEdit, onRefresh }: Props) => {
  if (!event) return null;

  const asRow: LiveSessionRow = {
    id: event.id,
    course_id: event.course_id,
    unit_id: event.unit_id ?? null,
    title: event.title,
    scheduled_start_at: event.scheduled_start_at,
    duration_minutes: event.duration_minutes,
    status: event.status,
    host_user_id: event.host_user_id ?? "",
    link_version: event.link_version,
    position: 0,
  };

  const isOpen =
    event.status === "live" ||
    (event.status === "scheduled" &&
      Date.now() >= new Date(event.scheduled_start_at).getTime());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-start">{event.title}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3 text-sm">
          <div className="text-muted-foreground">{event.course_title}</div>
          <LiveStatusPill status={event.status} />

          <dl className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">الموعد</dt>
              <dd>{formatCairo(event.scheduled_start_at, "datetime")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">المدة</dt>
              <dd>{event.duration_minutes} دقيقة</dd>
            </div>
            {isAdmin && event.host_name && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">المضيف</dt>
                <dd>{event.host_name}</dd>
              </div>
            )}
            {isAdmin && event.segment_count != null && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">الأجزاء</dt>
                <dd>{event.segment_count}</dd>
              </div>
            )}
            {isAdmin && event.attendee_count != null && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">الحضور</dt>
                <dd>{event.attendee_count}</dd>
              </div>
            )}
          </dl>

          <div className="space-y-2 pt-2">
            {isAdmin ? (
              <>
                <StartMeetingButton session={asRow} onChanged={onRefresh ?? (() => {})} />
                {onEdit && (
                  <Button variant="outline" className="w-full" onClick={() => onEdit(event)}>
                    تعديل
                  </Button>
                )}
                <Button variant="ghost" className="w-full" asChild>
                  <a href={`/admin/courses/${event.course_id}/builder`}>فتح منشئ الدورة</a>
                </Button>
              </>
            ) : (
              <>
                {isOpen && (
                  <Button className="w-full" asChild>
                    <a href={`/courses/${event.course_id}/learn/live_session/${event.id}`}>
                      انضم الآن
                    </a>
                  </Button>
                )}
                <Button variant="outline" className="w-full" asChild>
                  <a href={`/courses/${event.course_id}/learn/live_session/${event.id}`}>
                    فتح صفحة الجلسة
                  </a>
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default EventSheet;
