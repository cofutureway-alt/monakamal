import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Copy, Download, FileText, Loader2, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useLiveSessionState } from "@/hooks/use-live-sessions";
import {
  getLiveSessionJoin,
  LiveSessionError,
  liveErrorMessage,
  type LiveSessionFileMeta,
} from "@/lib/live-sessions-api";
import { countdown, formatCairo, serverNow, serverOffsetMs } from "@/lib/cairo-time";
import { buildLiveSessionIcs, downloadIcs } from "@/lib/ics";
import LiveStatusPill from "./LiveStatusPill";
import CountdownTiles from "./CountdownTiles";

interface Props {
  sessionId: string;
  courseId: string;
  courseTitle?: string;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
}

function FileRow({ file }: { file: LiveSessionFileMeta }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{file.file_name}</div>
        <div className="text-xs text-muted-foreground">{formatSize(file.file_size)}</div>
      </div>
      {file.allow_download && (
        <Button variant="outline" size="sm" asChild>
          <a href={file.storage_path} target="_blank" rel="noopener noreferrer" download>
            <Download className="h-4 w-4" />
          </a>
        </Button>
      )}
    </div>
  );
}

/**
 * Student-facing panel for one live session. All unlock decisions come from the
 * server (`can_join` + `server_now`); the local clock only drives the countdown.
 */
const LiveSessionPanel = ({ sessionId, courseId, courseTitle }: Props) => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const { data, isLoading, error } = useLiveSessionState(sessionId);

  const [, setTick] = useState(0);
  const [joining, setJoining] = useState(false);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  const [autoDialogOpen, setAutoDialogOpen] = useState(false);
  const autoShownFor = useRef<string | null>(null);

  // 1 s tick keeps the countdown alive without a server round-trip.
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const offset = useMemo(
    () => (data ? serverOffsetMs(data.server_now) : 0),
    [data?.server_now],
  );

  const serverNowMs = serverNow(offset);
  const cd = data ? countdown(data.scheduled_start_at, serverNowMs) : null;

  const openNow =
    Boolean(data?.can_join) && data?.status !== "cancelled" && data?.status !== "ended";

  // Auto-open the "session started" dialog once per link_version.
  useEffect(() => {
    if (!openNow || !data) return;
    const key = `live-join-dialog:${data.id}:${data.link_version}`;
    if (autoShownFor.current === key) return;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    autoShownFor.current = key;
    setAutoDialogOpen(true);
  }, [openNow, data?.id, data?.link_version]);

  const join = async () => {
    setJoining(true);
    setBlockedUrl(null);
    try {
      const payload = await getLiveSessionJoin(sessionId);
      const win = window.open(payload.join_url, "_blank", "noopener,noreferrer");
      if (!win) setBlockedUrl(payload.join_url);
      setAutoDialogOpen(false);
    } catch (e) {
      const code = e instanceof LiveSessionError ? e.code : "UNKNOWN";
      toast.error(liveErrorMessage(code));
    } finally {
      setJoining(false);
    }
  };

  const addToCalendar = () => {
    if (!data) return;
    const platformUrl = `${window.location.origin}/courses/${courseId}/learn/live_session/${data.id}`;
    const ics = buildLiveSessionIcs({
      uid: `${data.id}@miss-mona-kamel.com`,
      title: data.title,
      description: data.description,
      startAt: data.scheduled_start_at,
      durationMinutes: data.duration_minutes,
      url: platformUrl,
    });
    downloadIcs(`live-session-${data.id}`, ics);
  };

  const copyTime = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(formatCairo(data.scheduled_start_at, "datetime"));
      toast.success("تم نسخ الموعد");
    } catch {
      toast.error("تعذّر النسخ");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto rounded-2xl border border-border/60 bg-card p-8 text-center">
        <p className="text-muted-foreground">
          {liveErrorMessage(error instanceof LiveSessionError ? error.code : null)}
        </p>
      </div>
    );
  }

  const urgent = Boolean(cd && cd.totalMs > 0 && cd.totalMs <= 10 * 60_000);

  return (
    <div className="max-w-3xl mx-auto space-y-4" dir="rtl">
      <section className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-accent/10 p-5 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{data.title}</h1>
            {courseTitle && (
              <p className="text-sm text-muted-foreground truncate">{courseTitle}</p>
            )}
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarClock className="h-4 w-4" />
              {formatCairo(data.scheduled_start_at, "datetime")} · {data.duration_minutes} دقيقة
            </p>
          </div>
          <LiveStatusPill status={data.status} />
        </div>

        {data.description && (
          <p className="text-sm text-muted-foreground whitespace-pre-line">{data.description}</p>
        )}

        {data.status === "cancelled" ? (
          <div className="rounded-xl bg-muted px-4 py-6 text-center text-muted-foreground">
            تم إلغاء هذه الجلسة
          </div>
        ) : data.status === "ended" ? (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-muted px-4 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            انتهت الجلسة، جارٍ تجهيز التسجيل
          </div>
        ) : data.status === "completed" ? (
          <div className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
            <div className="font-semibold mb-2">التسجيلات</div>
            لا توجد تسجيلات بعد
          </div>
        ) : openNow ? (
          <div className="space-y-3 text-center">
            <Button size="lg" className="h-12 px-8 text-base" onClick={join} disabled={joining}>
              {joining ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radio className="h-5 w-5" />}
              انضم إلى البث المباشر
            </Button>
            {blockedUrl && (
              <div>
                <a
                  href={blockedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline break-all"
                >
                  فتح رابط الاجتماع
                </a>
              </div>
            )}
          </div>
        ) : (
          cd && (
            <div className="space-y-3">
              <CountdownTiles
                days={cd.days}
                hours={cd.hours}
                minutes={cd.minutes}
                seconds={cd.seconds}
                urgent={urgent}
              />
              <p className="text-center text-sm text-muted-foreground">
                {formatCairo(data.scheduled_start_at, "weekday")} —{" "}
                {formatCairo(data.scheduled_start_at, "time")} بتوقيت القاهرة
              </p>
            </div>
          )
        )}

        {!isAdmin && data.status === "scheduled" && (
          <div className="flex flex-wrap gap-2 justify-center">
            <Button variant="outline" size="sm" onClick={addToCalendar}>
              <CalendarClock className="h-4 w-4" /> أضف إلى التقويم
            </Button>
            <Button variant="outline" size="sm" onClick={copyTime}>
              <Copy className="h-4 w-4" /> نسخ الموعد
            </Button>
          </div>
        )}
      </section>

      {data.files.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-card p-5 md:p-6 space-y-3">
          <h2 className="text-lg font-bold">ملفات الجلسة</h2>
          <div className="space-y-2">
            {data.files.map((f) => (
              <FileRow key={f.id} file={f} />
            ))}
          </div>
        </section>
      )}

      <Dialog open={autoDialogOpen} onOpenChange={setAutoDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>بدأت الجلسة الآن 🎥</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">اضغط للانضمام إلى البث المباشر في Zoom.</p>
          <Button onClick={join} disabled={joining}>
            {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
            انضم الآن
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LiveSessionPanel;
