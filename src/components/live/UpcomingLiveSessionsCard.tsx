import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { ar } from "date-fns/locale";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useStudentUpcomingLiveSessions } from "@/hooks/use-live-sessions";
import LiveStatusPill from "./LiveStatusPill";

/** Dashboard widget: next 5 live sessions in the coming week. Renders nothing when empty. */
const UpcomingLiveSessionsCard = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data } = useStudentUpcomingLiveSessions();

  const rows = (data ?? []).filter((s) => s.status !== "cancelled").slice(0, 5);
  if (!rows.length) return null;

  const isAdmin = profile?.role === "admin";

  return (
    <section className="rounded-2xl border border-border/60 bg-card shadow-sm p-5 md:p-6">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Radio className="h-5 w-5 text-primary" />
        الجلسات المباشرة القادمة
      </h2>

      <ul className="mt-4 space-y-3">
        {rows.map((s) => {
          const isLive = s.status === "live";
          const startMs = new Date(s.scheduled_start_at).getTime();
          const isOpen = isLive || startMs <= Date.now();
          return (
            <li key={s.id} className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-muted overflow-hidden shrink-0">
                {s.course_thumbnail_url ? (
                  <img
                    src={s.course_thumbnail_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                    <Radio className="h-5 w-5" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.title}</div>
                <div className="truncate text-xs text-muted-foreground">{s.course_title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <LiveStatusPill status={s.status} size="xs" />
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNowStrict(new Date(s.scheduled_start_at), {
                      addSuffix: true,
                      locale: ar,
                    })}
                  </span>
                </div>
              </div>

              <Button
                size="sm"
                variant={isOpen ? "default" : "outline"}
                onClick={() =>
                  navigate(
                    isAdmin
                      ? `/admin/courses/${s.course_id}/builder`
                      : `/courses/${s.course_id}/learn/live_session/${s.id}`,
                  )
                }
              >
                {isOpen && !isAdmin ? "انضم" : "التفاصيل"}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default UpcomingLiveSessionsCard;
